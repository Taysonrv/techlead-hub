import { Chip, type ChipProps } from "@mui/material";

type StatusTone = "success" | "warning" | "error" | "info" | "neutral";
export type StatusPillProps = Omit<ChipProps, "color" | "size" | "variant"> & {
  tone?: StatusTone;
};

/** Indicador visual de estado; não interpreta status de negócio. */
export function StatusPill({ tone = "neutral", sx, ...props }: StatusPillProps) {
  const color = tone === "neutral" ? "default" : tone;
  return <Chip {...props} size="small" variant="outlined" color={color} sx={{ borderRadius: "var(--hub-radius-sm)", fontWeight: 750, maxWidth: "100%", ...sx }} />;
}
