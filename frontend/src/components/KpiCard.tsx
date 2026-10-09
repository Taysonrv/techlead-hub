import {
  Box,
  Card,
  CardContent,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";
import type { KeyboardEvent, ReactNode } from "react";
import { aliareColors } from "../theme/theme";

type KpiCardProps = {
  title: string;
  value: ReactNode;
  subtitle?: string;
  info?: string;
  metadata?: {
    source?: string;
    periodRule?: string;
    denominator?: string;
    updatedAt?: string;
  };
  accent?: string;
  active?: boolean;
  onClick?: () => void;
};

export function KpiCard({
  title,
  value,
  subtitle,
  info,
  metadata,
  accent = aliareColors.green,
  active = false,
  onClick,
}: KpiCardProps) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  const activate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (onClick && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      elevation={0}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? active : undefined}
      onClick={onClick}
      onKeyDown={activate}
      sx={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        minHeight: { xs: 112, md: 118 },
        borderColor: active ? accent : "divider",
        cursor: onClick ? "pointer" : "default",
        background: dark
          ? "linear-gradient(145deg, rgba(11,34,48,.97), rgba(7,25,38,.99))"
          : "linear-gradient(145deg, #FFFFFF, #FAFCFD)",
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
          width: 108,
          height: 108,
          borderRadius: "50%",
          right: -54,
          top: -58,
          background: "radial-gradient(circle, " + alpha(accent, dark ? 0.13 : 0.07) + ", transparent 68%)",
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
          p: { xs: 1.25, md: 1.4 },
          display: "flex",
          flexDirection: "column",
          "&:last-child": { pb: { xs: 1.25, md: 1.4 } },
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
            variant="body2"
            sx={{
              fontWeight: 750,
              fontSize: ".8rem",
              letterSpacing: "-.004em",
              lineHeight: 1.3,
              minWidth: 0,
            }}
          >
            {title}
          </Typography>

          {info || metadata ? (
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

        <Typography
          sx={{
            mt: 0.65,
            fontWeight: 840,
            color: accent,
            letterSpacing: "-.03em",
            fontSize: { xs: "1.45rem", md: "1.62rem", xl: "1.72rem" },
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </Typography>

        <Box sx={{ mt: "auto", pt: subtitle ? 0.7 : 0.25 }}>
          {subtitle ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: "block",
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
