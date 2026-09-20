import { Box, Stack, Typography, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { aliareColors } from "../theme/theme";

export function PageHeader({ eyebrow, title, description, meta, action }: { eyebrow: string; title: string; description: string; meta?: ReactNode; action?: ReactNode }) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  return <Stack direction={{ xs: "column", lg: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", lg: "center" }, gap: 2, mb: 2.5, position: "relative", overflow: "hidden", p: { xs: 2, md: 2.4 }, borderRadius: 2.75, border: "1px solid", borderColor: dark ? "rgba(76,190,230,.20)" : "rgba(15,118,110,.13)", background: dark ? "radial-gradient(circle at 8% 0%, rgba(24,199,122,.13), transparent 34%), radial-gradient(circle at 92% 10%, rgba(71,108,255,.15), transparent 36%), linear-gradient(125deg, rgba(9,39,59,.98), rgba(13,31,57,.98) 58%, rgba(28,29,72,.96))" : "radial-gradient(circle at 8% 0%, rgba(24,199,122,.08), transparent 34%), linear-gradient(125deg, rgba(255,255,255,.98), rgba(247,251,252,.98) 62%, rgba(244,247,255,.96))", boxShadow: dark ? "0 18px 42px rgba(0,0,0,.20), inset 0 1px rgba(255,255,255,.035)" : "0 12px 30px rgba(16,24,40,.055)", "&::before": { content: '""', position: "absolute", inset: "0 auto 0 0", width: 3, background: "linear-gradient(180deg, #18C77A, #0891B2, transparent 92%)", boxShadow: dark ? "0 0 18px rgba(24,199,122,.35)" : "none" }, "&::after": { content: '""', position: "absolute", left: 24, right: 24, bottom: 0, height: 1, background: dark ? "linear-gradient(90deg, rgba(24,199,122,.42), rgba(47,141,255,.22), transparent 84%)" : "linear-gradient(90deg, rgba(24,199,122,.22), rgba(47,111,237,.10), transparent 84%)" } }}>
    <Box sx={{ position: "relative", zIndex: 1, minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Box sx={{ width: 30, height: 3, borderRadius: 99, bgcolor: aliareColors.green, boxShadow: dark ? "0 0 12px rgba(24,199,122,.35)" : "none" }} />
        <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: dark ? "#42E6C1" : aliareColors.greenDark }}>{eyebrow}</Typography>
      </Stack>
      <Typography sx={{ mt: .8, fontWeight: 800, letterSpacing: "-.025em", fontSize: { xs: "1.7rem", md: "1.9rem", xl: "2.1rem" }, lineHeight: 1.12, textShadow: dark ? "0 2px 18px rgba(0,0,0,.28)" : "none" }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: .25 }}>{description}</Typography>
      {meta && <Typography component="div" variant="caption" color="text.secondary" sx={{ mt: .5 }}>{meta}</Typography>}
    </Box>
    {action && <Box sx={{ position: "relative", zIndex: 1, flexShrink: 0 }}>{action}</Box>}
  </Stack>;
}
