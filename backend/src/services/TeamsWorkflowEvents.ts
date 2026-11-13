import { Prisma } from "@prisma/client";
import { isMovideskNewTicketStatus } from "./MovideskAlertMatcher";
import { ticketOperationalScope } from "../domain/OperationalScope";
import { teamsWorkflowOutboxDelegate } from "./TeamsWorkflowOutboxClient";

export const TEAMS_WORKFLOW_EVENT = {
  SUPPORT_TICKET_NEW: "SUPPORT_TICKET_NEW",
  AZURE_TASK_CREATED: "AZURE_TASK_CREATED",
  AZURE_TASK_REGISTRO: "AZURE_TASK_REGISTRO",
} as const;

type WorkflowTransaction = Prisma.TransactionClient;
type JsonObject = Prisma.InputJsonObject;

const SUPPORT_TASK_CREATORS = new Set([
  "TAYSON ALVES DE ARAUJO",
  "TAYSON ARAUJO",
  "RENAN BRENO CARVALHO",
  "RENAN BRENO",
  "ALAN KARDEK DA SILVA BARROS NETO",
  "ALAN KARDEK",
]);

function normalizedIdentity(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR")
    : "";
}

export function isSupportN3TaskCreator(value: unknown): boolean {
  return SUPPORT_TASK_CREATORS.has(normalizedIdentity(value));
}

function workItemTicketId(workItem: Prisma.AzureWorkItemUncheckedCreateInput): number | null {
  const value = workItem.movideskTicket;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function isRegistro(value: unknown): boolean {
  return normalizedIdentity(value) === "REGISTRO";
}

function workItemPayload(workItem: Prisma.AzureWorkItemUncheckedCreateInput, linkedTicketClient: string | null): JsonObject {
  return {
    workItemId: workItem.id,
    title: typeof workItem.title === "string" ? workItem.title : `Task Azure #${workItem.id}`,
    creator: typeof workItem.createdByName === "string" ? workItem.createdByName : "Não informado",
    client: typeof workItem.client === "string" && workItem.client.trim() ? workItem.client : linkedTicketClient,
    ticketId: workItemTicketId(workItem),
    azureUrl: typeof workItem.remoteUrl === "string" ? workItem.remoteUrl : null,
    state: typeof workItem.state === "string" ? workItem.state : "Não informado",
    revision: typeof workItem.revision === "number" ? workItem.revision : null,
  };
}

async function linkedTicketClient(tx: WorkflowTransaction, ticketId: number): Promise<string | null> {
  const ticket = await tx.ticket.findUnique({ where: { movideskId: ticketId }, select: { client: true } });
  return ticket?.client ?? null;
}

export async function enqueueNewSupportTicket(
  tx: WorkflowTransaction,
  previouslyInPortfolio: boolean,
  eventWithinIncrementalWindow: boolean,
  ticket: {
    movideskId: number;
    subject: string;
    client: string | null;
    createdDate: Date;
    urgency: string | null;
    status: string;
    owner: string | null;
    ownerTeam: string | null;
  },
) {
  if (process.env.TEAMS_SUPPORT_NEW_TICKETS_ENABLED?.trim().toLowerCase() !== "true") return;
  if (!eventWithinIncrementalWindow) return;
  if (previouslyInPortfolio) return;
  if (!isMovideskNewTicketStatus(ticket.status)) return;

  const inHubPortfolio = await tx.ticket.findFirst({
    where: {
      AND: [ticketOperationalScope(), { movideskId: ticket.movideskId, status: ticket.status }],
    },
    select: { movideskId: true },
  });
  if (!inHubPortfolio) return;

  const payload: JsonObject = {
    movideskId: ticket.movideskId,
    subject: ticket.subject,
    client: ticket.client,
    createdDate: ticket.createdDate.toISOString(),
    urgency: ticket.urgency,
    status: ticket.status,
    owner: ticket.owner,
    ownerTeam: ticket.ownerTeam,
  };
  await teamsWorkflowOutboxDelegate(tx).createMany({
    data: [{
      eventKey: `support-ticket-new:${ticket.movideskId}`,
      eventType: TEAMS_WORKFLOW_EVENT.SUPPORT_TICKET_NEW,
      movideskId: ticket.movideskId,
      payload,
      updatedAt: new Date(),
    }],
    skipDuplicates: true,
  });
}

export async function enqueueCreatedSupportTask(
  tx: WorkflowTransaction,
  workItem: Prisma.AzureWorkItemUncheckedCreateInput,
) {
  if (process.env.TEAMS_AZURE_TASK_CREATED_ENABLED?.trim().toLowerCase() !== "true") return;
  const ticketId = workItemTicketId(workItem);
  if (!ticketId || !isSupportN3TaskCreator(workItem.createdByName)) return;
  const ticketClient = await linkedTicketClient(tx, ticketId);
  await teamsWorkflowOutboxDelegate(tx).createMany({
    data: [{
      eventKey: `azure-task-created:${workItem.id}`,
      eventType: TEAMS_WORKFLOW_EVENT.AZURE_TASK_CREATED,
      movideskId: ticketId,
      azureWorkItemId: workItem.id,
      payload: workItemPayload(workItem, ticketClient),
      updatedAt: new Date(),
    }],
    skipDuplicates: true,
  });
}

export async function enqueueSupportTaskReturnedToRegistro(
  tx: WorkflowTransaction,
  previousState: string,
  workItem: Prisma.AzureWorkItemUncheckedCreateInput,
) {
  if (process.env.TEAMS_AZURE_TASK_REGISTRO_ENABLED?.trim().toLowerCase() !== "true") return;
  const ticketId = workItemTicketId(workItem);
  if (!ticketId || !isSupportN3TaskCreator(workItem.createdByName) || !isRegistro(workItem.state) || isRegistro(previousState)) return;
  const ticketClient = await linkedTicketClient(tx, ticketId);
  const revision = typeof workItem.revision === "number"
    ? `r${workItem.revision}`
    : `t${workItem.azureChangedAt instanceof Date ? workItem.azureChangedAt.getTime() : Date.now()}`;
  await teamsWorkflowOutboxDelegate(tx).createMany({
    data: [{
      eventKey: `azure-task-registro:${workItem.id}:${revision}`,
      eventType: TEAMS_WORKFLOW_EVENT.AZURE_TASK_REGISTRO,
      movideskId: ticketId,
      azureWorkItemId: workItem.id,
      payload: workItemPayload(workItem, ticketClient),
      updatedAt: new Date(),
    }],
    skipDuplicates: true,
  });
}
