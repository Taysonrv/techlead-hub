import { Router } from "express";
import { microsoftKnowledgeService } from "../services/MicrosoftKnowledgeService";
import { AzureDevOpsService } from "../services/AzureDevOpsService";

export const knowledgeRoutes = Router();
const azure = new AzureDevOpsService();
const userId = (req: any) => Number(req.auth?.userId);
const fail = (res: any, error: any) => res.status(Number(error?.statusCode) || 500).json({ message: error instanceof Error ? error.message : "Falha na Base de Conhecimento." });

knowledgeRoutes.get("/status", (req, res) => {
  try { res.json(microsoftKnowledgeService.status(userId(req))); } catch (error) { fail(res, error); }
});
knowledgeRoutes.post("/microsoft/connect", async (req, res) => {
  try { res.json(await microsoftKnowledgeService.startConnection(userId(req))); } catch (error) { fail(res, error); }
});
knowledgeRoutes.post("/microsoft/connect/:connectionId", async (req, res) => {
  try { res.json(await microsoftKnowledgeService.finishConnection(userId(req), req.params.connectionId)); } catch (error) { fail(res, error); }
});
knowledgeRoutes.delete("/microsoft/connect", (req, res) => res.json(microsoftKnowledgeService.disconnect(userId(req))));
knowledgeRoutes.get("/search", async (req, res) => {
  try {
    const query = String(req.query.q ?? "");
    const source = ["sharepoint", "bpmn"].includes(String(req.query.source)) ? req.query.source as "sharepoint" | "bpmn" : "all";
    const [wiki, microsoft] = await Promise.allSettled([
      source === "all" ? azure.searchWikiPages(query, 12) : Promise.resolve([]),
      microsoftKnowledgeService.search(userId(req), query, source),
    ]);
    res.json({
      items: [
        ...(wiki.status === "fulfilled" ? wiki.value.map((item) => ({ ...item, source: "azure-wiki" })) : []),
        ...(microsoft.status === "fulfilled" ? microsoft.value : []),
      ],
      warnings: [wiki, microsoft].filter((item) => item.status === "rejected").map((item: any) => item.reason?.message || "Fonte indisponível"),
    });
  } catch (error) { fail(res, error); }
});
