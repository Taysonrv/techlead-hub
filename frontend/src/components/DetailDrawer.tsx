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
            width: { xs: "100vw", sm: "min(92vw, 620px)", lg: `min(46vw, ${width}px)` },
            maxWidth: "100vw",
            bgcolor: "background.paper",
            overflowX: "hidden",
          },
        },
      }}
    >
      <Stack sx={{ height: "100%" }}>
        <Box sx={{ px: { xs: 1.75, md: 2.25 }, py: 1.5, bgcolor: "background.paper", position: "sticky", top: 0, zIndex: 2, backdropFilter: "blur(12px)" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.3, overflowWrap: "anywhere" }}>{title}</Typography>
              {subtitle ? <Box sx={{ mt: .35, color: "text.secondary" }}>{subtitle}</Box> : null}
            </Box>
            <Stack direction="row" spacing={.5} sx={{ flexShrink: 0 }}>
              {actions}
              <IconButton aria-label="Fechar painel" onClick={onClose}><CloseOutlined /></IconButton>
            </Stack>
          </Stack>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: { xs: 1.75, md: 2.25 }, py: 1.75 }}>
          {children}
        </Box>
      </Stack>
    </Drawer>
  );
}
