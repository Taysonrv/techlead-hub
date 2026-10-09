import type { ReactNode } from "react";
import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";

type ChartPanelProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  minHeight?: number;
  footer?: ReactNode;
};

export function ChartPanel({
  title,
  subtitle,
  action,
  children,
  minHeight = 280,
  footer,
}: ChartPanelProps) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        minWidth: 0,
        overflow: "hidden",
        bgcolor: "background.paper",
        borderColor: "divider",
        background: dark
          ? "linear-gradient(145deg, rgba(10,33,48,.96), rgba(7,25,38,.985))"
          : "linear-gradient(180deg, #FFFFFF, #FBFCFD)",
      }}
    >
      <CardContent
        sx={{
          height: "100%",
          p: { xs: 1.4, md: 1.65 },
          display: "flex",
          flexDirection: "column",
          "&:last-child": { pb: { xs: 1.4, md: 1.65 } },
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={0.9}
          sx={{
            mb: 1.1,
            minHeight: 38,
            justifyContent: "space-between",
            alignItems: { xs: "stretch", sm: "flex-start" },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.8} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 3,
                  height: 18,
                  borderRadius: "2px",
                  bgcolor: "primary.main",
                  flexShrink: 0,
                }}
              />
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 820,
                  lineHeight: 1.3,
                  letterSpacing: "-.008em",
                }}
              >
                {title}
              </Typography>
            </Stack>

            {subtitle ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: "block",
                  mt: 0.35,
                  pl: 1.4,
                  lineHeight: 1.4,
                }}
              >
                {subtitle}
              </Typography>
            ) : null}
          </Box>

          {action ? (
            <Box
              sx={{
                flexShrink: 0,
                alignSelf: { xs: "stretch", sm: "center" },
                "& .MuiButton-root": { width: { xs: "100%", sm: "auto" } },
              }}
            >
              {action}
            </Box>
          ) : null}
        </Stack>

        <Box
          className="techlead-chart-area"
          sx={{
            position: "relative",
            flex: "1 1 auto",
            minHeight,
            minWidth: 0,
            width: "100%",
            borderRadius: "10px",
            "& > .recharts-responsive-container": {
              minHeight,
            },
          }}
        >
          {children}
        </Box>

        {footer ? (
          <Box
            sx={{
              mt: 1,
              pt: 1,
              borderTop: "1px solid",
              borderColor: "divider",
              color: "text.secondary",
            }}
          >
            {footer}
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
}
