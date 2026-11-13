import assert from "node:assert/strict";
import test from "node:test";
import { parseEnvironmentValue, selectSystemConfigKey } from "./environment.js";

test("importa SYSTEM_CONFIG_KEY de .env com BOM UTF-8", () => {
  assert.equal(parseEnvironmentValue("\uFEFFSYSTEM_CONFIG_KEY='original-key-value'\r\nDATABASE_URL=postgresql://host/db", "SYSTEM_CONFIG_KEY"), "original-key-value");
});

test("chave do safeStorage prevalece sobre variável desatualizada no Desktop instalado", () => {
  assert.equal(selectSystemConfigKey({ packaged: true, environmentValue: "stale-key", secureValue: "recovered-key" }), "recovered-key");
});

test("ambiente explícito prevalece no modo desenvolvimento", () => {
  assert.equal(selectSystemConfigKey({ packaged: false, environmentValue: "dev-key", secureValue: "stored-key" }), "dev-key");
});
