import assert from "node:assert/strict";
import test from "node:test";
import { dataProtectionService } from "../src/services/DataProtectionService";

test("normaliza caracteres de controle e limita tamanho", () => {
  assert.equal(dataProtectionService.normalizeText("  teste\u0000 seguro  ", 20), "teste seguro");
});

test("bloqueia credencial Bearer no chat", () => {
  assert.throws(() => dataProtectionService.assertNoSecrets("Authorization: Bearer abcdefghijklmnopqrstuvwxyz.123456"), /token Bearer/);
});

test("remove valores sensíveis de metadados", () => {
  assert.deepEqual(dataProtectionService.redact({ token: "segredo", nested: { value: "ok" } }), { token: "[REMOVIDO]", nested: { value: "ok" } });
});
