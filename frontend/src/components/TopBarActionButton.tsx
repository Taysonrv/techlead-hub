import { IconButton, type IconButtonProps } from "@mui/material";
import { aliareColors } from "../theme/theme";

type Props = IconButtonProps & { active?: boolean };

/** Common frame for theme, calendar, chat and notifications. */
export function TopBarActionButton({ active = false, sx, children, ...props }: Props) {
  return (
    <IconButton
      {...props}
      data-topbar-action
      sx={[
        {
          width: 44,
          height: 44,
          flexShrink: 0,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: active ? "rgba(24,199,122,.42)" : "rgba(127,148,170,.22)",
          borderRadius: 1.7,
          boxShadow: "0 1px 4px rgba(0,0,0,.035)",
          color: active ? aliareColors.green : "text.primary",
          transition: "background-color .14s ease, border-color .14s ease, color .14s ease",
          "&:hover": { bgcolor: "action.hover", borderColor: "rgba(24,199,122,.36)" },
          "&.Mui-focusVisible": { outline: `2px solid ${aliareColors.green}`, outlineOffset: 2 },
          "& .MuiSvgIcon-root": { fontSize: 21, opacity: .88 },
          "& .MuiBadge-standard": { fontSize: ".62rem", minWidth: 18, height: 18, fontWeight: 900 },
          "& .MuiBadge-badge": { boxShadow: (theme) => `0 0 0 2px ${theme.palette.background.paper}` },
        },
        ...(sx ? Array.isArray(sx) ? sx : [sx] : []),
      ]}
    >
      {children}
    </IconButton>
  );
}
