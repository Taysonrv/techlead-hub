export type MovideskAlertTicket = {
  movideskId: number;
  subject: string;
  client?: string | null;
  createdDate: Date | string;
  urgency?: string | null;
  status: string;
  owner?: string | null;
};

type AdaptiveCardFact = { title: string; value: string };
type AdaptiveCard = {
  type: "AdaptiveCard";
  $schema: string;
  version: "1.4";
  body: Array<Record<string, unknown>>;
};

const MAX_CARD_BYTES = 256 * 1024;

function safeText(value: unknown, fallback = "Não informado"): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().slice(0, 2_000);
}

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function ticketUrl(baseUrl: string, movideskId: number): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error("TEAMS_TICKET_BASE_URL inválida.");
  }
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new Error("TEAMS_TICKET_BASE_URL deve ser uma URL HTTPS válida.");
  }
  if (!Number.isSafeInteger(movideskId) || movideskId <= 0) {
    throw new Error("Identificador Movidesk inválido.");
  }
  const root = base.toString().replace(/\\/+$/, "");
  return `${root}/Ticket/Edit/${movideskId}`;
}

export function buildMovideskAdaptiveCard(
  ticket: MovideskAlertTicket,
  ticketBaseUrl: string,
): AdaptiveCard {
  const url = ticketUrl(ticketBaseUrl, ticket.movideskId);
  const facts: AdaptiveCardFact[] = [
    { title: "Número", value: String(ticket.movideskId) },
    { title: "Assunto", value: safeText(ticket.subject) },
    { title: "Cliente", value: safeText(ticket.client) },
    { title: "Abertura", value: formatDate(ticket.createdDate) },
    { title: "Prioridade", value: safeText(ticket.urgency) },
    { title: "Status", value: safeText(ticket.status) },
    { title: "Responsável", value: safeText(ticket.owner) },
  ];
  const card: AdaptiveCard = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: "Novo atendimento Movidesk",
        weight: "Bolder",
        size: "Medium",
        wrap: true,
      },
      {
        type: "FactSet",
        facts: facts.map((fact) => ({
          title: fact.title,
          value: fact.value.replace(/[\\u0000-\\u001f]/g, " "),
        })),
      },
      {
        type: "ActionSet",
        actions: [
          { type: "Action.OpenUrl", title: "Abrir atendimento", url },
        ],
      },
    ],
  };
  if (Buffer.byteLength(JSON.stringify(card), "utf8") > MAX_CARD_BYTES) {
    throw new Error("Adaptive Card excede o limite de 256 KB.");
  }
  return card;
}
