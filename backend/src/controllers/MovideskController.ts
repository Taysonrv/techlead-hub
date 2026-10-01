import { Response } from "express";
import { MovideskService } from "../services/MovideskService";
import { referenceSyncStatus, runReferenceSync } from "../jobs/MovideskReferenceSyncScheduler";
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

    async syncReferenceData(_req: AuthenticatedRequest, res: Response) {
        const result = runReferenceSync();
        return res.status(result.accepted ? 202 : 200).json(result);
    }

    async referenceSyncStatus(_req: AuthenticatedRequest, res: Response) {
        return res.json(referenceSyncStatus());
    }

    async diagnoseApiCatalog(_req: AuthenticatedRequest, res: Response) {
        try {
            return res.json(await new MovideskService().diagnoseApiCatalog());
        } catch (error) {
            const message = error instanceof Error ? error.message : "Não foi possível diagnosticar o catálogo da API Movidesk.";
            console.error("[movidesk-api-catalog] Falha:", message);
            return res.status(500).json({ message });
        }
    }

    async diagnoseEnrichment(req: AuthenticatedRequest, res: Response) {
        try {
            const requested = req.query.ticketId ? Number(req.query.ticketId) : null;
            return res.json(await new MovideskService().diagnoseTicketEnrichment(Number.isSafeInteger(requested) ? requested : null));
        } catch (error) {
            const message = error instanceof Error ? error.message : "Não foi possível diagnosticar o enriquecimento Movidesk.";
            console.error("[movidesk-enrichment-diagnostic] Falha:", message);
            return res.status(500).json({ message });
        }
    }

    async diagnoseScope(req: AuthenticatedRequest, res: Response) {
        try {
            const requested = Number(req.query.limit ?? 3);
            return res.json(await new MovideskService().diagnoseScopedClients(requested));
        } catch (error) {
            const message = error instanceof Error ? error.message : "Não foi possível diagnosticar o escopo Movidesk.";
            console.error("[movidesk-scope-diagnostic] Falha:", message);
            return res.status(500).json({ message });
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
