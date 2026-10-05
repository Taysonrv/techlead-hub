import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import InboxOutlined from "@mui/icons-material/InboxOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";

type ContentStateProps = {
  kind: "loading" | "empty" | "error";
  title?: string;
  description?: string;
  minHeight?: number;
};

export function ContentState({ kind, title, description, minHeight = 220 }: ContentStateProps) {
  const defaults = kind === "loading"
    ? ["Carregando dados", "Aguarde enquanto consolidamos as informações."]
    : kind === "error"
      ? ["Não foi possível carregar", "Tente novamente em alguns instantes."]
      : ["Nenhum dado encontrado", "Não há informações para os filtros selecionados."];

  return (
    <Box
      role={kind === "error" ? "alert" : "status"}
      sx={{
        minHeight,
        display: "grid",
        placeItems: "center",
        px: 2,
        py: 3,
        border: "1px dashed",
        borderColor: "divider",
        borderRadius: 2.5,
        bgcolor: "action.hover",
      }}
    >
      <Stack spacing={1} alignItems="center" textAlign="center" sx={{ maxWidth: 440 }}>
        {kind === "loading"
          ? <CircularProgress size={26} thickness={4} />
          : kind === "error"
            ? <ErrorOutlineOutlined color="error" />
            : <InboxOutlined color="disabled" />}
        <Typography variant="subtitle2" fontWeight={750}>{title ?? defaults[0]}</Typography>
        <Typography variant="caption" color="text.secondary">{description ?? defaults[1]}</Typography>
      </Stack>
    </Box>
  );
}
