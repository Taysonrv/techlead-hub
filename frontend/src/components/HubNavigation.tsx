import { Box, Tab, Tabs, Typography, useTheme } from "@mui/material";
import type { ReactElement } from "react";

export type HubNavigationItem<T extends string = string> = {
  value: T;
  label: string;
  icon?: ReactElement;
};

type HubNavigationProps<T extends string = string> = {
  value: T;
  items: HubNavigationItem<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  caption?: string;
};

export function HubNavigation<T extends string>({
  value,
  items,
  onChange,
  ariaLabel = "Navegação do módulo",
  caption,
}: HubNavigationProps<T>) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  return (
    <Box
      component="nav"
      aria-label={ariaLabel}
      sx={{
        mb: { xs: 1.5, md: 2 },
        p: 0.5,
        minWidth: 0,
        border: "1px solid",
        borderColor: dark ? "rgba(116,166,216,.18)" : "rgba(15,23,42,.08)",
        borderRadius: 2.5,
        background: dark
          ? "linear-gradient(145deg, rgba(8,29,43,.88), rgba(7,22,35,.76))"
          : "linear-gradient(180deg, rgba(255,255,255,.94), rgba(248,250,252,.92))",
        boxShadow: dark
          ? "0 10px 28px rgba(0,0,0,.12), inset 0 1px rgba(255,255,255,.025)"
          : "0 6px 20px rgba(15,23,42,.035)",
        backdropFilter: "blur(14px)",
      }}
    >
      {caption ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: { xs: "none", md: "block" },
            px: 1,
            pt: 0.35,
            pb: 0.25,
            fontWeight: 700,
            letterSpacing: ".035em",
          }}
        >
          {caption}
        </Typography>
      ) : null}

      <Tabs
        value={value}
        onChange={(_, nextValue: T) => onChange(nextValue)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          minHeight: 42,
          "& .MuiTabs-flexContainer": {
            gap: 0.4,
          },
          "& .MuiTabs-indicator": {
            display: "none",
          },
          "& .MuiTab-root": {
            minHeight: 40,
            minWidth: "auto",
            px: { xs: 1.15, sm: 1.5 },
            py: 0.7,
            borderRadius: 2,
            color: "text.secondary",
            fontSize: ".82rem",
            fontWeight: 760,
            textTransform: "none",
            transition:
              "background-color .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease",
            "&:hover": {
              color: "text.primary",
              backgroundColor: "action.hover",
            },
            "&.Mui-selected": {
              color: dark ? "#5BE7AD" : "primary.dark",
              backgroundColor: dark
                ? "rgba(24,199,122,.12)"
                : "rgba(24,199,122,.09)",
              boxShadow: dark
                ? "inset 0 0 0 1px rgba(24,199,122,.16), 0 8px 20px rgba(0,0,0,.08)"
                : "inset 0 0 0 1px rgba(16,148,91,.10)",
            },
          },
          "& .MuiTab-iconWrapper": {
            mr: 0.7,
          },
        }}
      >
        {items.map((item) => (
          <Tab
            key={item.value}
            value={item.value}
            label={item.label}
            icon={item.icon}
            iconPosition={item.icon ? "start" : undefined}
          />
        ))}
      </Tabs>
    </Box>
  );
}
