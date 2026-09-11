import {
  Box,
  CircularProgress,
  Typography,
} from "@mui/material";

import type {
  ReactNode,
} from "react";

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import {
  Sidebar,
} from "./components/Sidebar";
import { GlobalTopBar } from "./components/GlobalTopBar";

import {
  ProtectedRoute,
} from "./components/ProtectedRoute";

import {
  AuthProvider,
  useAuth,
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

import {
  Users,
} from "./pages/Users";

import {
  AzureWorkItems,
} from "./pages/AzureWorkItems";

import {
  Versions,
} from "./pages/Versions";

import {
  Settings,
} from "./pages/Settings";

import {
  Reports,
} from "./pages/Reports";

import {
  MyOperation,
} from "./pages/MyOperation";

import {
  DataQuality,
} from "./pages/DataQuality";
import { Knowledge } from "./pages/Knowledge";

import {
  aliareColors,
} from "./theme/theme";

/* =========================================================
   LAYOUT AUTENTICADO
========================================================= */

function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ProtectedRoute>
      <FiltersProvider>
        <Box
          sx={{
            display: "flex",
            width: "100%",
            minHeight: "100vh",
            backgroundColor: "background.default",
          }}
        >
          <Sidebar />

          <Box
            component="main"
            sx={{
              flexGrow: 1,
              minWidth: 0,
              minHeight: "100vh",
              backgroundColor: "background.default",
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
            <GlobalTopBar />
            <Box
              sx={{
                width: "100%",
                maxWidth: "100%",
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
   ROTA EXCLUSIVA ADMIN
========================================================= */

function AdminOnly({
  children,
}: {
  children: ReactNode;
}) {
  const {
    user,
    loading,
  } =
    useAuth();

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <CircularProgress
          size={30}
          sx={{
            color: aliareColors.green,
          }}
        />

        <Typography
          variant="body2"
          color="text.secondary"
        >
          Validando acesso...
        </Typography>
      </Box>
    );
  }

  if (
    !user ||
    user.role !== "ADMIN"
  ) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return children;
}

/* =========================================================
   APP
========================================================= */

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <Login />
            }
          />

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

          {/* =================================================
              DESENVOLVIMENTO
          ================================================= */}

          <Route
            path="/correcoes"
            element={
              <AuthenticatedLayout>
                <AzureWorkItems
                  type="Correção Clientes"
                />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/evolucoes"
            element={
              <AuthenticatedLayout>
                <AzureWorkItems
                  type="Evolução"
                />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/apoios"
            element={
              <AuthenticatedLayout>
                <AzureWorkItems
                  type="APOIO"
                />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/versoes"
            element={
              <AuthenticatedLayout>
                <Versions />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/conhecimento"
            element={<AuthenticatedLayout><Knowledge /></AuthenticatedLayout>}
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
            path="/relatorios"
            element={
              <AuthenticatedLayout>
                <Reports />
              </AuthenticatedLayout>
            }
          />

          <Route
            path="/minha-operacao"
            element={<AuthenticatedLayout><MyOperation /></AuthenticatedLayout>}
          />

          <Route
            path="/qualidade-dados"
            element={<AuthenticatedLayout><DataQuality /></AuthenticatedLayout>}
          />

          {/* =================================================
              ADMINISTRAÇÃO
          ================================================= */}

          <Route
            path="/usuarios"
            element={
              <AdminOnly>
                <AuthenticatedLayout>
                  <Users />
                </AuthenticatedLayout>
              </AdminOnly>
            }
          />

          <Route
            path="/configuracoes"
            element={
              <AdminOnly>
                <AuthenticatedLayout>
                  <Settings />
                </AuthenticatedLayout>
              </AdminOnly>
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

          <Route
            path="*"
            element={
              <Navigate
                to="/"
                replace
              />
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
