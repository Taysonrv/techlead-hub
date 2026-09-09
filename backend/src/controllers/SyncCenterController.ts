import type {
  Request,
  Response,
} from "express";

import {
  SyncCenterService,
  type SyncCenterProvider,
} from "../services/SyncCenterService";

const VALID_PROVIDERS =
  new Set<SyncCenterProvider>([
    "MOVIDESK",
    "AZURE_DEVOPS",
  ]);

const VALID_STATUSES =
  new Set([
    "PROCESSING",
    "SUCCESS",
    "PARTIAL",
    "ERROR",
  ]);

export class SyncCenterController {
  private readonly service =
    new SyncCenterService();

  public history = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    try {
      const page =
        this.positiveInteger(
          request.query.page,
        ) ??
        1;

      const pageSize =
        this.positiveInteger(
          request.query.pageSize,
        ) ??
        20;

      if (pageSize > 100) {
        return response
          .status(400)
          .json({
            message:
              "pageSize deve ser menor ou igual a 100.",
          });
      }

      const providerValue =
        this.text(
          request.query.provider,
        )
          .toUpperCase();

      const provider =
        providerValue
          ? providerValue as
              SyncCenterProvider
          : null;

      if (
        provider &&
        !VALID_PROVIDERS.has(
          provider,
        )
      ) {
        return response
          .status(400)
          .json({
            message:
              "provider deve ser MOVIDESK ou AZURE_DEVOPS.",
          });
      }

      const status =
        this.text(
          request.query.status,
        )
          .toUpperCase();

      if (
        status &&
        !VALID_STATUSES.has(
          status,
        )
      ) {
        return response
          .status(400)
          .json({
            message:
              "Status de sincronização inválido.",
          });
      }

      const startedFrom =
        this.date(
          request.query.startedFrom,
          false,
        );

      const startedTo =
        this.date(
          request.query.startedTo,
          true,
        );

      if (
        request.query.startedFrom &&
        !startedFrom
      ) {
        return response
          .status(400)
          .json({
            message:
              "startedFrom deve ser uma data válida.",
          });
      }

      if (
        request.query.startedTo &&
        !startedTo
      ) {
        return response
          .status(400)
          .json({
            message:
              "startedTo deve ser uma data válida.",
          });
      }

      const result =
        await this.service.history({
          page,
          pageSize,
          provider,
          status:
            status ||
            null,
          startedFrom,
          startedTo,
        });

      return response
        .status(200)
        .json(result);
    } catch (error) {
      return this.error(
        response,
        error,
      );
    }
  };

  public summary = async (
    _request: Request,
    response: Response,
  ): Promise<Response> => {
    try {
      const result =
        await this.service.summary();

      return response
        .status(200)
        .json(result);
    } catch (error) {
      return this.error(
        response,
        error,
      );
    }
  };

  private text(
    value: unknown,
  ) {
    return typeof value ===
      "string"
      ? value.trim()
      : "";
  }

  private positiveInteger(
    value: unknown,
  ) {
    const parsed =
      Number(value);

    return Number.isSafeInteger(
      parsed,
    ) &&
      parsed > 0
      ? parsed
      : null;
  }

  private date(
    value: unknown,
    endOfDay: boolean,
  ) {
    const text =
      this.text(
        value,
      );

    if (!text) {
      return null;
    }

    const date =
      /^\d{4}-\d{2}-\d{2}$/.test(
        text,
      )
        ? new Date(
            `${text}T${endOfDay
              ? "23:59:59.999"
              : "00:00:00.000"}`,
          )
        : new Date(
            text,
          );

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date;
  }

  private error(
    response: Response,
    error: unknown,
  ) {
    console.error(
      "[sync-center]",
      error,
    );

    return response
      .status(500)
      .json({
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível consultar a Central de Sincronizações.",
      });
  }
}
