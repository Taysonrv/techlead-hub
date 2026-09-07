import {
  Box,
  Divider,
  IconButton,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";
import { useState } from "react";
import type { MouseEvent } from "react";
import {
  metricDefinitions,
  type MetricDefinitionKey,
} from "../config/metricDefinitions";
import { aliareColors } from "../theme/theme";

type MetricInfoProps = {
  metric: MetricDefinitionKey;
  size?: "small" | "medium";
};

export function MetricInfo({ metric, size = "small" }: MetricInfoProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const definition: import("../config/metricDefinitions").MetricDefinition = metricDefinitions[metric];

  function handleOpen(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  }

  function handleClose(event?: object) {
    if (
      event &&
      "stopPropagation" in event &&
      typeof (event as { stopPropagation?: unknown }).stopPropagation === "function"
    ) {
      (event as { stopPropagation: () => void }).stopPropagation();
    }
    setAnchorEl(null);
  }

  const open = Boolean(anchorEl);

  return (
    <>
      <Tooltip title={`Como é calculado: ${definition.title}`} arrow>
        <IconButton
          size={size}
          aria-label={`Informações sobre ${definition.title}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={handleOpen}
          onKeyDown={(event) => event.stopPropagation()}
          sx={{
            p: 0.35,
            color: "text.secondary",
            "&:hover": {
              color: aliareColors.greenDark,
              backgroundColor: "rgba(24,199,122,0.08)",
            },
          }}
        >
          <InfoOutlined sx={{ fontSize: size === "small" ? 17 : 20 }} />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            onClick: (event: MouseEvent<HTMLElement>) => event.stopPropagation(),
            sx: {
              width: { xs: 320, sm: 390 },
              maxWidth: "calc(100vw - 32px)",
              mt: 0.75,
              p: 2,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              boxShadow: "0 14px 40px rgba(16,24,40,0.14)",
            },
          },
        }}
      >
        <Stack spacing={1.2}>
          <Box>
            <Typography sx={{ fontWeight: 850 }}>{definition.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4, lineHeight: 1.55 }}>
              {definition.summary}
            </Typography>
          </Box>

          <Divider />

          <InfoLine label="Como é calculado" value={definition.calculation} />
          <InfoLine label="Fonte" value={definition.source} />
          <InfoLine label="Campo de referência" value={definition.reference} />
          <InfoLine label="Regra de período" value={definition.periodRule} />

          {definition.notes && (
            <Box
              sx={{
                p: 1.1,
                borderRadius: 1.5,
                backgroundColor: "rgba(24,199,122,0.055)",
                border: "1px solid rgba(24,199,122,0.16)",
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 800, color: aliareColors.greenDark }}>
                Observação
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25, lineHeight: 1.5 }}>
                {definition.notes}
              </Typography>
            </Box>
          )}
        </Stack>
      </Popover>
    </>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.15, lineHeight: 1.5 }}>
        {value}
      </Typography>
    </Box>
  );
}
