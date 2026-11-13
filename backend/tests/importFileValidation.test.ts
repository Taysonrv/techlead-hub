import assert from "node:assert/strict";
import test from "node:test";
import { validateImportFile } from "../src/utils/importFileValidation";

const upload = (originalname: string, content: Buffer | string) => ({
  originalname,
  buffer: typeof content === "string" ? Buffer.from(content) : content,
});

test("accepts Movidesk JSON with BOM and whitespace", () => {
  assert.equal(validateImportFile(upload("tickets.JSON", "\uFEFF  [{\"id\":1}]")), "json");
});

test("accepts XLSX with ZIP local-file signature", () => {
  assert.equal(validateImportFile(upload("tickets.xlsx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]))), "xlsx");
});

test("rejects unsupported extension, empty upload and disguised XLSX", () => {
  assert.throws(() => validateImportFile(upload("tickets.xls", "x")), /Formato inválido/);
  assert.throws(() => validateImportFile(upload("tickets.json", "")), /vazio/);
  assert.throws(() => validateImportFile(upload("tickets.xlsx", "not a ZIP")), /formato .xlsx válido/);
});

test("rejects content that cannot start a JSON document", () => {
  assert.throws(() => validateImportFile(upload("tickets.json", "<html>")), /JSON válido/);
});
