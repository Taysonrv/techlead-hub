import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../database/prisma";

import {
  AzureDevOpsSyncService,
} from "../services/AzureDevOpsSyncService";

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const DEFAULT_INTERVAL_MINUTES =
  15;

const MIN_INTERVAL_MINUTES =
  5;

const MAX_INTERVAL_MINUTES =
  24 * 60;

const DEFAULT_INITIAL_DELAY_SECONDS =
  30;

const MAX_INITIAL_DELAY_SECONDS =
  10 * 60;

const DEFAULT_OVERLAP_MINUTES =
  5;

const MAX_OVERLAP_MINUTES =
  60;

/*
 * pg_try_advisory_xact_lock recebe dois inteiros.
 *
 * Esses números identificam exclusivamente o lock do
 * sincronizador Azure do TechLead Hub no PostgreSQL.
 */
const ADVISORY_LOCK_NAMESPACE =
  864211;

const ADVISORY_LOCK_RESOURCE =
  1;

/*
 * A transação mantém somente o advisory lock.
 * O service continua utilizando o Prisma global para as
 * leituras/gravações normais da sincronização.
 *
 * O timeout precisa ser suficientemente alto para uma
 * incremental excepcionalmente grande.
 */
const LOCK_TRANSACTION_TIMEOUT_MS =
  30 * 60 * 1000;

type AdvisoryLockRow = {
  acquired: boolean;
};

export class AzureDevOpsSyncScheduler {
  private timer:
    NodeJS.Timeout | null =
    null;

  private running =
    false;

  private stopped =
    false;

  private readonly enabled:
    boolean;

  private readonly intervalMinutes:
    number;

  private readonly initialDelaySeconds:
    number;

  private readonly overlapMinutes:
    number;

  constructor() {
    this.enabled =
      this.readBooleanEnv(
        "AZURE_SYNC_SCHEDULER_ENABLED",
        true,
      );

    this.intervalMinutes =
      this.readIntegerEnv({
        name:
          "AZURE_SYNC_INTERVAL_MINUTES",
        fallback:
          DEFAULT_INTERVAL_MINUTES,
        min:
          MIN_INTERVAL_MINUTES,
        max:
          MAX_INTERVAL_MINUTES,
      });

    this.initialDelaySeconds =
      this.readIntegerEnv({
        name:
          "AZURE_SYNC_INITIAL_DELAY_SECONDS",
        fallback:
          DEFAULT_INITIAL_DELAY_SECONDS,
        min:
          0,
        max:
          MAX_INITIAL_DELAY_SECONDS,
      });

    this.overlapMinutes =
      this.readIntegerEnv({
        name:
          "AZURE_SYNC_OVERLAP_MINUTES",
        fallback:
          DEFAULT_OVERLAP_MINUTES,
        min:
          0,
        max:
          MAX_OVERLAP_MINUTES,
      });
  }

  /* =======================================================
     CICLO DE VIDA
  ======================================================= */

  public start(): void {
    if (
      !this.enabled
    ) {
      console.log(
        "[azure-sync] Scheduler automático desabilitado por configuração.",
      );

      return;
    }

    if (
      this.timer
    ) {
      return;
    }

    this.stopped =
      false;

    console.log(
      `[azure-sync] Scheduler automático habilitado: incremental a cada ${this.intervalMinutes} minuto(s), overlap de ${this.overlapMinutes} minuto(s).`,
    );

    this.scheduleNext(
      this.initialDelaySeconds *
        1000,
    );
  }

  public stop(): void {
    this.stopped =
      true;

    if (
      this.timer
    ) {
      clearTimeout(
        this.timer,
      );

      this.timer =
        null;
    }

    console.log(
      "[azure-sync] Scheduler automático interrompido.",
    );
  }

  /* =======================================================
     AGENDAMENTO
  ======================================================= */

  private scheduleNext(
    delayMs:
      number,
  ): void {
    if (
      this.stopped ||
      !this.enabled
    ) {
      return;
    }

    this.timer =
      setTimeout(
        () => {
          this.timer =
            null;

          void this.executeAndReschedule();
        },
        delayMs,
      );

    /*
     * O timer não deve, sozinho, impedir o encerramento do
     * processo Node/Electron.
     */
    this.timer.unref();
  }

  private async executeAndReschedule():
    Promise<void> {
    try {
      await this.execute();
    } finally {
      this.scheduleNext(
        this.intervalMinutes *
          60_000,
      );
    }
  }

  /* =======================================================
     EXECUÇÃO
  ======================================================= */

  private async execute():
    Promise<void> {
    if (
      this.running
    ) {
      console.log(
        "[azure-sync] Execução ignorada: já existe uma sincronização automática ativa nesta instância.",
      );

      return;
    }

    this.running =
      true;

    const startedAt =
      new Date();

    try {
      /*
       * O advisory lock é distribuído pelo PostgreSQL.
       *
       * Isso é essencial porque diferentes instalações do
       * TechLead Hub podem apontar para o mesmo banco.
       *
       * Somente a instância que adquirir o lock executará a
       * incremental. As demais simplesmente ignoram o ciclo.
       */
      const result =
        await prisma.$transaction(
          async (
            tx,
          ) => {
            const rows =
              await tx.$queryRaw<
                AdvisoryLockRow[]
              >(
                Prisma.sql`
                  SELECT
                    pg_try_advisory_xact_lock(
                      CAST(${ADVISORY_LOCK_NAMESPACE} AS integer),
                      CAST(${ADVISORY_LOCK_RESOURCE} AS integer)
                    ) AS acquired
                `,
              );

            const acquired =
              rows[0]?.acquired ===
              true;

            if (
              !acquired
            ) {
              return {
                acquired:
                  false as const,
                sync:
                  null,
              };
            }

            const service =
              new AzureDevOpsSyncService();

            const sync =
              await service
                .syncIncrementalSupportedWorkItems({
                  userId:
                    null,
                  overlapMinutes:
                    this.overlapMinutes,
                  source:
                    "SCHEDULED",
                });

            return {
              acquired:
                true as const,
              sync,
            };
          },
          {
            maxWait:
              5_000,
            timeout:
              LOCK_TRANSACTION_TIMEOUT_MS,
          },
        );

      if (
        !result.acquired
      ) {
        console.log(
          "[azure-sync] Ciclo ignorado: outra instância do TechLead Hub já está sincronizando o Azure.",
        );

        return;
      }

      const durationSeconds =
        Math.round(
          (
            Date.now() -
            startedAt.getTime()
          ) /
            1000,
        );

      console.log(
        [
          "[azure-sync] Incremental automática concluída.",
          `run=${result.sync.runId}`,
          `status=${result.sync.status}`,
          `total=${result.sync.totalItems}`,
          `inseridos=${result.sync.insertedItems}`,
          `atualizados=${result.sync.updatedItems}`,
          `ignorados=${result.sync.skippedItems}`,
          `erros=${result.sync.errorItems}`,
          `duração=${durationSeconds}s`,
        ].join(
          " | ",
        ),
      );
    } catch (
      error
    ) {
      /*
       * Ausência de baseline FULL e falhas transitórias não
       * derrubam o servidor. O scheduler tentará novamente
       * no próximo ciclo.
       */
      console.error(
        "[azure-sync] Falha na sincronização incremental automática:",
        error,
      );
    } finally {
      this.running =
        false;
    }
  }

  /* =======================================================
     ENV
  ======================================================= */

  private readBooleanEnv(
    name:
      string,
    fallback:
      boolean,
  ): boolean {
    const raw =
      process.env[
        name
      ]?.trim();

    if (!raw) {
      return fallback;
    }

    const normalized =
      raw.toLowerCase();

    if (
      [
        "1",
        "true",
        "yes",
        "sim",
        "on",
      ].includes(
        normalized,
      )
    ) {
      return true;
    }

    if (
      [
        "0",
        "false",
        "no",
        "nao",
        "não",
        "off",
      ].includes(
        normalized,
      )
    ) {
      return false;
    }

    console.warn(
      `[azure-sync] ${name} possui valor inválido (${raw}). Utilizando ${fallback}.`,
    );

    return fallback;
  }

  private readIntegerEnv(
    input: {
      name: string;
      fallback: number;
      min: number;
      max: number;
    },
  ): number {
    const raw =
      process.env[
        input.name
      ]?.trim();

    if (!raw) {
      return input.fallback;
    }

    if (
      !/^\d+$/.test(
        raw,
      )
    ) {
      console.warn(
        `[azure-sync] ${input.name} deve ser inteiro. Utilizando ${input.fallback}.`,
      );

      return input.fallback;
    }

    const parsed =
      Number(
        raw,
      );

    if (
      !Number.isSafeInteger(
        parsed,
      ) ||
      parsed <
        input.min ||
      parsed >
        input.max
    ) {
      console.warn(
        `[azure-sync] ${input.name} deve estar entre ${input.min} e ${input.max}. Utilizando ${input.fallback}.`,
      );

      return input.fallback;
    }

    return parsed;
  }
}
