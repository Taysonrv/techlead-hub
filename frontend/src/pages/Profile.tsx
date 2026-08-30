import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import axios from "axios";

import {
  useState,
  type FormEvent,
} from "react";

import {
  useAuth,
  type UserRole,
} from "../context/AuthContext";

/* =========================================================
   PERFIL
========================================================= */

export function Profile() {
  const {
    user,
    changePassword,
  } =
    useAuth();

  const [
    currentPassword,
    setCurrentPassword,
  ] =
    useState("");

  const [
    newPassword,
    setNewPassword,
  ] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState("");

  const [
    changingPassword,
    setChangingPassword,
  ] =
    useState(false);

  const [
    passwordError,
    setPasswordError,
  ] =
    useState<
      string | null
    >(null);

  const [
    passwordSuccess,
    setPasswordSuccess,
  ] =
    useState<
      string | null
    >(null);

  if (!user) {
    return (
      <Alert severity="warning">
        Não foi possível carregar os dados do usuário.
      </Alert>
    );
  }

  /* =======================================================
     ALTERAÇÃO DE SENHA
  ======================================================= */

  async function handleChangePassword(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      changingPassword
    ) {
      return;
    }

    setPasswordError(
      null
    );

    setPasswordSuccess(
      null
    );

    if (
      !currentPassword
    ) {
      setPasswordError(
        "Informe a senha atual."
      );

      return;
    }

    if (
      !newPassword
    ) {
      setPasswordError(
        "Informe a nova senha."
      );

      return;
    }

    if (
      newPassword.length <
      10
    ) {
      setPasswordError(
        "A nova senha deve possuir pelo menos 10 caracteres."
      );

      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setPasswordError(
        "A confirmação da nova senha não confere."
      );

      return;
    }

    if (
      currentPassword ===
      newPassword
    ) {
      setPasswordError(
        "A nova senha deve ser diferente da senha atual."
      );

      return;
    }

    try {
      setChangingPassword(
        true
      );

      await changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setCurrentPassword(
        ""
      );

      setNewPassword(
        ""
      );

      setConfirmPassword(
        ""
      );

      setPasswordSuccess(
        "Senha alterada com sucesso."
      );
    } catch (
      error
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
          setPasswordError(
            message
          );

          return;
        }
      }

      setPasswordError(
        "Não foi possível alterar a senha."
      );
    } finally {
      setChangingPassword(
        false
      );
    }
  }

  return (
    <Box>
      {/* ===================================================
          CABEÇALHO
      =================================================== */}

      <Box
        sx={{
          mb: 2.5,
        }}
      >
        <Typography
          sx={{
            fontWeight:
              800,

            fontSize: {
              xs: "1.7rem",
              md: "1.9rem",
              xl: "2.1rem",
            },
          }}
        >
          Meu Perfil
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 0.25,
          }}
        >
          Informações da sua conta no TechLead Hub
        </Typography>
      </Box>

      {/* ===================================================
          IDENTIDADE
      =================================================== */}

      <Card
        elevation={0}
        sx={{
          border:
            "1px solid",

          borderColor:
            "divider",

          borderRadius:
            2.5,
        }}
      >
        <CardContent>
          <Stack
            direction={{
              xs: "column",
              sm: "row",
            }}
            spacing={2}
            sx={{
              justifyContent:
                "space-between",

              alignItems: {
                xs: "flex-start",
                sm: "center",
              },
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontWeight:
                    800,

                  fontSize:
                    "1.2rem",
                }}
              >
                {user.name}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt: 0.25,
                }}
              >
                @{user.username}
              </Typography>
            </Box>

            <Stack
              direction="row"
              spacing={1}
              sx={{
                flexWrap:
                  "wrap",

                gap: 0.75,
              }}
            >
              <Chip
                label={
                  getRoleLabel(
                    user.role
                  )
                }
                color={
                  getRoleColor(
                    user.role
                  )
                }
                variant="outlined"
              />

              <Chip
                label={
                  user.active
                    ? "Ativo"
                    : "Inativo"
                }
                color={
                  user.active
                    ? "success"
                    : "default"
                }
                variant="outlined"
              />
            </Stack>
          </Stack>

          <Divider
            sx={{
              my: 2,
            }}
          />

          {/* =================================================
              DADOS
          ================================================= */}

          <Box
            sx={{
              display:
                "grid",

              gridTemplateColumns:
                {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                },

              gap: 2,
            }}
          >
            <ProfileField
              label="Nome"
              value={
                user.name
              }
            />

            <ProfileField
              label="Usuário"
              value={
                user.username
              }
            />

            <ProfileField
              label="E-mail"
              value={
                user.email
              }
            />

            <ProfileField
              label="Perfil"
              value={
                getRoleLabel(
                  user.role
                )
              }
            />

            <ProfileField
              label="Status"
              value={
                user.active
                  ? "Ativo"
                  : "Inativo"
              }
            />

            <ProfileField
              label="Último acesso"
              value={
                formatDateTime(
                  user.lastLoginAt
                )
              }
            />
          </Box>
        </CardContent>
      </Card>

      {/* ===================================================
          SEGURANÇA
      =================================================== */}

      <Card
        elevation={0}
        sx={{
          mt: 2,

          border:
            "1px solid",

          borderColor:
            "divider",

          borderRadius:
            2.5,
        }}
      >
        <CardContent>
          <Typography
            sx={{
              fontWeight:
                800,

              fontSize:
                "1.05rem",
            }}
          >
            Segurança
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.25,
            }}
          >
            Altere sua senha de acesso ao TechLead Hub.
          </Typography>

          <Divider
            sx={{
              my: 2,
            }}
          />

          {user.mustChangePassword && (
            <Alert
              severity="warning"
              sx={{
                mb: 2,

                borderRadius:
                  2,
              }}
            >
              Sua conta ainda está utilizando a senha inicial. Defina uma nova senha para concluir a configuração da conta.
            </Alert>
          )}

          {!user.mustChangePassword &&
            !passwordSuccess && (
              <Alert
                severity="success"
                variant="outlined"
                sx={{
                  mb: 2,

                  borderRadius:
                    2,
                }}
              >
                Sua conta está ativa e a senha inicial já foi alterada.
              </Alert>
            )}

          {passwordError && (
            <Alert
              severity="error"
              sx={{
                mb: 2,

                borderRadius:
                  2,
              }}
            >
              {passwordError}
            </Alert>
          )}

          {passwordSuccess && (
            <Alert
              severity="success"
              sx={{
                mb: 2,

                borderRadius:
                  2,
              }}
            >
              {passwordSuccess}
            </Alert>
          )}

          <Box
            component="form"
            onSubmit={
              handleChangePassword
            }
            noValidate
            sx={{
              maxWidth:
                520,
            }}
          >
            <TextField
              label="Senha atual"
              type="password"
              value={
                currentPassword
              }
              onChange={(
                event
              ) => {
                setCurrentPassword(
                  event.target
                    .value
                );

                setPasswordError(
                  null
                );

                setPasswordSuccess(
                  null
                );
              }}
              autoComplete="current-password"
              disabled={
                changingPassword
              }
              fullWidth
            />

            <TextField
              label="Nova senha"
              type="password"
              value={
                newPassword
              }
              onChange={(
                event
              ) => {
                setNewPassword(
                  event.target
                    .value
                );

                setPasswordError(
                  null
                );

                setPasswordSuccess(
                  null
                );
              }}
              autoComplete="new-password"
              disabled={
                changingPassword
              }
              helperText="Utilize pelo menos 10 caracteres."
              fullWidth
              sx={{
                mt: 2,
              }}
            />

            <TextField
              label="Confirmar nova senha"
              type="password"
              value={
                confirmPassword
              }
              onChange={(
                event
              ) => {
                setConfirmPassword(
                  event.target
                    .value
                );

                setPasswordError(
                  null
                );

                setPasswordSuccess(
                  null
                );
              }}
              autoComplete="new-password"
              disabled={
                changingPassword
              }
              fullWidth
              sx={{
                mt: 2,
              }}
            />

            <Stack
              direction={{
                xs: "column",
                sm: "row",
              }}
              spacing={1}
              sx={{
                mt: 2.5,

                alignItems: {
                  xs: "stretch",
                  sm: "center",
                },
              }}
            >
              <Button
                type="submit"
                variant="contained"
                disabled={
                  changingPassword
                }
                sx={{
                  minWidth:
                    145,

                  minHeight:
                    40,

                  textTransform:
                    "none",

                  fontWeight:
                    700,
                }}
              >
                {changingPassword
                  ? "Alterando..."
                  : "Alterar senha"}
              </Button>

              <Button
                type="button"
                variant="text"
                disabled={
                  changingPassword
                }
                onClick={() => {
                  setCurrentPassword(
                    ""
                  );

                  setNewPassword(
                    ""
                  );

                  setConfirmPassword(
                    ""
                  );

                  setPasswordError(
                    null
                  );

                  setPasswordSuccess(
                    null
                  );
                }}
                sx={{
                  textTransform:
                    "none",
                }}
              >
                Limpar
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      {/* ===================================================
          INFORMAÇÕES DO SISTEMA
      =================================================== */}

      <Card
        elevation={0}
        sx={{
          mt: 2,

          border:
            "1px solid",

          borderColor:
            "divider",

          borderRadius:
            2.5,
        }}
      >
        <CardContent>
          <Typography
            sx={{
              fontWeight:
                800,

              fontSize:
                "1.05rem",
            }}
          >
            Informações da conta
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.25,
            }}
          >
            Informações de auditoria e manutenção do cadastro.
          </Typography>

          <Divider
            sx={{
              my: 2,
            }}
          />

          <Box
            sx={{
              display:
                "grid",

              gridTemplateColumns:
                {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                },

              gap: 2,
            }}
          >
            <ProfileField
              label="Criado em"
              value={
                formatDateTime(
                  user.createdAt
                )
              }
            />

            <ProfileField
              label="Última atualização"
              value={
                formatDateTime(
                  user.updatedAt
                )
              }
            />
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

/* =========================================================
   CAMPO
========================================================= */

function ProfileField({
  label,
  value,
}: {
  label:
    string;

  value:
    string |
    null |
    undefined;
}) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display:
            "block",

          mb: 0.25,
        }}
      >
        {label}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          fontWeight:
            650,

          overflowWrap:
            "anywhere",
        }}
      >
        {value ||
          "—"}
      </Typography>
    </Box>
  );
}

/* =========================================================
   PAPEL
========================================================= */

function getRoleLabel(
  role:
    UserRole
) {
  if (
    role ===
    "ADMIN"
  ) {
    return "Administrador";
  }

  if (
    role ===
    "COORDENADOR"
  ) {
    return "Coordenador";
  }

  return "Analista";
}

function getRoleColor(
  role:
    UserRole
):
  | "primary"
  | "secondary"
  | "default" {
  if (
    role ===
    "ADMIN"
  ) {
    return "primary";
  }

  if (
    role ===
    "COORDENADOR"
  ) {
    return "secondary";
  }

  return "default";
}

/* =========================================================
   DATA
========================================================= */

function formatDateTime(
  value:
    string |
    null |
    undefined
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleString(
    "pt-BR",
    {
      dateStyle:
        "short",

      timeStyle:
        "short",
    }
  );
}