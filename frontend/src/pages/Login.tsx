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

type ScreenMode =
  | "LOGIN"
  | "REGISTER"
  | "REGISTER_SUCCESS";

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
              "1px solid rgba(24,199,122,0.28)",

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
              width: 38,
              height: 3,

              borderRadius:
                99,

              backgroundColor:
                aliareColors.green,

              mb: 2.2,
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
              mt: 3,

              flexWrap:
                "wrap",

              gap: 1,
            }}
          >
            {[
              "Operação",
              "Desempenho",
              "Qualidade",
            ].map(
              (label) => (
                <Box
                  key={label}
                  sx={{
                    px: 1.1,
                    py: 0.55,

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

          <Typography
            variant="caption"
            sx={{
              color:
                "rgba(255,255,255,0.38)",
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
        }}
      >
        <Box
          sx={{
            width:
              "100%",

            maxWidth:
              mode ===
              "REGISTER"
                ? 500
                : 430,
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
                  800,
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
                height: 4,

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
                  onSubmit={
                    handleLogin
                  }
                  onRegister={() =>
                    setMode(
                      "REGISTER"
                    )
                  }
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
            Utilize somente credenciais autorizadas para
            acessar os dados da operação.
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
  onSubmit,
  onRegister,
}: {
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (
    event:
      FormEvent<HTMLFormElement>
  ) => void;
  onRegister: () => void;
}) {
  return (
    <>
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
          mt: 0.7,
          mb: 3,

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
          minHeight: 44,
          borderRadius: 1.5,

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
          acessar o TechLead Hub.
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
      return "Não foi possível conectar ao servidor do TechLead Hub.";
    }
  }

  return fallback;
}