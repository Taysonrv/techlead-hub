import { useCallback, useEffect, useMemo, useState } from "react";
import { BomJesusExecutiveDashboard, type BomJesusExecutiveAudit } from "./BomJesusExecutiveDashboard";
import { ClientManagementOverview, ClientManagementRankings, ClientManagementTickets, ClientManagementPivot, type ClientManagementTicket, type ClientInspect } from "./ClientManagementViews";
import { TicketDrilldownExplorer } from "./TicketDrilldownExplorer";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { useNavigate } from "react-router-dom";
import { DashboardOutlined, EmojiEventsOutlined, FormatListBulletedOutlined, AccountTreeOutlined, FactCheckOutlined, TuneOutlined, FileDownloadOutlined, RefreshOutlined } from "@mui/icons-material";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, Drawer, Divider, MenuItem, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { api, getApiErrorMessage } from "../services/api";

type CategorySnapshot = { previousCategory: string | null; category: string; source: string; observedAt: string; sourceLastUpdate: string | null; kind: string };
type SlaMetric = { minutes: number | null; targetMinutes: number | null; exceeded: boolean | null; overMinutes: number | null; percent: number | null; state: string };
type SlaEvidence = { agreement: string | null; tier: "PADRAO" | "VIP"; tierSource: string; tierVerified: boolean; priority: string | null; kind: string; eligible: boolean; warnings: string[]; response: SlaMetric; support: SlaMetric; factory: SlaMetric; total: SlaMetric; pauseMinutesSupport: number; pauseMinutesFactory: number };
type Row = ClientManagementTicket & { sla: SlaEvidence; initialObservedCategory: string | null; initialObservedAt: string | null; initialSource: string | null; openingCategoryVerified: boolean; categoryHistory: CategorySnapshot[]; id: number; subject: string; createdDate: string; status: string; category: string; taskNumber: number | null; taskConcludedAt: string | null; classification: string; vistra: boolean; recurrenceCount: number; ola: string; evidence: string; taskState: string; deliveredVersion: string; supportOlaBreached: boolean | null; categoryChangedAt: string | null; categoryChangeEvidence: string; anyToAdequacaoChangedAt: string | null; anyToAdequacaoFrom: string | null; anyToAdequacaoEvidence: string; vistraType: string; recurrenceEvidence: string };
type Report = { clientKey: string; clientFilter: string; executive: BomJesusExecutiveAudit; generatedAt: string; methodology: string; totals: { tickets: number; possibleBugs: number; currentImprovements: number; vistraCandidates: number; recurrenceCandidates: number; confirmedBugs: number; concludedCorrectionTasks: number; openCorrectionTasks: number; correctionWithVersion: number; reclassified: number; anyToAdequacaoObserved: number; problemaToAdequacaoObserved: number; otherToAdequacaoObserved: number; categoryChangeEvidenceCount: number; categoryHistoryCoverage: number; categoryOpeningVerified: number; recurrenceGroups: number; olaBreaches: number; olaBreachesPreliminary: number; responseBreaches: number; factoryBreaches: number; factoryOverdueOpen: number; totalSlaBreaches: number; withoutVerifiedProfile: number; slaCalculationEligible: number; linkedCorrectionTasks: number; deliveredCorrectionTasks: number }; monthly: { month: string; tickets: number; vistra: number }[]; rows: Row[] };
const DEFAULT_CLIENT="BOM JESUS COOPERATIVA AGROINDUSTRIAL - LAPA-PR";
const businessToday=()=>new Date(Date.now()-3*3600000).toISOString().slice(0,10);
const startOfCurrentSemester=()=>{
  const today=businessToday();
  return today.slice(0,4)+(Number(today.slice(5,7))<=6?"-01-01":"-07-01");
};
export function ClientExecutiveReportPanel() {
  const navigate=useNavigate();
  const [client,setClient]=useState(DEFAULT_CLIENT);
  const [clients,setClients]=useState<string[]>([DEFAULT_CLIENT]);
  const [periodPreset,setPeriodPreset]=useState("semester");
  const [startDate, setStartDate] = useState(startOfCurrentSemester);
  const [endDate, setEndDate] = useState(businessToday);
  const [slaTier, setSlaTier] = useState<"auto" | "PADRAO" | "VIP">("auto");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [selectedHistory, setSelectedHistory] = useState<Row | null>(null);
  const [activeTab,setActiveTab]=useState(0);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [settingsError,setSettingsError]=useState("");
  const [insight,setInsight]=useState<{title:string;tickets:ClientManagementTicket[]}|null>(null);
  const inspect:ClientInspect=(title,tickets)=>setInsight({title,tickets});
  const [drilldown,setDrilldown]=useState<{dimension:"owner"|"category"|"status"|"service";value:string}|null>(null);
  const [draft,setDraft]=useState({
    client:DEFAULT_CLIENT,periodPreset:"semester",startDate:startOfCurrentSemester(),
    endDate:businessToday(),slaTier:"auto" as "auto"|"PADRAO"|"VIP",
  });
  const openSettings=()=>{
    setDraft({client,periodPreset,startDate,endDate,slaTier});
    setSettingsError("");setSettingsOpen(true);
  };
  const applySettings=()=>{
    const begin=Date.parse(draft.startDate+"T03:00:00.000Z");
    const finish=Date.parse(draft.endDate+"T03:00:00.000Z");
    if(!(clients.includes(draft.client)||draft.client==="__ALL__") || !Number.isFinite(begin)||!Number.isFinite(finish)||
       finish<begin||finish-begin>366*86400000){
      setSettingsError("Revise os parâmetros: selecione um cliente autorizado e um intervalo válido de até 366 dias.");
      return;
    }
    setSettingsError("");setError("");
    setClient(draft.client);setStartDate(draft.startDate);setEndDate(draft.endDate);
    setPeriodPreset(draft.periodPreset);setSlaTier(draft.slaTier);
    setDrilldown(null);setInsight(null);setActiveTab(0);setSettingsOpen(false);
  };
  useEffect(()=>{
    const controller=new AbortController();
    void api.get<{clients:string[],defaultClient:string}>("/coordination/client-executive-report/clients",{signal:controller.signal})
      .then(response=>{if(!controller.signal.aborted){setClients(response.data.clients);}})
      .catch(()=>{if(!controller.signal.aborted)setError("Não foi possível carregar a lista atualizada de clientes da carteira SIMER.");});
    return ()=>controller.abort();
  },[]);
  const choosePeriod=(preset:string)=>{
    const today=businessToday();
    let start=draft.startDate;
    if(preset==="semester")start=startOfCurrentSemester();
    if(preset==="month")start=today.slice(0,7)+"-01";
    if(preset==="90d"){
      const anchor=new Date(today+"T03:00:00.000Z");
      anchor.setUTCDate(anchor.getUTCDate()-89);
      start=anchor.toISOString().slice(0,10);
    }
    setDraft(previous=>({...previous,periodPreset:preset,
      startDate:preset==="custom"?previous.startDate:start,
      endDate:preset==="custom"?previous.endDate:today}));
  };
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);setError("");setReport(null);
    try {
      const result = await api.get<Report>("/coordination/client-executive-report", { params: { client,startDate, endDate, slaTier }, signal });
      if (!signal?.aborted) setReport(result.data);
    } catch (e) { if (!signal?.aborted) { setError(getApiErrorMessage(e, "Falha ao carregar relatório.")); setReport(null); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [client,startDate, endDate, slaTier]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const download = async () => {
    setExporting(true); setError("");
    try {
      const response = await api.get("/coordination/client-executive-report.xlsx", { params: { client,startDate, endDate, slaTier }, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a"); a.href = url; a.download = `Relatorio_Executivo_${(client==="__ALL__"?"Carteira_SIMER":client.replace(/[^A-Za-z0-9]+/g,"_").slice(0,56))}_${startDate}_a_${endDate}.xlsx`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(getApiErrorMessage(e, "Falha ao exportar Excel.")); }
    finally { setExporting(false); }
  };
  const rows = report?.rows.filter(x => [x.subject, String(x.id), x.category, x.classification].join(" ").toLocaleLowerCase("pt-BR").includes(filter.toLocaleLowerCase("pt-BR"))) ?? [];
  const managerialRows=useMemo(()=>{
    if(!report)return [] as ClientManagementTicket[];
    const statuses=new Map(report.executive.ola.cases.map(x=>[x.ticketId,x.status]));
    return report.rows.map(r=>({...r,olaStatus:statuses.get(r.id)}));
  },[report]);
  return <Card variant="outlined" sx={{mb:2,borderRadius:3,overflow:"hidden"}} id="relatorio-executivo-clientes">
    <CardContent sx={{p:{xs:1.5,md:2.5}}}><Box id="diagnostico-bom-jesus" sx={{height:0}}/>
      <Stack direction={{xs:"column",md:"row"}} sx={{justifyContent:"space-between",alignItems:{md:"center"},gap:2,mb:2}}>
        <Box>
          <Typography variant="h5" sx={{fontWeight:750,color:"text.primary"}}>Painel Gerencial de Atendimento</Typography>
          <Typography variant="body2" color="text.secondary">
            Coordenação SIMER • Indicadores, resolutividade e qualidade por cliente
          </Typography>
        </Box>
        <Stack direction="row" sx={{alignItems:"center",gap:1,flexWrap:"wrap"}}>
          <Button variant="outlined" startIcon={<TuneOutlined/>} onClick={openSettings}
            sx={{textTransform:"none",fontWeight:650}}>Alterar parâmetros</Button>
          <Button variant="outlined" startIcon={<RefreshOutlined/>} onClick={()=>void load()} disabled={loading}
            sx={{textTransform:"none"}}>Atualizar</Button>
          <Button variant="contained" startIcon={<FileDownloadOutlined/>} onClick={()=>void download()}
            disabled={!report||report.clientKey!==client||exporting||loading}
            sx={{textTransform:"none"}}>{exporting?"Exportando...":"Excel da Diretoria"}</Button>
        </Stack>
      </Stack>
      <Tabs value={activeTab} onChange={(_,value:number)=>{if(value===2)setDrilldown(null);setActiveTab(value);}}
        variant="scrollable" scrollButtons="auto" aria-label="Painel gerencial da Coordenação SIMER"
        sx={{borderBottom:"1px solid",borderColor:"divider",mb:.8,
          "& .MuiTabs-indicator":{backgroundColor:"#F26727",height:3},
          "& .MuiTab-root":{minHeight:45,textTransform:"none",fontWeight:650,borderTopLeftRadius:1.5,borderTopRightRadius:1.5},
          "& .MuiTab-root.Mui-selected":{backgroundColor:"#F26727",color:"#fff!important"}}}>
        <Tab icon={<DashboardOutlined fontSize="small"/>} iconPosition="start" label="Visão Geral"/>
        <Tab icon={<EmojiEventsOutlined fontSize="small"/>} iconPosition="start" label="Ranking"/>
        <Tab icon={<FormatListBulletedOutlined fontSize="small"/>} iconPosition="start" label="Lista de Atendimentos"/>
        <Tab icon={<AccountTreeOutlined fontSize="small"/>} iconPosition="start" label="Multidimensional"/>
        <Tab icon={<FactCheckOutlined fontSize="small"/>} iconPosition="start" label="Auditoria SLA / OLA"/>
      </Tabs>
      <Box sx={{backgroundColor:"action.hover",border:"1px solid",borderColor:"divider",
        borderRadius:1.5,px:1.5,py:.8,mb:2}}>
        <Typography variant="caption" sx={{fontWeight:600}}>
          {client==="__ALL__"?"Todos os clientes da carteira SIMER":client} • Período: {startDate.split("-").reverse().join("/")} a {endDate.split("-").reverse().join("/")}
          {slaTier!=="auto"?" • Perfil de SLA simulado: "+slaTier:" • SLA por contrato"} 
        </Typography>
      </Box>
      <Drawer anchor="right" open={settingsOpen} onClose={()=>setSettingsOpen(false)}>
        <Box sx={{width:{xs:"min(94vw,420px)",sm:420},p:3}}>
          <Typography variant="h6" sx={{fontWeight:750}}>Alterar parâmetros</Typography>
          <Typography color="text.secondary" variant="body2" sx={{mt:.5,mb:3}}>Selecione o cliente da carteira, o período de abertura e o perfil de SLA.</Typography>
          <Stack spacing={2}>
            {settingsError&&<Alert severity="error">{settingsError}</Alert>}
            <TextField select fullWidth label="Cliente da carteira" size="small" value={draft.client}
              onChange={e=>setDraft(previous=>({...previous,client:e.target.value}))}
              slotProps={{select:{MenuProps:{slotProps:{paper:{sx:{maxWidth:"min(94vw,440px)",width:"min(94vw,440px)",maxHeight:"min(55vh,410px)"}}},autoFocus:false}}}}
              sx={{"& .MuiSelect-select":{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}}>
              <MenuItem value="__ALL__" sx={{fontWeight:750,color:"primary.main",whiteSpace:"normal"}}>
                <Checkbox checked={draft.client==="__ALL__"} size="small" sx={{mr:1}}/>Selecionar todos — carteira SIMER
              </MenuItem>
              {clients.map(name=><MenuItem key={name} value={name} sx={{whiteSpace:"normal",overflowWrap:"anywhere"}}><Checkbox checked={draft.client===name} size="small" sx={{mr:1}}/>{name}</MenuItem>)}
            </TextField>
            <TextField select fullWidth label="Período" size="small" value={draft.periodPreset}
              onChange={e=>choosePeriod(e.target.value)}>
              <MenuItem value="semester">Este semestre</MenuItem><MenuItem value="month">Este mês</MenuItem>
              <MenuItem value="90d">Últimos 90 dias</MenuItem><MenuItem value="custom">Personalizado</MenuItem>
            </TextField>
            <TextField type="date" size="small" label="De" value={draft.startDate}
              onChange={e=>setDraft(p=>({...p,startDate:e.target.value,periodPreset:"custom"}))}
              slotProps={{inputLabel:{shrink:true}}}/>
            <TextField type="date" size="small" label="Até" value={draft.endDate}
              onChange={e=>setDraft(p=>({...p,endDate:e.target.value,periodPreset:"custom"}))}
              slotProps={{inputLabel:{shrink:true}}}/>
            <TextField select size="small" label="Perfil SLA" value={draft.slaTier}
              onChange={e=>setDraft(p=>({...p,slaTier:e.target.value as "auto"|"PADRAO"|"VIP"}))}>
              <MenuItem value="auto">Automático pelo contrato</MenuItem>
              <MenuItem value="PADRAO">Simulação Padrão</MenuItem><MenuItem value="VIP">Simulação VIP</MenuItem>
            </TextField>
            <Divider/>
            <Typography variant="caption" color="text.secondary">A simulação de SLA não comprova o contrato original. Alertas de OLA dependem da auditoria do marco de passagem e das pausas.</Typography>
            <Stack direction="row" sx={{justifyContent:"flex-end",gap:1}}>
              <Button onClick={()=>setSettingsOpen(false)}>Cancelar</Button>
              <Button variant="contained" onClick={applySettings}>Aplicar parâmetros</Button>
            </Stack>
          </Stack>
        </Box>
      </Drawer>
      {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
      {loading&&<Box sx={{py:5,display:"grid",placeItems:"center"}}><CircularProgress size={30}/></Box>}
      {report&&report.clientKey===client&&<>
        {activeTab===0&&<ClientManagementOverview rows={managerialRows} audit={report.executive} onInspect={inspect}/>}
        {activeTab===1&&<ClientManagementRankings rows={managerialRows} onInspect={inspect}/>}
        {activeTab===2&&<ClientManagementTickets key={client+"-"+startDate+"-"+endDate+"-"+(drilldown?.value??"all")}
          rows={managerialRows} initialFilter={drilldown} onInspect={inspect}/>}
        {activeTab===3&&<ClientManagementPivot rows={managerialRows} onInspect={inspect}/>}
        {activeTab===4&&<>
          <Alert severity="warning" sx={{mb:2}}>
            Os alertas de OLA utilizam a criação da Task como referência aproximada do encaminhamento.
            Pausas, perfil, prioridade histórica e feriados precisam de conferência.
            A primeira categoria observada não comprova a categoria na abertura.
          </Alert>
          <BomJesusExecutiveDashboard executive={report.executive} clientName={report.clientFilter} rows={managerialRows} onInspect={inspect}/>
      <Accordion disableGutters elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <AccordionSummary expandIcon={<span aria-hidden>▾</span>}><Typography sx={{fontWeight:600}}>Abrir tabelas detalhadas e indicadores legados</Typography></AccordionSummary>
      <AccordionDetails>
      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Chip label={`Tickets: ${report.totals.tickets}`} />
        <Chip color="success" label={`Tickets vinculados a correção Azure: ${report.totals.confirmedBugs}`} />
        <Chip color="info" label={`Possíveis bugs: ${report.totals.possibleBugs}`} />
        <Chip label={`Melhorias atuais: ${report.totals.currentImprovements}`} />
        <Chip color="success" label={`Tasks de correção: ${report.totals.linkedCorrectionTasks}`} />
        <Chip label={`Tasks de correção abertas: ${report.totals.openCorrectionTasks}`} />
        <Chip label={`Tasks concluídas: ${report.totals.concludedCorrectionTasks}`} />
        <Chip label={`Tasks com versão vinculada: ${report.totals.correctionWithVersion}`} />
        <Chip label={`Concluídas e com versão: ${report.totals.deliveredCorrectionTasks}`} />
        <Chip color="error" label={`OLA Suporte possivelmente excedido · perfil identificado: ${report.totals.olaBreaches}`} />
        <Chip color="warning" label={`OLA Suporte possivelmente excedido · perfil presumido: ${report.totals.olaBreachesPreliminary}`} />
        <Chip label={`OLA Fábrica excedido (concluídos): ${report.totals.factoryBreaches}`} />
        <Chip label={`OLA Fábrica vencido (abertos): ${report.totals.factoryOverdueOpen}`} />
        <Chip label={`SLA total excedido (concluídos): ${report.totals.totalSlaBreaches}`} />
        <Chip label={`1ª resposta excedida: ${report.totals.responseBreaches}`} />
        <Chip color="warning" label={`Vistra/relatórios: ${report.totals.vistraCandidates}`} />
        <Chip label={`Possíveis recorrências: ${report.totals.recurrenceCandidates}`} />
        <Chip color="info" label={`Grupos recorrentes: ${report.totals.recurrenceGroups}`} />
        <Chip color="warning" label={`Transições observadas Bug → Adequação: ${report.totals.reclassified}`} />
        <Chip color="info" label={`Problema → Adequação: ${report.totals.problemaToAdequacaoObserved}`} />
        <Chip label={`Outras categorias → Adequação: ${report.totals.otherToAdequacaoObserved}`} />
        <Chip label={`Históricos de categoria: ${report.totals.categoryHistoryCoverage}`} />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{report.methodology}</Typography>
      {slaTier !== "auto" && <Alert severity="info" sx={{ mb: 2 }}>Perfil {slaTier === "VIP" ? "VIP" : "Padrão"} selecionado para simulação. Esse perfil não comprova o contrato original do ticket e os números precisam de validação antes de uso gerencial.</Alert>}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Periodicidade mensal</Typography>
      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mb: 2 }}>{report.monthly.map(x => <Chip key={x.month} variant="outlined" label={`${x.month}: ${x.tickets} tickets · ${x.vistra} Vistra/relatórios`} />)}</Stack>
      <TextField size="small" label="Buscar ticket ou assunto" value={filter} onChange={e => setFilter(e.target.value)} sx={{ mb: 1, minWidth: 270 }} />
      <TableContainer sx={{ maxHeight: 430 }}><Table size="small" stickyHeader>
        <TableHead><TableRow>{["Ticket", "Assunto", "Abertura", "Categoria atual", "Primeira observada", "Histórico", "Classificação", "Vistra", "Grupo", "Task", "Estado", "Versão", "Mudança categoria", "Categoria anterior → Adequação", "Vistra/relatório", "OLA"].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
        <TableBody>{rows.slice(0, 200).map(x => <TableRow key={x.id} hover>
          <TableCell>{x.id}</TableCell><TableCell sx={{ minWidth: 240 }}>{x.subject}</TableCell>
          <TableCell>{x.createdDate.slice(0, 10)}</TableCell><TableCell>{x.category}</TableCell>
          <TableCell>{x.initialObservedCategory || "Não registrada"}</TableCell>
          <TableCell><Button size="small" disabled={!x.categoryHistory.length} onClick={() => setSelectedHistory(x)}>Ver ({x.categoryHistory.length})</Button></TableCell>
          <TableCell>{x.classification}</TableCell><TableCell>{x.vistra ? "Validar" : "—"}</TableCell>
          <TableCell>{x.recurrenceCount > 1 ? x.recurrenceCount : "—"}</TableCell><TableCell>{x.taskNumber ?? "—"}</TableCell><TableCell>{x.taskState || "—"}</TableCell><TableCell>{x.deliveredVersion || "—"}</TableCell><TableCell>{x.categoryChangeEvidence ? (x.categoryChangedAt?.slice(0, 10) || "Data não informada") : "Sem evidência"}</TableCell><TableCell>{x.anyToAdequacaoFrom || "Não observada"}</TableCell><TableCell>{x.vistraType}</TableCell><TableCell>{x.supportOlaBreached === null ? "Não calculável" : x.supportOlaBreached ? "Excedido" : "Dentro do prazo"}</TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
      <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>SLA e OLA por atendimento — Prazos Aliare 2026</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Tempos em minutos úteis, descontando feriados nacionais e pausas explicitamente registradas no histórico. A comparação de prazos é preliminar quando houver condições não comprovadas, como perfil contratual, mudança de urgência e pausas externas.</Typography>
      <TableContainer sx={{ maxHeight: 360 }}><Table size="small" stickyHeader>
        <TableHead><TableRow>{["Ticket", "Tipo", "Prioridade", "Perfil", "1ª resposta", "OLA Suporte", "OLA Fábrica", "SLA total", "Situação"].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
        <TableBody>{rows.slice(0, 200).map(x => {
          const show = (m: SlaMetric) => m.minutes === null ? "N/D" : `${m.minutes}/${m.targetMinutes ?? "?"} min${m.exceeded ? " · excedido" : ""}`;
          return <TableRow key={x.id} hover title={x.sla.warnings.join(" | ")}>
            <TableCell>{x.id}</TableCell><TableCell>{x.sla.kind}</TableCell>
            <TableCell>{x.sla.priority ?? "N/D"}</TableCell><TableCell>{x.sla.tier}{x.sla.tierVerified ? "" : " (premissa)"}</TableCell>
            <TableCell>{show(x.sla.response)}</TableCell><TableCell>{show(x.sla.support)}</TableCell>
            <TableCell>{show(x.sla.factory)}</TableCell><TableCell>{show(x.sla.total)}</TableCell>
            <TableCell>{!x.sla.eligible ? "Categoria excluída" : !x.sla.tierVerified ? "Cenário preliminar" : x.sla.factory.state === "em andamento" ? "Desenvolvimento em andamento" : "Conferir ressalvas"}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></TableContainer>
      <Typography variant="caption" color="text.secondary">Passe o cursor sobre uma linha para consultar as ressalvas. O Excel contém a análise completa e todos os tickets do período.</Typography>
      {rows.length > 200 && <Typography variant="caption" color="text.secondary">Exibindo 200 de {rows.length} tickets filtrados. O Excel inclui todos os registros do período.</Typography>}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Gerado em {new Date(report.generatedAt).toLocaleString("pt-BR")} · Sem alteração dos dados originais.</Typography>
      </AccordionDetails></Accordion>
        </>}
      </>}
  <Drawer anchor="right" open={Boolean(insight)} onClose={()=>setInsight(null)}
    slotProps={{paper:{sx:detailDrawerPaperSx}}}>
    <Box sx={{p:2.5,height:"100%",overflowY:"auto"}}>
      <Stack direction="row" sx={{alignItems:"center",justifyContent:"space-between",gap:1,mb:2}}>
        <Box sx={{minWidth:0}}>
          <Typography variant="h6" sx={{fontWeight:750}}>{insight?.title||"Atendimentos do indicador"}</Typography>
          <Typography variant="caption" color="text.secondary">
            {insight?.tickets.length??0} tickets • {report?.clientFilter} • {startDate} a {endDate}
          </Typography>
        </Box>
        <Button size="small" onClick={()=>setInsight(null)}>Fechar</Button>
      </Stack>
      {insight&&<TicketDrilldownExplorer key={insight.title+"-"+insight.tickets.length}
        initialVisible={70}
        tickets={insight.tickets.map(t=>({...t,movideskId:t.id,service:t.serviceContext,baseStatus:t.baseStatus??null}))}
        onOpen={ticket=>{setInsight(null);navigate("/tickets?movidesk="+ticket.id);}}
        emptyLabel="Nenhum atendimento pertence a este segmento do gráfico."/>}
    </Box>
  </Drawer>
  <Dialog open={Boolean(selectedHistory)} onClose={() => setSelectedHistory(null)} fullWidth maxWidth="md">
    <DialogTitle>Histórico observado de categorias · Ticket {selectedHistory?.id}</DialogTitle>
    <DialogContent>
      <Alert severity="info" sx={{ mb: 2 }}>Categoria na abertura: não comprovada. A data abaixo indica quando o HUB registrou cada estado, não necessariamente quando a categoria mudou no Movidesk.</Alert>
      <Typography variant="body2" sx={{ mb: 1 }}>Primeira categoria observada: <strong>{selectedHistory?.initialObservedCategory || "Sem registro"}</strong> · Fonte: {selectedHistory?.initialSource || "Não informada"}</Typography>
      <TableContainer><Table size="small"><TableHead><TableRow>{["Tipo", "De", "Para", "Observado em", "Fonte"].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
      <TableBody>{selectedHistory?.categoryHistory.map((event, index) => <TableRow key={index}>
        <TableCell>{event.kind === "BASELINE" ? "Primeira observação" : "Mudança observada"}</TableCell>
        <TableCell>{event.previousCategory ?? "—"}</TableCell><TableCell>{event.category}</TableCell>
        <TableCell>{new Date(event.observedAt).toLocaleString("pt-BR")}</TableCell><TableCell>{event.source}</TableCell>
      </TableRow>)}</TableBody></Table></TableContainer>
      <Button sx={{ mt: 2 }} variant="outlined" onClick={() => setSelectedHistory(null)}>Fechar</Button>
    </DialogContent>
  </Dialog>
  </CardContent></Card>;
}

// Export mantido para integrações anteriores da Central de Coordenação.
export const BomJesusReportPanel=ClientExecutiveReportPanel;
