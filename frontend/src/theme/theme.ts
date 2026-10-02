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
  const background = dark ? "#061522" : aliareColors.background;
  const paper = dark ? "#0A2030" : aliareColors.paper;
  const border = dark ? "rgba(92,164,188,.20)" : aliareColors.border;
  const text = dark ? "#EAF6F4" : aliareColors.text;
  const textSecondary = dark ? "#9BB8BC" : aliareColors.textSecondary;

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
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: ["Inter", "Segoe UI", "Roboto", "Arial", "sans-serif"].join(","),
      h1: { fontWeight: 800 }, h2: { fontWeight: 800 },
      h3: { fontWeight: 800, fontSize: "2.1rem", lineHeight: 1.12, letterSpacing: "-0.025em" },
      h4: { fontWeight: 800, letterSpacing: "-0.02em" },
      h5: { fontWeight: 780, letterSpacing: "-0.018em" },
      h6: { fontWeight: 750, letterSpacing: "-0.012em" },
      subtitle1: { fontWeight: 700, letterSpacing: "-0.008em" },
      body1: { lineHeight: 1.55 },
      body2: { lineHeight: 1.5 },
      caption: { lineHeight: 1.4 },
      button: { fontWeight: 700, textTransform: "none", letterSpacing: ".002em" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { backgroundColor: background },
          body: {
            margin: 0,
            backgroundColor: background,
            backgroundImage: dark
              ? "radial-gradient(circle at 12% 0%, rgba(24,199,122,.13), transparent 30%), radial-gradient(circle at 88% 8%, rgba(41,126,163,.14), transparent 32%), linear-gradient(135deg,#06110E 0%,#071823 48%,#061522 100%)"
              : "radial-gradient(circle at 92% 0%, rgba(24,199,122,.075), transparent 28%), linear-gradient(180deg, #F8FAFB 0%, #F3F5F6 100%)",
            backgroundAttachment: "fixed",
            color: text,
          },
          "*": { boxSizing: "border-box" },
          "*:focus-visible": { outline: "none" },
          "button, a, [role='button']": { WebkitTapHighlightColor: "transparent" },
          "::selection": { backgroundColor: dark ? "rgba(24,199,122,.32)" : aliareColors.greenLight, color: dark ? "#FFFFFF" : aliareColors.black },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            position: "relative",
            border: `1px solid ${border}`,
            boxShadow: dark ? "0 16px 42px rgba(0,0,0,.18), inset 0 1px rgba(255,255,255,.025)" : "0 8px 24px rgba(15,23,42,.055)",
            borderRadius: 16,
            overflow: "hidden",
            backdropFilter: dark ? "blur(16px)" : undefined,
            background: dark ? "linear-gradient(145deg, rgba(10,35,45,.94), rgba(7,27,39,.97))" : "linear-gradient(180deg,#FFFFFF,#FBFCFD)",
            backgroundColor: paper,
            transition: "border-color .18s ease, box-shadow .18s ease, transform .18s ease, background-color .18s ease",
            "&::after": dark ? { content: '""', position: "absolute", inset: "0 0 auto", height: 1, background: "linear-gradient(90deg, rgba(24,199,122,.30), rgba(47,141,255,.16), transparent 72%)", pointerEvents: "none" } : undefined,
            "&:hover": {
              borderColor: dark ? "rgba(70,194,163,.28)" : "rgba(24,199,122,.20)",
              boxShadow: dark ? "0 18px 46px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.035)" : "0 14px 34px rgba(15,23,42,.075)",
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            transition: "border-color .16s ease, box-shadow .16s ease, background-color .16s ease",
            ...(dark && {
              borderColor: "rgba(92,154,211,.20)",
              boxShadow: "0 14px 38px rgba(0,0,0,.16)",
            }),
          },
        },
      },
      MuiCardHeader: {
        styleOverrides: {
          root: {
            padding: "18px 20px 12px",
            borderBottom: `1px solid ${border}`,
            ...(dark && { background: "linear-gradient(90deg, rgba(20,53,78,.42), rgba(8,24,41,.08))" }),
          },
          title: { fontWeight: 800, letterSpacing: "-.01em" },
          subheader: { color: textSecondary },
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
            background: dark ? "linear-gradient(180deg,#081D27,#061722)" : paper,
            borderColor: border,
            "&.MuiDrawer-paperAnchorRight": {
              width: "min(560px, 92vw)", maxWidth: "100vw", boxSizing: "border-box",
              borderLeft: `1px solid ${dark ? "rgba(69,201,225,.22)" : border}`,
              boxShadow: dark ? "-24px 0 60px rgba(0,0,0,.32)" : "-18px 0 48px rgba(16,24,40,.12)",
              "&::before": { content: '""', position: "absolute", inset: "0 auto 0 0", width: 2, background: "linear-gradient(180deg,#18C77A,#22D3EE,transparent 80%)", opacity: dark ? .9 : .5 },
            },
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
            letterSpacing: ".005em",
            transition: "transform .16s ease, box-shadow .16s ease, background-color .16s ease, border-color .16s ease",
            "&:hover": { transform: "translateY(-1px)" },
            "&:focus-visible": { outline: "none", boxShadow: dark ? "0 0 0 3px rgba(24,199,122,.14)" : "0 0 0 3px rgba(24,199,122,.12)" },
            "&.MuiButton-containedPrimary": {
              background: "linear-gradient(135deg,#18C77A 0%,#0FA968 100%)",
              color: "#FFFFFF",
              boxShadow: dark ? "0 7px 20px rgba(24,199,122,.16)" : "0 6px 16px rgba(16,148,91,.16)",
              "&:hover": { background: "linear-gradient(135deg,#20D487 0%,#10945B 100%)", boxShadow: "0 9px 22px rgba(16,148,91,.20)" },
            },
          },
          outlined: { borderColor: dark ? "rgba(130,173,216,.28)" : undefined },
        },
      },
      MuiTextField: {
        defaultProps: {
          size: "small",
          slotProps: { inputLabel: { shrink: true } },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: textSecondary,
            lineHeight: 1,
            pointerEvents: "none",
            zIndex: 2,
            "&.MuiInputLabel-outlined": {
              transform: "translate(12px, -7px) scale(0.75)",
              transformOrigin: "top left",
              padding: 0,
            },
            "&.MuiInputLabel-outlined.MuiInputLabel-shrink": {
              transform: "translate(12px, -7px) scale(0.75)",
              transformOrigin: "top left",
            },
            "&.Mui-focused": { color: aliareColors.green },
            "&.Mui-disabled": { color: dark ? "#60758C" : "#98A2B3" },
          },
        },
      },
      MuiFormControl: {
        styleOverrides: {
          root: {
            minWidth: 0,
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          root: {
            minWidth: 0,
            "& .MuiOutlinedInput-root.MuiInputBase-sizeSmall": { minHeight: 42 },
            "& .MuiAutocomplete-input": { minWidth: 0 },
          },
          tagSizeSmall: { height: 24, maxWidth: 180 },
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
            "&.MuiInputBase-sizeSmall": { minHeight: 42 },
            backgroundColor: dark ? "rgba(5,25,34,.62)" : undefined,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: dark ? "rgba(131,175,220,.30)" : undefined },
            "& .MuiOutlinedInput-notchedOutline legend": {
              fontSize: "0.75em",
            },
            "& .MuiOutlinedInput-notchedOutline legend > span": {
              paddingLeft: 5,
              paddingRight: 5,
            },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: dark ? "rgba(47,208,255,.50)" : undefined },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: aliareColors.green },
            "&.Mui-focused": dark ? { boxShadow: "0 0 0 3px rgba(24,199,122,.08)", backgroundColor: "rgba(7,20,35,.72)" } : undefined,
          },
        },
      },
      MuiSelect: {
        defaultProps: { notched: true },
        styleOverrides: { select: { backgroundColor: dark ? "rgba(7,20,35,.34)" : undefined } },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 9,
            minHeight: 26,
            fontWeight: 700,
            fontSize: ".75rem",
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
            background: dark ? "linear-gradient(180deg,#0D3440,#0A2935)" : aliareColors.graphite,
            "& .MuiTableCell-head": { color: "#FFFFFF", fontWeight: 750, fontSize: ".76rem", letterSpacing: ".035em", textTransform: "uppercase", borderBottomColor: dark ? "rgba(116,166,216,.18)" : aliareColors.graphite },
          },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            scrollbarColor: dark ? "#31516E #091827" : undefined,
            "&::-webkit-scrollbar": { height: 9, width: 9 },
            "&::-webkit-scrollbar-track": { background: dark ? "#091827" : "#EEF1F3" },
            "&::-webkit-scrollbar-thumb": { background: dark ? "#31516E" : "#C7CDD3", borderRadius: 99 },
            borderRadius: 14,
            border: `1px solid ${border}`,
            ...(dark && { background: "linear-gradient(145deg,rgba(9,34,44,.94),rgba(6,25,36,.97))", boxShadow: "inset 0 1px rgba(255,255,255,.025), 0 12px 28px rgba(0,0,0,.10)" }),
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottomColor: border,
            paddingTop: 12,
            paddingBottom: 12,
            fontSize: ".86rem",
            lineHeight: 1.45,
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
      MuiFormHelperText: {
        styleOverrides: { root: dark ? { color: "#849CB6" } : {} },
      },
      MuiInputBase: {
        styleOverrides: {
          input: dark ? { "&::placeholder": { color: "#7F98B3", opacity: 1 } } : {},
        },
      },
      MuiCircularProgress: {
        styleOverrides: { root: { color: aliareColors.green } },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { fontWeight: 850, letterSpacing: "-.012em" } },
      },
      MuiDialogContent: {
        styleOverrides: { root: { scrollbarGutter: "stable" } },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            border: `1px solid ${border}`,
            alignItems: "center",
            ...(dark && { backdropFilter: "blur(12px)", boxShadow: "inset 0 1px rgba(255,255,255,.025)" }),
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: border, opacity: dark ? .9 : .8 },
        },
      },
      MuiFormControlLabel: {
        styleOverrides: {
          label: { fontSize: ".86rem", lineHeight: 1.45, color: textSecondary },
        },
      },
      MuiTablePagination: {
        styleOverrides: {
          root: {
            minHeight: 52,
            borderTop: `1px solid ${border}`,
            ...(dark && { backgroundColor: "rgba(6,25,36,.82)", color: textSecondary }),
          },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            ...(dark && { background: "linear-gradient(145deg,#0C3340,#081F2C)", border: `1px solid ${border}` }),
          },
        },
      },
      MuiSvgIcon: { styleOverrides: { root: { transition: "transform .16s ease, filter .16s ease", filter: dark ? "drop-shadow(0 2px 5px rgba(0,0,0,.18))" : "drop-shadow(0 1px 1px rgba(15,23,42,.08))" } } },
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
      MuiSkeleton: {
        styleOverrides: {
          root: dark ? { backgroundColor: "rgba(124,172,218,.10)", "&::after": { background: "linear-gradient(90deg, transparent, rgba(124,172,218,.10), transparent)" } } : {},
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 99, ...(dark && { backgroundColor: "rgba(124,172,218,.12)" }) },
          bar: { borderRadius: 99 },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: {
            padding: 3,
            borderRadius: 12,
            border: `1px solid ${border}`,
            backgroundColor: dark ? "rgba(7,20,35,.46)" : "rgba(248,250,252,.9)",
          },
          grouped: { border: 0, borderRadius: "9px !important", margin: 1 },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            minHeight: 34,
            fontWeight: 750,
            textTransform: "none",
            color: textSecondary,
            "&.Mui-selected": {
              color: dark ? "#54E7B0" : aliareColors.greenDark,
              backgroundColor: dark ? "rgba(24,199,122,.13)" : "rgba(24,199,122,.09)",
              boxShadow: dark ? "inset 0 0 0 1px rgba(24,199,122,.18), 0 0 18px rgba(24,199,122,.06)" : "inset 0 0 0 1px rgba(24,199,122,.12)",
            },
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: "2px 5px",
            minHeight: 38,
            "&.Mui-selected": { backgroundColor: dark ? "rgba(24,199,122,.12)" : "rgba(24,199,122,.08)" },
            "&:hover": { backgroundColor: dark ? "rgba(76,141,255,.09)" : "rgba(15,23,42,.04)" },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            border: `1px solid ${border}`,
            borderRadius: 18,
            background: dark ? "linear-gradient(145deg,#0E2338,#0A192B)" : undefined,
            boxShadow: dark ? "0 28px 80px rgba(0,0,0,.42)" : "0 24px 64px rgba(16,24,40,.18)",
          },
        },
      },
      MuiMenu: { styleOverrides: { paper: { backgroundColor: paper } } },
      MuiPopover: { styleOverrides: { paper: { backgroundColor: paper } } },
    },
  });
}

export const theme = createAppTheme("light");
