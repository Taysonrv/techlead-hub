import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../database/prisma";

import type {
  ReportScope,
} from "./ExecutiveReportService";

type PdfOptions = {
  from: Date;
  to: Date;
  userId: number;
  scope: ReportScope;
};

type Datum = {
  label: string;
  value: number;
};

type Section = {
  title: string;
  subtitle: string;
  data: Datum[];
};

const COLORS = [
  [0.094, 0.78, 0.478],
  [0, 0.47, 0.83],
  [1, 0.67, 0],
  [0.86, 0.21, 0.27],
  [0.44, 0.26, 0.76],
  [0.13, 0.79, 0.59],
  [0.99, 0.49, 0.08],
  [0.42, 0.46, 0.49],
] as const;

export class ManagementPdfService {
  public async generate(
    options:
      PdfOptions,
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
      ticketTotal,
      ticketOpen,
      ticketResolved,
      ticketClosed,
      slaMeasured,
      slaMet,
      analysts,
      clients,
      categories,
      corrections,
      evolutions,
      supports,
      prioritized,
      blocked,
      states,
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
            15,
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
            15,
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
            15,
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
          take:
            15,
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
            15,
        }),
      ]);

    const all:
      Record<
        string,
        Section
      > = {
      tickets: {
        title:
          "Atendimentos",
        subtitle:
          "Situação dos tickets Movidesk",
        data: [
          {
            label:
              "Em aberto",
            value:
              ticketOpen,
          },
          {
            label:
              "Resolvidos",
            value:
              ticketResolved,
          },
          {
            label:
              "Encerrados",
            value:
              ticketClosed,
          },
        ],
      },
      sla: {
        title:
          "SLA de solução",
        subtitle:
          `Total de ${ticketTotal} tickets no período`,
        data: [
          {
            label:
              "Dentro do prazo",
            value:
              slaMet,
          },
          {
            label:
              "Fora do prazo",
            value:
              Math.max(
                0,
                slaMeasured -
                  slaMet,
              ),
          },
          {
            label:
              "Não medido",
            value:
              Math.max(
                0,
                ticketTotal -
                  slaMeasured,
              ),
          },
        ],
      },
      analysts: {
        title:
          "Analistas e produtividade",
        subtitle:
          "Volume de tickets por responsável",
        data:
          analysts.map(
            (
              item,
            ) => ({
              label:
                item.owner ??
                "Não informado",
              value:
                item._count
                  ._all,
            }),
          ),
      },
      clients: {
        title:
          "Clientes",
        subtitle:
          "Volume de atendimentos por cliente",
        data:
          clients.map(
            (
              item,
            ) => ({
              label:
                item.client ??
                "Não informado",
              value:
                item._count
                  ._all,
            }),
          ),
      },
      categories: {
        title:
          "Categorias",
        subtitle:
          "Distribuição dos atendimentos",
        data:
          categories.map(
            (
              item,
            ) => ({
              label:
                item.category ??
                "Não informada",
              value:
                item._count
                  ._all,
            }),
          ),
      },
      development: {
        title:
          "Desenvolvimento",
        subtitle:
          "Correções, evoluções e apoios",
        data: [
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
          {
            label:
              "Priorizados",
            value:
              prioritized,
          },
          {
            label:
              "Processo bloqueado",
            value:
              blocked,
          },
        ],
      },
      states: {
        title:
          "Estados Azure",
        subtitle:
          "Distribuição dos Work Items por estado",
        data:
          states.map(
            (
              item,
            ) => ({
              label:
                item.state,
              value:
                item._count
                  ._all,
            }),
          ),
      },
      versions: {
        title:
          "Versões",
        subtitle:
          "Work Items por versão entregue",
        data:
          versions.map(
            (
              item,
            ) => ({
              label:
                item.deliveredVersion ??
                "Não informada",
              value:
                item._count
                  ._all,
            }),
          ),
      },
    };

    const selection:
      Record<
        ReportScope,
        string[]
      > = {
      executive: [
        "tickets",
        "sla",
        "analysts",
        "clients",
        "categories",
        "development",
        "states",
        "versions",
      ],
      analysts: [
        "analysts",
        "tickets",
      ],
      sla: [
        "sla",
        "tickets",
        "categories",
      ],
      clients: [
        "clients",
        "categories",
        "tickets",
      ],
      development: [
        "development",
        "states",
        "versions",
      ],
      versions: [
        "versions",
        "states",
        "development",
      ],
    };

    const sections =
      selection[
        options.scope
      ].map(
        (
          key,
        ) =>
          all[key]!,
      );

    return buildPdf({
      title:
        reportTitle(
          options.scope,
        ),
      period:
        `${dateLabel(options.from)} a ${dateLabel(options.to)}`,
      generatedBy:
        user?.name ??
        user?.username ??
        "Usuário",
      sections,
    });
  }

  private countAzureType(
    baseWhere:
      Prisma.AzureWorkItemWhereInput,
    type:
      string,
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
}

function reportTitle(
  scope:
    ReportScope,
) {
  const titles:
    Record<
      ReportScope,
      string
    > = {
    executive:
      "Relatório Executivo",
    analysts:
      "Analistas e Produtividade",
    sla:
      "SLA e Atendimento",
    clients:
      "Análise de Clientes",
    development:
      "Correções, Evoluções e Apoios",
    versions:
      "Análise por Versões",
  };

  return titles[
    scope
  ];
}

function buildPdf(input: {
  title: string;
  period: string;
  generatedBy: string;
  sections: Section[];
}) {
  const objects:
    string[] = [];

  const add = (
    value:
      string
  ) => {
    objects.push(
      value
    );
    return objects.length;
  };

  const font =
    add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    );
  const bold =
    add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    );

  const pageIds:
    number[] = [];

  input.sections.forEach(
    (
      section,
      index,
    ) => {
      const commands =
        pageContent(
          input,
          section,
          index + 1,
          input.sections
            .length,
        );
      const stream =
        add(
          `<< /Length ${Buffer.byteLength(commands, "latin1")} >>\nstream\n${commands}\nendstream`
        );
      const page =
        add(
          `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${stream} 0 R >>`
        );

      pageIds.push(
        page
      );
    },
  );

  const pages =
    add(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
    );

  pageIds.forEach(
    (
      id,
    ) => {
      objects[id - 1] =
        objects[id - 1]!
          .replace(
            "PAGES_REF",
            `${pages} 0 R`,
          );
    },
  );

  const catalog =
    add(
      `<< /Type /Catalog /Pages ${pages} 0 R >>`
    );

  const chunks:
    Buffer[] = [
      Buffer.from(
        "%PDF-1.4\n%âãÏÓ\n",
        "latin1",
      ),
    ];
  const offsets:
    number[] = [
      0,
    ];

  objects.forEach(
    (
      object,
      index,
    ) => {
      offsets.push(
        chunks.reduce(
          (
            total,
            chunk,
          ) =>
            total +
            chunk.length,
          0,
        ),
      );
      chunks.push(
        Buffer.from(
          `${index + 1} 0 obj\n${object}\nendobj\n`,
          "latin1",
        ),
      );
    },
  );

  const xrefOffset =
    chunks.reduce(
      (
        total,
        chunk,
      ) =>
        total +
        chunk.length,
      0,
    );

  let xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (
    let index =
      1;
    index <
      offsets.length;
    index += 1
  ) {
    xref +=
      `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  xref +=
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  chunks.push(
    Buffer.from(
      xref,
      "latin1",
    ),
  );

  return Buffer.concat(
    chunks
  );
}

function pageContent(
  report: {
    title: string;
    period: string;
    generatedBy: string;
  },
  section:
    Section,
  page:
    number,
  pageCount:
    number,
) {
  const commands:
    string[] = [];

  fillRect(
    commands,
    0,
    550,
    842,
    45,
    [
      0.094,
      0.78,
      0.478,
    ],
  );

  text(
    commands,
    report.title,
    34,
    568,
    19,
    true,
    [
      0.03,
      0.1,
      0.07,
    ],
  );
  text(
    commands,
    `Período: ${report.period}   |   Gerado por: ${report.generatedBy}`,
    34,
    535,
    9,
    false,
    [
      0.32,
      0.36,
      0.4,
    ],
  );
  text(
    commands,
    section.title,
    34,
    500,
    18,
    true,
  );
  text(
    commands,
    section.subtitle,
    34,
    480,
    10,
    false,
    [
      0.35,
      0.39,
      0.44,
    ],
  );

  const data =
    section.data
      .filter(
        (
          item,
        ) =>
          Number.isFinite(
            item.value,
          ),
      )
      .slice(
        0,
        12,
      );

  drawPie(
    commands,
    data,
    190,
    300,
    115,
  );
  drawBars(
    commands,
    data,
    370,
    255,
    425,
    185,
  );
  drawTable(
    commands,
    data,
    34,
    55,
    770,
  );

  text(
    commands,
    `TechLead Hub | Página ${page} de ${pageCount}`,
    34,
    22,
    8,
    false,
    [
      0.45,
      0.48,
      0.52,
    ],
  );

  return commands.join(
    "\n"
  );
}

function drawPie(
  commands:
    string[],
  data:
    Datum[],
  centerX:
    number,
  centerY:
    number,
  radius:
    number,
) {
  const total =
    data.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        Math.max(
          0,
          item.value,
        ),
      0,
    );

  if (total <= 0) {
    return;
  }

  let start =
    Math.PI /
    2;

  data
    .slice(
      0,
      8,
    )
    .forEach(
      (
        item,
        index,
      ) => {
        const angle =
          Math.max(
            0,
            item.value,
          ) /
          total *
          Math.PI *
          2;
        const points:
          Array<
            [
              number,
              number,
            ]
          > = [
          [
            centerX,
            centerY,
          ],
        ];
        const steps =
          Math.max(
            2,
            Math.ceil(
              angle /
              (
                Math.PI /
                20
              ),
            ),
          );

        for (
          let step =
            0;
          step <=
            steps;
          step += 1
        ) {
          const current =
            start -
            angle *
            step /
            steps;
          points.push([
            centerX +
              Math.cos(
                current,
              ) *
              radius,
            centerY +
              Math.sin(
                current,
              ) *
              radius,
          ]);
        }

        const color =
          COLORS[
            index %
              COLORS.length
          ]!;

        commands.push(
          `${color.join(" ")} rg`,
          `${number(points[0]![0])} ${number(points[0]![1])} m`,
        );

        points.slice(
          1,
        ).forEach(
          (
            point,
          ) => {
            commands.push(
              `${number(point[0])} ${number(point[1])} l`,
            );
          },
        );

        commands.push(
          "h f"
        );

        start -=
          angle;
      },
    );

  data
    .slice(
      0,
      8,
    )
    .forEach(
      (
        item,
        index,
      ) => {
        const y =
          420 -
          index *
            18;
        const color =
          COLORS[
            index %
              COLORS.length
          ]!;

        fillRect(
          commands,
          315,
          y - 8,
          9,
          9,
          color,
        );
        text(
          commands,
          `${truncate(item.label, 27)}: ${item.value}`,
          330,
          y - 6,
          8,
        );
      },
    );
}

function drawBars(
  commands:
    string[],
  data:
    Datum[],
  x:
    number,
  y:
    number,
  width:
    number,
  height:
    number,
) {
  const values =
    data.slice(
      0,
      10,
    );
  const max =
    Math.max(
      1,
      ...values.map(
        (
          item,
        ) =>
          item.value,
      ),
    );
  const gap =
    7;
  const barWidth =
    Math.max(
      8,
      (
        width -
        gap *
          (
            values.length -
            1
          )
      ) /
      Math.max(
        1,
        values.length,
      ),
    );

  values.forEach(
    (
      item,
      index,
    ) => {
      const barHeight =
        Math.max(
          1,
          item.value /
          max *
          height,
        );
      const color =
        COLORS[
          index %
            COLORS.length
        ]!;

      fillRect(
        commands,
        x +
          index *
            (
              barWidth +
              gap
            ),
        y,
        barWidth,
        barHeight,
        color,
      );
    },
  );

  commands.push(
    "0.72 0.75 0.78 RG",
    `${x} ${y} m ${x + width} ${y} l S`,
  );
}

function drawTable(
  commands:
    string[],
  data:
    Datum[],
  x:
    number,
  y:
    number,
  width:
    number,
) {
  const rows =
    data.slice(
      0,
      6,
    );
  const rowHeight =
    19;
  const top =
    y +
    (
      rows.length +
      1
    ) *
    rowHeight;

  fillRect(
    commands,
    x,
    top -
      rowHeight,
    width,
    rowHeight,
    [
      0.03,
      0.1,
      0.07,
    ],
  );
  text(
    commands,
    "Indicador",
    x + 8,
    top - 13,
    8,
    true,
    [
      1,
      1,
      1,
    ],
  );
  text(
    commands,
    "Quantidade",
    x + width - 82,
    top - 13,
    8,
    true,
    [
      1,
      1,
      1,
    ],
  );

  const total =
    rows.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.value,
      0,
    );

  rows.forEach(
    (
      item,
      index,
    ) => {
      const currentY =
        top -
        (
          index +
          2
        ) *
        rowHeight;

      if (
        index %
          2 ===
        0
      ) {
        fillRect(
          commands,
          x,
          currentY,
          width,
          rowHeight,
          [
            0.96,
            0.97,
            0.98,
          ],
        );
      }

      text(
        commands,
        truncate(
          item.label,
          85,
        ),
        x + 8,
        currentY + 6,
        8,
      );
      text(
        commands,
        `${item.value}  (${total > 0 ? (item.value / total * 100).toFixed(1) : "0.0"}%)`,
        x + width - 82,
        currentY + 6,
        8,
      );
    },
  );
}

function fillRect(
  commands:
    string[],
  x:
    number,
  y:
    number,
  width:
    number,
  height:
    number,
  color:
    readonly number[],
) {
  commands.push(
    `${color.join(" ")} rg`,
    `${number(x)} ${number(y)} ${number(width)} ${number(height)} re f`,
  );
}

function text(
  commands:
    string[],
  value:
    string,
  x:
    number,
  y:
    number,
  size:
    number,
  bold =
    false,
  color:
    readonly number[] = [
      0.04,
      0.06,
      0.08,
    ],
) {
  commands.push(
    `${color.join(" ")} rg`,
    `BT /${bold ? "F2" : "F1"} ${size} Tf ${number(x)} ${number(y)} Td (${pdfText(value)}) Tj ET`,
  );
}

function pdfText(
  value:
    string,
) {
  return value
    .replace(
      /[^\x20-\xFF]/g,
      "",
    )
    .replace(
      /\\/g,
      "\\\\",
    )
    .replace(
      /\(/g,
      "\\(",
    )
    .replace(
      /\)/g,
      "\\)",
    );
}

function truncate(
  value:
    string,
  length:
    number,
) {
  return value.length >
    length
    ? `${value.slice(0, length - 1)}…`
    : value;
}

function number(
  value:
    number,
) {
  return value.toFixed(
    2,
  );
}

function dateLabel(
  value:
    Date,
) {
  return value.toLocaleDateString(
    "pt-BR",
  );
}
