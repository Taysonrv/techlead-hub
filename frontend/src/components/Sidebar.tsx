import {
  Avatar,
  Badge,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem as MuiMenuItem,
  Stack,
  Typography,
} from "@mui/material";

import {
  AutoFixHighOutlined,
  BugReportOutlined,
  BusinessOutlined,
  ConfirmationNumberOutlined,
  DashboardOutlined,
  ExpandMoreRounded,
  GroupsOutlined,
  InfoOutlined,
  Inventory2Outlined,
  LogoutOutlined,
  ManageAccountsOutlined,
  PersonOutlined,
  SettingsOutlined,
  SupportAgentOutlined,
  TrendingUpOutlined,
  UploadFileOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  MouseEvent,
  ReactNode,
} from "react";

import {
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  useAuth,
  type UserRole,
} from "../context/AuthContext";

import {
  api,
} from "../services/api";

import {
  aliareColors,
} from "../theme/theme";

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

export const drawerWidth = 248;

/* =========================================================
   TIPOS
========================================================= */

type MenuItemData = {
  label: string;
  path: string;
  icon: ReactNode;
  badge?: number;
};

type PendingUsersResponse = {
  users: Array<{
    id: number;
  }>;
};

/* =========================================================
   SIDEBAR
========================================================= */

export function Sidebar() {
  const navigate =
    useNavigate();

  const location =
    useLocation();

  const {
    user,
    logout,
    isAdmin,
  } =
    useAuth();

  const [
    appVersion,
    setAppVersion,
  ] =
    useState("Beta");

  const [
    loggingOut,
    setLoggingOut,
  ] =
    useState(false);

  const [
    pendingUsers,
    setPendingUsers,
  ] =
    useState(0);

  const [
    profileAnchor,
    setProfileAnchor,
  ] =
    useState<HTMLElement | null>(null);

  const profileMenuOpen =
    Boolean(profileAnchor);

  /* =======================================================
     VERSÃO DO APLICATIVO
  ======================================================= */

  useEffect(() => {
    let mounted =
      true;

    async function loadVersion() {
      try {
        if (
          !window.techLeadHub
        ) {
          return;
        }

        const version =
          await window.techLeadHub.getVersion();

        if (mounted) {
          setAppVersion(
            `v${version}`,
          );
        }
      } catch (
        error
      ) {
        console.error(
          "Erro ao carregar versão do aplicativo:",
          error,
        );
      }
    }

    void loadVersion();

    return () => {
      mounted =
        false;
    };
  }, []);

  /* =======================================================
     USUÁRIOS PENDENTES
  ======================================================= */

  const loadPendingUsers =
    useCallback(
      async () => {
        if (!isAdmin) {
          setPendingUsers(0);
          return;
        }

        try {
          const response =
            await api.get<PendingUsersResponse>(
              "/users/pending",
            );

          setPendingUsers(
            response.data.users.length,
          );
        } catch (
          error
        ) {
          console.warn(
            "[sidebar] Não foi possível carregar usuários pendentes:",
            error,
          );
        }
      },
      [
        isAdmin,
      ],
    );

  useEffect(() => {
    void loadPendingUsers();
  }, [
    loadPendingUsers,
  ]);

  useEffect(() => {
    if (
      isAdmin &&
      location.pathname ===
        "/usuarios"
    ) {
      void loadPendingUsers();
    }
  }, [
    isAdmin,
    location.pathname,
    loadPendingUsers,
  ]);

  /* =======================================================
     OPERAÇÃO
  ======================================================= */

  const mainMenu =
    useMemo<MenuItemData[]>(
      () => [
        {
          label:
            "Dashboard",
          path:
            "/",
          icon:
            <DashboardOutlined fontSize="small" />,
        },
        {
          label:
            "Tickets",
          path:
            "/tickets",
          icon:
            <ConfirmationNumberOutlined fontSize="small" />,
        },
        {
          label:
            "Analistas",
          path:
            "/analistas",
          icon:
            <GroupsOutlined fontSize="small" />,
        },
        {
          label:
            "Clientes",
          path:
            "/clientes",
          icon:
            <BusinessOutlined fontSize="small" />,
        },
        {
          label:
            "Desempenho",
          path:
            "/desempenho",
          icon:
            <TrendingUpOutlined fontSize="small" />,
        },
        {
          label:
            "Pontos de Atenção",
          path:
            "/atencao",
          icon:
            <WarningAmberOutlined fontSize="small" />,
        },
      ],
      [],
    );

  /* =======================================================
     DESENVOLVIMENTO
  ======================================================= */

  const developmentMenu =
    useMemo<MenuItemData[]>(
      () => [
        {
          label:
            "Correções",
          path:
            "/correcoes",
          icon:
            <BugReportOutlined fontSize="small" />,
        },
        {
          label:
            "Evoluções",
          path:
            "/evolucoes",
          icon:
            <AutoFixHighOutlined fontSize="small" />,
        },
        {
          label:
            "Apoios",
          path:
            "/apoios",
          icon:
            <SupportAgentOutlined fontSize="small" />,
        },
        {
          label:
            "Versões",
          path:
            "/versoes",
          icon:
            <Inventory2Outlined fontSize="small" />,
        },
      ],
      [],
    );

  /* =======================================================
     SISTEMA
  ======================================================= */

  const systemMenu =
    useMemo<MenuItemData[]>(
      () => {
        const items:
          MenuItemData[] =
          [];

        if (isAdmin) {
          items.push(
            {
              label:
                "Usuários",
              path:
                "/usuarios",
              icon:
                <ManageAccountsOutlined fontSize="small" />,
              badge:
                pendingUsers,
            },
            {
              label:
                "Configurações",
              path:
                "/configuracoes",
              icon:
                <SettingsOutlined fontSize="small" />,
            },
          );
        }

        items.push(
          {
            label:
              "Dados e Sincronizações",
            path:
              "/importar",
            icon:
              <UploadFileOutlined fontSize="small" />,
          },
          {
            label:
              "Sobre e Atualizações",
            path:
              "/sobre",
            icon:
              <InfoOutlined fontSize="small" />,
          },
        );

        return items;
      },
      [
        isAdmin,
        pendingUsers,
      ],
    );

  /* =======================================================
     USUÁRIO
  ======================================================= */

  const userInitials =
    useMemo(
      () =>
        getInitials(
          user?.name ??
            user?.username ??
            "Usuário",
        ),
      [
        user?.name,
        user?.username,
      ],
    );

  const userRole =
    getRoleLabel(
      user?.role,
    );

  /* =======================================================
     LOGOUT
  ======================================================= */

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    try {
      setLoggingOut(true);
      setProfileAnchor(null);

      await logout();

      navigate(
        "/login",
        {
          replace:
            true,
        },
      );
    } finally {
      setLoggingOut(false);
    }
  }

  function handleOpenProfileMenu(
    event: MouseEvent<HTMLElement>,
  ) {
    setProfileAnchor(
      event.currentTarget,
    );
  }

  function handleCloseProfileMenu() {
    setProfileAnchor(null);
  }

  function handleNavigateToProfile() {
    setProfileAnchor(null);
    navigate("/perfil");
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <>
      <Drawer
      variant="permanent"
      sx={{
        width:
          drawerWidth,

        flexShrink:
          0,

        "& .MuiDrawer-paper":
          {
            width:
              drawerWidth,

            boxSizing:
              "border-box",

            display:
              "flex",

            flexDirection:
              "column",

            backgroundColor:
              aliareColors.black,

            color:
              "#FFFFFF",

            borderRight:
              `1px solid ${aliareColors.graphiteSoft}`,

            overflow:
              "hidden",
          },
      }}
    >
      {/* ===================================================
          CONTEÚDO ROLÁVEL
      =================================================== */}

      <Box
        sx={{
          flex:
            1,

          minHeight:
            0,

          overflowY:
            "auto",

          overflowX:
            "hidden",

          scrollbarWidth:
            "thin",

          scrollbarColor:
            "rgba(255,255,255,0.16) transparent",

          "&::-webkit-scrollbar":
            {
              width:
                6,
            },

          "&::-webkit-scrollbar-track":
            {
              background:
                "transparent",
            },

          "&::-webkit-scrollbar-thumb":
            {
              backgroundColor:
                "rgba(255,255,255,0.14)",

              borderRadius:
                99,
            },

          "&::-webkit-scrollbar-thumb:hover":
            {
              backgroundColor:
                "rgba(255,255,255,0.24)",
            },
        }}
      >
        {/* =================================================
            IDENTIDADE
        ================================================= */}

        <Box
          sx={{
            px:
              2.25,

            pt:
              2.25,

            pb:
              1.75,
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
              aria-hidden
              sx={{
                width:
                  10,

                height:
                  10,

                borderRadius:
                  "2px",

                backgroundColor:
                  aliareColors.green,

                transform:
                  "rotate(-6deg)",

                flexShrink:
                  0,
              }}
            />

            <Typography
              sx={{
                fontSize:
                  "0.76rem",

                fontWeight:
                  800,

                letterSpacing:
                  "0.12em",

                textTransform:
                  "uppercase",

                color:
                  "rgba(255,255,255,0.72)",
              }}
            >
              aliare
            </Typography>
          </Stack>

          <Box
            sx={{
              mt:
                1.4,

              p:
                1.35,

              borderRadius:
                1.6,

              backgroundColor:
                aliareColors.graphite,

              border:
                "1px solid rgba(255,255,255,0.07)",

              position:
                "relative",

              overflow:
                "hidden",

              "&::before":
                {
                  content:
                    '""',

                  position:
                    "absolute",

                  top:
                    0,

                  left:
                    0,

                  width:
                    3,

                  height:
                    "100%",

                  backgroundColor:
                    aliareColors.green,
                },
            }}
          >
            <Typography
              sx={{
                fontSize:
                  "0.67rem",

                fontWeight:
                  800,

                letterSpacing:
                  "0.08em",

                textTransform:
                  "uppercase",

                color:
                  aliareColors.green,
              }}
            >
              Suporte e Sustentação
            </Typography>

            <Typography
              sx={{
                mt:
                  0.65,

                fontSize:
                  "0.78rem",

                fontWeight:
                  650,

                color:
                  "rgba(255,255,255,0.90)",
              }}
            >
              Produto · SIMER
            </Typography>

            <Typography
              variant="caption"
              sx={{
                display:
                  "block",

                mt:
                  0.25,

                color:
                  "rgba(255,255,255,0.42)",

                fontSize:
                  "0.66rem",
              }}
            >
              Inteligência da operação
            </Typography>
          </Box>
        </Box>

        {/* =================================================
            OPERAÇÃO
        ================================================= */}

        <MenuSection
          title="Operação"
          ariaLabel="Navegação da operação"
          items={mainMenu}
        />

        <MenuDivider />

        {/* =================================================
            DESENVOLVIMENTO
        ================================================= */}

        <MenuSection
          title="Desenvolvimento"
          ariaLabel="Navegação de desenvolvimento"
          items={developmentMenu}
        />

        <MenuDivider />

        {/* =================================================
            SISTEMA
        ================================================= */}

        <MenuSection
          title="Sistema"
          ariaLabel="Navegação do sistema"
          items={systemMenu}
        />

        <Box
          sx={{
            height:
              20,
          }}
        />
      </Box>

      {/* ===================================================
          RODAPÉ FIXO
      =================================================== */}

      <Box
        sx={{
          flexShrink:
            0,

          backgroundColor:
            aliareColors.black,

          borderTop:
            "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Box
          sx={{
            px:
              2.25,

            pt:
              0.6,

            pb:
              1.45,
          }}
        >
          <Stack
            direction="row"
            sx={{
              alignItems:
                "center",

              justifyContent:
                "space-between",

              gap:
                1,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color:
                  "rgba(255,255,255,0.30)",

                fontWeight:
                  600,

                fontSize:
                  "0.63rem",
              }}
            >
              TechLead Hub
            </Typography>

            <Typography
              variant="caption"
              sx={{
                color:
                  "rgba(255,255,255,0.28)",

                fontSize:
                  "0.62rem",

                fontVariantNumeric:
                  "tabular-nums",
              }}
            >
              {appVersion}
            </Typography>
          </Stack>
        </Box>
      </Box>
      </Drawer>

      {user && (
        <Box
          sx={{
            position: "fixed",
            top: 14,
            right: 20,
            zIndex: (theme) =>
              theme.zIndex.drawer + 1,
          }}
        >
          <Button
            id="profile-menu-button"
            aria-controls={
              profileMenuOpen
                ? "profile-menu"
                : undefined
            }
            aria-haspopup="true"
            aria-expanded={
              profileMenuOpen
                ? "true"
                : undefined
            }
            onClick={handleOpenProfileMenu}
            endIcon={
              <ExpandMoreRounded
                sx={{
                  transform: profileMenuOpen
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                  transition: "transform 0.18s ease",
                }}
              />
            }
            sx={{
              minHeight: 46,
              px: 1,
              py: 0.55,
              borderRadius: 2,
              border: "1px solid",
              borderColor: profileMenuOpen
                ? "rgba(24,199,122,0.38)"
                : "divider",
              backgroundColor: "background.paper",
              boxShadow: profileMenuOpen
                ? "0 8px 28px rgba(0,0,0,0.12)"
                : "0 2px 10px rgba(0,0,0,0.06)",
              color: "text.primary",
              textTransform: "none",
              "&:hover": {
                backgroundColor: "background.paper",
                borderColor: "rgba(24,199,122,0.38)",
                boxShadow: "0 8px 28px rgba(0,0,0,0.10)",
              },
              "& .MuiButton-endIcon": {
                ml: 0.5,
              },
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center" }}
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  backgroundColor: aliareColors.green,
                  color: aliareColors.black,
                }}
              >
                {userInitials}
              </Avatar>

              <Box
                sx={{
                  minWidth: 0,
                  maxWidth: 160,
                  textAlign: "left",
                  display: {
                    xs: "none",
                    sm: "block",
                  },
                }}
              >
                <Typography
                  title={user.name}
                  sx={{
                    fontSize: "0.78rem",
                    fontWeight: 750,
                    lineHeight: 1.2,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {user.name}
                </Typography>

                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    mt: 0.15,
                    color: "text.secondary",
                    fontSize: "0.64rem",
                    lineHeight: 1.2,
                  }}
                >
                  {userRole}
                </Typography>
              </Box>
            </Stack>
          </Button>

          <Menu
            id="profile-menu"
            anchorEl={profileAnchor}
            open={profileMenuOpen}
            onClose={handleCloseProfileMenu}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "right",
            }}
            transformOrigin={{
              vertical: "top",
              horizontal: "right",
            }}
            slotProps={{
              list: {
                "aria-labelledby": "profile-menu-button",
                sx: { py: 0.75 },
              },
              paper: {
                elevation: 0,
                sx: {
                  mt: 0.8,
                  minWidth: 210,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  boxShadow: "0 12px 34px rgba(0,0,0,0.14)",
                },
              },
            }}
          >
            <Box sx={{ px: 1.5, py: 0.9 }}>
              <Typography
                sx={{
                  fontSize: "0.76rem",
                  fontWeight: 750,
                }}
              >
                {user.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.65rem" }}
              >
                {userRole}
              </Typography>
            </Box>

            <Divider />

            <MuiMenuItem
              onClick={handleNavigateToProfile}
              sx={{
                mx: 0.75,
                mt: 0.65,
                minHeight: 38,
                borderRadius: 1.2,
                fontSize: "0.78rem",
                fontWeight: 600,
                gap: 1.1,
              }}
            >
              <PersonOutlined sx={{ fontSize: 18 }} />
              Meu Perfil
            </MuiMenuItem>

            <MuiMenuItem
              disabled={loggingOut}
              onClick={() => void handleLogout()}
              sx={{
                mx: 0.75,
                mb: 0.15,
                minHeight: 38,
                borderRadius: 1.2,
                fontSize: "0.78rem",
                fontWeight: 600,
                gap: 1.1,
                color: "text.secondary",
              }}
            >
              {loggingOut ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <LogoutOutlined sx={{ fontSize: 18 }} />
              )}
              {loggingOut ? "Saindo..." : "Sair"}
            </MuiMenuItem>
          </Menu>
        </Box>
      )}
    </>
  );
}

/* =========================================================
   SEÇÃO DE MENU
========================================================= */

function MenuSection({
  title,
  ariaLabel,
  items,
}: {
  title: string;
  ariaLabel: string;
  items: MenuItemData[];
}) {
  if (
    items.length === 0
  ) {
    return null;
  }

  return (
    <Box
      component="nav"
      aria-label={
        ariaLabel
      }
      sx={{
        px:
          1.1,
      }}
    >
      <MenuSectionTitle>
        {title}
      </MenuSectionTitle>

      <List
        disablePadding
        sx={{
          display:
            "flex",

          flexDirection:
            "column",

          gap:
            0.35,
        }}
      >
        {items.map(
          (item) => (
            <MenuItem
              key={
                item.path
              }
              label={
                item.label
              }
              path={
                item.path
              }
              icon={
                item.icon
              }
              badge={
                item.badge
              }
            />
          ),
        )}
      </List>
    </Box>
  );
}

/* =========================================================
   DIVISOR
========================================================= */

function MenuDivider() {
  return (
    <Divider
      sx={{
        my:
          1.45,

        mx:
          2,

        borderColor:
          "rgba(255,255,255,0.08)",
      }}
    />
  );
}

/* =========================================================
   TÍTULO DE SEÇÃO
========================================================= */

function MenuSectionTitle({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Typography
      variant="caption"
      sx={{
        display:
          "block",

        px:
          1.3,

        pb:
          0.65,

        color:
          "rgba(255,255,255,0.32)",

        fontSize:
          "0.64rem",

        fontWeight:
          800,

        textTransform:
          "uppercase",

        letterSpacing:
          "0.10em",
      }}
    >
      {children}
    </Typography>
  );
}

/* =========================================================
   ITEM DO MENU
========================================================= */

function MenuItem({
  label,
  path,
  icon,
  badge,
}: {
  label: string;
  path: string;
  icon: ReactNode;
  badge?: number;
}) {
  const hasBadge =
    typeof badge ===
      "number" &&
    badge > 0;

  return (
    <ListItemButton
      component={
        NavLink
      }
      to={path}
      end={
        path === "/"
      }
      sx={{
        position:
          "relative",

        minHeight:
          40,

        px:
          1.3,

        py:
          0.65,

        borderRadius:
          1.2,

        color:
          "rgba(255,255,255,0.66)",

        transition:
          "background-color 0.15s ease, color 0.15s ease",

        "&::before":
          {
            content:
              '""',

            position:
              "absolute",

            left:
              0,

            top:
              "50%",

            width:
              3,

            height:
              0,

            borderRadius:
              "0 3px 3px 0",

            backgroundColor:
              aliareColors.green,

            transform:
              "translateY(-50%)",

            transition:
              "height 0.16s ease",
          },

        "&:hover":
          {
            backgroundColor:
              "rgba(255,255,255,0.045)",

            color:
              "#FFFFFF",
          },

        "&.active":
          {
            backgroundColor:
              "rgba(24,199,122,0.085)",

            color:
              "#FFFFFF",
          },

        "&.active::before":
          {
            height:
              22,
          },

        "&.active .MuiListItemIcon-root":
          {
            color:
              aliareColors.green,
          },

        "&:focus-visible":
          {
            outline:
              `2px solid ${aliareColors.green}`,

            outlineOffset:
              "1px",
          },
      }}
    >
      <ListItemIcon
        sx={{
          minWidth:
            32,

          color:
            "rgba(255,255,255,0.46)",

          transition:
            "color 0.15s ease",
        }}
      >
        {hasBadge ? (
          <Badge
            badgeContent={
              badge
            }
            max={99}
            sx={{
              "& .MuiBadge-badge":
                {
                  minWidth:
                    16,

                  height:
                    16,

                  px:
                    0.45,

                  fontSize:
                    "0.58rem",

                  fontWeight:
                    800,

                  backgroundColor:
                    aliareColors.green,

                  color:
                    aliareColors.black,

                  border:
                    `2px solid ${aliareColors.black}`,
                },
            }}
          >
            {icon}
          </Badge>
        ) : (
          icon
        )}
      </ListItemIcon>

      <ListItemText
        primary={
          label
        }
        slotProps={{
          primary:
            {
              sx:
                {
                  fontSize:
                    "0.82rem",

                  fontWeight:
                    600,

                  lineHeight:
                    1.3,
                },
            },
        }}
      />

      {hasBadge && (
        <Box
          sx={{
            minWidth:
              22,

            height:
              20,

            px:
              0.65,

            borderRadius:
              99,

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            backgroundColor:
              "rgba(24,199,122,0.12)",

            border:
              "1px solid rgba(24,199,122,0.22)",
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize:
                "0.62rem",

              lineHeight:
                1,

              fontWeight:
                800,

              color:
                aliareColors.green,

              fontVariantNumeric:
                "tabular-nums",
            }}
          >
            {badge !== undefined &&
            badge > 99
              ? "99+"
              : badge}
          </Typography>
        </Box>
      )}
    </ListItemButton>
  );
}

/* =========================================================
   PERFIL
========================================================= */

function getRoleLabel(
  role:
    UserRole |
    undefined,
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

  if (
    role ===
    "ANALISTA"
  ) {
    return "Analista";
  }

  return "Usuário";
}

/* =========================================================
   INICIAIS
========================================================= */

function getInitials(
  name: string,
) {
  const parts =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (
    parts.length === 0
  ) {
    return "U";
  }

  if (
    parts.length === 1
  ) {
    return parts[0]
      .slice(
        0,
        2,
      )
      .toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`
    .toUpperCase();
}
