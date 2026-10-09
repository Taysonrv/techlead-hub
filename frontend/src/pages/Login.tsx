import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  ArrowBackOutlined,
  CheckCircleOutlined,
  EmailOutlined,
  LockOutlined,
  PersonAddOutlined,
  PersonOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
  AutoGraphOutlined,
} from "@mui/icons-material";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

import axios from "axios";

import {
  useAuth,
} from "../context/AuthContext";

import {
  api,
} from "../services/api";

import {
  aliareColors,
} from "../theme/theme";
import { useColorMode } from "../context/ColorModeContext";

/* =========================================================
   TIPOS
========================================================= */

type LocationState = {
  from?: string;
};

type ScreenMode =
  | "LOGIN"
  | "REGISTER"
  | "REGISTER_SUCCESS"
  | "FORGOT_PASSWORD"
  | "RESET_PASSWORD";

const workMessages = [
  { category: "Suporte", title: "Cada atendimento bem investigado reduz o próximo incidente.", description: "Registre contexto, evidências e solução. Uma boa análise resolve o caso atual e fortalece toda a operação." },
  { category: "ERP", title: "No ERP, entender o processo vem antes de alterar o dado.", description: "Siga o fluxo de negócio, valide configurações e relações entre módulos antes de concluir a causa de uma inconsistência." },
  { category: "Agronegócio", title: "Tecnologia no agro conecta o campo à decisão.", description: "Da entrada de insumos à comercialização de grãos, dados confiáveis sustentam uma operação cada vez mais integrada." },
  { category: "Cooperativismo", title: "Cooperativas transformam escala em força coletiva.", description: "Processos bem estruturados ajudam unidades, associados e equipes a trabalharem com informação consistente em toda a cadeia." },
  { category: "Análise de Sistemas", title: "Investigue o comportamento, não apenas a mensagem de erro.", description: "Logs, banco de dados, integrações e regras de negócio contam partes diferentes da mesma história." },
  { category: "Trabalho", title: "Consistência supera pressa quando o problema é complexo.", description: "Organize as evidências, teste hipóteses e avance com método. Velocidade sustentável nasce de um processo confiável." },
  { category: "Suporte N3", title: "Um bom diagnóstico separa sintoma, causa e impacto.", description: "Reproduza o cenário, delimite a origem e entregue ao próximo nível informações suficientes para agir sem retrabalho." },
  { category: "Conhecimento", title: "Conhecimento compartilhado reduz dependências.", description: "Documentar uma solução transforma experiência individual em capacidade disponível para todo o time." },
  { category: "ERP", title: "Uma rotina raramente termina no módulo em que começou.", description: "Financeiro, fiscal, estoque, contratos e faturamento se conectam. Analise também os efeitos antes e depois da operação." },
  { category: "Agronegócio", title: "Safra, armazenagem e comercialização exigem informação no tempo certo.", description: "No agro, qualidade de dados e continuidade operacional ajudam a transformar eventos do campo em decisões de negócio." },
  { category: "Qualidade", title: "Correção duradoura começa com uma causa bem definida.", description: "Quando possível, diferencie configuração, operação, integração, dado e defeito de produto antes de escolher o tratamento." },
  { category: "Cooperativismo", title: "Cada unidade faz parte de uma operação maior.", description: "Padronização e rastreabilidade permitem que a cooperativa cresça sem perder controle sobre processos, dados e atendimento." },
  { category: "Desenvolvimento", title: "Código resolve melhor quando chega acompanhado de contexto.", description: "Cenário reproduzível, resultado esperado, evidência e impacto tornam a comunicação entre suporte e desenvolvimento mais eficiente." },
  { category: "Foco", title: "Problemas grandes ficam menores quando quebrados em evidências.", description: "Comece pelo que é observável, elimine hipóteses e mantenha o histórico da investigação organizado." },
  { category: "Dados", title: "Indicadores são pontos de partida para perguntas melhores.", description: "Use métricas para localizar padrões, depois volte ao processo e aos dados para compreender o que realmente está acontecendo." },
  { category: "Atendimento", title: "Clareza técnica também faz parte da experiência do cliente.", description: "Explique o que foi validado, o próximo passo e as limitações conhecidas sem transferir a complexidade interna para quem precisa da solução." },
  { category: "Evolução", title: "Melhorar um processo é remover atrito de forma repetível.", description: "Automatize o que é recorrente, documente o que é crítico e preserve espaço para análise onde julgamento técnico é necessário." },
  { category: "Integrações", title: "Entre dois sistemas, o contrato de dados é tão importante quanto o código.", description: "Valide origem, formato, identificadores, estados e retentativas antes de atribuir uma falha a apenas um dos lados." },
  { category: "Equipe", title: "Pedir contexto cedo pode economizar horas de investigação.", description: "Compartilhe o que já foi testado e envolva as pessoas certas quando o problema atravessar domínio, produto ou integração." },
  { category: "Operação", title: "Estabilidade é construída antes do incidente.", description: "Monitoramento, histórico e processos de contingência tornam o suporte mais previsível quando a operação é pressionada." },
  { category: "Aprendizado", title: "Cada caso difícil amplia o repertório do próximo diagnóstico.", description: "Revise o que funcionou, o que confundiu a investigação e quais sinais poderiam ter antecipado a solução." },
  { category: "Agronegócio", title: "Do recebimento de grãos ao financeiro, rastreabilidade importa.", description: "Uma cadeia integrada depende de cadastros, documentos e movimentos coerentes para manter confiança no resultado final." },
  { category: "Analista", title: "Ferramentas aceleram; raciocínio técnico direciona.", description: "SQL, logs, APIs e dashboards entregam sinais. O valor do analista está em conectá-los ao processo e testar a hipótese correta." },
  { category: "Trabalho", title: "Priorizar é escolher conscientemente onde colocar atenção.", description: "Impacto, urgência, dependências e prazo ajudam a ordenar a fila sem perder de vista a qualidade da entrega." },
] as const;

/* =========================================================
   COMPONENT
========================================================= */

export function Login() {
  const {
    login,
    register,
    authenticated,
    loading:
      authLoading,
  } =
    useAuth();

  const navigate =
    useNavigate();

  const location =
    useLocation();

  const { mode: colorMode } = useColorMode();
  const [workMessage, setLeadershipMessage] = useState(0);

  const [
    mode,
    setMode,
  ] =
    useState<ScreenMode>(
      "LOGIN"
    );

  /* =======================================================
     LOGIN
  ======================================================= */

  const [
    username,
    setUsername,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    recoveryEmail,
    setRecoveryEmail,
  ] =
    useState("");

  const [
    resetPassword,
    setResetPassword,
  ] =
    useState("");

  const [
    resetConfirmPassword,
    setResetConfirmPassword,
  ] =
    useState("");

  const [
    recoverySuccess,
    setRecoverySuccess,
  ] =
    useState<string | null>(
      null
    );

  /* =======================================================
     RECUPERAÇÃO DE SENHA
  ======================================================= */

  async function handleForgotPassword(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const email =
      recoveryEmail
        .trim();

    if (!email) {
      setError(
        "Informe o e-mail corporativo."
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setRecoverySuccess(null);

    try {
      const response =
        await api.post<{
          message: string;
        }>(
          "/auth/forgot-password",
          {
            email,
          }
        );

      setRecoverySuccess(
        response.data.message
      );
    } catch (
      requestError
    ) {
      setError(
        getErrorMessage(
          requestError,
          "Não foi possível solicitar a recuperação da senha."
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!resetToken) {
      setError(
        "O link de recuperação é inválido."
      );
      return;
    }

    if (
      resetPassword.length <
      10
    ) {
      setError(
        "A nova senha deve possuir pelo menos 10 caracteres."
      );
      return;
    }

    if (
      resetPassword !==
      resetConfirmPassword
    ) {
      setError(
        "A confirmação da senha não confere."
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response =
        await api.post<{
          message: string;
        }>(
          "/auth/reset-password",
          {
            token:
              resetToken,
            newPassword:
              resetPassword,
            confirmPassword:
              resetConfirmPassword,
          }
        );

      setRecoverySuccess(
        response.data.message
      );
      setResetPassword(
        ""
      );
      setResetConfirmPassword(
        ""
      );
    } catch (
      requestError
    ) {
      setError(
        getErrorMessage(
          requestError,
          "Não foi possível redefinir a senha."
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* =======================================================
     CADASTRO
  ======================================================= */

  const [
    registerName,
    setRegisterName,
  ] =
    useState("");

  const [
    registerUsername,
    setRegisterUsername,
  ] =
    useState("");

  const [
    registerEmail,
    setRegisterEmail,
  ] =
    useState("");

  const [
    registerPassword,
    setRegisterPassword,
  ] =
    useState("");

  const [
    registerConfirmPassword,
    setRegisterConfirmPassword,
  ] =
    useState("");

  /* =======================================================
     UI
  ======================================================= */

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] =
    useState(false);

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );
  const [sessionConflict, setSessionConflict] = useState(false);

  /* =======================================================
     REDIRECIONAMENTO
  ======================================================= */

  const state =
    location.state as
      | LocationState
      | null;

  const redirectTo =
    state?.from &&
    state.from !==
      "/login"
      ? state.from
      : "/";

  const resetToken =
    new URLSearchParams(
      location.search
    ).get(
      "resetToken"
    ) ?? "";

  useEffect(
    () => {
      if (resetToken) {
        setMode(
          "RESET_PASSWORD"
        );
      }
    },
    [
      resetToken,
    ]
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLeadershipMessage((current) => (current + 1) % workMessages.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, []);

  /* =======================================================
     LIMPAR ERRO
  ======================================================= */

  useEffect(() => {
    setError(null);
  }, [
    mode,
    username,
    password,
    registerName,
    registerUsername,
    registerEmail,
    registerPassword,
    registerConfirmPassword,
  ]);

  /* =======================================================
     LOGIN
  ======================================================= */

  async function handleLogin(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const normalizedUsername =
      username.trim();

    if (!normalizedUsername) {
      setError(
        "Informe o usuário ou e-mail."
      );

      return;
    }

    if (!password) {
      setError(
        "Informe a senha."
      );

      return;
    }

    setSubmitting(true);
    setError(null);
    setSessionConflict(false);

    try {
      await login({
        username:
          normalizedUsername,

        password,
      });

      navigate(
        redirectTo,
        {
          replace: true,
        }
      );
    } catch (
      requestError
    ) {
      setSessionConflict(
        axios.isAxiosError(requestError) &&
        requestError.response?.data?.code === "SESSION_CONFLICT"
      );
      setError(
        getErrorMessage(
          requestError,
          "Não foi possível realizar o login."
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSessionTransfer() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login({ username: username.trim(), password, forceTransfer: true });
      navigate(redirectTo, { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Não foi possível transferir a sessão."));
    } finally {
      setSubmitting(false);
    }
  }

  /* =======================================================
     CADASTRO
  ======================================================= */

  async function handleRegister(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const name =
      registerName
        .trim();

    const username =
      registerUsername
        .trim();

    const email =
      registerEmail
        .trim();

    if (!name) {
      setError(
        "Informe seu nome completo."
      );

      return;
    }

    if (!username) {
      setError(
        "Informe o usuário."
      );

      return;
    }

    if (!email) {
      setError(
        "Informe o e-mail corporativo."
      );

      return;
    }

    if (
      registerPassword.length <
      10
    ) {
      setError(
        "A senha deve possuir pelo menos 10 caracteres."
      );

      return;
    }

    if (
      registerPassword !==
      registerConfirmPassword
    ) {
      setError(
        "A confirmação da senha não confere."
      );

      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await register({
        name,
        username,
        email,
        password:
          registerPassword,
        confirmPassword:
          registerConfirmPassword,
      });

      setMode(
        "REGISTER_SUCCESS"
      );
    } catch (
      requestError
    ) {
      setError(
        getErrorMessage(
          requestError,
          "Não foi possível realizar o cadastro."
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* =======================================================
     SESSÃO JÁ EXISTENTE
  ======================================================= */

  if (
    !authLoading &&
    authenticated
  ) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  /* =======================================================
     RESTAURAÇÃO
  ======================================================= */

  if (authLoading) {
    return (
      <Box
        sx={{
          minHeight:
            "100dvh",

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          backgroundColor:
            "background.default",
        }}
      >
        <CircularProgress
          size={32}
          sx={{
            color:
              aliareColors.green,
          }}
        />
      </Box>
    );
  }

  /* =======================================================
     TELA
  ======================================================= */

  return (
    <Box
      sx={{
        minHeight:
          "100dvh",

        display:
          "flex",

        position: "relative",
        overflow: "hidden",
        background:
          colorMode === "dark"
            ? "radial-gradient(circle at 12% 18%, rgba(24,199,122,.11), transparent 30%), radial-gradient(circle at 84% 22%, rgba(39,139,199,.10), transparent 32%), linear-gradient(135deg,#06110E 0%,#071823 48%,#061522 100%)"
            : "radial-gradient(circle at 12% 18%, rgba(24,199,122,.10), transparent 30%), radial-gradient(circle at 84% 22%, rgba(39,139,199,.08), transparent 32%), linear-gradient(135deg,#F3F8F5 0%,#F5F9FB 52%,#F2F7F6 100%)",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: colorMode === "dark"
            ? "linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)"
            : "linear-gradient(rgba(7,31,43,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(7,31,43,.025) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,.55), transparent 85%)",
        },
      }}
    >
      {/* ===================================================
          PAINEL INSTITUCIONAL
      =================================================== */}

      <Box
        sx={{
          display: {
            xs: "none",
            md: "flex",
          },

          width: {
            md: "48%",
            lg: "50%",
          },

          minHeight:
            "100dvh",

          flexDirection:
            "column",

          justifyContent:
            "space-between",

          position:
            "relative",

          overflow:
            "hidden",

          p: {
            md: 5,
            lg: 7,
          },

          background:
            "transparent",

          color:
            colorMode === "dark" ? "#FFFFFF" : "#10211B",

          "&::after": {
            content:
              '""',

            position:
              "absolute",

            right:
              -110,

            bottom:
              -110,

            width:
              360,

            height:
              360,

            borderRadius:
              "36% 64% 58% 42% / 48% 45% 55% 52%",

            border:
              colorMode === "dark" ? "1px solid rgba(24,199,122,0.18)" : "1px solid rgba(24,199,122,0.12)",

            transform:
              "rotate(-16deg)",
          },

          "&::before": {
            content:
              '""',

            position:
              "absolute",

            right:
              -44,

            bottom:
              -52,

            width:
              180,

            height:
              180,

            borderRadius:
              "50%",

            backgroundColor:
              colorMode === "dark" ? "rgba(24,199,122,0.055)" : "rgba(24,199,122,0.035)",
          },
        }}
      >
        <Box
          sx={{
            position:
              "relative",

            zIndex:
              1,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems:
                "center",
            }}
          >
            <Box
              sx={{
                width: 11,
                height: 11,

                borderRadius:
                  "2px",

                backgroundColor:
                  aliareColors.green,

                transform:
                  "rotate(-6deg)",
              }}
            />

            <Typography
              sx={{
                fontSize:
                  "0.78rem",

                fontWeight:
                  800,

                letterSpacing:
                  "0.14em",

                textTransform:
                  "uppercase",

                color:
                  colorMode === "dark" ? "rgba(255,255,255,0.72)" : "rgba(16,33,27,.62)",
              }}
            >
              aliare
            </Typography>
          </Stack>

          <Typography
            sx={{
              mt: 2.2,

              fontSize: {
                md: "2.15rem",
                lg: "2.65rem",
              },

              lineHeight:
                1.08,

              fontWeight:
                760,

              letterSpacing:
                "-0.04em",
            }}
          >
            Hub Suporte Simer
          </Typography>

          <Typography
            sx={{
              mt: 0.9,

              fontSize:
                "0.95rem",

              color:
                colorMode === "dark" ? "rgba(255,255,255,0.56)" : "rgba(16,33,27,.58)",
            }}
          >
            Inteligência para Suporte SIMER
          </Typography>
        </Box>

        <Box
          sx={{
            position:
              "relative",

            zIndex:
              1,

            maxWidth:
              450,
          }}
        >
          <Box
            sx={{
              width: 38,
              height: 3,

              borderRadius:
                99,

              backgroundColor:
                aliareColors.green,

              mb: 2.2,
            }}
          />

          <Box key={workMessage} sx={{ minHeight: 190, p: 2.25, borderRadius: 3, border: "1px solid", borderColor: colorMode === "dark" ? "rgba(255,255,255,.08)" : "rgba(16,33,27,.09)", background: colorMode === "dark" ? "linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.015))" : "linear-gradient(135deg,rgba(255,255,255,.70),rgba(255,255,255,.42))", backdropFilter: "blur(10px)", boxShadow: "0 18px 50px rgba(0,0,0,.16)", animation: "workMessageIn .55s ease both", "@keyframes workMessageIn": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.2 }}>
              <AutoGraphOutlined sx={{ color: aliareColors.green, fontSize: 19 }} />
              <Typography variant="caption" sx={{ color: aliareColors.green, fontWeight: 700, letterSpacing: ".085em", textTransform: "uppercase" }}>
                {workMessages[workMessage].category}
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: { md: "1.4rem", lg: "1.65rem" }, lineHeight: 1.35, fontWeight: 650, letterSpacing: "-0.022em" }}>
              {workMessages[workMessage].title}
            </Typography>
            <Typography sx={{ mt: 1.4, maxWidth: 430, lineHeight: 1.7, color: colorMode === "dark" ? "rgba(255,255,255,0.58)" : "rgba(16,33,27,.62)" }}>
              {workMessages[workMessage].description}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.2} sx={{ mt: 1.5, alignItems: "center" }}>
            <Box sx={{ width: 72, height: 3, borderRadius: 99, overflow: "hidden", bgcolor: colorMode === "dark" ? "rgba(255,255,255,.12)" : "rgba(16,33,27,.10)" }}>
              <Box sx={{ height: "100%", width: `${((workMessage + 1) / workMessages.length) * 100}%`, bgcolor: aliareColors.green, borderRadius: 99, transition: "width .35s ease" }} />
            </Box>
            <Typography variant="caption" sx={{ color: colorMode === "dark" ? "rgba(255,255,255,.42)" : "rgba(16,33,27,.46)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {String(workMessage + 1).padStart(2, "0")} / {String(workMessages.length).padStart(2, "0")}
            </Typography>
          </Stack>


        </Box>

        <Box
          sx={{
            position:
              "relative",

            zIndex:
              1,
          }}
        >
          <Divider
            sx={{
              mb: 1.75,

              borderColor:
                colorMode === "dark" ? "rgba(255,255,255,0.09)" : "rgba(16,33,27,.10)",
            }}
          />

          <Typography
            variant="caption"
            sx={{
              color:
                colorMode === "dark" ? "rgba(255,255,255,0.38)" : "rgba(16,33,27,.45)",
            }}
          >
            Aliare · Suporte e Sustentação · SIMER
          </Typography>
        </Box>
      </Box>

      {/* ===================================================
          CONTEÚDO
      =================================================== */}

      <Box
        sx={{
          flex: 1,

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          px: {
            xs: 2,
            sm: 4,
            md: 6,
            lg: 8,
          },

          py: 4,
          position: "relative",
          zIndex: 1,
        }}
      >
        <Box
          sx={{
            width:
              "100%",

            maxWidth:
              mode ===
              "REGISTER"
                ? 520
                : 448,
          }}
        >
          {/* MOBILE */}

          <Box
            sx={{
              display: {
                xs: "block",
                md: "none",
              },

              mb: 3,
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontWeight:
                  760,
                letterSpacing:
                  "-.025em",
              }}
            >
              Hub Suporte Simer
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
            >
              Inteligência para Suporte SIMER
            </Typography>
          </Box>

          <Card
            elevation={0}
            sx={{
              border:
                "1px solid",

              borderRadius:
                3.5,

              overflow:
                "hidden",

              boxShadow: colorMode === "dark" ? "0 30px 90px rgba(0,0,0,.30)" : "0 24px 70px rgba(16,24,40,.10)",
              backdropFilter: "blur(24px)",
              borderColor: colorMode === "dark" ? "rgba(92,164,188,.20)" : "rgba(16,72,82,.12)",
              background: colorMode === "dark" ? "linear-gradient(145deg,rgba(11,35,52,.82),rgba(8,28,42,.72))" : "rgba(255,255,255,.68)",
            }}
          >
            <Box
              sx={{
                height: 3,

                background:
                  "linear-gradient(90deg, transparent 0%, #18C77A 28%, #4CE6A7 70%, transparent 100%)",
              }}
            />

            <CardContent
              sx={{
                p: {
                  xs: 3,
                  sm: 4,
                },

                "&:last-child": {
                  pb: {
                    xs: 3,
                    sm: 4,
                  },
                },
              }}
            >
              {mode ===
                "LOGIN" && (
                <LoginForm
                  username={
                    username
                  }
                  setUsername={
                    setUsername
                  }
                  password={
                    password
                  }
                  setPassword={
                    setPassword
                  }
                  showPassword={
                    showPassword
                  }
                  setShowPassword={
                    setShowPassword
                  }
                  submitting={
                    submitting
                  }
                  error={error}
                  sessionConflict={sessionConflict}
                  onSessionTransfer={() => void handleSessionTransfer()}
                  onSubmit={
                    handleLogin
                  }
                  onRegister={() =>
                    setMode(
                      "REGISTER"
                    )
                  }
                  colorMode={colorMode}
                  onForgotPassword={() => {
                    setRecoveryEmail(
                      username.includes("@")
                        ? username
                        : ""
                    );
                    setRecoverySuccess(
                      null
                    );
                    setMode(
                      "FORGOT_PASSWORD"
                    );
                  }}
                />
              )}

              {mode ===
                "REGISTER" && (
                <RegisterForm
                  name={
                    registerName
                  }
                  setName={
                    setRegisterName
                  }
                  username={
                    registerUsername
                  }
                  setUsername={
                    setRegisterUsername
                  }
                  email={
                    registerEmail
                  }
                  setEmail={
                    setRegisterEmail
                  }
                  password={
                    registerPassword
                  }
                  setPassword={
                    setRegisterPassword
                  }
                  confirmPassword={
                    registerConfirmPassword
                  }
                  setConfirmPassword={
                    setRegisterConfirmPassword
                  }
                  showPassword={
                    showPassword
                  }
                  setShowPassword={
                    setShowPassword
                  }
                  showConfirmPassword={
                    showConfirmPassword
                  }
                  setShowConfirmPassword={
                    setShowConfirmPassword
                  }
                  submitting={
                    submitting
                  }
                  error={error}
                  onSubmit={
                    handleRegister
                  }
                  onBack={() =>
                    setMode(
                      "LOGIN"
                    )
                  }
                />
              )}

              {mode ===
                "RESET_PASSWORD" && (
                <ResetPasswordForm
                  password={
                    resetPassword
                  }
                  setPassword={
                    setResetPassword
                  }
                  confirmPassword={
                    resetConfirmPassword
                  }
                  setConfirmPassword={
                    setResetConfirmPassword
                  }
                  showPassword={
                    showPassword
                  }
                  setShowPassword={
                    setShowPassword
                  }
                  submitting={
                    submitting
                  }
                  error={error}
                  success={
                    recoverySuccess
                  }
                  onSubmit={
                    handleResetPassword
                  }
                  onBack={() => {
                    navigate(
                      "/login",
                      {
                        replace:
                          true,
                      }
                    );
                    setRecoverySuccess(
                      null
                    );
                    setMode(
                      "LOGIN"
                    );
                  }}
                />
              )}

              {mode ===
                "FORGOT_PASSWORD" && (
                <ForgotPasswordForm
                  email={
                    recoveryEmail
                  }
                  setEmail={
                    setRecoveryEmail
                  }
                  submitting={
                    submitting
                  }
                  error={error}
                  success={
                    recoverySuccess
                  }
                  onSubmit={
                    handleForgotPassword
                  }
                  onBack={() =>
                    setMode(
                      "LOGIN"
                    )
                  }
                />
              )}

              {mode ===
                "REGISTER_SUCCESS" && (
                <RegisterSuccess
                  onBack={() => {
                    setMode(
                      "LOGIN"
                    );

                    setUsername(
                      registerUsername
                    );

                    setPassword(
                      ""
                    );
                  }}
                />
              )}
            </CardContent>
          </Card>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display:
                "block",

              mt: 2,

              px: 1,

              textAlign:
                "center",

              lineHeight:
                1.5,
            }}
          >
            Acesso corporativo protegido · Utilize somente credenciais autorizadas.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

/* =========================================================
   LOGIN FORM
========================================================= */

function LoginForm({
  username,
  setUsername,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  submitting,
  error,
  sessionConflict,
  onSessionTransfer,
  onSubmit,
  onRegister,
  onForgotPassword,
  colorMode,
}: {
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  submitting: boolean;
  error: string | null;
  sessionConflict: boolean;
  onSessionTransfer: () => void;
  onSubmit: (
    event:
      FormEvent<HTMLFormElement>
  ) => void;
  onRegister: () => void;
  onForgotPassword: () => void;
  colorMode: "light" | "dark";
}) {
  return (
    <>
      <Typography
        variant="h5"
        sx={{
          fontWeight:
            760,

          letterSpacing:
            "-0.03em",
        }}
      >
        Bem-vindo
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          mt: 0.7,
          mb: 3.25,

          lineHeight:
            1.65,
        }}
      >
        Entre com suas credenciais para acessar
        o Hub Suporte Simer.
      </Typography>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 2.5,
            borderRadius: 1.5,
          }}
        >
          {error}
        </Alert>
      )}

      {sessionConflict && (
        <Button fullWidth variant="outlined" color="warning" disabled={submitting} onClick={onSessionTransfer} sx={{ mb: 2 }}>
          Encerrar a outra sessão e continuar
        </Button>
      )}

      <Box
        component="form"
        onSubmit={onSubmit}
        noValidate
      >
        <TextField
          label="Usuário ou e-mail"
          value={username}
          onChange={(
            event
          ) =>
            setUsername(
              event.target.value
            )
          }
          autoComplete="username"
          autoFocus
          fullWidth
          disabled={
            submitting
          }
          sx={{
            "& .MuiOutlinedInput-root": { minHeight: 52, borderRadius: 2, backgroundColor: colorMode === "dark" ? "#081A2B" : "rgba(248,250,249,.88)", transition: "box-shadow .18s ease, background-color .18s ease", "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(24,199,122,.10)" } },
            "& .MuiInputBase-input": { backgroundColor: "transparent !important", color: "text.primary", WebkitTextFillColor: "currentColor" },
            "& input:-webkit-autofill": { WebkitBoxShadow: colorMode === "dark" ? "0 0 0 1000px #081A2B inset" : undefined, WebkitTextFillColor: colorMode === "dark" ? "#E8F1FF" : undefined, caretColor: colorMode === "dark" ? "#E8F1FF" : undefined },
          }}
          slotProps={{
            input: {
              startAdornment:
                (
                  <InputAdornment position="start">
                    <PersonOutlined
                      sx={{
                        fontSize:
                          19,

                        color:
                          "text.secondary",
                      }}
                    />
                  </InputAdornment>
                ),
            },
          }}
        />

        <PasswordField
          label="Senha"
          value={password}
          setValue={
            setPassword
          }
          visible={
            showPassword
          }
          setVisible={
            setShowPassword
          }
          disabled={
            submitting
          }
          autoComplete="current-password"
          sx={{
            mt: 2,
            "& .MuiOutlinedInput-root": { backgroundColor: colorMode === "dark" ? "#081A2B" : "background.paper" },
            "& .MuiInputBase-input": { backgroundColor: "transparent !important", color: "text.primary", WebkitTextFillColor: "currentColor" },
            "& input:-webkit-autofill": { WebkitBoxShadow: colorMode === "dark" ? "0 0 0 1000px #081A2B inset" : undefined, WebkitTextFillColor: colorMode === "dark" ? "#E8F1FF" : undefined, caretColor: colorMode === "dark" ? "#E8F1FF" : undefined },
          }}
        />

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mt: 0.75,
            mb: 0.5,
          }}
        >
          <Button
            type="button"
            variant="text"
            size="small"
            disabled={
              submitting
            }
            onClick={
              onForgotPassword
            }
            sx={{
              color:
                aliareColors.greenDark,
              fontWeight: 700,
            }}
          >
            Esqueceu a senha?
          </Button>
        </Box>

        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={
            submitting
          }
          sx={primaryButtonSx}
        >
          {submitting ? (
            <CircularProgress
              size={21}
              color="inherit"
            />
          ) : (
            "Entrar"
          )}
        </Button>
      </Box>

      <Divider
        sx={{
          my: 2.75,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
        >
          ou
        </Typography>
      </Divider>

      <Button
        variant="outlined"
        fullWidth
        startIcon={
          <PersonAddOutlined />
        }
        onClick={
          onRegister
        }
        disabled={
          submitting
        }
        sx={{
          minHeight: 48,
          borderRadius: 2,

          borderColor:
            "divider",

          color:
            "text.primary",

          fontWeight: 700,

          "&:hover": {
            borderColor:
              aliareColors.green,

            backgroundColor:
              "rgba(24,199,122,0.04)",
          },
        }}
      >
        Criar conta
      </Button>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display:
            "block",

          mt: 2,

          textAlign:
            "center",
        }}
      >
        Novos acessos precisam ser aprovados por um administrador.
      </Typography>
    </>
  );
}

/* =========================================================
   REDEFINIÇÃO DE SENHA
========================================================= */

function ResetPasswordForm({
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  showPassword,
  setShowPassword,
  submitting,
  error,
  success,
  onSubmit,
  onBack,
}: {
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  submitting: boolean;
  error: string | null;
  success: string | null;
  onSubmit: (
    event:
      FormEvent<HTMLFormElement>
  ) => void;
  onBack: () => void;
}) {
  return (
    <>
      <Typography
        variant="h5"
        sx={{
          fontWeight: 800,
        }}
      >
        Criar nova senha
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          mt: 0.75,
          mb: 3,
        }}
      >
        Defina uma senha com pelo menos 10 caracteres.
      </Typography>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 2,
          }}
        >
          {error}
        </Alert>
      )}

      {success ? (
        <Stack
          spacing={2}
        >
          <Alert severity="success">
            {success}
          </Alert>

          <Button
            variant="contained"
            onClick={onBack}
            sx={primaryButtonSx}
          >
            Voltar ao login
          </Button>
        </Stack>
      ) : (
        <Box
          component="form"
          onSubmit={onSubmit}
        >
          <PasswordField
            label="Nova senha"
            value={password}
            setValue={
              setPassword
            }
            visible={
              showPassword
            }
            setVisible={
              setShowPassword
            }
            disabled={
              submitting
            }
            autoComplete="new-password"
          />

          <PasswordField
            label="Confirmar nova senha"
            value={
              confirmPassword
            }
            setValue={
              setConfirmPassword
            }
            visible={
              showPassword
            }
            setVisible={
              setShowPassword
            }
            disabled={
              submitting
            }
            autoComplete="new-password"
            sx={{
              mt: 2,
            }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={
              submitting
            }
            sx={{
              ...primaryButtonSx,
              mt: 2,
            }}
          >
            {submitting
              ? (
                <CircularProgress
                  size={21}
                  color="inherit"
                />
              )
              : "Redefinir senha"}
          </Button>
        </Box>
      )}
    </>
  );
}

/* =========================================================
   RECUPERAÇÃO DE SENHA
========================================================= */

function ForgotPasswordForm({
  email,
  setEmail,
  submitting,
  error,
  success,
  onSubmit,
  onBack,
}: {
  email: string;
  setEmail: (value: string) => void;
  submitting: boolean;
  error: string | null;
  success: string | null;
  onSubmit: (
    event:
      FormEvent<HTMLFormElement>
  ) => void;
  onBack: () => void;
}) {
  return (
    <>
      <Button
        startIcon={
          <ArrowBackOutlined />
        }
        onClick={onBack}
        disabled={
          submitting
        }
        sx={{
          mb: 2,
          color:
            "text.secondary",
        }}
      >
        Voltar ao login
      </Button>

      <Typography
        variant="h5"
        sx={{
          fontWeight: 800,
        }}
      >
        Recuperar senha
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          mt: 0.75,
          mb: 3,
          lineHeight: 1.65,
        }}
      >
        Informe o e-mail da conta. Se ela estiver ativa,
        você receberá as instruções para criar uma nova senha.
      </Typography>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 2,
          }}
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          severity="success"
          sx={{
            mb: 2,
          }}
        >
          {success}
        </Alert>
      )}

      <Box
        component="form"
        onSubmit={onSubmit}
      >
        <TextField
          label="E-mail corporativo"
          type="email"
          value={email}
          onChange={(event) =>
            setEmail(
              event.target.value
            )
          }
          autoComplete="email"
          autoFocus
          fullWidth
          disabled={
            submitting ||
            Boolean(success)
          }
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <EmailOutlined />
                </InputAdornment>
              ),
            },
          }}
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={
            submitting ||
            Boolean(success)
          }
          sx={{
            ...primaryButtonSx,
            mt: 2,
          }}
        >
          {submitting ? (
            <CircularProgress
              size={21}
              color="inherit"
            />
          ) : (
            "Enviar instruções"
          )}
        </Button>
      </Box>
    </>
  );
}

/* =========================================================
   REGISTER FORM
========================================================= */

function RegisterForm({
  name,
  setName,
  username,
  setUsername,
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  showPassword,
  setShowPassword,
  showConfirmPassword,
  setShowConfirmPassword,
  submitting,
  error,
  onSubmit,
  onBack,
}: {
  name: string;
  setName: (value: string) => void;
  username: string;
  setUsername: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  showConfirmPassword: boolean;
  setShowConfirmPassword: (value: boolean) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (
    event:
      FormEvent<HTMLFormElement>
  ) => void;
  onBack: () => void;
}) {
  return (
    <>
      <Button
        size="small"
        startIcon={
          <ArrowBackOutlined />
        }
        onClick={
          onBack
        }
        disabled={
          submitting
        }
        sx={{
          mb: 2,

          color:
            "text.secondary",
        }}
      >
        Voltar para o login
      </Button>

      <Typography
        variant="h5"
        sx={{
          fontWeight: 800,

          letterSpacing:
            "-0.025em",
        }}
      >
        Criar conta
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          mt: 0.7,
          mb: 3,
          lineHeight: 1.65,
        }}
      >
        Preencha seus dados. O acesso será liberado após
        aprovação de um administrador.
      </Typography>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 2.5,
            borderRadius: 1.5,
          }}
        >
          {error}
        </Alert>
      )}

      <Box
        component="form"
        onSubmit={onSubmit}
        noValidate
      >
        <TextField
          label="Nome completo"
          value={name}
          onChange={(
            event
          ) =>
            setName(
              event.target.value
            )
          }
          autoComplete="name"
          autoFocus
          fullWidth
          disabled={
            submitting
          }
          slotProps={{
            input: {
              startAdornment:
                (
                  <InputAdornment position="start">
                    <PersonOutlined
                      sx={{
                        fontSize:
                          19,

                        color:
                          "text.secondary",
                      }}
                    />
                  </InputAdornment>
                ),
            },
          }}
        />

        <TextField
          label="Usuário"
          value={username}
          onChange={(
            event
          ) =>
            setUsername(
              event.target.value
            )
          }
          autoComplete="username"
          fullWidth
          disabled={
            submitting
          }
          sx={{
            mt: 2,
          }}
        />

        <TextField
          label="E-mail corporativo"
          type="email"
          value={email}
          onChange={(
            event
          ) =>
            setEmail(
              event.target.value
            )
          }
          autoComplete="email"
          fullWidth
          disabled={
            submitting
          }
          sx={{
            mt: 2,
          }}
          slotProps={{
            input: {
              startAdornment:
                (
                  <InputAdornment position="start">
                    <EmailOutlined
                      sx={{
                        fontSize:
                          19,

                        color:
                          "text.secondary",
                      }}
                    />
                  </InputAdornment>
                ),
            },
          }}
        />

        <PasswordField
          label="Senha"
          value={password}
          setValue={
            setPassword
          }
          visible={
            showPassword
          }
          setVisible={
            setShowPassword
          }
          disabled={
            submitting
          }
          autoComplete="new-password"
          sx={{
            mt: 2,
          }}
        />

        <PasswordField
          label="Confirmar senha"
          value={
            confirmPassword
          }
          setValue={
            setConfirmPassword
          }
          visible={
            showConfirmPassword
          }
          setVisible={
            setShowConfirmPassword
          }
          disabled={
            submitting
          }
          autoComplete="new-password"
          sx={{
            mt: 2,
          }}
        />

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display:
              "block",

            mt: 1.2,
          }}
        >
          A senha deve possuir pelo menos 10 caracteres.
        </Typography>

        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={
            submitting
          }
          sx={primaryButtonSx}
        >
          {submitting ? (
            <CircularProgress
              size={21}
              color="inherit"
            />
          ) : (
            "Solicitar acesso"
          )}
        </Button>
      </Box>
    </>
  );
}

/* =========================================================
   SUCCESS
========================================================= */

function RegisterSuccess({
  onBack,
}: {
  onBack: () => void;
}) {
  return (
    <Stack
      spacing={2.5}
      sx={{
        textAlign:
          "center",

        alignItems:
          "center",

        py: 2,
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 64,

          borderRadius:
            "50%",

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          backgroundColor:
            "rgba(24,199,122,0.10)",
        }}
      >
        <CheckCircleOutlined
          sx={{
            fontSize: 38,

            color:
              aliareColors.green,
          }}
        />
      </Box>

      <Box>
        <Typography
          variant="h5"
          sx={{
            fontWeight:
              800,
          }}
        >
          Cadastro realizado
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 1,

            lineHeight:
              1.7,
          }}
        >
          Sua solicitação foi registrada com sucesso.
          Aguarde a aprovação de um administrador para
          acessar o Hub Suporte Simer.
        </Typography>
      </Box>

      <Alert
        severity="info"
        sx={{
          width: "100%",

          textAlign:
            "left",

          borderRadius:
            1.5,
        }}
      >
        Depois da aprovação, utilize o usuário e a senha
        cadastrados para entrar.
      </Alert>

      <Button
        variant="contained"
        fullWidth
        onClick={
          onBack
        }
        sx={{
          ...primaryButtonSx,

          mt:
            "4px !important",
        }}
      >
        Voltar para o login
      </Button>
    </Stack>
  );
}

/* =========================================================
   PASSWORD
========================================================= */

function PasswordField({
  label,
  value,
  setValue,
  visible,
  setVisible,
  disabled,
  autoComplete,
  sx,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  visible: boolean;
  setVisible: (value: boolean) => void;
  disabled: boolean;
  autoComplete: string;
  sx?: object;
}) {
  return (
    <TextField
      label={label}
      type={
        visible
          ? "text"
          : "password"
      }
      value={value}
      onChange={(
        event
      ) =>
        setValue(
          event.target.value
        )
      }
      autoComplete={
        autoComplete
      }
      fullWidth
      disabled={
        disabled
      }
      sx={sx}
      slotProps={{
        input: {
          startAdornment:
            (
              <InputAdornment position="start">
                <LockOutlined
                  sx={{
                    fontSize:
                      19,

                    color:
                      "text.secondary",
                  }}
                />
              </InputAdornment>
            ),

          endAdornment:
            (
              <InputAdornment position="end">
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() =>
                    setVisible(
                      !visible
                    )
                  }
                  disabled={
                    disabled
                  }
                  aria-label={
                    visible
                      ? "Ocultar senha"
                      : "Exibir senha"
                  }
                >
                  {visible ? (
                    <VisibilityOffOutlined fontSize="small" />
                  ) : (
                    <VisibilityOutlined fontSize="small" />
                  )}
                </IconButton>
              </InputAdornment>
            ),
        },
      }}
    />
  );
}

/* =========================================================
   STYLE
========================================================= */

const primaryButtonSx = {
  mt: 3,

  minHeight: 46,

  borderRadius: 1.5,

  fontWeight: 750,

  backgroundColor:
    aliareColors.black,

  color:
    "#FFFFFF",

  "&:hover": {
    backgroundColor:
      aliareColors.graphiteSoft,
  },
};

/* =========================================================
   ERROS
========================================================= */

function getErrorMessage(
  error: unknown,
  fallback: string
) {
  if (
    axios.isAxiosError(
      error
    )
  ) {
    const message =
      error.response
        ?.data?.message;

    if (
      typeof message ===
        "string" &&
      message.trim()
    ) {
      return message;
    }

    if (!error.response) {
      return "Não foi possível conectar ao servidor do Hub Suporte Simer.";
    }
  }

  return fallback;
}
