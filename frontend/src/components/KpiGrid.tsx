import { Box } from "@mui/material";
import type { BoxProps } from "@mui/material";
import { kpiLayout } from "../theme/layoutTokens";

/** Indicadores seguem a mesma largura e espaçamento em todos os módulos. */
export function KpiGrid({ sx, ...props }: BoxProps) {
  return <Box {...props} data-kpi-grid sx={[
    ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
    {
      display: "grid",
      width: "100%",
      minWidth: 0,
      gridTemplateColumns: kpiLayout.columns,
      gap: kpiLayout.gap,
      alignItems: "stretch",
      "& > *": { minWidth: 0 },
    },
  ]} />;
}
