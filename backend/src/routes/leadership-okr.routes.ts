import { Router } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { requirePermission } from "../middlewares/roleMiddleware";
import { prisma } from "../database/prisma";

export const leadershipOkrRoutes = Router();
leadershipOkrRoutes.use(requirePermission("technical-leadership"));
const deliverables = new Set(["CAUSES", "INTERNAL_ESCALATION", "KNOWLEDGE", "EXTERNAL_ESCALATION"]);
const statuses = new Set(["PLANNED", "IN_PROGRESS", "VERIFIED", "CANCELLED"]);
const string = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const parseDate = (value: unknown) => {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : undefined;
};
const payload = (body: unknown) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  const deliverable = string(row.deliverable, 40);
  const title = string(row.title, 200);
  const description = string(row.description, 8000);
  const owner = string(row.owner, 200);
  const status = string(row.status, 24);
  const evidenceUrl = string(row.evidenceUrl, 1000);
  const dueDate = parseDate(row.dueDate);
  if (!deliverables.has(deliverable) || !title || !description || !owner || !statuses.has(status) || dueDate === undefined) return null;
  if (evidenceUrl) {
    try {
      const url = new URL(evidenceUrl);
      if (!["https:", "http:"].includes(url.protocol)) return null;
    } catch { return null; }
  }
  if (status === "VERIFIED" && !evidenceUrl) return null;
  return { deliverable, title, description, owner, status, evidenceUrl: evidenceUrl || null, dueDate };
};

leadershipOkrRoutes.get("/", async (_req: AuthenticatedRequest, res) => {
  try {
    const records = await prisma.leadershipOkrEvidence.findMany({ orderBy: [{ updatedAt: "desc" }], take: 500 });
    res.json(records);
  } catch (error) { console.error("[leadership-okr] list", error); res.status(500).json({ message: "Não foi possível consultar as evidências." }); }
});
leadershipOkrRoutes.post("/", requirePermission("technical-leadership"), async (req: AuthenticatedRequest, res) => {
  const data = payload(req.body);
  if (!data) { res.status(400).json({ message: "Registro inválido. Uma evidência verificada exige URL de comprovação." }); return; }
  try {
    const userId = req.auth!.userId;
    const created = await prisma.leadershipOkrEvidence.create({ data: { ...data, createdById: userId, updatedById: userId } });
    res.status(201).json(created);
  } catch (error) { console.error("[leadership-okr] create", error); res.status(500).json({ message: "Não foi possível registrar a evidência." }); }
});
leadershipOkrRoutes.put("/:id", requirePermission("technical-leadership"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const data = payload(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || !data) { res.status(400).json({ message: "Registro inválido." }); return; }
  try {
    const result = await prisma.leadershipOkrEvidence.updateMany({ where: { id }, data: { ...data, updatedById: req.auth!.userId } });
    if (!result.count) { res.status(404).json({ message: "Registro não encontrado." }); return; }
    res.json(await prisma.leadershipOkrEvidence.findUnique({ where: { id } }));
  } catch (error) { console.error("[leadership-okr] update", error); res.status(500).json({ message: "Não foi possível atualizar a evidência." }); }
});
