import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../database/prisma";


export type AzureWorkItemListParams = {
  page?: number;
  pageSize?: number;

  type?: string | null;
  state?: string | null;
  assignedTo?: string | null;
  client?: string | null;
  criticality?: string | null;
  module?: string | null;
  process?: string | null;
  deliveredVersion?: string | null;

  prioritized?: boolean | null;
  blockedProcess?: boolean | null;
  hasMovideskTicket?: boolean | null;
  hasAssignedTo?: boolean | null;
  hasDeliveredVersion?: boolean | null;

  movideskTicket?: number | null;

  search?: string | null;

  changedFrom?: Date | null;
  changedTo?: Date | null;

  sortBy?: AzureWorkItemSortField;
  sortDirection?: SortDirection;
};

export type AzureWorkItemSortField =
  | "id"
  | "title"
  | "state"
  | "workItemType"
  | "assignedToName"
  | "client"
  | "criticality"
  | "deliveredVersion"
  | "azureCreatedAt"
  | "azureChangedAt"
  | "azureClosedAt"
  | "stateChangedAt"
  | "syncedAt";

export type SortDirection =
  | "asc"
  | "desc";


export type AzureAnalystProductivityParams = {
  createdFrom?: Date | null;
  createdTo?: Date | null;
  creator?: string | null;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const CORRECTION_TYPE =
  "Correção Clientes";

const EVOLUTION_TYPE =
  "Evolução";

const SUPPORT_TYPE =
  "APOIO";

const HIGH_CRITICALITIES = [
  "Crítica",
  "Alta",
] as const;

const INVALID_VERSION_VALUES = new Set([
  "",
  "-",
  "--",
  ".",
  "..",
  "0",
]);

export class AzureWorkItemService {
  /* =======================================================
     LISTAGEM
  ======================================================= */

  public async list(
    params:
      AzureWorkItemListParams,
  ) {
    const page =
      this.normalizePage(
        params.page,
      );

    const pageSize =
      this.normalizePageSize(
        params.pageSize,
      );

    const where =
      this.buildWhere(
        params,
      );

    const orderBy =
      this.buildOrderBy(
        params.sortBy,
        params.sortDirection,
      );

    const skip =
      (page - 1) *
      pageSize;

    const [
      total,
      items,
    ] =
      await prisma.$transaction([
        prisma.azureWorkItem.count({
          where,
        }),

        prisma.azureWorkItem.findMany({
          where,
          skip,
          take:
            pageSize,
          orderBy,
          select:
            this.listSelect(),
        }),
      ]);

    const totalPages =
      total === 0
        ? 0
        : Math.ceil(
            total /
              pageSize,
          );

    return {
      page,
      pageSize,
      total,
      totalPages,
      hasPreviousPage:
        page > 1,
      hasNextPage:
        page <
        totalPages,
      items,
    };
  }

  /* =======================================================
     DETALHE SEGURO

     Não retorna rawFields/rawRelations e não devolve HTML
     bruto para o frontend. Os campos textuais do Azure são
     convertidos para texto simples antes de sair do service.
  ======================================================= */

  public async getById(
    id:
      number,
  ) {
    const workItem =
      await prisma.azureWorkItem.findUnique({
        where: {
          id,
        },
        select:
          this.detailSelect(),
      });

    if (!workItem) {
      return null;
    }

    /*
     * Correlação lógica principal:
     * Ticket.taskNumber == AzureWorkItem.id
     *
     * Correlação secundária:
     * AzureWorkItem.movideskTicket == Ticket.movideskId
     *
     * Usamos findMany porque uma Task pode, em cenários reais,
     * estar associada a mais de um atendimento.
     */
    const relatedTickets =
      await prisma.ticket.findMany({
        where: {
          OR: [
                {
                  taskNumber:
                    workItem.id,
                },
                ...(
                  workItem.movideskTicket
                    ? [
                        {
                          movideskId:
                            workItem.movideskTicket,
                        },
                      ]
                    : []
                ),
              ],
        },
        orderBy: [
          {
            createdDate:
              "desc",
          },
          {
            id:
              "desc",
          },
        ],
        select:
          this.relatedTicketSelect(),
      });

    const tickets =
      relatedTickets.map(
        (ticket) => ({
          ...ticket,
          relationType:
            this.resolveTicketRelationType(
              workItem.id,
              workItem.movideskTicket,
              ticket.taskNumber,
              ticket.movideskId,
            ),
        }),
      );

    const parent =
      workItem.parentId
        ? await prisma.azureWorkItem.findUnique({
            where: {
              id:
                workItem.parentId,
            },
            select:
              this.relationWorkItemSelect(),
          })
        : null;

    const children =
      await prisma.azureWorkItem.findMany({
        where: {
          parentId:
            workItem.id,
        },
        orderBy: [
          {
            azureChangedAt:
              "desc",
          },
          {
            id:
              "desc",
          },
        ],
        select:
          this.relationWorkItemSelect(),
      });

    return {
      ...workItem,

      descriptionText:
        this.htmlToPlainText(
          workItem.description,
        ),

      workaroundText:
        this.htmlToPlainText(
          workItem.workaround,
        ),

      technicalSolutionText:
        this.htmlToPlainText(
          workItem.technicalSolution,
        ),

      /*
       * Não expomos os campos HTML originais para evitar que
       * alguém os renderize acidentalmente com dangerouslySetInnerHTML.
       */
      description:
        undefined,
      workaround:
        undefined,
      technicalSolution:
        undefined,

      azureWebUrl:
        this.buildAzureWebUrl(
          workItem.id,
        ),

      tickets,

      /*
       * Atendimento de origem declarado no Azure.
       * Mantemos relatedTicket por compatibilidade com o frontend
       * atual, mas ele não deve ser interpretado como a origem.
       */
      originTicket:
        workItem.movideskTicket
          ? tickets.find(
              (ticket) =>
                ticket.movideskId ===
                workItem.movideskTicket,
            ) ??
            null
          : null,

      relatedTicket:
        tickets[0] ??
        null,

      relations: {
        parent,
        children,
      },
    };
  }

  /* =======================================================
     RESUMO GERENCIAL

     O resumo respeita o filtro de tipo. Não sobrescrevemos
     baseWhere ao contar Correções/Evoluções.
  ======================================================= */

  public async summary(
    type?:
      string | null,
  ) {
    const typeFilter =
      this.normalizeString(
        type,
      );

    const baseWhere:
      Prisma.AzureWorkItemWhereInput =
      {
        AND: [
          ...(typeFilter
            ? [
                {
                  workItemType: {
                    equals:
                      typeFilter,
                    mode:
                      "insensitive" as const,
                  },
                },
              ]
            : []),
        ],
      };

    const correctionWhere:
      Prisma.AzureWorkItemWhereInput = {
      AND: [
        baseWhere,
        {
          workItemType:
            CORRECTION_TYPE,
        },
      ],
    };

    const evolutionWhere:
      Prisma.AzureWorkItemWhereInput = {
      AND: [
        baseWhere,
        {
          workItemType:
            EVOLUTION_TYPE,
        },
      ],
    };

    const [
      total,
      corrections,
      evolutions,
      prioritized,
      blocked,
      withVersion,
      withMovideskTicket,
      withoutMovideskTicket,
      highOrCritical,
      unassigned,
      withoutClient,
      withoutModule,
      withoutCriticality,
    ] =
      await prisma.$transaction([
        prisma.azureWorkItem.count({
          where:
            baseWhere,
        }),

        prisma.azureWorkItem.count({
          where:
            correctionWhere,
        }),

        prisma.azureWorkItem.count({
          where:
            evolutionWhere,
        }),

        prisma.azureWorkItem.count({
          where: {
            AND: [
              baseWhere,
              {
                prioritized:
                  true,
              },
            ],
          },
        }),

        prisma.azureWorkItem.count({
          where: {
            AND: [
              baseWhere,
              {
                blockedProcess:
                  true,
              },
            ],
          },
        }),

        prisma.azureWorkItem.count({
          where: {
            AND: [
              baseWhere,
              {
                deliveredVersion: {
                  not:
                    null,
                },
              },
            ],
          },
        }),

        prisma.azureWorkItem.count({
          where: {
            AND: [
              baseWhere,
              {
                movideskTicket: {
                  not:
                    null,
                },
              },
            ],
          },
        }),

        prisma.azureWorkItem.count({
          where: {
            AND: [
              baseWhere,
              {
                movideskTicket:
                  null,
              },
            ],
          },
        }),

        prisma.azureWorkItem.count({
          where: {
            AND: [
              baseWhere,
              {
                criticality: {
                  in: [
                    ...HIGH_CRITICALITIES,
                  ],
                },
              },
            ],
          },
        }),

        prisma.azureWorkItem.count({
          where: {
            AND: [
              baseWhere,
              {
                assignedToName:
                  null,
              },
            ],
          },
        }),

        prisma.azureWorkItem.count({
          where: {
            AND: [
              baseWhere,
              {
                client:
                  null,
              },
            ],
          },
        }),

        prisma.azureWorkItem.count({
          where: {
            AND: [
              baseWhere,
              {
                module:
                  null,
              },
            ],
          },
        }),

        prisma.azureWorkItem.count({
          where: {
            AND: [
              baseWhere,
              {
                criticality:
                  null,
              },
            ],
          },
        }),
      ]);

    const criticalityGroups =
      await prisma.azureWorkItem.groupBy({
        by: [
          "criticality",
        ],
        where:
          baseWhere,
        _count: {
          id:
            true,
        },
        orderBy: {
          _count: {
            id:
              "desc",
          },
        },
      });

    const stateGroups =
      await prisma.azureWorkItem.groupBy({
        by: [
          "state",
        ],
        where:
          baseWhere,
        _count: {
          id:
            true,
        },
        orderBy: {
          _count: {
            id:
              "desc",
          },
        },
      });

    return {
      type:
        typeFilter,
      total,
      corrections,
      evolutions,
      prioritized,
      blockedProcess:
        blocked,
      withVersion,
      withMovideskTicket,
      withoutMovideskTicket,
      highOrCritical,
      unassigned,

      dataQuality: {
        withoutClient,
        withoutModule,
        withoutCriticality,
        withoutAssignedTo:
          unassigned,
        withoutMovideskTicket,
      },

      byCriticality:
        criticalityGroups.map(
          (item) => ({
            criticality:
              item.criticality,
            total:
              item._count.id,
          }),
        ),

      byState:
        stateGroups.map(
          (item) => ({
            state:
              item.state,
            total:
              item._count.id,
          }),
        ),
    };
  }

  /* =======================================================
     VISÃO DE VERSÕES

     Consolida os Work Items localmente sincronizados.
     Não consulta o Azure DevOps em tempo real e não considera
     "versão informada" como sinônimo de release publicada.
  ======================================================= */

  public async versionsSummary(
    params:
      AzureWorkItemListParams = {},
  ) {
    const where =
      this.buildWhere({
        ...params,

        /*
         * Estes dois filtros pertencem ao drill-down da versão.
         * A visão consolidada precisa enxergar simultaneamente
         * itens com e sem versão.
         */
        deliveredVersion:
          null,
        hasDeliveredVersion:
          null,
      });

    const items =
      await prisma.azureWorkItem.findMany({
        where,
        select: {
          id:
            true,
          workItemType:
            true,
          state:
            true,
          assignedToName:
            true,
          client:
            true,
          criticality:
            true,
          deliveredVersion:
            true,
          prioritized:
            true,
          blockedProcess:
            true,
          movideskTicket:
            true,
          azureChangedAt:
            true,
          stateChangedAt:
            true,
          syncedAt:
            true,
        },
      });

    type VersionAccumulator = {
      version:
        string | null;
      total:
        number;
      corrections:
        number;
      evolutions:
        number;
      prioritized:
        number;
      blockedProcess:
        number;
      highOrCritical:
        number;
      unassigned:
        number;
      withMovideskTicket:
        number;
      concluded:
        number;
      active:
        number;
      clients:
        Set<string>;
      states:
        Map<string, number>;
      latestChangedAt:
        Date | null;
      latestSyncedAt:
        Date | null;
    };

    const groups =
      new Map<
        string,
        VersionAccumulator
      >();

    const uniqueClients =
      new Set<string>();

    let withVersion =
      0;

    let withoutVersion =
      0;

    let corrections =
      0;

    let evolutions =
      0;

    let prioritized =
      0;

    let blockedProcess =
      0;

    let highOrCritical =
      0;

    let unassigned =
      0;

    let latestSyncedAt:
      Date | null =
      null;

    for (
      const item of items
    ) {
      const version =
        this.normalizeVersion(
          item.deliveredVersion,
        );

      const key =
        version ??
        "__SEM_VERSAO__";

      let group =
        groups.get(
          key,
        );

      if (!group) {
        group = {
          version,
          total:
            0,
          corrections:
            0,
          evolutions:
            0,
          prioritized:
            0,
          blockedProcess:
            0,
          highOrCritical:
            0,
          unassigned:
            0,
          withMovideskTicket:
            0,
          concluded:
            0,
          active:
            0,
          clients:
            new Set<string>(),
          states:
            new Map<
              string,
              number
            >(),
          latestChangedAt:
            null,
          latestSyncedAt:
            null,
        };

        groups.set(
          key,
          group,
        );
      }

      group.total +=
        1;

      if (version) {
        withVersion +=
          1;
      } else {
        withoutVersion +=
          1;
      }

      if (
        item.workItemType ===
        CORRECTION_TYPE
      ) {
        corrections +=
          1;

        group.corrections +=
          1;
      }

      if (
        item.workItemType ===
        EVOLUTION_TYPE
      ) {
        evolutions +=
          1;

        group.evolutions +=
          1;
      }

      if (
        item.prioritized ===
        true
      ) {
        prioritized +=
          1;

        group.prioritized +=
          1;
      }

      if (
        item.blockedProcess ===
        true
      ) {
        blockedProcess +=
          1;

        group.blockedProcess +=
          1;
      }

      if (
        this.isHighCriticality(
          item.criticality,
        )
      ) {
        highOrCritical +=
          1;

        group.highOrCritical +=
          1;
      }

      if (
        !item.assignedToName?.trim() &&
        !this.isTerminalState(
          item.state,
        )
      ) {
        unassigned +=
          1;

        group.unassigned +=
          1;
      }

      if (
        item.movideskTicket !==
        null
      ) {
        group.withMovideskTicket +=
          1;
      }

      if (
        this.isTerminalState(
          item.state,
        )
      ) {
        group.concluded +=
          1;
      } else {
        group.active +=
          1;
      }

      const state =
        item.state?.trim() ||
        "Sem estado";

      group.states.set(
        state,
        (
          group.states.get(
            state,
          ) ??
          0
        ) +
          1,
      );

      const client =
        item.client?.trim();

      if (client) {
        group.clients.add(
          client,
        );

        uniqueClients.add(
          client,
        );
      }

      group.latestChangedAt =
        this.latestDate(
          group.latestChangedAt,
          item.stateChangedAt ??
            item.azureChangedAt,
        );

      group.latestSyncedAt =
        this.latestDate(
          group.latestSyncedAt,
          item.syncedAt,
        );

      latestSyncedAt =
        this.latestDate(
          latestSyncedAt,
          item.syncedAt,
        );
    }

    const versions =
      Array.from(
        groups.values(),
      )
        .map(
          (group) => ({
            version:
              group.version,
            label:
              group.version ??
              "Sem versão definida",
            hasVersion:
              group.version !==
              null,
            total:
              group.total,
            corrections:
              group.corrections,
            evolutions:
              group.evolutions,
            prioritized:
              group.prioritized,
            blockedProcess:
              group.blockedProcess,
            highOrCritical:
              group.highOrCritical,
            unassigned:
              group.unassigned,
            withMovideskTicket:
              group.withMovideskTicket,
            concluded:
              group.concluded,
            active:
              group.active,
            clients:
              group.clients.size,
            byState:
              Array.from(
                group.states.entries(),
              )
                .map(
                  ([
                    state,
                    total,
                  ]) => ({
                    state,
                    total,
                  }),
                )
                .sort(
                  (
                    a,
                    b,
                  ) =>
                    b.total -
                    a.total,
                ),
            latestChangedAt:
              group.latestChangedAt,
            latestSyncedAt:
              group.latestSyncedAt,
          }),
        )
        .sort(
          (
            a,
            b,
          ) => {
            /*
             * "Sem versão" fica em evidência porque representa
             * uma lacuna de planejamento/qualidade de dados.
             */
            if (
              !a.hasVersion &&
              b.hasVersion
            ) {
              return -1;
            }

            if (
              a.hasVersion &&
              !b.hasVersion
            ) {
              return 1;
            }

            if (
              b.total !==
              a.total
            ) {
              return (
                b.total -
                a.total
              );
            }

            return a.label.localeCompare(
              b.label,
              "pt-BR",
              {
                numeric:
                  true,
              },
            );
          },
        );

    return {
      generatedAt:
        new Date(),
      latestSyncedAt,

      summary: {
        total:
          items.length,
        versions:
          versions.filter(
            (item) =>
              item.hasVersion,
          ).length,
        withVersion,
        withoutVersion,
        corrections,
        evolutions,
        prioritized,
        blockedProcess,
        highOrCritical,
        unassigned,
        clients:
          uniqueClients.size,
        coveragePercent:
          items.length >
          0
            ? Math.round(
                (
                  withVersion /
                  items.length
                ) *
                  1000,
              ) /
              10
            : 0,
      },

      items:
        versions,
    };
  }

  /* =======================================================
     PRODUTIVIDADE DOS ANALISTAS - ABERTURA DE TASKS

     Autoria:
       System.CreatedBy -> createdByName

     Resultado produtivo:
       - Correção/Evolução Concluída COM versão válida
       - APOIO Concluído

     Taxa de produtividade:
       resultados produtivos / itens com desfecho terminal

     Desfecho terminal:
       Concluído ou Cancelado.

     Work Items ainda em andamento ficam fora do denominador
     para não penalizar demandas que ainda percorrem o fluxo.
  ======================================================= */

  public async analystProductivity(
    params:
      AzureAnalystProductivityParams = {},
  ) {
    const and:
      Prisma.AzureWorkItemWhereInput[] = [
        {
          workItemType: {
            in: [
              CORRECTION_TYPE,
              EVOLUTION_TYPE,
              SUPPORT_TYPE,
            ],
          },
        },
        {
          createdByName: {
            not:
              null,
          },
        },
      ];

    if (
      params.createdFrom ||
      params.createdTo
    ) {
      const azureCreatedAt:
        Prisma.DateTimeNullableFilter =
        {};

      if (
        params.createdFrom
      ) {
        azureCreatedAt.gte =
          params.createdFrom;
      }

      if (
        params.createdTo
      ) {
        azureCreatedAt.lte =
          params.createdTo;
      }

      and.push({
        azureCreatedAt,
      });
    }

    const creator =
      this.normalizeString(
        params.creator,
      );

    if (creator) {
      and.push({
        createdByName:
          creator,
      });
    }

    const items =
      await prisma.azureWorkItem.findMany({
        where: {
          AND:
            and,
        },
        orderBy: [
          {
            azureCreatedAt:
              "desc",
          },
          {
            id:
              "desc",
          },
        ],
        select: {
          id:
            true,
          workItemType:
            true,
          title:
            true,
          state:
            true,
          reason:
            true,
          createdByName:
            true,
          createdByEmail:
            true,
          assignedToName:
            true,
          client:
            true,
          criticality:
            true,
          module:
            true,
          process:
            true,
          movideskTicket:
            true,
          deliveredVersion:
            true,
          prioritized:
            true,
          blockedProcess:
            true,
          azureCreatedAt:
            true,
          azureChangedAt:
            true,
          azureClosedAt:
            true,
          stateChangedAt:
            true,
        },
      });

    type Accumulator = {
      creator:
        string;
      creatorEmail:
        string | null;
      totalOpened:
        number;
      corrections:
        number;
      evolutions:
        number;
      supports:
        number;
      concluded:
        number;
      concludedWithVersion:
        number;
      concludedWithoutVersion:
        number;
      supportsConcluded:
        number;
      cancelled:
        number;
      inProgress:
        number;
      productiveOutcomes:
        number;
      terminalOutcomes:
        number;
      completionHours:
        number[];
      cancellationReasons:
        Map<string, number>;
      versions:
        Map<string, number>;
      items:
        Array<{
          id: number;
          workItemType: string;
          title: string;
          state: string;
          reason: string | null;
          createdByName: string | null;
          createdByEmail: string | null;
          assignedToName: string | null;
          client: string | null;
          criticality: string | null;
          module: string | null;
          process: string | null;
          movideskTicket: number | null;
          deliveredVersion: string | null;
          prioritized: boolean | null;
          blockedProcess: boolean | null;
          azureCreatedAt: Date | null;
          azureChangedAt: Date | null;
          azureClosedAt: Date | null;
          stateChangedAt: Date | null;
          outcome:
            "DELIVERED" |
            "SUPPORT_CONCLUDED" |
            "CONCLUDED_WITHOUT_VERSION" |
            "CANCELLED" |
            "IN_PROGRESS";
        }>;
    };

    const grouped =
      new Map<
        string,
        Accumulator
      >();

    for (
      const item of items
    ) {
      const creatorName =
        item.createdByName?.trim();

      if (!creatorName) {
        continue;
      }

      const key =
        this.normalizeComparable(
          creatorName,
        );

      let metric =
        grouped.get(
          key,
        );

      if (!metric) {
        metric = {
          creator:
            creatorName,
          creatorEmail:
            item.createdByEmail,
          totalOpened:
            0,
          corrections:
            0,
          evolutions:
            0,
          supports:
            0,
          concluded:
            0,
          concludedWithVersion:
            0,
          concludedWithoutVersion:
            0,
          supportsConcluded:
            0,
          cancelled:
            0,
          inProgress:
            0,
          productiveOutcomes:
            0,
          terminalOutcomes:
            0,
          completionHours:
            [],
          cancellationReasons:
            new Map<
              string,
              number
            >(),
          versions:
            new Map<
              string,
              number
            >(),
          items:
            [],
        };

        grouped.set(
          key,
          metric,
        );
      }

      metric.totalOpened +=
        1;

      if (
        item.workItemType ===
        CORRECTION_TYPE
      ) {
        metric.corrections +=
          1;
      }

      if (
        item.workItemType ===
        EVOLUTION_TYPE
      ) {
        metric.evolutions +=
          1;
      }

      if (
        item.workItemType ===
        SUPPORT_TYPE
      ) {
        metric.supports +=
          1;
      }

      const state =
        this.normalizeComparable(
          item.state,
        );

      const isConcluded =
        state ===
        "concluido";

      const isCancelled =
        state ===
        "cancelado";

      const version =
        this.normalizeVersion(
          item.deliveredVersion,
        );

      let outcome:
        "DELIVERED" |
        "SUPPORT_CONCLUDED" |
        "CONCLUDED_WITHOUT_VERSION" |
        "CANCELLED" |
        "IN_PROGRESS";

      if (isCancelled) {
        outcome =
          "CANCELLED";

        metric.cancelled +=
          1;

        metric.terminalOutcomes +=
          1;

        const cancellationReason =
          item.reason?.trim() ||
          "Sem motivo informado";

        metric.cancellationReasons.set(
          cancellationReason,
          (
            metric.cancellationReasons.get(
              cancellationReason,
            ) ??
            0
          ) +
            1,
        );
      } else if (
        isConcluded &&
        item.workItemType ===
        SUPPORT_TYPE
      ) {
        outcome =
          "SUPPORT_CONCLUDED";

        metric.concluded +=
          1;

        metric.supportsConcluded +=
          1;

        metric.productiveOutcomes +=
          1;

        metric.terminalOutcomes +=
          1;
      } else if (
        isConcluded &&
        version
      ) {
        outcome =
          "DELIVERED";

        metric.concluded +=
          1;

        metric.concludedWithVersion +=
          1;

        metric.productiveOutcomes +=
          1;

        metric.terminalOutcomes +=
          1;

        metric.versions.set(
          version,
          (
            metric.versions.get(
              version,
            ) ??
            0
          ) +
            1,
        );
      } else if (
        isConcluded
      ) {
        outcome =
          "CONCLUDED_WITHOUT_VERSION";

        metric.concluded +=
          1;

        metric.concludedWithoutVersion +=
          1;

        metric.terminalOutcomes +=
          1;
      } else {
        outcome =
          "IN_PROGRESS";

        metric.inProgress +=
          1;
      }

      if (
        isConcluded &&
        item.azureCreatedAt &&
        item.azureClosedAt &&
        item.azureClosedAt.getTime() >=
          item.azureCreatedAt.getTime()
      ) {
        metric.completionHours.push(
          (
            item.azureClosedAt.getTime() -
            item.azureCreatedAt.getTime()
          ) /
            3_600_000,
        );
      }

      metric.items.push({
        ...item,
        deliveredVersion:
          version,
        outcome,
      });
    }

    const analysts =
      Array.from(
        grouped.values(),
      )
        .map(
          (metric) => {
            const productivityRate =
              metric.terminalOutcomes >
              0
                ? this.roundPercent(
                    metric.productiveOutcomes,
                    metric.terminalOutcomes,
                  )
                : null;

            const cancellationRate =
              metric.terminalOutcomes >
              0
                ? this.roundPercent(
                    metric.cancelled,
                    metric.terminalOutcomes,
                  )
                : null;

            const deliveryConversionRate =
              (
                metric.concludedWithVersion +
                metric.cancelled +
                metric.concludedWithoutVersion
              ) >
              0
                ? this.roundPercent(
                    metric.concludedWithVersion,
                    metric.concludedWithVersion +
                      metric.cancelled +
                      metric.concludedWithoutVersion,
                  )
                : null;

            const averageCompletionHours =
              metric.completionHours.length >
              0
                ? Math.round(
                    (
                      metric.completionHours.reduce(
                        (
                          total,
                          value,
                        ) =>
                          total +
                          value,
                        0,
                      ) /
                      metric.completionHours.length
                    ) *
                      10,
                  ) /
                  10
                : null;

            return {
              creator:
                metric.creator,
              creatorEmail:
                metric.creatorEmail,
              totalOpened:
                metric.totalOpened,
              corrections:
                metric.corrections,
              evolutions:
                metric.evolutions,
              supports:
                metric.supports,
              concluded:
                metric.concluded,
              concludedWithVersion:
                metric.concludedWithVersion,
              concludedWithoutVersion:
                metric.concludedWithoutVersion,
              supportsConcluded:
                metric.supportsConcluded,
              cancelled:
                metric.cancelled,
              inProgress:
                metric.inProgress,
              productiveOutcomes:
                metric.productiveOutcomes,
              terminalOutcomes:
                metric.terminalOutcomes,
              productivityRate,
              cancellationRate,
              deliveryConversionRate,
              averageCompletionHours,

              cancellationReasons:
                Array.from(
                  metric.cancellationReasons.entries(),
                )
                  .map(
                    ([
                      reason,
                      total,
                    ]) => ({
                      reason,
                      total,
                    }),
                  )
                  .sort(
                    (
                      a,
                      b,
                    ) =>
                      b.total -
                      a.total,
                  ),

              versions:
                Array.from(
                  metric.versions.entries(),
                )
                  .map(
                    ([
                      version,
                      total,
                    ]) => ({
                      version,
                      total,
                    }),
                  )
                  .sort(
                    (
                      a,
                      b,
                    ) =>
                      b.total -
                      a.total,
                  ),

              items:
                metric.items,
            };
          },
        )
        .sort(
          (
            a,
            b,
          ) => {
            const rateA =
              a.productivityRate ??
              -1;

            const rateB =
              b.productivityRate ??
              -1;

            if (
              rateB !==
              rateA
            ) {
              return (
                rateB -
                rateA
              );
            }

            return (
              b.totalOpened -
              a.totalOpened
            );
          },
        );

    const totalOpened =
      analysts.reduce(
        (
          total,
          analyst,
        ) =>
          total +
          analyst.totalOpened,
        0,
      );

    const productiveOutcomes =
      analysts.reduce(
        (
          total,
          analyst,
        ) =>
          total +
          analyst.productiveOutcomes,
        0,
      );

    const terminalOutcomes =
      analysts.reduce(
        (
          total,
          analyst,
        ) =>
          total +
          analyst.terminalOutcomes,
        0,
      );

    const cancelled =
      analysts.reduce(
        (
          total,
          analyst,
        ) =>
          total +
          analyst.cancelled,
        0,
      );

    return {
      generatedAt:
        new Date(),

      definition: {
        authorField:
          "System.CreatedBy",
        productivity:
          "Correções/Evoluções concluídas com versão válida + APOIOs concluídos, dividido pelos Work Items com desfecho terminal (Concluído ou Cancelado). Itens em andamento não entram no denominador.",
        periodField:
          "System.CreatedDate",
      },

      summary: {
        analysts:
          analysts.length,
        totalOpened,
        corrections:
          analysts.reduce(
            (
              total,
              item,
            ) =>
              total +
              item.corrections,
            0,
          ),
        evolutions:
          analysts.reduce(
            (
              total,
              item,
            ) =>
              total +
              item.evolutions,
            0,
          ),
        supports:
          analysts.reduce(
            (
              total,
              item,
            ) =>
              total +
              item.supports,
            0,
          ),
        concludedWithVersion:
          analysts.reduce(
            (
              total,
              item,
            ) =>
              total +
              item.concludedWithVersion,
            0,
          ),
        supportsConcluded:
          analysts.reduce(
            (
              total,
              item,
            ) =>
              total +
              item.supportsConcluded,
            0,
          ),
        concludedWithoutVersion:
          analysts.reduce(
            (
              total,
              item,
            ) =>
              total +
              item.concludedWithoutVersion,
            0,
          ),
        cancelled,
        inProgress:
          analysts.reduce(
            (
              total,
              item,
            ) =>
              total +
              item.inProgress,
            0,
          ),
        productiveOutcomes,
        terminalOutcomes,
        productivityRate:
          terminalOutcomes >
          0
            ? this.roundPercent(
                productiveOutcomes,
                terminalOutcomes,
              )
            : null,
        cancellationRate:
          terminalOutcomes >
          0
            ? this.roundPercent(
                cancelled,
                terminalOutcomes,
              )
            : null,
      },

      analysts,
    };
  }

  /* =======================================================
     FILTROS
  ======================================================= */

  public async filters(
    type?:
      string | null,
  ) {
    const normalizedType =
      this.normalizeString(
        type,
      );

    const where:
      Prisma.AzureWorkItemWhereInput =
      {
        AND: [
          ...(normalizedType
            ? [
                {
                  workItemType:
                    normalizedType,
                },
              ]
            : []),
        ],
      };

    const [
      types,
      states,
      assignedTo,
      clients,
      criticalities,
      modules,
      processes,
      versions,
    ] =
      await Promise.all([
        prisma.azureWorkItem.findMany({
          where,
          distinct: [
            "workItemType",
          ],
          select: {
            workItemType:
              true,
          },
          orderBy: {
            workItemType:
              "asc",
          },
        }),

        prisma.azureWorkItem.findMany({
          where,
          distinct: [
            "state",
          ],
          select: {
            state:
              true,
          },
          orderBy: {
            state:
              "asc",
          },
        }),

        prisma.azureWorkItem.findMany({
          where: {
            AND: [
              where,
              {
                assignedToName: {
                  not:
                    null,
                },
              },
            ],
          },
          distinct: [
            "assignedToName",
          ],
          select: {
            assignedToName:
              true,
          },
          orderBy: {
            assignedToName:
              "asc",
          },
        }),

        prisma.azureWorkItem.findMany({
          where: {
            AND: [
              where,
              {
                client: {
                  not:
                    null,
                },
              },
            ],
          },
          distinct: [
            "client",
          ],
          select: {
            client:
              true,
          },
          orderBy: {
            client:
              "asc",
          },
        }),

        prisma.azureWorkItem.findMany({
          where: {
            AND: [
              where,
              {
                criticality: {
                  not:
                    null,
                },
              },
            ],
          },
          distinct: [
            "criticality",
          ],
          select: {
            criticality:
              true,
          },
          orderBy: {
            criticality:
              "asc",
          },
        }),

        prisma.azureWorkItem.findMany({
          where: {
            AND: [
              where,
              {
                module: {
                  not:
                    null,
                },
              },
            ],
          },
          distinct: [
            "module",
          ],
          select: {
            module:
              true,
          },
          orderBy: {
            module:
              "asc",
          },
        }),

        prisma.azureWorkItem.findMany({
          where: {
            AND: [
              where,
              {
                process: {
                  not:
                    null,
                },
              },
            ],
          },
          distinct: [
            "process",
          ],
          select: {
            process:
              true,
          },
          orderBy: {
            process:
              "asc",
          },
        }),

        prisma.azureWorkItem.findMany({
          where: {
            AND: [
              where,
              {
                deliveredVersion: {
                  not:
                    null,
                },
              },
            ],
          },
          distinct: [
            "deliveredVersion",
          ],
          select: {
            deliveredVersion:
              true,
          },
          orderBy: {
            deliveredVersion:
              "asc",
          },
        }),
      ]);

    return {
      types:
        types
          .map(
            (item) =>
              item.workItemType,
          )
          .filter(Boolean),

      states:
        states
          .map(
            (item) =>
              item.state,
          )
          .filter(Boolean),

      assignedTo:
        assignedTo
          .map(
            (item) =>
              item.assignedToName,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          ),

      clients:
        clients
          .map(
            (item) =>
              item.client,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          ),

      criticalities:
        criticalities
          .map(
            (item) =>
              item.criticality,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          ),

      modules:
        modules
          .map(
            (item) =>
              item.module,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          ),

      processes:
        processes
          .map(
            (item) =>
              item.process,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          ),

      versions:
        versions
          .map(
            (item) =>
              item.deliveredVersion,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          )
          .map(
            (value) =>
              value.trim(),
          )
          .filter(
            (value) =>
              !INVALID_VERSION_VALUES.has(
                value,
              ),
          ),
    };
  }

  /* =======================================================
     WHERE
  ======================================================= */

  private buildWhere(
    params:
      AzureWorkItemListParams,
  ): Prisma.AzureWorkItemWhereInput {
    const and:
      Prisma.AzureWorkItemWhereInput[] =
      [];

    const type =
      this.normalizeString(
        params.type,
      );

    const state =
      this.normalizeString(
        params.state,
      );

    const assignedTo =
      this.normalizeString(
        params.assignedTo,
      );

    const client =
      this.normalizeString(
        params.client,
      );

    const criticality =
      this.normalizeString(
        params.criticality,
      );

    const module =
      this.normalizeString(
        params.module,
      );

    const process =
      this.normalizeString(
        params.process,
      );

    const deliveredVersion =
      this.normalizeString(
        params.deliveredVersion,
      );

    if (type) {
      and.push({
        workItemType: {
          equals:
            type,
          mode:
            "insensitive",
        },
      });
    }

    if (state) {
      and.push({
        state,
      });
    }

    if (assignedTo) {
      and.push({
        assignedToName:
          assignedTo,
      });
    }

    if (client) {
      and.push({
        client,
      });
    }

    if (criticality) {
      and.push({
        criticality,
      });
    }

    if (module) {
      and.push({
        module,
      });
    }

    if (process) {
      and.push({
        process,
      });
    }

    if (deliveredVersion) {
      and.push({
        deliveredVersion,
      });
    }

    if (
      params.prioritized !==
        undefined &&
      params.prioritized !==
        null
    ) {
      and.push({
        prioritized:
          params.prioritized,
      });
    }

    if (
      params.blockedProcess !==
        undefined &&
      params.blockedProcess !==
        null
    ) {
      and.push({
        blockedProcess:
          params.blockedProcess,
      });
    }

    if (
      params.hasMovideskTicket !==
        undefined &&
      params.hasMovideskTicket !==
        null
    ) {
      and.push({
        movideskTicket:
          params.hasMovideskTicket
            ? {
                not:
                  null,
              }
            : null,
      });
    }

    if (
      params.hasAssignedTo !==
        undefined &&
      params.hasAssignedTo !==
        null
    ) {
      and.push({
        assignedToName:
          params.hasAssignedTo
            ? {
                not:
                  null,
              }
            : null,
      });
    }

    if (
      params.hasDeliveredVersion !==
        undefined &&
      params.hasDeliveredVersion !==
        null
    ) {
      if (
        params.hasDeliveredVersion
      ) {
        and.push({
          deliveredVersion: {
            not:
              null,
            notIn: [
              ...INVALID_VERSION_VALUES,
            ],
          },
        });
      } else {
        and.push({
          OR: [
            {
              deliveredVersion:
                null,
            },
            {
              deliveredVersion: {
                in: [
                  ...INVALID_VERSION_VALUES,
                ],
              },
            },
          ],
        });
      }
    }

    if (
      params.movideskTicket !==
        undefined &&
      params.movideskTicket !==
        null
    ) {
      and.push({
        movideskTicket:
          params.movideskTicket,
      });
    }

    if (
      params.changedFrom ||
      params.changedTo
    ) {
      const azureChangedAt:
        Prisma.DateTimeNullableFilter =
        {};

      if (
        params.changedFrom
      ) {
        azureChangedAt.gte =
          params.changedFrom;
      }

      if (
        params.changedTo
      ) {
        azureChangedAt.lte =
          params.changedTo;
      }

      and.push({
        azureChangedAt,
      });
    }

    const search =
      this.normalizeString(
        params.search,
      );

    if (search) {
      const numericSearch =
        /^\d+$/.test(
          search,
        )
          ? Number(
              search,
            )
          : null;

      and.push({
        OR: [
          {
            title: {
              contains:
                search,
              mode:
                "insensitive",
            },
          },
          {
            client: {
              contains:
                search,
              mode:
                "insensitive",
            },
          },
          {
            assignedToName: {
              contains:
                search,
              mode:
                "insensitive",
            },
          },
          {
            module: {
              contains:
                search,
              mode:
                "insensitive",
            },
          },
          {
            process: {
              contains:
                search,
              mode:
                "insensitive",
            },
          },
          {
            deliveredVersion: {
              contains:
                search,
              mode:
                "insensitive",
            },
          },
          ...(
            numericSearch !== null &&
            Number.isSafeInteger(
              numericSearch,
            )
              ? [
                  {
                    id:
                      numericSearch,
                  },
                  {
                    movideskTicket:
                      numericSearch,
                  },
                ]
              : []
          ),
        ],
      });
    }

    return and.length > 0
      ? {
          AND:
            and,
        }
      : {};
  }

  /* =======================================================
     ORDENAÇÃO
  ======================================================= */

  private buildOrderBy(
    sortBy:
      AzureWorkItemSortField |
      undefined,
    sortDirection:
      SortDirection |
      undefined,
  ):
    Prisma.AzureWorkItemOrderByWithRelationInput[] {
    const allowedFields:
      AzureWorkItemSortField[] = [
        "id",
        "title",
        "state",
        "workItemType",
        "assignedToName",
        "client",
        "criticality",
        "deliveredVersion",
        "azureCreatedAt",
        "azureChangedAt",
        "azureClosedAt",
        "stateChangedAt",
        "syncedAt",
      ];

    const field =
      sortBy &&
      allowedFields.includes(
        sortBy,
      )
        ? sortBy
        : "azureChangedAt";

    const direction:
      SortDirection =
      sortDirection ===
        "asc"
        ? "asc"
        : "desc";

    return [
      {
        [field]:
          direction,
      },
      {
        id:
          "desc",
      },
    ];
  }

  /* =======================================================
     SELECT DA LISTAGEM
  ======================================================= */

  private listSelect():
    Prisma.AzureWorkItemSelect {
    return {
      id:
        true,
      revision:
        true,
      workItemType:
        true,
      title:
        true,
      state:
        true,
      reason:
        true,
      assignedToName:
        true,
      client:
        true,
      criticality:
        true,
      module:
        true,
      process:
        true,
      movideskTicket:
        true,
      deliveredVersion:
        true,
      prioritized:
        true,
      blockedProcess:
        true,
      parentId:
        true,
      azureCreatedAt:
        true,
      azureChangedAt:
        true,
      azureClosedAt:
        true,
      stateChangedAt:
        true,
      remoteUrl:
        true,
      syncedAt:
        true,
    };
  }

  /* =======================================================
     SELECT DO DETALHE
  ======================================================= */

  private detailSelect():
    Prisma.AzureWorkItemSelect {
    return {
      id:
        true,
      revision:
        true,
      workItemType:
        true,
      title:
        true,
      state:
        true,
      reason:
        true,
      assignedToName:
        true,
      assignedToEmail:
        true,
      assignedToId:
        true,
      createdByName:
        true,
      changedByName:
        true,
      areaPath:
        true,
      iterationPath:
        true,
      nodeName:
        true,
      boardColumn:
        true,
      client:
        true,
      criticality:
        true,
      origin:
        true,
      detectedIn:
        true,
      module:
        true,
      process:
        true,
      movideskTicket:
        true,
      deliveredVersion:
        true,
      prioritized:
        true,
      blockedProcess:
        true,
      impactScale:
        true,
      defectType:
        true,
      branchType:
        true,
      correctionType:
        true,
      rdmNumber:
        true,
      slaLimit:
        true,
      parentId:
        true,
      description:
        true,
      workaround:
        true,
      technicalSolution:
        true,
      tags:
        true,
      azureCreatedAt:
        true,
      azureChangedAt:
        true,
      azureClosedAt:
        true,
      stateChangedAt:
        true,
      remoteUrl:
        true,
      syncedAt:
        true,
      syncRun: {
        select: {
          id:
            true,
          batch:
            true,
          status:
            true,
          source:
            true,
          startedAt:
            true,
          finishedAt:
            true,
        },
      },
    };
  }

  /* =======================================================
     SELECT DE ATENDIMENTOS RELACIONADOS
  ======================================================= */

  private relatedTicketSelect():
    Prisma.TicketSelect {
    return {
      id:
        true,
      movideskId:
        true,
      protocol:
        true,
      subject:
        true,
      client:
        true,
      contact:
        true,
      owner:
        true,
      ownerTeam:
        true,
      category:
        true,
      urgency:
        true,
      status:
        true,
      baseStatus:
        true,
      createdDate:
        true,
      dueDate:
        true,
      firstResponseDueDate:
        true,
      firstResponseDate:
        true,
      resolvedDate:
        true,
      closedDate:
        true,
      taskNumber:
        true,
      taskStatus:
        true,
      deliveredVersion:
        true,
      responseSlaIndicator:
        true,
      solutionSlaIndicator:
        true,
    };
  }

  /* =======================================================
     SELECT DE RELAÇÕES ENTRE WORK ITEMS
  ======================================================= */

  private relationWorkItemSelect():
    Prisma.AzureWorkItemSelect {
    return {
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
      criticality:
        true,
      module:
        true,
      process:
        true,
      movideskTicket:
        true,
      deliveredVersion:
        true,
      prioritized:
        true,
      blockedProcess:
        true,
      parentId:
        true,
      azureChangedAt:
        true,
    };
  }

  /* =======================================================
     HELPERS
  ======================================================= */

  private normalizeVersion(
    value:
      string |
      null |
      undefined,
  ): string | null {
    const normalized =
      this.normalizeString(
        value,
      );

    if (!normalized) {
      return null;
    }

    return INVALID_VERSION_VALUES.has(
      normalized,
    )
      ? null
      : normalized;
  }

  private normalizeComparable(
    value:
      string |
      null |
      undefined,
  ): string {
    return (
      value ??
      ""
    )
      .normalize(
        "NFD",
      )
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .trim()
      .toLocaleLowerCase(
        "pt-BR",
      );
  }

  private isTerminalState(
    value:
      string |
      null |
      undefined,
  ): boolean {
    const normalized =
      this.normalizeComparable(
        value,
      );

    return (
      normalized ===
        "concluido" ||
      normalized ===
        "cancelado"
    );
  }

  private isHighCriticality(
    value:
      string |
      null |
      undefined,
  ): boolean {
    const normalized =
      this.normalizeComparable(
        value,
      );

    return (
      normalized ===
        "alta" ||
      normalized ===
        "critica"
    );
  }

  private latestDate(
    current:
      Date |
      null,
    candidate:
      Date |
      null |
      undefined,
  ): Date | null {
    if (!candidate) {
      return current;
    }

    if (
      !current ||
      candidate.getTime() >
        current.getTime()
    ) {
      return candidate;
    }

    return current;
  }

  private roundPercent(
    numerator:
      number,
    denominator:
      number,
  ): number {
    if (
      denominator <=
      0
    ) {
      return 0;
    }

    return Math.round(
      (
        numerator /
        denominator
      ) *
        1000,
    ) /
      10;
  }

  private normalizePage(
    value:
      number | undefined,
  ): number {
    if (
      !value ||
      !Number.isSafeInteger(
        value,
      ) ||
      value <= 0
    ) {
      return DEFAULT_PAGE;
    }

    return value;
  }

  private normalizePageSize(
    value:
      number | undefined,
  ): number {
    if (
      !value ||
      !Number.isSafeInteger(
        value,
      ) ||
      value <= 0
    ) {
      return DEFAULT_PAGE_SIZE;
    }

    return Math.min(
      value,
      MAX_PAGE_SIZE,
    );
  }

  private normalizeString(
    value:
      string |
      null |
      undefined,
  ): string | null {
    if (
      typeof value !==
        "string"
    ) {
      return null;
    }

    const normalized =
      value.trim();

    return normalized ||
      null;
  }

  private resolveTicketRelationType(
    workItemId:
      number,
    azureMovideskTicket:
      number | null,
    ticketTaskNumber:
      number | null,
    ticketMovideskId:
      number,
  ):
    "TASK_NUMBER" |
    "MOVIDESK_ID" |
    "BOTH" {
    const byTask =
      ticketTaskNumber ===
      workItemId;

    const byMovidesk =
      azureMovideskTicket !==
        null &&
      ticketMovideskId ===
        azureMovideskTicket;

    if (
      byTask &&
      byMovidesk
    ) {
      return "BOTH";
    }

    if (byTask) {
      return "TASK_NUMBER";
    }

    return "MOVIDESK_ID";
  }

  private buildAzureWebUrl(
    id:
      number,
  ): string | null {
    const organization =
      process.env.AZURE_DEVOPS_ORGANIZATION?.trim();

    const project =
      process.env.AZURE_DEVOPS_PROJECT?.trim();

    if (
      !organization ||
      !project
    ) {
      return null;
    }

    return `https://dev.azure.com/${encodeURIComponent(
      organization,
    )}/${encodeURIComponent(
      project,
    )}/_workitems/edit/${id}/`;
  }

  private htmlToPlainText(
    value:
      string |
      null,
  ): string | null {
    if (!value) {
      return null;
    }

    const text =
      value
        .replace(
          /<\s*br\s*\/?\s*>/gi,
          "\n",
        )
        .replace(
          /<\s*\/p\s*>/gi,
          "\n",
        )
        .replace(
          /<\s*\/div\s*>/gi,
          "\n",
        )
        .replace(
          /<[^>]*>/g,
          " ",
        )
        .replace(
          /&nbsp;/gi,
          " ",
        )
        .replace(
          /&amp;/gi,
          "&",
        )
        .replace(
          /&lt;/gi,
          "<",
        )
        .replace(
          /&gt;/gi,
          ">",
        )
        .replace(
          /&quot;/gi,
          '"',
        )
        .replace(
          /&#39;|&apos;/gi,
          "'",
        )
        .replace(
          /[ \t]+/g,
          " ",
        )
        .replace(
          /\n[ \t]+/g,
          "\n",
        )
        .replace(
          /\n{3,}/g,
          "\n\n",
        )
        .trim();

    return text ||
      null;
  }
}
