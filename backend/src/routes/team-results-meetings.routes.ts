import { Router } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { requirePermission, requireRoles } from "../middlewares/roleMiddleware";
import { prisma } from "../database/prisma";
import { scopedAzureWhere } from "../domain/OperationalScope";

export const teamResultsMeetingRoutes = Router();
teamResultsMeetingRoutes.use(requirePermission("dashboard"));
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const isoDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed : null;
};
const cleanGoals = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 200) return null;
  if (!value.every(row => row && typeof row === "object" && typeof row.name === "string" && row.name.length <= 200 && Number.isInteger(row.target) && row.target >= 0 && row.target <= 1000000)) return null;
  return value.map(row => ({ name: text(row.name, 200), target: row.target }));
};
const cleanHighlights = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 200) return null;
  if (!value.every(row => row && typeof row === "object" && typeof row.id === "string" && row.id.length <= 100 && ["achievement","attention"].includes(row.kind) && typeof row.text === "string" && row.text.length <= 4000)) return null;
  return value.map(row => ({ id: text(row.id, 100), kind: row.kind, text: text(row.text, 4000) }));
};
const cleanActions = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 300) return null;
  if (!value.every(row => row && typeof row === "object" && typeof row.id === "string" && row.id.length <= 100 && typeof row.description === "string" && row.description.length <= 4000 && typeof row.owner === "string" && row.owner.length <= 200 && isoDate(row.due) && ["pending","doing","done"].includes(row.status))) return null;
  return value.map(row => ({ id: text(row.id, 100), description: text(row.description, 4000), owner: text(row.owner, 200), due: row.due, status: row.status }));
};

teamResultsMeetingRoutes.get("/bugs-summary", async (req: AuthenticatedRequest, res) => {
  const start = isoDate(req.query.start);
  const end = isoDate(req.query.end);
  if (!start || !end || start > end) { res.status(400).json({ message: "Período inválido." }); return; }
  const endExclusive = new Date(end.getTime() + 86_400_000);
  try {
    const rows = await prisma.azureWorkItem.findMany({
      where: scopedAzureWhere({ workItemType: "Correção Clientes", azureCreatedAt: { gte: start, lt: endExclusive } }),
      select: { id: true, state: true, azureCreatedAt: true, deliveredVersion: true },
      orderBy: { azureCreatedAt: "desc" },
      take: 5000,
    });
    res.json({ total: rows.length, limited: rows.length === 5000, delivered: rows.filter(row => Boolean(row.deliveredVersion)).length });
  } catch (error) { console.error("[team-meetings] bugs", error); res.status(500).json({ message: "Falha ao consultar correções do período." }); }
});

teamResultsMeetingRoutes.get("/", async (_req: AuthenticatedRequest, res) => {
  try {
    const meetings = await prisma.teamResultsMeeting.findMany({ orderBy: { meetingDate: "desc" }, take: 100, select: { id: true, meetingDate: true, title: true, version: true, updatedAt: true } });
    res.json(meetings);
  } catch (error) { console.error("[team-meetings] list", error); res.status(500).json({ message: "Falha ao consultar reuniões." }); }
});

teamResultsMeetingRoutes.get("/:date", async (req: AuthenticatedRequest, res) => {
  const date = isoDate(req.params.date);
  if (!date) { res.status(400).json({ message: "Data inválida." }); return; }
  try {
    const meeting = await prisma.teamResultsMeeting.findUnique({ where: { meetingDate: date } });
    res.json(meeting);
  } catch (error) { console.error("[team-meetings] get", error); res.status(500).json({ message: "Falha ao consultar reunião." }); }
});

teamResultsMeetingRoutes.put("/:date", requireRoles("ADMIN", "COORDENADOR"), async (req: AuthenticatedRequest, res) => {
  const date = isoDate(req.params.date);
  const body = req.body as Record<string, unknown> | undefined;
  if (!date || !body || typeof body !== "object") { res.status(400).json({ message: "Dados inválidos." }); return; }
  const goals = cleanGoals(body.goals);
  const highlights = cleanHighlights(body.highlights);
  const actions = cleanActions(body.actions);
  const title = text(body.title, 200);
  const notes = text(body.notes, 12000);
  const version = body.version;
  const snapshot = body.snapshot;
  const validSnapshot = snapshot === null || (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && JSON.stringify(snapshot).length <= 10000 && Object.values(snapshot).every(value => value === null || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 100));
  if (!title || goals === null || highlights === null || actions === null || !Number.isInteger(version) || Number(version) < 0 || !validSnapshot) {
    res.status(400).json({ message: "Dados da reunião inválidos." }); return;
  }
  const normalizedSnapshot = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? JSON.parse(JSON.stringify(snapshot)) as Record<string, string | number | null> : undefined;
  try {
    const userId = req.auth!.userId;
    const existing = await prisma.teamResultsMeeting.findUnique({ where: { meetingDate: date } });
    if (existing && existing.version !== version || !existing && version !== 0) {
      res.status(409).json({ message: "A reunião foi alterada por outra pessoa. Atualize antes de salvar." }); return;
    }
    if (!existing) {
      try {
        const created = await prisma.teamResultsMeeting.create({ data: { meetingDate: date, title, notes, snapshot: normalizedSnapshot, goals, highlights, actions, createdById: userId, updatedById: userId } });
        res.json(created);
      } catch (error) {
        // Corrida entre duas criações da mesma reunião.
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") { res.status(409).json({ message: "Reunião criada por outra pessoa. Atualize antes de salvar." }); return; }
        throw error;
      }
      return;
    }
    const updated = await prisma.teamResultsMeeting.updateMany({ where: { id: existing.id, version: existing.version }, data: { title, notes, snapshot: normalizedSnapshot, goals, highlights, actions, updatedById: userId, version: { increment: 1 } } });
    if (updated.count === 0) { res.status(409).json({ message: "A reunião foi atualizada em outra máquina. Recarregue os dados." }); return; }
    res.json(await prisma.teamResultsMeeting.findUnique({ where: { id: existing.id } }));
  } catch (error) { console.error("[team-meetings] save", error); res.status(500).json({ message: "Não foi possível salvar a reunião." }); }
});
