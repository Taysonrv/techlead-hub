import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";


type TicketRow = {
  id?: string | number; movideskId?: string | number | null; subject?: string | null;
  client?: string | null; owner?: string | null; status?: string | null; baseStatus?: string | null;
  category?: string | null; urgency?: string | null; service?: string | null;
};
const isOpen = (ticket: TicketRow) => ["new","inattendance","stopped"].includes((ticket.baseStatus??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase());
type Props<T extends TicketRow> = {
  tickets: T[];
  onSelect?: (ticket: T) => void;
  onOpen?: (ticket: T) => void;
  extra?: (ticket: T) => ReactNode;
  emptyLabel?: string;
  initialVisible?: number;
};
export function TicketDrilldownExplorer<T extends TicketRow>({ tickets, onSelect, onOpen, extra, emptyLabel = "Nenhum atendimento encontrado.", initialVisible = Number.POSITIVE_INFINITY }: Props<T>) {
  const [visibleLimit,setVisibleLimit]=useState(initialVisible);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const open = useMemo(() => tickets.filter(ticket => isOpen(ticket)).length, [tickets]);
  const visible = useMemo(() => tickets.filter(ticket => {
    if (filter === "open" && !isOpen(ticket)) return false;
    if (filter === "closed" && isOpen(ticket)) return false;
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return !term || [ticket.movideskId,ticket.subject,ticket.client,ticket.owner,ticket.status,ticket.category,ticket.service].some(value => String(value ?? "").toLocaleLowerCase("pt-BR").includes(term));
  }), [tickets, filter, query]);
  return <Stack spacing={2} sx={{minWidth:0}}>
    <Box sx={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:1}}>
      {[
        {label:"Total",value:tickets.length,color:"primary.main"},
        {label:"Em aberto",value:open,color:"warning.main"},
        {label:"Demais",value:tickets.length-open,color:"success.main"},
      ].map(metric=><Box key={metric.label} sx={{border:"1px solid",borderColor:"divider",borderRadius:2,p:1.5,minWidth:0}}>
        <Typography variant="caption" color="text.secondary">{metric.label}</Typography>
        <Typography variant="h5" sx={{fontWeight:850,color:metric.color}}>{metric.value}</Typography>
      </Box>)}
    </Box>
    <TextField size="small" fullWidth placeholder="Pesquisar ticket, assunto, responsável, cliente..." value={query} onChange={event=>setQuery(event.target.value)} slotProps={{input:{startAdornment:<InputAdornment position="start"><SearchOutlined fontSize="small"/></InputAdornment>}}}/>
    <Stack direction="row" spacing={.75} useFlexGap sx={{flexWrap:"wrap",alignItems:"center"}}>
      {([{key:"all",label:"Todos"},{key:"open",label:"Em aberto"},{key:"closed",label:"Demais"}] as const).map(option=><Chip key={option.key} clickable size="small" label={option.label} color={filter===option.key?"primary":"default"} variant={filter===option.key?"filled":"outlined"} onClick={()=>setFilter(option.key)}/>)}
      <Typography variant="caption" color="text.secondary" sx={{ml:"auto"}}>{visible.length} de {tickets.length}</Typography>
    </Stack>
    {visible.length===0&&<Alert severity="info">{emptyLabel}</Alert>}
    <Stack spacing={1.2}>{visible.slice(0,visibleLimit).map((ticket,index)=><Card key={String(ticket.id??ticket.movideskId??index)} variant="outlined" sx={{borderRadius:2.5,minWidth:0}}>
      <CardContent sx={{p:1.75,"&:last-child":{pb:1.75}}}>
        <Stack direction="row" spacing={1} sx={{alignItems:"center",justifyContent:"space-between"}}>
          <Typography variant="subtitle2" sx={{fontWeight:850}}>#{ticket.movideskId??ticket.id??"—"}</Typography>
          <Chip size="small" variant="outlined" color={isOpen(ticket)?"warning":"success"} label={ticket.status||ticket.baseStatus||"Sem status"}/>
        </Stack>
        <Typography variant="body2" sx={{fontWeight:750,mt:.75,overflowWrap:"anywhere"}}>{ticket.subject||"Sem assunto"}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{display:"block",mt:.5}}>{ticket.client||"Cliente não informado"} · {ticket.owner||"Sem responsável"}</Typography>
        <Stack direction="row" spacing={.6} useFlexGap sx={{flexWrap:"wrap",mt:1}}>
          {ticket.category&&<Chip size="small" label={ticket.category}/>}
          {ticket.urgency&&<Chip size="small" variant="outlined" label={ticket.urgency}/>}
          {ticket.service&&<Chip size="small" variant="outlined" label={ticket.service}/>}
        </Stack>
        {extra?.(ticket)}
        <Stack direction="row" spacing={1} useFlexGap sx={{flexWrap:"wrap",mt:1.5}}>
          {onSelect&&<Button size="small" variant="contained" onClick={()=>onSelect(ticket)}>Ver detalhes</Button>}
          {onOpen&&<Button size="small" variant="outlined" endIcon={<OpenInNewOutlined fontSize="small"/>} onClick={()=>onOpen(ticket)}>Abrir atendimento</Button>}
          <Button size="small" variant="text" startIcon={<ContentCopyOutlined fontSize="small"/>} onClick={()=>{if(ticket.movideskId!=null)void navigator.clipboard.writeText(String(ticket.movideskId));}} disabled={ticket.movideskId==null}>Copiar número</Button>
        </Stack>
      </CardContent>
    </Card>)}</Stack>
    {visible.length>visibleLimit&&<Button size="small" variant="outlined" onClick={()=>setVisibleLimit(n=>n+Math.max(1,initialVisible))}>Mostrar mais atendimentos ({visible.length-visibleLimit} restantes)</Button>}
  </Stack>;
}
