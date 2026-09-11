import { Box, Divider, IconButton, Stack, Typography } from "@mui/material";
import { CloseOutlined } from "@mui/icons-material";
import type { ReactNode } from "react";

export function DetailPanelHeader({ eyebrow, title, identifier, onClose, children }: { eyebrow?: string; title: string; identifier?: ReactNode; onClose: () => void; children?: ReactNode }) {
  return <>
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 750, lineHeight: 1.2 }}>{eyebrow}</Typography>}
        <Typography sx={{ fontWeight: 800, fontSize: "1.25rem", letterSpacing: "-.02em", lineHeight: 1.25 }}>{title}</Typography>
        {identifier && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .35 }}>{identifier}</Typography>}
      </Box>
      <IconButton aria-label="Fechar detalhes" onClick={onClose} size="small"><CloseOutlined /></IconButton>
    </Stack>
    {children}
    <Divider sx={{ mt: 2.25, mb: 2.25 }} />
  </>;
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <Box sx={{ mb: 2.5 }}><Typography sx={{ fontWeight: 800, fontSize: ".9rem", mb: 1.25 }}>{title}</Typography>{children}</Box>;
}

export function DetailFieldGrid({ fields }: { fields: Array<[string, ReactNode]> }) {
  return <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))" }, gap: 2 }}>
    {fields.map(([label, value]) => <Box key={label} sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{ mt: .25, fontWeight: 700, overflowWrap: "anywhere" }}>{value ?? "Não informado"}</Typography></Box>)}
  </Box>;
}
