import type {
  Request,
  Response,
} from "express";

import type {
  Prisma,
} from "@prisma/client";

import { prisma } from "../database/prisma";
import { analyzeMovideskPayload } from "../services/MovideskPayloadAnalytics";

import {
  ticketOperationalScope,
} from "../domain/OperationalScope";

export class DashboardController {
  /* =========================================================
     RESUMO
  ========================================================= */

  async summary(
    req: Request,
    res: Response
  ) {
    try {
      const period =
        getPeriod(req);

      const snapshotWhere =
        await getLatestSnapshotWhere();

      const createdDateWhere =
        period
          ? {
              createdDate: {
                gte: period.start,
                lt: period.end,
              },
            }
          : {};

      const resolvedDateWhere =
        period
          ? {
              resolvedDate: {
                gte: period.start,
                lt: period.end,
              },
            }
          : {
              resolvedDate: {
                not: null,
              },
            };

      const closedDateWhere =
        period
          ? {
              closedDate: {
                gte: period.start,
                lt: period.end,
              },
            }
          : {
              closedDate: {
                not: null,
              },
            };

      /*
       * IMPORTANTE:
       *
       * "Abertos", "Resolvidos" e "Fechados" são indicadores
       * de fluxo e possuem datas de referência diferentes:
       *
       * Abertos    -> createdDate
       * Resolvidos -> resolvedDate
       * Fechados   -> closedDate
       *
       * "Pendentes" é estoque operacional atual e não deve ser
       * confundido com "Abertos no período".
       */
      const [
        totalTickets,
        abertos,
        pendentes,
        novos,
        emAtendimento,
        parados,
        resolvidos,
        fechados,
        criticos,
      ] = await Promise.all([
        prisma.ticket.count({
          where: snapshotWhere,
        }),

        prisma.ticket.count({
          where: {
            ...snapshotWhere,
            ...createdDateWhere,
          },
        }),

        prisma.ticket.count({
          where: {
            ...snapshotWhere,
            baseStatus: {
              in: [
                "New",
                "InAttendance",
                "Stopped",
              ],
            },
          },
        }),

        prisma.ticket.count({
          where: {
            ...snapshotWhere,
            baseStatus: "New",
          },
        }),

        prisma.ticket.count({
          where: {
            ...snapshotWhere,
            baseStatus:
              "InAttendance",
          },
        }),

        prisma.ticket.count({
          where: {
            ...snapshotWhere,
            baseStatus:
              "Stopped",
          },
        }),

        prisma.ticket.count({
          where: {
            ...snapshotWhere,
            ...resolvedDateWhere,
          },
        }),

        prisma.ticket.count({
          where: {
            ...snapshotWhere,
            ...closedDateWhere,
          },
        }),

        prisma.ticket.count({
          where: {
            ...snapshotWhere,
            urgency: "Crítica",

            baseStatus: {
              in: [
                "New",
                "InAttendance",
                "Stopped",
              ],
            },
          },
        }),
      ]);

      return res.json({
        totalTickets,

        /*
         * Fluxo do período selecionado.
         */
        abertos,
        resolvidos,
        fechados,

        /*
         * Backlog atual.
         */
        pendentes,
        novos,
        emAtendimento,
        parados,
        criticos,

        period:
          period
            ? {
                start:
                  period.start,
                endExclusive:
                  period.end,
              }
            : null,
      });
    } catch (error) {
      console.error(
        "Erro ao gerar dashboard:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Não foi possível gerar os indicadores.",
        });
    }
  }

  /* =========================================================
     CATEGORIAS
  ========================================================= */

  async categories(
    req: Request,
    res: Response
  ) {
    try {
      const snapshotWhere =
        await getLatestSnapshotWhere();

      const categories =
        await prisma.ticket.groupBy(
          {
            by: [
              "category",
            ],

            where: snapshotWhere,

            _count: {
              id: true,
            },

            orderBy: {
              _count: {
                id: "desc",
              },
            },
          }
        );

      const result =
        categories.map(
          (item) => ({
            category:
              item.category ??
              "Sem categoria",

            total:
              item._count.id,
          })
        );

      return res.json(
        result
      );
    } catch (error) {
      console.error(
        "Erro ao buscar tickets por categoria:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Não foi possível gerar os indicadores por categoria.",
        });
    }
  }

  /* =========================================================
     PONTOS DE ATENÇÃO
  ========================================================= */

  async attention(
    req: Request,
    res: Response
  ) {
    try {
      const snapshotWhere =
        await getLatestSnapshotWhere();

      const tickets =
        await prisma.ticket.findMany(
          {
            where: {
              ...snapshotWhere,
              baseStatus: {
                in: [
                  "New",
                  "InAttendance",
                  "Stopped",
                ],
              },
            },

            omit: {
              rawData: true,
            },

            orderBy: {
              createdDate:
                "asc",
            },
          }
        );

      const now =
        new Date();

      const attentionTickets =
        tickets.map(
          (ticket) => {
            const ageHours =
              Math.max(
                0,
                Math.floor(
                  (now.getTime() -
                    ticket.createdDate.getTime()) /
                    (1000 *
                      60 *
                      60)
                )
              );

            const reasons:
              string[] = [];

            const urgency =
              normalize(
                ticket.urgency
              );

            if (
              urgency ===
              "critica"
            ) {
              reasons.push(
                "Urgência crítica"
              );
            }

            if (
              ticket.baseStatus ===
              "Stopped"
            ) {
              reasons.push(
                "Ticket parado"
              );
            }

            if (
              ageHours >= 48
            ) {
              reasons.push(
                "Aberto há mais de 48 horas"
              );
            }

            if (
              ticket.stoppedMinutes !==
                null &&
              ticket.stoppedMinutes >=
                1440
            ) {
              reasons.push(
                "Mais de 24 horas parado"
              );
            }

            if (
              !ticket.owner
            ) {
              reasons.push(
                "Sem responsável"
              );
            }

            const dueDateExpired =
              Boolean(
                ticket.dueDate &&
                ticket.dueDate.getTime() <
                  now.getTime()
              );

            if (dueDateExpired) {
              reasons.push(
                "Prazo vencido"
              );
            }

            const firstResponseExpired =
              Boolean(
                ticket.firstResponseDueDate &&
                !ticket.firstResponseDate &&
                ticket.firstResponseDueDate.getTime() <
                  now.getTime()
              );

            if (firstResponseExpired) {
              reasons.push(
                "Primeira resposta vencida"
              );
            }

            let level:
              | "baixo"
              | "medio"
              | "alto"
              | "critico" =
              "baixo";

            if (
              urgency ===
                "critica" ||
              firstResponseExpired
            ) {
              level =
                "critico";
            } else if (
              ticket.baseStatus ===
                "Stopped" ||
              ageHours >= 72 ||
              !ticket.owner ||
              dueDateExpired
            ) {
              level =
                "alto";
            } else if (
              ageHours >= 48
            ) {
              level =
                "medio";
            }

            return {
              id:
                ticket.id,

              movideskId:
                ticket.movideskId,

              protocol:
                ticket.protocol,

              subject:
                ticket.subject,

              client:
                ticket.client,

              contact:
                ticket.contact,

              owner:
                ticket.owner,

              team:
                ticket.ownerTeam,

              category:
                ticket.category,

              cause:
                ticket.cause,

              urgency:
                ticket.urgency,

              status:
                ticket.status,

              baseStatus:
                ticket.baseStatus,

              justification:
                ticket.justification,

              service:
                ticket.service,

              department:
                ticket.department,

              createdDate:
                ticket.createdDate,

              dueDate:
                ticket.dueDate,

              firstResponseDueDate:
                ticket.firstResponseDueDate,

              firstResponseDate:
                ticket.firstResponseDate,

              resolvedDate:
                ticket.resolvedDate,

              closedDate:
                ticket.closedDate,

              solutionSlaIndicator:
                ticket.solutionSlaIndicator,

              responseSlaIndicator:
                ticket.responseSlaIndicator,

              lifetimeMinutes:
                ticket.lifetimeMinutes,

              stoppedMinutes:
                ticket.stoppedMinutes,

              taskNumber:
                ticket.taskNumber,

              taskStatus:
                ticket.taskStatus,

              deliveredVersion:
                ticket.deliveredVersion,

              importSource:
                ticket.importSource,

              importedAt:
                ticket.importedAt,

              importBatch:
                ticket.importBatch,

              ageHours,

              level,

              reasons,
            };
          }
        );

      const filtered =
        attentionTickets
          .filter(
            (ticket) =>
              ticket.reasons.length >
              0
          )
          .sort(
            (a, b) => {
              const priority:
                Record<
                  string,
                  number
                > = {
                critico: 4,
                alto: 3,
                medio: 2,
                baixo: 1,
              };

              const levelDiff =
                (priority[
                  b.level
                ] ?? 0) -
                (priority[
                  a.level
                ] ?? 0);

              if (
                levelDiff !==
                0
              ) {
                return levelDiff;
              }

              return (
                b.ageHours -
                a.ageHours
              );
            }
          );

      const summary = {
        total:
          filtered.length,

        criticos:
          filtered.filter(
            (ticket) =>
              ticket.level ===
              "critico"
          ).length,

        altos:
          filtered.filter(
            (ticket) =>
              ticket.level ===
              "alto"
          ).length,

        medios:
          filtered.filter(
            (ticket) =>
              ticket.level ===
              "medio"
          ).length,
      };

      return res.json({
        summary,

        tickets:
          filtered,
      });
    } catch (error) {
      console.error(
        "Erro ao gerar pontos de atenção:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Não foi possível gerar os pontos de atenção.",
        });
    }
  }

  /* =========================================================
     RESPONSÁVEIS
  ========================================================= */

  async owners(
    req: Request,
    res: Response
  ) {
    try {
      const snapshotWhere =
        await getLatestSnapshotWhere();

      const owners =
        await prisma.ticket.groupBy(
          {
            by: [
              "owner",
            ],

            where: snapshotWhere,

            _count: {
              id: true,
            },

            orderBy: {
              _count: {
                id: "desc",
              },
            },
          }
        );

      const result =
        owners.map(
          (item) => ({
            owner:
              item.owner ??
              "Sem responsável",

            total:
              item._count.id,
          })
        );

      return res.json(
        result
      );
    } catch (error) {
      console.error(
        "Erro ao buscar tickets por responsável:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Não foi possível gerar os indicadores por responsável.",
        });
    }
  }

  /* =========================================================
     CLIENTES
  ========================================================= */

  async clients(
    req: Request,
    res: Response
  ) {
    try {
      const snapshotWhere =
        await getLatestSnapshotWhere();

      const clients =
        await prisma.ticket.groupBy(
          {
            by: [
              "client",
            ],

            where: snapshotWhere,

            _count: {
              id: true,
            },

            orderBy: {
              _count: {
                id: "desc",
              },
            },
          }
        );

      const result =
        clients.map(
          (item) => ({
            client:
              item.client ??
              "Sem cliente",

            total:
              item._count.id,
          })
        );

      return res.json(
        result
      );
    } catch (error) {
      console.error(
        "Erro ao buscar tickets por cliente:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Não foi possível gerar os indicadores por cliente.",
        });
    }
  }

  /* =========================================================
     TENDÊNCIA
  ========================================================= */

  async trends(
    req: Request,
    res: Response
  ) {
    try {
      const snapshotWhere =
        await getLatestSnapshotWhere();

      const tickets =
        await prisma.ticket.findMany(
          {
            where: snapshotWhere,

            select: {
              createdDate:
                true,
            },

            orderBy: {
              createdDate:
                "asc",
            },
          }
        );

      const grouped =
        tickets.reduce<
          Record<
            string,
            number
          >
        >(
          (
            acc,
            ticket
          ) => {
            const date =
              ticket.createdDate
                .toISOString()
                .slice(0, 10);

            acc[date] =
              (acc[date] ??
                0) + 1;

            return acc;
          },
          {}
        );

      const result =
        Object.entries(
          grouped
        ).map(
          ([
            date,
            total,
          ]) => ({
            date,
            total,
          })
        );

      return res.json(
        result
      );
    } catch (error) {
      console.error(
        "Erro ao gerar tendência:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Não foi possível gerar a tendência de tickets.",
        });
    }
  }

  /* =========================================================
     PENDÊNCIAS / PONTOS DE ATENÇÃO - PAYLOAD ENXUTO

     A tela de Pendências não precisa carregar todo o histórico de tickets.
     Restringimos no banco aos atendimentos abertos e retornamos somente
     os campos utilizados pela análise de risco.
  ========================================================= */

  async pendingTickets(
    _req: Request,
    res: Response
  ) {
    try {
      const snapshotWhere = await getLatestSnapshotWhere();
      const tickets = await prisma.ticket.findMany({
        where: {
          ...snapshotWhere,
          baseStatus: { in: ["New", "InAttendance", "Stopped"] },
        },
        select: {
          id: true, movideskId: true, protocol: true, subject: true,
          client: true, contact: true, owner: true, ownerTeam: true,
          category: true, cause: true, urgency: true, status: true,
          baseStatus: true, justification: true, service: true,
          department: true, createdDate: true, dueDate: true,
          firstResponseDueDate: true, firstResponseDate: true,
          resolvedDate: true, closedDate: true, lifetimeMinutes: true,
          stoppedMinutes: true, taskNumber: true, taskStatus: true,
          deliveredVersion: true,
        },
        orderBy: { createdDate: "asc" },
      });

      const taskNumbers = Array.from(new Set(
        tickets.map((ticket) => ticket.taskNumber)
          .filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0)
      ));
      const movideskIds = tickets.map((ticket) => ticket.movideskId);

      const directAzure = taskNumbers.length || movideskIds.length
        ? await prisma.azureWorkItem.findMany({
            where: {
              OR: [
                ...(taskNumbers.length ? [{ id: { in: taskNumbers } }] : []),
                ...(movideskIds.length ? [{ movideskTicket: { in: movideskIds } }] : []),
              ],
            },
            select: {
              id: true, workItemType: true, title: true, state: true,
              assignedToName: true, client: true, criticality: true,
              module: true, process: true, movideskTicket: true,
              deliveredVersion: true, prioritized: true, blockedProcess: true,
              azureChangedAt: true, stateChangedAt: true, syncedAt: true,
            },
          })
        : [];

      const byId = new Map(directAzure.map((item) => [item.id, item]));
      const byMovidesk = new Map<number, (typeof directAzure)[number]>();
      directAzure.forEach((item) => {
        if (item.movideskTicket) byMovidesk.set(item.movideskTicket, item);
      });

      return res.json(tickets.map((ticket) => ({
        ...ticket,
        team: ticket.ownerTeam,
        azureWorkItem:
          (ticket.taskNumber ? byId.get(ticket.taskNumber) : null) ??
          byMovidesk.get(ticket.movideskId) ??
          null,
      })));
    } catch (error) {
      console.error("Erro ao buscar pendências:", error);
      return res.status(500).json({ error: "Não foi possível buscar as pendências." });
    }
  }

  /* =========================================================
     TODOS OS TICKETS

     id         = ID técnico do PostgreSQL
     movideskId = número real do chamado
  ========================================================= */

  async tickets(
    req: Request,
    res: Response
  ) {
    try {
      const snapshotWhere =
        await getLatestSnapshotWhere();

      const tickets =
        await prisma.ticket.findMany(
          {
            where: snapshotWhere,

            /* O payload completo é carregado somente no detalhe. */
            select: {
              id: true, movideskId: true, protocol: true, subject: true,
              category: true, cause: true, urgency: true, status: true,
              baseStatus: true, justification: true, client: true,
              contact: true, owner: true, ownerTeam: true, service: true,
              department: true, serviceFirstLevel: true,
              serviceSecondLevel: true, serviceThirdLevel: true,
              businessArea: true, createdDate: true, dueDate: true,
              firstResponseDueDate: true, firstResponseDate: true,
              resolvedDate: true, closedDate: true, canceledDate: true,
              reopenedDate: true, lastActionDate: true, lastUpdate: true,
              actionCount: true, resolvedInFirstCall: true,
              solutionSlaIndicator: true, responseSlaIndicator: true,
              lifetimeMinutes: true, stoppedMinutes: true, taskNumber: true,
              taskStatus: true, taskTitle: true, taskType: true, taskUrl: true,
              registeredVersion: true, deliveredVersion: true,
              importSource: true, importedAt: true, importBatch: true,
            },

            orderBy: {
              createdDate:
                "desc",
            },
          }
        );

      /*
       * A relação canônica entre atendimento e Azure é:
       * Ticket.taskNumber === AzureWorkItem.id
       *
       * Carregamos todos os Work Items relacionados em uma única
       * consulta para evitar N+1 no frontend e no backend.
       */
      const taskNumbers =
        Array.from(
          new Set(
            tickets
              .map(
                (ticket) =>
                  ticket.taskNumber
              )
              .filter(
                (
                  taskNumber
                ): taskNumber is number =>
                  typeof taskNumber ===
                    "number" &&
                  Number.isInteger(
                    taskNumber
                  ) &&
                  taskNumber >
                    0
              )
          )
        );

      const ticketMovideskIds = tickets.map((ticket) => ticket.movideskId);
      const azureWorkItems =
        taskNumbers.length > 0 || ticketMovideskIds.length > 0
          ? await prisma.azureWorkItem.findMany({
              where: {
                OR: [
                  ...(taskNumbers.length ? [{ id: { in: taskNumbers } }] : []),
                  ...(ticketMovideskIds.length ? [{ movideskTicket: { in: ticketMovideskIds } }] : []),
                  { participantMovideskTickets: { not: null } },
                ],
              },
              select: {
                id:
                  true,
                workItemType:
                  true,
                title:
                  true,
                state:
                  true,
                assignedToName:
                  true,
                client:
                  true,
                participantClients:
                  true,
                criticality:
                  true,
                module:
                  true,
                process:
                  true,
                movideskTicket:
                  true,
                participantMovideskTickets:
                  true,
                deliveredVersion:
                  true,
                prioritized:
                  true,
                blockedProcess:
                  true,
                azureChangedAt:
                  true,
                stateChangedAt:
                  true,
                syncedAt:
                  true,
              },
            })
          : [];

      const azureById =
        new Map(
          azureWorkItems.map(
            (workItem) => [
              workItem.id,
              workItem,
            ]
          )
        );
      const azureByMovideskId = new Map<number, (typeof azureWorkItems)[number]>();
      azureWorkItems.forEach((workItem) => {
        if (workItem.movideskTicket) azureByMovideskId.set(workItem.movideskTicket, workItem);
        (workItem.participantMovideskTickets?.match(/\d+/g) ?? []).map(Number)
          .forEach((id) => azureByMovideskId.set(id, workItem));
      });

      const result =
        tickets.map(
          (ticket) => ({
            /*
             * Nunca mais substituímos o ID técnico
             * pelo número do Movidesk.
             */

            id:
              ticket.id,

            movideskId:
              ticket.movideskId,

            protocol:
              ticket.protocol,

            /* Atendimento */

            subject:
              ticket.subject,

            category:
              ticket.category,

            cause:
              ticket.cause,

            urgency:
              ticket.urgency,

            status:
              ticket.status,

            baseStatus:
              ticket.baseStatus,

            justification:
              ticket.justification,

            /* Cliente */

            client:
              ticket.client,

            contact:
              ticket.contact,

            /* Responsável */

            owner:
              ticket.owner,

            team:
              ticket.ownerTeam,

            /* Produto / serviço */

            service:
              ticket.service,

            department:
              ticket.department,

            serviceFirstLevel:
              ticket.serviceFirstLevel,

            serviceSecondLevel:
              ticket.serviceSecondLevel,

            serviceThirdLevel:
              ticket.serviceThirdLevel,

            businessArea:
              ticket.businessArea,

            /* Datas */

            createdDate:
              ticket.createdDate,

            dueDate:
              ticket.dueDate,

            firstResponseDueDate:
              ticket.firstResponseDueDate,

            firstResponseDate:
              ticket.firstResponseDate,

            resolvedDate:
              ticket.resolvedDate,

            closedDate:
              ticket.closedDate,

            canceledDate:
              ticket.canceledDate,

            reopenedDate:
              ticket.reopenedDate,

            lastActionDate:
              ticket.lastActionDate,

            lastUpdate:
              ticket.lastUpdate,

            actionCount:
              ticket.actionCount,

            resolvedInFirstCall:
              ticket.resolvedInFirstCall,

            /* SLA oficial Movidesk */

            solutionSlaIndicator:
              ticket.solutionSlaIndicator,

            responseSlaIndicator:
              ticket.responseSlaIndicator,

            /* Tempos */

            lifetimeMinutes:
              ticket.lifetimeMinutes,

            stoppedMinutes:
              ticket.stoppedMinutes,

            /* Task */

            taskNumber:
              ticket.taskNumber,

            taskStatus:
              ticket.taskStatus,

            taskTitle:
              ticket.taskTitle,

            taskType:
              ticket.taskType,

            taskUrl:
              ticket.taskUrl,

            registeredVersion:
              ticket.registeredVersion,

            deliveredVersion:
              ticket.deliveredVersion,

            /*
             * Resumo atual da Task no Azure DevOps.
             * null = sem Task vinculada ou Task ainda não sincronizada.
             */
            azureWorkItem:
              (ticket.taskNumber ? azureById.get(ticket.taskNumber) : null) ??
              azureByMovideskId.get(ticket.movideskId) ??
              null,

            /* Importação */

            importSource:
              ticket.importSource,

            importedAt:
              ticket.importedAt,

            importBatch:
              ticket.importBatch,

          })
        );

      return res.json(
        result
      );
    } catch (error) {
      console.error(
        "Erro ao buscar tickets:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Não foi possível buscar os tickets.",
        });
    }
  }

  /**
   * Histórico pesado do Movidesk carregado sob demanda. Mantém a listagem
   * rápida e entrega ações, trocas de responsável e satisfação no drawer.
   */
  async ticketAnalytics(
    req: Request,
    res: Response
  ) {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Atendimento inválido." });
      }

      const ticket = await prisma.ticket.findFirst({
        where: {
          ...(await getLatestSnapshotWhere()),
          id,
        },
        select: {
          rawData: true,
        },
      });

      if (!ticket) {
        return res.status(404).json({ error: "Atendimento não encontrado." });
      }

      return res.json(analyzeMovideskPayload(ticket.rawData));
    } catch (error) {
      console.error("Erro ao buscar histórico do atendimento:", error);
      return res.status(500).json({
        error: "Não foi possível carregar o histórico do atendimento.",
      });
    }
  }
}

type SnapshotWhere =
  Prisma.TicketWhereInput;

/**
 * Snapshot operacional = tickets vistos na última importação completa
 * e bem-sucedida do Movidesk. O histórico permanece preservado.
 */
async function getLatestSnapshotWhere(): Promise<SnapshotWhere> {
  /*
   * Cada número do Movidesk é único no banco. Excel, JSON e API apenas
   * atualizam o mesmo registro; portanto, a visão operacional não deve
   * depender do último arquivo importado. Isso permite importar lotes
   * JSON complementares sem ocultar tickets de lotes anteriores.
   */
  return {
    ...ticketOperationalScope(),
    isDeleted: false,
  };
}

type DashboardPeriod = {
  start: Date;
  end: Date;
};

/**
 * Obtém o período solicitado pelo frontend.
 *
 * Formatos aceitos:
 * - ?month=2026-08
 * - ?startDate=2026-08-01&endDate=2026-08-31
 *
 * O limite final é sempre exclusivo para evitar problemas
 * com horários no último dia do período.
 */
function getPeriod(
  req: Request
): DashboardPeriod | null {
  const month =
    queryString(
      req.query.month
    );

  if (
    month &&
    /^\d{4}-\d{2}$/.test(
      month
    )
  ) {
    const [
      yearText,
      monthText,
    ] =
      month.split("-");

    const year =
      Number(yearText);

    const monthIndex =
      Number(monthText) - 1;

    if (
      Number.isInteger(year) &&
      monthIndex >= 0 &&
      monthIndex <= 11
    ) {
      return {
        start:
          new Date(
            year,
            monthIndex,
            1,
            0,
            0,
            0,
            0
          ),

        end:
          new Date(
            year,
            monthIndex + 1,
            1,
            0,
            0,
            0,
            0
          ),
      };
    }
  }

  const startDate =
    queryString(
      req.query.startDate
    );

  const endDate =
    queryString(
      req.query.endDate
    );

  if (
    !startDate ||
    !endDate
  ) {
    return null;
  }

  const start =
    parseDateOnly(
      startDate
    );

  const endInclusive =
    parseDateOnly(
      endDate
    );

  if (
    !start ||
    !endInclusive
  ) {
    return null;
  }

  const end =
    new Date(
      endInclusive
    );

  end.setDate(
    end.getDate() + 1
  );

  if (
    start.getTime() >=
    end.getTime()
  ) {
    return null;
  }

  return {
    start,
    end,
  };
}

function queryString(
  value: unknown
) {
  if (
    typeof value === "string"
  ) {
    return value.trim();
  }

  if (
    Array.isArray(value) &&
    typeof value[0] ===
      "string"
  ) {
    return value[0].trim();
  }

  return null;
}

function parseDateOnly(
  value: string
) {
  const match =
    value.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!match) {
    return null;
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const date =
    new Date(
      year,
      month - 1,
      day,
      0,
      0,
      0,
      0
    );

  if (
    date.getFullYear() !==
      year ||
    date.getMonth() !==
      month - 1 ||
    date.getDate() !==
      day
  ) {
    return null;
  }

  return date;
}

/* =========================================================
   NORMALIZAÇÃO
========================================================= */

function normalize(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase();
}
