import { Router } from "express";
import { requireRoles } from "../middlewares/roleMiddleware";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { systemConfigurationService, type SystemConfigurationInput, type SystemConfigurationTestInput, type TeamsWorkflowSettingsInput } from "../services/SystemConfigurationService";
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

// Diagnóstico administrativo, somente leitura. Nunca retorna credenciais ou valores secretos.
systemSettingsRoutes.get("/credentials-health", async (_request, response) => {
  const keySource = process.env.SYSTEM_CONFIG_KEY?.trim()
    ? "dedicated"
    : process.env.JWT_SECRET?.trim() ? "legacy-jwt" : "missing";
  try {
    await systemConfigurationService.status();
    return response.json({ status: "readable", keySource, database: "ready" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const incompatible = message.startsWith("Falha ao descriptografar a configuração");
    return response.status(incompatible ? 409 : 503).json({
      status: incompatible ? "incompatible" : "unavailable",
      keySource,
      database: "unknown",
      message: incompatible
        ? "Credenciais persistidas incompatíveis com a chave atual. Não altere configurações antes de recuperar a chave original."
        : "Não foi possível verificar as configurações.",
    });
  }
});

// Apenas ADMIN. A chave é testada em memória; não há escrita nem retorno de segredo.
systemSettingsRoutes.post("/recovery/validate", async (request, response) => {
  const candidate = typeof request.body?.candidate === "string" ? request.body.candidate : "";
  if (candidate.length < 32 || candidate.length > 4096) {
    return response.status(400).json({ valid: false, message: "Informe uma chave válida (mínimo 32 caracteres)." });
  }
  try {
    const valid = await systemConfigurationService.validateRecoveryKey(candidate);
    return response.json({ valid });
  } catch {
    return response.status(503).json({ valid: false, message: "Não foi possível verificar os registros no banco." });
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

systemSettingsRoutes.post("/test", async (request: AuthenticatedRequest, response) => {
  try {
    return response.json(await systemConfigurationService.test(request.body as SystemConfigurationTestInput));
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : "Não foi possível validar a integração." });
  }
});

systemSettingsRoutes.put("/teams-workflows", async (request: AuthenticatedRequest, response) => {
  try {
    const userId = request.auth?.userId;
    if (!userId) return response.status(401).json({ message: "Autenticação necessária." });
    const settings = await systemConfigurationService.saveTeamsWorkflowSettings(
      request.body as TeamsWorkflowSettingsInput,
      userId,
    );
    return response.json(settings);
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : "Não foi possível salvar os fluxos do Teams." });
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
