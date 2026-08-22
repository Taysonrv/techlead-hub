import ExcelJS from "exceljs";
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ExcelRow = Record<string, unknown>;

type ImportResult = {
  batchId: string;

  totalRows: number;

  created: number;
  updated: number;
  ignored: number;
  errors: number;

  analysts: string[];
  clients: string[];
  categories: string[];
  services: string[];

  errorDetails: {
    row: number;
    message: string;
  }[];
};

export class MovideskExcelImportService {
  async execute(
    fileBuffer: Buffer
  ): Promise<ImportResult> {
    const workbook =
      new ExcelJS.Workbook();

    await workbook.xlsx.load(
      fileBuffer as any
    );

    const worksheet =
      workbook.worksheets[0];

    if (!worksheet) {
      throw new Error(
        "O arquivo Excel não possui nenhuma planilha."
      );
    }

    const headerRow =
      worksheet.getRow(1);

    const headers =
      this.readHeaders(
        headerRow
      );

    this.validateRequiredColumns(
      headers
    );

    const batchId =
      crypto.randomUUID();

    let created = 0;
    let updated = 0;
    let ignored = 0;
    let errors = 0;

    const analysts =
      new Set<string>();

    const clients =
      new Set<string>();

    const categories =
      new Set<string>();

    const services =
      new Set<string>();

    const errorDetails: {
      row: number;
      message: string;
    }[] = [];

    const rows: {
      rowNumber: number;
      data: ExcelRow;
    }[] = [];

    worksheet.eachRow(
      (
        row,
        rowNumber
      ) => {
        if (
          rowNumber === 1
        ) {
          return;
        }

        const data: ExcelRow =
          {};

        headers.forEach(
          (
            header,
            index
          ) => {
            if (!header) {
              return;
            }

            data[header] =
              row.getCell(
                index + 1
              ).value;
          }
        );

        const hasContent =
          Object.values(
            data
          ).some(
            (value) =>
              value !== null &&
              value !==
                undefined &&
              String(value).trim() !==
                ""
          );

        if (!hasContent) {
          return;
        }

        rows.push({
          rowNumber,
          data,
        });
      }
    );

    for (const row of rows) {
      try {
        const ticket =
          this.mapRow(
            row.data
          );

        if (!ticket) {
          ignored++;

          continue;
        }

        if (ticket.owner) {
          analysts.add(
            ticket.owner
          );
        }

        if (ticket.client) {
          clients.add(
            ticket.client
          );
        }

        if (
          ticket.category
        ) {
          categories.add(
            ticket.category
          );
        }

        if (
          ticket.service
        ) {
          services.add(
            ticket.service
          );
        }

        const existing =
          await prisma.ticket.findUnique(
            {
              where: {
                movideskId:
                  ticket.movideskId,
              },

              select: {
                id: true,
              },
            }
          );

        await prisma.ticket.upsert(
          {
            where: {
              movideskId:
                ticket.movideskId,
            },

            create: {
              ...ticket,

              importSource:
                "MOVÍDESK_EXCEL",

              importBatch:
                batchId,

              importedAt:
                new Date(),
            },

            update: {
              ...ticket,

              importSource:
                "MOVÍDESK_EXCEL",

              importBatch:
                batchId,

              importedAt:
                new Date(),
            },
          }
        );

        if (existing) {
          updated++;
        } else {
          created++;
        }
      } catch (error) {
        errors++;

        errorDetails.push({
          row:
            row.rowNumber,

          message:
            error instanceof
            Error
              ? error.message
              : "Erro desconhecido.",
        });
      }
    }

    return {
      batchId,

      totalRows:
        rows.length,

      created,
      updated,
      ignored,
      errors,

      analysts:
        Array.from(
          analysts
        ).sort(),

      clients:
        Array.from(
          clients
        ).sort(),

      categories:
        Array.from(
          categories
        ).sort(),

      services:
        Array.from(
          services
        ).sort(),

      errorDetails:
        errorDetails.slice(
          0,
          100
        ),
    };
  }

  /* =====================================================
     HEADERS
  ===================================================== */

  private readHeaders(
    headerRow: ExcelJS.Row
  ) {
    const headers:
      string[] = [];

    headerRow.eachCell(
      (
        cell,
        colNumber
      ) => {
        headers[
          colNumber - 1
        ] =
          this.normalizeHeader(
            this.cellToString(
              cell.value
            )
          );
      }
    );

    return headers;
  }

  private normalizeHeader(
    value: string
  ) {
    return value
      .trim()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /\s+/g,
        " "
      )
      .toLowerCase();
  }

  /* =====================================================
     VALIDAÇÃO
  ===================================================== */

  private validateRequiredColumns(
    headers: string[]
  ) {
    const requiredGroups =
      [
        [
          "numero",
          "número",
        ],

        [
          "assunto",
          "subject",
        ],

        [
          "aberto em",
          "data de abertura",
          "criado em",
        ],
      ];

    const missing =
      requiredGroups.filter(
        (group) =>
          !group.some(
            (column) =>
              headers.includes(
                this.normalizeHeader(
                  column
                )
              )
          )
      );

    if (
      missing.length > 0
    ) {
      throw new Error(
        "O Excel não possui todas as colunas obrigatórias do relatório do Movidesk. São necessárias pelo menos: Número, Assunto e Aberto em."
      );
    }
  }

  /* =====================================================
     MAPEAMENTO
  ===================================================== */

  private mapRow(
    row: ExcelRow
  ) {
    const movideskId =
      this.toInteger(
        this.value(
          row,
          [
            "numero",
            "número",
            "ticket",
          ]
        )
      );

    if (!movideskId) {
      return null;
    }

    const subject =
      this.toString(
        this.value(
          row,
          [
            "assunto",
            "subject",
          ]
        )
      );

    if (!subject) {
      throw new Error(
        `Ticket ${movideskId}: assunto não informado.`
      );
    }

    const createdDate =
      this.toDate(
        this.value(
          row,
          [
            "aberto em",
            "data de abertura",
            "criado em",
          ]
        )
      );

    if (!createdDate) {
      throw new Error(
        `Ticket ${movideskId}: data de abertura inválida.`
      );
    }

    const fullClient =
      this.toString(
        this.value(
          row,
          [
            "cliente (completo)",
            "cliente completo",
            "cliente",
          ]
        )
      );

    const {
      client,
      contact,
    } =
      this.splitClient(
        fullClient
      );

    const status =
      this.toString(
        this.value(
          row,
          [
            "status",
            "situação",
            "situacao",
          ]
        )
      ) ?? "Não informado";

    const owner =
      this.toString(
        this.value(
          row,
          [
            "responsavel",
            "responsável",
            "owner",
          ]
        )
      );

    const ownerTeam =
      this.toString(
        this.value(
          row,
          [
            "equipe do responsavel",
            "equipe do responsável",
            "equipe",
            "time",
            "squad",
          ]
        )
      );

    const category =
      this.toString(
        this.value(
          row,
          [
            "categoria",
          ]
        )
      );

    const cause =
      this.toString(
        this.value(
          row,
          [
            "causa",
          ]
        )
      );

    const urgency =
      this.toString(
        this.value(
          row,
          [
            "urgencia",
            "urgência",
            "prioridade",
          ]
        )
      );

    const justification =
      this.toString(
        this.value(
          row,
          [
            "justificativa",
          ]
        )
      );

    const service =
      this.toString(
        this.value(
          row,
          [
            "servico",
            "serviço",
            "produto",
          ]
        )
      );

    const department =
      this.toString(
        this.value(
          row,
          [
            "departamento",
            "area",
            "área",
          ]
        )
      );

    const dueDate =
      this.toDate(
        this.value(
          row,
          [
            "vencimento",
            "data de vencimento",
          ]
        )
      );

    const firstResponseDueDate =
      this.toDate(
        this.value(
          row,
          [
            "vencimento da primeira resposta",
            "vencimento primeira resposta",
          ]
        )
      );

    const firstResponseDate =
      this.toDate(
        this.value(
          row,
          [
            "data da primeira resposta",
            "primeira resposta",
          ]
        )
      );

    const resolvedDate =
      this.toDate(
        this.value(
          row,
          [
            "resolvido em",
            "data de resolucao",
            "data de resolução",
          ]
        )
      );

    const closedDate =
      this.toDate(
        this.value(
          row,
          [
            "fechado em",
            "data de fechamento",
            "fechamento",
          ]
        )
      );

    const lifetimeMinutes =
      this.toMinutes(
        this.value(
          row,
          [
            "tempo de vida",
            "tempo vida",
          ]
        )
      );

    const stoppedMinutes =
      this.toMinutes(
        this.value(
          row,
          [
            "tempo parado",
            "tempo em parada",
          ]
        )
      );

    const taskNumber =
      this.toInteger(
        this.value(
          row,
          [
            "task",
            "numero task",
            "número task",
            "tarefa",
          ]
        )
      );

    const taskStatus =
      this.toString(
        this.value(
          row,
          [
            "status task",
            "status da task",
            "situacao task",
            "situação task",
          ]
        )
      );

    const deliveredVersion =
      this.toString(
        this.value(
          row,
          [
            "versao entregue",
            "versão entregue",
            "versao",
            "versão",
          ]
        )
      );

    return {
      movideskId,

      protocol:
        String(
          movideskId
        ),

      subject,

      status,

      baseStatus:
        this.mapBaseStatus(
          status
        ),

      category,
      cause,
      urgency,
      justification,

      client,
      contact,

      owner,

      ownerTeam,

      service,
      department,

      createdDate,
      dueDate,

      firstResponseDueDate,
      firstResponseDate,

      resolvedDate,
      closedDate,

      lifetimeMinutes,
      stoppedMinutes,

      taskNumber,
      taskStatus,
      deliveredVersion,
    };
  }

  /* =====================================================
     BUSCA VALOR POR ALIASES
  ===================================================== */

  private value(
    row: ExcelRow,
    aliases: string[]
  ) {
    for (
      const alias of aliases
    ) {
      const normalized =
        this.normalizeHeader(
          alias
        );

      if (
        Object.prototype.hasOwnProperty.call(
          row,
          normalized
        )
      ) {
        return row[
          normalized
        ];
      }
    }

    return null;
  }

  /* =====================================================
     CLIENTE / CONTATO
  ===================================================== */

  private splitClient(
    value:
      | string
      | null
  ) {
    if (!value) {
      return {
        client: null,
        contact: null,
      };
    }

    /*
     * Formato típico do relatório:
     *
     * COOPERATIVA XYZ - CIDADE-PR » FULANO DE TAL
     */

    const separators = [
      " » ",
      "»",
    ];

    for (
      const separator of separators
    ) {
      if (
        value.includes(
          separator
        )
      ) {
        const parts =
          value
            .split(separator)
            .map(
              (item) =>
                item.trim()
            );

        return {
          client:
            parts[0] ||
            null,

          contact:
            parts
              .slice(1)
              .join(" » ") ||
            null,
        };
      }
    }

    return {
      client:
        value.trim(),

      contact:
        null,
    };
  }

  /* =====================================================
     STATUS BASE
  ===================================================== */

  private mapBaseStatus(
    value: string
  ) {
    const normalized =
      value
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .toLowerCase();

    if (
      normalized.includes(
        "novo"
      )
    ) {
      return "New";
    }

    if (
      normalized.includes(
        "atendimento"
      ) ||
      normalized.includes(
        "andamento"
      )
    ) {
      return "InAttendance";
    }

    if (
      normalized.includes(
        "parado"
      ) ||
      normalized.includes(
        "aguard"
      ) ||
      normalized.includes(
        "pendente"
      )
    ) {
      return "Stopped";
    }

    if (
      normalized.includes(
        "resolvido"
      )
    ) {
      return "Resolved";
    }

    if (
      normalized.includes(
        "fechado"
      ) ||
      normalized.includes(
        "encerrado"
      )
    ) {
      return "Closed";
    }

    if (
      normalized.includes(
        "cancel"
      )
    ) {
      return "Canceled";
    }

    return null;
  }

  /* =====================================================
     CONVERSORES
  ===================================================== */

  private cellToString(
    value: unknown
  ) {
    if (
      value === null ||
      value ===
        undefined
    ) {
      return "";
    }

    if (
      typeof value ===
      "object"
    ) {
      const objectValue =
        value as any;

      if (
        objectValue.text
      ) {
        return String(
          objectValue.text
        );
      }

      if (
        objectValue.result !==
        undefined
      ) {
        return String(
          objectValue.result
        );
      }

      if (
        Array.isArray(
          objectValue.richText
        )
      ) {
        return objectValue.richText
          .map(
            (item: any) =>
              item.text ?? ""
          )
          .join("");
      }
    }

    return String(
      value
    );
  }

  private toString(
    value: unknown
  ) {
    if (
      value === null ||
      value ===
        undefined
    ) {
      return null;
    }

    const result =
      this.cellToString(
        value
      ).trim();

    if (!result) {
      return null;
    }

    return result;
  }

  private toInteger(
    value: unknown
  ) {
    if (
      value === null ||
      value ===
        undefined
    ) {
      return null;
    }

    if (
      typeof value ===
      "number"
    ) {
      return Math.trunc(
        value
      );
    }

    const stringValue =
      this.cellToString(
        value
      );

    const cleaned =
      stringValue.replace(
        /[^\d-]/g,
        ""
      );

    if (!cleaned) {
      return null;
    }

    const number =
      Number(cleaned);

    return Number.isFinite(
      number
    )
      ? Math.trunc(
          number
        )
      : null;
  }

  private toDate(
    value: unknown
  ) {
    if (
      value === null ||
      value ===
        undefined
    ) {
      return null;
    }

    if (
      value instanceof
      Date
    ) {
      return value;
    }

    if (
      typeof value ===
      "number"
    ) {
      /*
       * Serial Excel.
       */

      const excelEpoch =
        new Date(
          Date.UTC(
            1899,
            11,
            30
          )
        );

      return new Date(
        excelEpoch.getTime() +
          value *
            86400000
      );
    }

    const raw =
      this.cellToString(
        value
      ).trim();

    if (!raw) {
      return null;
    }

    /*
     * dd/MM/yyyy HH:mm
     * dd/MM/yyyy
     */

    const brDate =
      raw.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
      );

    if (brDate) {
      const [
        ,
        day,
        month,
        year,
        hour = "0",
        minute = "0",
        second = "0",
      ] = brDate;

      return new Date(
        Number(year),
        Number(month) -
          1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      );
    }

    const parsed =
      new Date(raw);

    if (
      Number.isNaN(
        parsed.getTime()
      )
    ) {
      return null;
    }

    return parsed;
  }

  private toMinutes(
    value: unknown
  ) {
    if (
      value === null ||
      value ===
        undefined
    ) {
      return null;
    }

    if (
      typeof value ===
      "number"
    ) {
      /*
       * Caso venha como fração de dia do Excel.
       *
       * Valores muito pequenos normalmente representam
       * horas/dias no formato de tempo.
       */

      if (
        value >= 0 &&
        value < 1000
      ) {
        return Math.round(
          value * 1440
        );
      }

      return Math.round(
        value
      );
    }

    const raw =
      this.cellToString(
        value
      )
        .trim()
        .toLowerCase();

    if (!raw) {
      return null;
    }

    /*
     * HH:mm
     */

    const clock =
      raw.match(
        /^(\d+):(\d{2})(?::(\d{2}))?$/
      );

    if (clock) {
      const hours =
        Number(
          clock[1]
        );

      const minutes =
        Number(
          clock[2]
        );

      return (
        hours * 60 +
        minutes
      );
    }

    let total = 0;

    const days =
      raw.match(
        /(\d+(?:[.,]\d+)?)\s*d/
      );

    const hours =
      raw.match(
        /(\d+(?:[.,]\d+)?)\s*h/
      );

    const minutes =
      raw.match(
        /(\d+(?:[.,]\d+)?)\s*m/
      );

    if (days) {
      total +=
        this.decimal(
          days[1]
        ) *
        24 *
        60;
    }

    if (hours) {
      total +=
        this.decimal(
          hours[1]
        ) * 60;
    }

    if (minutes) {
      total +=
        this.decimal(
          minutes[1]
        );
    }

    if (total > 0) {
      return Math.round(
        total
      );
    }

    const numeric =
      Number(
        raw.replace(
          ",",
          "."
        )
      );

    if (
      Number.isFinite(
        numeric
      )
    ) {
      return Math.round(
        numeric
      );
    }

    return null;
  }

  private decimal(
    value: string
  ) {
    return Number(
      value.replace(
        ",",
        "."
      )
    );
  }
}