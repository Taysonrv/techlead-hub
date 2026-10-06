import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArrowForwardOutlined,
  AutoAwesomeOutlined,
  ChatOutlined,
  DashboardOutlined,
  NewReleasesOutlined,
  OpenInNewOutlined,
  PersonOutlined,
  SearchOutlined,
} from "@mui/icons-material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { aliareColors } from "../theme/theme";
import { FALLBACK_APP_VERSION, getReleaseNote } from "../config/releaseNotes";

const STORAGE_PREFIX = "techlead-hub:release-seen:";

export function ReleaseHighlights() {
  const navigate = useNavigate();
  const [version, setVersion] = useState("");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let active = true;
    async function resolveVersion() {
      let current = FALLBACK_APP_VERSION;
      try {
        current = (await window.techLeadHub?.getVersion?.()) || current;
      } catch {
        // A versão Web utiliza o fallback correspondente à publicação.
      }
      if (!active) return;
      setVersion(current);
      const note = getReleaseNote(current);
      if (!note) return;
      if (window.localStorage.getItem(`${STORAGE_PREFIX}${current}`) === "1") return;
      setStep(0);
      setOpen(true);
    }
    void resolveVersion();
    return () => { active = false; };
  }, []);

  const release = useMemo(() => getReleaseNote(version), [version]);
  if (!release) return null;

  function acknowledge() {
    window.localStorage.setItem(`${STORAGE_PREFIX}${version}`, "1");
    setOpen(false);
    setStep(0);
  }

  function seeDetails() {
    acknowledge();
    navigate("/sobre");
  }

  const guideSteps = [
    {
      icon: <AutoAwesomeOutlined />,
      title: "O que mudou nesta versão",
      description: "Comece pelos destaques da atualização. Eles resumem as mudanças que impactam sua rotina.",
    },
    {
      icon: <PersonOutlined />,
      title: "Sua operação já vem focada",
      description: "Tickets e Analistas tentam abrir com o seu próprio recorte. Limpe o filtro quando quiser analisar toda a equipe.",
    },
    {
      icon: <SearchOutlined />,
      title: "Investigue antes de navegar por várias telas",
      description: "Recorrências, anomalias e DNA Técnico agora conectam evidências, serviço, cliente, versão e Azure para reduzir o caminho do diagnóstico.",
    },
    {
      icon: <ChatOutlined />,
      title: "Compartilhe e abra no ponto certo",
      description: "Cards de atendimento e Task enviados no Chat abrem diretamente no registro correspondente.",
    },
    {
      icon: <DashboardOutlined />,
      title: "Use os indicadores como atalhos",
      description: "Cards, rankings e sinais acionáveis possuem drill-down. Clique no indicador para chegar aos tickets e Tasks que explicam o número.",
    },
  ] as const;

  const currentGuide = guideSteps[step];
  const isLastStep = step === guideSteps.length - 1;

  return (
    <Dialog
      open={open}
      onClose={acknowledge}
      fullWidth
      maxWidth="md"
      aria-labelledby="release-highlights-title"
      slotProps={{ paper: { sx: { overflow: "hidden" } } }}
    >
      <Box
        sx={{
          px: { xs: 2.25, sm: 3 },
          pt: { xs: 2.25, sm: 2.75 },
          pb: 2.25,
          position: "relative",
          overflow: "hidden",
          borderBottom: "1px solid",
          borderColor: "divider",
          background: (theme) => theme.palette.mode === "dark"
            ? "radial-gradient(circle at 88% 0%,rgba(24,199,122,.18),transparent 34%),linear-gradient(135deg,#0C2639,#10243B)"
            : "radial-gradient(circle at 88% 0%,rgba(24,199,122,.17),transparent 36%),linear-gradient(135deg,#F2FCF7,#F7FAFC)",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
          <Box sx={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 2.5, bgcolor: "rgba(24,199,122,.12)", color: aliareColors.greenDark, boxShadow: "0 8px 22px rgba(16,148,91,.12)" }}>
            <AutoAwesomeOutlined />
          </Box>
          <Chip size="small" icon={<NewReleasesOutlined />} label={`Nova versão · v${version}`} color="success" variant="outlined" />
        </Stack>
        <Typography id="release-highlights-title" sx={{ fontSize: { xs: "1.45rem", sm: "1.75rem" }, fontWeight: 900, letterSpacing: "-.025em" }}>
          {release.title ?? "Novidades do TechLead Hub"}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: .55, maxWidth: 720 }}>
          O TechLead Hub foi atualizado. Veja o que mudou nesta versão antes de continuar.
        </Typography>
      </Box>

      <DialogContent sx={{ p: { xs: 2.25, sm: 3 } }}>
        {step === 0 ? (
          <>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))" }, gap: 1.25 }}>
              {release.items.slice(0, 6).map((item, index) => (
                <Box key={item.title} sx={{ p: 1.6, border: "1px solid", borderColor: "divider", borderRadius: 2.5, bgcolor: "background.paper", minWidth: 0 }}>
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
                    <Box sx={{ width: 28, height: 28, flexShrink: 0, borderRadius: 2, display: "grid", placeItems: "center", fontWeight: 900, fontSize: ".72rem", color: aliareColors.greenDark, bgcolor: "rgba(24,199,122,.10)" }}>
                      {String(index + 1).padStart(2, "0")}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 850 }}>{item.title}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .35, lineHeight: 1.5 }}>{item.description}</Typography>
                    </Box>
                  </Stack>
                </Box>
              ))}
            </Box>
            <Stack direction={{ xs: "column-reverse", sm: "row" }} spacing={1} sx={{ mt: 2.5, justifyContent: "space-between", alignItems: { sm: "center" } }}>
              <Button variant="text" startIcon={<OpenInNewOutlined />} onClick={seeDetails}>Ver todas as novidades</Button>
              <Button variant="contained" endIcon={<ArrowForwardOutlined />} onClick={() => setStep(1)}>Ver guia rápido</Button>
            </Stack>
          </>
        ) : (
          <>
            <Box sx={{ minHeight: 250, display: "grid", placeItems: "center", textAlign: "center", px: { xs: .5, sm: 4 } }}>
              <Box>
                <Box sx={{ width: 58, height: 58, mx: "auto", mb: 1.5, borderRadius: 3, display: "grid", placeItems: "center", bgcolor: "rgba(24,199,122,.11)", color: aliareColors.greenDark, "& svg": { fontSize: 30 } }}>
                  {currentGuide.icon}
                </Box>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>Passo {step} de {guideSteps.length - 1}</Typography>
                <Typography sx={{ fontSize: { xs: "1.25rem", sm: "1.5rem" }, fontWeight: 900, mt: .25 }}>{currentGuide.title}</Typography>
                <Typography color="text.secondary" sx={{ mt: .75, maxWidth: 610, mx: "auto", lineHeight: 1.65 }}>{currentGuide.description}</Typography>
                <Stack direction="row" spacing={.6} sx={{ justifyContent: "center", mt: 2 }}>
                  {guideSteps.slice(1).map((_, index) => (
                    <Box key={index} sx={{ width: index + 1 === step ? 22 : 7, height: 7, borderRadius: 99, bgcolor: index + 1 === step ? "success.main" : "action.disabledBackground", transition: "width .2s ease" }} />
                  ))}
                </Stack>
              </Box>
            </Box>
            <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: "space-between" }}>
              <Button variant="text" onClick={() => setStep((value) => Math.max(0, value - 1))}>Voltar</Button>
              <Stack direction="row" spacing={1}>
                <Button variant="text" color="inherit" onClick={acknowledge}>Pular guia</Button>
                <Button variant="contained" endIcon={<ArrowForwardOutlined />} onClick={() => isLastStep ? acknowledge() : setStep((value) => value + 1)}>
                  {isLastStep ? "Começar a usar" : "Próximo"}
                </Button>
              </Stack>
            </Stack>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
