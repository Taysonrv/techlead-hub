import {
  Box,
  CssBaseline,
} from "@mui/material";

import {
  BrowserRouter,
  Route,
  Routes,
} from "react-router-dom";

import { Sidebar } from "./components/Sidebar";

import { FiltersProvider } from "./context/FiltersContext";

import { Dashboard } from "./pages/Dashboard";
import { Tickets } from "./pages/Tickets";
import { Analysts } from "./pages/Analysts";
import { Clients } from "./pages/Clients";
import { Attention } from "./pages/Attention";
import { Import } from "./pages/Import";

function App() {
  return (
    <BrowserRouter>
      <FiltersProvider>
        <CssBaseline />

        <Box
          sx={{
            display: "flex",

            width: "100%",
            minHeight: "100vh",

            backgroundColor: "#f5f7fa",
          }}
        >
          <Sidebar />

          <Box
            component="main"
            sx={{
              flexGrow: 1,

              minWidth: 0,
              minHeight: "100vh",

              backgroundColor: "#f5f7fa",

              overflowX: "hidden",

              px: {
                xs: 1.5,
                sm: 2,
                md: 2.5,
                lg: 3,
                xl: 4,
              },

              py: {
                xs: 1.5,
                sm: 2,
                md: 2.5,
                lg: 3,
                xl: 3.5,
              },
            }}
          >
            <Box
              sx={{
                width: "100%",
                maxWidth: "100%",
              }}
            >
              <Routes>
                <Route
                  path="/"
                  element={<Dashboard />}
                />

                <Route
                  path="/tickets"
                  element={<Tickets />}
                />

                <Route
                  path="/analistas"
                  element={<Analysts />}
                />

                <Route
                  path="/clientes"
                  element={<Clients />}
                />

                <Route
                  path="/atencao"
                  element={<Attention />}
                />

                <Route
                  path="/importar"
                  element={<Import />}
                />
              </Routes>
            </Box>
          </Box>
        </Box>
      </FiltersProvider>
    </BrowserRouter>
  );
}

export default App;