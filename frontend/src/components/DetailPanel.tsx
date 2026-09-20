import { Box, Divider, IconButton, Stack, Typography, useTheme } from "@mui/material";
import { CloseOutlined } from "@mui/icons-material";
import type { ReactNode } from "react";

export function DetailPanelHeader({ eyebrow, title, identifier, onClose, children }: { eyebrow?: string; title: string; identifier?: ReactNode; onClose: () => void; children?: ReactNode }) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  return <>
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2, mx: -0.5, p: 1.25, borderRadius: 2, background: dark ? "linear-gradient(90deg,rgba(24,199,122,.07),rgba(34,211,238,.025),transparent)" : "linear-gradient(90deg,rgba(24,199,122,.055),transparent)" }}>
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 750, lineHeight: 1.2 }}>{eyebrow}</Typography>}
        <Typography sx={{ fontWeight: 800, fontSize: "1.25rem", letterSpacing: "-.02em", lineHeight: 1.25 }}>{title}</Typography>
        {identifier && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .35 }}>{identifier}</Typography>}
      </Box>
      <IconButton aria-label="Fechar detalhes" onClick={onClose} size="small" sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}><CloseOutlined /></IconButton>
    </Stack>
    {children}
    <Divider sx={{ mt: 2.25, mb: 2.25 }} />
  </>;
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <Box sx={{ mb: 2.5 }}><Typography sx={{ fontWeight: 850, fontSize: ".9rem", mb: 1.25, display: "flex", alignItems: "center", gap: .75, "&::before": { content: '""', width: 3, height: 16, borderRadius: 99, bgcolor: "primary.main", boxShadow: "0 0 10px rgba(24,199,122,.25)" } }}>{title}</Typography>{children}</Box>;
}

export function DetailFieldGrid({ fields }: { fields: Array<[string, ReactNode]> }) {
  return <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))" }, gap: 2 }}>
    {fields.map(([label, value]) => <Box key={label} sx={{ minWidth: 0, p: 1.15, borderRadius: 1.5, border: "1px solid", borderColor: "divider", bgcolor: "action.hover" }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{ mt: .25, fontWeight: 700, overflowWrap: "anywhere" }}>{value ?? "Não informado"}</Typography></Box>)}
  </Box>;
}
