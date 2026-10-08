import { AddOutlined, CalendarMonthOutlined, ChevronLeft, ChevronRight, DarkModeOutlined, DeleteOutlineOutlined, DownloadOutlined, LightModeOutlined, OpenInNewOutlined, SearchOutlined, VideoCallOutlined } from "@mui/icons-material";
import { Alert, Autocomplete, Badge, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, InputAdornment, List, ListItemButton, ListItemText, Paper, Popover, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";
import { useColorMode } from "../context/ColorModeContext";

type SearchItem = { id: string; type: string; title: string; subtitle: string; path: string };
type CalendarPerson = { id: number; name: string; username: string; email: string | null; role: string };
type CalendarMeeting = {
  id:number; title:string; description:string|null; startAt:string; endAt:string; timezone:string;
  location:string|null; meetingUrl:string|null; externalAttendees:string[]; status:string;
  createdBy:CalendarPerson; participants:CalendarPerson[]; canManage:boolean;
};
type CalendarEvent = { id: string; date: string; kind: string; title: string; subtitle: string; path: string; meeting?: CalendarMeeting };
type MeetingForm = { title:string; startAt:string; endAt:string; participantIds:number[]; externalAttendees:string; location:string; meetingUrl:string; description:string };
type Holiday = { date: string; name: string };
type DesktopUpdateState = { status: "idle" | "disabled" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error"; availableVersion: string | null; percent?: number; message?: string | null };

export function GlobalTopBar() {
  const navigate = useNavigate();
  const { mode, toggleMode } = useColorMode();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [calendarAnchor, setCalendarAnchor] = useState<HTMLElement | null>(null);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [calendarPortal, setCalendarPortal] = useState<HTMLElement | null>(null);
  const [calendarVersion, setCalendarVersion] = useState(0);
  const [meetingParticipants, setMeetingParticipants] = useState<CalendarPerson[]>([]);
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [meetingError, setMeetingError] = useState("");
  const [editingMeeting, setEditingMeeting] = useState<CalendarMeeting | null>(null);
  const [meetingForm, setMeetingForm] = useState<MeetingForm>(() => defaultMeetingForm(dateKey(new Date())));
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null);


  useEffect(() => {
    setCalendarPortal(document.getElementById("global-calendar-slot"));
  }, []);

  useEffect(() => {
    const updates = window.techLeadHub?.updates;
    if (!updates) return;
    void updates.getState().then(setUpdateState).catch(() => undefined);
    return updates.onStateChange(setUpdateState);
  }, []);

  async function handleUpdateAction() {
    const updates = window.techLeadHub?.updates;
    if (!updates || !updateState) return;
    if (updateState.status === "available") await updates.download().catch(() => undefined);
    else if (updateState.status === "downloaded") await updates.install().catch(() => undefined);
  }

  useEffect(() => {
    const onCommandPalette = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        window.setTimeout(() => searchInputRef.current?.focus(), 120);
      }
    };
    window.addEventListener("keydown", onCommandPalette);
    return () => window.removeEventListener("keydown", onCommandPalette);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setSearching(false); setSearchError(""); return; }
    setSearching(true);
    setSearchError("");
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get<{ items: SearchItem[] }>("/global/search", { params: { q: query.trim() } });
        setResults(response.data.items);
      } catch { setResults([]); setSearchError("Não foi possível realizar a pesquisa. Verifique se o backend foi recompilado."); } finally { setSearching(false); }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    void api.get<{ events: CalendarEvent[]; holidays: Holiday[] }>("/global/calendar", { params: { start: start.toISOString(), end: end.toISOString() } })
      .then((response) => { setEvents(response.data.events); setHolidays(response.data.holidays); })
      .catch(() => { setEvents([]); setHolidays([]); });
  }, [month, calendarVersion]);

  const days = useMemo(() => calendarDays(month), [month]);
  const selectedEvents = events.filter((item) => dateKey(new Date(item.date)) === selectedDate);
  const selectedHoliday = holidays.find((item) => dateKey(new Date(item.date)) === selectedDate);

  function go(path: string) { setQuery(""); setResults([]); setCalendarAnchor(null); navigate(path); }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && results[0]) go(results[0].path);
    if (event.key === "Escape") { setQuery(""); setResults([]); searchInputRef.current?.blur(); }
  }

  return (
    <Box sx={{ position: "relative", zIndex: (theme) => theme.zIndex.appBar, mb: 3, minHeight: 46, height: "auto", opacity: 1, transform: "translateY(0)", overflow: "visible", boxSizing: "border-box", bgcolor: "transparent", pointerEvents: "none" }}>
      <Box sx={{ position: "relative", width: { xs: "calc(100% - 72px)", md: "calc(100% - 340px)" }, maxWidth: 620, minWidth: { md: 420 }, mr: "auto", minHeight: 44, pointerEvents: "auto" }}>
          <TextField inputRef={searchInputRef} fullWidth size="small" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Busque telas, rotinas, cards, tickets, clientes, tarefas ou versões..."
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment>, endAdornment: searching ? <CircularProgress size={16} /> : <Box component="span" sx={{px:.7,py:.25,border:"1px solid",borderColor:"divider",borderRadius:1,color:"text.secondary",fontSize:".68rem",fontWeight:800,whiteSpace:"nowrap"}}>Ctrl K</Box>, sx: { height: 44, bgcolor: "background.paper", borderRadius: 2, boxShadow: "0 2px 10px rgba(0,0,0,.04)" } } }} />
          {query.trim().length >= 2 && (
            <Paper elevation={8} sx={{ position: "absolute", top: 46, left: 0, right: 0, maxHeight: 430, overflowY: "auto", border: "1px solid", borderColor: "divider", zIndex: 20 }}>
              {results.length ? <List dense disablePadding>{results.map((item) => <ListItemButton key={item.id} onClick={() => go(item.path)} sx={{ py: .9 }}><Box sx={{ minWidth: 88 }}><Typography variant="caption" sx={{ color: item.type === "Card" ? "info.main" : item.type === "Tela" ? "success.main" : item.type === "Rotina" ? "warning.main" : aliareColors.greenDark, fontWeight: 800 }}>{item.type}</Typography></Box><ListItemText primary={item.title} secondary={item.subtitle} slotProps={{ primary: { noWrap: true, sx: { fontSize: ".82rem", fontWeight: 700 } }, secondary: { noWrap: true, sx: { fontSize: ".7rem" } } }} /></ListItemButton>)}</List> : !searching && <Typography variant="body2" color={searchError ? "error" : "text.secondary"} sx={{ p: 2 }}>{searchError || "Nenhum resultado encontrado."}</Typography>}
            </Paper>
          )}
      </Box>

      {updateState && ["available", "downloading", "downloaded"].includes(updateState.status) && (
        <Alert
          severity={updateState.status === "downloaded" ? "success" : "info"}
          variant="outlined"
          sx={{ mt: 1, width: { xs: "100%", md: "calc(100% - 340px)" }, maxWidth: 620, pointerEvents: "auto", borderRadius: 2, py: .25, "& .MuiAlert-message": { width: "100%" } }}
          action={
            updateState.status === "available" || updateState.status === "downloaded"
              ? <Button size="small" color="inherit" onClick={() => void handleUpdateAction()}>{updateState.status === "downloaded" ? "Instalar e reiniciar" : "Baixar"}</Button>
              : undefined
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 800 }}>
            {updateState.status === "downloaded"
              ? `Versão ${updateState.availableVersion ?? ""} pronta para instalar`
              : updateState.status === "downloading"
                ? `Baixando nova versão · ${Math.round(updateState.percent ?? 0)}%`
                : `Nova versão ${updateState.availableVersion ?? ""} disponível`}
          </Typography>
        </Alert>
      )}

      {calendarPortal && createPortal(<>
        <IconButton
          title={mode === "dark" ? "Usar modo claro" : "Usar modo escuro"}
          aria-label={mode === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
          onClick={toggleMode}
          sx={{ width: 46, height: 46, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: "0 2px 10px rgba(0,0,0,.06)", "&:hover": { bgcolor: "background.paper", borderColor: "rgba(24,199,122,.45)" } }}
        >
          {mode === "dark" ? <LightModeOutlined /> : <DarkModeOutlined />}
        </IconButton>
        <IconButton title="Calendário operacional" onClick={(event: MouseEvent<HTMLElement>) => { setSelectedDate(dateKey(new Date())); setCalendarAnchor(event.currentTarget); }} sx={{ width: 46, height: 46, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: "0 2px 10px rgba(0,0,0,.06)", "&:hover": { bgcolor: "background.paper", borderColor: "rgba(24,199,122,.38)" } }}><Badge color="success" variant={events.length ? "dot" : "standard"}><CalendarMonthOutlined /></Badge></IconButton>
</>, calendarPortal)}

      <Popover open={Boolean(calendarAnchor)} anchorEl={calendarAnchor} onClose={() => setCalendarAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }} slotProps={{ paper: { sx: { mt: 1, width: { xs: 340, sm: 420 }, maxWidth: "calc(100vw - 24px)", maxHeight: "calc(100vh - 90px)", borderRadius: 2 } } }}>
        <Box sx={{ p: 1.5 }}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}><IconButton size="small" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></IconButton><Typography sx={{ fontWeight: 850, textTransform: "capitalize" }}>{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</Typography><IconButton size="small" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></IconButton></Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: .25 }}>{["D","S","T","Q","Q","S","S"].map((label, index) => <Typography key={`${label}-${index}`} variant="caption" sx={{ textAlign: "center", fontWeight: 800, color: "text.secondary" }}>{label}</Typography>)}{days.map((day) => { const key = dateKey(day); const count = events.filter((item) => dateKey(new Date(item.date)) === key).length; const holiday = holidays.some((item) => dateKey(new Date(item.date)) === key); const inMonth = day.getMonth() === month.getMonth(); return <Box component="button" key={key} onClick={() => setSelectedDate(key)} sx={{ appearance: "none", border: "1px solid", borderColor: key === selectedDate ? aliareColors.green : "transparent", borderRadius: 1, minHeight: 34, bgcolor: key === selectedDate ? "rgba(24,199,122,.10)" : "transparent", color: inMonth ? "text.primary" : "text.disabled", cursor: "pointer", position: "relative" }}><Typography variant="caption" sx={{ fontWeight: 700 }}>{day.getDate()}</Typography>{count > 0 && <Box sx={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", width: 5, height: 5, borderRadius: "50%", bgcolor: aliareColors.green }} />}{holiday && <Box sx={{ position: "absolute", top: 2, right: 2, width: 4, height: 4, borderRadius: "50%", bgcolor: "warning.main" }} />}</Box>; })}</Box>
          <Box sx={{ mt: 1, pt: 1, borderTop: "1px solid", borderColor: "divider" }}><Typography sx={{ fontWeight: 800, fontSize: ".88rem" }}>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("pt-BR", { dateStyle: "full" })}</Typography>{selectedHoliday && <Typography variant="caption" sx={{ color: "warning.dark", fontWeight: 750 }}>Feriado: {selectedHoliday.name}</Typography>}<List dense sx={{ maxHeight: 150, overflowY: "auto" }}>{selectedEvents.map((item) => <ListItemButton key={item.id} onClick={() => go(item.path)} sx={{ px: .5, borderRadius: 1 }}><ListItemText primary={item.title} secondary={item.subtitle} slotProps={{ primary: { sx: { fontSize: ".76rem", fontWeight: 700 } }, secondary: { noWrap: true, sx: { fontSize: ".66rem" } } }} /></ListItemButton>)}{!selectedEvents.length && <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>Nenhum evento operacional nesta data.</Typography>}</List></Box>
        </Box>
      </Popover>
    </Box>
  );
}

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function calendarDays(month: Date) { const first = new Date(month.getFullYear(), month.getMonth(), 1); const start = new Date(first); start.setDate(first.getDate() - first.getDay()); return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; }); }
