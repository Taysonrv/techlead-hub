import { createTheme } from "@mui/material/styles";
import type { PaletteMode } from "@mui/material";

/* =========================================================
   TOKENS VISUAIS - TECHLEAD HUB / ALIARE
========================================================= */

export const aliareColors = {
  black:
    "#0A0A0A",

  graphite:
    "#171717",

  graphiteSoft:
    "#242424",

  green:
    "#18C77A",

  greenDark:
    "#10945B",

  greenLight:
    "#DDF8EC",

  background:
    "#F5F6F7",

  paper:
    "#FFFFFF",

  border:
    "#E3E6E8",

  text:
    "#171717",

  textSecondary:
    "#667085",

  success:
    "#17A673",

  warning:
    "#F59E0B",

  error:
    "#E53935",

  info:
    "#2F6FED",

  purple:
    "#7C3AED",

  cyan:
    "#0891B2",

  surfaceBlue:
    "#EFF6FF",

  surfaceGreen:
    "#ECFDF5",

  surfaceAmber:
    "#FFFBEB",

  surfaceRed:
    "#FEF2F2",
} as const;

/* =========================================================
   THEME
========================================================= */

export function createAppTheme(mode: PaletteMode = "light") {
  const dark = mode === "dark";
  const background = dark ? "#071321" : aliareColors.background;
  const paper = dark ? "#0D2136" : aliareColors.paper;
  const border = dark ? "rgba(116,166,216,.18)" : aliareColors.border;
  const text = dark ? "#E8F1FF" : aliareColors.text;
  const textSecondary = dark ? "#9DB0C7" : aliareColors.textSecondary;

  return createTheme({
    palette: {
      mode,
      primary: { main: aliareColors.green, dark: aliareColors.greenDark, light: aliareColors.greenLight, contrastText: "#08150F" },
      secondary: { main: dark ? "#8FA8C2" : aliareColors.graphite },
      success: { main: aliareColors.success },
      warning: { main: aliareColors.warning },
      error: { main: aliareColors.error },
      info: { main: dark ? "#4C8DFF" : aliareColors.info },
      background: { default: background, paper },
      text: { primary: text, secondary: textSecondary },
      divider: border,
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: ["Inter", "Segoe UI", "Roboto", "Arial", "sans-serif"].join(","),
      h1: { fontWeight: 800 }, h2: { fontWeight: 800 },
      h3: { fontWeight: 800, fontSize: "2.1rem", lineHeight: 1.12, letterSpacing: "-0.025em" },
      h4: { fontWeight: 800 }, h5: { fontWeight: 800 }, h6: { fontWeight: 750 },
      button: { fontWeight: 700, textTransform: "none" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { backgroundColor: background },
          body: {
            margin: 0,
            backgroundColor: background,
            backgroundImage: dark
              ? "radial-gradient(circle at 18% 0%, rgba(0,199,142,.10), transparent 28%), radial-gradient(circle at 90% 8%, rgba(84,73,255,.11), transparent 30%), linear-gradient(145deg,#071321 0%,#09192B 48%,#07111F 100%)"
              : "radial-gradient(circle at 92% 0%, rgba(24,199,122,.075), transparent 28%), linear-gradient(180deg, #F8FAFB 0%, #F3F5F6 100%)",
            backgroundAttachment: "fixed",
            color: text,
          },
          "*": { boxSizing: "border-box" },
          "::selection": { backgroundColor: dark ? "rgba(24,199,122,.32)" : aliareColors.greenLight, color: dark ? "#FFFFFF" : aliareColors.black },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${border}`,
            boxShadow: dark ? "0 12px 34px rgba(0,0,0,.16)" : "0 1px 2px rgba(16,24,40,.035)",
            borderRadius: 18,
            background: dark ? "linear-gradient(145deg, rgba(14,35,56,.96), rgba(10,25,43,.98))" : aliareColors.paper,
            backgroundColor: paper,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: dark ? "linear-gradient(180deg,#0B1C2E,#081725)" : paper,
            borderColor: border,
            "&.MuiDrawer-paperAnchorRight": { width: "min(560px, 92vw)", maxWidth: "100vw", boxSizing: "border-box" },
            "&.MuiDrawer-paperAnchorRight > .MuiBox-root:first-of-type": { width: "100%", maxWidth: "100%", boxSizing: "border-box" },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 8,
            minHeight: 38,
            textTransform: "none",
            fontWeight: 700,
            "&.MuiButton-containedPrimary": {
              backgroundColor: dark ? aliareColors.green : aliareColors.black,
              color: dark ? "#071811" : "#FFFFFF",
              "&:hover": { backgroundColor: dark ? "#22D98A" : aliareColors.graphiteSoft },
            },
          },
          outlined: { borderColor: dark ? "rgba(130,173,216,.28)" : undefined },
        },
      },
      MuiTextField: { defaultProps: { size: "small" } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundColor: dark ? "rgba(7,20,35,.56)" : undefined,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: dark ? "rgba(131,175,220,.30)" : undefined },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: dark ? "rgba(47,208,255,.50)" : undefined },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: aliareColors.green },
          },
        },
      },
      MuiSelect: { styleOverrides: { select: { backgroundColor: dark ? "rgba(7,20,35,.34)" : undefined } } },
      MuiChip: { styleOverrides: { root: { borderRadius: 7, fontWeight: 650 } } },
      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor: dark ? "#10283E" : aliareColors.graphite,
            "& .MuiTableCell-head": { color: "#FFFFFF", fontWeight: 800, borderBottomColor: dark ? "rgba(116,166,216,.18)" : aliareColors.graphite },
          },
        },
      },
      MuiTableCell: { styleOverrides: { root: { borderBottomColor: border } } },
      MuiTableRow: {
        styleOverrides: {
          root: {
            "&:nth-of-type(even)": { backgroundColor: dark ? "rgba(112,160,207,.035)" : "rgba(15,23,42,.018)" },
            "&:hover": { backgroundColor: dark ? "rgba(24,199,122,.075)" : "rgba(24,199,122,.055)" },
          },
        },
      },
      MuiAlert: { styleOverrides: { root: { borderRadius: 12, border: `1px solid ${border}` } } },
      MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: dark ? "#162D43" : aliareColors.graphite, fontSize: ".75rem", borderRadius: 7, border: dark ? "1px solid rgba(116,166,216,.20)" : undefined } } },
      MuiTabs: { styleOverrides: { indicator: { backgroundColor: aliareColors.green, height: 3 } } },
      MuiTab: { styleOverrides: { root: { "&.Mui-selected": { color: dark ? "#42E6C1" : aliareColors.greenDark } } } },
      MuiDialog: { styleOverrides: { paper: { background: dark ? "linear-gradient(145deg,#0E2338,#0A192B)" : undefined } } },
      MuiMenu: { styleOverrides: { paper: { backgroundColor: paper } } },
      MuiPopover: { styleOverrides: { paper: { backgroundColor: paper } } },
    },
  });
}

export const theme = createAppTheme("light");
