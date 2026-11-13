import { Router } from "express";
import { requirePermission } from "../middlewares/roleMiddleware";

export const integrationDiagnosticsRoutes = Router();
integrationDiagnosticsRoutes.use(requirePermission("imports"));

type ProbeState = "available" | "unavailable";
async function probe(url: string): Promise<{ state: ProbeState; latencyMs: number }> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "TechLead-Hub/2.1" },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    // Um 404 pode significar recurso não encontrado, não indisponibilidade do serviço.
    return { state: response.status < 500 && response.status !== 429 ? "available" : "unavailable", latencyMs: Date.now() - started };
  } catch {
    return { state: "unavailable", latencyMs: Date.now() - started };
  }
}

integrationDiagnosticsRoutes.get("/public-apis", async (_req, res) => {
  const sources = [
    { id: "brasilapi", name: "BrasilAPI", url: "https://brasilapi.com.br/api/cep/v1/01001000" },
    { id: "viacep", name: "ViaCEP", url: "https://viacep.com.br/ws/01001000/json/" },
    { id: "github", name: "GitHub", url: "https://api.github.com/repos/Taysonrv/techlead-hub" },
  ] as const;
  const results = await Promise.all(sources.map(async ({ id, name, url }) => ({
    id, name, ...await probe(url),
  })));
  res.setHeader("Cache-Control", "no-store");
  res.json({ checkedAt: new Date().toISOString(), sources: results, note: "Disponibilidade da rede do servidor; não valida credenciais, releases privados ou funcionamento das sincronizações." });
});
