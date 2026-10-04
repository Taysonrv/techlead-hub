import { Response } from "express";
import { MovideskService } from "../services/MovideskService";
import { releaseMovideskApi, tryAcquireMovideskApi } from "../jobs/MovideskSyncCoordinator";
import { referenceSyncStatus, runReferenceSync } from "../jobs/MovideskReferenceSyncScheduler";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { movideskEnrichmentSchedulerStatus } from "../jobs/MovideskEnrichmentScheduler";


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
            const baseline = await new MovideskService().baselineStatus();
            return res.json({ ...baseline, enrichmentScheduler: movideskEnrichmentSchedulerStatus() });
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

    async diagnoseAnalyticalMetadata(req: AuthenticatedRequest, res: Response) {
        try {
            const raw = typeof req.query.tickets === "string" ? req.query.tickets : "";
            const ids = raw.split(",").map((value) => Number(value.trim())).filter((value) => Number.isSafeInteger(value) && value > 0);
            if (!ids.length) return res.status(400).json({ message: "Informe tickets separados por vírgula." });
            return res.json(await new MovideskService().diagnoseAnalyticalMetadata(ids));
        } catch (error) {
            const message = error instanceof Error ? error.message : "Não foi possível diagnosticar os metadados analíticos.";
            console.error("[movidesk-analytical-metadata] Falha:", message);
            return res.status(500).json({ message });
        }
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

    async syncEnrichment(req: AuthenticatedRequest, res: Response) {
        if (!tryAcquireMovideskApi("ENRICHMENT")) {
            return res.status(409).json({ message: "Outra rotina Movidesk está utilizando a API. Tente novamente após a conclusão da sincronização atual." });
        }
        try {
            const requested = Number(req.body?.limit ?? req.query.limit ?? 100);
            const limit = Number.isSafeInteger(requested) ? requested : 100;
            return res.json(await new MovideskService().syncTicketEnrichment(limit));
        } catch (error) {
            const message = error instanceof Error ? error.message : "Não foi possível sincronizar ações e apontamentos do Movidesk.";
            console.error("[movidesk-enrichment-sync] Falha:", message);
            return res.status(500).json({ message });
        } finally {
            releaseMovideskApi("ENRICHMENT");
        }
    }

    async backfillCauses(_req: AuthenticatedRequest, res: Response) {
        const waitForApi = async () => {
            const deadline = Date.now() + 90_000;
            while (Date.now() < deadline) {
                if (tryAcquireMovideskApi("MANUAL")) return true;
                await new Promise((resolve) => setTimeout(resolve, 1_500));
            }
            return false;
        };
        if (!(await waitForApi())) {
            return res.status(409).json({ message: "A API Movidesk permaneceu ocupada por mais de 90 segundos. O processamento atual não foi interrompido; tente novamente após a conclusão do lote." });
        }
        try {
            return res.json(await new MovideskService().backfillTicketCauses());
        } catch (error) {
            const message = error instanceof Error ? error.message : "Não foi possível consolidar as causas e motivos Movidesk.";
            console.error("[movidesk-classification-backfill] Falha:", message);
            return res.status(500).json({ message });
        } finally {
            releaseMovideskApi("MANUAL");
        }
    }

    async classificationCoverage(_req: AuthenticatedRequest, res: Response) {
        try {
            return res.json(await new MovideskService().classificationCoverage());
        } catch (error) {
            const message = error instanceof Error ? error.message : "Não foi possível diagnosticar a cobertura de causas e motivos.";
            console.error("[movidesk-classification-coverage] Falha:", message);
            return res.status(500).json({ message });
        }
    }

    async recentEnrichments(req: AuthenticatedRequest, res: Response) {
        try {
            const requested = Number(req.query.limit ?? 10);
            return res.json(await new MovideskService().recentEnrichments(Number.isSafeInteger(requested) ? requested : 10));
        } catch (error) {
            const message = error instanceof Error ? error.message : "Não foi possível consultar os últimos enriquecimentos Movidesk.";
            console.error("[movidesk-enrichment-recent] Falha:", message);
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
