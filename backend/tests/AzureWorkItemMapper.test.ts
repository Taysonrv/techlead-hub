import assert from "node:assert/strict";
import test from "node:test";

import {
  AZURE_WORK_ITEM_FIELDS,
  deliveredVersionValue,
  mapAzureWorkItem,
} from "../src/services/AzureWorkItemMapper";

test("separa versão cadastrada da versão entregue", () => {
  const mapped = mapAzureWorkItem({
    id: 26603,
    fields: {
      "System.WorkItemType": "Correção Clientes",
      "System.Title": "Liquidação de Contrato de Compra",
      "System.State": "Concluído",
      [AZURE_WORK_ITEM_FIELDS.registrationVersion]: "7.18.18-lte",
      [AZURE_WORK_ITEM_FIELDS.deliveredVersions]: "7.18.19-lte",
    },
  });

  assert.equal(mapped.registeredVersion, "7.18.18-lte");
  assert.equal(mapped.deliveredVersion, "7.18.19-lte");
});

test("aceita múltiplas versões entregues sem duplicar valores", () => {
  assert.equal(
    deliveredVersionValue({
      [AZURE_WORK_ITEM_FIELDS.deliveredVersions]:
        "7.18.19-lte; 7.18.20-lte; 7.18.19-lte",
    }),
    "7.18.19-lte, 7.18.20-lte",
  );
});

test("não transforma ausência de seleção em versão entregue", () => {
  assert.equal(
    deliveredVersionValue({
      [AZURE_WORK_ITEM_FIELDS.deliveredVersions]: "No selection made",
    }),
    null,
  );
});

test("não confunde o campo de cadastro com a entrega", () => {
  assert.equal(
    deliveredVersionValue({
      [AZURE_WORK_ITEM_FIELDS.registrationVersion]: "7.18.18-lte",
    }),
    null,
  );
});

test("mantém criticidade, priorização e bloqueio como campos Azure distintos", () => {
  assert.equal(AZURE_WORK_ITEM_FIELDS.criticality, "Custom.Criticidade");
  assert.equal(AZURE_WORK_ITEM_FIELDS.prioritized, "Custom.Priorizada");
  assert.equal(AZURE_WORK_ITEM_FIELDS.blockedProcess, "Custom.ProcessoBloqueado");

  const mapped = mapAzureWorkItem({
    id: 30001,
    fields: {
      "System.WorkItemType": "Correção Clientes",
      "System.Title": "Cenário de auditoria semântica",
      "System.State": "Ativo",
      [AZURE_WORK_ITEM_FIELDS.criticality]: "Alta",
      [AZURE_WORK_ITEM_FIELDS.prioritized]: true,
      [AZURE_WORK_ITEM_FIELDS.blockedProcess]: false,
    },
  });

  assert.equal(mapped.criticality, "Alta");
  assert.equal(mapped.prioritized, true);
  assert.equal(mapped.blockedProcess, false);
});
