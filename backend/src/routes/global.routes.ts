import { Router } from "express";
import { GlobalController } from "../controllers/GlobalController";
import { prisma } from "../database/prisma";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { calendarMeetingService } from "../services/CalendarMeetingService";

const globalRoutes = Router();
const controller = new GlobalController();
globalRoutes.get("/search", controller.search);
globalRoutes.get("/investigate", controller.investigate);
globalRoutes.get("/investigate-topic", controller.investigateTopic);
globalRoutes.get("/calendar", controller.calendar);
globalRoutes.get("/calendar/participants", async (_req: AuthenticatedRequest, res) => {
  try {
    return res.json({ participants: await calendarMeetingService.participants() });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : "Não foi possível carregar os participantes." });
  }
});
globalRoutes.get("/calendar/meetings/:meetingId", async (req: AuthenticatedRequest, res) => {
  try {
    const meetingId = Number(req.params.meetingId);
    if (!Number.isSafeInteger(meetingId) || meetingId <= 0) return res.status(400).json({ message: "Reunião inválida." });
    return res.json({ meeting: await calendarMeetingService.get(req.auth!.userId, req.auth!.role, meetingId) });
  } catch (error) {
    const typed = error as { statusCode?: number; message?: string };
    return res.status(typed.statusCode ?? 500).json({ message: typed.message ?? "Não foi possível carregar a reunião." });
  }
});
globalRoutes.post("/calendar/meetings", async (req: AuthenticatedRequest, res) => {
  try {
    const meeting = await calendarMeetingService.create(req.auth!.userId, req.auth!.role, req.body ?? {});
    return res.status(201).json({ meeting });
  } catch (error) {
    console.error("[calendar] Falha ao agendar reunião:", error);
    const typed = error as { statusCode?: number; message?: string };
    return res.status(typed.statusCode ?? 500).json({ message: typed.message ?? "Não foi possível agendar a reunião." });
  }
});
globalRoutes.put("/calendar/meetings/:meetingId", async (req: AuthenticatedRequest, res) => {
  try {
    const meetingId = Number(req.params.meetingId);
    if (!Number.isSafeInteger(meetingId) || meetingId <= 0) return res.status(400).json({ message: "Reunião inválida." });
    const meeting = await calendarMeetingService.update(req.auth!.userId, req.auth!.role, meetingId, req.body ?? {});
    return res.json({ meeting });
  } catch (error) {
    console.error("[calendar] Falha ao atualizar reunião:", error);
    const typed = error as { statusCode?: number; message?: string };
    return res.status(typed.statusCode ?? 500).json({ message: typed.message ?? "Não foi possível atualizar a reunião." });
  }
});
globalRoutes.delete("/calendar/meetings/:meetingId", async (req: AuthenticatedRequest, res) => {
  try {
    const meetingId = Number(req.params.meetingId);
    if (!Number.isSafeInteger(meetingId) || meetingId <= 0) return res.status(400).json({ message: "Reunião inválida." });
    await calendarMeetingService.cancel(req.auth!.userId, req.auth!.role, meetingId);
    return res.status(204).send();
  } catch (error) {
    console.error("[calendar] Falha ao cancelar reunião:", error);
    const typed = error as { statusCode?: number; message?: string };
    return res.status(typed.statusCode ?? 500).json({ message: typed.message ?? "Não foi possível cancelar a reunião." });
  }
});
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
