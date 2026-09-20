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
    shape: { borderRadius: 14 },
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
            position: "relative",
            border: `1px solid ${border}`,
            boxShadow: dark ? "0 16px 42px rgba(0,0,0,.18), inset 0 1px rgba(255,255,255,.025)" : "0 6px 22px rgba(16,24,40,.045)",
            borderRadius: 18,
            backdropFilter: dark ? "blur(16px)" : undefined,
            background: dark ? "linear-gradient(145deg, rgba(14,35,56,.96), rgba(8,24,41,.985))" : "linear-gradient(180deg,#FFFFFF,#FBFCFD)",
            backgroundColor: paper,
            transition: "border-color .18s ease, box-shadow .18s ease, transform .18s ease",
            "&::after": dark ? { content: '""', position: "absolute", inset: "0 0 auto", height: 1, background: "linear-gradient(90deg, rgba(24,199,122,.30), rgba(47,141,255,.16), transparent 72%)", pointerEvents: "none" } : undefined,
            "&:hover": dark ? {
              borderColor: "rgba(74,178,211,.28)",
              boxShadow: "0 18px 46px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.035)",
            } : undefined,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            ...(dark && {
              borderColor: "rgba(92,154,211,.20)",
              boxShadow: "0 14px 38px rgba(0,0,0,.16)",
            }),
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            position: "relative",
            "&:last-child": { paddingBottom: 20 },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 11,
            transition: "background-color .16s ease, border-color .16s ease, color .16s ease, transform .16s ease",
            ...(dark && {
              color: "#AFC2D8",
              "&:hover": { backgroundColor: "rgba(24,199,122,.09)", color: "#5BE7AD" },
            }),
          },
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
      MuiFormControl: {
        styleOverrides: {
          root: {
            "& .MuiInputLabel-root": dark ? { color: "#8FA7C1" } : undefined,
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          paper: {
            border: `1px solid ${border}`,
            borderRadius: 12,
            backgroundColor: paper,
            ...(dark && { boxShadow: "0 18px 44px rgba(0,0,0,.34)" }),
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            transition: "border-color .16s ease, box-shadow .16s ease, background-color .16s ease",
            borderRadius: 8,
            backgroundColor: dark ? "rgba(7,20,35,.56)" : undefined,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: dark ? "rgba(131,175,220,.30)" : undefined },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: dark ? "rgba(47,208,255,.50)" : undefined },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: aliareColors.green },
            "&.Mui-focused": dark ? { boxShadow: "0 0 0 3px rgba(24,199,122,.08)", backgroundColor: "rgba(7,20,35,.72)" } : undefined,
          },
        },
      },
      MuiSelect: { styleOverrides: { select: { backgroundColor: dark ? "rgba(7,20,35,.34)" : undefined } } },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 9,
            fontWeight: 750,
            ...(dark && {
              borderColor: "rgba(124,172,218,.24)",
              boxShadow: "inset 0 1px rgba(255,255,255,.025)",
            }),
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            background: dark ? "linear-gradient(180deg,#12304A,#0E263C)" : aliareColors.graphite,
            "& .MuiTableCell-head": { color: "#FFFFFF", fontWeight: 800, borderBottomColor: dark ? "rgba(116,166,216,.18)" : aliareColors.graphite },
          },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            border: `1px solid ${border}`,
            ...(dark && { background: "linear-gradient(145deg,rgba(13,33,54,.94),rgba(8,24,41,.96))", boxShadow: "inset 0 1px rgba(255,255,255,.025), 0 12px 28px rgba(0,0,0,.10)" }),
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottomColor: border,
            ...(dark && { color: "#DCE9F7" }),
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            "&:nth-of-type(even)": { backgroundColor: dark ? "rgba(112,160,207,.035)" : "rgba(15,23,42,.018)" },
            "&:hover": { backgroundColor: dark ? "rgba(24,199,122,.075)" : "rgba(24,199,122,.055)" },
            ...(dark && { transition: "background-color .14s ease", "&:hover td:first-of-type": { boxShadow: "inset 2px 0 #18C77A" } }),
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            border: `1px solid ${border}`,
            ...(dark && { backdropFilter: "blur(12px)", boxShadow: "inset 0 1px rgba(255,255,255,.025)" }),
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: border },
        },
      },
      MuiTablePagination: {
        styleOverrides: {
          root: {
            minHeight: 52,
            borderTop: `1px solid ${border}`,
            ...(dark && { backgroundColor: "rgba(8,24,41,.78)", color: textSecondary }),
          },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            ...(dark && { background: "linear-gradient(145deg,#102B42,#0A1B2D)", border: `1px solid ${border}` }),
          },
        },
      },
      MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: dark ? "#162D43" : aliareColors.graphite, fontSize: ".75rem", borderRadius: 7, border: dark ? "1px solid rgba(116,166,216,.20)" : undefined } } },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 42,
            ...(dark && {
              border: "1px solid rgba(116,166,216,.16)",
              backgroundColor: "rgba(7,20,35,.44)",
              borderRadius: 12,
              padding: 3,
            }),
          },
          indicator: { backgroundColor: aliareColors.green, height: 3, borderRadius: 99 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 36,
            borderRadius: 9,
            fontWeight: 750,
            "&.Mui-selected": {
              color: dark ? "#42E6C1" : aliareColors.greenDark,
              ...(dark && { backgroundColor: "rgba(24,199,122,.075)" }),
            },
          },
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            border: `1px solid ${border}`,
            borderRadius: "14px !important",
            overflow: "hidden",
            ...(dark && { background: "linear-gradient(145deg,rgba(14,35,56,.94),rgba(9,25,43,.96))" }),
            "&::before": { display: "none" },
          },
        },
      },
      MuiPaginationItem: {
        styleOverrides: {
          root: {
            borderRadius: 9,
            ...(dark && {
              borderColor: "rgba(124,172,218,.22)",
              "&.Mui-selected": { backgroundColor: "rgba(24,199,122,.16)", color: "#5BE7AD" },
            }),
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 99, ...(dark && { backgroundColor: "rgba(124,172,218,.12)" }) },
          bar: { borderRadius: 99 },
        },
      },
      MuiDialog: { styleOverrides: { paper: { background: dark ? "linear-gradient(145deg,#0E2338,#0A192B)" : undefined } } },
      MuiMenu: { styleOverrides: { paper: { backgroundColor: paper } } },
      MuiPopover: { styleOverrides: { paper: { backgroundColor: paper } } },
    },
  });
}

export const theme = createAppTheme("light");
