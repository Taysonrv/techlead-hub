import { KpiGrid } from "../components/KpiGrid";
import { KpiCard as ExecutiveKpiCard } from "../components/KpiCard";
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
  Select,
  MenuItem,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
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
  ManageAccountsOutlined,
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
import { PageHeader } from "../components/PageHeader";
import { ContentState } from "../components/ContentState";

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
  jobFunction: string | null;
  movideskOwnerName: string | null;

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

const JOB_FUNCTIONS = [
  ["COORDENADOR", "Coordenador"],
  ["LIDER", "Líder"],
  ["SUPORTE_SIMER_N1", "Suporte SIMER · Nível 1"],
  ["SUPORTE_SIMER_N2", "Suporte SIMER · Nível 2"],
  ["SUPORTE_SIMER_N3", "Suporte SIMER · Nível 3"],
  ["BANCO_DE_DADOS", "Banco de Dados"],
] as const;

type UsersResponse = {
  users: ManagedUser[];
};

type ActionType =
  | "APPROVE"
  | "REJECT"
  | "ACTIVATE"
  | "DEACTIVATE"
  | "SET_ADMIN"
  | "SET_COORDINATOR"
  | "SET_ANALYST";

type ConfirmationState = {
  type: ActionType;

  user: ManagedUser;
} | null;

/* =========================================================
   PAGE
========================================================= */

export function Users({ embedded = false }: { embedded?: boolean } = {}) {
  const [usersPage, setUsersPage] = useState(0);
  const [ownership, setOwnership] = useState<{byFunction:{function:string;tickets:number;owners:number}[];unmatched:{owner:string;tickets:number}[];linkedUsers:number;totalUsers:number;note:string} | null>(null);
  const [ownerEditing, setOwnerEditing] = useState<{id:number; value:string} | null>(null);
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
          void api.get<typeof ownership>("/users/ticket-ownership-by-function").then(result => setOwnership(result.data)).catch(() => setOwnership(null));
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

        case "SET_COORDINATOR":
        case "SET_ANALYST":
        case "SET_ADMIN":
          endpoint =
            `/users/${user.id}/role`;
          break;
      }

      const response =
        await api.patch<{
          message: string;
          user: ManagedUser;
        }>(
          endpoint,
          ["SET_ADMIN", "SET_COORDINATOR", "SET_ANALYST"].includes(type)
            ? { role: type === "SET_ADMIN" ? "ADMIN" : type === "SET_COORDINATOR" ? "COORDENADOR" : "ANALISTA" }
            : undefined
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

  async function updateJobFunction(user: ManagedUser, jobFunction: string) {
    setActionLoading(user.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await api.patch<{ message: string; user: ManagedUser }>(
        `/users/${user.id}/job-function`,
        { jobFunction: jobFunction || null },
      );
      setUsers(current => current.map(item => item.id === user.id ? response.data.user : item));
      setSuccess(response.data.message);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setActionLoading(null);
    }
  }

  async function saveMovideskOwnerName() {
    if (!ownerEditing) return;
    setActionLoading(ownerEditing.id);
    setError(null);
    try {
      const response = await api.patch<{message:string;user:ManagedUser}>(`/users/${ownerEditing.id}/movidesk-owner`, {movideskOwnerName: ownerEditing.value.trim() || null});
      setUsers(current => current.map(user => user.id === response.data.user.id ? response.data.user : user));
      setOwnerEditing(null);
      setSuccess(response.data.message);
      void api.get<typeof ownership>("/users/ticket-ownership-by-function").then(result => setOwnership(result.data)).catch(() => setOwnership(null));
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setActionLoading(null); }
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <Stack
      spacing={2.5}
    >
      {/* HEADER */}

      {!embedded && <PageHeader eyebrow="Sistema" title="Usuários" description="Gerencie perfis de acesso e funções organizacionais." action={<Button variant="outlined" startIcon={<RefreshOutlined />} disabled={loading} onClick={()=>void loadUsers()}>Atualizar</Button>} />}
      {embedded && <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6" fontWeight={850}>Equipe e funções</Typography><Typography variant="body2" color="text.secondary">Gerencie perfis, funções e vínculos com responsáveis Movidesk.</Typography></Box><Button size="small" variant="outlined" startIcon={<RefreshOutlined/>} disabled={loading} onClick={()=>void loadUsers()}>Atualizar</Button></Stack>}

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

      <KpiGrid sx={{gridTemplateColumns:{xs:"repeat(2,minmax(0,1fr))",md:"repeat(4,minmax(0,1fr))"}}}>
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
      </KpiGrid>

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
            <ContentState kind="loading" title="Carregando usuários" minHeight={320} />
          ) : (
            <>
              <Box sx={{ display:"grid", gridTemplateColumns:{xs:"minmax(0,1fr)",lg:"repeat(2,minmax(0,1fr))"}, gap:1.5, p:2, minWidth:0 }}>
                {users.slice(usersPage*10,usersPage*10+10).map(user=><Card key={user.id} variant="outlined" sx={{borderRadius:2.5,minWidth:0}}>
                  <CardContent sx={{display:"flex",flexDirection:"column",gap:1.5}}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Box sx={{minWidth:0}}>
                        <Typography fontWeight={800} variant="subtitle2">{user.name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{overflowWrap:"anywhere"}}>@{user.username}{user.email?` · ${user.email}`:""}</Typography>
                      </Box>
                      <Stack direction="row" spacing={.5} flexWrap="wrap" useFlexGap justifyContent="flex-end">
                        <Chip size="small" label={getRoleLabel(user.role)} variant="outlined"/>
                        <ApprovalChip status={user.approvalStatus}/>
                        <Chip size="small" color={user.active?"success":"default"} label={user.active?"Ativo":"Inativo"}/>
                      </Stack>
                    </Stack>
                    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"minmax(0,1fr) minmax(0,1fr)"},gap:1.5}}>
                      <Box sx={{minWidth:0}}>
                        <Typography variant="caption" color="text.secondary">Função na equipe</Typography>
                        <Select size="small" fullWidth displayEmpty value={user.jobFunction??""} disabled={actionLoading!==null||user.approvalStatus!=="APPROVED"} onChange={event=>void updateJobFunction(user,event.target.value)} slotProps={{input:{"aria-label":`Função de ${user.name}`}}} sx={{mt:.5,fontSize:13,borderRadius:2}}>
                          <MenuItem value=""><em>Sem função definida</em></MenuItem>
                          {JOB_FUNCTIONS.map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}
                        </Select>
                      </Box>
                      <Box sx={{minWidth:0}}>
                        <Typography variant="caption" color="text.secondary">Responsável Movidesk</Typography>
                        <Button fullWidth size="small" variant="outlined" disabled={actionLoading!==null} onClick={()=>setOwnerEditing({id:user.id,value:user.movideskOwnerName||""})} sx={{mt:.5,minHeight:40,justifyContent:"flex-start",textTransform:"none",overflow:"hidden"}}>
                          <Typography noWrap variant="body2">{user.movideskOwnerName||"Vincular responsável"}</Typography>
                        </Button>
                      </Box>
                    </Box>
                    <Box sx={{borderTop:"1px solid",borderColor:"divider",pt:1.5,minWidth:0}}>
                      <UserActions user={user} loading={actionLoading===user.id} onAction={type=>setConfirmation({type,user})}/>
                    </Box>
                  </CardContent>
                </Card>)}
                {users.length===0&&<Typography color="text.secondary" sx={{p:3}}>Nenhum usuário encontrado.</Typography>}
              </Box>

              <TablePagination
                component="div"
                count={users.length}
                page={Math.min(usersPage, Math.max(0, Math.ceil(users.length / 10) - 1))}
                onPageChange={(_event, value) => setUsersPage(value)}
                rowsPerPage={10}
                rowsPerPageOptions={[10]}
                labelRowsPerPage="Itens por página"
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
                showFirstButton
                showLastButton
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(ownerEditing)} onClose={() => actionLoading === null && setOwnerEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Vincular responsável dos atendimentos</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{mb:2}}>Informe exatamente o nome do responsável recebido do Movidesk. O vínculo permite relacionar atendimentos à função do colaborador sem alterar os dados importados.</Typography>
          <TextField fullWidth label="Nome do responsável no Movidesk" value={ownerEditing?.value ?? ""} onChange={event => setOwnerEditing(current => current ? {...current,value:event.target.value} : null)} slotProps={{htmlInput:{maxLength:200}}}/>
        </DialogContent>
        <DialogActions>
          <Button disabled={actionLoading !== null} onClick={() => setOwnerEditing(null)}>Cancelar</Button>
          <Button variant="contained" disabled={actionLoading !== null} onClick={() => void saveMovideskOwnerName()}>Salvar vínculo</Button>
        </DialogActions>
      </Dialog>

      {ownership && <Card variant="outlined" sx={{borderRadius:3}}>
        <CardContent>
          <Typography variant="h6" sx={{fontWeight:800}}>Atendimentos por função da equipe</Typography>
          <Typography variant="body2" color="text.secondary" sx={{mb:2}}>{ownership.note} · {ownership.linkedUsers} de {ownership.totalUsers} usuários vinculados ao Movidesk.</Typography>
          <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(3,minmax(0,1fr))"},gap:1.5}}>
            {ownership.byFunction.map(row => <Box key={row.function} sx={{border:"1px solid",borderColor:"divider",borderRadius:2,p:2}}>
              <Typography variant="caption" color="text.secondary">{JOB_FUNCTIONS.find(item=>item[0]===row.function)?.[1] || "Sem função definida"}</Typography>
              <Typography variant="h5" sx={{fontWeight:850}}>{row.tickets.toLocaleString("pt-BR")}</Typography>
              <Typography variant="caption" color="text.secondary">{row.owners} colaborador(es) vinculado(s)</Typography>
            </Box>)}
          </Box>
          {ownership.unmatched.length > 0 && <Alert severity="info" sx={{mt:2}}>Há {ownership.unmatched.length} responsáveis não vinculados entre os 30 principais. Exemplos: {ownership.unmatched.slice(0,5).map(item=>item.owner).join(", ")}. Vincule-os acima para classificar seus atendimentos por função.</Alert>}
        </CardContent>
      </Card>}

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
  return <ExecutiveKpiCard title={label} value={value} icon={icon} />;
}

/* =========================================================
   ACTIONS
========================================================= */

function UserActions({ user, loading, onAction }: { user: ManagedUser; loading: boolean; onAction: (type: ActionType) => void }) {
  if (user.approvalStatus === "PENDING" || user.approvalStatus === "REJECTED") {
    return <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
      <Button size="small" variant="outlined" disabled={loading} onClick={() => onAction("APPROVE")}>Aprovar</Button>
      {user.approvalStatus === "PENDING" && <Button size="small" color="error" disabled={loading} onClick={() => onAction("REJECT")}>Rejeitar</Button>}
    </Stack>;
  }
  return <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
    {user.active && <>
      <Button size="small" startIcon={<ManageAccountsOutlined />} variant="outlined" disabled={loading || user.role === "ANALISTA"} onClick={() => onAction("SET_ANALYST")}>Analista</Button>
      <Button size="small" variant="outlined" disabled={loading || user.role === "COORDENADOR"} onClick={() => onAction("SET_COORDINATOR")}>Coordenador</Button>
      <Button size="small" variant="outlined" disabled={loading || user.role === "ADMIN"} onClick={() => onAction("SET_ADMIN")}>Admin</Button>
    </>}
    {user.role !== "ADMIN" && (user.active
      ? <Button size="small" color="error" startIcon={<PersonOffOutlined />} disabled={loading} onClick={() => onAction("DEACTIVATE")}>Desativar</Button>
      : <Button size="small" variant="outlined" disabled={loading} onClick={() => onAction("ACTIVATE")}>Ativar</Button>)}
  </Stack>;
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

    case "SET_ADMIN":
      return "Conceder acesso administrativo";
    case "SET_COORDINATOR":
      return "Alterar perfil para coordenador";
    case "SET_ANALYST":
      return "Alterar perfil para analista";

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
    case "SET_ADMIN":
      return `Conceder acesso integral de administrador a ${name}? Esta conta poderá administrar todos os usuários e acessar todas as rotinas.`;
    case "SET_COORDINATOR":
      return `Alterar ${name} para coordenador? As Centrais da Coordenação e de Liderança Técnica continuarão exigindo liberação individual.`;
    case "SET_ANALYST":
      return `Alterar ${name} para analista? As permissões específicas existentes serão revisadas conforme o perfil selecionado.`;
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
