import type {
  Response,
} from "express";

import type {
  AuthenticatedRequest,
} from "../middlewares/authMiddleware";

import {
  ExecutiveReportService,
  type ReportFilters,
  type ReportScope,
} from "../services/ExecutiveReportService";

import {
  ManagementPdfService,
} from "../services/ManagementPdfService";
import { prisma } from "../database/prisma";
import { SIMER_CLIENTS, SUPPORT_ANALYSTS, azureOperationalScope, ticketOperationalScope } from "../domain/OperationalScope";

const REPORT_SCOPES:
  ReportScope[] = [
  "executive",
  "analysts",
  "sla",
  "clients",
  "development",
  "versions",
];

export class ReportController {
  private readonly excel =
    new ExecutiveReportService();

  private readonly pdf =
    new ManagementPdfService();

  public filters = async (_request: AuthenticatedRequest, response: Response) => {
    try {
      const [categories, ticketStatuses, workItemTypes, azureStates, versions] = await Promise.all([
        prisma.ticket.findMany({ where: { AND: [ticketOperationalScope(), { category: { not: null } }] }, select: { category: true }, distinct: ["category"], orderBy: { category: "asc" } }),
        prisma.ticket.findMany({ where: ticketOperationalScope(), select: { status: true }, distinct: ["status"], orderBy: { status: "asc" } }),
        prisma.azureWorkItem.findMany({ where: azureOperationalScope(), select: { workItemType: true }, distinct: ["workItemType"], orderBy: { workItemType: "asc" } }),
        prisma.azureWorkItem.findMany({ where: azureOperationalScope(), select: { state: true }, distinct: ["state"], orderBy: { state: "asc" } }),
        prisma.azureWorkItem.findMany({ where: { AND: [azureOperationalScope(), { deliveredVersion: { not: null } }] }, select: { deliveredVersion: true }, distinct: ["deliveredVersion"], orderBy: { deliveredVersion: "desc" }, take: 100 }),
      ]);
      return response.json({
        clients: [...SIMER_CLIENTS], analysts: [...SUPPORT_ANALYSTS],
        categories: categories.flatMap((item) => item.category ? [item.category] : []),
        ticketStatuses: ticketStatuses.map((item) => item.status),
        workItemTypes: workItemTypes.map((item) => item.workItemType),
        azureStates: azureStates.map((item) => item.state),
        versions: versions.flatMap((item) => item.deliveredVersion ? [item.deliveredVersion] : []),
      });
    } catch (error) {
      console.error("[reports:filters]", error);
      return response.status(500).json({ message: "Não foi possível carregar os filtros dos relatórios." });
    }
  };

  public excelFile = async (
    request:
      AuthenticatedRequest,
    response:
      Response,
  ) => {
    return this.generate(
      request,
      response,
      "xlsx",
    );
  };

  public pdfFile = async (
    request:
      AuthenticatedRequest,
    response:
      Response,
  ) => {
    return this.generate(
      request,
      response,
      "pdf",
    );
  };

  private generate = async (
    request:
      AuthenticatedRequest,
    response:
      Response,
    format:
      "xlsx" |
      "pdf",
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

      const scope =
        this.reportScope(
          request.params.scope,
        );

      if (!scope) {
        return response
          .status(404)
          .json({
            message:
              "Relatório não encontrado.",
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
              "Os relatórios aceitam períodos de até 366 dias.",
          });
      }

      const file =
        format === "xlsx"
          ? await this.excel.generate({
              from,
              to,
              userId,
              scope,
              filters: this.reportFilters(request.query),
            })
          : await this.pdf.generate({
              from,
              to,
              userId,
              scope,
              filters: this.reportFilters(request.query),
            });

      const fileName =
        `techlead-hub-${scope}-${this.fileDate(from)}-${this.fileDate(to)}.${format}`;

      response.setHeader(
        "Content-Type",
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
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
              : "Não foi possível gerar o relatório.",
        });
    }
  };

  private reportScope(
    value:
      unknown,
  ):
    ReportScope |
    null {
    const normalized =
      Array.isArray(value)
        ? value[0]
        : value;

    return (
      typeof normalized ===
        "string" &&
      REPORT_SCOPES.includes(
        normalized as
          ReportScope,
      )
    )
      ? normalized as
          ReportScope
      : null;
  }

  private reportFilters(query: AuthenticatedRequest["query"]): ReportFilters {
    const value = (key: keyof ReportFilters) => {
      const item = query[key];
      return typeof item === "string" && item.trim() ? item.trim().slice(0, 180) : undefined;
    };
    return {
      client: value("client"), analyst: value("analyst"), category: value("category"),
      ticketStatus: value("ticketStatus"), workItemType: value("workItemType"),
      azureState: value("azureState"), version: value("version"),
    };
  }

  private dateBoundary(
    value:
      unknown,
    endOfDay:
      boolean,
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
    value:
      Date,
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      );
  }
}
