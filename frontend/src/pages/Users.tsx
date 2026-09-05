import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import {
  BlockOutlined,
  CheckCircleOutlined,
  HowToRegOutlined,
  PersonOffOutlined,
  PeopleAltOutlined,
  RefreshOutlined,
} from "@mui/icons-material";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import axios from "axios";

import {
  api,
} from "../services/api";

import {
  aliareColors,
} from "../theme/theme";

import type {
  UserApprovalStatus,
  UserRole,
} from "../context/AuthContext";

/* =========================================================
   TIPOS
========================================================= */

type ManagedUser = {
  id: number;

  name: string;

  username: string;

  email: string | null;

  role: UserRole;

  active: boolean;

  approvalStatus:
    UserApprovalStatus;

  approvedAt?: string | null;

  approvedById?: number | null;

  mustChangePassword:
    boolean;

  lastLoginAt?: string | null;

  createdAt:
    string;

  updatedAt:
    string;
};

type UsersResponse = {
  users: ManagedUser[];
};

type ActionType =
  | "APPROVE"
  | "REJECT"
  | "ACTIVATE"
  | "DEACTIVATE";

type ConfirmationState = {
  type: ActionType;

  user: ManagedUser;
} | null;

/* =========================================================
   PAGE
========================================================= */

export function Users() {
  const [
    users,
    setUsers,
  ] =
    useState<ManagedUser[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    actionLoading,
    setActionLoading,
  ] =
    useState<number | null>(
      null
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const [
    success,
    setSuccess,
  ] =
    useState<string | null>(
      null
    );

  const [
    confirmation,
    setConfirmation,
  ] =
    useState<ConfirmationState>(
      null
    );

  /* =======================================================
     LOAD
  ======================================================= */

  const loadUsers =
    useCallback(
      async () => {
        setLoading(true);
        setError(null);

        try {
          const response =
            await api.get<UsersResponse>(
              "/users"
            );

          setUsers(
            response.data.users
          );
        } catch (
          requestError
        ) {
          setError(
            getErrorMessage(
              requestError
            )
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(() => {
    void loadUsers();
  }, [
    loadUsers,
  ]);

  /* =======================================================
     INDICADORES
  ======================================================= */

  const pendingCount =
    useMemo(
      () =>
        users.filter(
          (user) =>
            user.approvalStatus ===
            "PENDING"
        ).length,
      [
        users,
      ]
    );

  const activeCount =
    useMemo(
      () =>
        users.filter(
          (user) =>
            user.active &&
            user.approvalStatus ===
              "APPROVED"
        ).length,
      [
        users,
      ]
    );

  const rejectedCount =
    useMemo(
      () =>
        users.filter(
          (user) =>
            user.approvalStatus ===
            "REJECTED"
        ).length,
      [
        users,
      ]
    );

  /* =======================================================
     ACTION
  ======================================================= */

  async function executeAction() {
    if (!confirmation) {
      return;
    }

    const {
      user,
      type,
    } =
      confirmation;

    setActionLoading(
      user.id
    );

    setError(null);
    setSuccess(null);

    try {
      let endpoint =
        "";

      switch (type) {
        case "APPROVE":
          endpoint =
            `/users/${user.id}/approve`;
          break;

        case "REJECT":
          endpoint =
            `/users/${user.id}/reject`;
          break;

        case "ACTIVATE":
          endpoint =
            `/users/${user.id}/activate`;
          break;

        case "DEACTIVATE":
          endpoint =
            `/users/${user.id}/deactivate`;
          break;
      }

      const response =
        await api.patch<{
          message: string;
          user: ManagedUser;
        }>(
          endpoint
        );

      setUsers(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              response.data.user.id
                ? response.data.user
                : item
          )
      );

      setSuccess(
        response.data.message
      );

      setConfirmation(
        null
      );
    } catch (
      requestError
    ) {
      setError(
        getErrorMessage(
          requestError
        )
      );
    } finally {
      setActionLoading(
        null
      );
    }
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <Stack
      spacing={2.5}
    >
      {/* HEADER */}

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
            xs: "stretch",
            sm: "center",
          },
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight:
                800,

              letterSpacing:
                "-0.03em",
            }}
          >
            Usuários
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.5,
            }}
          >
            Aprovação e controle de acesso ao TechLead Hub.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={
            <RefreshOutlined />
          }
          onClick={() =>
            void loadUsers()
          }
          disabled={
            loading
          }
          sx={{
            alignSelf: {
              xs: "stretch",
              sm: "center",
            },
          }}
        >
          Atualizar
        </Button>
      </Stack>

      {/* ALERTAS */}

      {error && (
        <Alert
          severity="error"
          onClose={() =>
            setError(null)
          }
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          severity="success"
          onClose={() =>
            setSuccess(null)
          }
        >
          {success}
        </Alert>
      )}

      {/* CARDS */}

      <Box
        sx={{
          display:
            "grid",

          gridTemplateColumns: {
            xs: "1fr",
            sm:
              "repeat(2, minmax(0, 1fr))",
            lg:
              "repeat(4, minmax(0, 1fr))",
          },

          gap: 2,
        }}
      >
        <SummaryCard
          label="Total"
          value={
            users.length
          }
          icon={
            <PeopleAltOutlined />
          }
        />

        <SummaryCard
          label="Pendentes"
          value={
            pendingCount
          }
          icon={
            <HowToRegOutlined />
          }
        />

        <SummaryCard
          label="Ativos"
          value={
            activeCount
          }
          icon={
            <CheckCircleOutlined />
          }
        />

        <SummaryCard
          label="Rejeitados"
          value={
            rejectedCount
          }
          icon={
            <BlockOutlined />
          }
        />
      </Box>

      {/* TABLE */}

      <Card
        elevation={0}
        sx={{
          border:
            "1px solid",

          borderColor:
            "divider",

          borderRadius:
            2,
        }}
      >
        <CardContent
          sx={{
            p: 0,

            "&:last-child": {
              pb: 0,
            },
          }}
        >
          {loading ? (
            <Box
              sx={{
                minHeight:
                  320,

                display:
                  "flex",

                alignItems:
                  "center",

                justifyContent:
                  "center",
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
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      Usuário
                    </TableCell>

                    <TableCell>
                      Perfil
                    </TableCell>

                    <TableCell>
                      Aprovação
                    </TableCell>

                    <TableCell>
                      Acesso
                    </TableCell>

                    <TableCell>
                      Cadastro
                    </TableCell>

                    <TableCell
                      align="right"
                    >
                      Ações
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {users.map(
                    (
                      user
                    ) => (
                      <TableRow
                        key={
                          user.id
                        }
                        hover
                      >
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight:
                                700,
                            }}
                          >
                            {user.name}
                          </Typography>

                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            @{user.username}

                            {user.email
                              ? ` · ${user.email}`
                              : ""}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            label={
                              getRoleLabel(
                                user.role
                              )
                            }
                            variant="outlined"
                          />
                        </TableCell>

                        <TableCell>
                          <ApprovalChip
                            status={
                              user.approvalStatus
                            }
                          />
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
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
                            variant={
                              user.active
                                ? "filled"
                                : "outlined"
                            }
                          />
                        </TableCell>

                        <TableCell>
                          <Typography
                            variant="body2"
                          >
                            {formatDate(
                              user.createdAt
                            )}
                          </Typography>
                        </TableCell>

                        <TableCell
                          align="right"
                        >
                          <UserActions
                            user={
                              user
                            }
                            loading={
                              actionLoading ===
                              user.id
                            }
                            onAction={(
                              type
                            ) =>
                              setConfirmation({
                                type,
                                user,
                              })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )
                  )}

                  {users.length ===
                    0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                      >
                        <Box
                          sx={{
                            py: 6,

                            textAlign:
                              "center",
                          }}
                        >
                          <Typography
                            color="text.secondary"
                          >
                            Nenhum usuário encontrado.
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* CONFIRMAÇÃO */}

      <Dialog
        open={
          Boolean(
            confirmation
          )
        }
        onClose={() => {
          if (
            actionLoading ===
            null
          ) {
            setConfirmation(
              null
            );
          }
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {getActionTitle(
            confirmation?.type
          )}
        </DialogTitle>

        <DialogContent>
          <DialogContentText>
            {confirmation
              ? getActionDescription(
                  confirmation
                )
              : ""}
          </DialogContentText>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setConfirmation(
                null
              )
            }
            disabled={
              actionLoading !==
              null
            }
          >
            Cancelar
          </Button>

          <Button
            variant="contained"
            onClick={() =>
              void executeAction()
            }
            disabled={
              actionLoading !==
              null
            }
            sx={{
              backgroundColor:
                aliareColors.black,

              "&:hover": {
                backgroundColor:
                  aliareColors.graphiteSoft,
              },
            }}
          >
            {actionLoading !==
            null ? (
              <CircularProgress
                size={18}
                color="inherit"
              />
            ) : (
              "Confirmar"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/* =========================================================
   SUMMARY
========================================================= */

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card
      elevation={0}
      sx={{
        border:
          "1px solid",

        borderColor:
          "divider",

        borderRadius:
          2,
      }}
    >
      <CardContent>
        <Stack
          direction="row"
          sx={{
            alignItems:
              "center",

            justifyContent:
              "space-between",
          }}
        >
          <Box>
            <Typography
              variant="body2"
              color="text.secondary"
            >
              {label}
            </Typography>

            <Typography
              variant="h4"
              sx={{
                mt: 0.5,

                fontWeight:
                  800,
              }}
            >
              {value}
            </Typography>
          </Box>

          <Box
            sx={{
              width: 42,
              height: 42,

              borderRadius:
                1.5,

              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              backgroundColor:
                "rgba(24,199,122,0.08)",

              color:
                aliareColors.greenDark,
            }}
          >
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

/* =========================================================
   ACTIONS
========================================================= */

function UserActions({
  user,
  loading,
  onAction,
}: {
  user: ManagedUser;
  loading: boolean;
  onAction: (
    type: ActionType
  ) => void;
}) {
  if (
    user.role ===
    "ADMIN"
  ) {
    return (
      <Typography
        variant="caption"
        color="text.secondary"
      >
        Administrador
      </Typography>
    );
  }

  if (
    user.approvalStatus ===
    "PENDING"
  ) {
    return (
      <Stack
        direction="row"
        spacing={1}
        sx={{
          justifyContent:
            "flex-end",
        }}
      >
        <Button
          size="small"
          variant="contained"
          disabled={
            loading
          }
          onClick={() =>
            onAction(
              "APPROVE"
            )
          }
          sx={{
            backgroundColor:
              aliareColors.greenDark,

            "&:hover": {
              backgroundColor:
                aliareColors.greenDark,
            },
          }}
        >
          Aprovar
        </Button>

        <Button
          size="small"
          color="error"
          disabled={
            loading
          }
          onClick={() =>
            onAction(
              "REJECT"
            )
          }
        >
          Rejeitar
        </Button>
      </Stack>
    );
  }

  if (
    user.approvalStatus ===
    "REJECTED"
  ) {
    return (
      <Button
        size="small"
        variant="outlined"
        disabled={
          loading
        }
        onClick={() =>
          onAction(
            "APPROVE"
          )
        }
      >
        Aprovar
      </Button>
    );
  }

  return user.active ? (
    <Button
      size="small"
      color="error"
      startIcon={
        <PersonOffOutlined />
      }
      disabled={
        loading
      }
      onClick={() =>
        onAction(
          "DEACTIVATE"
        )
      }
    >
      Desativar
    </Button>
  ) : (
    <Button
      size="small"
      variant="outlined"
      disabled={
        loading
      }
      onClick={() =>
        onAction(
          "ACTIVATE"
        )
      }
    >
      Ativar
    </Button>
  );
}

/* =========================================================
   CHIPS
========================================================= */

function ApprovalChip({
  status,
}: {
  status:
    UserApprovalStatus;
}) {
  switch (status) {
    case "APPROVED":
      return (
        <Chip
          size="small"
          label="Aprovado"
          color="success"
        />
      );

    case "REJECTED":
      return (
        <Chip
          size="small"
          label="Rejeitado"
          color="error"
          variant="outlined"
        />
      );

    default:
      return (
        <Chip
          size="small"
          label="Pendente"
          color="warning"
        />
      );
  }
}

/* =========================================================
   HELPERS
========================================================= */

function getRoleLabel(
  role: UserRole
) {
  switch (role) {
    case "ADMIN":
      return "Administrador";

    case "COORDENADOR":
      return "Coordenador";

    default:
      return "Analista";
  }
}

function formatDate(
  value:
    string | null | undefined
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      dateStyle:
        "short",

      timeStyle:
        "short",
    }
  ).format(
    date
  );
}

function getActionTitle(
  type:
    ActionType | undefined
) {
  switch (type) {
    case "APPROVE":
      return "Aprovar usuário";

    case "REJECT":
      return "Rejeitar cadastro";

    case "ACTIVATE":
      return "Ativar usuário";

    case "DEACTIVATE":
      return "Desativar usuário";

    default:
      return "Confirmar operação";
  }
}

function getActionDescription(
  confirmation: Exclude<
    ConfirmationState,
    null
  >
) {
  const name =
    confirmation.user.name;

  switch (
    confirmation.type
  ) {
    case "APPROVE":
      return `Deseja aprovar o acesso de ${name}? O usuário poderá entrar no TechLead Hub imediatamente.`;

    case "REJECT":
      return `Deseja rejeitar o cadastro de ${name}? O usuário continuará sem acesso ao sistema.`;

    case "ACTIVATE":
      return `Deseja reativar o acesso de ${name}?`;

    case "DEACTIVATE":
      return `Deseja desativar o acesso de ${name}? As sessões abertas desse usuário serão encerradas.`;
  }
}

function getErrorMessage(
  error: unknown
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

  return "Não foi possível concluir a operação.";
}