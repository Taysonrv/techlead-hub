/** Standard visual foundation for analytical side panels across the Hub.
 * Keeps each screen's own data, filters, actions and permission checks intact.
 */
export const detailDrawerPaperSx = {
  width: { xs: "100vw", sm: "min(92vw, 640px)", lg: "min(52vw, 720px)" },
  maxWidth: "100vw",
  boxSizing: "border-box",
  p: 0,
  overflowX: "hidden",
  overscrollBehavior: "contain",
  scrollbarGutter: "stable",
  bgcolor: "background.paper",
  color: "text.primary",
  backgroundImage: (theme: any) => theme.palette.mode === "dark"
    ? "linear-gradient(180deg, rgba(24,199,122,.075), rgba(7,20,32,.98) 240px)"
    : "linear-gradient(180deg, rgba(24,199,122,.055), rgba(255,255,255,.99) 240px)",
  boxShadow: "-18px 0 48px rgba(0,0,0,.14)",
  borderLeft: "1px solid",
  borderColor: "divider",
  "& > .MuiBox-root": {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  "& .MuiCard-root": {
    minWidth: 0,
  },
  "& .MuiTypography-root": {
    overflowWrap: "anywhere",
  },
  "& .MuiTableContainer-root": {
    maxWidth: "100%",
  },
  "& .MuiButton-root": {
    textTransform: "none",
  },
} as const;

/** Shared base for analytical panels across pages. KPI cards keep their own accent treatment. */
export const analyticalPanelSx = {
  position: "relative",
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  border: "1px solid var(--hub-border)",
  borderRadius: "var(--hub-radius-lg)",
  boxShadow: "var(--hub-shadow-card)",
  background: "var(--hub-surface)",
  backgroundImage: "none",
  color: "var(--hub-text)",
  transition: "border-color var(--hub-motion-fast) ease, box-shadow var(--hub-motion-fast) ease",
  "&:hover": { borderColor: "var(--hub-accent)" },
} as const;

// Mesmas medidas dos indicadores do Resumo Executivo (Dashboard).
export const kpiLayout = {
  height: { xs: 132, md: 148 },
  padding: { xs: 1.6, md: 2 },
  titleSize: ".84rem",
  valueSize: { xs: "1.9rem", md: "2.15rem", xl: "2.35rem" },
  columns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" },
  gap: { xs: 1.5, md: 2, xl: 2.5 },
} as const;
