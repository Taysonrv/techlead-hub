import { Router } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { requireRoles } from "../middlewares/roleMiddleware";
import { prisma } from "../database/prisma";
import { hashSessionToken } from "../utils/auth";

export const sessionRoutes = Router();

sessionRoutes.get("/current", async (request: AuthenticatedRequest, response) => {
  const token = request.auth?.sessionToken;
  if (!token) return response.status(401).json({ message: "Autenticação necessária." });
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { id: true, clientType: true, deviceName: true, deviceId: true, appVersion: true, ipAddress: true, createdAt: true, lastActivityAt: true, expiresAt: true },
  });
  return response.json({ session });
});

sessionRoutes.get("/", requireRoles("ADMIN"), async (_request, response) => {
  const sessions = await prisma.userSession.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true, clientType: true, deviceName: true, appVersion: true, ipAddress: true,
      createdAt: true, lastActivityAt: true, expiresAt: true,
      user: { select: { id: true, name: true, username: true } },
    },
    orderBy: { lastActivityAt: "desc" },
  });
  return response.json({ sessions });
});

sessionRoutes.delete("/:id", requireRoles("ADMIN"), async (request: AuthenticatedRequest, response) => {
  const sessionId = Number(request.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) return response.status(400).json({ message: "Sessão inválida." });
  const session = await prisma.userSession.findUnique({ where: { id: sessionId }, select: { id: true, userId: true, clientType: true } });
  if (!session) return response.status(404).json({ message: "Sessão não encontrada." });
  await prisma.$transaction([
    prisma.userSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }),
    prisma.auditLog.create({ data: { userId: request.auth?.userId, action: "SESSION_REVOKED_BY_ADMIN", entity: "UserSession", entityId: String(sessionId), metadata: { targetUserId: session.userId, clientType: session.clientType }, ipAddress: request.ip } }),
  ]);
  return response.json({ message: "Sessão encerrada com sucesso." });
});
