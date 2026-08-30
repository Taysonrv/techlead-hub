import type {
  Request,
  Response,
} from "express";

import { prisma } from "../config/prisma";

export class DashboardController {
  /* =========================================================
     RESUMO
  ========================================================= */

  async summary(
    req: Request,
    res: Response
  ) {
    try {
      const [
        totalTickets,
        novos,
        emAtendimento,
        parados,
        resolvidos,
        fechados,
        criticos,
      ] = await Promise.all([
        prisma.ticket.count(),

        prisma.ticket.count({
          where: {
            baseStatus: "New",
          },
        }),

        prisma.ticket.count({
          where: {
            baseStatus:
              "InAttendance",
          },
        }),

        prisma.ticket.count({
          where: {
            baseStatus:
              "Stopped",
          },
        }),

        prisma.ticket.count({
          where: {
            baseStatus:
              "Resolved",
          },
        }),

        prisma.ticket.count({
          where: {
            baseStatus:
              "Closed",
          },
        }),

        prisma.ticket.count({
          where: {
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

      const abertos =
        novos +
        emAtendimento +
        parados;

      return res.json({
        totalTickets,
        abertos,
        novos,
        emAtendimento,
        parados,
        resolvidos,
        fechados,
        criticos,
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
      const categories =
        await prisma.ticket.groupBy(
          {
            by: [
              "category",
            ],

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
      const tickets =
        await prisma.ticket.findMany(
          {
            where: {
              baseStatus: {
                in: [
                  "New",
                  "InAttendance",
                  "Stopped",
                ],
              },
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
      const owners =
        await prisma.ticket.groupBy(
          {
            by: [
              "owner",
            ],

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
      const clients =
        await prisma.ticket.groupBy(
          {
            by: [
              "client",
            ],

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
      const tickets =
        await prisma.ticket.findMany(
          {
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
     TODOS OS TICKETS

     id         = ID técnico do PostgreSQL
     movideskId = número real do chamado
  ========================================================= */

  async tickets(
    req: Request,
    res: Response
  ) {
    try {
      const tickets =
        await prisma.ticket.findMany(
          {
            orderBy: {
              createdDate:
                "desc",
            },
          }
        );

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

            deliveredVersion:
              ticket.deliveredVersion,

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