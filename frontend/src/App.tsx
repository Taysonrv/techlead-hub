import {
  Alert,
  Box,
  CircularProgress,
  Typography,
} from "@mui/material";

import {
  lazy,
  Suspense,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";

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

const Dashboard = lazy(() => import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })));
const Tickets = lazy(() => import("./pages/Tickets").then((module) => ({ default: module.Tickets })));
const Analysts = lazy(() => import("./pages/Analysts").then((module) => ({ default: module.Analysts })));
const Clients = lazy(() => import("./pages/Clients").then((module) => ({ default: module.Clients })));
const Attention = lazy(() => import("./pages/Attention").then((module) => ({ default: module.Attention })));
const Performance = lazy(() => import("./pages/Performance").then((module) => ({ default: module.Performance })));
const Import = lazy(() => import("./pages/Import").then((module) => ({ default: module.Import })));
const About = lazy(() => import("./pages/About").then((module) => ({ default: module.About })));
const Profile = lazy(() => import("./pages/Profile").then((module) => ({ default: module.Profile })));
const Login = lazy(() => import("./pages/Login").then((module) => ({ default: module.Login })));
const Users = lazy(() => import("./pages/Users").then((module) => ({ default: module.Users })));
const AzureWorkItems = lazy(() => import("./pages/AzureWorkItems").then((module) => ({ default: module.AzureWorkItems })));
const Versions = lazy(() => import("./pages/Versions").then((module) => ({ default: module.Versions })));
const Settings = lazy(() => import("./pages/Settings").then((module) => ({ default: module.Settings })));
const Reports = lazy(() => import("./pages/Reports").then((module) => ({ default: module.Reports })));
const MyOperation = lazy(() => import("./pages/MyOperation").then((module) => ({ default: module.MyOperation })));
const DataQuality = lazy(() => import("./pages/DataQuality").then((module) => ({ default: module.DataQuality })));
const Knowledge = lazy(() => import("./pages/Knowledge").then((module) => ({ default: module.Knowledge })));
const Chat = lazy(() => import("./pages/Chat").then((module) => ({ default: module.Chat })));
const Coordination = lazy(() => import("./pages/Coordination").then((module) => ({ default: module.Coordination })));
const TechnicalLeadership = lazy(() => import("./pages/TechnicalLeadership").then((module) => ({ default: module.TechnicalLeadership })));

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
  const [backendUnavailable, setBackendUnavailable] = useState(false);
  useEffect(() => {
    const unavailable = () => setBackendUnavailable(true);
    const available = () => setBackendUnavailable(false);
    window.addEventListener("techlead-hub:backend-unavailable", unavailable);
    window.addEventListener("techlead-hub:backend-available", available);
    return () => {
      window.removeEventListener("techlead-hub:backend-unavailable", unavailable);
      window.removeEventListener("techlead-hub:backend-available", available);
    };
  }, []);
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
              backgroundImage: (theme) => theme.palette.mode === "dark" ? "radial-gradient(circle at 88% 0%, rgba(84,73,255,.07), transparent 26%), linear-gradient(145deg,rgba(7,19,33,.98),rgba(9,25,43,.98))" : "none",
              color: "text.primary",
              transition: "background-color .2s ease, color .2s ease",
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
            {backendUnavailable && <Alert severity="warning" sx={{ mb: 2 }}>O servidor central está temporariamente indisponível. Verifique a conexão e tente novamente; seus dados locais de navegação foram preservados.</Alert>}
            <Box
              className="techlead-page-surface futuristic-page"
              sx={{
                width: "100%",
                maxWidth: "100%",
                minHeight: "calc(100vh - 96px)",
                position: "relative",
                "&::before": (theme) => ({
                  content: '""',
                  position: "fixed",
                  pointerEvents: "none",
                  inset: "96px 24px 24px 284px",
                  borderRadius: 28,
                  border: theme.palette.mode === "dark" ? "1px solid rgba(74,139,199,.055)" : "1px solid transparent",
                  background: theme.palette.mode === "dark" ? "linear-gradient(145deg,rgba(9,29,48,.16),rgba(10,23,43,.04))" : "transparent",
                  boxShadow: theme.palette.mode === "dark" ? "inset 0 1px rgba(255,255,255,.012)" : "none",
                }),
                "& > *": { position: "relative", zIndex: 1 },
                "& .MuiCard-root": { backdropFilter: "blur(14px)" },
                "& .MuiTableContainer-root": { overflow: "hidden" },
                "& .MuiTableHead-root .MuiTableCell-root": {
                  letterSpacing: ".015em",
                  fontWeight: 800,
                },
                "& .MuiDrawer-paperAnchorRight": {
                  backdropFilter: "blur(18px)",
                },
                "& .MuiInputBase-root, & .MuiButton-root, & .MuiChip-root": {
                  transition: "border-color .16s ease, background-color .16s ease, box-shadow .16s ease, transform .16s ease",
                },
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
        <Suspense fallback={<Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><CircularProgress size={32} /></Box>}>
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

          <Route path="/chat" element={<AuthenticatedLayout><Chat /></AuthenticatedLayout>} />
          <Route path="/coordenacao" element={<AuthenticatedLayout><Coordination /></AuthenticatedLayout>} />
          <Route path="/lideranca-tecnica" element={<AuthenticatedLayout><TechnicalLeadership /></AuthenticatedLayout>} />

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
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
