import {
  createTheme,
} from "@mui/material/styles";

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
} as const;

/* =========================================================
   THEME
========================================================= */

export const theme =
  createTheme({
    palette: {
      mode:
        "light",

      primary: {
        main:
          aliareColors.green,

        dark:
          aliareColors.greenDark,

        light:
          aliareColors.greenLight,

        contrastText:
          "#08150F",
      },

      secondary: {
        main:
          aliareColors.graphite,
      },

      success: {
        main:
          aliareColors.success,
      },

      warning: {
        main:
          aliareColors.warning,
      },

      error: {
        main:
          aliareColors.error,
      },

      info: {
        main:
          aliareColors.info,
      },

      background: {
        default:
          aliareColors.background,

        paper:
          aliareColors.paper,
      },

      text: {
        primary:
          aliareColors.text,

        secondary:
          aliareColors.textSecondary,
      },

      divider:
        aliareColors.border,
    },

    shape: {
      borderRadius:
        10,
    },

    typography: {
      fontFamily:
        [
          "Inter",
          "Segoe UI",
          "Roboto",
          "Arial",
          "sans-serif",
        ].join(","),

      h1: {
        fontWeight:
          800,
      },

      h2: {
        fontWeight:
          800,
      },

      h3: {
        fontWeight:
          800,
      },

      h4: {
        fontWeight:
          800,
      },

      h5: {
        fontWeight:
          800,
      },

      h6: {
        fontWeight:
          750,
      },

      button: {
        fontWeight:
          700,

        textTransform:
          "none",
      },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            margin:
              0,

            backgroundColor:
              aliareColors.background,
          },

          "*": {
            boxSizing:
              "border-box",
          },

          "::selection": {
            backgroundColor:
              aliareColors.greenLight,

            color:
              aliareColors.black,
          },
        },
      },

      MuiCard: {
        styleOverrides: {
          root: {
            border:
              `1px solid ${aliareColors.border}`,

            boxShadow:
              "0 1px 2px rgba(16, 24, 40, 0.035)",
          },
        },
      },

      MuiButton: {
  defaultProps: {
    disableElevation:
      true,
  },

  styleOverrides: {
    root: {
      borderRadius:
        8,

      minHeight:
        38,

      textTransform:
        "none",

      fontWeight:
        700,

      "&.MuiButton-containedPrimary":
        {
          backgroundColor:
            aliareColors.black,

          color:
            "#FFFFFF",

          "&:hover": {
            backgroundColor:
              aliareColors.graphiteSoft,
          },
        },
    },
  },
},

      MuiTextField: {
        defaultProps: {
          size:
            "small",
        },
      },

      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius:
              8,

            "&.Mui-focused .MuiOutlinedInput-notchedOutline":
              {
                borderColor:
                  aliareColors.green,
              },
          },
        },
      },

      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius:
              7,

            fontWeight:
              650,
          },
        },
      },

      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor:
              aliareColors.graphite,

            fontSize:
              "0.75rem",

            borderRadius:
              7,
          },
        },
      },
    },
  });