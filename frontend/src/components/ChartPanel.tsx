import type { ReactNode } from "react";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";

type ChartPanelProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  minHeight?: number;
};

export function ChartPanel({ title, subtitle, action, children, minHeight = 280 }: ChartPanelProps) {
  return (
    <Card variant="outlined" sx={{ height: "100%", minWidth: 0, borderRadius: 2.5, overflow: "hidden", bgcolor: "background.paper" }}>
      <CardContent sx={{ p: { xs: 1.5, md: 1.75 }, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", "&:last-child": { pb: { xs: 1.5, md: 1.75 } } }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={.75} sx={{ mb: 1, minHeight: { sm: 44 }, justifyContent: "space-between", alignItems: { sm: "flex-start" } }}>
          <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 780, lineHeight: 1.3 }}>{title}</Typography>
            {subtitle ? <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>{subtitle}</Typography> : null}
          </Stack>
          {action ? <Box sx={{ flexShrink: 0, maxWidth: "100%" }}>{action}</Box> : null}
        </Stack>
        <Box sx={{ minHeight, minWidth: 0, width: "100%", flex: 1, position: "relative" }}>{children}</Box>
      </CardContent>
    </Card>
  );
}
