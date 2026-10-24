import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, Typography } from "@mui/material";
import { api } from "../services/api";

type Health = "healthy" | "attention" | "critical" | "unknown";
type Provider = { configured: boolean; health: { state: Health; ageMinutes: number | null; stale: boolean } };
type Summary = { checkedAt: string; providers: { movidesk: Provider; azureDevOps: Provider } };
type Diagnostics = { checkedAt: string; sources: { id: string; name: string; state: "available" | "unavailable"; latencyMs: number }[]; note: string };

function healthLabel(provider: Provider) {
  if (!provider.configured) return "Configuração não identificada";
  if (provider.health.state === "critical") return "Falha ou execução prolongada";
  if (provider.health.state === "attention") return "Sincronização atrasada";
  if (provider.health.state === "healthy") return "Sincronização recente";
  return "Sem histórico suficiente";
}

export function IntegrationDiagnosticsPanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [probeError, setProbeError] = useState("");
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setSummaryError("");
    try {
      const response = await api.get<Summary>("/sync-center/summary");
      setSummary(response.data);
    } catch {
      setSummaryError("Não foi possível carregar o diagnóstico das sincronizações. Verifique a conexão com o backend.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function checkPublicApis() {
    setProbing(true); setProbeError("");
    try {
      const response = await api.get<Diagnostics>("/integration-diagnostics/public-apis");
      setDiagnostics(response.data);
    } catch {
      setProbeError("Não foi possível verificar a disponibilidade das APIs externas.");
    } finally { setProbing(false); }
  }

  return <Card variant="outlined" sx={{ mb: 3, borderRadius: 2.5 }}>
    <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: "1rem" }}>Diagnóstico e ações recomendadas</Typography>
          <Typography variant="body2" color="text.secondary">Verificações somente leitura. Nenhuma sincronização é iniciada por este painel.</Typography>
        </Box>
        <Button variant="outlined" size="small" disabled={loading} onClick={() => void refresh()}>{loading ? "Atualizando..." : "Atualizar diagnóstico"}</Button>
      </Stack>
      {summaryError && <Alert severity="warning" sx={{ mt: 2 }}>{summaryError}</Alert>}
      {summary && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5, mt: 2 }}>
        {([
          ["Movidesk", summary.providers.movidesk],
          ["Azure DevOps", summary.providers.azureDevOps],
        ] as const).map(([name, provider]) => (
          <Box key={name} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <Typography sx={{ fontWeight: 750 }}>{name}</Typography>
              <Chip size="small" color={!provider.configured || provider.health.state === "critical" ? "error" : provider.health.state === "healthy" ? "success" : "warning"} label={healthLabel(provider)} />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {provider.health.ageMinutes === null ? "Nenhuma execução registrada." : `Última execução iniciada há ${provider.health.ageMinutes} minuto(s).`}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {!provider.configured ? "Ação: conferir as configurações da integração em Geral & Acessos. Não substitua credenciais sem verificar a chave original." :
                provider.health.state === "critical" ? "Ação: consultar o histórico de sincronizações e os erros da última execução." :
                provider.health.state === "attention" ? "Ação: conferir o agendamento e o histórico antes de iniciar nova carga." :
                provider.health.state === "unknown" ? "Ação: verificar o histórico e a configuração do agendador." :
                "Nenhuma ação imediata indicada pelo histórico."}
            </Typography>
          </Box>
        ))}
      </Box>}
      <Divider sx={{ my: 2 }}/>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Box>
          <Typography sx={{ fontWeight: 750 }}>Disponibilidade das APIs públicas</Typography>
          <Typography variant="caption" color="text.secondary">BrasilAPI, ViaCEP e GitHub · teste realizado pelo servidor, sob demanda.</Typography>
        </Box>
        <Button size="small" variant="outlined" disabled={probing} onClick={() => void checkPublicApis()}>{probing ? "Verificando..." : "Testar APIs públicas"}</Button>
      </Stack>
      {probeError && <Alert severity="warning" sx={{ mt: 1.5 }}>{probeError}</Alert>}
      {diagnostics && <Box sx={{ mt: 1.5 }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          {diagnostics.sources.map(source => <Chip key={source.id} size="small" variant="outlined" color={source.state === "available" ? "success" : "error"} label={`${source.name}: ${source.state === "available" ? "Acessível" : "Indisponível"} (${source.latencyMs} ms)`}/>)}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>{diagnostics.note}</Typography>
        <Typography variant="caption" color="text.secondary">Verificado em {new Date(diagnostics.checkedAt).toLocaleString("pt-BR")}.</Typography>
      </Box>}
    </CardContent>
  </Card>;
}
