import { Box, Stack, Typography, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { aliareColors } from "../theme/theme";

export function PageHeader({ eyebrow, title, description, meta, action }: { eyebrow: string; title: string; description: string; meta?: ReactNode; action?: ReactNode }) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  return <Stack direction={{ xs: "column", lg: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", lg: "center" }, gap: 2, mb: 2.5, position: "relative", py: { xs: .5, md: 1 }, "&::after": dark ? { content: '""', position: "absolute", left: 0, right: 0, bottom: -8, height: 1, background: "linear-gradient(90deg, rgba(24,199,122,.34), rgba(47,141,255,.16), transparent 82%)" } : undefined }}>
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Box sx={{ width: 30, height: 3, borderRadius: 99, bgcolor: aliareColors.green }} />
        <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: dark ? "#42E6C1" : aliareColors.greenDark }}>{eyebrow}</Typography>
      </Stack>
      <Typography sx={{ mt: .8, fontWeight: 800, letterSpacing: "-.025em", fontSize: { xs: "1.7rem", md: "1.9rem", xl: "2.1rem" }, lineHeight: 1.12, textShadow: dark ? "0 2px 18px rgba(0,0,0,.28)" : "none" }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: .25 }}>{description}</Typography>
      {meta && <Typography component="div" variant="caption" color="text.secondary" sx={{ mt: .5 }}>{meta}</Typography>}
    </Box>
    {action}
  </Stack>;
}
