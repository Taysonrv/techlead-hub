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
  useLocation,
} from "react-router-dom";

import {
  Sidebar,
} from "./components/Sidebar";
import { GlobalTopBar } from "./components/GlobalTopBar";
import { ReleaseHighlights } from "./components/ReleaseHighlights";

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
const Services = lazy(() => import("./pages/Services").then((module) => ({ default: module.Services })));
const Knowledge = lazy(() => import("./pages/Knowledge").then((module) => ({ default: module.Knowledge })));
const Chat = lazy(() => import("./pages/Chat").then((module) => ({ default: module.Chat })));
const SimerMap = lazy(() => import("./pages/SimerMap").then((module) => ({ default: module.SimerMap })));
const Investigation = lazy(() => import("./pages/Investigation").then((module) => ({ default: module.Investigation })));
const KnownProblems = lazy(() => import("./pages/KnownProblems").then((module) => ({ default: module.KnownProblems })));
const ManagementIntelligence = lazy(() => import("./pages/ManagementIntelligence").then((module) => ({ default: module.ManagementIntelligence })));
const OperationalOverview = lazy(() => import("./pages/OperationalOverview").then((module) => ({ default: module.OperationalOverview })));
const OperationsHub = lazy(() => import("./pages/OperationsHub").then((module) => ({ default: module.OperationsHub })));
const RiskPendingHub = lazy(() => import("./pages/RiskPendingHub").then((module) => ({ default: module.RiskPendingHub })));

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
   const [forbiddenMessage, setForbiddenMessage] = useState<string | null>(null);
  const location = useLocation();
  const isChat = location.pathname === "/chat";
  const isMap = location.pathname === "/mapa-simer";
  const fixedWorkspace = isChat || isMap;
  useEffect(() => {
    const routineTitles: Record<string, string> = {
      "/": "Página inicial",
      "/tickets": "Tickets",
      "/chat": "Chat",
      "/coordenacao": "Central da Coordenação",
      "/servicos": "Serviços SIMER",
      "/lideranca-tecnica": "Central de Liderança",
      "/mapa-simer": "Mapa SIMER",
      "/investigacao": "Central de Investigação",
      "/problemas-conhecidos": "Problemas Conhecidos",
      "/inteligencia": "Central de Gestão & Inteligência",
      "/gestao-inteligencia": "Central de Gestão & Inteligência",
      "/gestao-inteligencia/inteligencia": "Gestão · Inteligência",
      "/gestao-inteligencia/coordenacao": "Gestão · Coordenação",
      "/gestao-inteligencia/lideranca": "Gestão · Liderança Técnica",
      "/analistas": "Analistas",
      "/clientes": "Clientes",
      "/desempenho": "Desempenho",
      "/atencao": "Pontos de Atenção",
      "/correcoes": "Correções",
      "/evolucoes": "Evoluções",
      "/apoios": "Apoios",
      "/versoes": "Versões",
      "/conhecimento": "Base de Conhecimento",
      "/importar": "Dados e Sincronizações",
      "/relatorios": "Relatórios",
      "/minha-operacao": "Minha Operação",
      "/qualidade-dados": "Pendências",
      "/usuarios": "Usuários",
      "/configuracoes": "Configurações",
      "/sobre": "Sobre",
      "/perfil": "Perfil",
    };
    document.title = routineTitles[location.pathname] ?? "Hub Suporte Simer";
  }, [location.pathname]);
  useEffect(() => {
    const unavailable = () => {};
    const available = () => {};
    const forbidden = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setForbiddenMessage(detail?.message || "Você não possui permissão para acessar esta rotina. Procure um administrador para solicitar a liberação do acesso.");
      window.setTimeout(() => setForbiddenMessage(null), 7000);
    };
    window.addEventListener("techlead-hub:backend-unavailable", unavailable);
    window.addEventListener("techlead-hub:backend-available", available);
    window.addEventListener("techlead-hub:forbidden", forbidden);
    return () => {
      window.removeEventListener("techlead-hub:backend-unavailable", unavailable);
      window.removeEventListener("techlead-hub:backend-available", available);
      window.removeEventListener("techlead-hub:forbidden", forbidden);
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
            height: fixedWorkspace ? "100dvh" : "auto",
            overflow: fixedWorkspace ? "hidden" : "visible",
            backgroundColor: "background.default",
          }}
        >
          <Sidebar />
          <ReleaseHighlights />

          <Box
            component="main"
            sx={{
              flexGrow: 1,
              minWidth: 0,
              minHeight: fixedWorkspace ? 0 : "100vh",
              height: fixedWorkspace ? "100dvh" : "auto",
              boxSizing: "border-box",
              overflowY: fixedWorkspace ? "auto" : undefined,
              backgroundColor: "background.default",
              backgroundImage: (theme) => theme.palette.mode === "dark" ? "radial-gradient(circle at 88% 0%, rgba(84,73,255,.07), transparent 26%), linear-gradient(145deg,rgba(7,19,33,.98),rgba(9,25,43,.98))" : "none",
              color: "text.primary",
              transition: "background-color .2s ease, color .2s ease",
              overflowX: "hidden",

              px: 0,

              py: isChat ? 0 : {
                xs: 1.5,
                sm: 2,
                md: 2.5,
                lg: 3,
                xl: 3.5,
              },
            }}
          >
{!isChat && <Box sx={{ px: { xs: 1.5, sm: 2, md: 2.5, lg: 3, xl: 4 } }}><GlobalTopBar /></Box>}
            {forbiddenMessage && <Alert severity="warning" sx={{ mx: { xs: 1.5, sm: 2, md: 2.5, lg: 3, xl: 4 }, mb: 2, borderRadius: 2.5 }} onClose={() => setForbiddenMessage(null)}>{forbiddenMessage}</Alert>}
            <Box
              className="techlead-page-surface futuristic-page"
              sx={{
                width: "100%",
                maxWidth: "100%",
                px: isChat ? 0 : { xs: 1.5, sm: 2, md: 2.5, lg: 3, xl: 4 },
                pb: isChat ? 0 : { xs: 3, md: 4 },
                minHeight: isChat ? 0 : "calc(100vh - 96px)",
                height: isChat ? "100dvh" : "auto",
                overflow: isChat ? "hidden" : "visible",
                boxSizing: "border-box",
                position: "relative",
                "&::before": (theme) => ({
                  content: '""',
                  position: "fixed",
                  pointerEvents: "none",
                  inset: "96px 0 24px 0",
                  borderRadius: 28,
                  border: theme.palette.mode === "dark" ? "1px solid rgba(74,139,199,.055)" : "1px solid transparent",
                  background: theme.palette.mode === "dark" ? "linear-gradient(145deg,rgba(9,29,48,.16),rgba(10,23,43,.04))" : "transparent",
                  boxShadow: theme.palette.mode === "dark" ? "inset 0 1px rgba(255,255,255,.012)" : "none",
                }),
                "& > *": { position: "relative", zIndex: 1 },
                "& .MuiCard-root": { contain: "layout paint", minWidth: 0 },
                "& .MuiPaper-root": { minWidth: 0 },
                "& .MuiCard-root .MuiCardContent-root": { minWidth: 0 },
                "& .MuiCard-root [role='button'], & .MuiPaper-root [role='button']": { cursor: "pointer" },
                "& .MuiCard-root:has([role='button']):hover": (theme) => ({
                  borderColor: theme.palette.mode === "dark" ? "rgba(24,199,122,.28)" : "rgba(16,148,91,.18)",
                }),
                "& .MuiCardContent-root": { minWidth: 0 },
                "& .MuiCard-root + .MuiCard-root": { scrollMarginTop: 96 },
                "& .MuiButton-root": { whiteSpace: "nowrap" },
                "& .MuiButton-root .MuiButton-startIcon, & .MuiButton-root .MuiButton-endIcon": { flexShrink: 0 },
                "& .MuiIconButton-root": { flexShrink: 0 },
                "& .MuiTypography-root": { textWrap: "pretty" },
                "& h1, & h2, & h3, & h4, & h5, & h6": { textWrap: "balance" },
                "& .MuiCard-root:focus-within": (theme) => ({
                  borderColor: theme.palette.mode === "dark" ? "rgba(24,199,122,.24)" : "rgba(16,148,91,.18)",
                }),
                "& .MuiCard-root[role='button'], & .MuiCardActionArea-root": {
                  cursor: "pointer",
                },
                "& .MuiCard-root[role='button']:hover, & .MuiCard-root:has(.MuiCardActionArea-root):hover": {
                  transform: "translateY(-2px)",
                },
                "& .MuiCard-root[role='button']:active, & .MuiCardActionArea-root:active": {
                  transform: "translateY(0)",
                },
                "& .MuiTableContainer-root": { overflowX: "auto", overflowY: "visible", overscrollBehaviorX: "contain", scrollbarGutter: "stable" },
                "& .MuiTableContainer-root table": { minWidth: "max-content" },
                "& .MuiTableContainer-root .MuiTableCell-root": { maxWidth: 420 },
                "& .MuiTableContainer-root .MuiTableCell-root > .MuiTypography-root": { overflowWrap: "anywhere" },
                "& .MuiTableHead-root .MuiTableCell-root": {
                  letterSpacing: ".015em",
                  fontWeight: 800,
                },
                "& .MuiDrawer-paperAnchorRight": { contain: "paint" },
                "& .MuiAlert-root": { contain: "paint" },
                "& .recharts-wrapper, & .recharts-surface": {
                  textRendering: "geometricPrecision",
                  shapeRendering: "geometricPrecision",
                  outline: "none !important",
                },
                "& .recharts-wrapper *:focus, & .recharts-surface *:focus": { outline: "none !important" },
                "& .recharts-surface": {
                  overflow: "visible",
                },
                "& .recharts-cartesian-axis-tick-value": {
                  fill: "currentColor",
                  fontFamily: "Inter, Segoe UI, Roboto, Arial, sans-serif",
                  fontWeight: 650,
                  fontSize: "11px",
                  letterSpacing: ".005em",
                },
                "& .recharts-cartesian-grid line": (theme) => ({
                  stroke: theme.palette.mode === "dark" ? "rgba(157,176,199,.20)" : "rgba(71,85,105,.14)",
                  strokeDasharray: "3 5",
                }),
                "& .recharts-legend-item-text": (theme) => ({
                  color: `${theme.palette.text.secondary} !important`,
                  fontWeight: 700,
                  fontSize: "12px",
                }),
                "& .recharts-default-tooltip": (theme) => ({
                  background: `${theme.palette.background.paper} !important`,
                  border: `1px solid ${theme.palette.divider} !important`,
                  borderRadius: "12px !important",
                  boxShadow: theme.palette.mode === "dark" ? "0 14px 34px rgba(0,0,0,.32)" : "0 12px 30px rgba(15,23,42,.12)",
                  color: `${theme.palette.text.primary} !important`,
                  backdropFilter: "blur(14px)",
                }),
                "& .recharts-tooltip-label": {
                  fontWeight: "800 !important",
                  marginBottom: "4px !important",
                },
                "& .recharts-sector, & .recharts-rectangle, & .recharts-curve": {
                  transition: "opacity .16s ease, filter .16s ease",
                },
                "& .recharts-sector:hover, & .recharts-rectangle:hover": {
                  filter: "brightness(1.08) drop-shadow(0 5px 10px rgba(0,0,0,.16))",
                },
                "& .recharts-tooltip-wrapper": { zIndex: 4, outline: "none" },
                "& .recharts-label, & .recharts-text": { paintOrder: "stroke", strokeWidth: 0 },
                "@media (max-width: 700px)": {
                  "& .recharts-cartesian-axis-tick-value": { fontSize: "10px" },
                  "& .MuiCardContent-root": { padding: "16px" },
                  "& .MuiTableCell-root": { paddingTop: 10, paddingBottom: 10 },
                },
                "@media (prefers-reduced-motion: reduce)": {
                  "& *, & *::before, & *::after": { transitionDuration: "0.01ms !important", animationDuration: "0.01ms !important", animationIterationCount: "1 !important", scrollBehavior: "auto !important" },
                },
                "& .recharts-line-curve, & .recharts-area-curve": {
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                },
                "& .recharts-bar-rectangle path": {
                  shapeRendering: "geometricPrecision",
                },
                "& .recharts-cartesian-axis-line, & .recharts-cartesian-axis-tick-line": (theme) => ({
                  stroke: theme.palette.mode === "dark" ? "rgba(157,176,199,.24)" : "rgba(71,85,105,.18)",
                }),
                "& .recharts-reference-line line": (theme) => ({
                  strokeOpacity: theme.palette.mode === "dark" ? .65 : .5,
                }),
                "& .MuiTableRow-root": { transition: "background-color .14s ease, box-shadow .14s ease" },
                "& .MuiTableCell-root": { verticalAlign: "middle" },
                "& .MuiTableCell-head": { whiteSpace: "nowrap" },
                "& .MuiTableBody-root .MuiTableRow-root:last-of-type .MuiTableCell-root": { borderBottom: 0 },
                "& .MuiChip-root": { maxWidth: "100%" },
                "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" },
                "& .MuiStack-root": { minWidth: 0 },
                "& .MuiFormControl-root, & .MuiAutocomplete-root, & .MuiTextField-root": { maxWidth: "100%" },
                "& .MuiAlert-message": { minWidth: 0 },
                "& .MuiDrawer-paper": { scrollbarGutter: "stable" },
                "& .MuiSkeleton-root": { transform: "none" },
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

const DEFAULT_ANALYST_PERMISSIONS = ["dashboard","tickets","my-operation","known-problems","attention","data-quality","clients","simer-map","performance","reports","corrections","evolutions","support","versions","knowledge"];
function RoutineAccess({ permission, children }: { permission: string; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><CircularProgress size={30} sx={{ color: aliareColors.green }} /></Box>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "ADMIN") return children;
  const allowed = Array.isArray(user.permissions)
    ? user.permissions.includes(permission)
    : user.role === "COORDENADOR" || DEFAULT_ANALYST_PERMISSIONS.includes(permission);
  if (allowed) return children;
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3, bgcolor: "background.default" }}>
      <Box sx={{ width: "100%", maxWidth: 560 }}>
        <Alert severity="warning" variant="outlined" sx={{ borderRadius: 3, alignItems: "flex-start" }}>
          <Typography sx={{ fontWeight: 850, mb: .5 }}>Acesso não autorizado</Typography>
          <Typography variant="body2">
            Você não possui permissão para acessar esta rotina. Procure um administrador para solicitar a liberação do acesso.
          </Typography>
        </Alert>
        <Box sx={{ mt: 2 }}>
          <a href="/" style={{ color: "inherit", fontWeight: 700 }}>Voltar para o início</a>
        </Box>
      </Box>
    </Box>
  );
}

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
              <Navigate to="/visao-operacional" replace />
            }
          />

          <Route
            path="/tickets"
            element={
              <Navigate to="/operacao/tickets" replace />
            }
          />

          <Route path="/visao-operacional" element={<RoutineAccess permission="dashboard"><AuthenticatedLayout><OperationalOverview /></AuthenticatedLayout></RoutineAccess>} />
          <Route path="/visao-operacional/desempenho" element={<RoutineAccess permission="performance"><AuthenticatedLayout><OperationalOverview /></AuthenticatedLayout></RoutineAccess>} />
          <Route path="/operacao/tickets" element={<RoutineAccess permission="tickets"><AuthenticatedLayout><OperationsHub /></AuthenticatedLayout></RoutineAccess>} />
          <Route path="/operacao/minha-operacao" element={<RoutineAccess permission="my-operation"><AuthenticatedLayout><OperationsHub /></AuthenticatedLayout></RoutineAccess>} />
          <Route path="/pendencias-riscos" element={<RoutineAccess permission="attention"><AuthenticatedLayout><RiskPendingHub /></AuthenticatedLayout></RoutineAccess>} />
          <Route path="/pendencias-riscos/qualidade" element={<RoutineAccess permission="data-quality"><AuthenticatedLayout><RiskPendingHub /></AuthenticatedLayout></RoutineAccess>} />
          <Route path="/chat" element={<AuthenticatedLayout><Chat /></AuthenticatedLayout>} />
          <Route path="/coordenacao" element={<Navigate to="/gestao-inteligencia/coordenacao" replace />} />
          <Route path="/servicos" element={<RoutineAccess permission="services"><AuthenticatedLayout><Services /></AuthenticatedLayout></RoutineAccess>} />
          <Route path="/lideranca-tecnica" element={<Navigate to="/gestao-inteligencia/lideranca" replace />} />
          <Route path="/mapa-simer" element={<RoutineAccess permission="simer-map"><AuthenticatedLayout><SimerMap /></AuthenticatedLayout></RoutineAccess>} />
          <Route path="/investigacao" element={<AuthenticatedLayout><Investigation /></AuthenticatedLayout>} />
          <Route path="/problemas-conhecidos" element={<RoutineAccess permission="known-problems"><AuthenticatedLayout><KnownProblems /></AuthenticatedLayout></RoutineAccess>} />
          <Route path="/inteligencia" element={<Navigate to="/gestao-inteligencia/inteligencia" replace />} />
          <Route path="/gestao-inteligencia" element={<RoutineAccess permission="dashboard"><AuthenticatedLayout><ManagementIntelligence /></AuthenticatedLayout></RoutineAccess>} />
          <Route path="/gestao-inteligencia/inteligencia" element={<RoutineAccess permission="dashboard"><AuthenticatedLayout><ManagementIntelligence /></AuthenticatedLayout></RoutineAccess>} />
          <Route path="/gestao-inteligencia/coordenacao" element={<RoutineAccess permission="coordination"><AuthenticatedLayout><ManagementIntelligence /></AuthenticatedLayout></RoutineAccess>} />
          <Route path="/gestao-inteligencia/lideranca" element={<RoutineAccess permission="technical-leadership"><AuthenticatedLayout><ManagementIntelligence /></AuthenticatedLayout></RoutineAccess>} />

          <Route
            path="/analistas"
            element={
              <RoutineAccess permission="analysts"><AuthenticatedLayout><Analysts /></AuthenticatedLayout></RoutineAccess>
            }
          />

          <Route
            path="/clientes"
            element={
              <RoutineAccess permission="clients"><AuthenticatedLayout><Clients /></AuthenticatedLayout></RoutineAccess>
            }
          />

          <Route
            path="/desempenho"
            element={
              <Navigate to="/visao-operacional/desempenho" replace />
            }
          />

          <Route
            path="/atencao"
            element={
              <Navigate to="/pendencias-riscos" replace />
            }
          />

          {/* =================================================
              DESENVOLVIMENTO
          ================================================= */}

          <Route
            path="/correcoes"
            element={
              <RoutineAccess permission="corrections"><AuthenticatedLayout><AzureWorkItems type="Correção Clientes" /></AuthenticatedLayout></RoutineAccess>
            }
          />

          <Route
            path="/evolucoes"
            element={
              <RoutineAccess permission="evolutions"><AuthenticatedLayout><AzureWorkItems type="Evolução" /></AuthenticatedLayout></RoutineAccess>
            }
          />

          <Route
            path="/apoios"
            element={
              <RoutineAccess permission="support"><AuthenticatedLayout><AzureWorkItems type="APOIO" /></AuthenticatedLayout></RoutineAccess>
            }
          />

          <Route
            path="/versoes"
            element={
              <RoutineAccess permission="versions"><AuthenticatedLayout><Versions /></AuthenticatedLayout></RoutineAccess>
            }
          />

          <Route
            path="/conhecimento"
            element={<RoutineAccess permission="knowledge"><AuthenticatedLayout><Knowledge /></AuthenticatedLayout></RoutineAccess>}
          />

          <Route
            path="/importar"
            element={
              <RoutineAccess permission="imports"><AuthenticatedLayout><Import /></AuthenticatedLayout></RoutineAccess>
            }
          />

          <Route
            path="/relatorios"
            element={
              <RoutineAccess permission="reports"><AuthenticatedLayout><Reports /></AuthenticatedLayout></RoutineAccess>
            }
          />

          <Route
            path="/minha-operacao"
            element={<Navigate to="/operacao/minha-operacao" replace />}
          />

          <Route
            path="/qualidade-dados"
            element={<Navigate to="/pendencias-riscos/qualidade" replace />}
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
