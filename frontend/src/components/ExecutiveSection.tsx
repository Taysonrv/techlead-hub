import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { ReactNode } from "react";
import { aliareColors } from "../theme/theme";

type ExecutiveSectionProps = {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  accent?: string;
  compact?: boolean;
};

export function ExecutiveSection({
  title,
  subtitle,
  icon,
  action,
  children,
  accent = aliareColors.cyan,
  compact = false,
}: ExecutiveSectionProps) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  return (
    <Card
      elevation={0}
      sx={{
        overflow: "hidden",
        isolation: "isolate",
        borderColor: "divider",
        background: dark
          ? "linear-gradient(145deg, rgba(11,34,50,.97), rgba(7,24,38,.99))"
          : "linear-gradient(180deg,#FFFFFF,#FBFCFD)",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: "0 0 auto",
          height: 2,
          background:
            "linear-gradient(90deg, " +
            accent +
            ", " +
            alpha(accent, 0.38) +
            ", transparent 82%)",
        },
      }}
    >
      {title || subtitle || action ? (
        <Box
          sx={{
            px: { xs: 1.55, md: 1.85 },
            pt: { xs: 1.35, md: 1.5 },
            pb: 1.05,
            borderBottom: "1px solid",
            borderColor: "divider",
            background: dark
              ? "linear-gradient(90deg, rgba(20,53,78,.34), rgba(8,24,41,.06))"
              : "linear-gradient(90deg, rgba(8,145,178,.025), transparent)",
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.1}
            sx={{
              alignItems: { xs: "stretch", sm: "center" },
              justifyContent: "space-between",
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
              {icon ? (
                <Box
                  sx={{
                    display: "grid",
                    placeItems: "center",
                    width: 34,
                    height: 34,
                    flexShrink: 0,
                    borderRadius: 2,
                    color: accent,
                    border: "1px solid",
                    borderColor: alpha(accent, dark ? 0.35 : 0.24),
                    backgroundColor: alpha(accent, dark ? 0.09 : 0.055),
                  }}
                >
                  {icon}
                </Box>
              ) : null}

              <Box sx={{ minWidth: 0 }}>
                {title ? (
                  <Typography
                    sx={{
                      fontWeight: 800,
                      fontSize: ".98rem",
                      letterSpacing: "-.01em",
                    }}
                  >
                    {title}
                  </Typography>
                ) : null}
                {subtitle ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ lineHeight: 1.4 }}
                  >
                    {subtitle}
                  </Typography>
                ) : null}
              </Box>
            </Stack>

            {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
          </Stack>
        </Box>
      ) : null}

      <CardContent
        sx={{
          p: compact
            ? { xs: 1.2, md: 1.35 }
            : { xs: 1.5, md: 1.7 },
          "&:last-child": {
            pb: compact
              ? { xs: 1.2, md: 1.35 }
              : { xs: 1.5, md: 1.7 },
          },
        }}
      >
        {children}
      </CardContent>
    </Card>
  );
}
