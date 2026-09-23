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
