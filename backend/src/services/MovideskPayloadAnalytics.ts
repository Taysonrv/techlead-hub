import type { Prisma } from "@prisma/client";

type JsonObject = Record<string, unknown>;

export type TicketTimelineEntry = {
  date: string;
  type: "Ação" | "Status" | "Responsável" | "Satisfação";
  title: string;
  description: string | null;
  author: string | null;
};

export type MovideskPayloadAnalytics = {
  timeline: TicketTimelineEntry[];
  ownerHandoffs: number;
  reopenCount: number;
  satisfactionScore: number | null;
  satisfactionComment: string | null;
};

export type MovideskPayloadIndicators = Omit<MovideskPayloadAnalytics, "timeline">;

function object(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function date(value: unknown): string | null {
  const valueText = text(value);
  if (!valueText) return null;
  const parsed = new Date(valueText);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function personName(value: unknown): string | null {
  const person = object(value);
  return person ? text(person.businessName) : null;
}

function items(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.map(object).filter((item): item is JsonObject => item !== null)
    : [];
}

function satisfactionValue(item: JsonObject): number | null {
  const candidates = [
    item.satisfactionSurveySmileyFacesResponse,
    item.satisfactionSurveyNetPromoterScoreResponse,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof item.satisfactionSurveyPositiveNegativeResponse === "boolean") {
    return item.satisfactionSurveyPositiveNegativeResponse ? 5 : 1;
  }
  if (typeof item.satisfactionSurveyYesOrNoResponse === "boolean") {
    return item.satisfactionSurveyYesOrNoResponse ? 5 : 1;
  }
  return null;
}

export function analyzeMovideskPayload(
  rawData: Prisma.JsonValue | null | undefined,
): MovideskPayloadAnalytics {
  const root = object(rawData);
  if (!root) {
    return {
      timeline: [],
      ownerHandoffs: 0,
      reopenCount: 0,
      satisfactionScore: null,
      satisfactionComment: null,
    };
  }

  const timeline: TicketTimelineEntry[] = [];
  for (const action of items(root.actions)) {
    const actionDate = date(action.createdDate);
    if (!actionDate || action.isDeleted === true) continue;
    timeline.push({
      date: actionDate,
      type: "Ação",
      title: text(action.status) ?? `Ação #${text(action.id) ?? "-"}`,
      description: text(action.description) ?? text(action.justification),
      author: personName(action.createdBy),
    });
  }

  const statusHistory = items(root.statusHistories);
  for (const history of statusHistory) {
    const changedDate = date(history.changedDate);
    if (!changedDate) continue;
    timeline.push({
      date: changedDate,
      type: "Status",
      title: text(history.status) ?? "Alteração de status",
      description: text(history.justification),
      author: personName(history.changedBy),
    });
  }

  const ownerHistory = items(root.ownerHistories);
  for (const history of ownerHistory) {
    const changedDate = date(history.changedDate);
    if (!changedDate) continue;
    timeline.push({
      date: changedDate,
      type: "Responsável",
      title: personName(history.owner) ?? text(history.ownerTeam) ?? "Sem responsável",
      description: null,
      author: personName(history.changedBy),
    });
  }

  const satisfaction = items(root.satisfactionSurveyResponses);
  for (const response of satisfaction) {
    const responseDate = date(response.responseDate);
    if (!responseDate) continue;
    const score = satisfactionValue(response);
    timeline.push({
      date: responseDate,
      type: "Satisfação",
      title: score === null ? "Pesquisa respondida" : `Nota ${score}`,
      description: text(response.comments),
      author: personName(response.responsedBy),
    });
  }

  const ownerNames = ownerHistory
    .map((history) => personName(history.owner) ?? text(history.ownerTeam))
    .filter((value): value is string => Boolean(value));
  const ownerHandoffs = ownerNames.reduce(
    (count, value, index) => index > 0 && value !== ownerNames[index - 1] ? count + 1 : count,
    0,
  );

  const reopenedByHistory = statusHistory.filter((history) =>
    /reabert|reopen/i.test(text(history.status) ?? ""),
  ).length;
  const reopenCount = Math.max(reopenedByHistory, root.reopenedIn ? 1 : 0);

  const scores = satisfaction
    .map(satisfactionValue)
    .filter((value): value is number => value !== null);
  const satisfactionScore = scores.length
    ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2))
    : null;
  const satisfactionComment = satisfaction
    .map((response) => text(response.comments))
    .find((value): value is string => Boolean(value)) ?? null;

  return {
    timeline: timeline.sort((left, right) => left.date.localeCompare(right.date)).slice(-250),
    ownerHandoffs,
    reopenCount,
    satisfactionScore,
    satisfactionComment,
  };
}

/**
 * Versão leve para cards e listagens. Não percorre ações nem cria/ordena a
 * linha do tempo, que pode conter centenas de entradas por atendimento.
 */
export function analyzeMovideskIndicators(
  rawData: Prisma.JsonValue | null | undefined,
): MovideskPayloadIndicators {
  const root = object(rawData);
  if (!root) {
    return {
      ownerHandoffs: 0,
      reopenCount: 0,
      satisfactionScore: null,
      satisfactionComment: null,
    };
  }

  const statusHistory = items(root.statusHistories);
  const ownerNames = items(root.ownerHistories)
    .map((history) => personName(history.owner) ?? text(history.ownerTeam))
    .filter((value): value is string => Boolean(value));
  const ownerHandoffs = ownerNames.reduce(
    (count, value, index) => index > 0 && value !== ownerNames[index - 1] ? count + 1 : count,
    0,
  );
  const reopenedByHistory = statusHistory.filter((history) =>
    /reabert|reopen/i.test(text(history.status) ?? ""),
  ).length;
  const satisfaction = items(root.satisfactionSurveyResponses);
  const scores = satisfaction
    .map(satisfactionValue)
    .filter((value): value is number => value !== null);

  return {
    ownerHandoffs,
    reopenCount: Math.max(reopenedByHistory, root.reopenedIn ? 1 : 0),
    satisfactionScore: scores.length
      ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2))
      : null,
    satisfactionComment: satisfaction
      .map((response) => text(response.comments))
      .find((value): value is string => Boolean(value)) ?? null,
  };
}
