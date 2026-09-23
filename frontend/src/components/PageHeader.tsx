import { Box, Stack, Typography, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { aliareColors } from "../theme/theme";

export function PageHeader({ eyebrow, title, description, meta, action }: { eyebrow: string; title: string; description: string; meta?: ReactNode; action?: ReactNode }) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  return <Stack direction={{ xs: "column", lg: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", lg: "center" }, gap: 2, mb: { xs: 2, md: 2.75 }, position: "relative", overflow: "hidden", p: { xs: 1.75, sm: 2, md: 2.2 }, borderRadius: { xs: 2, md: 2.5 }, isolation: "isolate", border: "1px solid", borderColor: dark ? "rgba(76,190,230,.20)" : "rgba(15,118,110,.13)", background: dark ? "radial-gradient(circle at 8% 0%, rgba(24,199,122,.12), transparent 34%), linear-gradient(125deg, rgba(9,39,59,.98), rgba(13,31,57,.98) 62%, rgba(18,34,60,.97))" : "linear-gradient(120deg, #F3FCF8 0%, #F7FBFA 48%, #F4F8FC 100%)", boxShadow: dark ? "inset 3px 0 0 #18C77A, 0 16px 38px rgba(0,0,0,.18), inset 0 1px rgba(255,255,255,.035)" : "inset 3px 0 0 #18C77A, 0 8px 22px rgba(16,24,40,.045)", "&::after": { display: "none" } }}>
    <Box sx={{ position: "relative", zIndex: 1, minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Box sx={{ width: 34, height: 3, borderRadius: 99, bgcolor: aliareColors.green, boxShadow: dark ? "0 0 12px rgba(24,199,122,.35)" : "none" }} />
        <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: dark ? "#42E6C1" : aliareColors.greenDark }}>{eyebrow}</Typography>
      </Stack>
      <Typography sx={{ mt: .8, fontWeight: 800, letterSpacing: "-.025em", fontSize: { xs: "1.65rem", sm: "1.8rem", md: "2rem", xl: "2.15rem" }, lineHeight: 1.12, textShadow: dark ? "0 2px 18px rgba(0,0,0,.28)" : "none" }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: .25 }}>{description}</Typography>
      {meta && <Typography component="div" variant="caption" color="text.secondary" sx={{ mt: .5 }}>{meta}</Typography>}
    </Box>
    {action && <Box sx={{ position: "relative", zIndex: 1, flexShrink: 0, alignSelf: { xs: "stretch", lg: "center" }, "& > *": { maxWidth: "100%" } }}>{action}</Box>}
  </Stack>;
}
