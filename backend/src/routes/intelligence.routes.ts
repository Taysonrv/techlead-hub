import { Router } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { requireAnyPermission } from "../middlewares/routinePermissionMiddleware";
import { operationalIntelligenceService } from "../services/OperationalIntelligenceService";

export const intelligenceRoutes=Router();
intelligenceRoutes.use(requireAnyPermission("dashboard","tickets","attention","coordination","known-problems"));

intelligenceRoutes.get("/overview",async(req:AuthenticatedRequest,res)=>{
  try{
    const days=Number(req.query.days??90);
    res.json(await operationalIntelligenceService.overview(Number.isFinite(days)?days:90));
  }catch(error){
    console.error("[intelligence] overview",error);
    res.status(500).json({error:"Não foi possível gerar a inteligência operacional."});
  }
});
