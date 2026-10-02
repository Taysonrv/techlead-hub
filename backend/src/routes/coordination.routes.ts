import { Router } from "express";
import { requirePermission } from "../middlewares/roleMiddleware";
import { coordinationService } from "../services/CoordinationService";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";

const coordinationRoutes = Router();
coordinationRoutes.use((req, res, next) => {
  const permission = req.path.startsWith("/services") ? "services" : "coordination";
  return requirePermission(permission)(req as AuthenticatedRequest, res, next);
});
coordinationRoutes.get("/details", async (req: AuthenticatedRequest, res) => {
  try {
    const kind = String(req.query.kind ?? "backlog");
    const analyst = typeof req.query.analyst === "string" ? req.query.analyst : undefined;
    const serviceModule = typeof req.query.serviceModule === "string" ? req.query.serviceModule : undefined;
    const serviceClient = typeof req.query.serviceClient === "string" ? req.query.serviceClient : undefined;
    const serviceName = typeof req.query.serviceName === "string" ? req.query.serviceName : undefined;
    const parsedLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
    const serviceDays = Number(req.query.serviceDays ?? 0);
    res.json(await coordinationService.details(kind, analyst, limit, serviceModule, serviceClient, serviceName, Number.isFinite(serviceDays) ? serviceDays : 0));
  } catch (error) {
    console.error("[coordination] Falha ao carregar detalhes:", error);
    res.status(500).json({ error: "Não foi possível carregar os detalhes da coordenação." });
  }
});

coordinationRoutes.get("/productivity-capacity", async (req: AuthenticatedRequest, res) => {
  try {
    const parsedDays = Number(req.query.days ?? 28);
    res.json(await coordinationService.productivityCapacity(Number.isFinite(parsedDays) ? parsedDays : 28));
  } catch (error) {
    console.error("[coordination] Falha ao montar capacidade produtiva:", error);
    res.status(500).json({ error: "Não foi possível gerar a capacidade produtiva." });
  }
});

coordinationRoutes.get("/services", async (req: AuthenticatedRequest, res) => {
  try {
    const client = typeof req.query.client === "string" ? req.query.client.trim() : undefined;
    const analyst = typeof req.query.analyst === "string" ? req.query.analyst.trim() : undefined;
    const parsedMonths = Number(req.query.months ?? 6);
    const months = Number.isFinite(parsedMonths) ? parsedMonths : 6;
    res.json(await coordinationService.serviceIntelligence({ client, analyst, months }));
  } catch (error) {
    console.error("[coordination] Falha ao montar inteligência de serviços:", error);
    res.status(500).json({ error: "Não foi possível gerar a inteligência de serviços." });
  }
});

coordinationRoutes.get("/integration-health", async (_req: AuthenticatedRequest, res) => {
  try {
    res.json(await coordinationService.integrationHealth());
  } catch (error) {
    console.error("[coordination] Falha ao consultar saúde das integrações:", error);
    res.status(500).json({ error: "Não foi possível consultar a saúde das integrações." });
  }
});

coordinationRoutes.get("/csat", async (req: AuthenticatedRequest, res) => {
  try {
    const days = Number(req.query.days ?? 180);
    res.json(await coordinationService.csatOverview(Number.isFinite(days) ? days : 180));
  } catch (error) {
    console.error("[coordination] Falha na análise CSAT:", error);
    res.status(500).json({ error: "Não foi possível gerar a análise de CSAT." });
  }
});

coordinationRoutes.get("/csat/details", async (req: AuthenticatedRequest, res) => {
  try {
    const days = Number(req.query.days ?? 180);
    const value = req.query.value === undefined ? undefined : Number(req.query.value);
    res.json(await coordinationService.csatDetails(Number.isFinite(days) ? days : 180, {
      client: typeof req.query.client === "string" ? req.query.client : undefined,
      analyst: typeof req.query.analyst === "string" ? req.query.analyst : undefined,
      service: typeof req.query.service === "string" ? req.query.service : undefined,
      value: value !== undefined && Number.isFinite(value) ? value : undefined,
      commentsOnly: req.query.commentsOnly === "true",
    }));
  } catch (error) {
    console.error("[coordination] Falha ao carregar detalhes CSAT:", error);
    res.status(500).json({ error: "Não foi possível carregar os detalhes de CSAT." });
  }
});

coordinationRoutes.get("/sla-development", async (req: AuthenticatedRequest, res) => {
  try {
    const days = Number(req.query.days ?? 180);
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    res.json(await coordinationService.slaDevelopmentFlow(Number.isFinite(days) ? days : 180, startDate, endDate));
  } catch (error) {
    console.error("[coordination] Falha na análise SLA x desenvolvimento:", error);
    res.status(500).json({ error: "Não foi possível gerar a análise SLA x desenvolvimento." });
  }
});

coordinationRoutes.get("/summary", async (req: AuthenticatedRequest, res) => {
  try {
    const serviceDays = Number(req.query.serviceDays ?? 0);
    res.json(await coordinationService.summary(req.auth!.userId, Number.isFinite(serviceDays) ? serviceDays : 0));
  }
  catch (error) { console.error("[coordination] Falha ao montar visão:", error); res.status(500).json({ error: "Não foi possível gerar a visão de coordenação." }); }
});
export { coordinationRoutes };
