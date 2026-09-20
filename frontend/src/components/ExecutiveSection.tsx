import { Box, Card, CardContent, Stack, Typography, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { aliareColors } from "../theme/theme";

type ExecutiveSectionProps = { title?: string; subtitle?: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; accent?: string; compact?: boolean };

export function ExecutiveSection({ title, subtitle, icon, action, children, accent = aliareColors.cyan, compact = false }: ExecutiveSectionProps) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  return <Card elevation={0} sx={{ overflow: "hidden", isolation: "isolate", borderColor: dark ? "rgba(90,174,220,.20)" : "divider", background: dark ? "linear-gradient(145deg, rgba(13,37,59,.96), rgba(8,24,41,.985))" : "linear-gradient(180deg,#FFFFFF,#FBFCFD)", "&::before": { content: '""', position: "absolute", inset: "0 0 auto", height: 2, background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 35%, transparent), transparent 82%)`, boxShadow: dark ? `0 0 16px color-mix(in srgb, ${accent} 25%, transparent)` : "none" }, "&:hover": { borderColor: dark ? `color-mix(in srgb, ${accent} 28%, rgba(90,174,220,.20))` : "divider" } }}>
    {(title || subtitle || action) && <Box sx={{ px: { xs: 1.75, md: 2.1 }, pt: { xs: 1.65, md: 1.9 }, pb: 1.35, borderBottom: "1px solid", borderColor: "divider", background: dark ? "linear-gradient(90deg, rgba(20,53,78,.48), rgba(8,24,41,.12))" : "linear-gradient(90deg, rgba(8,145,178,.035), transparent)" }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1.1} sx={{ alignItems: "center", minWidth: 0 }}>
          {icon && <Box sx={{ display: "grid", placeItems: "center", width: 34, height: 34, flexShrink: 0, borderRadius: 2, color: accent, border: "1px solid", borderColor: `color-mix(in srgb, ${accent} 34%, transparent)`, backgroundColor: `color-mix(in srgb, ${accent} 9%, transparent)` }}>{icon}</Box>}
          <Box sx={{ minWidth: 0 }}>
            {title && <Typography sx={{ fontWeight: 850, fontSize: "1.02rem", letterSpacing: "-.01em" }}>{title}</Typography>}
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
        </Stack>
        {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
      </Stack>
    </Box>}
    <CardContent sx={{ p: compact ? { xs: 1.35, md: 1.5 } : { xs: 1.75, md: 2 }, "&:last-child": { pb: compact ? { xs: 1.35, md: 1.5 } : { xs: 1.75, md: 2 } } }}>{children}</CardContent>
  </Card>;
}
