import { Router } from "express";
import { MovideskController } from "../controllers/MovideskController";
import { requirePermission } from "../middlewares/roleMiddleware";

export const movideskRoutes = Router();
const controller = new MovideskController();

movideskRoutes.post("/sync", requirePermission("imports"), controller.sync.bind(controller));

movideskRoutes.post("/baseline/start", requirePermission("imports"), controller.startBaseline.bind(controller));
movideskRoutes.get("/baseline/status", requirePermission("imports"), controller.baselineStatus.bind(controller));
movideskRoutes.get("/coverage", requirePermission("imports"), controller.coverage.bind(controller));
movideskRoutes.post("/sync/full", requirePermission("imports"), controller.fullSync.bind(controller));
movideskRoutes.get("/test", requirePermission("imports"), controller.test.bind(controller));
movideskRoutes.get("/scope/diagnostic", requirePermission("imports"), controller.diagnoseScope.bind(controller));
movideskRoutes.get("/enrichment/diagnostic", requirePermission("imports"), controller.diagnoseEnrichment.bind(controller));
movideskRoutes.get("/enrichment/recent", requirePermission("imports"), controller.recentEnrichments.bind(controller));
movideskRoutes.post("/enrichment/sync", requirePermission("imports"), controller.syncEnrichment.bind(controller));
movideskRoutes.post("/causes/backfill", requirePermission("imports"), controller.backfillCauses.bind(controller));
movideskRoutes.get("/classifications/coverage", requirePermission("imports"), controller.classificationCoverage.bind(controller));
movideskRoutes.get("/metadata/timeline", requirePermission("imports"), controller.analyticalMetadataTimeline.bind(controller));
movideskRoutes.get("/metadata/diagnostic", requirePermission("imports"), controller.diagnoseAnalyticalMetadata.bind(controller));
movideskRoutes.get("/catalog/diagnostic", requirePermission("imports"), controller.diagnoseApiCatalog.bind(controller));
movideskRoutes.post("/reference-sync", requirePermission("imports"), controller.syncReferenceData.bind(controller));
movideskRoutes.get("/reference-sync/status", requirePermission("imports"), controller.referenceSyncStatus.bind(controller));
movideskRoutes.get("/preview", requirePermission("imports"), controller.preview.bind(controller));
