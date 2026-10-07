import { Box, Skeleton, Stack, Typography } from "@mui/material";
import InboxOutlined from "@mui/icons-material/InboxOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";

type ContentStateProps = {
  kind: "loading" | "empty" | "error";
  title?: string;
  description?: string;
  minHeight?: number;
};

export function ContentState({ kind, title, description, minHeight = 180 }: ContentStateProps) {
  const defaults = kind === "loading"
    ? ["Carregando dados", "Aguarde enquanto consolidamos as informações."]
    : kind === "error"
      ? ["Não foi possível carregar", "Tente novamente em alguns instantes."]
      : ["Nenhum dado encontrado", "Não há informações para os filtros selecionados."];

  if (kind === "loading") {
    return (
      <Box role="status" aria-label={title ?? defaults[0]} sx={{ minHeight, display: "grid", alignContent: "center", px: { xs: 1.5, md: 2 }, py: 2.5 }}>
        <Stack spacing={1.15}>
          <Skeleton variant="rounded" height={18} width="34%" />
          <Skeleton variant="rounded" height={12} width="58%" />
          <Skeleton variant="rounded" height={Math.max(72, minHeight - 96)} sx={{ borderRadius: 2 }} />
        </Stack>
      </Box>
    );
  }

  return (
    <Box role={kind === "error" ? "alert" : "status"} sx={{ minHeight, display: "grid", placeItems: "center", px: 2, py: 2.5, border: "1px dashed", borderColor: "divider", borderRadius: 2.5, bgcolor: "action.hover" }}>
      <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center", maxWidth: 440 }}>
        {kind === "error" ? <ErrorOutlineOutlined color="error" /> : <InboxOutlined color="disabled" />}
        <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>{title ?? defaults[0]}</Typography>
        <Typography variant="caption" color="text.secondary">{description ?? defaults[1]}</Typography>
      </Stack>
    </Box>
  );
}
