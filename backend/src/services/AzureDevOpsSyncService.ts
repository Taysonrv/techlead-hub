import { randomUUID } from "node:crypto";

import {
  AzureSyncStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "../database/prisma";

import {
  AzureDevOpsService,
} from "./AzureDevOpsService";

import {
  AzureDevOpsWorkItemResponse,
  mapAzureWorkItem,
} from "./AzureWorkItemMapper";

/* =========================================================
   TIPOS
========================================================= */

export type SyncSource =
  | "MANUAL"
  | "FULL"
  | "CONTROLLED"
  | "INCREMENTAL"
  | "SCHEDULED";

export type AzureSyncError = {
  workItemId: number;
  message: string;
};

export type AzureSyncResult = {
  runId: number;
  batch: string;
  status: AzureSyncStatus;

  totalItems: number;
  insertedItems: number;
  updatedItems: number;
  skippedItems: number;
  errorItems: number;

  errors: AzureSyncError[];
};

export type AzureSyncDashboardRun = {
  id: number;
  batch: string;
  status: AzureSyncStatus;
  source: string | null;
  totalItems: number;
  insertedItems: number;
  updatedItems: number;
  skippedItems: number;
  errorItems: number;
  message: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export type AzureSyncDashboardStatus = {
  scheduler: {
    enabled: boolean;
    intervalMinutes: number;
    overlapMinutes: number;
  };

  latestRun:
    | AzureSyncDashboardRun
    | null;

  lastSuccessfulRun:
    | AzureSyncDashboardRun
    | null;

  nextEstimatedAt:
    | Date
    | null;

  recentRuns:
    AzureSyncDashboardRun[];
};

type SyncWorkItemsOptions = {
  ids: number[];
  userId?: number | null;
  source?: SyncSource;
};

type FullSyncOptions = {
  userId?: number | null;
  limit?: number | null;
};

type IncrementalSyncOptions = {
  userId?: number | null;
  overlapMinutes?: number;
  source?:
    | "INCREMENTAL"
    | "SCHEDULED";
};

type PersistResult =
  | "inserted"
  | "updated"
  | "skipped";

type SyncCounters = {
  insertedItems: number;
  updatedItems: number;
  skippedItems: number;
  errorItems: number;
};

type ExistingWorkItem = {
  id: number;
  revision: number | null;
  azureChangedAt: Date | null;
  state: string;
  assignedToName: string | null;
  prioritized: boolean | null;
  blockedProcess: boolean | null;
  deliveredVersion: string | null;
  movideskTicket: number | null;
  client: string | null;
};

type BatchSyncOptions = {
  ids: number[];
  userId: number | null;
  source:
    | "FULL"
    | "CONTROLLED"
    | "INCREMENTAL"
    | "SCHEDULED";
  allowEmpty: boolean;
  startedAt?: Date;
};

/* =========================================================
   SERVICE
========================================================= */

export class AzureDevOpsSyncService {
  private static readonly BATCH_SIZE =
    200;

  private static readonly DEFAULT_INCREMENTAL_OVERLAP_MINUTES =
    5;

  private static readonly MAX_INCREMENTAL_OVERLAP_MINUTES =
    60;

  private static readonly DEFAULT_SCHEDULER_INTERVAL_MINUTES =
    15;

  private static readonly MIN_SCHEDULER_INTERVAL_MINUTES =
    5;

  private static readonly MAX_SCHEDULER_INTERVAL_MINUTES =
    24 * 60;

  private readonly azureDevOpsService:
    AzureDevOpsService;

  constructor(
    azureDevOpsService:
      AzureDevOpsService =
        new AzureDevOpsService(),
  ) {
    this.azureDevOpsService =
      azureDevOpsService;
  }

  /* =======================================================
     STATUS PARA A DASHBOARD

     Este método não dispara sincronização.
     Ele apenas consulta a configuração e o histórico gravado.
  ======================================================= */

  public async getDashboardStatus():
    Promise<AzureSyncDashboardStatus> {
    const [
      latestRun,
      lastSuccessfulRun,
      recentRuns,
    ] =
      await Promise.all([
        prisma.azureSyncRun.findFirst({
          orderBy: [
            {
              startedAt:
                "desc",
            },
            {
              id:
                "desc",
            },
          ],
          select:
            this.syncRunDashboardSelect(),
        }),

        prisma.azureSyncRun.findFirst({
          where: {
            status:
              AzureSyncStatus.SUCCESS,
            source: {
              in: [
                "FULL",
                "INCREMENTAL",
                "SCHEDULED",
              ],
            },
          },
          orderBy: [
            {
              startedAt:
                "desc",
            },
            {
              id:
                "desc",
            },
          ],
          select:
            this.syncRunDashboardSelect(),
        }),

        prisma.azureSyncRun.findMany({
          take:
            10,
          orderBy: [
            {
              startedAt:
                "desc",
            },
            {
              id:
                "desc",
            },
          ],
          select:
            this.syncRunDashboardSelect(),
        }),
      ]);

    const schedulerEnabled =
      this.readBooleanEnv(
        "AZURE_SYNC_SCHEDULER_ENABLED",
        true,
      );

    const intervalMinutes =
      this.readIntegerEnv({
        name:
          "AZURE_SYNC_INTERVAL_MINUTES",
        fallback:
          AzureDevOpsSyncService
            .DEFAULT_SCHEDULER_INTERVAL_MINUTES,
        min:
          AzureDevOpsSyncService
            .MIN_SCHEDULER_INTERVAL_MINUTES,
        max:
          AzureDevOpsSyncService
            .MAX_SCHEDULER_INTERVAL_MINUTES,
      });

    const overlapMinutes =
      this.readIntegerEnv({
        name:
          "AZURE_SYNC_OVERLAP_MINUTES",
        fallback:
          AzureDevOpsSyncService
            .DEFAULT_INCREMENTAL_OVERLAP_MINUTES,
        min:
          0,
        max:
          AzureDevOpsSyncService
            .MAX_INCREMENTAL_OVERLAP_MINUTES,
      });

    /*
     * O scheduler agenda o próximo ciclo após o término do
     * ciclo atual. Portanto finishedAt é a melhor referência
     * disponível para uma previsão na interface.
     */
    const nextEstimatedAt =
      schedulerEnabled &&
      latestRun?.finishedAt
        ? new Date(
            latestRun.finishedAt.getTime() +
              intervalMinutes *
                60_000,
          )
        : null;

    return {
      scheduler: {
        enabled:
          schedulerEnabled,
        intervalMinutes,
        overlapMinutes,
      },

      latestRun:
        latestRun ??
        null,

      lastSuccessfulRun:
        lastSuccessfulRun ??
        null,

      nextEstimatedAt,

      recentRuns,
    };
  }

  /* =======================================================
     SINCRONIZAÇÃO MANUAL POR IDs
  ======================================================= */

  public async syncWorkItems(
    options:
      SyncWorkItemsOptions,
  ): Promise<AzureSyncResult> {
    const ids =
      this.normalizeIds(
        options.ids,
      );

    if (
      ids.length ===
      0
    ) {
      throw new Error(
        "Nenhum ID de Work Item válido foi informado para sincronização.",
      );
    }

    const syncRun =
      await this.createSyncRun({
        totalItems:
          ids.length,
        source:
          options.source ??
          "MANUAL",
        userId:
          options.userId ??
          null,
      });

    const counters:
      SyncCounters = {
        insertedItems:
          0,
        updatedItems:
          0,
        skippedItems:
          0,
        errorItems:
          0,
      };

    const errors:
      AzureSyncError[] =
        [];

    try {
      for (
        const workItemId
        of ids
      ) {
        try {
          const rawWorkItem =
            await this.azureDevOpsService
              .getWorkItem(
                workItemId,
              );

          const result =
            await this.persistWorkItem(
              rawWorkItem,
              syncRun.id,
            );

          this.applyPersistResult(
            counters,
            result,
          );
        } catch (error) {
          counters.errorItems +=
            1;

          errors.push({
            workItemId,
            message:
              this.getErrorMessage(
                error,
              ),
          });
        }
      }

      return await this.finishSyncRun({
        runId:
          syncRun.id,
        batch:
          syncRun.batch,
        totalItems:
          ids.length,
        insertedItems:
          counters.insertedItems,
        updatedItems:
          counters.updatedItems,
        skippedItems:
          counters.skippedItems,
        errorItems:
          counters.errorItems,
        errors,
      });
    } catch (error) {
      await this.failSyncRun(
        syncRun.id,
        error,
        {
          ...counters,
          totalItems:
            ids.length,
        },
      );

      throw error;
    }
  }

  /* =======================================================
     SINCRONIZAÇÃO COMPLETA
  ======================================================= */

  public async syncAllSupportedWorkItems(
    options:
      FullSyncOptions = {},
  ): Promise<AzureSyncResult> {
    const discovery =
      await this.azureDevOpsService
        .discoverSupportedWorkItemIds();

    const discoveredIds =
      this.normalizeIds(
        discovery.ids,
      );

    const requestedLimit =
      options.limit;

    const hasValidLimit =
      typeof requestedLimit ===
        "number" &&
      Number.isSafeInteger(
        requestedLimit,
      ) &&
      requestedLimit > 0;

    const ids =
      hasValidLimit
        ? discoveredIds.slice(
            0,
            requestedLimit,
          )
        : discoveredIds;

    if (
      ids.length ===
      0
    ) {
      throw new Error(
        "Nenhuma Correção, Evolução ou APOIO foi localizado no Azure DevOps.",
      );
    }

    return this.syncIdsInBatches({
      ids,
      userId:
        options.userId ??
        null,
      source:
        hasValidLimit
          ? "CONTROLLED"
          : "FULL",
      allowEmpty:
        false,
    });
  }

  /* =======================================================
     SINCRONIZAÇÃO INCREMENTAL

     O cursor utiliza startedAt da última execução global
     bem-sucedida, e não finishedAt. Isso evita perder uma
     alteração ocorrida enquanto a sincronização anterior
     ainda estava em andamento.

     Execuções MANUAL e CONTROLLED não avançam o cursor global.
  ======================================================= */

  public async syncIncrementalSupportedWorkItems(
    options:
      IncrementalSyncOptions = {},
  ): Promise<AzureSyncResult> {
    const syncStartedAt =
      new Date();

    const source =
      options.source ??
      "INCREMENTAL";

    const userId =
      options.userId ??
      null;

    const baseline =
      await this.getIncrementalBaseline();

    if (!baseline) {
      throw new Error(
        "Não existe uma sincronização FULL ou incremental bem-sucedida para iniciar o modo incremental. Execute primeiro uma sincronização FULL.",
      );
    }

    const overlapMinutes =
      this.resolveOverlapMinutes(
        options.overlapMinutes,
      );

    const changedSince =
      new Date(
        baseline.startedAt.getTime() -
          overlapMinutes *
            60_000,
      );

    /*
     * IMPORTANTE:
     *
     * Antes, uma falha na WIQL acontecia antes da criação de
     * AzureSyncRun. O erro aparecia no console, mas não ficava
     * disponível para a tela de monitoramento.
     *
     * Agora registramos também falhas de descoberta.
     */
    let discovery:
      Awaited<
        ReturnType<
          AzureDevOpsService[
            "discoverSupportedWorkItemIdsChangedSince"
          ]
        >
      >;

    try {
      discovery =
        await this.azureDevOpsService
          .discoverSupportedWorkItemIdsChangedSince(
            changedSince,
          );
    } catch (error) {
      const failedRun =
        await this.createSyncRun({
          totalItems:
            0,
          source,
          userId,
          startedAt:
            syncStartedAt,
        });

      await this.failSyncRun(
        failedRun.id,
        error,
        {
          insertedItems:
            0,
          updatedItems:
            0,
          skippedItems:
            0,
          errorItems:
            1,
          totalItems:
            0,
        },
      );

      throw error;
    }

    const ids =
      this.normalizeIds(
        discovery.ids,
      );

    return this.syncIdsInBatches({
      ids,
      userId,
      source,
      allowEmpty:
        true,
      startedAt:
        syncStartedAt,
    });
  }

  /* =======================================================
     PROCESSAMENTO EM LOTE
  ======================================================= */

  private async syncIdsInBatches(
    options:
      BatchSyncOptions,
  ): Promise<AzureSyncResult> {
    const ids =
      this.normalizeIds(
        options.ids,
      );

    if (
      ids.length ===
        0 &&
      !options.allowEmpty
    ) {
      throw new Error(
        "Nenhum Work Item válido foi localizado para sincronização.",
      );
    }

    const syncRun =
      await this.createSyncRun({
        totalItems:
          ids.length,
        source:
          options.source,
        userId:
          options.userId,
        startedAt:
          options.startedAt,
      });

    const counters:
      SyncCounters = {
        insertedItems:
          0,
        updatedItems:
          0,
        skippedItems:
          0,
        errorItems:
          0,
      };

    const errors:
      AzureSyncError[] =
        [];

    if (
      ids.length ===
      0
    ) {
      return this.finishSyncRun({
        runId:
          syncRun.id,
        batch:
          syncRun.batch,
        totalItems:
          0,
        insertedItems:
          0,
        updatedItems:
          0,
        skippedItems:
          0,
        errorItems:
          0,
        errors:
          [],
      });
    }

    try {
      for (
        let index = 0;
        index <
          ids.length;
        index +=
          AzureDevOpsSyncService
            .BATCH_SIZE
      ) {
        const batchIds =
          ids.slice(
            index,
            index +
              AzureDevOpsSyncService
                .BATCH_SIZE,
          );

        let workItems:
          AzureDevOpsWorkItemResponse[] =
            [];

        try {
          workItems =
            await this.azureDevOpsService
              .getWorkItemsBatch(
                batchIds,
              );
        } catch (error) {
          const message =
            this.getErrorMessage(
              error,
            );

          counters.errorItems +=
            batchIds.length;

          for (
            const workItemId
            of batchIds
          ) {
            errors.push({
              workItemId,
              message,
            });
          }

          continue;
        }

        const returnedIds =
          new Set<number>();

        for (
          const workItem
          of workItems
        ) {
          const workItemId =
            this.getWorkItemId(
              workItem,
            );

          if (
            workItemId !==
            null
          ) {
            returnedIds.add(
              workItemId,
            );
          }
        }

        for (
          const requestedId
          of batchIds
        ) {
          if (
            returnedIds.has(
              requestedId,
            )
          ) {
            continue;
          }

          counters.errorItems +=
            1;

          errors.push({
            workItemId:
              requestedId,
            message:
              "O Work Item foi localizado pela WIQL, mas não foi retornado pela consulta em lote.",
          });
        }

        const validWorkItems:
          Array<{
            id: number;
            workItem:
              AzureDevOpsWorkItemResponse;
          }> =
            [];

        for (
          const workItem
          of workItems
        ) {
          const workItemId =
            this.getWorkItemId(
              workItem,
            );

          if (
            workItemId ===
            null
          ) {
            counters.errorItems +=
              1;

            errors.push({
              workItemId:
                0,
              message:
                "O Azure DevOps retornou um Work Item sem ID numérico válido.",
            });

            continue;
          }

          validWorkItems.push({
            id:
              workItemId,
            workItem,
          });
        }

        if (
          validWorkItems.length ===
          0
        ) {
          continue;
        }

        let existingItems:
          ExistingWorkItem[] =
            [];

        try {
          existingItems =
            await prisma.azureWorkItem
              .findMany({
                where: {
                  id: {
                    in:
                      validWorkItems.map(
                        (
                          item,
                        ) =>
                          item.id,
                      ),
                  },
                },
                select: {
                  id:
                    true,
                  revision:
                    true,
                  azureChangedAt:
                    true,
                  state: true,
                  assignedToName: true,
                  prioritized: true,
                  blockedProcess: true,
                  deliveredVersion: true,
                  movideskTicket: true,
                  client: true,
                },
              });
        } catch (error) {
          const message =
            this.getErrorMessage(
              error,
            );

          counters.errorItems +=
            validWorkItems.length;

          for (
            const item
            of validWorkItems
          ) {
            errors.push({
              workItemId:
                item.id,
              message,
            });
          }

          continue;
        }

        const existingById =
          new Map<
            number,
            ExistingWorkItem
          >(
            existingItems.map(
              (
                item,
              ) => [
                item.id,
                item,
              ],
            ),
          );

        for (
          const item
          of validWorkItems
        ) {
          try {
            const existing =
              existingById.get(
                item.id,
              ) ??
              null;

            const mapped =
              mapAzureWorkItem(
                item.workItem,
                syncRun.id,
              );

            const result =
              await this.persistMappedWorkItem(
                mapped,
                existing,
              );

            this.applyPersistResult(
              counters,
              result,
            );
          } catch (error) {
            counters.errorItems +=
              1;

            errors.push({
              workItemId:
                item.id,
              message:
                this.getErrorMessage(
                  error,
                ),
            });
          }
        }
      }

      return await this.finishSyncRun({
        runId:
          syncRun.id,
        batch:
          syncRun.batch,
        totalItems:
          ids.length,
        insertedItems:
          counters.insertedItems,
        updatedItems:
          counters.updatedItems,
        skippedItems:
          counters.skippedItems,
        errorItems:
          counters.errorItems,
        errors,
      });
    } catch (error) {
      await this.failSyncRun(
        syncRun.id,
        error,
        {
          ...counters,
          totalItems:
            ids.length,
        },
      );

      throw error;
    }
  }

  /* =======================================================
     PERSISTÊNCIA INDIVIDUAL
  ======================================================= */

  private async persistWorkItem(
    rawWorkItem:
      AzureDevOpsWorkItemResponse,
    syncRunId:
      number,
  ): Promise<PersistResult> {
    const mapped =
      mapAzureWorkItem(
        rawWorkItem,
        syncRunId,
      );

    const existing =
      await prisma.azureWorkItem
        .findUnique({
          where: {
            id:
              mapped.id,
          },
          select: {
            id:
              true,
            revision:
              true,
            azureChangedAt:
              true,
            state: true,
            assignedToName: true,
            prioritized: true,
            blockedProcess: true,
            deliveredVersion: true,
            movideskTicket: true,
            client: true,
          },
        });

    return this.persistMappedWorkItem(
      mapped,
      existing,
    );
  }

  /* =======================================================
     PERSISTÊNCIA JÁ MAPEADA
  ======================================================= */

  private async persistMappedWorkItem(
    mapped:
      Prisma.AzureWorkItemUncheckedCreateInput,
    existing:
      ExistingWorkItem | null,
  ): Promise<PersistResult> {
    if (
      this.shouldSkip(
        existing,
        mapped,
      )
    ) {
      return "skipped";
    }

    if (existing) {
      await prisma.azureWorkItem
        .update({
          where: {
            id:
              mapped.id,
          },
          data:
            this.toUpdateData(
              mapped,
            ),
        });

      await this.recordHistory(existing, mapped);

      return "updated";
    }

    await prisma.azureWorkItem
      .create({
        data:
          mapped,
      });

    return "inserted";
  }

  private async recordHistory(
    existing: ExistingWorkItem,
    mapped: Prisma.AzureWorkItemUncheckedCreateInput,
  ) {
    const tracked: Array<[string, unknown, unknown]> = [
      ["state", existing.state, mapped.state],
      ["assignedToName", existing.assignedToName, mapped.assignedToName],
      ["prioritized", existing.prioritized, mapped.prioritized],
      ["blockedProcess", existing.blockedProcess, mapped.blockedProcess],
      ["deliveredVersion", existing.deliveredVersion, mapped.deliveredVersion],
      ["movideskTicket", existing.movideskTicket, mapped.movideskTicket],
      ["client", existing.client, mapped.client],
    ];

    const changes = tracked.filter(([, oldValue, newValue]) =>
      this.historyValue(oldValue) !== this.historyValue(newValue),
    );

    const syncRunId = typeof mapped.syncRunId === "number"
      ? mapped.syncRunId
      : null;

    await Promise.all(changes.map(([field, oldValue, newValue]) =>
      prisma.$executeRaw`
        INSERT INTO "AzureWorkItemHistory"
          ("workItemId", "syncRunId", "field", "oldValue", "newValue", "changedAt")
        VALUES
          (${existing.id}, ${syncRunId}, ${field},
           ${this.historyValue(oldValue)}, ${this.historyValue(newValue)},
           CURRENT_TIMESTAMP)
      `,
    ));
  }

  private historyValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  /* =======================================================
     CURSOR DA SINCRONIZAÇÃO INCREMENTAL
  ======================================================= */

  private async getIncrementalBaseline():
    Promise<{
      id: number;
      source: string | null;
      startedAt: Date;
      finishedAt: Date | null;
    } | null> {
    return prisma.azureSyncRun
      .findFirst({
        where: {
          status:
            AzureSyncStatus.SUCCESS,
          source: {
            in: [
              "FULL",
              "INCREMENTAL",
              "SCHEDULED",
            ],
          },
          finishedAt: {
            not:
              null,
          },
        },
        orderBy: [
          {
            startedAt:
              "desc",
          },
          {
            id:
              "desc",
          },
        ],
        select: {
          id:
            true,
          source:
            true,
          startedAt:
            true,
          finishedAt:
            true,
        },
      });
  }

  private resolveOverlapMinutes(
    value:
      number | undefined,
  ): number {
    if (
      value ===
      undefined
    ) {
      return AzureDevOpsSyncService
        .DEFAULT_INCREMENTAL_OVERLAP_MINUTES;
    }

    if (
      !Number.isSafeInteger(
        value,
      ) ||
      value < 0 ||
      value >
        AzureDevOpsSyncService
          .MAX_INCREMENTAL_OVERLAP_MINUTES
    ) {
      throw new Error(
        `overlapMinutes deve ser um número inteiro entre 0 e ${AzureDevOpsSyncService.MAX_INCREMENTAL_OVERLAP_MINUTES}.`,
      );
    }

    return value;
  }

  /* =======================================================
     SYNC RUN
  ======================================================= */

  private async createSyncRun(
    input: {
      totalItems: number;
      source: SyncSource;
      userId: number | null;
      startedAt?: Date;
    },
  ) {
    const batch =
      `azure-${new Date()
        .toISOString()
        .replace(
          /[:.]/g,
          "-",
        )}-${randomUUID()}`;

    return prisma.azureSyncRun
      .create({
        data: {
          batch,
          status:
            AzureSyncStatus
              .PROCESSING,
          source:
            input.source,
          totalItems:
            input.totalItems,
          userId:
            input.userId,
          startedAt:
            input.startedAt ??
            new Date(),
        },
      });
  }

  private async finishSyncRun(
    input: {
      runId: number;
      batch: string;
      totalItems: number;
      insertedItems: number;
      updatedItems: number;
      skippedItems: number;
      errorItems: number;
      errors:
        AzureSyncError[];
    },
  ): Promise<AzureSyncResult> {
    const successItems =
      input.insertedItems +
      input.updatedItems +
      input.skippedItems;

    const status =
      this.resolveFinalStatus({
        successItems,
        errorItems:
          input.errorItems,
      });

    const message =
      this.buildMessage({
        totalItems:
          input.totalItems,
        insertedItems:
          input.insertedItems,
        updatedItems:
          input.updatedItems,
        skippedItems:
          input.skippedItems,
        errorItems:
          input.errorItems,
      });

    await prisma.azureSyncRun
      .update({
        where: {
          id:
            input.runId,
        },
        data: {
          status,
          totalItems:
            input.totalItems,
          insertedItems:
            input.insertedItems,
          updatedItems:
            input.updatedItems,
          skippedItems:
            input.skippedItems,
          errorItems:
            input.errorItems,
          message,
          finishedAt:
            new Date(),
        },
      });

    return {
      runId:
        input.runId,
      batch:
        input.batch,
      status,
      totalItems:
        input.totalItems,
      insertedItems:
        input.insertedItems,
      updatedItems:
        input.updatedItems,
      skippedItems:
        input.skippedItems,
      errorItems:
        input.errorItems,
      errors:
        input.errors.slice(
          0,
          100,
        ),
    };
  }

  private async failSyncRun(
    runId:
      number,
    error:
      unknown,
    counters: {
      insertedItems: number;
      updatedItems: number;
      skippedItems: number;
      errorItems: number;
      totalItems: number;
    },
  ): Promise<void> {
    await prisma.azureSyncRun
      .update({
        where: {
          id:
            runId,
        },
        data: {
          status:
            AzureSyncStatus.ERROR,
          totalItems:
            counters.totalItems,
          insertedItems:
            counters.insertedItems,
          updatedItems:
            counters.updatedItems,
          skippedItems:
            counters.skippedItems,
          errorItems:
            counters.errorItems >
            0
              ? counters.errorItems
              : Math.max(
                  counters.totalItems,
                  1,
                ),
          message:
            this.getErrorMessage(
              error,
            ),
          finishedAt:
            new Date(),
        },
      });
  }

  /* =======================================================
     COMPARAÇÃO
  ======================================================= */

  private shouldSkip(
    existing:
      ExistingWorkItem | null,
    mapped:
      Prisma.AzureWorkItemUncheckedCreateInput,
  ): boolean {
    if (!existing) {
      return false;
    }

    if (
      existing.revision !==
        null &&
      mapped.revision !==
        null &&
      mapped.revision !==
        undefined &&
      existing.revision ===
        mapped.revision
    ) {
      return true;
    }

    const mappedChangedAt =
      mapped.azureChangedAt
        instanceof Date
        ? mapped.azureChangedAt
        : null;

    if (
      existing.azureChangedAt &&
      mappedChangedAt &&
      existing.azureChangedAt
        .getTime() ===
        mappedChangedAt
          .getTime()
    ) {
      return true;
    }

    return false;
  }

  /* =======================================================
     UPDATE DATA
  ======================================================= */

  private toUpdateData(
    mapped:
      Prisma.AzureWorkItemUncheckedCreateInput,
  ): Prisma.AzureWorkItemUncheckedUpdateInput {
    return {
      revision:
        mapped.revision,
      workItemType:
        mapped.workItemType,
      title:
        mapped.title,
      state:
        mapped.state,
      reason:
        mapped.reason,

      assignedToName:
        mapped.assignedToName,
      assignedToEmail:
        mapped.assignedToEmail,
      assignedToId:
        mapped.assignedToId,

      createdByName:
        mapped.createdByName,
      createdByEmail:
        mapped.createdByEmail,
      changedByName:
        mapped.changedByName,
      changedByEmail:
        mapped.changedByEmail,

      areaPath:
        mapped.areaPath,
      iterationPath:
        mapped.iterationPath,
      nodeName:
        mapped.nodeName,
      boardColumn:
        mapped.boardColumn,

      client:
        mapped.client,
      criticality:
        mapped.criticality,
      origin:
        mapped.origin,
      detectedIn:
        mapped.detectedIn,

      module:
        mapped.module,
      process:
        mapped.process,

      movideskTicket:
        mapped.movideskTicket,
      deliveredVersion:
        mapped.deliveredVersion,

      prioritized:
        mapped.prioritized,
      blockedProcess:
        mapped.blockedProcess,
      impactScale:
        mapped.impactScale,

      defectType:
        mapped.defectType,
      branchType:
        mapped.branchType,
      correctionType:
        mapped.correctionType,
      rdmNumber:
        mapped.rdmNumber,

      slaLimit:
        mapped.slaLimit,
      parentId:
        mapped.parentId,

      description:
        mapped.description,
      workaround:
        mapped.workaround,
      technicalSolution:
        mapped.technicalSolution,
      tags:
        mapped.tags,

      azureCreatedAt:
        mapped.azureCreatedAt,
      azureChangedAt:
        mapped.azureChangedAt,
      azureClosedAt:
        mapped.azureClosedAt,
      stateChangedAt:
        mapped.stateChangedAt,
      activatedAt:
        mapped.activatedAt,

      remoteUrl:
        mapped.remoteUrl,

      rawFields:
        mapped.rawFields,
      rawRelations:
        mapped.rawRelations,

      syncRunId:
        mapped.syncRunId,
      syncedAt:
        new Date(),
    };
  }

  /* =======================================================
     HELPERS
  ======================================================= */

  private normalizeIds(
    ids:
      number[],
  ): number[] {
    return [
      ...new Set(
        ids.filter(
          (
            id,
          ) =>
            Number.isSafeInteger(
              id,
            ) &&
            id > 0,
        ),
      ),
    ];
  }

  private getWorkItemId(
    workItem:
      AzureDevOpsWorkItemResponse,
  ): number | null {
    const id =
      workItem.id;

    if (
      typeof id !==
        "number" ||
      !Number.isSafeInteger(
        id,
      ) ||
      id <= 0
    ) {
      return null;
    }

    return id;
  }

  private applyPersistResult(
    counters:
      SyncCounters,
    result:
      PersistResult,
  ): void {
    switch (
      result
    ) {
      case "inserted":
        counters.insertedItems +=
          1;
        break;

      case "updated":
        counters.updatedItems +=
          1;
        break;

      case "skipped":
        counters.skippedItems +=
          1;
        break;
    }
  }

  private resolveFinalStatus(
    input: {
      successItems: number;
      errorItems: number;
    },
  ): AzureSyncStatus {
    if (
      input.errorItems ===
      0
    ) {
      return AzureSyncStatus
        .SUCCESS;
    }

    if (
      input.successItems >
      0
    ) {
      return AzureSyncStatus
        .PARTIAL;
    }

    return AzureSyncStatus
      .ERROR;
  }

  private buildMessage(
    input: {
      totalItems: number;
      insertedItems: number;
      updatedItems: number;
      skippedItems: number;
      errorItems: number;
    },
  ): string {
    return [
      `Total: ${input.totalItems}`,
      `Inseridos: ${input.insertedItems}`,
      `Atualizados: ${input.updatedItems}`,
      `Ignorados: ${input.skippedItems}`,
      `Erros: ${input.errorItems}`,
    ].join(
      " | ",
    );
  }

  private getErrorMessage(
    error:
      unknown,
  ): string {
    if (
      error instanceof
      Error
    ) {
      return error.message;
    }

    return "Erro desconhecido durante a sincronização do Azure DevOps.";
  }

  private syncRunDashboardSelect() {
    return {
      id:
        true,
      batch:
        true,
      status:
        true,
      source:
        true,
      totalItems:
        true,
      insertedItems:
        true,
      updatedItems:
        true,
      skippedItems:
        true,
      errorItems:
        true,
      message:
        true,
      startedAt:
        true,
      finishedAt:
        true,
    } satisfies Prisma.AzureSyncRunSelect;
  }

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

    if (
      !raw ||
      !/^\d+$/.test(
        raw,
      )
    ) {
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
      return input.fallback;
    }

    return parsed;
  }
}
