import { prisma } from "../database/prisma";
import type { Prisma } from "@prisma/client";
import { SIMER_CLIENTS, SUPPORT_ANALYSTS, ticketOperationalScope } from "../domain/OperationalScope";
import { analyzeMovideskIndicators } from "./MovideskPayloadAnalytics";
import { SIMER_SERVICE_CATALOG, suggestSimerService, type SimerServiceCatalogItem } from "../domain/SimerServiceCatalog";
import { OPERATIONAL_AGING, hoursBefore, isOperationalTicketFinalized, isOperationalTicketOpen, isTerminalWorkItemState, normalizeOperationalText, ticketLastMovement } from "../domain/OperationalLifecycleRules";

const dataQualityCache = new Map<string, { expiresAt: number; value: unknown }>();

export type DataQualityParams = {
  type?: string | null;
  client?: string | null;
  user?: string | null;
  issue?: string | null;
  search?: string | null;
};

export class DataQualityService {
  public async analyze(params: {
    type?: string | null;
    client?: string | null;
    user?: string | null;
    issue?: string | null;
    search?: string | null;
  } = {}) {
    const multi = (value?: string | null) => (value ?? "").split("|||").map((item) => item.trim()).filter(Boolean);
    const types = multi(params.type);
    const clients = multi(params.client);
    const users = multi(params.user);
    const cacheKey = JSON.stringify(params);
    const cached = dataQualityCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (dataQualityCache.size > 40) dataQualityCache.clear();

    const [scopedTickets, allTicketLinks] = await Promise.all([
      prisma.ticket.findMany({
      where: {
        AND: [
          ticketOperationalScope(),
          ...(clients.length ? [{ client: { in: clients, mode: "insensitive" as const } }] : []),
          ...(users.length ? [{ owner: { in: users, mode: "insensitive" as const } }] : []),
        ],
      },
      select: {
        id: true, taskNumber: true, movideskId: true, subject: true,
        status: true, baseStatus: true, client: true, owner: true,
        category: true, cause: true, justification: true,
        service: true, serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true,
        deliveredVersion: true, lastActionDate: true, lastUpdate: true,
        reopenedDate: true, resolvedInFirstCall: true, rawData: true,
      },
    }),
      prisma.ticket.findMany({
        where: { taskNumber: { not: null } },
        select: { taskNumber: true },
      }),
    ]);
    const taskIds = scopedTickets.map((item) => item.taskNumber).filter((value): value is number => value !== null);
    const movideskIds = scopedTickets.map((item) => item.movideskId).filter((value): value is number => value !== null);

    if (params.issue === "__coordinationOverview") {
      const linked = taskIds.length ? await prisma.azureWorkItem.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, workItemType: true, state: true, deliveredVersion: true },
      }) : [];
      const byId = new Map(linked.map((item) => [item.id, item]));
      const normalize = normalizeOperationalText;
      // O overview histórico usava baseStatus estrito para "aberto"; preserve esse recorte aqui.
      const open = (ticket: (typeof scopedTickets)[number]) =>
        ["New", "InAttendance", "Stopped"].includes(ticket.baseStatus ?? "")
        && isOperationalTicketOpen(ticket);
      const finalized = isOperationalTicketFinalized;
      const terminal = isTerminalWorkItemState;
      const support = (type: string) => normalize(type).includes("apoio");
      const staleThreshold = hoursBefore(new Date(), OPERATIONAL_AGING.ticketStaleHours);
      const analytics = new Map(scopedTickets.map((ticket) => [ticket.id, analyzeMovideskIndicators(ticket.rawData)]));
      const awaitingReturnOverdue = scopedTickets.filter((ticket) => {
        const movement = ticket.lastActionDate ?? ticket.lastUpdate;
        return open(ticket) && (/aguardando.*retorno|retorno.*cliente/.test(normalize(ticket.status)) || /aguardando.*retorno|retorno.*cliente/.test(normalize(ticket.justification))) && Boolean(movement && movement < staleThreshold);
      }).length;
      const reopenedTickets = scopedTickets.filter((ticket) => open(ticket) && (analytics.get(ticket.id)?.reopenCount ?? 0) > 0).length;
      const excessiveOwnerHandoffs = scopedTickets.filter((ticket) => open(ticket) && (analytics.get(ticket.id)?.ownerHandoffs ?? 0) >= 3).length;
      const danglingTaskTickets = scopedTickets.filter((ticket) => ticket.taskNumber !== null && !byId.has(ticket.taskNumber)).length;
      const ticketOpenTaskFinished = scopedTickets.filter((ticket) => {
        if (!open(ticket) || !ticket.taskNumber) return false;
        const task = byId.get(ticket.taskNumber);
        return Boolean(task && !support(task.workItemType) && terminal(task.state) && task.deliveredVersion?.trim());
      }).length;
      const ticketClosedTaskOpen = scopedTickets.filter((ticket) => {
        if (!finalized(ticket) || !ticket.taskNumber) return false;
        const task = byId.get(ticket.taskNumber);
        return Boolean(task && !support(task.workItemType) && !terminal(task.state));
      }).length;
      const result = {
        summary: { awaitingReturnOverdue, reopenedTickets, excessiveOwnerHandoffs, ticketOpenTaskFinished, ticketClosedTaskOpen, danglingTaskTickets },
        samples: [],
        filters: { clients: [...SIMER_CLIENTS], users: [...SUPPORT_ANALYSTS], types: ["Correção Clientes", "Evolução", "APOIO"] },
      };
      dataQualityCache.set(cacheKey, { expiresAt: Date.now() + 120_000, value: result });
      return result;
    }

    const scope: Prisma.AzureWorkItemWhereInput = {
      AND: [
        {
          OR: [
            { createdByName: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" } },
            { assignedToName: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" } },
            { client: { in: [...SIMER_CLIENTS], mode: "insensitive" } },
            ...SIMER_CLIENTS.map((client) => ({ participantClients: { contains: client, mode: "insensitive" as const } })),
            ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
            ...(movideskIds.length ? [{ movideskTicket: { in: movideskIds } }] : []),
            { participantMovideskTickets: { not: null } },
          ],
        },
        ...(types.length ? [{ workItemType: { in: types, mode: "insensitive" as const } }] : []),
        ...(clients.length ? [{ OR: [
          { client: { in: clients, mode: "insensitive" as const } },
          ...clients.map((client) => ({ participantClients: { contains: client, mode: "insensitive" as const } })),
          ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
        ] }] : []),
        ...(users.length ? [{ OR: [
          { createdByName: { in: users, mode: "insensitive" as const } },
          { assignedToName: { in: users, mode: "insensitive" as const } },
          ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
        ] }] : []),
        ...(params.search ? [{ OR: [
          { title: { contains: params.search, mode: "insensitive" as const } },
          ...(Number.isSafeInteger(Number(params.search)) ? [{ id: Number(params.search) }] : []),
        ] }] : []),
      ],
    };

    /*
     * O vínculo pode ter sido preenchido em qualquer lado da integração:
     * AzureWorkItem.movideskTicket ou Ticket.taskNumber. Para qualidade dos
     * dados, ambos são vínculos válidos, inclusive para Correção, Evolução e APOIO.
     */
    const linkedTaskIds = [...new Set(allTicketLinks
      .map((item) => item.taskNumber)
      .filter((value): value is number => value !== null))];
    const linkedTaskIdSet = new Set(linkedTaskIds);

    /* Uma única leitura substitui cinco counts e duas listagens do mesmo escopo. */
    const linkedTaskCandidates = await prisma.azureWorkItem.findMany({
      where: { AND: [scope] },
      orderBy: [{ azureClosedAt: "desc" }, { azureChangedAt: "desc" }],
      select: {
        id: true, workItemType: true, title: true, state: true,
        createdByName: true,
        client: true, participantClients: true, assignedToName: true,
        module: true, registeredVersion: true, deliveredVersion: true,
        movideskTicket: true, participantMovideskTickets: true,
      },
    });
    const taskIdScope = new Set(taskIds);
    const movideskIdScope = new Set(movideskIds);
    const normalizeScopeValue = (value: string | null) => (value ?? "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    const belongsToOperationalScope = (item: (typeof linkedTaskCandidates)[number]) => {
      const people = [item.createdByName, item.assignedToName].map(normalizeScopeValue);
      const clients = [item.client, item.participantClients].map(normalizeScopeValue);
      return SUPPORT_ANALYSTS.some((analyst) => people.includes(normalizeScopeValue(analyst)))
        || SIMER_CLIENTS.some((client) => clients.some((value) => value.includes(normalizeScopeValue(client))))
        || taskIdScope.has(item.id)
        || Boolean(item.movideskTicket && movideskIdScope.has(item.movideskTicket))
        || (item.participantMovideskTickets?.match(/\d+/g) ?? [])
          .some((id) => movideskIdScope.has(Number(id)));
    };
    const linkedTasks = linkedTaskCandidates.filter(belongsToOperationalScope);

    const existingTaskIds = new Set(linkedTasks.map((item) => item.id));
    const danglingTickets = scopedTickets.filter((ticket) =>
      ticket.taskNumber !== null && !existingTaskIds.has(ticket.taskNumber),
    );
    const movideskLinkCounts = new Map<number, number>();
    linkedTasks.forEach((item) => {
      if (item.movideskTicket) {
        movideskLinkCounts.set(item.movideskTicket, (movideskLinkCounts.get(item.movideskTicket) ?? 0) + 1);
      }
    });
    const duplicatedIds = [...movideskLinkCounts.entries()]
      .filter(([, count]) => count > 1).map(([id]) => id);
    const withoutTicket = linkedTasks.filter((item) =>
      !item.movideskTicket && !item.participantMovideskTickets && !linkedTaskIdSet.has(item.id),
    ).length;
    const withoutClient = linkedTasks.filter((item) =>
      !/apoio/i.test(item.workItemType) && !item.client && !item.participantClients,
    ).length;
    const withoutModule = linkedTasks.filter((item) => !item.module).length;
    const withoutOwner = linkedTasks.filter((item) => !item.assignedToName).length;

    const normalizeStatus = (value: string) => normalizeOperationalText(value);
    const isTicketOpen = (ticket: { baseStatus: string | null; status: string }) =>
      isOperationalTicketOpen(ticket, { excludeNormalizedStatuses: ["aguardando validar versao"] });
    const isAwaitingReturn = (ticket: { status: string; justification?: string | null }) => {
      const status = normalizeStatus(ticket.status);
      const justification = normalizeStatus(ticket.justification ?? "");
      return /aguardando.*retorno|retorno.*cliente/.test(status)
        || /aguardando.*retorno|retorno.*cliente/.test(justification);
    };
    const isMissingClassification = (value: string | null) => {
      const normalized = normalizeStatus(value ?? "");
      return !normalized || ["nao informado", "sem causa", "sem categoria", "outros", "outro", "-"].includes(normalized);
    };
    const hasSuspiciousClassification = (ticket: { category: string | null; cause: string | null }) => {
      if (isMissingClassification(ticket.category) || isMissingClassification(ticket.cause)) return true;
      const category = normalizeStatus(ticket.category ?? "");
      const cause = normalizeStatus(ticket.cause ?? "");
      const doubtCategory = /duvida|orientacao/.test(category);
      const problemCategory = /problema|erro|incidente/.test(category);
      const doubtCause = /duvida|orientacao|treinamento/.test(cause);
      const problemCause = /bug|erro|falha|configuracao|operacional/.test(cause);
      return (doubtCategory && problemCause) || (problemCategory && doubtCause);
    };

    const isTicketFinalized = (ticket: { baseStatus: string | null; status: string }) => {
      const status = normalizeStatus(ticket.status);
      return ["Resolved", "Closed"].includes(ticket.baseStatus ?? "")
        || /conclu|fechad|encerrad|resolvid|cancelad/.test(status);
    };
    const sameClient = (left: string, right: string) => {
      const normalizedLeft = normalizeStatus(left).replace(/[^a-z0-9]+/g, " ").trim();
      const normalizedRight = normalizeStatus(right).replace(/[^a-z0-9]+/g, " ").trim();
      return normalizedLeft === normalizedRight
        || normalizedLeft.includes(normalizedRight)
        || normalizedRight.includes(normalizedLeft);
    };
    const isSupportTask = (task: { workItemType: string }) => normalizeStatus(task.workItemType).includes("apoio");
    const isCanceledTask = (state: string) => /cancelad|canceled/.test(normalizeStatus(state));
    const isTerminalTask = isTerminalWorkItemState;
    const finishedLinkedTasks = linkedTasks.filter((item) => isTerminalTask(item.state));
    const activeLinkedTasks = linkedTasks.filter((item) => !isTerminalTask(item.state));
    const completedWithoutVersionTasks = finishedLinkedTasks.filter((item) =>
      !isSupportTask(item) && !isCanceledTask(item.state) && !item.deliveredVersion?.trim(),
    );
    const normalizeVersion = (value: string | null) => normalizeStatus(value ?? "").replace(/\s+/g, "");
    const versionMismatches = linkedTasks.filter((item) =>
      !isSupportTask(item)
      && Boolean(item.registeredVersion?.trim())
      && Boolean(item.deliveredVersion?.trim())
      && normalizeVersion(item.registeredVersion) !== normalizeVersion(item.deliveredVersion),
    );

    const createLinkIndex = (items: typeof linkedTasks) => {
      const byId = new Map(items.map((item) => [item.id, item]));
      const byTicket = new Map<number, (typeof items)[number]>();
      items.forEach((item) => {
        if (item.movideskTicket) byTicket.set(item.movideskTicket, item);
        (item.participantMovideskTickets?.match(/\d+/g) ?? [])
          .forEach((id) => byTicket.set(Number(id), item));
      });
      return { byId, byTicket };
    };
    const allLinks = createLinkIndex(linkedTasks);
    const finishedLinks = createLinkIndex(finishedLinkedTasks);
    const activeLinks = createLinkIndex(activeLinkedTasks);
    const findLinkedTask = (
      ticket: (typeof scopedTickets)[number],
      index: ReturnType<typeof createLinkIndex>,
    ) => (ticket.taskNumber ? index.byId.get(ticket.taskNumber) : undefined)
      ?? index.byTicket.get(ticket.movideskId);

    const ticketsAwaitingClosure = scopedTickets.flatMap((ticket) => {
      if (!isTicketOpen(ticket)) return [];
      const task = findLinkedTask(ticket, finishedLinks);
      if (task && isSupportTask(task)) return [];
      if (!task) return [];
      // A pendência de encerramento depende da entrega oficial da Tarefa no Azure.
      // Tarefas canceladas e tickets em "Aguardando validar versão" não entram neste recorte.
      const hasDeliveredVersion = Boolean(task.deliveredVersion?.trim());
      return !isCanceledTask(task.state) && hasDeliveredVersion ? [{ ticket, task }] : [];
    });
    const ticketsFinishedWithoutDelivery = scopedTickets.flatMap((ticket) => {
      if (!isTicketOpen(ticket)) return [];
      const task = findLinkedTask(ticket, finishedLinks);
      return task && !isSupportTask(task) && !isCanceledTask(task.state) && !task.deliveredVersion?.trim()
        ? [{ ticket, task }]
        : [];
    });
    const closedTicketsWithActiveTask = scopedTickets.flatMap((ticket) => {
      if (!isTicketFinalized(ticket)) return [];
      const task = findLinkedTask(ticket, activeLinks);
      return task && !isSupportTask(task) ? [{ ticket, task }] : [];
    });
    const clientMismatches = scopedTickets.flatMap((ticket) => {
      const task = findLinkedTask(ticket, allLinks);
      if (!task || !ticket.client || isSupportTask(task)) return [];
      const taskClients = [
        ...(task.client ? [task.client] : []),
        ...(task.participantClients?.split(/[;,\r\n]+/).map((value) => value.trim()).filter(Boolean) ?? []),
      ];
      if (!taskClients.length) return [];
      return taskClients.some((taskClient) => sameClient(taskClient, ticket.client!))
        ? []
        : [{ ticket, task }];
    });
    const scopedTicketByMovidesk = new Map(scopedTickets.map((ticket) => [ticket.movideskId, ticket]));
    const supportDivergences = linkedTasks.filter((task) => {
      if (!isSupportTask(task)) return false;
      const linkedIds = [
        ...(task.movideskTicket ? [task.movideskTicket] : []),
        ...(task.participantMovideskTickets?.match(/\d+/g) ?? []).map(Number),
      ];
      if (!linkedIds.length) return false;
      return linkedIds.some((id) => {
        const ticket = scopedTicketByMovidesk.get(id);
        return !ticket || (ticket.taskNumber !== null && ticket.taskNumber !== task.id);
      });
    });

    const analyticsByTicketId = new Map(scopedTickets.map((ticket) => [
      ticket.id,
      analyzeMovideskIndicators(ticket.rawData),
    ]));
    const staleThreshold = hoursBefore(new Date(), OPERATIONAL_AGING.ticketStaleHours);
    const lastMovement = (ticket: (typeof scopedTickets)[number]) => ticketLastMovement(ticket);
    const awaitingReturnWithoutCause = scopedTickets.filter((ticket) =>
      isTicketOpen(ticket) && isAwaitingReturn(ticket) && isMissingClassification(ticket.cause),
    );
    const awaitingReturnOverdue = scopedTickets.filter((ticket) => {
      const movement = lastMovement(ticket);
      return isTicketOpen(ticket) && isAwaitingReturn(ticket)
        && Boolean(movement && movement < staleThreshold);
    });
    const reopenedTickets = scopedTickets.filter((ticket) =>
      isTicketOpen(ticket) && (analyticsByTicketId.get(ticket.id)?.reopenCount ?? 0) > 0,
    );
    const excessiveOwnerHandoffs = scopedTickets.filter((ticket) =>
      isTicketOpen(ticket) && (analyticsByTicketId.get(ticket.id)?.ownerHandoffs ?? 0) >= 3,
    );
    const lowSatisfaction = scopedTickets.filter((ticket) => {
      const score = analyticsByTicketId.get(ticket.id)?.satisfactionScore;
      return score !== null && score !== undefined && score <= 2;
    });
    const suspectedClassification = scopedTickets.filter((ticket) =>
      isTicketOpen(ticket) && hasSuspiciousClassification(ticket),
    );

    /*
     * Auditoria inicial do campo Serviço do Movidesk.
     *
     * Nesta primeira etapa não tentamos "adivinhar" automaticamente um
     * serviço específico. Identificamos classificações ausentes ou
     * excessivamente genéricas e expomos a hierarquia já sincronizada.
     * Isso cria uma base segura para, na próxima evolução, cruzar assunto,
     * categoria e catálogo oficial de serviços para sugerir o serviço correto.
     */
    const ticketServicePath = (ticket: (typeof scopedTickets)[number]) =>
      [ticket.serviceFirstLevel, ticket.serviceSecondLevel, ticket.serviceThirdLevel]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

    const hasNoService = (ticket: (typeof scopedTickets)[number]) =>
      !ticket.service?.trim() && ticketServicePath(ticket).length === 0;

    const isGenericSimerService = (ticket: (typeof scopedTickets)[number]) => {
      const path = ticketServicePath(ticket).map(normalizeStatus);
      const service = normalizeStatus(ticket.service ?? "");
      const values = [...path, service].filter(Boolean);
      if (!values.some((value) => /simer/.test(value))) return false;

      const specificValues = values.filter((value) =>
        !/^(atendimento ao cliente|siagri simer|simer|siagri)$/.test(value),
      );
      return specificValues.length === 0;
    };

    const withoutService = scopedTickets.filter((ticket) =>
      isTicketOpen(ticket) && hasNoService(ticket),
    );
    const genericSimerService = scopedTickets.filter((ticket) =>
      isTicketOpen(ticket) && !hasNoService(ticket) && isGenericSimerService(ticket),
    );

    /*
     * Catálogo vivo: usa todos os caminhos de Serviço já sincronizados do
     * Movidesk no escopo SIMER. Assim a cobertura cresce automaticamente
     * conforme a operação utiliza novos serviços, sem depender de deploy.
     */
    const dynamicServiceCatalog = new Map<string, SimerServiceCatalogItem>();
    for (const seed of SIMER_SERVICE_CATALOG) dynamicServiceCatalog.set(normalizeStatus(seed.path), seed);
    for (const ticket of scopedTickets) {
      const path = ticketServicePath(ticket).join(" » ") || ticket.service?.trim() || "";
      if (!path || !/simer/i.test(path)) continue;
      const segments = path.split("»").map((value) => value.trim()).filter(Boolean);
      const name = segments.at(-1) ?? path;
      const module = segments.find((value, index) =>
        index >= 2 && !/^(siagri simer|simer)$/i.test(value),
      ) ?? null;
      dynamicServiceCatalog.set(normalizeStatus(path), {
        id: `observed:${normalizeStatus(path)}`,
        path,
        name,
        module,
      });
    }
    const serviceCatalog = [...dynamicServiceCatalog.values()];

    const needsServiceSuggestion = params.issue === "suspectedServiceMismatch";
    const serviceSuggestionByTicketId = new Map(
      needsServiceSuggestion
        ? scopedTickets.map((ticket) => [
            ticket.id,
            suggestSimerService({
              subject: ticket.subject,
              category: ticket.category,
              cause: ticket.cause,
              currentService: ticket.service,
              serviceFirstLevel: ticket.serviceFirstLevel,
              serviceSecondLevel: ticket.serviceSecondLevel,
              serviceThirdLevel: ticket.serviceThirdLevel,
            }, serviceCatalog),
          ] as const)
        : [],
    );

    const suspectedServiceMismatch = needsServiceSuggestion
      ? scopedTickets.filter((ticket) => {
          if (!isTicketOpen(ticket)) return false;
          const suggestion = serviceSuggestionByTicketId.get(ticket.id);
          if (!suggestion || suggestion.confidence === "LOW") return false;
          const current = normalizeStatus(ticketServicePath(ticket).join(" » ") || ticket.service || "");
          const suggested = normalizeStatus(suggestion.path);
          return Boolean(current && current !== suggested && !suggested.includes(current));
        })
      : [];

    const derivedTicketIssues = ["danglingTaskTickets", "ticketOpenTaskFinished", "ticketOpenTaskWithoutDelivery", "ticketClosedTaskOpen", "clientMismatch", "supportLinkDivergence", "awaitingReturnWithoutCause", "awaitingReturnOverdue", "reopenedTickets", "excessiveOwnerHandoffs", "lowSatisfaction", "suspectedClassification", "withoutService", "genericSimerService", "suspectedServiceMismatch"];
    const matchesAzureIssue = (item: (typeof linkedTasks)[number]) => {
      if (params.issue === "duplicatedMovideskLinks") return Boolean(item.movideskTicket && duplicatedIds.includes(item.movideskTicket));
      if (params.issue === "withoutTicket") return !item.movideskTicket && !item.participantMovideskTickets && !linkedTaskIdSet.has(item.id);
      if (params.issue === "withoutClient") return !isSupportTask(item) && !item.client && !item.participantClients;
      if (params.issue === "completedWithoutVersion") return completedWithoutVersionTasks.some((task) => task.id === item.id);
      if (params.issue === "activeTaskWithVersion") return !isSupportTask(item) && !isTerminalTask(item.state) && Boolean(item.deliveredVersion);
      if (params.issue === "versionMismatch") return versionMismatches.some((task) => task.id === item.id);
      if (!params.issue) return (!item.movideskTicket && !item.participantMovideskTickets && !linkedTaskIdSet.has(item.id))
        || (!isSupportTask(item) && !item.client && !item.participantClients) || !item.module || !item.assignedToName
        || completedWithoutVersionTasks.some((task) => task.id === item.id)
        || versionMismatches.some((task) => task.id === item.id);
      return true;
    };
    const azureSamples = params.issue === "supportLinkDivergence"
      ? supportDivergences.slice(0, 100)
      : params.issue && derivedTicketIssues.includes(params.issue)
      ? []
      : linkedTasks.filter(matchesAzureIssue).slice(0, 50);

    const toTicketSample = ({ ticket, task }: { ticket: (typeof scopedTickets)[number]; task: (typeof linkedTasks)[number] }) => ({
          id: ticket.id,
          workItemType: task.workItemType,
          title: ticket.subject,
          state: ticket.status,
          client: ticket.client,
          module: null,
          assignedToName: ticket.owner,
          movideskTicket: ticket.movideskId,
          registeredVersion: task.registeredVersion,
          deliveredVersion: task.deliveredVersion,
          taskNumber: task.id,
          taskState: task.state,
          taskTitle: task.title,
          taskClient: task.client,
          source: "MOVIDESK" as const,
        });
    const toClassificationSample = (ticket: (typeof scopedTickets)[number]) => ({
      id: ticket.id,
      workItemType: "Atendimento Movidesk",
      title: ticket.subject,
      state: ticket.status,
      client: ticket.client,
      module: null,
      assignedToName: ticket.owner,
      category: ticket.category,
      cause: ticket.cause,
      service: ticket.service,
      serviceFirstLevel: ticket.serviceFirstLevel,
      serviceSecondLevel: ticket.serviceSecondLevel,
      serviceThirdLevel: ticket.serviceThirdLevel,
      servicePath: ticketServicePath(ticket).join(" » ") || ticket.service || null,
      serviceSuggestion: serviceSuggestionByTicketId.get(ticket.id) ?? null,
      movideskTicket: ticket.movideskId,
      registeredVersion: null,
      deliveredVersion: ticket.deliveredVersion,
      taskNumber: ticket.taskNumber,
      lastMovement: lastMovement(ticket),
      resolvedInFirstCall: ticket.resolvedInFirstCall,
      ...analyticsByTicketId.get(ticket.id),
      source: "MOVIDESK" as const,
    });
    const samples = params.issue === "awaitingReturnWithoutCause"
      ? awaitingReturnWithoutCause.slice(0, 100).map(toClassificationSample)
      : params.issue === "awaitingReturnOverdue"
      ? awaitingReturnOverdue.slice(0, 100).map(toClassificationSample)
      : params.issue === "reopenedTickets"
      ? reopenedTickets.slice(0, 100).map(toClassificationSample)
      : params.issue === "excessiveOwnerHandoffs"
      ? excessiveOwnerHandoffs.slice(0, 100).map(toClassificationSample)
      : params.issue === "lowSatisfaction"
      ? lowSatisfaction.slice(0, 100).map(toClassificationSample)
      : params.issue === "suspectedClassification"
      ? suspectedClassification.slice(0, 100).map(toClassificationSample)
      : params.issue === "withoutService"
      ? withoutService.slice(0, 100).map(toClassificationSample)
      : params.issue === "genericSimerService"
      ? genericSimerService.slice(0, 100).map(toClassificationSample)
      : params.issue === "suspectedServiceMismatch"
      ? suspectedServiceMismatch.slice(0, 100).map(toClassificationSample)
      : params.issue === "ticketOpenTaskFinished"
      ? ticketsAwaitingClosure.slice(0, 100).map(toTicketSample)
      : params.issue === "ticketOpenTaskWithoutDelivery"
      ? ticketsFinishedWithoutDelivery.slice(0, 100).map(toTicketSample)
      : params.issue === "ticketClosedTaskOpen"
      ? closedTicketsWithActiveTask.slice(0, 100).map(toTicketSample)
      : params.issue === "clientMismatch"
      ? clientMismatches.slice(0, 100).map(toTicketSample)
      : params.issue === "danglingTaskTickets"
      ? danglingTickets.slice(0, 50).map((ticket) => ({
          id: ticket.id,
          workItemType: "Ticket Movidesk",
          title: ticket.subject,
          state: ticket.status,
          client: ticket.client,
          module: null,
          assignedToName: ticket.owner,
          movideskTicket: ticket.movideskId,
          registeredVersion: null,
          deliveredVersion: null,
          taskNumber: ticket.taskNumber,
          source: "MOVIDESK" as const,
        }))
      : azureSamples.map((item) => ({ ...item, taskNumber: item.id, source: "AZURE" as const }));

    const result = {
      summary: {
        withoutTicket, withoutClient, withoutModule, withoutOwner,
        completedWithoutVersion: completedWithoutVersionTasks.length,
        danglingTaskTickets: danglingTickets.length,
        duplicatedMovideskLinks: duplicatedIds.length,
        ticketOpenTaskFinished: ticketsAwaitingClosure.length,
        ticketOpenTaskWithoutDelivery: ticketsFinishedWithoutDelivery.length,
        ticketClosedTaskOpen: closedTicketsWithActiveTask.length,
        clientMismatch: clientMismatches.length,
        supportLinkDivergence: supportDivergences.length,
        awaitingReturnWithoutCause: awaitingReturnWithoutCause.length,
        awaitingReturnOverdue: awaitingReturnOverdue.length,
        reopenedTickets: reopenedTickets.length,
        excessiveOwnerHandoffs: excessiveOwnerHandoffs.length,
        lowSatisfaction: lowSatisfaction.length,
        resolvedInFirstCall: scopedTickets.filter((ticket) => ticket.resolvedInFirstCall === true).length,
        notResolvedInFirstCall: scopedTickets.filter((ticket) => ticket.resolvedInFirstCall === false).length,
        suspectedClassification: suspectedClassification.length,
        withoutService: withoutService.length,
        genericSimerService: genericSimerService.length,
        suspectedServiceMismatch: needsServiceSuggestion ? suspectedServiceMismatch.length : 0,
        serviceCatalogSize: serviceCatalog.length,
        activeTaskWithVersion: activeLinkedTasks.filter((task) =>
          !isSupportTask(task) && Boolean(task.deliveredVersion?.trim()),
        ).length,
        versionMismatch: versionMismatches.length,
      },
      samples,
      filters: {
        clients: [...SIMER_CLIENTS],
        users: [...SUPPORT_ANALYSTS],
        types: ["Correção Clientes", "Evolução", "APOIO"],
      },
    };
    dataQualityCache.set(cacheKey, { expiresAt: Date.now() + 120_000, value: result });
    return result;
  }
}

function compareVersions(left: string, right: string) {
  const leftParts = left.match(/\d+/g)?.map(Number) ?? [];
  const rightParts = right.match(/\d+/g)?.map(Number) ?? [];
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.localeCompare(right, "pt-BR", { numeric: true });
}
