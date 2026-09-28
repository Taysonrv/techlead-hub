import { Router } from "express";
import { GlobalController } from "../controllers/GlobalController";
import { prisma } from "../database/prisma";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";

const globalRoutes = Router();
const controller = new GlobalController();
globalRoutes.get("/search", controller.search);
globalRoutes.get("/investigate", controller.investigate);
globalRoutes.get("/calendar", controller.calendar);
globalRoutes.post("/feedback", async (req: AuthenticatedRequest, res) => {
  const type = req.body?.type === "IMPROVEMENT" ? "IMPROVEMENT" : "BUG";
  const title = String(req.body?.title ?? "").trim().slice(0, 160);
  const description = String(req.body?.description ?? "").trim().slice(0, 4000);
  if (!title || !description) return res.status(400).json({ message: "Informe título e descrição." });
  await prisma.auditLog.create({ data: { userId: req.auth?.userId ?? null, action: "USER_FEEDBACK", entity: type, metadata: { title, description, path: String(req.body?.path ?? "").slice(0, 500), appVersion: String(req.body?.appVersion ?? "").slice(0, 80), userAgent: String(req.headers["user-agent"] ?? "").slice(0, 500) } } });
  return res.status(201).json({ message: type === "BUG" ? "Bug reportado com sucesso." : "Melhoria enviada com sucesso." });
});
globalRoutes.get("/feedback", async (req: AuthenticatedRequest, res) => {
  if (req.auth?.role !== "ADMIN") return res.status(403).json({ message: "Acesso administrativo necessário." });
  const items = await prisma.auditLog.findMany({ where: { action: "USER_FEEDBACK" }, include: { user: { select: { id: true, name: true, username: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return res.json({ items });
});
export { globalRoutes };
