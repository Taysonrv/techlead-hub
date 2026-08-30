import {
  Box,
} from "@mui/material";

import type {
  ReactNode,
} from "react";

import {
  BrowserRouter,
  Route,
  Routes,
} from "react-router-dom";

import {
  Sidebar,
} from "./components/Sidebar";

import {
  ProtectedRoute,
} from "./components/ProtectedRoute";

import {
  AuthProvider,
} from "./context/AuthContext";

import {
  FiltersProvider,
} from "./context/FiltersContext";

import {
  Dashboard,
} from "./pages/Dashboard";

import {
  Tickets,
} from "./pages/Tickets";

import {
  Analysts,
} from "./pages/Analysts";

import {
  Clients,
} from "./pages/Clients";

import {
  Attention,
} from "./pages/Attention";

import {
  Performance,
} from "./pages/Performance";

import {
  Import,
} from "./pages/Import";

import {
  About,
} from "./pages/About";

import {
  Profile,
} from "./pages/Profile";

import {
  Login,
} from "./pages/Login";

/* =========================================================
   LAYOUT AUTENTICADO
========================================================= */

function AuthenticatedLayout({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <ProtectedRoute>
      <FiltersProvider>
        <Box
          sx={{
            display:
              "flex",

            width:
              "100%",

            minHeight:
              "100vh",

            backgroundColor:
              "background.default",
          }}
        >
          <Sidebar />

          <Box
            component="main"
            sx={{
              flexGrow:
                1,

              minWidth:
                0,

              minHeight:
                "100vh",

              backgroundColor:
                "background.default",

              overflowX:
                "hidden",

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
                width:
                  "100%",

                maxWidth:
                  "100%",
              }}
            >
              {children}
            </Box>
          </Box>
        </Box>
      </FiltersProvider>
    </ProtectedRoute>
  );
}

/* =========================================================
   APP
========================================================= */

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* =================================================
              ROTA PÚBLICA
          ================================================= */}

          <Route
            path="/login"
            element={
              <Login />
            }
          />

          {/* =================================================
              ROTAS PROTEGIDAS
          ================================================= */}

          <Route
            path="/"
            element={
              <AuthenticatedLayout>
                <Dashboard />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/tickets"
            element={
              <AuthenticatedLayout>
                <Tickets />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/analistas"
            element={
              <AuthenticatedLayout>
                <Analysts />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/clientes"
            element={
              <AuthenticatedLayout>
                <Clients />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/desempenho"
            element={
              <AuthenticatedLayout>
                <Performance />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/atencao"
            element={
              <AuthenticatedLayout>
                <Attention />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/importar"
            element={
              <AuthenticatedLayout>
                <Import />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/sobre"
            element={
              <AuthenticatedLayout>
                <About />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/perfil"
            element={
              <AuthenticatedLayout>
                <Profile />
              </AuthenticatedLayout>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;