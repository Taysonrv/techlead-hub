import { useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Collapse, Divider, Stack, TextField, Typography } from "@mui/material";
import { api } from "../services/api";

type Result = { source: string; consultedAt: string; data: Record<string, unknown> };
type Release = { tag: string; name: string; publishedAt: string; prerelease: boolean; url: string };

export function PublicClientEnrichment() {
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState<"cnpj" | "cep">("cnpj");
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function consult() {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== (kind === "cnpj" ? 14 : 8)) { setError(kind === "cnpj" ? "Informe um CNPJ com 14 dígitos." : "Informe um CEP com 8 dígitos."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await api.get<Result>(`/public-enrichment/${kind}/${digits}`);
      setResult(response.data);
    } catch { setError("Não foi possível consultar a fonte pública neste momento."); }
    finally { setLoading(false); }
  }
  return (
    <Card variant="outlined" sx={{ mb: 2, borderRadius: 2.5 }}>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Box><Typography sx={{ fontWeight: 800 }}>Consulta cadastral pública</Typography>
            <Typography variant="caption" color="text.secondary">Dados complementares da BrasilAPI e ViaCEP; não alteram o cadastro do Movidesk.</Typography></Box>
          <Button size="small" variant="outlined" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? "Recolher" : "Consultar"}</Button>
        </Stack>
        <Collapse in={expanded}>
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1, mt: 2 }}>
            <Button variant={kind === "cnpj" ? "contained" : "outlined"} onClick={() => { setKind("cnpj"); setValue(""); setResult(null); setError(""); }}>CNPJ</Button>
            <Button variant={kind === "cep" ? "contained" : "outlined"} onClick={() => { setKind("cep"); setValue(""); setResult(null); setError(""); }}>CEP</Button>
            <TextField size="small" label={kind === "cnpj" ? "CNPJ" : "CEP"} value={value} onChange={event => setValue(event.target.value)} slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 20 } }} sx={{ flex: 1 }} />
            <Button variant="contained" disabled={loading} onClick={() => void consult()}>{loading ? "Consultando..." : "Pesquisar"}</Button>
          </Stack>
          {error && <Alert severity="warning" sx={{ mt: 2 }}>{error}</Alert>}
          {result && <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 1.5 }}/><Chip size="small" label={result.source} variant="outlined"/>
            <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))" }, gap: 1 }}>
              {Object.entries(result.data).filter(([, entry]) => entry !== null && entry !== undefined && entry !== "").map(([key, entry]) => (
                <Box key={key} sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">{key}</Typography><Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{String(entry)}</Typography></Box>
              ))}
            </Box>
          </Box>}
        </Collapse>
      </CardContent>
    </Card>
  );
}

export function GitHubReleasePanel() {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function consult() {
    setLoading(true); setError("");
    try {
      const response = await api.get<{ releases: Release[] }>("/public-enrichment/releases");
      setReleases(response.data.releases);
    } catch { setError("Não foi possível consultar as versões públicas do GitHub."); }
    finally { setLoading(false); }
  }
  return <Card variant="outlined" sx={{ mb: 2, borderRadius: 2.5 }}><CardContent>
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
      <Box><Typography sx={{ fontWeight: 800 }}>Publicações do TechLead Hub</Typography>
        <Typography variant="caption" color="text.secondary">Releases oficiais disponíveis no GitHub. Não altera o atualizador instalado.</Typography></Box>
      <Button variant="outlined" size="small" disabled={loading} onClick={() => void consult()}>{loading ? "Consultando..." : "Consultar releases"}</Button>
    </Stack>
    {error && <Alert severity="warning" sx={{ mt: 2 }}>{error}</Alert>}
    {releases && <Stack spacing={1} sx={{ mt: 2 }}>
      {releases.length === 0 && <Typography variant="body2">Nenhuma publicação pública encontrada.</Typography>}
      {releases.map(release => <Stack key={release.tag} direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Chip label={release.tag} size="small" color={release.prerelease ? "warning" : "success"} variant="outlined"/>
        <Typography variant="body2">{release.name || release.tag}</Typography>
        <Typography variant="caption" color="text.secondary">{release.publishedAt ? new Date(release.publishedAt).toLocaleDateString("pt-BR") : ""}</Typography>
        {release.url?.startsWith("https://github.com/Taysonrv/techlead-hub/releases/") && <Button size="small" href={release.url} target="_blank" rel="noopener noreferrer">Detalhes</Button>}
      </Stack>)}
    </Stack>}
  </CardContent></Card>;
}
