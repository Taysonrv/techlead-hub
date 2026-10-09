import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../src/database/prisma";
import { CorrectionMonthlyReportService } from "../src/services/CorrectionMonthlyReportService";

test("fallback preserva Tasks locais sem certificar cobertura a partir de um único evento", async (t) => {
  const createdAt = new Date("2026-09-02T12:00:00Z");
  const changedAt = new Date("2026-09-15T12:00:00Z");
  const originalFindMany = prisma.azureWorkItem.findMany;
  const originalQueryRaw = prisma.$queryRaw;
  t.after(() => {
    prisma.azureWorkItem.findMany = originalFindMany;
    prisma.$queryRaw = originalQueryRaw;
  });
  prisma.azureWorkItem.findMany = (async () => [
    { id: 1, title: "Correção com evento", client: "COAP", createdByName: "Tayson Araujo", azureCreatedAt: createdAt, stateChangedAt: changedAt, state: "Concluído" },
    { id: 2, title: "Correção sem histórico", client: "COAP", createdByName: "Tayson Araujo", azureCreatedAt: createdAt, stateChangedAt: null, state: "Concluído" },
  ]) as typeof originalFindMany;
  prisma.$queryRaw = (async () => [
    { workItemId: 1, oldValue: "Desenvolvimento", newValue: "Concluído", changedAt },
  ]) as typeof originalQueryRaw;
  const service = new CorrectionMonthlyReportService();
  // Fontes externas vazias, como no incidente; nenhuma rede ou BD necessário.
  t.mock.method(service, "resolveFields", async () => ({ client: "client", urgency: "urgency", prioritized: "prioritized" }));
  t.mock.method(service, "revisions", async () => []);
  t.mock.method(service, "workItemIdsAsOf", async () => []);
  t.mock.method(service, "snapshots", async () => new Map());
  t.mock.method(service, "workItemUrl", () => "https://dev.azure.com/test/_workitems/edit/1");
  const build = service as unknown as { build(month: string): Promise<{
    cards: { registered: number; delivered: number };
    rows: Array<{ id: number; deliveredInPeriod: boolean }>;
    quality: { localFallbackUsed: boolean; movementHistoryReliable: boolean; backlogHistoricalReliable: boolean };
  }> };
  const report = await build.build("2026-09");
  assert.equal(report.cards.registered, 2);
  assert.equal(report.cards.delivered, 1);
  assert.equal(report.rows.find(row => row.id === 2)?.deliveredInPeriod, false);
  assert.equal(report.quality.localFallbackUsed, true);
  assert.equal(report.quality.movementHistoryReliable, false);
  assert.equal(report.quality.backlogHistoricalReliable, false);
});


test("fallback usa StateChangeDate e restringe todas as dimensões à carteira SIMER", async (t) => {
  const originalFindMany = prisma.azureWorkItem.findMany;
  const originalQueryRaw = prisma.$queryRaw;
  t.after(() => {
    prisma.azureWorkItem.findMany = originalFindMany;
    prisma.$queryRaw = originalQueryRaw;
  });
  const createdAt = new Date("2026-08-01T12:00:00Z");
  const changedAt = new Date("2026-09-15T12:00:00Z");
  const item = (id: number, client: string, state: string, stateChangedAt: Date | null) =>
    ({ id, title: `Task ${id}`, client, createdByName: "Tayson Araujo", azureCreatedAt: createdAt, state, stateChangedAt });
  prisma.azureWorkItem.findMany = (async () => [
    item(1, "COAP", "Concluído", changedAt),
    item(2, "COAGRO", "Cancelado", changedAt),
    item(3, "BOM JESUS", "Registro", changedAt),
    item(4, "Cliente fora da carteira", "Concluído", changedAt),
    ...["Joel Kunrath", "Carina Silva", "Renan Stein", "Lucas Lima"].map((createdByName, index) =>
      ({ ...item(80 + index, "COAP", "Concluído", changedAt), createdByName })),
    item(5, "COAP", "Concluído", new Date("2026-10-02T12:00:00Z")),
    item(6, "COAP", "Cancelado", null),
    item(7, "COAP", "Concluído", new Date("2026-08-20T12:00:00Z")),
  ]) as typeof originalFindMany;
  prisma.$queryRaw = (async () => [
    { workItemId: 5, oldValue: "Registro", newValue: "Concluído", changedAt: new Date("2026-10-02T12:00:00Z") },
  ]) as typeof originalQueryRaw;
  const service = new CorrectionMonthlyReportService();
  t.mock.method(service, "resolveFields", async () => ({ client: "client", urgency: "urgency", prioritized: "prioritized" }));
  t.mock.method(service, "revisions", async () => []);
  t.mock.method(service, "workItemIdsAsOf", async () => []);
  t.mock.method(service, "snapshots", async () => new Map());
  t.mock.method(service, "workItemUrl", () => null);
  const build = service as unknown as { build(month: string): Promise<{
    cards: { delivered: number; canceled: number; inRegistration: number; backlogCurrent: number };
    rows: Array<{ id: number; client: string; terminalAt: string | null }>;
    filters: { clients: string[] };
    pipeline: Array<{ name: string; total: number }>;
    quality: { movementHistoryReliable: boolean };
  }> };
  const report = await build.build("2026-09");
  assert.equal(report.cards.delivered, 1);
  assert.equal(report.cards.canceled, 1);
  assert.equal(report.cards.inRegistration, 1);
  assert.equal(report.cards.backlogCurrent, 0);
  assert.equal(report.rows.some(row => row.id === 4 || row.id >= 80), false);
  assert.equal(report.filters.clients.includes("Cliente fora da carteira"), false);
  assert.equal(report.pipeline.reduce((sum, entry) => sum + entry.total, 0), 6);
  assert.equal(report.rows.find(row => row.id === 1)?.client, "COAP - SORRISO-MT");
  assert.equal(report.rows.find(row => row.id === 1)?.terminalAt, changedAt.toISOString());
  assert.equal(report.quality.movementHistoryReliable, false);
});


test("backlog inicial usa fechamento anterior mesmo com entrega posterior e estoque sem movimento", async (t) => {
  const originalFindMany=prisma.azureWorkItem.findMany;
  const originalQueryRaw=prisma.$queryRaw;
  t.after(()=>{prisma.azureWorkItem.findMany=originalFindMany;prisma.$queryRaw=originalQueryRaw;});
  const createdAt=new Date("2026-08-01T12:00:00Z");
  const changedAt=new Date("2026-09-15T12:00:00Z");
  prisma.azureWorkItem.findMany=(async()=>[
    {id:1,client:"COAP",createdByName:"Tayson Araujo",azureCreatedAt:createdAt,state:"Concluído",stateChangedAt:changedAt},
    {id:2,client:"COAP",createdByName:"Alan Neto",azureCreatedAt:createdAt,state:"Qualidade",stateChangedAt:createdAt},
    {id:3,client:"COAP",createdByName:"Renan Sousa",azureCreatedAt:createdAt,state:"Registro",stateChangedAt:createdAt},
  ]) as typeof originalFindMany;
  prisma.$queryRaw=(async()=>[]) as typeof originalQueryRaw;
  const service=new CorrectionMonthlyReportService();
  t.mock.method(service,"resolveFields",async()=>({client:"client",urgency:"urgency",prioritized:"prioritized"}));
  t.mock.method(service,"revisions",async()=>[]);
  t.mock.method(service,"workItemIdsAsOf",async()=>[]);
  t.mock.method(service,"snapshots",async()=>new Map());
  t.mock.method(service,"workItemUrl",()=>null);
  const fields=(state:string,at:string,creator:string)=>({
    "System.CreatedDate":createdAt.toISOString(),"System.ChangedDate":at,
    "System.State":state,"System.CreatedBy":creator,client:"COAP",
  });
  const initial=[
    {id:1,rev:1,fields:fields("Desenvolvimento",createdAt.toISOString(),"Tayson Araujo")},
    {id:2,rev:1,fields:fields("Qualidade",createdAt.toISOString(),"Alan Neto")},
    {id:3,rev:1,fields:fields("Registro",createdAt.toISOString(),"Renan Sousa")},
  ];
  const delivery={id:1,rev:2,fields:fields("Concluído",changedAt.toISOString(),"Tayson Araujo")};
  t.mock.method(service,"recoverHistoricalSnapshots",async(ids:number[],start:Date)=>{
    assert.deepEqual(ids,[1,2,3]);
    assert.equal(new Date(start.getTime()-1).toISOString(),"2026-09-01T02:59:59.999Z");
    return {opening:new Map(initial.map(x=>[x.id,x])),closing:new Map([[1,delivery],[2,initial[1]!],[3,initial[2]!]]),revisions:[...initial,delivery],completed:new Set(ids),failures:0};
  });
  const report=await (service as unknown as {build(month:string):Promise<{
    cards:{backlogInitial:number;backlogCurrent:number;delivered:number};
    rows:Array<{id:number;stateAtOpen:string;stateAtClose:string;backlogInitial:boolean}>;
    quality:{backlogHistoricalReliable:boolean};
  }>}).build("2026-09");
  assert.equal(report.cards.backlogInitial,2);
  assert.equal(report.cards.backlogCurrent,1);
  assert.equal(report.cards.delivered,1);
  assert.equal(report.rows.find(row=>row.id===1)?.stateAtOpen,"Desenvolvimento");
  assert.equal(report.rows.find(row=>row.id===3)?.backlogInitial,false);
  assert.equal(report.quality.backlogHistoricalReliable,false);
});
