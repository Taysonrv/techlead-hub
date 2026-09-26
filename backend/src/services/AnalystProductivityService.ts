import { prisma } from "../database/prisma";
import { SUPPORT_ANALYSTS, SUPPORT_TEAMS, ticketOperationalScope } from "../domain/OperationalScope";
import { extractMovideskTimeEntries } from "./MovideskPayloadAnalytics";

export type AnalystTimeProductivityParams = {
  startDate?: string | null;
  endDate?: string | null;
  analyst?: string | null;
};

export class AnalystProductivityService {
  public async analyze(params: { startDate?: string | null; endDate?: string | null; analyst?: string | null } = {}) {
    const end = params.endDate ? new Date(`${params.endDate}T23:59:59.999`) : new Date();
    const start = params.startDate ? new Date(`${params.startDate}T00:00:00.000`) : new Date(end.getTime() - 27 * 86400000);
    const analysts = params.analyst ? [params.analyst] : [...SUPPORT_ANALYSTS];
    const tickets = await prisma.ticket.findMany({
      where: { AND: [ticketOperationalScope(), { isDeleted: false }, { owner: { in: analysts, mode: "insensitive" } }] },
      select: { movideskId: true, subject: true, owner: true, rawData: true },
    });
    const holidays = productivityHolidays();
    const { businessDays, hoursPerDay, expectedHours } = productivityExpectedHours(start, end);
    const isBusinessDay = (value: Date) => isProductivityBusinessDay(value, holidays);
    const same = sameOperationalPerson;
    const weekKey = (value: Date) => {
      const day = new Date(value); day.setHours(0, 0, 0, 0);
      const mondayOffset = (day.getDay() + 6) % 7; day.setDate(day.getDate() - mondayOffset);
      return day.toISOString().slice(0, 10);
    };
    const weeks = new Map<string, { week: string; businessDays: number }>();
    for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const key = weekKey(day); const current = weeks.get(key) ?? { week: key, businessDays: 0 };
      if (isBusinessDay(day)) current.businessDays += 1;
      weeks.set(key, current);
    }
    const result = analysts.map((analyst) => {
      let registeredMinutes = 0; const ticketMinutes = new Map<number, number>(); const weeklyMinutes = new Map<string, number>();
      for (const ticket of tickets) for (const entry of extractMovideskTimeEntries(ticket.rawData)) {
        if (entry.date) { const entryDate = new Date(entry.date); if (entryDate < start || entryDate > end) continue; }
        const belongs = entry.analyst ? same(entry.analyst, analyst) : same(ticket.owner, analyst);
        if (!belongs) continue;
        registeredMinutes += entry.minutes;
        ticketMinutes.set(ticket.movideskId, (ticketMinutes.get(ticket.movideskId) ?? 0) + entry.minutes);
        if (entry.date) { const key = weekKey(new Date(entry.date)); weeklyMinutes.set(key, (weeklyMinutes.get(key) ?? 0) + entry.minutes); }
      }
      return {
        analyst, businessDays, expectedHours, registeredHours: Number((registeredMinutes / 60).toFixed(2)),
        coverageRate: expectedHours ? Number(((registeredMinutes / 60 / expectedHours) * 100).toFixed(1)) : null,
        ticketsWithTime: ticketMinutes.size,
        averageHoursPerTicket: ticketMinutes.size ? Number((registeredMinutes / 60 / ticketMinutes.size).toFixed(2)) : null,
        weekly: [...weeks.values()].map((week) => {
          const registeredHours = Number(((weeklyMinutes.get(week.week) ?? 0) / 60).toFixed(2));
          const expected = week.businessDays * hoursPerDay;
          return { week: week.week, businessDays: week.businessDays, expectedHours: expected, registeredHours, coverageRate: expected ? Number((registeredHours / expected * 100).toFixed(1)) : null };
        }),
        topTickets: [...ticketMinutes.entries()].sort((a,b) => b[1]-a[1]).slice(0,10).map(([movideskId, minutes]) => {
          const ticket = tickets.find((item) => item.movideskId === movideskId);
          return { movideskId, subject: ticket?.subject ?? "", hours: Number((minutes / 60).toFixed(2)) };
        }),
      };
    });
    const teams = Object.entries(SUPPORT_TEAMS).map(([team, members]) => {
      const rows = result.filter((row) => members.some((member) => same(row.analyst, member)));
      const teamExpected = rows.reduce((sum, row) => sum + row.expectedHours, 0);
      const teamRegistered = Number(rows.reduce((sum, row) => sum + row.registeredHours, 0).toFixed(2));
      return { team, analysts: rows.length, expectedHours: teamExpected, registeredHours: teamRegistered, coverageRate: teamExpected ? Number((teamRegistered / teamExpected * 100).toFixed(1)) : null };
    });
    const weekly = [...weeks.values()].map((week) => {
      const expectedHours = week.businessDays * hoursPerDay * result.length;
      const registeredHours = Number(result.reduce((sum, row) => sum + (row.weekly.find((item) => item.week === week.week)?.registeredHours ?? 0), 0).toFixed(2));
      return { week: week.week, expectedHours, registeredHours, coverageRate: expectedHours ? Number((registeredHours / expectedHours * 100).toFixed(1)) : null };
    });
    return {
      generatedAt: new Date().toISOString(), startDate: start.toISOString(), endDate: end.toISOString(),
      definition: { expectedHours: `${hoursPerDay} horas por dia útil (segunda a sexta), descontando ${holidays.size} feriado(s) configurado(s) no período de referência. Férias, afastamentos e jornadas individuais ainda devem ser tratados como ajustes de capacidade.`, registeredHours: "Soma dos apontamentos de tempo disponíveis no payload sincronizado do Movidesk.", coverageRate: "Horas registradas ÷ horas previstas × 100. Indicador de cobertura de apontamento, não avaliação isolada de desempenho." },
      analysts: result, teams, weekly,
      insights: {
        expectedHours: Number(result.reduce((sum,row)=>sum+row.expectedHours,0).toFixed(2)),
        registeredHours: Number(result.reduce((sum,row)=>sum+row.registeredHours,0).toFixed(2)),
        coverageRate: result.reduce((sum,row)=>sum+row.expectedHours,0) ? Number((result.reduce((sum,row)=>sum+row.registeredHours,0)/result.reduce((sum,row)=>sum+row.expectedHours,0)*100).toFixed(1)) : null,
        ticketsWithTime: result.reduce((sum,row)=>sum+row.ticketsWithTime,0),
        analystsWithoutTime: result.filter(row=>row.registeredHours===0).map(row=>row.analyst),
        lowCoverageAnalysts: result.filter(row=>row.coverageRate!==null&&row.coverageRate<60).map(row=>({analyst:row.analyst,coverageRate:row.coverageRate})),
        weeklyTrend: weekly.length>=2 ? Number((weekly.at(-1)!.coverageRate??0)-(weekly.at(-2)!.coverageRate??0)).toFixed(1) : null,
      },
      capacity: { hoursPerDay, configuredHolidays: [...holidays].sort() },
    };
  }


}
