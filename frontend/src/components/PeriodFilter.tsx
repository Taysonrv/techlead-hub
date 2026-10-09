import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { useFilters, type PeriodOption } from "../context/FiltersContext";

export function PeriodFilter() {
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
        alignItems: { xs: "stretch", sm: "center" },
        flexWrap: "wrap",
        width: "100%",
        minWidth: 0,
      }}
    >
      <FormControl
        size="small"
        sx={{
          minWidth: { xs: "100%", sm: 168 },
          flex: { xs: "1 1 100%", sm: "0 1 184px" },
        }}
      >
        <InputLabel id="period-label" shrink>Período</InputLabel>

        <Select
          labelId="period-label"
          value={period}
          label="Período"
          onChange={(event) => setPeriod(event.target.value as PeriodOption)}
          sx={{
            bgcolor: "background.paper",
            borderRadius: 1.25,
            "& .MuiSelect-select": {
              py: 1.05,
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
      </FormControl>

      {period === "custom" ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(145px,1fr))" },
            gap: 0.8,
            flex: "1 1 310px",
            minWidth: 0,
          }}
        >
          <TextField
            size="small"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            label="Data inicial"
            sx={{ minWidth: 0, "& .MuiOutlinedInput-root": { bgcolor: "background.paper" } }}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            size="small"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            label="Data final"
            sx={{ minWidth: 0, "& .MuiOutlinedInput-root": { bgcolor: "background.paper" } }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
      ) : null}
    </Stack>
  );
}
