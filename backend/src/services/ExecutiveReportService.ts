import ExcelJS from "exceljs";

import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../database/prisma";

import {
  azureOperationalScope,
  ticketOperationalScope,
} from "../domain/OperationalScope";

import {
  buildManagementInsights,
  type ManagementInsight,
} from "./ManagementInsightService";
import { analyzeMovideskIndicators } from "./MovideskPayloadAnalytics";

export type ReportScope =
  | "executive"
  | "analysts"
  | "sla"
  | "clients"
  | "development"
  | "versions"
  | "operational-causes"
  | "operational-errors";

export type ReportFilters = {
  client?: string;
  analyst?: string;
  category?: string;
  ticketStatus?: string;
  workItemType?: string;
  azureState?: string;
  version?: string;
};

type ExecutiveReportOptions = {
  from: Date;
  to: Date;
  userId: number;
  scope?: ReportScope;
  filters?: ReportFilters;
};

type RankingRow = {
  label: string;
  total: number;
};

export class ExecutiveReportService {
  public async generate(
    options:
      ExecutiveReportOptions,
  ) {
    const ticketWhere:
      Prisma.TicketWhereInput = {
      AND: [
        ticketOperationalScope(),
        {
          createdDate: {
            gte:
              options.from,
            lte:
              options.to,
          },
        },
        ...this.ticketFilters(options.filters),
      ],
    };

    const azureWhere:
      Prisma.AzureWorkItemWhereInput = {
      AND: [
        azureOperationalScope(),
        { workItemType: { equals: "Correção Clientes", mode: "insensitive" } },
        {
          OR: [
            {
              azureCreatedAt: {
                gte:
                  options.from,
                lte:
                  options.to,
              },
            },
            {
              azureCreatedAt:
                null,
              syncedAt: {
                gte:
                  options.from,
                lte:
                  options.to,
              },
            },
          ],
        },
        ...this.azureFilters(options.filters),
      ],
    };

    const [
      user,
      ticketsTotal,
      ticketsOpen,
      ticketsResolved,
      ticketsClosed,
      slaTickets,
      analysts,
      clients,
      categories,
      azureTotal,
      corrections,
      evolutions,
      supports,
      prioritized,
      blocked,
      azureStates,
      versions,
      ticketTimeline,
      ticketDetails,
    ] =
      await Promise.all([
        prisma.user.findUnique({
          where: {
            id:
              options.userId,
          },
          select: {
            name:
              true,
            username:
              true,
          },
        }),

        prisma.ticket.count({
          where:
            ticketWhere,
        }),

        prisma.ticket.count({
          where: {
            ...ticketWhere,
            resolvedDate:
              null,
            closedDate:
              null,
          },
        }),

        prisma.ticket.count({
          where: {
            ...ticketWhere,
            resolvedDate: {
              not:
                null,
            },
            closedDate:
              null,
          },
        }),

        prisma.ticket.count({
          where: {
            ...ticketWhere,
            closedDate: {
              not:
                null,
            },
          },
        }),

        prisma.ticket.findMany({
          where:
            ticketWhere,
          select: {
            solutionSlaIndicator: true,
            dueDate: true,
            resolvedDate: true,
            closedDate: true,
          },
        }),

        prisma.ticket.groupBy({
          by: [
            "owner",
          ],
          where: {
            ...ticketWhere,
            owner: {
              not:
                null,
            },
          },
          _count: {
            _all:
              true,
          },
          orderBy: {
            _count: {
              owner:
                "desc",
            },
          },
          take:
            20,
        }),

        prisma.ticket.groupBy({
          by: [
            "client",
          ],
          where: {
            ...ticketWhere,
            client: {
              not:
                null,
            },
          },
          _count: {
            _all:
              true,
          },
          orderBy: {
            _count: {
              client:
                "desc",
            },
          },
          take:
            20,
        }),

        prisma.ticket.groupBy({
          by: [
            "category",
          ],
          where: {
            ...ticketWhere,
            category: {
              not:
                null,
            },
          },
          _count: {
            _all:
              true,
          },
          orderBy: {
            _count: {
              category:
                "desc",
            },
          },
          take:
            20,
        }),

        prisma.azureWorkItem.count({
          where:
            azureWhere,
        }),

        this.countAzureType(
          azureWhere,
          "Correção Clientes",
        ),

        this.countAzureType(
          azureWhere,
          "Evolução",
        ),

        this.countAzureType(
          azureWhere,
          "APOIO",
        ),

        prisma.azureWorkItem.count({
          where: {
            ...azureWhere,
            prioritized:
              true,
          },
        }),

        prisma.azureWorkItem.count({
          where: {
            ...azureWhere,
            blockedProcess:
              true,
          },
        }),

        prisma.azureWorkItem.groupBy({
          by: [
            "state",
          ],
          where:
            azureWhere,
          _count: {
            _all:
              true,
          },
          orderBy: {
            _count: {
              state:
                "desc",
            },
          },
        }),

        prisma.azureWorkItem.groupBy({
          by: [
            "deliveredVersion",
          ],
          where: {
            ...azureWhere,
            deliveredVersion: {
              not:
                null,
            },
          },
          _count: {
            _all:
              true,
          },
          orderBy: {
            _count: {
              deliveredVersion:
                "desc",
            },
          },
          take:
            20,
        }),
        prisma.ticket.findMany({
          where: ticketWhere,
          select: {
            createdDate: true, resolvedDate: true, closedDate: true, category: true,
            cause: true, client: true, serviceSecondLevel: true,
            resolvedInFirstCall: true, rawData: true,
          },
          orderBy: { createdDate: "asc" },
        }),
        prisma.ticket.findMany({
          where: ticketWhere,
          select: {
            movideskId: true,
            subject: true,
            status: true,
            owner: true,
            client: true,
            category: true,
            createdDate: true,
          },
          orderBy: [{ createdDate: "desc" }, { movideskId: "desc" }],
        }),
      ]);

    const slaResults = slaTickets.map((ticket) => classifySolutionSla(
      ticket.solutionSlaIndicator,
      ticket.resolvedDate ?? ticket.closedDate,
      ticket.dueDate,
    ));
    const slaMeasured = slaResults.filter((result) => result !== null).length;
    const slaMet = slaResults.filter((result) => result === true).length;

    const categoryNames = categories
      .slice(0, 8)
      .flatMap((item) => item.category ? [item.category] : []);
    const categoryEvolution = new Map<string, Map<string, number>>();
    for (const ticket of ticketTimeline) {
      const category = ticket.category ?? "Não informado";
      if (categoryNames.length && !categoryNames.includes(category)) continue;
      const month = ticket.createdDate.toISOString().slice(0, 7);
      const monthData = categoryEvolution.get(month) ?? new Map<string, number>();
      monthData.set(category, (monthData.get(category) ?? 0) + 1);
      categoryEvolution.set(month, monthData);
    }
    const situationByMonth = new Map<string, { open: number; resolved: number; closed: number }>();
    for (const ticket of ticketTimeline) {
      const month = ticket.createdDate.toISOString().slice(0, 7);
      const current = situationByMonth.get(month) ?? { open: 0, resolved: 0, closed: 0 };
      if (ticket.closedDate) current.closed += 1;
      else if (ticket.resolvedDate) current.resolved += 1;
      else current.open += 1;
      situationByMonth.set(month, current);
    }
    const situationRows: RankingRow[] = [...situationByMonth.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([month, values]) => [
        { label: `${month.split("-").reverse().join("/")} · Em aberto`, total: values.open },
        { label: `${month.split("-").reverse().join("/")} · Resolvidos`, total: values.resolved },
        { label: `${month.split("-").reverse().join("/")} · Fechados`, total: values.closed },
      ]);

    const monthlyRanking = (
      selector: (ticket: (typeof ticketTimeline)[number]) => string | null,
    ): RankingRow[] => {
      const grouped = new Map<string, number>();
      for (const ticket of ticketTimeline) {
        const month = ticket.createdDate.toISOString().slice(0, 7).split("-").reverse().join("/");
        const label = selector(ticket)?.trim() || "Não informado";
        const key = `${month} · ${label}`;
        grouped.set(key, (grouped.get(key) ?? 0) + 1);
      }
      return [...grouped.entries()]
        .map(([label, total]) => ({ label, total }))
        .sort((left, right) => left.label.localeCompare(right.label));
    };
    const serviceEvolution = monthlyRanking((ticket) => ticket.serviceSecondLevel);
    const causeEvolution = monthlyRanking((ticket) => ticket.cause);
    const clientEvolution = monthlyRanking((ticket) => ticket.client);
    const payloadAnalytics = ticketTimeline.map((ticket) => analyzeMovideskIndicators(ticket.rawData));
    const reopened = payloadAnalytics.filter((item) => item.reopenCount > 0).length;
    const excessiveHandoffs = payloadAnalytics.filter((item) => item.ownerHandoffs >= 3).length;
    const satisfactionMeasured = payloadAnalytics.filter((item) => item.satisfactionScore !== null).length;
    const lowSatisfaction = payloadAnalytics.filter((item) =>
      item.satisfactionScore !== null && item.satisfactionScore <= 2,
    ).length;
    const firstCallMeasured = ticketTimeline.filter((ticket) =>
      ticket.resolvedInFirstCall !== null,
    ).length;
    const firstCallResolved = ticketTimeline.filter((ticket) =>
      ticket.resolvedInFirstCall === true,
    ).length;

    const insights = buildManagementInsights({
      ticketsTotal,
      ticketsOpen,
      ticketsResolved,
      ticketsClosed,
      slaMeasured,
      slaMet,
      corrections,
      evolutions,
      supports,
      prioritized,
      blocked,
      reopened,
      firstCallResolved,
      firstCallMeasured,
      excessiveHandoffs,
      satisfactionMeasured,
      lowSatisfaction,
      topCategory: categories[0] ? {
        label: categories[0].category ?? "Não informado",
        total: categories[0]._count._all,
      } : null,
      topAnalyst: analysts[0] ? {
        label: analysts[0].owner ?? "Não informado",
        total: analysts[0]._count._all,
      } : null,
      topVersion: versions[0] ? {
        label: versions[0].deliveredVersion ?? "Não informada",
        total: versions[0]._count._all,
      } : null,
    });

    const workbook =
      new ExcelJS.Workbook();

    workbook.creator =
      "TechLead Hub";
    workbook.company =
      "Aliare";
    workbook.title =
      "Relatório Executivo";
    workbook.subject =
      "Indicadores gerenciais de suporte, sustentação e correções";
    workbook.created =
      new Date();

    const generatedBy =
      user?.name ??
      user?.username ??
      "Usuário";

    const summary =
      workbook.addWorksheet(
        "Resumo Executivo",
        {
          views: [
            {
              state:
                "frozen",
              ySplit:
                5,
            },
          ],
        },
      );

    this.configureSheet(
      summary,
      [
        34,
        20,
        52,
      ],
    );

    summary.mergeCells(
      "A1:C1",
    );
    summary.getCell(
      "A1",
    ).value =
      "TECHLEAD HUB | RELATÓRIO EXECUTIVO";

    summary.getCell(
      "A2",
    ).value =
      "Período";
    summary.getCell(
      "B2",
    ).value =
      this.periodLabel(
        options.from,
        options.to,
      );

    summary.getCell(
      "A3",
    ).value =
      "Gerado por";
    summary.getCell(
      "B3",
    ).value =
      generatedBy;

    summary.getCell("A5").value = "Filtros aplicados";
    summary.mergeCells("B5:C5");
    summary.getCell("B5").value = this.filtersLabel(options.filters);

    summary.getCell(
      "A4",
    ).value =
      "Gerado em";
    summary.getCell(
      "B4",
    ).value =
      this.dateTime(
        new Date(),
      );

    this.styleTitle(
      summary.getCell(
        "A1",
      ),
    );

    this.addSection(
      summary,
      6,
      "Atendimentos Movidesk",
      [
        [
          "Indicador",
          "Quantidade",
          "Regra",
        ],
        [
          "Tickets criados no período",
          ticketsTotal,
          "Data de criação entre o início e o fim selecionados.",
        ],
        [
          "Em aberto",
          ticketsOpen,
          "Sem data de resolução e sem data de encerramento.",
        ],
        [
          "Resolvidos",
          ticketsResolved,
          "Com data de resolução e ainda sem data de encerramento.",
        ],
        [
          "Fechados",
          ticketsClosed,
          "Com data de fechamento preenchida.",
        ],
        [
          "Com indicador de SLA",
          slaMeasured,
          "Indicador de SLA de solução informado pelo Movidesk.",
        ],
        [
          "SLA dentro do prazo",
          slaMet,
          "Indicador oficial do Movidesk normalizado; quando ausente, compara a data de solução com o vencimento.",
        ],
        [
          "Percentual SLA",
          slaMeasured > 0
            ? slaMet /
              slaMeasured
            : 0,
          "SLA dentro do prazo dividido pelos tickets medidos.",
        ],
      ],
      8,
    );

    summary.getCell(
      "B14",
    ).numFmt =
      "0.00%";

    this.addSection(
      summary,
      17,
      "Azure DevOps",
      [
        [
          "Indicador",
          "Quantidade",
          "Regra",
        ],
        [
          "Work Items no período",
          azureTotal,
          "Criados no período; quando sem data de criação, considera a sincronização.",
        ],
        [
          "Correções",
          corrections,
          "System.WorkItemType = Correção Clientes.",
        ],
        [
          "Priorizados",
          prioritized,
          "Campo de priorização ativo.",
        ],
        [
          "Processo bloqueado",
          blocked,
          "Campo de bloqueio de processo ativo.",
        ],
      ],
      7,
    );

    this.addRankingSheet(
      workbook,
      "Analistas",
      "Produtividade por responsável",
      analysts.map(
        (item) => ({
          label:
            item.owner ??
            "Não informado",
          total:
            item._count
              ._all,
        }),
      ),
      options,
      generatedBy,
    );

    this.addRankingSheet(
      workbook,
      "Clientes",
      "Atendimentos por cliente",
      clients.map(
        (item) => ({
          label:
            item.client ??
            "Não informado",
          total:
            item._count
              ._all,
        }),
      ),
      options,
      generatedBy,
    );

    this.addRankingSheet(
      workbook,
      "Categorias",
      "Atendimentos por categoria",
      categories.map(
        (item) => ({
          label:
            item.category ??
            "Não informado",
          total:
            item._count
              ._all,
        }),
      ),
      options,
      generatedBy,
    );

    this.addRankingSheet(
      workbook,
      "Evolução Serviços",
      "Evolução mensal por serviço",
      serviceEvolution,
      options,
      generatedBy,
    );

    this.addRankingSheet(
      workbook,
      "Evolução Causas",
      "Evolução mensal por causa",
      causeEvolution,
      options,
      generatedBy,
    );

    this.addRankingSheet(
      workbook,
      "Evolução Clientes",
      "Evolução mensal por cliente",
      clientEvolution,
      options,
      generatedBy,
    );

    this.addRankingSheet(
      workbook,
      "Correções",
      "Correções de suporte: situação e entrega",
      [
        { label: "Indicador · Correções no período", total: corrections },
        { label: "Indicador · Priorizadas", total: prioritized },
        { label: "Indicador · Processo bloqueado", total: blocked },
        ...azureStates.map((item) => ({
          label: `Estado · ${item.state}`,
          total: item._count._all,
        })),
        ...versions.map((item) => ({
          label: `Versão entregue · ${item.deliveredVersion ?? "Não informada"}`,
          total: item._count._all,
        })),
      ],
      options,
      generatedBy,
    );

    this.addRankingSheet(
      workbook,
      "SLA",
      "Cumprimento do SLA de solução",
      [
        { label: "Dentro do prazo", total: slaMet },
        { label: "Fora do prazo", total: Math.max(0, slaMeasured - slaMet) },
      ],
      options,
      generatedBy,
    );

    this.addOperationalCauseSheets(
      workbook,
      ticketTimeline,
      options,
      generatedBy,
    );

    this.addTicketDetailsSheet(
      workbook,
      ticketDetails,
      options,
      generatedBy,
    );

    this.addCategoryEvolutionSheet(
      workbook,
      categoryEvolution,
      categoryNames,
      situationRows,
      options,
      generatedBy,
    );

    this.addSection(
      summary,
      25,
      "Leitura executiva e recomendações",
      [
        ["Prioridade", "Achado", "Recomendação"],
        ...insights.slice(0, 6).map((insight) => [
          `${insight.priority} · ${insight.topic}`,
          insight.finding,
          insight.recommendation,
        ]),
      ],
      7,
    );
    summary.getColumn(2).width = 52;
    summary.getColumn(3).width = 68;
    summary.pageSetup.printArea = `A1:C${Math.max(summary.rowCount, 32)}`;

    this.applyScope(
      workbook,
      options.scope ??
        "executive",
    );

    const content =
      await workbook.xlsx
        .writeBuffer();

    return Buffer.from(
      content,
    );
  }

  private countAzureType(
    baseWhere:
      Prisma.AzureWorkItemWhereInput,
    type: string,
  ) {
    return prisma.azureWorkItem.count({
      where: {
        AND: [
          baseWhere,
          {
            workItemType: {
              equals:
                type,
              mode:
                "insensitive",
            },
          },
        ],
      },
    });
  }

  private ticketFilters(filters?: ReportFilters): Prisma.TicketWhereInput[] {
    if (!filters) return [];
    return [
      ...(filters.client ? [{ client: { equals: filters.client, mode: "insensitive" as const } }] : []),
      ...(filters.analyst ? [{ owner: { equals: filters.analyst, mode: "insensitive" as const } }] : []),
      ...(filters.category ? [{ category: { equals: filters.category, mode: "insensitive" as const } }] : []),
      ...(filters.ticketStatus ? [{ status: { equals: filters.ticketStatus, mode: "insensitive" as const } }] : []),
    ];
  }

  private azureFilters(filters?: ReportFilters): Prisma.AzureWorkItemWhereInput[] {
    if (!filters) return [];
    return [
      ...(filters.client ? [{
        OR: clientAliases(filters.client).flatMap((client) => [
          { client: { contains: client, mode: "insensitive" as const } },
          { participantClients: { contains: client, mode: "insensitive" as const } },
        ]),
      }] : []),
      ...(filters.analyst ? [{ OR: [{ assignedToName: { equals: filters.analyst, mode: "insensitive" as const } }, { createdByName: { equals: filters.analyst, mode: "insensitive" as const } }] }] : []),
      ...(filters.workItemType ? [{ workItemType: { equals: filters.workItemType, mode: "insensitive" as const } }] : []),
      ...(filters.azureState ? [{ state: { equals: filters.azureState, mode: "insensitive" as const } }] : []),
      ...(filters.version ? [{ deliveredVersion: { equals: filters.version, mode: "insensitive" as const } }] : []),
    ];
  }

  private addClientHealthSheet(
    workbook: ExcelJS.Workbook,
    metrics: {
      ticketsTotal: number; ticketsOpen: number; ticketsResolved: number; ticketsClosed: number;
      slaMeasured: number; slaMet: number; corrections: number; evolutions: number; supports: number;
      prioritized: number; blocked: number;
    },
    insights: ManagementInsight[],
    options: ExecutiveReportOptions,
    generatedBy: string,
  ) {
    const sheet = workbook.addWorksheet("Painel do Cliente", { views: [{ state: "frozen", ySplit: 6 }] });
    this.configureSheet(sheet, [28, 18, 62, 18, 18, 18]);
    sheet.mergeCells("A1:F1");
    sheet.getCell("A1").value = (options.filters?.client ?? "CARTEIRA DE CLIENTES").toLocaleUpperCase("pt-BR");
    this.styleTitle(sheet.getCell("A1"));
    sheet.getCell("A2").value = "Período"; sheet.getCell("B2").value = this.periodLabel(options.from, options.to);
    sheet.getCell("D2").value = "Gerado por"; sheet.getCell("E2").value = generatedBy;
    sheet.getCell("A3").value = "Escopo"; sheet.getCell("B3").value = this.filtersLabel(options.filters);

    const resolutionRate = metrics.ticketsTotal > 0 ? (metrics.ticketsResolved + metrics.ticketsClosed) / metrics.ticketsTotal : 0;
    const slaRate = metrics.slaMeasured > 0 ? metrics.slaMet / metrics.slaMeasured : 0;
    const header = sheet.getRow(5);
    ["Indicador", "Resultado", "Leitura executiva", "Correções", "Priorizadas", "Bloqueadas"].forEach((value, index) => header.getCell(index + 1).value = value);
    this.styleHeader(header);
    const rows: Array<[string, number | string, string, number | string, number | string, number | string]> = [
      ["Atendimentos no período", metrics.ticketsTotal, "Volume total de tickets criados no recorte.", metrics.corrections, metrics.prioritized, metrics.blocked],
      ["Em aberto", metrics.ticketsOpen, "Tickets sem resolução e sem fechamento.", metrics.corrections, metrics.prioritized, metrics.blocked],
      ["Taxa de resolução", resolutionRate, `${metrics.ticketsResolved + metrics.ticketsClosed} atendimento(s) resolvido(s) ou fechado(s).`, metrics.corrections, metrics.prioritized, metrics.blocked],
      ["SLA de solução", slaRate, `${metrics.slaMet} de ${metrics.slaMeasured} atendimento(s) medidos dentro do prazo; não medidos são excluídos.`, metrics.corrections, metrics.prioritized, metrics.blocked],
    ];
    rows.forEach((values, index) => {
      const row = sheet.addRow(values);
      if (index >= 2) row.getCell(2).numFmt = "0.0%";
      row.getCell(2).font = { bold: true, size: 14, color: { argb: index === 1 && metrics.ticketsOpen > 0 ? "FFB7791F" : "FF10945B" } };
      row.alignment = { vertical: "middle", wrapText: true };
      row.height = 32;
    });

    sheet.getCell("A11").value = "INSIGHTS E RECOMENDAÇÕES";
    sheet.mergeCells("A11:F11");
    this.styleSectionTitle(sheet.getCell("A11"));
    insights.slice(0, 6).forEach((insight, index) => {
      const row = sheet.getRow(12 + index);
      row.getCell(1).value = insight.priority;
      row.getCell(2).value = insight.topic;
      sheet.mergeCells(12 + index, 3, 12 + index, 4);
      row.getCell(3).value = insight.finding;
      sheet.mergeCells(12 + index, 5, 12 + index, 6);
      row.getCell(5).value = insight.recommendation;
      row.alignment = { vertical: "top", wrapText: true };
      row.height = 45;
      row.getCell(1).font = { bold: true, color: { argb: insight.priority === "ALTA" ? "FFDC3545" : insight.priority === "POSITIVA" ? "FF10945B" : "FFB7791F" } };
    });
    sheet.pageSetup.fitToWidth = 1;
  }

  private addCategoryEvolutionSheet(
    workbook: ExcelJS.Workbook,
    evolution: Map<string, Map<string, number>>,
    categories: string[],
    situationRows: RankingRow[],
    options: ExecutiveReportOptions,
    generatedBy: string,
  ) {
    const sheet = workbook.addWorksheet("Evolução Categorias", {
      views: [{ state: "frozen", xSplit: 1, ySplit: 5 }],
    });
    const categoryColumns = categories.length ? categories : ["Não informado"];
    this.configureSheet(sheet, [16, ...categoryColumns.map(() => 22)]);
    sheet.mergeCells(1, 1, 1, Math.max(2, categoryColumns.length + 1));
    sheet.getCell("A1").value = "EVOLUÇÃO MENSAL POR CATEGORIA";
    sheet.getCell("A2").value = "Período";
    sheet.getCell("B2").value = this.periodLabel(options.from, options.to);
    sheet.getCell("A3").value = "Gerado por";
    sheet.getCell("B3").value = generatedBy;
    this.styleTitle(sheet.getCell("A1"));

    const header = sheet.addRow(["Mês", ...categoryColumns, "Total"]);
    this.styleHeader(header);

    for (const [month, values] of [...evolution.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const counts = categoryColumns.map((category) => values.get(category) ?? 0);
      sheet.addRow([
        month.split("-").reverse().join("/"),
        ...counts,
        counts.reduce((sum, value) => sum + value, 0),
      ]);
    }

    if (!evolution.size) {
      sheet.addRow(["Sem dados no período", ...categoryColumns.map(() => 0), 0]);
    }

    const situationStart = sheet.rowCount + 2;
    sheet.mergeCells(situationStart, 1, situationStart, Math.max(2, categoryColumns.length + 2));
    sheet.getCell(situationStart, 1).value = "SITUAÇÃO MENSAL DOS ATENDIMENTOS";
    this.styleSectionTitle(sheet.getCell(situationStart, 1));
    const situationHeader = sheet.getRow(situationStart + 1);
    situationHeader.getCell(1).value = "Mês e situação";
    situationHeader.getCell(2).value = "Quantidade";
    this.styleHeader(situationHeader);
    situationRows.forEach((item) => sheet.addRow([item.label, item.total]));

    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4, column: categoryColumns.length + 2 },
    };
  }

  private filtersLabel(filters?: ReportFilters) {
    const labels = [
      filters?.client ? `Cliente: ${filters.client}` : null,
      filters?.analyst ? `Analista: ${filters.analyst}` : null,
      filters?.category ? `Categoria: ${filters.category}` : null,
      filters?.ticketStatus ? `Status ticket: ${filters.ticketStatus}` : null,
      filters?.workItemType ? `Tipo Azure: ${filters.workItemType}` : null,
      filters?.azureState ? `Estado Azure: ${filters.azureState}` : null,
      filters?.version ? `Versão: ${filters.version}` : null,
    ].filter((value): value is string => Boolean(value));
    return labels.length ? labels.join(" | ") : "Todos os registros do escopo operacional";
  }

  private addInsightSheet(
    workbook: ExcelJS.Workbook,
    insights: ManagementInsight[],
    options: ExecutiveReportOptions,
    generatedBy: string,
  ) {
    const sheet = workbook.addWorksheet("Insights Diretoria", {
      views: [{ state: "frozen", ySplit: 5 }],
    });
    this.configureSheet(sheet, [14, 28, 72, 72]);
    sheet.mergeCells("A1:D1");
    sheet.getCell("A1").value = "LEITURA EXECUTIVA E RECOMENDAÇÕES";
    sheet.getCell("A2").value = "Período";
    sheet.getCell("B2").value = this.periodLabel(options.from, options.to);
    sheet.getCell("A3").value = "Gerado por";
    sheet.getCell("B3").value = generatedBy;
    sheet.getCell("C2").value = "Filtros";
    sheet.getCell("D2").value = this.filtersLabel(options.filters);
    this.styleTitle(sheet.getCell("A1"));

    const header = sheet.addRow(["Prioridade", "Tema", "Achado", "Recomendação"]);
    this.styleHeader(header);

    for (const insight of insights) {
      const row = sheet.addRow([
        insight.priority,
        insight.topic,
        insight.finding,
        insight.recommendation,
      ]);
      row.alignment = { vertical: "top", wrapText: true };
      row.height = 42;
      row.getCell(1).font = {
        bold: true,
        color: { argb: insight.priority === "ALTA" ? "FFB42318" : insight.priority === "POSITIVA" ? "FF087443" : "FF7A5200" },
      };
    }
    sheet.autoFilter = "A4:D4";
    sheet.pageSetup.fitToWidth = 1;
  }

  private addTicketDetailsSheet(
    workbook: ExcelJS.Workbook,
    tickets: Array<{
      movideskId: number;
      subject: string;
      status: string;
      owner: string | null;
      client: string | null;
      category: string | null;
      createdDate: Date;
    }>,
    options: ExecutiveReportOptions,
    generatedBy: string,
  ) {
    const sheet = workbook.addWorksheet("Atendimentos", {
      views: [{ state: "frozen", ySplit: 4 }],
    });
    this.configureSheet(sheet, [16, 70, 24, 32, 34, 30, 16]);
    sheet.mergeCells("A1:G1");
    sheet.getCell("A1").value = "ATENDIMENTOS UTILIZADOS NA ANÁLISE";
    this.styleTitle(sheet.getCell("A1"));
    sheet.getCell("A2").value = "Período";
    sheet.getCell("B2").value = this.periodLabel(options.from, options.to);
    sheet.getCell("D2").value = "Gerado por";
    sheet.getCell("E2").value = generatedBy;
    sheet.getCell("A3").value = "Filtros";
    sheet.mergeCells("B3:G3");
    sheet.getCell("B3").value = this.filtersLabel(options.filters);

    const header = sheet.addRow([
      "Ticket",
      "Título",
      "Status",
      "Responsável",
      "Cliente",
      "Categoria",
      "Data de abertura",
    ]);
    this.styleHeader(header);

    tickets.forEach((ticket) => {
      const row = sheet.addRow([
        ticket.movideskId,
        ticket.subject,
        ticket.status,
        ticket.owner ?? "Não informado",
        ticket.client ?? "Não informado",
        ticket.category ?? "Não informada",
        ticket.createdDate,
      ]);
      row.getCell(1).numFmt = "0";
      row.getCell(7).numFmt = "dd/mm/yyyy";
      row.alignment = { vertical: "top", wrapText: true };
    });

    if (!tickets.length) {
      sheet.addRow(["", "Nenhum atendimento encontrado para o período e filtros selecionados."]);
    }

    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4, column: 7 },
    };
    sheet.pageSetup.printArea = `A1:G${Math.max(sheet.rowCount, 5)}`;
  }

  private addRankingSheet(
    workbook:
      ExcelJS.Workbook,
    name: string,
    title: string,
    rows:
      RankingRow[],
    options:
      ExecutiveReportOptions,
    generatedBy:
      string,
  ) {
    const sheet =
      workbook.addWorksheet(
        name,
      );

    this.configureSheet(
      sheet,
      [
        8,
        48,
        18,
        22,
        68,
      ],
    );

    sheet.mergeCells(
      "A1:D1",
    );
    sheet.getCell(
      "A1",
    ).value =
      title;

    sheet.getCell(
      "A2",
    ).value =
      "Período";
    sheet.getCell(
      "B2",
    ).value =
      this.periodLabel(
        options.from,
        options.to,
      );

    sheet.getCell(
      "A3",
    ).value =
      "Gerado por";
    sheet.getCell(
      "B3",
    ).value =
      generatedBy;

    sheet.getCell("C2").value = "Filtros";
    sheet.getCell("D2").value = this.filtersLabel(options.filters);

    this.styleTitle(
      sheet.getCell(
        "A1",
      ),
    );

    const header =
      sheet.addRow([
        "Posição",
        "Descrição",
        "Quantidade",
        "Participação",
        "Definição",
      ]);

    this.styleHeader(
      header,
    );

    const total =
      rows.reduce(
        (
          accumulator,
          item,
        ) =>
          accumulator +
          item.total,
        0,
      );

    rows.forEach(
      (
        item,
        index,
      ) => {
        const row =
          sheet.addRow([
            index +
              1,
            item.label,
            item.total,
            total > 0
              ? item.total /
                total
              : 0,
            rankingDefinition(name, item.label),
          ]);

        row.getCell(
          4,
        ).numFmt =
          "0.00%";
      },
    );

    sheet.autoFilter = {
      from: {
        row:
          4,
        column:
          1,
      },
      to: {
        row:
          4,
        column:
          5,
      },
    };

    sheet.pageSetup.printArea = `A1:E${Math.max(sheet.rowCount, 8)}`;
  }

  private applyScope(
    workbook: ExcelJS.Workbook,
    scope: ReportScope,
  ) {
    const sheets: Record<ReportScope, string[]> = {
      executive: ["Resumo Executivo", "Evolução Categorias", "Analistas", "Clientes", "Categorias", "Correções", "SLA", "Atendimentos"],
      analysts: ["Evolução Categorias", "Analistas", "Atendimentos"],
      sla: ["Resumo Executivo", "Evolução Categorias", "SLA", "Categorias", "Atendimentos"],
      clients: ["Resumo Executivo", "Evolução Categorias", "Clientes", "Categorias", "SLA", "Atendimentos"],
      development: ["Resumo Executivo", "Evolução Categorias", "Correções", "Atendimentos"],
      versions: ["Resumo Executivo", "Evolução Categorias", "Correções", "Atendimentos"],
      "operational-causes": ["Resumo Causas", "Evolução Causas", "Áreas por Causa", "Atendimentos"],
      "operational-errors": ["Resumo Erro Operacional", "Áreas Erro Operacional", "Atendimentos"],
    };
    const allowed = new Set(sheets[scope]);
    workbook.worksheets
      .filter((sheet) => !allowed.has(sheet.name))
      .forEach((sheet) => workbook.removeWorksheet(sheet.id));
  }

  private addOperationalCauseSheets(
    workbook: ExcelJS.Workbook,
    tickets: Array<{ createdDate: Date; category: string | null; cause: string | null; serviceSecondLevel: string | null }>,
    options: ExecutiveReportOptions,
    generatedBy: string,
  ) {
    const normalize = (value: string | null) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
    const area = (ticket: (typeof tickets)[number]) => ticket.serviceSecondLevel?.trim() || "Outros processos";
    const problemTickets = tickets.filter((ticket) => /problema/.test(normalize(ticket.category)));
    const causes = ["Configuração", "Erro operacional", "SEFAZ ou aplicativo de terceiros", "Não identificada", "Resolvido pelo usuário"];
    const monthKey = (date: Date) => date.toISOString().slice(0, 7);
    const months = [...new Set(tickets.map((ticket) => monthKey(ticket.createdDate)))].sort();

    const summary = workbook.addWorksheet("Resumo Causas");
    this.configureSheet(summary, [38, 16, 16, 20, 64]);
    summary.mergeCells("A1:E1");
    summary.getCell("A1").value = "ACOMPANHAMENTO DE CAUSAS DOS PROBLEMAS";
    this.styleTitle(summary.getCell("A1"));
    summary.getCell("A2").value = "Período"; summary.getCell("B2").value = this.periodLabel(options.from, options.to);
    summary.getCell("D2").value = "Gerado por"; summary.getCell("E2").value = generatedBy;
    const h = summary.addRow(["Causa", "Quantidade", "% dos problemas", "Principal área", "Direcionamento"]); this.styleHeader(h);
    const directions: Record<string,string> = {
      "Configuração": "Revisar parametrização e criar checklist por processo.",
      "Erro operacional": "Direcionar treinamento, roteiro operacional e validações preventivas.",
      "SEFAZ ou aplicativo de terceiros": "Separar dependência externa de produto e registrar evidências.",
      "Não identificada": "Investigar e classificar uma causa acionável antes do encerramento.",
      "Resolvido pelo usuário": "Converter a solução aplicada pelo usuário em orientação preventiva.",
    };
    for (const cause of causes) {
      const rows = problemTickets.filter((ticket) => normalize(ticket.cause) === normalize(cause));
      const grouped = new Map<string,number>(); rows.forEach((ticket) => grouped.set(area(ticket),(grouped.get(area(ticket))??0)+1));
      const top = [...grouped.entries()].sort((a,b)=>b[1]-a[1])[0];
      const row=summary.addRow([cause, rows.length, problemTickets.length ? rows.length/problemTickets.length : 0, top ? `${top[0]} (${top[1]})` : "Sem ocorrências", directions[cause]]);
      row.getCell(3).numFmt="0.0%"; row.alignment={vertical:"top",wrapText:true};
    }

    const evolution = workbook.addWorksheet("Evolução Causas");
    this.configureSheet(evolution, [16, ...causes.map(()=>18)]);
    evolution.mergeCells(1,1,1,causes.length+1); evolution.getCell("A1").value="EVOLUÇÃO MENSAL DAS CAUSAS"; this.styleTitle(evolution.getCell("A1"));
    const eh=evolution.addRow(["Mês",...causes]); this.styleHeader(eh);
    months.forEach((month)=>evolution.addRow([month.split("-").reverse().join("/"),...causes.map((cause)=>problemTickets.filter((ticket)=>monthKey(ticket.createdDate)===month&&normalize(ticket.cause)===normalize(cause)).length)]));

    const areas = workbook.addWorksheet("Áreas por Causa");
    this.configureSheet(areas,[34,48,16,18]); areas.mergeCells("A1:D1"); areas.getCell("A1").value="CONCENTRAÇÃO POR CAUSA E ÁREA"; this.styleTitle(areas.getCell("A1"));
    const ah=areas.addRow(["Causa","Área/Tema","Quantidade","Prioridade"]); this.styleHeader(ah);
    causes.forEach((cause)=>{
      const grouped=new Map<string,number>(); problemTickets.filter((ticket)=>normalize(ticket.cause)===normalize(cause)).forEach((ticket)=>grouped.set(area(ticket),(grouped.get(area(ticket))??0)+1));
      [...grouped.entries()].sort((a,b)=>b[1]-a[1]).forEach(([label,total],index)=>areas.addRow([cause,label,total,index<2?"Priorizar":"Monitorar"]));
    });

    const errors = problemTickets.filter((ticket)=>normalize(ticket.cause)==="erro operacional");
    const errorSummary=workbook.addWorksheet("Resumo Erro Operacional"); this.configureSheet(errorSummary,[32,18,22,56]);
    errorSummary.mergeCells("A1:D1"); errorSummary.getCell("A1").value="PROBLEMA – ERRO OPERACIONAL"; this.styleTitle(errorSummary.getCell("A1"));
    errorSummary.getCell("A2").value="Período"; errorSummary.getCell("B2").value=this.periodLabel(options.from,options.to);
    const groupedErrors=new Map<string,number>(); errors.forEach((ticket)=>groupedErrors.set(area(ticket),(groupedErrors.get(area(ticket))??0)+1));
    const topError=[...groupedErrors.entries()].sort((a,b)=>b[1]-a[1])[0];
    const erh=errorSummary.addRow(["Indicador","Resultado","Leitura","Direcionamento"]); this.styleHeader(erh);
    errorSummary.addRow(["Total de erros operacionais",errors.length,"Base exclusiva da causa Erro operacional","Treinamento e prevenção operacional"]);
    errorSummary.addRow(["Maior área",topError?.[1]??0,topError?.[0]??"Sem ocorrências","Priorizar revisão dos casos e orientação"]);
    months.forEach((month)=>errorSummary.addRow([month.split("-").reverse().join("/"),errors.filter((ticket)=>monthKey(ticket.createdDate)===month).length,"Evolução mensal","Acompanhar tendência"]));

    const errorAreas=workbook.addWorksheet("Áreas Erro Operacional"); this.configureSheet(errorAreas,[48,16,18,22]);
    errorAreas.mergeCells("A1:D1"); errorAreas.getCell("A1").value="INCIDÊNCIA DE ERRO OPERACIONAL POR ÁREA"; this.styleTitle(errorAreas.getCell("A1"));
    const eah=errorAreas.addRow(["Área/Tema","Qtd.","% do total","Prioridade"]); this.styleHeader(eah);
    [...groupedErrors.entries()].sort((a,b)=>b[1]-a[1]).forEach(([label,total],index)=>{const row=errorAreas.addRow([label,total,errors.length?total/errors.length:0,index<3?"Alta":index<6?"Média":"Monitorar"]);row.getCell(3).numFmt="0.0%";});
  }

  private addSection(
    sheet:
      ExcelJS.Worksheet,
    startRow: number,
    title: string,
    rows:
      Array<
        Array<
          string |
          number
        >
      >,
    _expectedRows:
      number,
  ) {
    sheet.mergeCells(
      startRow,
      1,
      startRow,
      3,
    );

    const titleCell =
      sheet.getCell(
        startRow,
        1,
      );

    titleCell.value =
      title;

    this.styleSectionTitle(
      titleCell,
    );

    rows.forEach(
      (
        values,
        index,
      ) => {
        const row =
          sheet.getRow(
            startRow +
            index +
            1,
          );

        values.forEach(
          (
            value,
            columnIndex,
          ) => {
            row.getCell(
              columnIndex +
              1,
            ).value =
              value;
          },
        );

        if (index === 0) {
          this.styleHeader(
            row,
          );
        }
      },
    );

  }

  private configureSheet(
    sheet:
      ExcelJS.Worksheet,
    widths:
      number[],
  ) {
    widths.forEach(
      (
        width,
        index,
      ) => {
        sheet.getColumn(
          index +
            1,
        ).width =
          width;
      },
    );

    sheet.properties.defaultRowHeight =
      20;

    sheet.pageSetup = {
      orientation:
        "landscape",
      fitToPage:
        true,
      fitToWidth:
        1,
      fitToHeight:
        0,
      paperSize:
        9,
      margins: {
        left:
          0.25,
        right:
          0.25,
        top:
          0.5,
        bottom:
          0.5,
        header:
          0.2,
        footer:
          0.2,
      },
    };
  }

  private styleTitle(
    cell:
      ExcelJS.Cell,
  ) {
    cell.font = {
      bold:
        true,
      size:
        16,
      color: {
        argb:
          "FF071A12",
      },
    };

    cell.fill = {
      type:
        "pattern",
      pattern:
        "solid",
      fgColor: {
        argb:
          "FF18C77A",
      },
    };

    cell.alignment = {
      vertical:
        "middle",
      horizontal:
        "left",
    };

    cell.worksheet.getRow(
      Number(
        cell.row,
      ),
    ).height =
      30;
  }

  private styleSectionTitle(
    cell:
      ExcelJS.Cell,
  ) {
    cell.font = {
      bold:
        true,
      color: {
        argb:
          "FFFFFFFF",
      },
    };

    cell.fill = {
      type:
        "pattern",
      pattern:
        "solid",
      fgColor: {
        argb:
          "FF1F2937",
      },
    };
  }

  private styleHeader(
    row:
      ExcelJS.Row,
  ) {
    row.eachCell(
      (cell) => {
        cell.font = {
          bold:
            true,
          color: {
            argb:
              "FFFFFFFF",
          },
        };

        cell.fill = {
          type:
            "pattern",
          pattern:
            "solid",
          fgColor: {
            argb:
              "FF344054",
          },
        };

        cell.alignment = {
          vertical:
            "middle",
        };
      },
    );
  }

  private periodLabel(
    from: Date,
    to: Date,
  ) {
    return `${this.date(
      from,
    )} a ${this.date(
      to,
    )}`;
  }

  private date(
    value: Date,
  ) {
    return new Intl.DateTimeFormat(
      "pt-BR",
    ).format(
      value,
    );
  }

  private dateTime(
    value: Date,
  ) {
    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        dateStyle:
          "short",
        timeStyle:
          "short",
      },
    ).format(
      value,
    );
  }
}


function classifySolutionSla(
  indicator: string | null,
  completedAt: Date | null,
  dueAt: Date | null,
): boolean | null {
  const normalized = indicator
    ?.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLocaleLowerCase("pt-BR");

  if (normalized) {
    if (/nao violad|dentro|no prazo|cumprid|atingid|within|not violated|\bmet\b/.test(normalized)) return true;
    if (/fora|vencid|violad|nao cumpr|not met|expired|estourad/.test(normalized)) return false;
  }

  if (completedAt && dueAt) return completedAt.getTime() <= dueAt.getTime();
  return null;
}

function clientAliases(value: string) {
  const normalized = value.trim();
  const shortName = normalized.split(/\s+-\s+/)[0]?.trim() ?? normalized;
  return [...new Set([normalized, shortName].filter((item) => item.length >= 3))];
}

function rankingDefinition(sheet: string, label: string) {
  if (sheet === "SLA") return label.includes("Dentro") ? "Tickets medidos cujo indicador oficial ou data de conclusão ficou dentro do prazo." : "Tickets medidos cujo indicador oficial ou data de conclusão ultrapassou o prazo.";
  if (sheet === "Situação Atendimentos") {
    if (label.includes("Em aberto")) return "Tickets criados no mês que permanecem sem resolução e sem fechamento.";
    if (label.includes("Resolvidos")) return "Tickets criados no mês com resolução registrada e ainda sem fechamento.";
    return "Tickets criados no mês com data de fechamento registrada.";
  }
  if (sheet === "Desenvolvimento") return "Correções de suporte e sustentação vinculadas ao recorte; evoluções e apoios não compõem este relatório.";
  if (sheet === "Analistas") return "Quantidade de tickets do período atribuídos ao responsável.";
  if (sheet === "Clientes") return "Quantidade de tickets do período vinculados ao cliente.";
  if (sheet === "Categorias") return "Quantidade de tickets do período classificada nesta categoria.";
  if (sheet === "Estados Azure") return "Correções de suporte e sustentação atualmente neste estado do Azure.";
  if (sheet === "Versões") return "Correções de suporte e sustentação entregues nesta versão.";
  return "Quantidade apurada no período e filtros selecionados.";
}
