import assert from "node:assert/strict";
import { test } from "node:test";
import { isConditionalSupportTicket, movideskDashboardScope } from "../src/domain/OperationalScope";

test("SIAGRI Sistemas is admitted only for a named support analyst", () => {
  assert.equal(isConditionalSupportTicket("SIAGRI SISTEMAS", "DIEGO OLIVEIRA ARANTES"), true);
  assert.equal(isConditionalSupportTicket("SIAGRI SISTEMAS", "TAYSON ALVES DE ARAUJO"), true);
  assert.equal(isConditionalSupportTicket("SIAGRI SISTEMAS", "SUPORTE SIMER | BDS"), false);
  assert.equal(isConditionalSupportTicket("OUTRO CLIENTE", "DIEGO OLIVEIRA ARANTES"), false);
  assert.equal(isConditionalSupportTicket(null, "DIEGO OLIVEIRA ARANTES"), false);
});

test("dashboard query retains the conditional owner restriction", () => {
  const serialized = JSON.stringify(movideskDashboardScope());
  assert.match(serialized, /SIAGRI SISTEMAS/);
  assert.match(serialized, /SUPPORT_ANALYSTS|DIEGO OLIVEIRA ARANTES/);
});
