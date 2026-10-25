import { OpenInNewOutlined } from "@mui/icons-material";
import { Button, Chip, Paper, Stack, Typography } from "@mui/material";

export type SharedRecord = {
  type: string;
  id?: number;
  title: string;
  client?: string | null;
  status?: string | null;
  path: string;
};

type Props = {
  content: string;
  onOpen: (record: SharedRecord) => void;
};

/** Preserves rendering of legacy [hub-card] messages until all records are typed. */
export function SharedRecordCard({ content, onOpen }: Props) {
  let card: SharedRecord;
  try {
    card = JSON.parse(content.slice("[hub-card]".length)) as SharedRecord;
    if (!card || typeof card !== "object" || typeof card.title !== "string" || typeof card.type !== "string") {
      throw new Error("Invalid shared record");
    }
  } catch {
    return <Typography>Registro compartilhado</Typography>;
  }
  return (
    <Paper elevation={0} sx={{ minWidth: { xs: 220, sm: 310 }, maxWidth: 430, p: 1.25, bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(15,23,42,.42)" : "#ffffff", color: "text.primary", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
        <Chip size="small" label={`${card.type}${card.id ? ` #${card.id}` : ""}`} sx={{ fontWeight: 850 }} />
        {card.status && <Chip size="small" variant="outlined" label={card.status} />}
      </Stack>
      <Typography sx={{ mt: .8, fontWeight: 900, lineHeight: 1.3 }}>{card.title}</Typography>
      {card.client && <Typography variant="body2" sx={{ mt: .4, opacity: .75 }}>Cliente: {card.client}</Typography>}
      <Button size="small" endIcon={<OpenInNewOutlined />} sx={{ mt: .9, px: 0, color: "inherit", fontWeight: 850 }} onClick={() => onOpen(card)}>Abrir registro</Button>
    </Paper>
  );
}
