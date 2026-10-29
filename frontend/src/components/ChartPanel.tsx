import type { ReactNode } from "react";
import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
} from "@mui/material";
import { analyticalPanelSx } from "../theme/layoutTokens";

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
  return (
    <Card
      variant="outlined"
      sx={{
        ...analyticalPanelSx,
      }}
    >
      <CardContent
        sx={{
          height: "100%",
          p: { xs: 2, md: 2.5 },
          display: "flex",
          flexDirection: "column",
          "&:last-child": { pb: { xs: 2, md: 2.5 } },
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={0.9}
          sx={{
            mb: 1.5,
            minHeight: { xs: 0, sm: 40 },
            justifyContent: "space-between",
            alignItems: { xs: "stretch", sm: "flex-start" },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.8} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 4,
                  height: 24,
                  borderRadius: "2px",
                  bgcolor: "primary.main",
                  flexShrink: 0,
                }}
              />
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 820,
                  fontSize: { xs: "1rem", sm: "1.06rem" },
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
            minHeight: { xs: Math.min(minHeight, 220), sm: minHeight },
            minWidth: 0,
            width: "100%",
            borderRadius: "var(--hub-radius-md)",
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
