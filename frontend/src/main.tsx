import {
  StrictMode,
} from "react";

import {
  createRoot,
} from "react-dom/client";


import App from "./App";

import { AppThemeProvider } from "./context/ColorModeContext";

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
    <AppThemeProvider>
      <App />
    </AppThemeProvider>
  </StrictMode>
);