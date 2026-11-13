import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/chat/sseFrames.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { consumeSseFrames } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

test("decodes two events and ignores heartbeat comments", () => {
  const { frames, remainder } = consumeSseFrames("", ": keepalive\n\nid: 42\ndata: {\"ok\":true}\n\ndata: second\n\n");
  assert.deepEqual(frames, [{ id: "42", data: '{"ok":true}' }, { id: null, data: "second" }]);
  assert.equal(remainder, "");
});

test("keeps partial frames until delimiter arrives", () => {
  const first = consumeSseFrames("", "data: {\"message\":");
  assert.equal(first.frames.length, 0);
  const second = consumeSseFrames(first.remainder, "\"ready\"}\n\n");
  assert.deepEqual(JSON.parse(second.frames[0].data), { message: "ready" });
});

test("handles CRLF split across network chunks", () => {
  const first = consumeSseFrames("", "data: hello\r");
  assert.equal(first.frames.length, 0);
  const second = consumeSseFrames(first.remainder, "\n\r\n");
  assert.equal(second.frames[0].data, "hello");
});

test("joins multiline event data and ignores invalid NUL ids", () => {
  const result = consumeSseFrames("", "id: bad\0id\ndata: first\ndata: second\n\n");
  assert.deepEqual(result.frames, [{ id: null, data: "first\nsecond" }]);
});
