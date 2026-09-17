import { Router } from "express";
import { MovideskController } from "../controllers/MovideskController";
import { requireRoles } from "../middlewares/roleMiddleware";

export const movideskRoutes = Router();
const controller = new MovideskController();

movideskRoutes.post("/sync", requireRoles("ADMIN", "COORDENADOR"), controller.sync.bind(controller));
