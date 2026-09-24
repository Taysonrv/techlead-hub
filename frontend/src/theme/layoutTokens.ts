export const detailDrawerPaperSx = {
  width: {
    xs: "calc(100vw - 16px)",
    sm: 520,
    lg: 560,
  },
  maxWidth: "100vw",
  p: { xs: 1.75, sm: 2.5 },
  boxSizing: "border-box",
  overflowX: "hidden",
  bgcolor: "background.paper",
  color: "text.primary",
  backgroundColor: "background.paper",
  backgroundImage: (theme: any) => theme.palette.mode === "dark"
    ? "linear-gradient(180deg, rgba(24,199,122,.055), rgba(7,20,32,.98) 180px)"
    : "linear-gradient(180deg, rgba(24,199,122,.025), rgba(255,255,255,.99) 180px)",
};
