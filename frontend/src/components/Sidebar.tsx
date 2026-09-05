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
  Stack,
  Typography,
} from "@mui/material";

import {
  BusinessOutlined,
  ConfirmationNumberOutlined,
  DashboardOutlined,
  GroupsOutlined,
  InfoOutlined,
  LogoutOutlined,
  ManageAccountsOutlined,
  PersonOutlined,
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

export const drawerWidth =
  248;

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
    useState(
      "Beta"
    );

  const [
    loggingOut,
    setLoggingOut,
  ] =
    useState(
      false
    );

  const [
    pendingUsers,
    setPendingUsers,
  ] =
    useState(0);

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
            `v${version}`
          );
        }
      } catch (
        error
      ) {
        console.error(
          "Erro ao carregar versão do aplicativo:",
          error
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
     PENDÊNCIAS DE USUÁRIOS

     Executado somente para administradores.
  ======================================================= */

  const loadPendingUsers =
    useCallback(
      async () => {
        if (!isAdmin) {
          setPendingUsers(
            0
          );

          return;
        }

        try {
          const response =
            await api.get<PendingUsersResponse>(
              "/users/pending"
            );

          setPendingUsers(
            response.data.users.length
          );
        } catch (
          error
        ) {
          /*
           * Falha no contador não deve impedir
           * o uso normal da aplicação.
           */
          console.warn(
            "[sidebar] Não foi possível carregar usuários pendentes:",
            error
          );
        }
      },
      [
        isAdmin,
      ]
    );

  useEffect(() => {
    void loadPendingUsers();
  }, [
    loadPendingUsers,
  ]);

  /*
   * Ao navegar para a administração de usuários,
   * atualiza novamente o contador.
   *
   * Isso permite refletir aprovações/rejeições
   * sem implementar polling periódico.
   */
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
     MENU PRINCIPAL
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
      []
    );

  /* =======================================================
     ADMINISTRAÇÃO
  ======================================================= */

  const administrationMenu =
    useMemo<MenuItemData[]>(
      () => {
        const items:
          MenuItemData[] =
          [];

        /*
         * Administração de usuários é exclusiva
         * para perfil ADMIN.
         */
        if (isAdmin) {
          items.push({
            label:
              "Usuários",

            path:
              "/usuarios",

            icon:
              <ManageAccountsOutlined fontSize="small" />,

            badge:
              pendingUsers,
          });
        }

        items.push(
          {
            label:
              "Importar Dados",

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
          }
        );

        return items;
      },
      [
        isAdmin,
        pendingUsers,
      ]
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
            "Usuário"
        ),
      [
        user?.name,
        user?.username,
      ]
    );

  const userRole =
    getRoleLabel(
      user?.role
    );

  /* =======================================================
     LOGOUT
  ======================================================= */

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    try {
      setLoggingOut(
        true
      );

      await logout();

      navigate(
        "/login",
        {
          replace:
            true,
        }
      );
    } finally {
      setLoggingOut(
        false
      );
    }
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
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

            overflowX:
              "hidden",
          },
      }}
    >
      {/* ===================================================
          IDENTIDADE
      =================================================== */}

      <Box
        sx={{
          px: 2.25,
          pt: 2.25,
          pb: 1.75,
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
              width: 10,
              height: 10,

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

        <Typography
          sx={{
            mt: 1.4,

            fontSize:
              "1.28rem",

            fontWeight:
              800,

            lineHeight:
              1.15,

            letterSpacing:
              "-0.025em",

            color:
              "#FFFFFF",
          }}
        >
          TechLead Hub
        </Typography>

        <Typography
          variant="caption"
          sx={{
            display:
              "block",

            mt: 0.4,

            color:
              "rgba(255,255,255,0.50)",
          }}
        >
          Support Intelligence
        </Typography>

        {/* CONTEXTO */}

        <Box
          sx={{
            mt: 2,

            p: 1.35,

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

            "&::before": {
              content:
                '""',

              position:
                "absolute",

              top: 0,
              left: 0,

              width: 3,

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
              mt: 0.65,

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

              mt: 0.25,

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

      {/* ===================================================
          OPERAÇÃO
      =================================================== */}

      <Box
        component="nav"
        aria-label="Navegação principal"
        sx={{
          px: 1.1,
        }}
      >
        <MenuSectionTitle>
          Operação
        </MenuSectionTitle>

        <List
          disablePadding
          sx={{
            display:
              "flex",

            flexDirection:
              "column",

            gap: 0.35,
          }}
        >
          {mainMenu.map(
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
            )
          )}
        </List>
      </Box>

      <Divider
        sx={{
          my: 1.7,
          mx: 2,

          borderColor:
            "rgba(255,255,255,0.08)",
        }}
      />

      {/* ===================================================
          ADMINISTRAÇÃO
      =================================================== */}

      <Box
        component="nav"
        aria-label="Administração"
        sx={{
          px: 1.1,
        }}
      >
        <MenuSectionTitle>
          Administração
        </MenuSectionTitle>

        <List
          disablePadding
          sx={{
            display:
              "flex",

            flexDirection:
              "column",

            gap: 0.35,
          }}
        >
          {administrationMenu.map(
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
            )
          )}
        </List>
      </Box>

      {/* ===================================================
          USUÁRIO / RODAPÉ
      =================================================== */}

      <Box
        sx={{
          mt:
            "auto",

          borderTop:
            "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {user && (
          <Box
            sx={{
              px: 1.25,
              pt: 1.25,
              pb: 0.85,
            }}
          >
            <Box
              sx={{
                p: 1.15,

                borderRadius:
                  1.6,

                backgroundColor:
                  aliareColors.graphite,

                border:
                  "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems:
                    "center",

                  minWidth:
                    0,
                }}
              >
                <Avatar
                  sx={{
                    width: 34,
                    height: 34,

                    fontSize:
                      "0.74rem",

                    fontWeight:
                      800,

                    flexShrink:
                      0,

                    backgroundColor:
                      aliareColors.green,

                    color:
                      aliareColors.black,
                  }}
                >
                  {userInitials}
                </Avatar>

                <Box
                  sx={{
                    minWidth:
                      0,

                    flex:
                      1,
                  }}
                >
                  <Typography
                    title={
                      user.name
                    }
                    sx={{
                      fontSize:
                        "0.78rem",

                      fontWeight:
                        700,

                      color:
                        "#FFFFFF",

                      overflow:
                        "hidden",

                      whiteSpace:
                        "nowrap",

                      textOverflow:
                        "ellipsis",
                    }}
                  >
                    {user.name}
                  </Typography>

                  <Typography
                    variant="caption"
                    sx={{
                      display:
                        "block",

                      mt: 0.05,

                      color:
                        "rgba(255,255,255,0.46)",

                      fontSize:
                        "0.65rem",
                    }}
                  >
                    {userRole}
                  </Typography>
                </Box>
              </Stack>

              {/* PERFIL */}

              <ListItemButton
                component={
                  NavLink
                }
                to="/perfil"
                sx={{
                  mt: 0.9,

                  minHeight:
                    34,

                  px: 0.9,
                  py: 0.35,

                  borderRadius:
                    1.2,

                  color:
                    "rgba(255,255,255,0.64)",

                  "&:hover": {
                    backgroundColor:
                      "rgba(255,255,255,0.055)",

                    color:
                      "#FFFFFF",
                  },

                  "&.active": {
                    backgroundColor:
                      "rgba(24,199,122,0.12)",

                    color:
                      aliareColors.green,
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth:
                      28,

                    color:
                      "inherit",
                  }}
                >
                  <PersonOutlined
                    sx={{
                      fontSize:
                        17,
                    }}
                  />
                </ListItemIcon>

                <ListItemText
                  primary="Meu Perfil"
                  slotProps={{
                    primary: {
                      sx: {
                        fontSize:
                          "0.74rem",

                        fontWeight:
                          600,
                      },
                    },
                  }}
                />
              </ListItemButton>

              {/* LOGOUT */}

              <Button
                fullWidth
                size="small"
                disabled={
                  loggingOut
                }
                onClick={() =>
                  void handleLogout()
                }
                startIcon={
                  loggingOut ? (
                    <CircularProgress
                      size={13}
                      sx={{
                        color:
                          "inherit",
                      }}
                    />
                  ) : (
                    <LogoutOutlined
                      sx={{
                        fontSize:
                          17,
                      }}
                    />
                  )
                }
                sx={{
                  mt: 0.35,

                  minHeight:
                    32,

                  justifyContent:
                    "flex-start",

                  px: 0.9,

                  borderRadius:
                    1.2,

                  textTransform:
                    "none",

                  fontSize:
                    "0.74rem",

                  fontWeight:
                    600,

                  color:
                    "rgba(255,255,255,0.52)",

                  "&:hover": {
                    backgroundColor:
                      "rgba(255,255,255,0.055)",

                    color:
                      "#FFFFFF",
                  },

                  "&.Mui-disabled":
                    {
                      color:
                        "rgba(255,255,255,0.30)",
                    },
                }}
              >
                {loggingOut
                  ? "Saindo..."
                  : "Sair"}
              </Button>
            </Box>
          </Box>
        )}

        {/* VERSÃO */}

        <Box
          sx={{
            px: 2.25,
            pt: 0.6,
            pb: 1.45,
          }}
        >
          <Stack
            direction="row"
            sx={{
              alignItems:
                "center",

              justifyContent:
                "space-between",

              gap: 1,
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

        px: 1.3,
        pb: 0.65,

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

        px: 1.3,
        py: 0.65,

        borderRadius:
          1.2,

        color:
          "rgba(255,255,255,0.66)",

        transition:
          "background-color 0.15s ease, color 0.15s ease",

        "&::before": {
          content:
            '""',

          position:
            "absolute",

          left: 0,

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

        "&:hover": {
          backgroundColor:
            "rgba(255,255,255,0.045)",

          color:
            "#FFFFFF",
        },

        "&.active": {
          backgroundColor:
            "rgba(24,199,122,0.085)",

          color:
            "#FFFFFF",
        },

        "&.active::before": {
          height:
            22,
        },

        "&.active .MuiListItemIcon-root":
          {
            color:
              aliareColors.green,
          },

        "&:focus-visible": {
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
        {badge &&
        badge > 0 ? (
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
          primary: {
            sx: {
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

      {badge &&
      badge > 0 ? (
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
            {badge > 99
              ? "99+"
              : badge}
          </Typography>
        </Box>
      ) : null}
    </ListItemButton>
  );
}

/* =========================================================
   PERFIL
========================================================= */

function getRoleLabel(
  role:
    UserRole | undefined
) {
  if (
    role === "ADMIN"
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
  name: string
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
      .slice(0, 2)
      .toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`
    .toUpperCase();
}