import type { Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { SimerMapService } from "../services/SimerMapService";

export class SimerMapController {
  private readonly service = new SimerMapService();
  summary = async (_req: AuthenticatedRequest, res: Response) => res.json(await this.service.summary());
  search = async (req: AuthenticatedRequest, res: Response) => res.json({ items: await this.service.search(String(req.query.q ?? ""), Number(req.query.limit ?? 50)) });
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
