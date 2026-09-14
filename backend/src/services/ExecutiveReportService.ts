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
  createBarChartPng,
  createPieChartPng,
} from "./ReportChartService";

import {
  buildManagementInsights,
  type ManagementInsight,
} from "./ManagementInsightService";

export type ReportScope =
  | "executive"
  | "analysts"
  | "sla"
  | "clients"
  | "development"
  | "versions";

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
      slaMeasured,
      slaMet,
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

        prisma.ticket.count({
          where: {
            ...ticketWhere,
            solutionSlaIndicator: {
              not:
                null,
            },
          },
        }),

        prisma.ticket.count({
          where: {
            ...ticketWhere,
            solutionSlaIndicator: {
              contains:
                "Dentro",
              mode:
                "insensitive",
            },
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
          select: { createdDate: true, category: true },
          orderBy: { createdDate: "asc" },
        }),
      ]);

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
      "Indicadores gerenciais de suporte e desenvolvimento";
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
          "Encerrados",
          ticketsClosed,
          "Com data de encerramento preenchida.",
        ],
        [
          "Com indicador de SLA",
          slaMeasured,
          "Indicador de SLA de solução informado pelo Movidesk.",
        ],
        [
          "SLA dentro do prazo",
          slaMet,
          "Indicador de solução contendo a expressão Dentro.",
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
          "Evoluções",
          evolutions,
          "System.WorkItemType = Evolução.",
        ],
        [
          "Apoios",
          supports,
          "System.WorkItemType = APOIO, sem diferenciar capitalização.",
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

    this.addCharts(
      workbook,
      summary,
      [
        {
          label:
            "Em aberto",
          value:
            ticketsOpen,
        },
        {
          label:
            "Resolvidos",
          value:
            ticketsResolved,
        },
        {
          label:
            "Encerrados",
          value:
            ticketsClosed,
        },
      ],
      4,
      1,
    );

    this.addCharts(
      workbook,
      summary,
      [
        {
          label:
            "Correções",
          value:
            corrections,
        },
        {
          label:
            "Evoluções",
          value:
            evolutions,
        },
        {
          label:
            "Apoios",
          value:
            supports,
        },
      ],
      4,
      19,
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
      "Estados Azure",
      "Work Items por estado",
      azureStates.map(
        (item) => ({
          label:
            item.state,
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
      "Versões",
      "Work Items por versão entregue",
      versions.map(
        (item) => ({
          label:
            item.deliveredVersion ??
            "Não informada",
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
      "SLA",
      "Cumprimento do SLA de solução",
      [
        {
          label:
            "Dentro do prazo",
          total:
            slaMet,
        },
        {
          label:
            "Fora do prazo",
          total:
            Math.max(
              0,
              slaMeasured -
                slaMet,
            ),
        },
        {
          label:
            "Não medido",
          total:
            Math.max(
              0,
              ticketsTotal -
                slaMeasured,
            ),
        },
      ],
      options,
      generatedBy,
    );

    this.addRankingSheet(
      workbook,
      "Situação Atendimentos",
      "Situação dos atendimentos Movidesk",
      [
        {
          label:
            "Em aberto",
          total:
            ticketsOpen,
        },
        {
          label:
            "Resolvidos",
          total:
            ticketsResolved,
        },
        {
          label:
            "Encerrados",
          total:
            ticketsClosed,
        },
      ],
      options,
      generatedBy,
    );

    this.addRankingSheet(
      workbook,
      "Desenvolvimento",
      "Correções, evoluções e apoios",
      [
        {
          label:
            "Correções",
          total:
            corrections,
        },
        {
          label:
            "Evoluções",
          total:
            evolutions,
        },
        {
          label:
            "Apoios",
          total:
            supports,
        },
        {
          label:
            "Priorizados",
          total:
            prioritized,
        },
        {
          label:
            "Processo bloqueado",
          total:
            blocked,
        },
      ],
      options,
      generatedBy,
    );

    this.addCategoryEvolutionSheet(
      workbook,
      categoryEvolution,
      categoryNames,
      options,
      generatedBy,
    );

    this.addInsightSheet(
      workbook,
      insights,
      options,
      generatedBy,
    );

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

  private addCategoryEvolutionSheet(
    workbook: ExcelJS.Workbook,
    evolution: Map<string, Map<string, number>>,
    categories: string[],
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
          4,
      },
    };

    this.addCharts(
      workbook,
      sheet,
      rows.map(
        (
          item,
        ) => ({
          label:
            item.label,
          value:
            item.total,
        }),
      ),
      4,
      1,
    );
  }

  private addCharts(
    workbook: ExcelJS.Workbook,
    sheet: ExcelJS.Worksheet,
    values: Array<{ label: string; value: number }>,
    column: number,
    row: number,
  ) {
    const chartValues = values
      .filter((item) => Number.isFinite(item.value) && item.value > 0)
      .sort((left, right) => right.value - left.value)
      .slice(0, 10);

    const legendColumn = column + 8;
    const total = chartValues.reduce((sum, item) => sum + item.value, 0);
    const colors = [
      "FF18C77A", "FF0078D4", "FFFFAA00", "FFDC3545", "FF6F42C1",
      "FF20C997", "FFFD7E14", "FF6C757D", "FF0D6EFD", "FF198754",
    ];

    sheet.getCell(row + 1, legendColumn).value = "Legenda";
    sheet.getCell(row + 1, legendColumn).font = { bold: true };
    sheet.getCell(row + 1, legendColumn + 1).value = "Quantidade";
    sheet.getCell(row + 1, legendColumn + 1).font = { bold: true };
    sheet.getCell(row + 1, legendColumn + 2).value = "Participação";
    sheet.getCell(row + 1, legendColumn + 2).font = { bold: true };

    if (!chartValues.length) {
      sheet.getCell(row + 2, legendColumn).value = "Sem dados para o recorte selecionado";
      return;
    }

    chartValues.forEach((item, index) => {
      const currentRow = row + index + 2;
      const labelCell = sheet.getCell(currentRow, legendColumn);
      labelCell.value = item.label;
      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colors[index % colors.length]! },
      };
      labelCell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      labelCell.alignment = { wrapText: true };
      sheet.getCell(currentRow, legendColumn + 1).value = item.value;
      sheet.getCell(currentRow, legendColumn + 2).value = total > 0 ? item.value / total : 0;
      sheet.getCell(currentRow, legendColumn + 2).numFmt = "0.00%";
    });
    sheet.getColumn(legendColumn).width = 34;
    sheet.getColumn(legendColumn + 1).width = 14;
    sheet.getColumn(legendColumn + 2).width = 14;

    if (chartValues.length > 1) {
      const pie = workbook.addImage({
        base64: createPieChartPng(chartValues).toString("base64"),
        extension: "png",
      });
      sheet.addImage(pie, {
        tl: { col: column, row },
        ext: { width: 390, height: 250 },
      });
    } else {
      sheet.getCell(row + 2, column + 1).value =
        "Distribuição única: o gráfico de pizza foi omitido por não agregar comparação.";
      sheet.getCell(row + 2, column + 1).alignment = { wrapText: true };
    }

    const bars = workbook.addImage({
      base64: createBarChartPng(chartValues).toString("base64"),
      extension: "png",
    });
    sheet.addImage(bars, {
      tl: { col: column, row: row + 15 },
      ext: { width: 430, height: 250 },
    });
  }

  private applyScope(
    workbook:
      ExcelJS.Workbook,
    scope:
      ReportScope,
  ) {
    const sheets:
      Record<
        ReportScope,
        string[]
      > = {
      executive: [
        "Evolução Categorias",
        "Insights Diretoria",
        "Resumo Executivo",
        "Analistas",
        "Clientes",
        "Categorias",
        "Estados Azure",
        "Versões",
        "SLA",
        "Situação Atendimentos",
        "Desenvolvimento",
      ],
      analysts: [
        "Evolução Categorias",
        "Insights Diretoria",
        "Analistas",
        "Situação Atendimentos",
      ],
      sla: [
        "Evolução Categorias",
        "Insights Diretoria",
        "SLA",
        "Situação Atendimentos",
        "Categorias",
      ],
      clients: [
        "Evolução Categorias",
        "Insights Diretoria",
        "Clientes",
        "Categorias",
        "Situação Atendimentos",
      ],
      development: [
        "Evolução Categorias",
        "Insights Diretoria",
        "Desenvolvimento",
        "Estados Azure",
        "Versões",
      ],
      versions: [
        "Evolução Categorias",
        "Insights Diretoria",
        "Versões",
        "Estados Azure",
        "Desenvolvimento",
      ],
    };

    const allowed =
      new Set(
        sheets[
          scope
        ],
      );

    workbook.worksheets
      .filter(
        (
          sheet,
        ) =>
          !allowed.has(
            sheet.name,
          ),
      )
      .forEach(
        (
          sheet,
        ) => {
          workbook.removeWorksheet(
            sheet.id,
          );
        },
      );
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
    expectedRows:
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

    for (
      let index =
        rows.length;
      index <
        expectedRows;
      index++
    ) {
      sheet.getRow(
        startRow +
        index +
        1,
      );
    }
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


function clientAliases(value: string) {
  const normalized = value.trim();
  const shortName = normalized.split(/\s+-\s+/)[0]?.trim() ?? normalized;
  return [...new Set([normalized, shortName].filter((item) => item.length >= 3))];
}
