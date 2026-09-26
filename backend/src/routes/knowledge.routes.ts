import { Router } from "express";
import { AzureDevOpsService } from "../services/AzureDevOpsService";
export const knowledgeRoutes=Router();const azure=new AzureDevOpsService();
const fail=(res:any,error:any)=>res.status(Number(error?.statusCode)||500).json({message:error instanceof Error?error.message:"Falha na Base de Conhecimento."});
knowledgeRoutes.get("/status",async(_req,res)=>{try{res.json({azure:await azure.getStatus()})}catch(error){fail(res,error)}});
knowledgeRoutes.get("/search",async(req,res)=>{try{const query=String(req.query.q??"");const wiki=await azure.searchWikiPages(query,12);res.json({items:wiki.map(item=>({...item,source:"azure-wiki"})),warnings:[]})}catch(error){fail(res,error)}});
