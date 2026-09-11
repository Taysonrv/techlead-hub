import { Card, CardContent, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";
import type { KeyboardEvent, ReactNode } from "react";
import { aliareColors } from "../theme/theme";

type KpiCardProps = {
  title: string;
  value: ReactNode;
  subtitle?: string;
  info?: string;
  accent?: string;
  active?: boolean;
  onClick?: () => void;
};

export function KpiCard({ title, value, subtitle, info, accent = aliareColors.green, active = false, onClick }: KpiCardProps) {
  const activate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (onClick && (event.key === "Enter" || event.key === " ")) onClick();
  };

  return <Card elevation={0} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={activate}
    sx={{ position: "relative", overflow: "hidden", width: "100%", height: "100%", borderColor: active ? accent : "divider", cursor: onClick ? "pointer" : "default", bgcolor: active ? "rgba(24,199,122,.035)" : "background.paper", transition: "transform .15s ease, box-shadow .15s ease, border-color .15s ease", "&::before": { content: '""', position: "absolute", inset: "0 0 auto", height: 3, bgcolor: accent }, ...(onClick && { "&:hover": { transform: "translateY(-2px)", borderColor: accent, boxShadow: "0 8px 24px rgba(16,24,40,.08)" }, "&:focus-visible": { outline: `2px solid ${accent}`, outlineOffset: 2 } }) }}>
    <CardContent sx={{ p: { xs: 1.6, md: 1.8 }, "&:last-child": { pb: { xs: 1.6, md: 1.8 } } }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 0 }}>{title}</Typography>
        {info && <Tooltip title={info}><IconButton size="small" aria-label={`Informações sobre ${title}`} onClick={(event) => event.stopPropagation()} sx={{ p: .3, color: "text.secondary" }}><InfoOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip>}
      </Stack>
      <Typography sx={{ mt: .6, fontWeight: 800, letterSpacing: "-.025em", fontSize: { xs: "1.75rem", md: "1.95rem", xl: "2.1rem" }, lineHeight: 1.05 }}>{value}</Typography>
      {subtitle && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .75, minHeight: 18 }}>{subtitle}</Typography>}
    </CardContent>
  </Card>;
}
