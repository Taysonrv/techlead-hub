import { Router } from "express";
import { MovideskController } from "../controllers/MovideskController";

export const movideskRoutes = Router();
const controller = new MovideskController();

movideskRoutes.post("/sync", controller.sync.bind(controller));
