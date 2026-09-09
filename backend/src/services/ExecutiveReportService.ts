import ExcelJS from "exceljs";

import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../database/prisma";

type ExecutiveReportOptions = {
  from: Date;
  to: Date;
  userId: number;
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
      createdDate: {
        gte:
          options.from,
        lte:
          options.to,
      },
    };

    const azureWhere:
      Prisma.AzureWorkItemWhereInput = {
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
      ]);

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
          "Tickets abertos no período",
          ticketsTotal,
          "Data de abertura entre o início e o fim selecionados.",
        ],
        [
          "Em aberto",
          ticketsOpen,
          "Sem data de resolução e sem data de encerramento.",
        ],
        [
          "Resolvidos",
          ticketsResolved,
          "Com data de resolução preenchida.",
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
      cell.row,
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
