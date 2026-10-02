import {
  isProductivityBusinessDay,
  productivityExpectedHours,
  productivityHolidays,
  sameOperationalPerson,
} from "../domain/ProductivityRules";
import { prisma } from "../database/prisma";
import { SUPPORT_ANALYSTS, SUPPORT_TEAMS, isSupportAnalyst, ticketOperationalScope } from "../domain/OperationalScope";

export type AnalystTimeProductivityParams = {
  startDate?: string | null;
  endDate?: string | null;
  analyst?: string | null;
};

export class AnalystProductivityService {
  public async analyze(params: { startDate?: string | null; endDate?: string | null; analyst?: string | null } = {}) {
    const end = params.endDate ? new Date(`${params.endDate}T23:59:59.999`) : new Date();
    const start = params.startDate ? new Date(`${params.startDate}T00:00:00.000`) : new Date(end.getTime() - 27 * 86400000);
    const requestedAnalyst = params.analyst?.trim() || null;
    const analysts = requestedAnalyst && isSupportAnalyst(requestedAnalyst)
      ? [SUPPORT_ANALYSTS.find((analyst) => sameOperationalPerson(analyst, requestedAnalyst)) ?? requestedAnalyst]
      : [...SUPPORT_ANALYSTS];
    const [tickets, appointments] = await Promise.all([
      prisma.ticket.findMany({
        where: { AND: [ticketOperationalScope(), { isDeleted: false }] },
        select: { id: true, movideskId: true, subject: true, owner: true },
      }),
      prisma.movideskTimeAppointment.findMany({
        where: {
          date: { gte: start, lte: end },
          action: { ticket: { AND: [ticketOperationalScope(), { isDeleted: false }] } },
        },
        select: {
          accountedTime: true,
          date: true,
          createdByName: true,
          createdByTeamName: true,
          action: { select: { ticket: { select: { movideskId: true, subject: true, owner: true } } } },
        },
      }),
    ]);
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
      let registeredHoursTotal = 0;
      const ticketHours = new Map<number, { hours: number; subject: string }>();
      const weeklyHours = new Map<string, number>();
      for (const appointment of appointments) {
        if (!appointment.createdByName || !same(appointment.createdByName, analyst)) continue;
        const hours = Number(appointment.accountedTime ?? 0);
        if (!Number.isFinite(hours) || hours <= 0) continue;
        registeredHoursTotal += hours;
        const ticket = appointment.action.ticket;
        const current = ticketHours.get(ticket.movideskId) ?? { hours: 0, subject: ticket.subject };
        current.hours += hours;
        ticketHours.set(ticket.movideskId, current);
        if (appointment.date) {
          const key = weekKey(appointment.date);
          weeklyHours.set(key, (weeklyHours.get(key) ?? 0) + hours);
        }
      }
      const registeredHours = Number(registeredHoursTotal.toFixed(2));
      return {
        analyst, businessDays, expectedHours, registeredHours,
        coverageRate: expectedHours ? Number((registeredHours / expectedHours * 100).toFixed(1)) : null,
        ticketsWithTime: ticketHours.size,
        averageHoursPerTicket: ticketHours.size ? Number((registeredHours / ticketHours.size).toFixed(2)) : null,
        weekly: [...weeks.values()].map((week) => {
          const weekRegisteredHours = Number((weeklyHours.get(week.week) ?? 0).toFixed(2));
          const expected = week.businessDays * hoursPerDay;
          return { week: week.week, businessDays: week.businessDays, expectedHours: expected, registeredHours: weekRegisteredHours, coverageRate: expected ? Number((weekRegisteredHours / expected * 100).toFixed(1)) : null };
        }),
        topTickets: [...ticketHours.entries()].sort((a,b) => b[1].hours-a[1].hours).slice(0,10).map(([movideskId, item]) => ({
          movideskId, subject: item.subject, hours: Number(item.hours.toFixed(2)),
        })),
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
      definition: { expectedHours: `${hoursPerDay} horas por dia útil (segunda a sexta), descontando ${holidays.size} feriado(s) configurado(s) no período de referência. Férias, afastamentos e jornadas individuais ainda devem ser tratados como ajustes de capacidade.`, registeredHours: "Soma de accountedTime dos apontamentos estruturados do Movidesk, atribuída ao autor real de cada apontamento.", coverageRate: "Horas registradas ÷ horas previstas × 100. Indicador de cobertura de apontamento, não avaliação isolada de desempenho." },
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
      dataSource: "Movidesk actions.timeAppointments.accountedTime",
    };
  }


}
