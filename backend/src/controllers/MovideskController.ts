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

    async fullSync(req: AuthenticatedRequest, res: Response) {
        try {
            return res.json(await new MovideskService().syncTickets(req.auth?.userId ?? null, true));
        } catch (error) {
            return res.status(500).json({ message: error instanceof Error ? error.message : "Não foi possível executar a carga completa do Movidesk." });
        }
    }

    async test(_req: AuthenticatedRequest, res: Response) {
        try {
            return res.json(await new MovideskService().testConnection());
        } catch (error) {
            return res.status(500).json({ message: error instanceof Error ? error.message : "Não foi possível validar a conexão com o Movidesk." });
        }
    }

}
