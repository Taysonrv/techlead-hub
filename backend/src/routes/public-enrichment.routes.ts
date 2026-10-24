import { Router } from "express";
import { requireAnyPermission } from "../middlewares/routinePermissionMiddleware";

/**
 * Consultas complementares somente leitura.
 * Hosts e caminhos são fixos: entradas do usuário nunca controlam a URL remota.
 * As fontes externas não substituem os registros oficiais do Movidesk/Azure.
 */
export const publicEnrichmentRoutes = Router();

const readAccess = requireAnyPermission("clients", "tickets", "dashboard", "versions", "data-quality");
publicEnrichmentRoutes.use(readAccess);

async function fetchPublicJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    headers: { Accept: "application/json", "User-Agent": "TechLead-Hub/2.1" },
    redirect: "error",
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error("Fonte pública temporariamente indisponível.");
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 250_000) throw new Error("Resposta externa excedeu o limite permitido.");
  const body = await response.text();
  if (body.length > 250_000) throw new Error("Resposta externa excedeu o limite permitido.");
  return JSON.parse(body) as unknown;
}

publicEnrichmentRoutes.get("/cnpj/:cnpj", async (req, res) => {
  const cnpj = String(req.params.cnpj).replace(/\D/g, "");
  if (!/^\d{14}$/.test(cnpj)) { res.status(400).json({ message: "CNPJ inválido." }); return; }
  try {
    const data = await fetchPublicJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!data) { res.status(404).json({ message: "CNPJ não encontrado na fonte pública." }); return; }
    const record = data as Record<string, unknown>;
    res.json({ source: "BrasilAPI", consultedAt: new Date().toISOString(), data: {
      cnpj: record.cnpj, razaoSocial: record.razao_social, nomeFantasia: record.nome_fantasia,
      situacaoCadastral: record.descricao_situacao_cadastral, municipio: record.municipio,
      uf: record.uf, cep: record.cep, logradouro: record.logradouro,
    } });
  } catch { res.status(503).json({ message: "Consulta pública de CNPJ indisponível. Os dados internos permanecem inalterados." }); }
});

publicEnrichmentRoutes.get("/cep/:cep", async (req, res) => {
  const cep = String(req.params.cep).replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep)) { res.status(400).json({ message: "CEP inválido." }); return; }
  try {
    const data = await fetchPublicJson(`https://viacep.com.br/ws/${cep}/json/`);
    const record = data as Record<string, unknown> | null;
    if (!record || record.erro) { res.status(404).json({ message: "CEP não encontrado." }); return; }
    res.json({ source: "ViaCEP", consultedAt: new Date().toISOString(), data: {
      cep: record.cep, logradouro: record.logradouro, complemento: record.complemento,
      bairro: record.bairro, localidade: record.localidade, uf: record.uf, ibge: record.ibge,
    } });
  } catch { res.status(503).json({ message: "Consulta pública de CEP indisponível. Os dados internos permanecem inalterados." }); }
});

publicEnrichmentRoutes.get("/releases", async (_req, res) => {
  try {
    const data = await fetchPublicJson("https://api.github.com/repos/Taysonrv/techlead-hub/releases?per_page=10");
    const releases = Array.isArray(data) ? data : [];
    res.json({ source: "GitHub", consultedAt: new Date().toISOString(), releases: releases.map((entry: unknown) => {
      const release = entry as Record<string, unknown>;
      return { tag: release.tag_name, name: release.name, publishedAt: release.published_at,
        prerelease: release.prerelease, url: release.html_url };
    }) });
  } catch { res.status(503).json({ message: "GitHub temporariamente indisponível. O aplicativo continua funcionando." }); }
});
