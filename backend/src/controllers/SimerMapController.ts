import type { Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { SimerMapService } from "../services/SimerMapService";

export class SimerMapController {
  private readonly service = new SimerMapService();
  summary = async (_req: AuthenticatedRequest, res: Response) => res.json(await this.service.summary());
  search = async (req: AuthenticatedRequest, res: Response) => res.json({ items: await this.service.search(String(req.query.q ?? ""), Number(req.query.limit ?? 50)) });
  context = async (req: AuthenticatedRequest, res: Response) => res.json({ items: await this.service.context(String(req.body?.text ?? ""), Number(req.body?.limit ?? 20)) });
  resolveContainer = async (req: AuthenticatedRequest, res: Response) => res.json({ item: await this.service.resolveContainer(Number(req.params.id)) });
  followLink = async (req: AuthenticatedRequest, res: Response) => res.json({ item: await this.service.followLink(Number(req.params.id)) });
  related = async (req: AuthenticatedRequest, res: Response) => res.json({ items: await this.service.related(Number(req.params.id)) });
  tree = async (req: AuthenticatedRequest, res: Response) => res.json({ items: await this.service.tree(String(req.query.sourceFile ?? ""), Number(req.query.focusId ?? 0) || undefined) });
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
