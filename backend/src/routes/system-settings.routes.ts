import { Router } from "express";
import { requireRoles } from "../middlewares/roleMiddleware";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { systemConfigurationService, type SystemConfigurationInput } from "../services/SystemConfigurationService";
import { prisma } from "../database/prisma";

export const systemSettingsRoutes = Router();

systemSettingsRoutes.use(requireRoles("ADMIN"));

systemSettingsRoutes.get("/", async (_request, response) => {
  try {
    return response.json(await systemConfigurationService.status());
  } catch (error) {
    return response.status(500).json({ message: error instanceof Error ? error.message : "Não foi possível carregar as configurações." });
  }
});

systemSettingsRoutes.get("/diagnostics", async (_request, response) => {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return response.json({
      status: "ready",
      appVersion: process.env.APP_VERSION?.trim() || "development",
      runtime: process.env.APP_RUNTIME?.trim() || "desktop",
      nodeVersion: process.version,
      database: { status: "ready", latencyMs: Date.now() - startedAt },
      sessionPolicy: { exclusiveAcrossPlatforms: true, idleTimeoutMinutes: 5 },
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return response.status(503).json({ status: "unavailable", database: { status: "unavailable" }, checkedAt: new Date().toISOString() });
  }
});

systemSettingsRoutes.put("/", async (request: AuthenticatedRequest, response) => {
  try {
    const userId = request.auth?.userId;
    if (!userId) return response.status(401).json({ message: "Autenticação necessária." });
    const result = await systemConfigurationService.save(request.body as SystemConfigurationInput, userId);
    return response.json({ ...result, restartRequired: true });
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : "Não foi possível salvar as configurações." });
  }
});
