import type { Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { SimerMapService } from "../services/SimerMapService";
import { SystemRuleService } from "../services/SystemRuleService";

export class SimerMapController {
  private readonly service = new SimerMapService();
  private readonly rules = new SystemRuleService();
  summary = async (_req: AuthenticatedRequest, res: Response) => res.json(await this.service.summary());
  search = async (req: AuthenticatedRequest, res: Response) => res.json({ items: await this.service.search(String(req.query.q ?? ""), Number(req.query.limit ?? 50)) });
  context = async (req: AuthenticatedRequest, res: Response) => res.json({ items: await this.service.context(String(req.body?.text ?? ""), Number(req.body?.limit ?? 20)) });
  resolveContainer = async (req: AuthenticatedRequest, res: Response) => res.json({ item: await this.service.resolveContainer(Number(req.params.id)) });
  followLink = async (req: AuthenticatedRequest, res: Response) => res.json({ item: await this.service.followLink(Number(req.params.id)) });
  related = async (req: AuthenticatedRequest, res: Response) => res.json({ items: await this.service.related(Number(req.params.id)) });
  tree = async (req: AuthenticatedRequest, res: Response) => res.json({ items: await this.service.tree(String(req.query.sourceFile ?? ""), Number(req.query.focusId ?? 0) || undefined) });
  ruleSummary = async (_req: AuthenticatedRequest, res: Response) => res.json(await this.rules.summary());
  catalog = async (_req: AuthenticatedRequest, res: Response) => res.json(await this.rules.catalog());
  routine = async (req: AuthenticatedRequest, res: Response) => { const processId=Number(req.params.processId); const flow=await this.rules.flow(processId); if(!flow.process)return res.status(404).json({message:"Rotina não encontrada."}); const context=[flow.process.folderPath,flow.process.name,...flow.nodes.slice(0,12).map((n:any)=>n.name)].filter(Boolean).join(" "); const mapItems=await this.service.context(context,80); const correlations=await this.rules.correlate(context,mapItems,24); const maps=[...new Map(mapItems.map((m:any)=>[m.sourceFile,m])).values()].slice(0,12); return res.json({process:flow.process,nodes:flow.nodes,transitions:flow.transitions,maps,correlations,stats:{steps:flow.nodes.length,maps:maps.length,technicalPoints:mapItems.length,correlations:correlations.length}}); };
  investigate = async (req: AuthenticatedRequest, res: Response) => { const text=String(req.body?.text??""); const mapItems=await this.service.context(text,60); const [ruleItems,correlations]=await Promise.all([this.rules.search(text,30),this.rules.correlate(text,mapItems,20)]); return res.json({query:text,mapItems,ruleItems,correlations}); };
  ruleSearch = async (req: AuthenticatedRequest, res: Response) => res.json({ items: await this.rules.search(String(req.query.q ?? ""), Number(req.query.limit ?? 20)) });
  ruleFlow = async (req: AuthenticatedRequest, res: Response) => res.json(await this.rules.flow(Number(req.params.processId), Number(req.query.focusId ?? 0) || undefined));
  importRule = async (req: AuthenticatedRequest, res: Response) => {
    try { const sourceFile=String(req.body?.sourceFile??""); const base64=String(req.body?.base64??""); if(!sourceFile||!base64)return res.status(400).json({message:"Arquivo BPM e conteúdo são obrigatórios."}); return res.json(await this.rules.importBpm(sourceFile,base64)); }
    catch(error){return res.status(400).json({message:error instanceof Error?error.message:"Falha ao importar Regra do Sistema."});}
  };
  builderStatus = async (_req: AuthenticatedRequest, res: Response) => res.json(await this.service.builderStatus());
  importBatch = async (req: AuthenticatedRequest, res: Response) => {
    try { const files = Array.isArray(req.body?.files) ? req.body.files : []; if (!files.length || files.length > 20) return res.status(400).json({ message: "Envie de 1 a 20 mapas por lote." }); return res.json(await this.service.importBatch(files)); }
    catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Falha ao importar lote." }); }
  };
  importMap = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sourceFile = typeof req.body?.sourceFile === "string" ? req.body.sourceFile.trim() : "";
      const content = typeof req.body?.content === "string" ? req.body.content : "";
      if (!sourceFile || !content) return res.status(400).json({ message: "Arquivo e conteúdo do mapa são obrigatórios." });
      return res.json(await this.service.importMap(sourceFile, content));
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Não foi possível importar o mapa." });
    }
  };
}
