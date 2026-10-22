import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeMovideskAlertText,
  parseMovideskAlertTerms,
  shouldAlertForMovideskSubject,
} from "../src/services/MovideskAlertMatcher";

test("normalizes case, accents and repeated whitespace", () => {
  assert.equal(normalizeMovideskAlertText("  RECEITUÁRIO   AGRÍQ "), "receituario agriq");
});

test("matches configured terms regardless of case or accent", () => {
  const terms = parseMovideskAlertTerms("AGRIQ;receituário;receita");
  assert.equal(shouldAlertForMovideskSubject("Falha no AGRIQ - produção", terms), true);
  assert.equal(shouldAlertForMovideskSubject("Receituário avulso não transmitido", terms), true);
  assert.equal(shouldAlertForMovideskSubject("Receituario avulso", terms), true);
  assert.equal(shouldAlertForMovideskSubject("Erro na receita agronômica", terms), true);
});

test("does not match empty subjects or empty terms", () => {
  assert.equal(shouldAlertForMovideskSubject(null, ["agriq"]), false);
  assert.equal(shouldAlertForMovideskSubject("Ticket comum", ["", "   "]), false);
});

test("deduplicates normalized terms", () => {
  assert.deepEqual(parseMovideskAlertTerms("AGRIQ;agriq; receituário;receituario"), [
    "agriq",
    "receituario",
  ]);
});
