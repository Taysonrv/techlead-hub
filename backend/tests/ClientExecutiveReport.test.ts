import assert from "node:assert/strict";
import test from "node:test";
import { SIMER_CLIENTS, CONDITIONAL_SUPPORT_CLIENTS } from "../src/domain/OperationalScope";
import {
  DEFAULT_EXECUTIVE_CLIENT, EXECUTIVE_CLIENT_CATALOG, ALL_EXECUTIVE_CLIENTS, ALL_EXECUTIVE_CLIENTS_LABEL, resolveExecutiveClient,
  clientExecutiveReport,
} from "../src/services/BomJesusReportService";

test("painel executivo lista carteira explícita, preserva Bom Jesus e inclui SIAGRI condicional",()=>{
  assert.equal(DEFAULT_EXECUTIVE_CLIENT,SIMER_CLIENTS[0]);
  assert.deepEqual(EXECUTIVE_CLIENT_CATALOG,[...SIMER_CLIENTS,...CONDITIONAL_SUPPORT_CLIENTS]);
  assert.equal(resolveExecutiveClient("BOM JESUS"),SIMER_CLIENTS[0]);
  assert.equal(resolveExecutiveClient("coap"),"COAP - SORRISO-MT");
  assert.equal(resolveExecutiveClient("siagri sistemas"),"SIAGRI SISTEMAS");
});
test("não permite relatório de cliente externo ou parâmetros de substring arbitrária",async()=>{
  for(const name of ["FORA DA CARTEIRA","BOM JESUS MALICIOSO","SIAGRI SISTEMAS EXTERNO",""]){
    assert.equal(resolveExecutiveClient(name),null);
    await assert.rejects(()=>clientExecutiveReport(name,"2026-07-01","2026-11-10"),/Cliente não autorizado/);
  }
});

test("Selecionar todos não permite ampliar a carteira para clientes externos",()=>{
  assert.equal(ALL_EXECUTIVE_CLIENTS,"__ALL__");
  assert.equal(resolveExecutiveClient(ALL_EXECUTIVE_CLIENTS),ALL_EXECUTIVE_CLIENTS);
  assert.equal(ALL_EXECUTIVE_CLIENTS_LABEL,"Todos os clientes da carteira SIMER");
  assert.equal(resolveExecutiveClient("__ALL__ OUTROS"),null);
  assert.equal(resolveExecutiveClient("TODOS OS CLIENTES"),null);
  for(const client of EXECUTIVE_CLIENT_CATALOG)
    assert.equal(resolveExecutiveClient(client),client);
});
