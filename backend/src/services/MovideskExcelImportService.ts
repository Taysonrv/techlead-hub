import ExcelJS from "exceljs";
import crypto from "node:crypto";

import { prisma } from "../database/prisma";

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
    if (
      !fileBuffer ||
      fileBuffer.length === 0
    ) {
      throw new Error(
        "O arquivo enviado está vazio."
      );
    }

    const workbook =
      new ExcelJS.Workbook();

    try {
      await workbook.xlsx.load(
        fileBuffer as any
      );
    } catch (error) {
      console.error(
        "[import] Falha ao abrir o Excel:",
        error
      );

      throw new Error(
        "Não foi possível abrir o arquivo Excel. Salve novamente o relatório como .xlsx e tente importar outra vez."
      );
    }

    const worksheetInfo =
      this.findWorksheetAndHeader(
        workbook
      );

    if (!worksheetInfo) {
      throw new Error(
        "Não foi encontrada uma planilha válida. O relatório precisa conter as colunas Número, Assunto e Aberto em."
      );
    }

    const {
      worksheet,
      headerRowNumber,
      headers,
    } =
      worksheetInfo;

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

    /*
     * Lê todo o arquivo antes de gravar qualquer ticket.
     * Isso evita alterar a base quando a planilha estiver
     * estruturalmente inválida.
     */
    const rows =
      this.readRows(
        worksheet,
        headers,
        headerRowNumber
      );

    if (
      rows.length === 0
    ) {
      throw new Error(
        "A planilha foi localizada, mas não possui linhas de atendimento para importar."
      );
    }

    /*
     * Cada importação recebe um lote próprio. Além de auditoria,
     * isso permite identificar tickets que não apareceram na
     * importação mais recente sem apagar dados automaticamente.
     */
    const importRun =
      await prisma.importRun.create({
        data: {
          batch: batchId,
          source: "MOVÍDESK_EXCEL",
          status: "PROCESSING",
          totalRows: rows.length,
        },
      });

    /*
     * Detecta duplicidades dentro do próprio Excel.
     */
    const seenTicketIds =
      new Set<number>();

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

        if (
          seenTicketIds.has(
            ticket.movideskId
          )
        ) {
          ignored++;

          errorDetails.push({
            row:
              row.rowNumber,

            message:
              `Ticket ${ticket.movideskId} duplicado no próprio arquivo. A ocorrência adicional foi ignorada.`,
          });

          continue;
        }

        seenTicketIds.add(
          ticket.movideskId
        );

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

              importRunId:
                importRun.id,
            },

            update: {
              ...ticket,

              importSource:
                "MOVÍDESK_EXCEL",

              importBatch:
                batchId,

              importedAt:
                new Date(),

              importRunId:
                importRun.id,
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

    /*
     * O snapshot operacional só pode ser baseado em uma importação
     * concluída sem erros de processamento. Linhas ignoradas/duplicadas
     * permanecem registradas na auditoria, mas não invalidam o snapshot
     * quando todos os tickets válidos foram processados.
     */
    const importStatus =
      errors > 0
        ? "PARTIAL"
        : "SUCCESS";

    await prisma.importRun.update({
      where: {
        id: importRun.id,
      },
      data: {
        status: importStatus,
        totalRows: rows.length,
        insertedRows: created,
        updatedRows: updated,
        skippedRows: ignored,
        errorRows: errors,
        finishedAt: new Date(),
        message:
          errors > 0
            ? `Importação concluída com ${errors} erro(s).`
            : ignored > 0
              ? `Importação concluída com ${ignored} linha(s) ignorada(s).`
              : "Importação concluída com sucesso.",
      },
    });

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
     LOCALIZAÇÃO DA PLANILHA / CABEÇALHO
  ===================================================== */

  private findWorksheetAndHeader(
    workbook: ExcelJS.Workbook
  ) {
    if (
      !workbook.worksheets ||
      workbook.worksheets.length === 0
    ) {
      return null;
    }

    /*
     * O Movidesk pode gerar arquivos com linhas vazias,
     * títulos ou filtros acima do cabeçalho real. Por isso
     * procuramos a estrutura válida nas primeiras 20 linhas
     * de cada planilha.
     */
    for (
      const worksheet
      of workbook.worksheets
    ) {
      const maxRow =
        Math.min(
          Math.max(
            worksheet.rowCount,
            1
          ),
          20
        );

      for (
        let rowNumber = 1;
        rowNumber <= maxRow;
        rowNumber++
      ) {
        const headers =
          this.readHeaders(
            worksheet.getRow(
              rowNumber
            )
          );

        if (
          this.hasRequiredColumns(
            headers
          )
        ) {
          return {
            worksheet,
            headerRowNumber:
              rowNumber,
            headers,
          };
        }
      }
    }

    return null;
  }

  private readRows(
    worksheet: ExcelJS.Worksheet,
    headers: string[],
    headerRowNumber: number
  ) {
    const rows: {
      rowNumber: number;
      data: ExcelRow;
    }[] = [];

    worksheet.eachRow(
      {
        includeEmpty:
          false,
      },
      (
        row,
        rowNumber
      ) => {
        if (
          rowNumber <=
          headerRowNumber
        ) {
          return;
        }

        const data:
          ExcelRow = {};

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
              value !== undefined &&
              this.cellToString(
                value
              ).trim() !==
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

    return rows;
  }

  /* =====================================================
     HEADERS
  ===================================================== */

  private readHeaders(
    headerRow: ExcelJS.Row
  ) {
    const headers:
      string[] = [];

    const cellCount =
      Math.max(
        headerRow.cellCount,
        headerRow.actualCellCount
      );

    for (
      let colNumber = 1;
      colNumber <= cellCount;
      colNumber++
    ) {
      headers[
        colNumber - 1
      ] =
        this.normalizeHeader(
          this.cellToString(
            headerRow.getCell(
              colNumber
            ).value
          )
        );
    }

    return headers;
  }

  private normalizeHeader(
    value: string
  ) {
    return value
      .replace(
        /[\u200B-\u200D\uFEFF]/g,
        ""
      )
      .replace(
        /\u00A0/g,
        " "
      )
      .replace(
        /[\r\n\t]+/g,
        " "
      )
      .trim()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      /*
       * Normaliza indicadores ordinais usados pelo Excel/
       * Movidesk ("1º", "1°", "1ª") para "1".
       *
       * Assim, cabeçalhos como:
       * - 1º resposta vence em
       * - 1° resposta vence em
       * - 1ª resposta vence em
       *
       * passam a ser equivalentes.
       */
      .replace(
        /[º°ª]/g,
        ""
      )
      .replace(
        /\s+/g,
        " "
      )
      .replace(
        /\s*:\s*$/,
        ""
      )
      .toLowerCase();
  }

  /* =====================================================
     VALIDAÇÃO
  ===================================================== */

  private requiredColumnGroups() {
    return [
      [
        "numero",
        "número",
        "ticket",
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
  }

  private hasRequiredColumns(
    headers: string[]
  ) {
    return this
      .requiredColumnGroups()
      .every(
        (group) =>
          group.some(
            (column) =>
              headers.includes(
                this.normalizeHeader(
                  column
                )
              )
          )
      );
  }

  private validateRequiredColumns(
    headers: string[]
  ) {
    const missing =
      this
        .requiredColumnGroups()
        .filter(
          (group) =>
            !group.some(
              (column) =>
                headers.includes(
                  this.normalizeHeader(
                    column
                  )
                )
            )
        )
        .map(
          (group) =>
            group[0]
        );

    if (
      missing.length > 0
    ) {
      throw new Error(
        `O Excel não possui todas as colunas obrigatórias do relatório do Movidesk. Coluna(s) não localizada(s): ${missing.join(
          ", "
        )}.`
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

    const ownerTeamAliases = [
      "equipe do responsavel",
      "equipe do responsável",
      "equipe",
      "time",
      "squad",
    ];

    const ownerTeam =
      this.hasAnyColumn(
        row,
        ownerTeamAliases
      )
        ? this.toString(
            this.value(
              row,
              ownerTeamAliases
            )
          )
        : undefined;

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

    const justificationAliases = [
      "justificativa",
    ];

    const justification =
      this.hasAnyColumn(
        row,
        justificationAliases
      )
        ? this.toString(
            this.value(
              row,
              justificationAliases
            )
          )
        : undefined;

    const service =
      this.toString(
        this.value(
          row,
          [
            /*
             * Cabeçalho utilizado no relatório atual.
             */
            "serviço (2º nível)",
            "servico (2º nivel)",
            "serviço 2º nível",
            "servico 2º nivel",
            "serviço segundo nível",
            "servico segundo nivel",

            /*
             * Aliases legados / genéricos.
             */
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

    const rawDueDate =
      this.value(
        row,
        [
          "vencimento em",
          "vencimento",
          "data de vencimento",
          "prazo de vencimento",
          "prazo",
        ]
      );

    /*
     * O Movidesk pode retornar literalmente "Em pausa"
     * no campo Vencimento em. Isso não é uma data inválida:
     * representa um prazo operacional temporariamente pausado.
     *
     * Não persistimos um campo novo no Prisma nesta etapa.
     * A informação é usada para classificar o baseStatus como
     * Stopped, evitando que as telas tratem esse ticket como
     * prazo correndo normalmente.
     */
    const dueDateIsPaused =
      this.isPausedDeadline(
        rawDueDate
      );

    const dueDate =
      dueDateIsPaused
        ? null
        : this.toDate(
            rawDueDate
          );

    const firstResponseDueDate =
      this.toDate(
        this.value(
          row,
          [
            /*
             * Cabeçalhos observados nos relatórios do Movidesk.
             *
             * O normalizador remove acentos, espaços extras e
             * caracteres invisíveis, mas mantém símbolos como
             * º, ° e ª. Por isso listamos explicitamente as
             * variações mais comuns.
             */
            "1º resposta vence em",
            "1° resposta vence em",
            "1ª resposta vence em",
            "1 resposta vence em",
            "1a resposta vence em",
            "primeira resposta vence em",
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
            /*
             * Cabeçalhos observados nos relatórios do Movidesk.
             */
            "1º resposta dada em",
            "1° resposta dada em",
            "1ª resposta dada em",
            "1 resposta dada em",
            "1a resposta dada em",
            "primeira resposta dada em",
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

    const lifetimeAliases = [
      "tempo de vida (horas úteis)",
      "tempo de vida (horas uteis)",
      "tempo de vida horas úteis",
      "tempo de vida horas uteis",
      "tempo de vida",
      "tempo vida",
    ];

    const lifetimeMinutes =
      this.hasAnyColumn(
        row,
        lifetimeAliases
      )
        ? this.toMinutes(
            this.value(
              row,
              lifetimeAliases
            )
          )
        : undefined;

    const stoppedAliases = [
      "tempo parado",
      "tempo em parada",
    ];

    const stoppedMinutes =
      this.hasAnyColumn(
        row,
        stoppedAliases
      )
        ? this.toMinutes(
            this.value(
              row,
              stoppedAliases
            )
          )
        : undefined;

    const taskNumber =
      this.toInteger(
        this.value(
          row,
          [
            "número task",
            "numero task",
            "task",
            "número da task",
            "numero da task",
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

    const deliveredVersionAliases = [
      "versão entregue task",
      "versao entregue task",
      "versão entregue da task",
      "versao entregue da task",
      "versao entregue",
      "versão entregue",
      "versao",
      "versão",
    ];

    const deliveredVersion =
      this.hasAnyColumn(
        row,
        deliveredVersionAliases
      )
        ? this.toString(
            this.value(
              row,
              deliveredVersionAliases
            )
          )
        : undefined;

    /*
     * Resultado oficial calculado pelo Movidesk.
     * Esses campos devem ser usados como fonte primária para
     * o SLA histórico de tickets já respondidos/resolvidos.
     */
    const solutionSlaAliases = [
      "indicador do sla de solução",
      "indicador do sla de solucao",
      "sla de solução",
      "sla de solucao",
    ];

    const solutionSlaIndicator =
      this.hasAnyColumn(
        row,
        solutionSlaAliases
      )
        ? this.toString(
            this.value(
              row,
              solutionSlaAliases
            )
          )
        : undefined;

    const responseSlaAliases = [
      "indicador do sla de resposta",
      "sla de resposta",
    ];

    const responseSlaIndicator =
      this.hasAnyColumn(
        row,
        responseSlaAliases
      )
        ? this.toString(
            this.value(
              row,
              responseSlaAliases
            )
          )
        : undefined;

    return {
      movideskId,

      protocol:
        String(
          movideskId
        ),

      subject,

      status,

      baseStatus:
        dueDateIsPaused
          ? "Stopped"
          : this.mapBaseStatus(
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

      /*
       * Se "Vencimento em" estiver como "Em pausa",
       * dueDate permanece null e baseStatus será Stopped.
       */
      dueDate,

      firstResponseDueDate,
      firstResponseDate,

      resolvedDate,
      closedDate,

      solutionSlaIndicator,
      responseSlaIndicator,

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

    /*
     * Fallback tolerante:
     *
     * Alguns arquivos exportados podem trazer pequenas
     * diferenças de pontuação/espaçamento nos cabeçalhos.
     * Nesses casos comparamos uma versão compactada.
     */
    const rowEntries =
      Object.entries(
        row
      );

    for (
      const alias of aliases
    ) {
      const compactAlias =
        this.compactHeader(
          alias
        );

      const match =
        rowEntries.find(
          ([header]) =>
            this.compactHeader(
              header
            ) ===
            compactAlias
        );

      if (match) {
        return match[1];
      }
    }

    return null;
  }

  private hasAnyColumn(
    row: ExcelRow,
    aliases: string[]
  ) {
    const rowHeaders =
      Object.keys(row);

    return aliases.some(
      (alias) => {
        const normalizedAlias =
          this.normalizeHeader(
            alias
          );

        if (
          rowHeaders.includes(
            normalizedAlias
          )
        ) {
          return true;
        }

        const compactAlias =
          this.compactHeader(
            alias
          );

        return rowHeaders.some(
          (header) =>
            this.compactHeader(
              header
            ) === compactAlias
        );
      }
    );
  }

  private compactHeader(
    value: string
  ) {
    return this
      .normalizeHeader(
        value
      )
      .replace(
        /[^a-z0-9]/g,
        ""
      );
  }

  /* =====================================================
     PRAZO EM PAUSA
  ===================================================== */

  private isPausedDeadline(
    value: unknown
  ) {
    const normalized =
      this.normalizeHeader(
        this.cellToString(
          value
        )
      );

    return (
      normalized ===
        "em pausa" ||
      normalized ===
        "pausado" ||
      normalized ===
        "pausa" ||
      normalized.includes(
        "prazo em pausa"
      )
    );
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
        "paus"
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
      )
        .replace(
          /\u00A0/g,
          " "
        )
        .replace(
          /[ \t]+/g,
          " "
        )
        .trim();

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
  ): number | null {
    if (
      value === null ||
      value ===
        undefined
    ) {
      return null;
    }

    /*
     * ExcelJS pode devolver células de duração como Date
     * dependendo do formato da coluna ([h]:mm:ss).
     *
     * Nesse caso calculamos o total de minutos a partir do
     * serial Excel (epoch 30/12/1899), preservando durações
     * maiores que 24 horas.
     */
    if (
      value instanceof
      Date
    ) {
      const excelEpoch =
        Date.UTC(
          1899,
          11,
          30
        );

      const totalMinutes =
        Math.round(
          (
            value.getTime() -
            excelEpoch
          ) /
            60000
        );

      return totalMinutes >=
        0
        ? totalMinutes
        : null;
    }

    if (
      typeof value ===
      "number"
    ) {
      /*
       * Em células formatadas como duração do Excel,
       * o valor numérico representa fração de dia.
       *
       * Ex.:
       * 0,5 = 12 horas
       * 1,5 = 36 horas
       *
       * O relatório do Movidesk usa esse padrão para
       * "Tempo de vida (Horas úteis)".
       */
      if (
        value >= 0 &&
        value < 1000
      ) {
        return Math.round(
          value *
            1440
        );
      }

      return Math.round(
        value
      );
    }

    /*
     * Alguns tipos do ExcelJS usam objetos com propriedade
     * result. Tentamos reaproveitar o valor real antes da
     * conversão textual.
     */
    if (
      typeof value ===
      "object"
    ) {
      const objectValue =
        value as any;

      if (
        objectValue.result !==
          undefined &&
        objectValue.result !==
          value
      ) {
        return this.toMinutes(
          objectValue.result
        );
      }
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
     * HH:mm / HHH:mm / HH:mm:ss
     *
     * Permite durações acima de 24h.
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

      const seconds =
        Number(
          clock[3] ??
            "0"
        );

      return Math.round(
        hours *
          60 +
          minutes +
          seconds /
            60
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
        ) *
        60;
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
