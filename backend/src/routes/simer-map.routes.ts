import { Router } from "express";
import { SimerMapController } from "../controllers/SimerMapController";
const simerMapRoutes = Router();
const controller = new SimerMapController();
simerMapRoutes.get("/summary", controller.summary);
simerMapRoutes.get("/search", controller.search);
simerMapRoutes.post("/import", controller.importMap);
export { simerMapRoutes };
