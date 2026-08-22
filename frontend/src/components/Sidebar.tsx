import {
  Box,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";

import { NavLink } from "react-router-dom";

export const drawerWidth = 240;

export function Sidebar() {
  const mainMenu = [
    {
      label: "Dashboard",
      path: "/",
    },
    {
      label: "Tickets",
      path: "/tickets",
    },
    {
      label: "Analistas",
      path: "/analistas",
    },
    {
      label: "Clientes",
      path: "/clientes",
    },
    {
      label: "Pontos de Atenção",
      path: "/atencao",
    },
  ];

  const administrationMenu = [
    {
      label: "Importar Dados",
      path: "/importar",
    },
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,

        "& .MuiDrawer-paper": {
          width: drawerWidth,
          boxSizing: "border-box",

          backgroundColor: "#101828",
          color: "#ffffff",

          borderRight: "none",
        },
      }}
    >
      {/* =====================================================
          LOGO / IDENTIDADE
      ===================================================== */}

      <Box
        sx={{
          px: 2.5,
          py: 2.5,
        }}
      >
        <Typography
          fontWeight={800}
          sx={{
            fontSize: "1.15rem",
            lineHeight: 1.2,
          }}
        >
          TechLead Hub
        </Typography>

        <Typography
          variant="caption"
          sx={{
            display: "block",
            mt: 0.5,
            opacity: 0.6,
          }}
        >
          Support Intelligence
        </Typography>
      </Box>

      {/* =====================================================
          MENU PRINCIPAL
      ===================================================== */}

      <Box
        sx={{
          px: 1.25,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            display: "block",

            px: 1.5,
            pb: 0.75,

            opacity: 0.45,

            fontSize: "0.68rem",
            fontWeight: 700,

            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Operação
        </Typography>

        <List
          disablePadding
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
          }}
        >
          {mainMenu.map((item) => (
            <MenuItem
              key={item.path}
              label={item.label}
              path={item.path}
            />
          ))}
        </List>
      </Box>

      {/* =====================================================
          ADMINISTRAÇÃO
      ===================================================== */}

      <Divider
        sx={{
          my: 2,
          mx: 2,
          borderColor:
            "rgba(255,255,255,0.10)",
        }}
      />

      <Box
        sx={{
          px: 1.25,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            display: "block",

            px: 1.5,
            pb: 0.75,

            opacity: 0.45,

            fontSize: "0.68rem",
            fontWeight: 700,

            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Administração
        </Typography>

        <List
          disablePadding
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
          }}
        >
          {administrationMenu.map(
            (item) => (
              <MenuItem
                key={item.path}
                label={item.label}
                path={item.path}
              />
            )
          )}
        </List>
      </Box>

      {/* =====================================================
          RODAPÉ
      ===================================================== */}

      <Box
        sx={{
          mt: "auto",

          px: 2.5,
          py: 2,

          borderTop:
            "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            opacity: 0.45,
          }}
        >
          TechLead Hub
        </Typography>

        <Typography
          variant="caption"
          sx={{
            display: "block",
            opacity: 0.35,
            mt: 0.25,
          }}
        >
          Beta
        </Typography>
      </Box>
    </Drawer>
  );
}

/* =========================================================
   ITEM DO MENU
========================================================= */

function MenuItem({
  label,
  path,
}: {
  label: string;
  path: string;
}) {
  return (
    <ListItemButton
      component={NavLink}
      to={path}
      end={path === "/"}
      sx={{
        minHeight: 42,

        px: 1.5,
        py: 0.75,

        borderRadius: 1.5,

        color:
          "rgba(255,255,255,0.72)",

        transition:
          "background-color 0.15s ease, color 0.15s ease",

        "&:hover": {
          backgroundColor:
            "rgba(255,255,255,0.06)",

          color: "#ffffff",
        },

        "&.active": {
          backgroundColor:
            "rgba(255,255,255,0.10)",

          color: "#ffffff",
        },

        "&.active:hover": {
          backgroundColor:
            "rgba(255,255,255,0.12)",
        },
      }}
    >
      <ListItemText
        primary={label}
        slotProps={{
          primary: {
            fontSize: "0.88rem",
            fontWeight: 600,
          },
        }}
      />
    </ListItemButton>
  );
}