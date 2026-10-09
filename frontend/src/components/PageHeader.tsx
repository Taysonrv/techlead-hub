import { Box, Stack, Typography, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { aliareColors } from "../theme/theme";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  meta?: ReactNode;
  action?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  action,
}: PageHeaderProps) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  return (
    <Stack
      direction={{ xs: "column", lg: "row" }}
      sx={{
        justifyContent: "space-between",
        alignItems: { xs: "stretch", lg: "center" },
        gap: { xs: 1.4, lg: 2 },
        mb: { xs: 1.5, md: 2 },
        position: "relative",
        overflow: "hidden",
        p: { xs: 1.45, sm: 1.65, md: 1.8 },
        minHeight: { md: 102 },
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        borderRadius: "14px",
        isolation: "isolate",
        border: "1px solid",
        borderColor: dark
          ? "rgba(76,190,230,.18)"
          : "rgba(15,118,110,.12)",
        backgroundColor: dark ? "#0C1E33" : "#F5F8FC",
        boxShadow: dark
          ? "0 14px 34px rgba(0,0,0,.15), inset 0 1px rgba(255,255,255,.03)"
          : "0 7px 20px rgba(16,24,40,.035)",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: "0 auto 0 0",
          width: 3,
          background:
            "linear-gradient(180deg, #18C77A 0%, #22D3EE 62%, transparent 100%)",
          opacity: dark ? 0.95 : 0.78,
        },

      }}
    >
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          borderRadius: "inherit",
          pointerEvents: "none",
          background: dark
            ? "radial-gradient(circle at 0% 35%, rgba(24,199,122,.14) 0%, rgba(24,199,122,.055) 24%, transparent 50%), linear-gradient(100deg, rgba(8,35,53,.99) 0%, rgba(10,31,52,.99) 48%, #0C1E33 100%)"
            : "radial-gradient(circle at 0% 35%, rgba(24,199,122,.09) 0%, rgba(24,199,122,.035) 26%, transparent 52%), linear-gradient(100deg, #F7FCFA 0%, #F8FBFC 50%, #F5F8FC 100%)",
        }}
      />
      <Box sx={{ position: "relative", zIndex: 1, minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={0.9} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 28,
              height: 3,
              borderRadius: "2px",
              bgcolor: aliareColors.green,
              boxShadow: dark ? "0 0 12px rgba(24,199,122,.30)" : "none",
            }}
          />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 800,
              letterSpacing: ".085em",
              textTransform: "uppercase",
              color: dark ? "#5BE7AD" : aliareColors.greenDark,
            }}
          >
            {eyebrow}
          </Typography>
        </Stack>

        <Typography
          component="h1"
          sx={{
            mt: 0.65,
            fontWeight: 820,
            letterSpacing: "-.028em",
            fontSize: {
              xs: "1.42rem",
              sm: "1.6rem",
              md: "1.78rem",
              xl: "1.9rem",
            },
            lineHeight: 1.12,
          }}
        >
          {title}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 0.3,
            maxWidth: 880,
            lineHeight: 1.48,
          }}
        >
          {description}
        </Typography>

        {meta ? (
          <Box
            sx={{
              mt: 0.55,
              color: "text.secondary",
              fontSize: ".74rem",
              lineHeight: 1.4,
            }}
          >
            {meta}
          </Box>
        ) : null}
      </Box>

      {action ? (
        <Box
          sx={{
            position: "relative",
            zIndex: 1,
            flexShrink: 0,
            alignSelf: { xs: "stretch", lg: "center" },
            minWidth: 0,
            maxWidth: { lg: "48%" },
            p: 0,
            borderRadius: 0,
            border: 0,
            bgcolor: "transparent",
            background: "transparent",
            boxShadow: "none",
            backdropFilter: "none",
            "& > *": { maxWidth: "100%" },
            "& .MuiButton-root": { width: { xs: "100%", sm: "auto" } },
          }}
        >
          {action}
        </Box>
      ) : null}
    </Stack>
  );
}
