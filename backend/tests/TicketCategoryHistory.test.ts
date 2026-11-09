import assert from "node:assert/strict";
import test from "node:test";
import { isBugToAdequacao, observeTicketCategory, summarizeCategoryEvents } from "../src/services/TicketCategoryHistoryService";

const t = (value: string) => new Date(value);
function fakeTx() {
  const rows: Array<{ id: number; ticketId: number; category: string; previousCategory: string | null; kind: string; source: string; observedAt: Date; sourceLastUpdate: Date | null; sequenceKey: string }> = [];
  const tx = {
    movideskCategorySnapshot: {
      findFirst: async ({ where }: { where: { ticketId: number } }) =>
        [...rows].reverse().find(row => row.ticketId === where.ticketId) ?? null,
      create: async ({ data }: { data: { ticketId: number; category: string; previousCategory: string | null; kind: string; source: string; sourceLastUpdate: Date | null; sequenceKey: string } }) => {
        if (rows.some(row => row.ticketId === data.ticketId && row.sequenceKey === data.sequenceKey)) throw new Error("duplicate history");
        const row = { ...data, id: rows.length + 1, observedAt: new Date(1700000000000 + rows.length * 1000) };
        rows.push(row);
        return row;
      },
    },
  };
  return { rows, tx: tx as unknown as Parameters<typeof observeTicketCategory>[0] };
}
test("primeira observação não confirma categoria na abertura", async () => {
  const { tx, rows } = fakeTx();
  await observeTicketCategory(tx, { ticketId: 1, category: "Adequação", source: "MOVIDESK_API", sourceLastUpdate: t("2026-11-09T14:00:00Z") });
  await observeTicketCategory(tx, { ticketId: 1, category: "Adequação", source: "MOVIDESK_API", sourceLastUpdate: t("2026-11-09T15:00:00Z") });
  assert.equal(rows.length, 1);
  const result = summarizeCategoryEvents(rows);
  assert.equal(result.initialObservedCategory, "Adequação");
  assert.equal(result.openingCategoryVerified, false);
  assert.equal(result.bugToAdequacaoChanges, 0);
});
test("Bug -> Adequação é calculado pela mudança de valores persistidos", async () => {
  const { tx, rows } = fakeTx();
  await observeTicketCategory(tx, { ticketId: 8, category: "Bug", source: "MOVIDESK_API", sourceLastUpdate: t("2026-11-09T14:00:00Z") });
  await observeTicketCategory(tx, { ticketId: 8, previousCategory: "Bug", category: "Adequação", source: "MOVIDESK_API", sourceLastUpdate: t("2026-11-09T16:00:00Z") });
  assert.equal(rows.length, 2);
  assert.equal(rows[1]?.kind, "CHANGE");
  assert.equal(rows[1]?.previousCategory, "Bug");
  assert.equal(isBugToAdequacao(rows[1]!), true);
  const result = summarizeCategoryEvents(rows);
  assert.equal(result.bugToAdequacaoChanges, 1);
  assert.equal(result.transitions[1]?.sourceLastUpdate, "2026-11-09T16:00:00.000Z");
});
test("importação antiga não inventa reclassificação e alteração posterior registra mudança", async () => {
  const { tx, rows } = fakeTx();
  await observeTicketCategory(tx, { ticketId: 4, previousCategory: "Bug", category: "Bug", source: "MOVIDESK_API", sourceLastUpdate: t("2026-11-09T10:00:00Z") });
  await observeTicketCategory(tx, { ticketId: 4, previousCategory: "Bug", category: "Adequação", source: "MOVIDESK_API", sourceLastUpdate: t("2026-11-09T18:00:00Z") });
  await observeTicketCategory(tx, { ticketId: 4, previousCategory: "Adequação", category: "Bug", source: "MOVIDESK_EXCEL", sourceLastUpdate: t("2026-11-09T13:00:00Z") });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.source, "HUB_LEGACY");
  assert.equal(summarizeCategoryEvents(rows).bugToAdequacaoChanges, 1);
});
test("mudança para Melhoria não é contabilizada como Bug -> Adequação", async () => {
  const { tx, rows } = fakeTx();
  await observeTicketCategory(tx, { ticketId: 11, category: "Bug", source: "MOVIDESK_API" });
  await observeTicketCategory(tx, { ticketId: 11, category: "Melhoria", source: "MOVIDESK_API" });
  assert.equal(summarizeCategoryEvents(rows).bugToAdequacaoChanges, 0);
});
