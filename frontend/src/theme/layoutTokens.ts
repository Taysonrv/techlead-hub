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
