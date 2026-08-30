import {
  StrictMode,
} from "react";

import {
  createRoot,
} from "react-dom/client";

import {
  CssBaseline,
  ThemeProvider,
} from "@mui/material";

import App from "./App";

import {
  theme,
} from "./theme/theme";

import "./index.css";

/* =========================================================
   ROOT
========================================================= */

const rootElement =
  document.getElementById(
    "root"
  );

if (!rootElement) {
  throw new Error(
    "Elemento root não encontrado."
  );
}

/* =========================================================
   RENDER
========================================================= */

createRoot(
  rootElement
).render(
  <StrictMode>
    <ThemeProvider
      theme={
        theme
      }
    >
      <CssBaseline />

      <App />
    </ThemeProvider>
  </StrictMode>
);