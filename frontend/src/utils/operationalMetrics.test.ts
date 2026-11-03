import { describe, expect, it } from "vitest";
import { buildOperationalCohorts } from "./operationalMetrics";

const period = { start: new Date("2026-11-01T00:00:00Z"), end: new Date("2026-11-30T23:59:59Z") };
const ticket = (ticketType: number | null, baseStatus = "New") => ({
  createdDate: "2026-11-03T12:00:00Z", baseStatus, ticketType, isWithSimer: true,
});

describe("backlog de atendimentos públicos", () => {
  it("contabiliza apenas tickets públicos em estados pendentes", () => {
    const result = buildOperationalCohorts([
      ticket(2), ticket(1), ticket(null), ticket(2, "Stopped"),
      ticket(2, "InAttendance"), ticket(2, "Resolved"),
    ], period);
    expect(result.backlog).toHaveLength(3);
    expect(result.entries).toHaveLength(6); // outros indicadores não perdem tickets internos
  });
});
