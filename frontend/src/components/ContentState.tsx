import { Box, Button, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import InboxOutlined from "@mui/icons-material/InboxOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";

type ContentStateProps = {
  kind: "loading" | "empty" | "error";
  title?: string;
  description?: string;
  minHeight?: number;
  onRetry?: () => void;
  onEmptyAction?: () => void;
  emptyActionLabel?: string;
  errorDetail?: string;
};

export function ContentState({
  kind,
  title,
  description,
  minHeight = 180,
  onRetry,
  onEmptyAction,
  emptyActionLabel = "Limpar filtros",
  errorDetail,
}: ContentStateProps) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  const defaults =
    kind === "loading"
      ? ["Carregando dados", "Aguarde enquanto consolidamos as informações."]
      : kind === "error"
        ? ["Não foi possível carregar", "Tente novamente em alguns instantes."]
        : ["Nenhum dado encontrado", "Não há informações para os filtros selecionados."];

  if (kind === "loading") {
    return (
      <Box
        role="status"
        aria-label={title ?? defaults[0]}
        aria-busy="true"
        sx={{
          minHeight,
          display: "grid",
          alignContent: "center",
          px: { xs: 1.5, md: 2 },
          minWidth: 0,
          py: 2.5,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "var(--hub-radius-lg)",
          bgcolor: "background.paper",
        }}
      >
        <Stack spacing={1.1}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Skeleton variant="rounded" width={28} height={28} sx={{ borderRadius: "8px" }} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="rounded" height={16} width="min(32%, 190px)" />
              <Skeleton variant="rounded" height={10} width="min(48%, 290px)" sx={{ mt: 0.7 }} />
            </Box>
          </Stack>
          <Skeleton
            variant="rounded"
            height={Math.max(74, minHeight - 92)}
            sx={{ borderRadius: "10px" }}
          />
        </Stack>
      </Box>
    );
  }

  const error = kind === "error";

  return (
    <Box
      role={error ? "alert" : "status"}
      sx={{
        minHeight,
        display: "grid",
        placeItems: "center",
        px: 2,
        py: 2.5,
        minWidth: 0,
        border: "1px dashed",
        borderColor: error
          ? dark
            ? "rgba(239,83,80,.42)"
            : "rgba(229,57,53,.28)"
          : "divider",
        borderRadius: "var(--hub-radius-lg)",
        background: dark
          ? "linear-gradient(145deg,rgba(9,30,44,.62),rgba(8,24,37,.52))"
          : "linear-gradient(145deg,rgba(248,250,252,.96),rgba(255,255,255,.96))",
      }}
    >
      <Stack spacing={0.9} sx={{ alignItems: "center", textAlign: "center", maxWidth: 480, minWidth: 0, overflowWrap: "anywhere" }}>
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: "12px",
            display: "grid",
            placeItems: "center",
            color: error ? "error.main" : "text.secondary",
            border: "1px solid",
            borderColor: error ? "error.main" : "divider",
            bgcolor: error
              ? dark
                ? "rgba(229,57,53,.08)"
                : "rgba(229,57,53,.045)"
              : "action.hover",
          }}
        >
          {error ? <ErrorOutlineOutlined /> : <InboxOutlined />}
        </Box>

        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          {title ?? defaults[0]}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
          {description ?? defaults[1]}
        </Typography>
        {error && onRetry ? <Button variant="contained" color="primary" onClick={onRetry}>Tentar novamente</Button> : null}
        {!error && onEmptyAction ? <Button variant="outlined" onClick={onEmptyAction}>{emptyActionLabel}</Button> : null}
        {error && errorDetail ? <Box component="details" sx={{ mt: 1, maxWidth: "100%", textAlign: "left" }}><Typography component="summary" variant="caption" sx={{ cursor: "pointer" }}>Detalhes técnicos</Typography><Typography component="pre" variant="caption" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", mt: 1 }}>{errorDetail}</Typography></Box> : null}
      </Stack>
    </Box>
  );
}
