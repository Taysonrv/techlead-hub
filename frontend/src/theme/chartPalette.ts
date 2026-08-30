/* =========================================================
   PALETA GERAL DE GRÁFICOS
========================================================= */

export const chartPalette = [
  "#18C77A",
  "#2F6FED",
  "#171717",
  "#8B5CF6",
  "#F59E0B",
  "#E53935",
  "#0F9BB5",
  "#667085",
] as const;

/* =========================================================
   CORES SEMÂNTICAS
========================================================= */

export const semanticChartColors = {
  positive:
    "#17A673",

  normal:
    "#2F6FED",

  attention:
    "#F5B301",

  critical:
    "#F97316",

  overdue:
    "#E53935",

  neutral:
    "#98A2B3",

  resolved:
    "#17A673",

  stopped:
    "#F59E0B",

  new:
    "#2F6FED",

  attendance:
    "#18C77A",
} as const;

/* =========================================================
   SLA / PRAZOS
========================================================= */

export const deadlineColors = {
  within:
    "#17A673",

  attention:
    "#F5B301",

  critical:
    "#F97316",

  overdue:
    "#E53935",
} as const;

/* =========================================================
   CSAT
========================================================= */

export const csatColors = {
  excellent:
    "#17A673",

  good:
    "#65B741",

  neutral:
    "#F5B301",

  bad:
    "#F97316",

  veryBad:
    "#E53935",
} as const;