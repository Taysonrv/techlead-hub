import { Avatar, Badge, Box, IconButton, List, ListItemButton, Stack, Tooltip, Typography } from "@mui/material";
import { Circle, GroupsOutlined, PushPinOutlined, ReportProblemOutlined, StarRounded } from "@mui/icons-material";
import { presenceColor } from "./chatTypes";
import type { Channel, Presence, RealtimeSnapshot } from "./chatTypes";

type Props = {
  channels: Channel[];
  selectedId: number | null;
  favorites: number[];
  presence: Presence[];
  remoteTyping: RealtimeSnapshot["typing"];
  currentUserId?: number;
  onSelect: (channelId: number) => void;
  onToggleFavorite: (channelId: number) => void;
};

const groupOrder = ["Incidentes ativos", "Favoritos", "Equipes", "Conversas diretas"];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "?";
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ChannelList({ channels, selectedId, favorites, presence, remoteTyping, currentUserId, onSelect, onToggleFavorite }: Props) {
  const groupOf = (channel: Channel) => favorites.includes(channel.id) ? "Favoritos" : channel.type === "CONTEXT" ? "Incidentes ativos" : channel.type === "DIRECT" ? "Conversas diretas" : "Equipes";
  const groupedChannels = [...channels].sort((a, b) => groupOrder.indexOf(groupOf(a)) - groupOrder.indexOf(groupOf(b)));
  return (
    <List disablePadding sx={{ width: "100%", pb: 1 }}>
      {groupedChannels.map((channel, index) => {
        const group = groupOf(channel);
        const previousGroup = index ? groupOf(groupedChannels[index - 1]) : null;
        const latest = channel.messages?.[channel.messages.length - 1];
        const typing = remoteTyping.find((item) => item.channelId === channel.id && item.userId !== currentUserId);
        const peer = channel.type === "DIRECT" ? channel.members?.find((member) => member.user.id !== currentUserId)?.user : undefined;
        const peerPresence = peer ? presence.find((item) => item.userId === peer.id) : undefined;
        const isOnline = channel.type === "DIRECT" ? peerPresence?.effectiveStatus === "ONLINE" : channel.members?.some((member) => presence.find((item) => item.userId === member.user.id)?.effectiveStatus === "ONLINE");
        const preview = typing ? `${typing.name} está digitando...` : latest ? latest.kind === "ATTACHMENT" || latest.content.startsWith("[anexo] ") ? "📎 Arquivo compartilhado" : latest.content.startsWith("[hub-card]") ? "Registro compartilhado" : `${latest.author.id === currentUserId ? "Você: " : ""}${latest.content.replace(/\s+/g, " ")}` : channel.clientName || channel.description || "Comece uma conversa";
        const active = channel.id === selectedId;
        return (
          <Box key={channel.id}>
            {group !== previousGroup && <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 2.25, pt: index ? 2 : 1, pb: .6 }}>
              <Typography variant="overline" sx={{ fontSize: ".65rem", lineHeight: 1.4, letterSpacing: ".09em", fontWeight: 800, color: "text.secondary" }}>{group}</Typography>
              <Typography variant="caption" color="text.disabled">{groupedChannels.filter((item) => groupOf(item) === group).length}</Typography>
            </Stack>}
            <ListItemButton
              selected={active}
              aria-label={`Abrir conversa ${channel.name}${channel.unread ? `, ${channel.unread} não lidas` : ""}`}
              onClick={() => onSelect(channel.id)}
              sx={{
                mx: 1.25, my: .3, px: 1.25, py: 1.1, minHeight: 68, gap: 1.25, borderRadius: 3,
                transition: (theme) => theme.transitions.create(["background-color"], { duration: theme.transitions.duration.shorter }),
                "&:hover": { bgcolor: "action.hover" },
                "&.Mui-selected": { bgcolor: "action.selected" },
                "&.Mui-selected:hover": { bgcolor: "action.selected" },
              }}
            >
              <Badge overlap="circular" variant="dot" invisible={!isOnline} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                sx={{ "& .MuiBadge-badge": { bgcolor: presenceColor("ONLINE"), boxShadow: (theme) => `0 0 0 2px ${theme.palette.background.paper}`, width: 10, height: 10, borderRadius: "50%" } }}>
                <Avatar sx={{ width: 42, height: 42, fontSize: ".83rem", fontWeight: 800, bgcolor: active ? "primary.main" : "action.selected", color: active ? "primary.contrastText" : "text.primary" }}>
                  {channel.type === "DIRECT" ? initials(peer?.name || channel.name) : channel.type === "CONTEXT" ? <ReportProblemOutlined fontSize="small" /> : <GroupsOutlined fontSize="small" />}
                </Avatar>
              </Badge>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={.5} sx={{ alignItems: "center", minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: channel.unread ? 850 : 750, fontSize: ".84rem", flex: 1 }}>{channel.name}</Typography>
                  {favorites.includes(channel.id) && <StarRounded sx={{ fontSize: 14, color: "warning.main" }} />}
                  {latest && <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontSize: ".64rem" }}>{relativeTime(latest.createdAt)}</Typography>}
                </Stack>
                <Stack direction="row" spacing={.5} sx={{ alignItems: "center", mt: .35, minWidth: 0 }}>
                  <Typography noWrap variant="caption" sx={{ flex: 1, color: typing ? "primary.main" : "text.secondary", fontWeight: channel.unread || typing ? 700 : 400, fontSize: ".73rem" }}>{preview}</Typography>
                  {channel.unread > 0 && <Box component="span" sx={{ minWidth: 20, height: 20, px: .5, borderRadius: 10, display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText", fontSize: ".66rem", fontWeight: 850 }}>{channel.unread > 99 ? "99+" : channel.unread}</Box>}
                </Stack>
              </Box>
              <Tooltip title={favorites.includes(channel.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
                <IconButton size="small" aria-label={favorites.includes(channel.id) ? `Desfavoritar ${channel.name}` : `Favoritar ${channel.name}`}
                  onClick={(event) => { event.stopPropagation(); onToggleFavorite(channel.id); }}
                  sx={{ p: .4, color: favorites.includes(channel.id) ? "warning.main" : "text.disabled", opacity: { xs: 1, md: 0 }, ".MuiListItemButton-root:hover &, .MuiListItemButton-root:focus-within &": { opacity: 1 } }}>
                  <PushPinOutlined sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </ListItemButton>
          </Box>
        );
      })}
    </List>
  );
}
