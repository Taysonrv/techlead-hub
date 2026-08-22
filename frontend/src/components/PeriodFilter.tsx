import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";

import { useFilters } from "../context/FiltersContext";

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
        md: "row",
      }}
      spacing={2}
      sx={{
        alignItems: {
          xs: "stretch",
          md: "center",
        },
      }}
    >
      <FormControl
        size="small"
        sx={{
          minWidth: 220,
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
              event.target.value as
                | "7d"
                | "30d"
                | "month"
                | "custom"
            )
          }
        >
          <MenuItem value="7d">
            Últimos 7 dias
          </MenuItem>

          <MenuItem value="30d">
            Últimos 30 dias
          </MenuItem>

          <MenuItem value="month">
            Este mês
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
            gap: 2,
            flexWrap: "wrap",
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
              minWidth: 210,
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
              minWidth: 210,
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