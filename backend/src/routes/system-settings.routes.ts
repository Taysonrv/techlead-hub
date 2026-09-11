import { Router } from "express";
import { requireRoles } from "../middlewares/roleMiddleware";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { systemConfigurationService, type SystemConfigurationInput } from "../services/SystemConfigurationService";

export const systemSettingsRoutes = Router();

systemSettingsRoutes.use(requireRoles("ADMIN"));

systemSettingsRoutes.get("/", async (_request, response) => {
  try {
    return response.json(await systemConfigurationService.status());
  } catch (error) {
    return response.status(500).json({ message: error instanceof Error ? error.message : "Não foi possível carregar as configurações." });
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
