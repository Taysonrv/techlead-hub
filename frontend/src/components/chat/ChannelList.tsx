import { Box, Chip, IconButton, List, ListItemButton, ListItemText, Stack, Tooltip, Typography } from "@mui/material";
import { Circle, GroupsOutlined, PersonOutlineRounded, ReportProblemOutlined } from "@mui/icons-material";
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

export function ChannelList({ channels, selectedId, favorites, presence, remoteTyping, currentUserId, onSelect, onToggleFavorite }: Props) {
  const groupOf = (channel: Channel) => favorites.includes(channel.id) ? "Favoritos" : channel.type === "CONTEXT" ? "Incidentes ativos" : channel.type === "DIRECT" ? "Conversas diretas" : "Equipes";
  const groupOrder = ["Incidentes ativos", "Favoritos", "Equipes", "Conversas diretas"];
  const groupedChannels = [...channels].sort((a, b) => groupOrder.indexOf(groupOf(a)) - groupOrder.indexOf(groupOf(b)));
  return (
        <List disablePadding sx={{ width: "100%", py: .35 }}>
          {groupedChannels.map((channel, index) => {
            const group = groupOf(channel);
            const previousChannel = groupedChannels[index - 1];
            const previousGroup = previousChannel ? groupOf(previousChannel) : null;
            return <Box key={channel.id}>
              {group !== previousGroup && <Typography variant="overline" sx={{ display: "block", px: 1.35, pt: index ? .9 : .7, pb: .2, fontSize: ".61rem", lineHeight: 1.4, letterSpacing: ".09em", fontWeight: 900, color: "text.secondary" }}>{group}</Typography>}
              
              <ListItemButton
                key={channel.id}
                selected={channel.id === selectedId}
                aria-label={`Abrir conversa ${channel.name}${channel.unread ? `, ${channel.unread} não lidas` : ""}`}
                onClick={() => onSelect(channel.id)}
                sx={{
                  py: .58,
                  px: 1,
                  mx: .7,
                  my: .28,
                  minHeight: 52,
                  borderRadius: 2.5,
                  border: "1px solid transparent",
                  transition: (theme) => theme.transitions.create(["background-color", "border-color"], { duration: theme.transitions.duration.shorter }),
                  "&:hover": { bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,.035)" : "rgba(15,23,42,.035)", borderColor: (theme) => theme.palette.mode === "dark" ? "rgba(148,163,184,.10)" : "rgba(148,163,184,.16)" },
                  "&.Mui-selected": { bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(39,57,72,.88)" : "rgba(239,247,244,.96)", borderColor: (theme) => theme.palette.mode === "dark" ? "rgba(24,199,122,.18)" : "rgba(24,199,122,.16)", boxShadow: "inset 3px 0 0 rgba(24,199,122,.78), 0 8px 22px rgba(15,23,42,.055)" },
                  "&.Mui-selected:hover": { bgcolor: "action.selected" },
                }}
              >
                <Box sx={{ position: "relative", mr: 1.1, width: 32, height: 32, minWidth: 32, flex: "0 0 32px", borderRadius: "50%", bgcolor: channel.id === selectedId ? (theme) => theme.palette.mode === "dark" ? "rgba(24,199,122,.14)" : "rgba(24,199,122,.09)" : "action.hover", display: "grid", placeItems: "center", fontWeight: 900, color: channel.id === selectedId ? "primary.main" : "text.primary", border: "1px solid", borderColor: channel.id === selectedId ? "rgba(24,199,122,.32)" : "divider", boxShadow: "none" }}>
                  {channel.name.slice(0,1).toUpperCase()}
                  <Circle sx={{ position: "absolute", width: 11, height: 11, right: 0, bottom: 0, color: channel.type === "DIRECT" ? presenceColor(presence.find((item) => channel.members?.some((member) => member.user.id === item.userId && member.user.id !== currentUserId))?.effectiveStatus) : channel.members?.some((member) => presence.find((item) => item.userId === member.user.id)?.effectiveStatus === "ONLINE") ? "success.main" : "text.disabled", stroke: "background.paper", strokeWidth: 4 }} />
                </Box>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={.5} sx={{ alignItems: "center", minWidth: 0 }}>
                      <Box sx={{ color: "text.secondary", display: "flex", alignItems: "center" }}>{channel.type === "DIRECT" ? <PersonOutlineRounded sx={{ fontSize: 14 }} /> : channel.type === "CONTEXT" ? <ReportProblemOutlined sx={{ fontSize: 14 }} /> : <GroupsOutlined sx={{ fontSize: 14 }} />}</Box><Typography noWrap sx={{ fontWeight: channel.unread ? 900 : 780, fontSize: ".84rem", lineHeight: 1.2, letterSpacing: "-.01em", flex: 1 }}>{channel.name}</Typography>
                      {favorites.includes(channel.id) && <Typography component="span" sx={{ color: "warning.main", fontSize: ".72rem" }}>★</Typography>}
                    </Stack>
                  }
                  secondary={(() => {
                    const typing = remoteTyping.find((item) => item.channelId === channel.id && item.userId !== currentUserId);
                    if (typing) return `${typing.name} está digitando...`;
                    const latest = channel.messages?.[channel.messages.length - 1];
                    if (!latest) return channel.clientName || channel.description || "Sem mensagens ainda";
                    const preview = latest.kind === "ATTACHMENT" ? "📎 Enviou um arquivo" : latest.content.startsWith("[hub-card]") ? "Compartilhou um registro" : latest.content.startsWith("[anexo] ") ? "📎 Enviou um arquivo" : latest.content.replace(/\s+/g, " ");
                    return `${latest.author.id === currentUserId ? "Você: " : ""}${preview}`;
                  })()}
                  slotProps={{ secondary: { sx: { fontSize: ".69rem", mt: .28, lineHeight: 1.25, fontWeight: channel.unread ? 750 : 450, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } } }}
                />
                <Stack spacing={.15} sx={{ alignItems: "flex-end", ml: .4 }}>
                  {channel.messages?.length ? <Typography variant="caption" color="text.secondary" sx={{ fontSize: ".62rem", lineHeight: 1 }}>{new Date(channel.messages[channel.messages.length - 1].createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Typography> : null}
                  <Stack direction="row" spacing={.25} sx={{ alignItems: "center" }}>
                  <Tooltip title={favorites.includes(channel.id) ? "Remover dos favoritos" : "Favoritar"}>
                    <IconButton size="small" onClick={(event) => { event.stopPropagation(); onToggleFavorite(channel.id); }} sx={{ width: 28, height: 28, p: .5, fontSize: 16 }}>{favorites.includes(channel.id) ? "★" : "☆"}</IconButton>
                  </Tooltip>
                  {channel.unread > 0 && <Chip size="small" color="primary" label={channel.unread > 99 ? "99+" : channel.unread} sx={{ minWidth: 24, height: 20, fontWeight: 900 }} />}
                  </Stack>
                </Stack>
              </ListItemButton>
            </Box>;
          })}
        </List>

  );
}
