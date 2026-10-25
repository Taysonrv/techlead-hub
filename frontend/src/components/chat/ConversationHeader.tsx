import { Circle, GroupsOutlined, InfoOutlined, MoreHorizOutlined, SearchOutlined } from "@mui/icons-material";
import { Box, Button, Chip, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import type { Channel, Presence } from "./chatTypes";

type Props = {
  selected: Channel | null | undefined;
  selectedPresence: Presence | null | undefined;
  presence: Presence[];
  messageSearch: string;
  onMessageSearch: (value: string) => void;
  onOpenActions: () => void;
  onSearchHistory: () => void;
  onOpenOrigin: (contextType: string | null | undefined, contextId: string) => void;
  teamPanelOpen: boolean;
  onToggleTeamPanel: () => void;
  conversationInfoOpen: boolean;
  onToggleConversationInfo: () => void;
  onOpenMenu: (anchor: HTMLElement) => void;
};

export function ConversationHeader({ selected, selectedPresence, presence, messageSearch, onMessageSearch, onOpenActions, onSearchHistory, onOpenOrigin, teamPanelOpen, onToggleTeamPanel, conversationInfoOpen, onToggleConversationInfo, onOpenMenu }: Props) {
  return (
        <Stack direction="row" spacing={1} sx={{ px: { xs: 1, md: 1.75 }, py: 1, minHeight: 64, alignItems: "center", justifyContent: "space-between", gap: 1, bgcolor: "background.paper" }}><Box sx={{ minWidth: 0, flex: 1 }}><Stack direction="row" spacing={.7} sx={{ alignItems: "center" }}><Typography noWrap sx={{ fontWeight: 850, fontSize: { xs: ".95rem", md: "1.05rem" }, letterSpacing: "-.015em", maxWidth: { xs: 180, md: 320 } }}>{selected?.name || "Selecione uma conversa"}</Typography>{selected?.type === "CONTEXT" && <Chip size="small" color="primary" variant="outlined" label={`Sala · ${selected.contextType === "TICKET" ? "Movidesk" : "Azure"} #${selected.contextId}`} />}{selected && <Chip size="small" icon={<Circle sx={{ fontSize: "9px !important" }} />} label={selected?.type === "DIRECT" ? ({ ONLINE: "Online", AWAY: "Ausente", BUSY: "Ocupado", OFFLINE: "Offline" }[selectedPresence?.effectiveStatus ?? "OFFLINE"]) : `${selected.members?.filter((member) => presence.find((item) => item.userId === member.user.id)?.effectiveStatus !== "OFFLINE").length ?? 0} online`} color={selectedPresence?.effectiveStatus === "BUSY" ? "error" : selectedPresence?.effectiveStatus === "AWAY" ? "warning" : selectedPresence?.effectiveStatus === "ONLINE" ? "success" : "default"} variant="outlined" />}</Stack><Typography variant="caption" color="text.secondary">{selectedPresence?.statusMessage || (selected?.type === "CONTEXT" ? `Sala de incidente${selected.clientName ? ` · ${selected.clientName}` : ""}` : "Mensagens instantâneas · tempo real")}</Typography></Box><Stack direction="row" spacing={.5} sx={{ alignItems: "center", flexShrink: 0 }}>{selected?.type === "CONTEXT" && <Button size="small" variant="contained" sx={{ display: { xs: "none", xl: "inline-flex" } }} onClick={() => onOpenActions()}>Decisões e ações</Button>}{selected && <Tooltip title="Pesquisar todo o histórico"><IconButton size="small" aria-label="Pesquisar todo o histórico" onClick={() => onSearchHistory()}><SearchOutlined /></IconButton></Tooltip>}{selected?.type === "CONTEXT" && selected.contextId && <Button size="small" variant="outlined" sx={{ display: { xs: "none", xl: "inline-flex" } }} onClick={() => onOpenOrigin(selected.contextType, selected.contextId!)}>Abrir origem</Button>}<TextField size="small" value={messageSearch} onChange={(event) => onMessageSearch(event.target.value)} placeholder="Buscar na conversa" sx={{ display: { xs: "none", lg: "block" }, width: { lg: 170, xl: 210 }, "& .MuiOutlinedInput-root": { borderRadius: 2.4 } }} slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: .5, fontSize: 17, color: "text.secondary" }} /> } }} />{selected?.type === "TEAM" && <Tooltip title={teamPanelOpen ? "Ocultar painel operacional" : "Abrir painel operacional"}><IconButton size="small" aria-label={teamPanelOpen ? "Ocultar painel operacional" : "Abrir painel operacional"} color={teamPanelOpen ? "primary" : "default"} onClick={() => onToggleTeamPanel()}><GroupsOutlined /></IconButton></Tooltip>}<Tooltip title="Informações da conversa"><span><IconButton size="small" disabled={!selected} aria-label="Informações da conversa" onClick={() => onToggleConversationInfo()} color={conversationInfoOpen ? "primary" : "default"}><InfoOutlined /></IconButton></span></Tooltip><IconButton size="small" aria-label="Opções da conversa" onClick={(event) => onOpenMenu(event.currentTarget)}><MoreHorizOutlined /></IconButton></Stack></Stack>

  );
}
