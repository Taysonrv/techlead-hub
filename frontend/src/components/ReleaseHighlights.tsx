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
  NewReleasesOutlined,
  OpenInNewOutlined,
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
  }

  function seeDetails() {
    acknowledge();
    navigate("/sobre");
  }

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

        <Stack direction={{ xs: "column-reverse", sm: "row" }} spacing={1} sx={{ mt: 2.5, justifyContent: "flex-end" }}>
          <Button variant="text" startIcon={<OpenInNewOutlined />} onClick={seeDetails}>Ver todas as novidades</Button>
          <Button variant="contained" endIcon={<ArrowForwardOutlined />} onClick={acknowledge}>Continuar</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
