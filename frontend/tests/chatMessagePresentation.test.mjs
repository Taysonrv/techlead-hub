import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/chat/messagePresentation.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { prepareMessagePresentation } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

const person = (id) => ({ id, name: `Pessoa ${id}`, username: `p${id}`, role: "USER" });
const message = (id, authorId, content, createdAt, parentId = null) => ({
  id, content, createdAt, parentId, author: person(authorId),
});

test("groups consecutive messages from the same author within five minutes", () => {
  const list = [
    message(1, 1, "Olá", "2026-10-26T12:00:00.000Z"),
    message(2, 1, "Tudo bem?", "2026-10-26T12:04:00.000Z"),
    message(3, 1, "Mais tarde", "2026-10-26T12:10:00.000Z"),
    message(4, 2, "Oi", "2026-10-26T12:11:00.000Z"),
  ];
  const result = prepareMessagePresentation(list, list, 1, "p1");
  assert.deepEqual(result.map((item) => item.sameAuthor), [false, true, false, false]);
  assert.deepEqual(result.map((item) => item.mine), [true, true, true, false]);
});

test("resolves replies from full history even when parent is filtered out", () => {
  const parent = message(10, 1, "Contexto", "2026-10-26T12:00:00.000Z");
  const reply = message(11, 2, "Resposta", "2026-10-26T12:01:00.000Z", 10);
  const [prepared] = prepareMessagePresentation([reply], [parent, reply]);
  assert.equal(prepared.parent?.id, 10);
});

test("handles absent reply references and case-insensitive mentions", () => {
  const item = message(5, 2, "Bom dia @P1", "2026-10-26T12:00:00.000Z", 999);
  const [prepared] = prepareMessagePresentation([item], [item], 1, "p1");
  assert.equal(prepared.parent, null);
  assert.equal(prepared.mentioned, true);
});

test("separates message groups across calendar dates", () => {
  const list = [
    message(1, 1, "Antes", new Date(2026, 9, 26, 23, 59).toISOString()),
    message(2, 1, "Depois", new Date(2026, 9, 27, 0, 1).toISOString()),
  ];
  const result = prepareMessagePresentation(list, list);
  assert.equal(result[1].showDay, true);
  assert.equal(result[1].sameAuthor, false);
});
