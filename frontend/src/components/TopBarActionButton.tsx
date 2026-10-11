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
          width: 46,
          height: 46,
          flexShrink: 0,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: active ? "rgba(24,199,122,.55)" : "divider",
          borderRadius: 2,
          boxShadow: "0 2px 10px rgba(0,0,0,.06)",
          color: active ? aliareColors.green : "text.primary",
          "&:hover": { bgcolor: "background.paper", borderColor: "rgba(24,199,122,.45)" },
          "&.Mui-focusVisible": { outline: `2px solid ${aliareColors.green}`, outlineOffset: 2 },
          "& .MuiSvgIcon-root": { fontSize: 24 },
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
