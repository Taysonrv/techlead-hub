import type {
  Response,
} from "express";

import type {
  AuthenticatedRequest,
} from "../middlewares/authMiddleware";

import {
  ExecutiveReportService,
} from "../services/ExecutiveReportService";

export class ReportController {
  private readonly executive =
    new ExecutiveReportService();

  public executiveExcel = async (
    request:
      AuthenticatedRequest,
    response:
      Response,
  ): Promise<Response> => {
    try {
      const userId =
        request.auth
          ?.userId;

      if (!userId) {
        return response
          .status(401)
          .json({
            message:
              "Usuário não autenticado.",
          });
      }

      const from =
        this.dateBoundary(
          request.query.from,
          false,
        );

      const to =
        this.dateBoundary(
          request.query.to,
          true,
        );

      if (!from || !to) {
        return response
          .status(400)
          .json({
            message:
              "Informe from e to no formato AAAA-MM-DD.",
          });
      }

      if (
        from.getTime() >
        to.getTime()
      ) {
        return response
          .status(400)
          .json({
            message:
              "A data inicial não pode ser posterior à data final.",
          });
      }

      const maximumPeriod =
        366 *
        24 *
        60 *
        60 *
        1000;

      if (
        to.getTime() -
        from.getTime() >
        maximumPeriod
      ) {
        return response
          .status(400)
          .json({
            message:
              "O relatório Executivo aceita períodos de até 366 dias.",
          });
      }

      const file =
        await this.executive.generate({
          from,
          to,
          userId,
        });

      const fileName =
        `techlead-hub-executivo-${this.fileDate(from)}-${this.fileDate(to)}.xlsx`;

      response.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`,
      );

      response.setHeader(
        "Cache-Control",
        "no-store",
      );

      return response
        .status(200)
        .send(file);
    } catch (error) {
      console.error(
        "[reports]",
        error,
      );

      return response
        .status(500)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível gerar o relatório Executivo.",
        });
    }
  };

  private dateBoundary(
    value: unknown,
    endOfDay: boolean,
  ) {
    if (
      typeof value !==
        "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        value,
      )
    ) {
      return null;
    }

    const date =
      new Date(
        `${value}T${endOfDay
          ? "23:59:59.999"
          : "00:00:00.000"}`,
      );

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date;
  }

  private fileDate(
    value: Date,
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      );
  }
}
