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
      direction={{
        xs: "column",
        sm: "row",
      }}
      spacing={1}
      sx={{
        alignItems: {
          xs: "stretch",
          sm: "center",
        },
      }}
    >
      <FormControl
        size="small"
        sx={{
          minWidth: { xs: "100%", sm: 180 },
        }}
      >
        <InputLabel id="period-label">
          Período
        </InputLabel>

        <Select
          labelId="period-label"
          value={period}
          label="Período"
          onChange={(event) =>
            setPeriod(
              event.target.value as PeriodOption
            )
          }
        >
          <MenuItem value="7d">
            Últimos 7 dias
          </MenuItem>

          <MenuItem value="30d">
            Últimos 30 dias
          </MenuItem>

          <MenuItem value="60d">
            Últimos 60 dias
          </MenuItem>

          <MenuItem value="90d">
            Últimos 90 dias
          </MenuItem>

          <MenuItem value="month">
            Este mês
          </MenuItem>

          <MenuItem value="lastMonth">
            Mês passado
          </MenuItem>

          <MenuItem value="semester">
            Este semestre
          </MenuItem>

          <MenuItem value="year">
            Este ano
          </MenuItem>

          <MenuItem value="custom">
            Personalizado
          </MenuItem>
        </Select>
      </FormControl>

      {period === "custom" && (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            flex: 1,
          }}
        >
          <TextField
            size="small"
            type="date"
            value={startDate}
            onChange={(event) =>
              setStartDate(event.target.value)
            }
            sx={{
              minWidth: { xs: "100%", sm: 155 },
            }}
            slotProps={{
              inputLabel: {
                shrink: true,
              },
            }}
            label="Data inicial"
          />

          <TextField
            size="small"
            type="date"
            value={endDate}
            onChange={(event) =>
              setEndDate(event.target.value)
            }
            sx={{
              minWidth: { xs: "100%", sm: 155 },
            }}
            slotProps={{
              inputLabel: {
                shrink: true,
              },
            }}
            label="Data final"
          />
        </Box>
      )}
    </Stack>
  );
}