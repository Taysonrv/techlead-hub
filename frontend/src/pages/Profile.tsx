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
  type ChangeEvent,
  type FormEvent,
} from "react";

import {
  useAuth,
  type UserRole,
} from "../context/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { UserAvatar } from "../components/UserAvatar";
import { api } from "../services/api";

/* =========================================================
   PERFIL
========================================================= */

export function Profile() {
  const {
    user,
    changePassword,
    refreshUser,
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

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);

  async function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setAvatarMessage("Utilize uma imagem JPG, PNG ou WebP."); return; }
    if (file.size > 2 * 1024 * 1024) { setAvatarMessage("A foto deve possuir no máximo 2 MB."); return; }
    try {
      setAvatarUploading(true); setAvatarMessage(null);
      const form = new FormData(); form.append("avatar", file);
      await api.put("/auth/me/avatar", form);
      await refreshUser();
      setAvatarMessage("Foto de perfil atualizada.");
    } catch { setAvatarMessage("Não foi possível atualizar a foto de perfil."); }
    finally { setAvatarUploading(false); }
  }

  async function removeAvatar() {
    try {
      setAvatarUploading(true); setAvatarMessage(null);
      await api.delete("/auth/me/avatar");
      await refreshUser();
      setAvatarMessage("Foto de perfil removida.");
    } catch { setAvatarMessage("Não foi possível remover a foto de perfil."); }
    finally { setAvatarUploading(false); }
  }

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

      <PageHeader eyebrow="Perfil" title="Meu Perfil" description="Informações da sua conta no TechLead Hub." />

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
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
              <UserAvatar user={user} size={72} />
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
                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
                  <Button component="label" size="small" variant="outlined" disabled={avatarUploading}>
                    {avatarUploading ? "Enviando..." : "Alterar foto"}
                    <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleAvatar(event)} />
                  </Button>
                  {user.avatarUpdatedAt && <Button size="small" color="error" disabled={avatarUploading} onClick={() => void removeAvatar()}>Remover</Button>}
                </Stack>
              </Box>
            </Stack>

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

          {avatarMessage && <Alert severity={avatarMessage.includes("atualizada") || avatarMessage.includes("removida") ? "success" : "warning"} sx={{ mt: 2 }}>{avatarMessage}</Alert>}

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
