import type { ReactNode } from "react";
import { Card, CardContent, Stack, Typography } from "@mui/material";

type ChartPanelProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  minHeight?: number;
};

export function ChartPanel({ title, subtitle, action, children, minHeight = 320 }: ChartPanelProps) {
  return (
    <Card variant="outlined" sx={{ height: "100%", minWidth: 0, borderRadius: 2.5, overflow: "hidden", bgcolor: "background.paper" }}>
      <CardContent sx={{ p: { xs: 1.5, md: 1.75 }, "&:last-child": { pb: { xs: 1.5, md: 1.75 } } }}>
        <Stack direction="row" spacing={1} sx={{ mb: 1.25, justifyContent: "space-between", alignItems: "flex-start" }}>
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap sx={{ fontWeight: 780 }}>{title}</Typography>
            {subtitle ? <Typography variant="caption" color="text.secondary">{subtitle}</Typography> : null}
          </Stack>
          {action}
        </Stack>
        <div style={{ minHeight, minWidth: 0, width: "100%" }}>{children}</div>
      </CardContent>
    </Card>
  );
}
