import {
  Box,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useId } from "react";
import { useFilters, type PeriodOption } from "../context/FiltersContext";

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    minHeight: 40,
    borderRadius: "8px",
    bgcolor: "background.paper",
  },
} as const;

export function PeriodFilter() {
  const instanceId = useId();
  const periodId = `${instanceId}-period`;
  const periodLabelId = `${instanceId}-period-label`;
  const startDateId = `${instanceId}-start-date`;
  const endDateId = `${instanceId}-end-date`;

  const {
    period,
    setPeriod,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
  } = useFilters();

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={0.8}
      useFlexGap
      sx={{
        alignItems: { xs: "stretch", sm: "flex-end" },
        flexWrap: "wrap",
        width: "100%",
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          minWidth: { xs: "100%", sm: 168 },
          flex: { xs: "1 1 100%", sm: "0 1 184px" },
        }}
      >
        <Typography
          component="span"
          id={periodLabelId}
          variant="caption"
          color="text.secondary"
          sx={{
            display: "block",
            mb: 0.45,
            ml: 0.15,
            fontSize: ".7rem",
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          Período
        </Typography>

        <Select
          id={periodId}
          labelId={periodLabelId}
          value={period}
          onChange={(event) => setPeriod(event.target.value as PeriodOption)}
          inputProps={{ "aria-label": "Período" }}
          sx={{
            width: "100%",
            minHeight: 40,
            borderRadius: "8px",
            bgcolor: "background.paper",
            "& .MuiSelect-select": {
              py: 1.05,
              px: 1.4,
              pr: "36px !important",
              display: "flex",
              alignItems: "center",
            },
          }}
        >
          <MenuItem value="7d">Últimos 7 dias</MenuItem>
          <MenuItem value="30d">Últimos 30 dias</MenuItem>
          <MenuItem value="60d">Últimos 60 dias</MenuItem>
          <MenuItem value="90d">Últimos 90 dias</MenuItem>
          <MenuItem value="month">Este mês</MenuItem>
          <MenuItem value="lastMonth">Mês passado</MenuItem>
          <MenuItem value="semester">Este semestre</MenuItem>
          <MenuItem value="year">Este ano</MenuItem>
          <MenuItem value="custom">Personalizado</MenuItem>
        </Select>
      </Box>

      {period === "custom" ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2,minmax(145px,1fr))",
            },
            gap: 0.8,
            flex: "1 1 310px",
            minWidth: 0,
          }}
        >
          <Box>
            <Typography
              component="label"
              htmlFor={startDateId}
              variant="caption"
              color="text.secondary"
              sx={{
                display: "block",
                mb: 0.45,
                ml: 0.15,
                fontSize: ".7rem",
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              Data inicial
            </Typography>
            <TextField
              id={startDateId}
              fullWidth
              size="small"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              slotProps={{ htmlInput: { "aria-label": "Data inicial" } }}
              sx={fieldSx}
            />
          </Box>

          <Box>
            <Typography
              component="label"
              htmlFor={endDateId}
              variant="caption"
              color="text.secondary"
              sx={{
                display: "block",
                mb: 0.45,
                ml: 0.15,
                fontSize: ".7rem",
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              Data final
            </Typography>
            <TextField
              id={endDateId}
              fullWidth
              size="small"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              slotProps={{ htmlInput: { "aria-label": "Data final" } }}
              sx={fieldSx}
            />
          </Box>
        </Box>
      ) : null}
    </Stack>
  );
}
