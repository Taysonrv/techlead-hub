export const detailDrawerPaperSx = {
  width: {
    xs: "100vw",
    sm: 520,
    lg: 560,
  },
  maxWidth: "100vw",
  p: { xs: 1.5, sm: 2.25 },
  boxSizing: "border-box",
  overflowX: "hidden",
  overscrollBehavior: "contain",
  bgcolor: "background.paper",
  color: "text.primary",
  backgroundColor: "background.paper",
  backgroundImage: (theme: any) => theme.palette.mode === "dark"
    ? "linear-gradient(180deg, rgba(24,199,122,.055), rgba(7,20,32,.98) 180px)"
    : "linear-gradient(180deg, rgba(24,199,122,.025), rgba(255,255,255,.99) 180px)",
};

// Mesmas medidas dos indicadores do Resumo Executivo (Dashboard).
export const kpiLayout = {
  height: { xs: 112, md: 118 },
  padding: { xs: 1.25, md: 1.4 },
  titleSize: ".8rem",
  valueSize: { xs: "1.45rem", md: "1.62rem", xl: "1.72rem" },
  columns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" },
  gap: { xs: 1.25, md: 1.5, xl: 2 },
} as const;
