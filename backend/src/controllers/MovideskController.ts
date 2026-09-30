import { Response } from "express";
import { MovideskService } from "../services/MovideskService";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";

export class MovideskController {

    async sync(req: AuthenticatedRequest, res: Response) {
        try {
            const service = new MovideskService();
            const result = await service.syncTickets(req.auth?.userId ?? null);
            return res.json(result);
        } catch (error) {
            return res.status(500).json({
                message: error instanceof Error ? error.message : "Não foi possível sincronizar o Movidesk.",
            });
        }

    }

    async startBaseline(req: AuthenticatedRequest, res: Response) {
        try {
            const result = await new MovideskService().startBaseline(req.auth?.userId ?? null);
            return res.status(result.accepted ? 202 : 200).json(result);
        } catch (error) {
            return res.status(500).json({ message: error instanceof Error ? error.message : "Não foi possível iniciar o baseline Movidesk." });
        }
    }

    async baselineStatus(_req: AuthenticatedRequest, res: Response) {
        try {
            return res.json(await new MovideskService().baselineStatus());
        } catch (error) {
            return res.status(500).json({ message: error instanceof Error ? error.message : "Não foi possível consultar o baseline Movidesk." });
        }
    }

    async coverage(_req: AuthenticatedRequest, res: Response) {
        try {
            return res.json(await new MovideskService().dataCoverage());
        } catch (error) {
            return res.status(500).json({ message: error instanceof Error ? error.message : "Não foi possível auditar os dados Movidesk." });
        }
    }

    async fullSync(req: AuthenticatedRequest, res: Response) {
        try {
            return res.json(await new MovideskService().syncTickets(req.auth?.userId ?? null, true));
        } catch (error) {
            return res.status(500).json({ message: error instanceof Error ? error.message : "Não foi possível executar a carga completa do Movidesk." });
        }
    }

    async preview(req: AuthenticatedRequest, res: Response) {
        try {
            const requested = Number(req.query.limit ?? 25);
            return res.json(await new MovideskService().previewTickets(requested));
        } catch (error) {
            const message = error instanceof Error ? error.message : "Não foi possível pré-validar os dados do Movidesk.";
            console.error("[movidesk-preview] Falha na pré-validação:", message);
            return res.status(500).json({ message });
        }
    }

    async test(_req: AuthenticatedRequest, res: Response) {
        try {
            return res.json(await new MovideskService().testConnection());
        } catch (error) {
            const message = error instanceof Error ? error.message : "Não foi possível validar a conexão com o Movidesk.";
            console.error("[movidesk-test] Falha ao validar conexão:", message);
            return res.status(500).json({ message });
        }
    }

}
