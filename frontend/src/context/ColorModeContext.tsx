import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { createAppTheme } from "../theme/theme";

export type ColorMode = "light" | "dark";

type ColorModeContextValue = {
  mode: ColorMode;
  toggleMode: () => void;
  setMode: (mode: ColorMode) => void;
};

const ColorModeContext = createContext<ColorModeContextValue | null>(null);
const STORAGE_KEY = "techlead-hub:color-mode";

function initialMode(): ColorMode {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(initialMode);
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const setMode = (next: ColorMode) => {
    setModeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const toggleMode = () => setMode(mode === "dark" ? "light" : "dark");

  useEffect(() => {
    document.documentElement.dataset.colorMode = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  return (
    <ColorModeContext.Provider value={{ mode, toggleMode, setMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export function useColorMode() {
  const context = useContext(ColorModeContext);
  if (!context) throw new Error("useColorMode deve ser usado dentro de AppThemeProvider.");
  return context;
}
