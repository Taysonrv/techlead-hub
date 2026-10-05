import type { ReactNode } from "react";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { Box, Divider, Drawer, IconButton, Stack, Typography } from "@mui/material";

type DetailDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  width?: number;
};

export function DetailDrawer({ open, onClose, title, subtitle, children, actions, width = 680 }: DetailDrawerProps) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: "100%", sm: "min(92vw, 620px)", lg: `min(46vw, ${width}px)` },
            maxWidth: "100vw",
            bgcolor: "background.default",
          },
        },
      }}
    >
      <Stack sx={{ height: "100%" }}>
        <Box sx={{ px: { xs: 2, md: 2.5 }, py: 1.75, bgcolor: "background.paper" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" noWrap sx={{ fontWeight: 800 }}>{title}</Typography>
              {subtitle ? <Box sx={{ mt: .35, color: "text.secondary" }}>{subtitle}</Box> : null}
            </Box>
            <Stack direction="row" spacing={.5}>
              {actions}
              <IconButton aria-label="Fechar painel" onClick={onClose}><CloseOutlined /></IconButton>
            </Stack>
          </Stack>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: { xs: 2, md: 2.5 }, py: 2 }}>
          {children}
        </Box>
      </Stack>
    </Drawer>
  );
}
