import {
  Box,
  Card,
  CardContent,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { InfoOutlined } from "@mui/icons-material";
import type { KeyboardEvent, ReactNode } from "react";
import { kpiLayout } from "../theme/layoutTokens";
import { aliareColors } from "../theme/theme";

type KpiCardProps = {
  title: string;
  value: ReactNode;
  subtitle?: string;
  info?: string;
  infoContent?: ReactNode;
  icon?: ReactNode;
  progress?: number;
  metadata?: {
    source?: string;
    periodRule?: string;
    denominator?: string;
    updatedAt?: string;
  };
  accent?: string;
  active?: boolean;
  density?: "default" | "compact";
  onClick?: () => void;
};

export function KpiCard({
  title,
  value,
  subtitle,
  info,
  metadata,
  infoContent,
  icon,
  progress,
  accent = aliareColors.green,
  active = false,
  density = "default",
  onClick,
}: KpiCardProps) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  const activate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && onClick && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      elevation={0}
      data-kpi-card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? active : undefined}
      aria-label={onClick ? `${title}. ${subtitle ?? ""} Clique para abrir o detalhamento.` : undefined}
      onClick={onClick}
      onKeyDown={activate}
      sx={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        minWidth: 0,
        height: density === "compact" ? { xs: 98, md: 104 } : kpiLayout.height,
        "@media (prefers-reduced-motion: reduce)": { transition: "none", "&:hover": { transform: "none" } },
        minHeight: density === "compact" ? { xs: 98, md: 104 } : kpiLayout.height,
        border: "1px solid",
        borderColor: active ? accent : "divider",
        cursor: onClick ? "pointer" : "default",
        opacity: 1,
        background: dark
          ? `radial-gradient(circle at 0% 50%, ${alpha(accent, 0.17)} 0%, ${alpha(accent, 0.075)} 24%, transparent 58%), linear-gradient(145deg, rgba(11,34,48,.98), rgba(7,25,38,.995))`
          : `radial-gradient(circle at 0% 50%, ${alpha(accent, 0.10)} 0%, ${alpha(accent, 0.04)} 28%, transparent 60%), linear-gradient(145deg, #FFFFFF, #FAFCFD)`,
        boxShadow: active
          ? dark
            ? "0 15px 34px rgba(0,0,0,.18)"
            : "0 10px 26px rgba(15,23,42,.07)"
          : "none",
        transition:
          "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: "0 auto 0 0",
          width: 3,
          bgcolor: accent,
          opacity: active ? 1 : 0.82,
        },
        "&::after": {
          content: '""',
          position: "absolute",
          inset: 0,
          background: dark
            ? "linear-gradient(180deg, rgba(255,255,255,.018), transparent 32%)"
            : "linear-gradient(180deg, rgba(255,255,255,.46), transparent 30%)",
          pointerEvents: "none",
        },
        ...(onClick
          ? {
              "&:hover": {
                transform: "translateY(-2px)",
                borderColor: alpha(accent, dark ? 0.5 : 0.36),
                boxShadow: dark
                  ? "0 17px 36px rgba(0,0,0,.20)"
                  : "0 10px 26px rgba(15,23,42,.075)",
              },
              "&:focus-visible": {
                outline: "2px solid " + accent,
                outlineOffset: 2,
              },
            }
          : {}),
      }}
    >
      <CardContent
        sx={{
          height: "100%",
          p: density === "compact" ? { xs: 1.05, md: 1.15 } : kpiLayout.padding,
          display: "flex",
          flexDirection: "column",
          "&:last-child": { pb: density === "compact" ? { xs: 1.05, md: 1.15 } : kpiLayout.padding },
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 0.7,
            minWidth: 0,
          }}
        >
          <Typography
            title={title}
            variant="body2"
            sx={{
              fontWeight: 750,
              fontSize: kpiLayout.titleSize,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              letterSpacing: "-.004em",
              lineHeight: 1.3,
              minWidth: 0,
              flex: 1,
            }}
          >
            {title}
          </Typography>

          <Stack direction="row" sx={{ flexShrink: 0, gap: 0.35 }}>
          {icon ? <Box sx={{ display: "flex", color: accent, flexShrink: 0, "& .MuiSvgIcon-root": { fontSize: 18 } }}>{icon}</Box> : null}
          {infoContent ? <Box onClick={(event) => event.stopPropagation()} sx={{ flexShrink: 0, mt: -.25, "& .MuiIconButton-root": { width: 22, height: 22, p: .25 }, "& .MuiSvgIcon-root": { fontSize: 16 } }}>{infoContent}</Box> : info || metadata ? (
            <Tooltip
              title={
                <Stack spacing={0.45}>
                  {info ? <Typography variant="caption">{info}</Typography> : null}
                  {metadata?.source ? (
                    <Typography variant="caption">
                      <b>Fonte:</b> {metadata.source}
                    </Typography>
                  ) : null}
                  {metadata?.periodRule ? (
                    <Typography variant="caption">
                      <b>Período:</b> {metadata.periodRule}
                    </Typography>
                  ) : null}
                  {metadata?.denominator ? (
                    <Typography variant="caption">
                      <b>Denominador:</b> {metadata.denominator}
                    </Typography>
                  ) : null}
                  {metadata?.updatedAt ? (
                    <Typography variant="caption">
                      <b>Atualização:</b> {metadata.updatedAt}
                    </Typography>
                  ) : null}
                </Stack>
              }
            >
              <IconButton
                size="small"
                aria-label={"Informações sobre " + title}
                onClick={(event) => event.stopPropagation()}
                sx={{
                  p: 0.25,
                  mt: -0.25,
                  mr: -0.25,
                  color: "text.secondary",
                  flexShrink: 0,
                }}
              >
                <InfoOutlined sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          ) : null}
          </Stack>
        </Stack>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: density === "compact" ? 0.45 : 0.65 }}>
        <Typography
          title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}
          sx={{
            flexShrink: 0,
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontWeight: 840,
            color: accent,
            letterSpacing: "-.03em",
            fontSize: density === "compact"
              ? { xs: "1.35rem", md: "1.48rem", xl: "1.58rem" }
              : kpiLayout.valueSize,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            fontFeatureSettings: "\"tnum\"",
          }}
        >
          {value}
        </Typography>
        {progress !== undefined ? <LinearProgress
          variant="determinate"
          value={Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0}
          aria-label={"Percentual de " + title}
          sx={{ width: "38%", flexShrink: 0, height: 5, borderRadius: 99, bgcolor: alpha(accent, 0.12), "& .MuiLinearProgress-bar": { bgcolor: accent } }}
        /> : null}
        </Box>

        <Box sx={{ mt: "auto", pt: subtitle ? 0.7 : 0.25 }}>
          {subtitle ? (
            <Typography
              title={subtitle}
              variant="caption"
              color="text.secondary"
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                minHeight: 16,
                lineHeight: 1.35,
              }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </CardContent>
    </Card>
  );
}
