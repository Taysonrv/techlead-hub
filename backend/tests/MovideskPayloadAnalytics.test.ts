import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
  analyzeMovideskIndicators,
  analyzeMovideskPayload,
} from "../src/services/MovideskPayloadAnalytics";

test("indicadores leves preservam os resultados da análise completa", () => {
  const payload = {
    reopenedIn: "2026-09-10T10:00:00Z",
    actions: Array.from({ length: 100 }, (_, id) => ({
      id,
      createdDate: "2026-09-10T10:00:00Z",
      description: `Ação ${id}`,
    })),
    statusHistories: [{ status: "Reaberto", changedDate: "2026-09-10T11:00:00Z" }],
    ownerHistories: [
      { owner: { businessName: "Analista A" } },
      { owner: { businessName: "Analista B" } },
      { owner: { businessName: "Analista B" } },
    ],
    satisfactionSurveyResponses: [{
      satisfactionSurveySmileyFacesResponse: 2,
      comments: "Necessita acompanhamento",
      responseDate: "2026-09-10T12:00:00Z",
    }],
  } as Prisma.JsonValue;

  const complete = analyzeMovideskPayload(payload);
  const lightweight = analyzeMovideskIndicators(payload);

  assert.deepEqual(lightweight, {
    ownerHandoffs: complete.ownerHandoffs,
    reopenCount: complete.reopenCount,
    satisfactionScore: complete.satisfactionScore,
    satisfactionComment: complete.satisfactionComment,
  });
});
