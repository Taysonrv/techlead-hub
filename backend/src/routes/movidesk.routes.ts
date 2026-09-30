import { Router } from "express";
import { MovideskController } from "../controllers/MovideskController";
import { requirePermission } from "../middlewares/roleMiddleware";

export const movideskRoutes = Router();
const controller = new MovideskController();

movideskRoutes.post("/sync", requirePermission("imports"), controller.sync.bind(controller));

movideskRoutes.post("/sync/full", requirePermission("imports"), controller.fullSync.bind(controller));
movideskRoutes.get("/test", requirePermission("imports"), controller.test.bind(controller));
