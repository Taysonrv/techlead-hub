type JsonRecord = Record<string, unknown>;
type Fact = { title: string; value: string };
export type AdaptiveCard = { type: "AdaptiveCard"; $schema: string; version: "1.4"; body: JsonRecord[] };

function text(value: unknown, fallback = "Não informado"): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().replace(/[\u0000-\u001f]/g, " ").slice(0, 2000);
}

function safeUrl(raw: unknown, label: string): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    throw new Error(`${label} não é uma URL válida.`);
  }
}

function ticketUrl(ticketBaseUrl: string, ticketId: number): string {
  const base = safeUrl(ticketBaseUrl, "TEAMS_TICKET_BASE_URL");
  if (!base) throw new Error("TEAMS_TICKET_BASE_URL deve ser HTTPS.");
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) throw new Error("Ticket Movidesk inválido.");
  return `${base.replace(/\/+$/, "")}/Ticket/Edit/${ticketId}`;
}

function buildCard(title: string, facts: Fact[], actions: JsonRecord[]): AdaptiveCard {
  const card: AdaptiveCard = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      { type: "TextBlock", text: title, weight: "Bolder", size: "Medium", wrap: true },
      { type: "FactSet", facts: facts.map((fact) => ({ title: text(fact.title), value: text(fact.value) })) },
      ...(actions.length ? [{ type: "ActionSet", actions }] : []),
    ],
  };
  if (Buffer.byteLength(JSON.stringify(card), "utf8") > 256 * 1024) {
    throw new Error("Adaptive Card excede o limite de 256 KB.");
  }
  return card;
}

export function buildNewSupportTicketCard(payload: JsonRecord, ticketBaseUrl: string): AdaptiveCard {
  const id = Number(payload.movideskId);
  return buildCard("Novo atendimento SIMER", [
    { title: "Número", value: Number.isSafeInteger(id) ? String(id) : "Não informado" },
    { title: "Assunto", value: text(payload.subject) },
    { title: "Cliente", value: text(payload.client) },
    { title: "Equipe", value: text(payload.ownerTeam) },
    { title: "Responsável", value: text(payload.owner) },
    { title: "Status", value: text(payload.status) },
  ], [{ type: "Action.OpenUrl", title: "Abrir atendimento", url: ticketUrl(ticketBaseUrl, id) }]);
}

function buildTaskCard(title: string, payload: JsonRecord, ticketBaseUrl: string): AdaptiveCard {
  const workItemId = Number(payload.workItemId);
  const ticketId = Number(payload.ticketId);
  if (!Number.isSafeInteger(workItemId) || workItemId <= 0 || !Number.isSafeInteger(ticketId) || ticketId <= 0) {
    throw new Error("Task sem identificador ou atendimento Movidesk válido.");
  }
  const actions: JsonRecord[] = [];
  const azureUrl = safeUrl(payload.azureUrl, "URL do Azure DevOps");
  if (azureUrl) actions.push({ type: "Action.OpenUrl", title: "Abrir task", url: azureUrl });
  actions.push({ type: "Action.OpenUrl", title: "Abrir atendimento", url: ticketUrl(ticketBaseUrl, ticketId) });
  return buildCard(title, [
    { title: "Task", value: `#${workItemId} · ${text(payload.title)}` },
    { title: "Criada por", value: text(payload.creator) },
    { title: "Cliente", value: text(payload.client) },
    { title: "Atendimento", value: `#${ticketId}` },
    ...(title === "Task retornou para Registro" ? [{ title: "Status", value: text(payload.state, "Registro") }] : []),
  ], actions);
}

export function buildAzureTaskCreatedCard(payload: JsonRecord, ticketBaseUrl: string): AdaptiveCard {
  return buildTaskCard("Nova task do Suporte N3", payload, ticketBaseUrl);
}

export function buildAzureTaskRegistroCard(payload: JsonRecord, ticketBaseUrl: string): AdaptiveCard {
  return buildTaskCard("Task retornou para Registro", payload, ticketBaseUrl);
}
