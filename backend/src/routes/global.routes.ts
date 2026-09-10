import { Router } from "express";
import { GlobalController } from "../controllers/GlobalController";

const globalRoutes = Router();
const controller = new GlobalController();
globalRoutes.get("/search", controller.search);
globalRoutes.get("/calendar", controller.calendar);
export { globalRoutes };
