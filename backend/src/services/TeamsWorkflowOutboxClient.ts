import { Prisma } from "@prisma/client";

export type TeamsWorkflowOutboxRow = {
  id: string;
  eventKey: string;
  eventType: string;
  movideskId: number;
  azureWorkItemId: number | null;
  payload: Prisma.JsonValue;
  status: "PENDING" | "PROCESSING" | "SENT" | "DEAD";
  attempts: number;
  nextAttemptAt: Date;
  lockedUntil: Date | null;
  createdAt: Date;
};

type Where = Record<string, unknown>;
type Data = Record<string, unknown>;

export type TeamsWorkflowOutboxDelegate = {
  createMany(args: { data: Data[]; skipDuplicates?: boolean }): Promise<{ count: number }>;
  count(args: { where: Where }): Promise<number>;
  findFirst(args: Data): Promise<TeamsWorkflowOutboxRow | null>;
  updateMany(args: { where: Where; data: Data }): Promise<{ count: number }>;
  update(args: { where: { id: string }; data: Data }): Promise<TeamsWorkflowOutboxRow>;
};

export function teamsWorkflowOutboxDelegate(client: unknown): TeamsWorkflowOutboxDelegate {
  const value = (client as { teamsWorkflowOutbox?: TeamsWorkflowOutboxDelegate }).teamsWorkflowOutbox;
  if (!value) throw new Error("Prisma Client desatualizado: TeamsWorkflowOutbox indisponível; gere o client e reinicie o backend.");
  return value;
}
