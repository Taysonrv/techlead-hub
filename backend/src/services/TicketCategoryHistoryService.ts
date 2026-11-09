import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { normalizeDomainText } from "../domain/TicketClassificationRules";

export type CategoryHistoryEvent = {
  kind: string;
  category: string;
  previousCategory: string | null;
  source: string;
  observedAt: Date;
  sourceLastUpdate: Date | null;
};
export const normalizedCategory = (value?: string | null) => normalizeDomainText(value);
export const isBugToAdequacao = (event: Pick<CategoryHistoryEvent, "kind" | "previousCategory" | "category">) =>
  event.kind === "CHANGE" && normalizedCategory(event.previousCategory) === "bug" && normalizedCategory(event.category) === "adequacao";

export type CategorySummary = {
  initialObservedCategory: string | null;
  initialObservedAt: string | null;
  initialSource: string | null;
  openingCategoryVerified: false;
  bugToAdequacaoChanges: number;
  transitions: Array<{ previousCategory: string | null; category: string; source: string; observedAt: string; sourceLastUpdate: string | null; kind: string }>;
};
export function summarizeCategoryEvents(events: CategoryHistoryEvent[]): CategorySummary {
  const sorted = [...events].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const baseline = sorted.find(e => e.kind === "BASELINE") ?? sorted[0];
  return {
    initialObservedCategory: baseline?.category || null,
    initialObservedAt: baseline?.observedAt.toISOString() || null,
    initialSource: baseline?.source || null,
    openingCategoryVerified: false,
    bugToAdequacaoChanges: sorted.filter(isBugToAdequacao).length,
    transitions: sorted.map(e => ({
      previousCategory: e.previousCategory, category: e.category, source: e.source,
      observedAt: e.observedAt.toISOString(), sourceLastUpdate: e.sourceLastUpdate?.toISOString() || null, kind: e.kind,
    })),
  };
}
type CategoryTx = Pick<Prisma.TransactionClient, "movideskCategorySnapshot">;
type ObservationInput = { ticketId: number; previousCategory?: string | null; category?: string | null; source: string; sourceLastUpdate?: Date | null };
// Call inside the SAME transaction that updates Ticket.category.
// Existing tickets without history are seeded with their last stored category, never labeled as creation-time truth.
export async function observeTicketCategory(tx: CategoryTx, input: ObservationInput) {
  const current = input.category?.trim();
  if (!current) return;
  const last = await tx.movideskCategorySnapshot.findFirst({
    where: { ticketId: input.ticketId }, orderBy: { id: "desc" },
    select: { category: true, sourceLastUpdate: true },
  });
  // Ignore stale imports as evidence. The ticket importer also preserves category for older payloads.
  if (last?.sourceLastUpdate && input.sourceLastUpdate && input.sourceLastUpdate.getTime() < last.sourceLastUpdate.getTime()) return;
  const make = (kind: "BASELINE" | "CHANGE", category: string, previousCategory: string | null, source: string, lastUpdate: Date | null) => ({
    ticketId: input.ticketId, kind, category, previousCategory, source, sourceLastUpdate: lastUpdate,
    sequenceKey: crypto.createHash("sha256").update([kind, input.ticketId, source, category, previousCategory ?? "", lastUpdate?.toISOString() ?? ""].join("|")).digest("hex"),
  });
  if (!last) {
    const legacy = input.previousCategory?.trim();
    if (legacy) {
      await tx.movideskCategorySnapshot.create({ data: make("BASELINE", legacy, null, "HUB_LEGACY", null) });
      if (normalizedCategory(legacy) === normalizedCategory(current)) return;
      await tx.movideskCategorySnapshot.create({ data: make("CHANGE", current, legacy, input.source, input.sourceLastUpdate ?? null) });
      return;
    }
    await tx.movideskCategorySnapshot.create({ data: make("BASELINE", current, null, input.source, input.sourceLastUpdate ?? null) });
    return;
  }
  if (normalizedCategory(last.category) === normalizedCategory(current)) return;
  await tx.movideskCategorySnapshot.create({ data: make("CHANGE", current, last.category, input.source, input.sourceLastUpdate ?? null) });
}
