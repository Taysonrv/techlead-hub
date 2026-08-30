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
  LockOutlined,
  PersonOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
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
  aliareColors,
} from "../theme/theme";

/* =========================================================
   TIPOS
========================================================= */

type LocationState = {
  from?: string;
};

/* =========================================================
   LOGIN
========================================================= */

export function Login() {
  const {
    login,
    authenticated,
    loading:
      authLoading,
  } =
    useAuth();

  const navigate =
    useNavigate();

  const location =
    useLocation();

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
    showPassword,
    setShowPassword,
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
    useState<
      string | null
    >(null);

  /* =======================================================
     DESTINO APÓS LOGIN
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

  /* =======================================================
     LIMPA ERRO AO ALTERAR OS CAMPOS
  ======================================================= */

  useEffect(() => {
    if (error) {
      setError(
        null
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    username,
    password,
  ]);

  /* =======================================================
     LOGIN
  ======================================================= */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submitting
    ) {
      return;
    }

    const normalizedUsername =
      username.trim();

    if (
      !normalizedUsername
    ) {
      setError(
        "Informe o usuário."
      );

      return;
    }

    if (
      !password
    ) {
      setError(
        "Informe a senha."
      );

      return;
    }

    setSubmitting(
      true
    );

    setError(
      null
    );

    try {
      await login({
        username:
          normalizedUsername,

        password,
      });

      navigate(
        redirectTo,
        {
          replace:
            true,
        }
      );
    } catch (
      requestError
    ) {
      setError(
        getLoginErrorMessage(
          requestError
        )
      );
    } finally {
      setSubmitting(
        false
      );
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
     RESTAURAÇÃO INICIAL DA SESSÃO
  ======================================================= */

  if (
    authLoading
  ) {
    return (
      <Box
        sx={{
          minHeight:
            "100vh",

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
          "100vh",

        display:
          "flex",

        backgroundColor:
          "background.default",
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
            md: "43%",
            lg: "46%",
          },

          minHeight:
            "100vh",

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

          backgroundColor:
            aliareColors.black,

          color:
            "#FFFFFF",

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
              300,

            height:
              300,

            borderRadius:
              "36% 64% 58% 42% / 48% 45% 55% 52%",

            border:
              `1px solid rgba(24,199,122,0.28)`,

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
              "rgba(24,199,122,0.07)",
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
                  "rgba(255,255,255,0.72)",
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
                800,

              letterSpacing:
                "-0.035em",
            }}
          >
            TechLead Hub
          </Typography>

          <Typography
            sx={{
              mt: 0.9,

              fontSize:
                "0.95rem",

              color:
                "rgba(255,255,255,0.56)",
            }}
          >
            Support Intelligence
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
              width:
                38,

              height:
                3,

              borderRadius:
                99,

              backgroundColor:
                aliareColors.green,

              mb:
                2.2,
            }}
          />

          <Typography
            sx={{
              fontSize: {
                md: "1.4rem",
                lg: "1.65rem",
              },

              lineHeight:
                1.35,

              fontWeight:
                700,

              letterSpacing:
                "-0.02em",
            }}
          >
            Gestão da operação com contexto,
            prioridade e inteligência.
          </Typography>

          <Typography
            sx={{
              mt: 2,

              maxWidth:
                420,

              lineHeight:
                1.75,

              color:
                "rgba(255,255,255,0.54)",
            }}
          >
            Indicadores, carteira de atendimentos,
            pontos de atenção e visão gerencial do
            Suporte e Sustentação do SIMER em um
            único ambiente.
          </Typography>

          <Stack
            direction="row"
            spacing={1}
            sx={{
              mt:
                3,

              flexWrap:
                "wrap",

              gap:
                1,
            }}
          >
            {[
              "Operação",
              "Desempenho",
              "Qualidade",
            ].map(
              (label) => (
                <Box
                  key={
                    label
                  }
                  sx={{
                    px:
                      1.1,

                    py:
                      0.55,

                    borderRadius:
                      99,

                    border:
                      "1px solid rgba(255,255,255,0.10)",

                    backgroundColor:
                      "rgba(255,255,255,0.04)",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color:
                        "rgba(255,255,255,0.64)",

                      fontWeight:
                        650,
                    }}
                  >
                    {label}
                  </Typography>
                </Box>
              )
            )}
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
                "rgba(255,255,255,0.09)",
            }}
          />

          <Stack
            direction="row"
            sx={{
              alignItems:
                "center",

              justifyContent:
                "space-between",

              gap:
                2,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color:
                  "rgba(255,255,255,0.38)",
              }}
            >
              Aliare · Suporte e Sustentação · SIMER
            </Typography>

            <Box
              sx={{
                width:
                  7,

                height:
                  7,

                borderRadius:
                  "50%",

                backgroundColor:
                  aliareColors.green,

                boxShadow:
                  "0 0 0 4px rgba(24,199,122,0.10)",
              }}
            />
          </Stack>
        </Box>
      </Box>

      {/* ===================================================
          LOGIN
      =================================================== */}

      <Box
        sx={{
          flex:
            1,

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

          py:
            4,
        }}
      >
        <Box
          sx={{
            width:
              "100%",

            maxWidth:
              430,
          }}
        >
          {/* IDENTIDADE MOBILE */}

          <Box
            sx={{
              display: {
                xs: "block",
                md: "none",
              },

              mb:
                3,
            }}
          >
            <Stack
              direction="row"
              spacing={0.8}
              sx={{
                alignItems:
                  "center",
              }}
            >
              <Box
                sx={{
                  width:
                    9,

                  height:
                    9,

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
                    "0.7rem",

                  fontWeight:
                    800,

                  letterSpacing:
                    "0.12em",

                  textTransform:
                    "uppercase",

                  color:
                    "text.secondary",
                }}
              >
                aliare
              </Typography>
            </Stack>

            <Typography
              variant="h5"
              sx={{
                mt:
                  1,

                fontWeight:
                  800,

                letterSpacing:
                  "-0.025em",
              }}
            >
              TechLead Hub
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
            >
              Support Intelligence
            </Typography>
          </Box>

          <Card
            elevation={0}
            sx={{
              border:
                "1px solid",

              borderColor:
                "divider",

              borderRadius:
                2.5,

              overflow:
                "hidden",

              boxShadow:
                "0 18px 50px rgba(16,24,40,0.07)",
            }}
          >
            <Box
              sx={{
                height:
                  4,

                backgroundColor:
                  aliareColors.green,
              }}
            />

            <CardContent
              sx={{
                p: {
                  xs: 3,
                  sm: 4,
                },

                "&:last-child":
                  {
                    pb: {
                      xs: 3,
                      sm: 4,
                    },
                  },
              }}
            >
              <Typography
                variant="h5"
                sx={{
                  fontWeight:
                    800,

                  letterSpacing:
                    "-0.025em",
                }}
              >
                Bem-vindo
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt:
                    0.7,

                  mb:
                    3,

                  lineHeight:
                    1.65,
                }}
              >
                Entre com suas credenciais para acessar
                o TechLead Hub.
              </Typography>

              {error && (
                <Alert
                  severity="error"
                  sx={{
                    mb:
                      2.5,

                    borderRadius:
                      1.5,
                  }}
                >
                  {error}
                </Alert>
              )}

              <Box
                component="form"
                onSubmit={
                  handleSubmit
                }
                noValidate
              >
                <TextField
                  label="Usuário"
                  value={
                    username
                  }
                  onChange={(
                    event
                  ) =>
                    setUsername(
                      event.target
                        .value
                    )
                  }
                  autoComplete="username"
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
                  label="Senha"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={
                    password
                  }
                  onChange={(
                    event
                  ) =>
                    setPassword(
                      event.target
                        .value
                    )
                  }
                  autoComplete="current-password"
                  fullWidth
                  disabled={
                    submitting
                  }
                  sx={{
                    mt:
                      2,
                  }}
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
                              aria-label={
                                showPassword
                                  ? "Ocultar senha"
                                  : "Exibir senha"
                              }
                              onClick={() =>
                                setShowPassword(
                                  (current) =>
                                    !current
                                )
                              }
                              disabled={
                                submitting
                              }
                            >
                              {showPassword ? (
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

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  size="large"
                  disabled={
                    submitting
                  }
                  sx={{
                    mt:
                      3,

                    minHeight:
                      46,

                    borderRadius:
                      1.5,

                    fontWeight:
                      750,

                    backgroundColor:
                      aliareColors.black,

                    color:
                      "#FFFFFF",

                    "&:hover": {
                      backgroundColor:
                        aliareColors.graphiteSoft,
                    },
                  }}
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
                  my:
                    2.75,
                }}
              />

              <Stack
                direction="row"
                sx={{
                  justifyContent:
                    "space-between",

                  alignItems:
                    "center",

                  gap:
                    1,
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                >
                  Acesso corporativo restrito
                </Typography>

                <Typography
                  variant="caption"
                  sx={{
                    fontWeight:
                      700,

                    color:
                      aliareColors.greenDark,
                  }}
                >
                  SIMER
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display:
                "block",

              mt:
                2,

              px:
                1,

              textAlign:
                "center",

              lineHeight:
                1.5,
            }}
          >
            Utilize somente credenciais autorizadas para
            acessar os dados da operação.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

/* =========================================================
   ERROS
========================================================= */

function getLoginErrorMessage(
  error:
    unknown
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

    if (
      !error.response
    ) {
      return "Não foi possível conectar ao servidor do TechLead Hub.";
    }

    if (
      error.response
        .status === 401
    ) {
      return "Usuário ou senha inválidos.";
    }

    if (
      error.response
        .status === 403
    ) {
      return "Este usuário não possui acesso ao TechLead Hub.";
    }
  }

  return "Não foi possível realizar o login. Tente novamente.";
}