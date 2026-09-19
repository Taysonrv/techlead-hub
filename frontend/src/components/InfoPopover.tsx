import { Box, Divider, IconButton, Popover, Typography } from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";
import { useState } from "react";

export type InfoPopoverContent = {
  title: string;
  summary: string;
  calculation: string;
  source: string;
  reference?: string;
  periodRule: string;
  notes?: string;
};

export function InfoPopover({ info }: { info: InfoPopoverContent }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return <>
    <IconButton
      size="small"
      title={`Informações sobre ${info.title}`}
      aria-label={`Informações sobre ${info.title}`}
      onClick={(event) => {
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      sx={{ width: 28, height: 28, color: "text.secondary", flexShrink: 0 }}
    >
      <InfoOutlined sx={{ fontSize: 17 }} />
    </IconButton>

    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={() => setAnchorEl(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      onClick={(event) => event.stopPropagation()}
      slotProps={{ paper: { sx: { width: 340, maxWidth: "calc(100vw - 32px)", p: 2, borderRadius: 2 } } }}
    >
      <Typography sx={{ fontWeight: 800 }}>{info.title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>{info.summary}</Typography>
      <Divider sx={{ my: 1.5 }} />
      <InfoLine label="Cálculo" value={info.calculation} />
      <InfoLine label="Fonte" value={info.source} />
      {info.reference && <InfoLine label="Referência" value={info.reference} />}
      <InfoLine label="Regra do recorte" value={info.periodRule} />
      {info.notes && <InfoLine label="Observação" value={info.notes} />}
    </Popover>
  </>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <Box sx={{ mt: 1 }}>
    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{label}</Typography>
    <Typography variant="body2" sx={{ mt: .15, lineHeight: 1.45 }}>{value}</Typography>
  </Box>;
}
