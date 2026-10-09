import { useEffect, useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Drawer,
  FormControl, IconButton, InputLabel, MenuItem, Select, Stack as MuiStack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip as MuiTooltip, Typography,
  useTheme,
} from "@mui/material";
import {
  AssessmentOutlined, InfoOutlined, OpenInNewOutlined, RestartAltOutlined, ShareOutlined,
  TrendingDownOutlined, TrendingUpOutlined,
} from "@mui/icons-material";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer,
  Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { api, getApiErrorMessage } from "../services/api";
import { aliareColors } from "../theme/theme";
import { chartPalette, semanticChartColors } from "../theme/chartPalette";
import { KpiCard } from "./KpiCard";
import { DetailFieldGrid, DetailPanelHeader, DetailSection } from "./DetailPanel";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { ExportCorrectionTasksButton } from "./ExportCorrectionTasksButton";

function Stack(
  props: React.ComponentProps<typeof MuiStack> & {
    alignItems?: unknown;
    justifyContent?: unknown;
    flexWrap?: unknown;
    gap?: unknown;
  },
) {
  const { alignItems, justifyContent, flexWrap, gap, sx, ...rest } = props;
  return (
    <MuiStack
      {...rest}
      sx={[
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
        {
          ...(alignItems !== undefined ? { alignItems } : {}),
          ...(justifyContent !== undefined ? { justifyContent } : {}),
          ...(flexWrap !== undefined ? { flexWrap } : {}),
          ...(gap !== undefined ? { gap } : {}),
        },
      ] as React.ComponentProps<typeof MuiStack>["sx"]}
    />
  );
}

function InfoButton({ title, description }: { title: string; description: string }) {
  return (
    <MuiTooltip
      arrow
      placement="top"
      title={
        <Box sx={{ maxWidth: 360 }}>
          <Typography variant="caption" sx={{ fontWeight: 900, display: "block", mb: 0.45 }}>
            {title}
          </Typography>
          <Typography variant="caption">{description}</Typography>
        </Box>
      }
    >
      <IconButton
        size="small"
        aria-label={`Informações sobre ${title}`}
        onClick={(event) => event.stopPropagation()}
        sx={{ p: 0.35, color: "text.secondary", flexShrink: 0 }}
      >
        <InfoOutlined sx={{ fontSize: 17 }} />
      </IconButton>
    </MuiTooltip>
  );
}

function CardHeading({ title, subtitle, info }: { title: string; subtitle?: string; info: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 850, fontSize: ".98rem" }}>{title}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
      </Box>
      <InfoButton title={title} description={info} />
    </Box>
  );
}

type Row = {
  id:number; title:string; client:string|null; createdBy:string|null; createdAt:string|null; status:string;
  lastStateChangedAt:string|null; urgency:string|null; prioritized:boolean|null; assignedTo:string|null;
  terminalAt:string|null; remoteUrl:string|null; stateAtOpen?:string|null; stateAtClose?:string|null;
  registeredInPeriod:boolean; deliveredInPeriod:boolean; canceledInPeriod:boolean;
  enteredRegistrationInPeriod:boolean; backlogInitial:boolean; backlogCurrent:boolean;
  inPeriodUniverse?:boolean;
};

type Report = {
  period:{month:string;timezone:string;start:string;close:string};
  rows:Row[];
  source:string;
  filters?:{creators:string[];teamCreators?:string[];clients:string[];urgencies:string[];states:string[]};
  quality?:{
    historyAvailable:boolean;historyError:string|null;snapshotAvailable?:boolean;snapshotError?:string|null;
    historicalScopeError?:string|null;mode:string;historicalMetricsReliable:boolean;backlogHistoricalReliable?:boolean;
  };
};

type Drill = "registered"|"delivered"|"canceled"|"registration"|"backlogInitial"|"backlogCurrent"|null;
type SliceDrill =
  | {kind:"status";value:string}
  | {kind:"urgency";value:string}
  | {kind:"prioritized";value:boolean|null}
  | null;

const TERMINAL = new Set(["Concluído","Cancelado"]);
const PIPELINE_ORDER = [
  "Registro","Qualificação","Fila de Negócio","Negócio","Fila Desenvolvimento",
  "Desenvolvimento","Fila Qualidade","Qualidade","Integração","Concluído","Cancelado",
] as const;

const metricLabel:Record<Exclude<Drill,null>,string> = {
  registered:"Tasks registradas",
  delivered:"Tasks entregues",
  canceled:"Tasks canceladas",
  registration:"Tasks em Registro",
  backlogInitial:"Backlog inicial",
  backlogCurrent:"Backlog atual",
};

const fmt = (value:string|null|undefined) => value
  ? new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value))
  : "—";

const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
};

export function CorrectionMonthlyPanel() {
  const theme = useTheme();
  const navigate = useNavigate();

  const [month,setMonth] = useState(currentMonth());
  const [report,setReport] = useState<Report|null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [reloadToken,setReloadToken] = useState(0);

  const [creators,setCreators] = useState<string[]>([]);
  const [clients,setClients] = useState<string[]>([]);
  const [urgencies,setUrgencies] = useState<string[]>([]);
  const [states,setStates] = useState<string[]>([]);
  const [prioritized,setPrioritized] = useState<""|"true"|"false">("");
  const [search,setSearch] = useState("");
  const [drill,setDrill] = useState<Drill>(null);
  const [sliceDrill,setSliceDrill] = useState<SliceDrill>(null);

  const [drawerOpen,setDrawerOpen] = useState(false);
  const [drawerTitle,setDrawerTitle] = useState("Detalhamento");
  const [selectedTaskId,setSelectedTaskId] = useState<number|null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setReport(null);
    api.get<Report>("/azure-work-items/corrections/monthly-report",{params:{month},timeout:120000})
      .then(({data}) => { if(active) setReport(data); })
      .catch((requestError) => {
        if(active) setError(getApiErrorMessage(requestError,"Não foi possível carregar o report mensal."));
      })
      .finally(() => { if(active) setLoading(false); });
    return () => { active = false; };
  },[month,reloadToken]);

  const options = useMemo(() => ({
    creators:[...new Set((report?.rows??[]).map(row=>row.createdBy).filter((value):value is string=>!!value))].sort(),
    clients:report?.filters?.clients??[...new Set((report?.rows??[]).map(row=>row.client).filter((value):value is string=>!!value))].sort(),
    urgencies:[...new Set((report?.rows??[]).map(row=>row.urgency).filter((value):value is string=>!!value))].sort(),
    states:[...new Set((report?.rows??[]).map(row=>row.status).filter(Boolean))].sort(),
  }),[report]);

  const base = useMemo(() => (report?.rows??[]).filter(row =>
    (!creators.length || (!!row.createdBy && creators.includes(row.createdBy))) &&
    (!clients.length || (!!row.client && clients.includes(row.client))) &&
    (!urgencies.length || (!!row.urgency && urgencies.includes(row.urgency))) &&
    (!states.length || states.includes(row.status)) &&
    (!prioritized || row.prioritized === (prioritized==="true"))
  ),[report,creators,clients,urgencies,states,prioritized]);

  const match = (row:Row,key:Exclude<Drill,null>) =>
    key==="registered" ? row.registeredInPeriod :
    key==="delivered" ? row.deliveredInPeriod :
    key==="canceled" ? row.canceledInPeriod :
    key==="registration" ? row.enteredRegistrationInPeriod :
    key==="backlogInitial" ? row.backlogInitial :
    row.backlogCurrent;

  const isPeriodRow = (row:Row) => row.inPeriodUniverse ??
    (row.registeredInPeriod || row.deliveredInPeriod || row.canceledInPeriod ||
      row.enteredRegistrationInPeriod || row.backlogInitial || row.backlogCurrent);

  const value = (key:Exclude<Drill,null>) => base.filter(row=>match(row,key)).length;
  const initial = value("backlogInitial");
  const current = value("backlogCurrent");
  const delivered = value("delivered");
  const canceled = value("canceled");
  const registered = value("registered");
  const delta = current-initial;
  const outputs = delivered+canceled;
  const flowBalance = registered-outputs;

  const cards = [
    {
      key:"registered" as const,label:"Tasks registradas",value:registered,note:"Criadas no período",
      accent:aliareColors.info,
      info:"Conta System.Id distintos criados dentro do período selecionado, independentemente do status no snapshot de fechamento.",
    },
    {
      key:"delivered" as const,label:"Tasks entregues",value:delivered,note:"Concluídas no período",
      accent:aliareColors.green,
      info:"Conta Tasks que entraram efetivamente em Concluído durante o período e permaneciam em Concluído no snapshot de fechamento.",
    },
    {
      key:"canceled" as const,label:"Tasks canceladas",value:canceled,note:"Canceladas no período",
      accent:theme.palette.error.main,
      info:"Conta Tasks que entraram efetivamente em Cancelado durante o período e permaneciam em Cancelado no snapshot de fechamento.",
    },
    {
      key:"registration" as const,label:"Tasks em Registro",value:value("registration"),note:"Fora do backlog",
      accent:aliareColors.warning,
      info:"Conta Tasks que entraram em Registro durante o período e permaneciam em Registro no fechamento. Registro aparece no pipeline, mas nunca integra backlog.",
    },
    {
      key:"backlogInitial" as const,label:"Backlog inicial",value:initial,note:"Estoque aberto na entrada",
      accent:aliareColors.purple,
      info:"Fotografia imediatamente anterior ao início do período: itens abertos, excluindo Registro, Concluído e Cancelado. Não exige movimentação no mês.",
    },
    {
      key:"backlogCurrent" as const,label:"Backlog atual",value:current,note:"Estoque aberto no fechamento",
      accent:aliareColors.green,
      info:"Fotografia no fechamento do período: itens abertos, excluindo Registro, Concluído e Cancelado. Não exige movimentação no mês.",
    },
  ] as const;

  const periodRows = base.filter(isPeriodRow);
  const periodUniverse = periodRows.length;

  const statusCounts = periodRows.reduce<Record<string,number>>((acc,row) => {
    acc[row.status]=(acc[row.status]??0)+1;
    return acc;
  },{});
  const expectedPipeline = PIPELINE_ORDER.map(name=>({name,total:statusCounts[name]??0}));
  const extraPipeline = Object.entries(statusCounts)
    .filter(([name])=>!PIPELINE_ORDER.includes(name as typeof PIPELINE_ORDER[number]))
    .map(([name,total])=>({name,total}));
  const pipeline = [...expectedPipeline,...extraPipeline];

  const urgency = Object.entries(periodRows.reduce<Record<string,number>>((acc,row) => {
    const key=row.urgency||"Não informado";
    acc[key]=(acc[key]??0)+1;
    return acc;
  },{})).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total);

  const priority = [
    {name:"Priorizadas",total:periodRows.filter(row=>row.prioritized===true).length},
    {name:"Não priorizadas",total:periodRows.filter(row=>row.prioritized===false).length},
    {name:"Não informado",total:periodRows.filter(row=>row.prioritized===null).length},
  ].filter(item=>item.total);
  const pipelineTotal=pipeline.reduce((sum,item)=>sum+item.total,0);
  const urgencyTotal=urgency.reduce((sum,item)=>sum+item.total,0);
  const priorityTotal=priority.reduce((sum,item)=>sum+item.total,0);
  const distributionConsistent=pipelineTotal===periodUniverse&&urgencyTotal===periodUniverse&&priorityTotal===periodUniverse;

  const selectedRows = useMemo(() => base.filter(row => {
    if(drill) return match(row,drill);
    if(sliceDrill?.kind==="status") return isPeriodRow(row)&&row.status===sliceDrill.value;
    if(sliceDrill?.kind==="urgency") return isPeriodRow(row)&&(row.urgency||"Não informado")===sliceDrill.value;
    if(sliceDrill?.kind==="prioritized") return isPeriodRow(row)&&row.prioritized===sliceDrill.value;
    return isPeriodRow(row);
  }),[base,drill,sliceDrill]);

  const detailed = useMemo(() => selectedRows.filter(row =>
    !search.trim() ||
    String(row.id).includes(search.trim()) ||
    row.title.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))
  ),[selectedRows,search]);

  const drawerRows = useMemo(() => [...selectedRows].sort((a,b) =>
    (b.lastStateChangedAt??b.createdAt??"").localeCompare(a.lastStateChangedAt??a.createdAt??"")
  ),[selectedRows]);

  const selectedTask = useMemo(
    () => drawerRows.find(row=>row.id===selectedTaskId)??null,
    [drawerRows,selectedTaskId],
  );

  useEffect(() => {
    if(drawerOpen&&selectedTaskId===null&&drawerRows.length) setSelectedTaskId(drawerRows[0].id);
  },[drawerOpen,drawerRows,selectedTaskId]);

  const activeDrillLabel = drill
    ? metricLabel[drill]
    : sliceDrill?.kind==="status"
      ? `Status · ${sliceDrill.value}`
      : sliceDrill?.kind==="urgency"
        ? `Urgência · ${sliceDrill.value}`
        : sliceDrill?.kind==="prioritized"
          ? `Priorização · ${sliceDrill.value===true?"Sim":sliceDrill.value===false?"Não":"Não informado"}`
          : "Universo do período";

  const openMetric = (key:Exclude<Drill,null>,label:string) => {
    setSliceDrill(null);
    setDrill(key);
    setDrawerTitle(label);
    setSelectedTaskId(null);
    setDrawerOpen(true);
  };

  const selectSlice = (next:Exclude<SliceDrill,null>,label:string) => {
    setDrill(null);
    setSliceDrill(next);
    setDrawerTitle(label);
    setSelectedTaskId(null);
    setDrawerOpen(true);
  };

  const clear = () => {
    setCreators([]);setClients([]);setUrgencies([]);setStates([]);setPrioritized("");
    setSearch("");setDrill(null);setSliceDrill(null);setDrawerOpen(false);setSelectedTaskId(null);
  };

  const shareSelection = () => {
    window.dispatchEvent(new CustomEvent("techlead-hub:share-chat",{
      detail:{
        label:"Correções Clientes",
        title:`${drawerTitle} · ${month}`,
        status:`${selectedRows.length} task(s)`,
        path:"/correcoes",
      },
    }));
  };

  const shareTask = (row:Row) => {
    window.dispatchEvent(new CustomEvent("techlead-hub:share-chat",{
      detail:{
        label:"Correção Clientes",
        recordId:row.id,
        title:row.title,
        client:row.client,
        status:row.status,
        path:`/correcoes?task=${row.id}`,
      },
    }));
  };

  const panel = {
    border:"1px solid",
    borderColor:"divider",
    borderRadius:3,
    bgcolor:"background.paper",
    overflow:"hidden",
  };

  const chartPanel = {
    ...panel,
    height:"100%",
    minHeight:360,
    display:"flex",
    boxShadow:theme.palette.mode==="dark"?"0 14px 34px rgba(0,0,0,.13)":"0 10px 28px rgba(15,23,42,.045)",
    "& .recharts-bar-rectangle, & .recharts-sector":{cursor:"pointer"},
  };

  return <Box sx={{order:.5,display:"grid",gap:1.35}}>
    <Card elevation={0} sx={panel}>
      <CardContent sx={{p:{xs:1.6,md:2},"&:last-child":{pb:{xs:1.6,md:2}}}}>
        <Stack direction={{xs:"column",lg:"row"}} justifyContent="space-between" alignItems={{lg:"center"}} gap={1.5}>
          <Box sx={{display:"flex",alignItems:"center",gap:.6,minWidth:0}}>
            <Box sx={{minWidth:0}}>
              <Typography variant="h6" sx={{fontWeight:900,letterSpacing:"-.02em"}}>Report mensal de Correções</Typography>
              <Typography variant="caption" color="text.secondary">
                Snapshots de abertura/fechamento e movimentações reais de status no Azure DevOps.
              </Typography>
            </Box>
            <InfoButton
              title="Report mensal de Correções"
              description="Considera exclusivamente Work Items do tipo Correção Clientes, conta System.Id distintos e usa America/Sao_Paulo. Cards, gráficos e listagem respeitam os filtros globais."
            />
          </Box>
          <Stack direction="row" gap={1} alignItems="center">
            {report?.quality&&
              <Chip
                size="small"
                color={report.quality.historicalMetricsReliable&&!report.quality.historicalScopeError?"success":"warning"}
                variant="outlined"
                label={report.quality.historicalMetricsReliable&&!report.quality.historicalScopeError?"Histórico confiável":"Histórico parcial"}
              />
            }
            <TextField label="Período" type="month" value={month} onChange={event=>setMonth(event.target.value)}
              size="small" sx={{minWidth:190}} slotProps={{inputLabel:{shrink:true}}}/>
          </Stack>
        </Stack>

        <Box sx={{
          mt:1.6,
          display:"grid",
          gridTemplateColumns:{xs:"1fr",md:"repeat(2,minmax(0,1fr))",xl:"1.35fr 1.35fr 1fr 1fr .85fr auto"},
          gap:1,
          alignItems:"start",
        }}>
          <Box sx={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:.7}}>
            <Autocomplete multiple size="small" options={options.creators} value={creators} onChange={(_,value)=>setCreators(value)}
              renderInput={params=><TextField {...params} label="Criado por"/>}/>
            <MuiTooltip title="Selecionar os criadores pertencentes ao time SIMER">
              <span><Button size="small" variant="outlined" disabled={!report?.filters?.teamCreators?.length}
                onClick={()=>setCreators(report?.filters?.teamCreators??[])} sx={{height:40,whiteSpace:"nowrap"}}>Time SIMER</Button></span>
            </MuiTooltip>
          </Box>
          <Autocomplete multiple size="small" options={options.clients} value={clients} onChange={(_,value)=>setClients(value)}
            renderInput={params=><TextField {...params} label="Cliente"/>}/>
          <Autocomplete multiple size="small" options={options.urgencies} value={urgencies} onChange={(_,value)=>setUrgencies(value)}
            renderInput={params=><TextField {...params} label="Urgência"/>}/>
          <Autocomplete multiple size="small" options={options.states} value={states} onChange={(_,value)=>setStates(value)}
            renderInput={params=><TextField {...params} label="Status"/>}/>
          <FormControl size="small">
            <InputLabel id="correction-prioritized-label" htmlFor="correction-prioritized">Priorizada</InputLabel>
            <Select labelId="correction-prioritized-label" inputProps={{ id: "correction-prioritized", "aria-labelledby": "correction-prioritized-label" }} label="Priorizada"
              value={prioritized} onChange={event=>setPrioritized(event.target.value as typeof prioritized)}>
              <MenuItem value="">Todas</MenuItem><MenuItem value="true">Sim</MenuItem><MenuItem value="false">Não</MenuItem>
            </Select>
          </FormControl>
          <Button startIcon={<RestartAltOutlined/>} onClick={clear} sx={{height:40}}>Limpar</Button>
        </Box>
      </CardContent>
    </Card>

    {error&&
      <Alert
        severity="error"
        action={<Button color="inherit" size="small" onClick={()=>setReloadToken(value=>value+1)}>Tentar novamente</Button>}
      >
        {error}
      </Alert>
    }
    {report?.quality&&(!report.quality.historicalMetricsReliable||!!report.quality.historicalScopeError)&&
      <Alert severity="warning">
        <b>{report.quality.snapshotAvailable?"Histórico parcial.":"Snapshot histórico indisponível."}</b>{" "}
        Movimentações mensais só devem ser homologadas com histórico de System.State, snapshots e escopo ASOF disponíveis.{" "}
        {report.quality.historyError||report.quality.snapshotError||report.quality.historicalScopeError||""}
      </Alert>
    }
    {!loading&&report&&report.rows.length===0&&
      <Alert severity="warning">Nenhuma Correção Cliente da carteira SIMER foi localizada no recorte carregado.</Alert>
    }

    {loading
      ? <Box sx={{py:5,textAlign:"center"}}><CircularProgress size={28}/><Typography variant="body2" color="text.secondary" sx={{mt:1}}>Reconstruindo o fechamento mensal…</Typography></Box>
      : report&&<>
        <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(2,1fr)",lg:"repeat(3,1fr)",xl:"repeat(6,1fr)"},gap:1}}>
          {cards.map(card=>
            <KpiCard
              key={card.key}
              title={card.label}
              value={card.value}
              subtitle={card.note}
              info={card.info}
              accent={card.accent}
              active={drill===card.key}
              onClick={()=>openMetric(card.key,card.label)}
            />
          )}
        </Box>

        <Card elevation={0} sx={{
          ...panel,
          background:theme.palette.mode==="dark"
            ?"linear-gradient(110deg,rgba(24,199,122,.08),rgba(255,255,255,.015))"
            :"linear-gradient(110deg,rgba(24,199,122,.07),rgba(255,255,255,.98))",
        }}>
          <CardContent sx={{py:1.25,"&:last-child":{pb:1.25}}}>
            <Stack direction={{xs:"column",lg:"row"}} justifyContent="space-between" alignItems={{lg:"center"}} gap={1.25}>
              <Box sx={{display:"flex",alignItems:"center",gap:.7,flexWrap:"wrap"}}>
                <Box>
                  <Typography sx={{fontWeight:850}}>Leitura do período</Typography>
                  <Typography variant="caption" color="text.secondary">Balanço operacional do recorte selecionado.</Typography>
                </Box>
                <InfoButton
                  title="Leitura do período"
                  description="Resumo gerencial derivado dos seis indicadores oficiais. Saídas = Entregues + Canceladas; saldo líquido = Registradas − Saídas; variação do backlog = Backlog atual − Backlog inicial. A checagem de consistência compara o total do Pipeline, Urgência e Priorização com o universo do período."
                />
                <MuiTooltip title={distributionConsistent?"Pipeline, Urgência e Priorização fecham com o mesmo universo do período.":`Divergência: universo ${periodUniverse}, pipeline ${pipelineTotal}, urgência ${urgencyTotal}, priorização ${priorityTotal}.`}>
                  <Chip size="small" color={distributionConsistent?"success":"warning"} variant="outlined" label={distributionConsistent?"Recorte consistente":"Revisar distribuição"}/>
                </MuiTooltip>
              </Box>
              <Box sx={{display:"grid",gridTemplateColumns:{xs:"repeat(2,minmax(0,1fr))",md:"repeat(4,minmax(110px,1fr))"},gap:{xs:1,md:2.2}}}>
                {[
                  ["Saídas do mês",outputs],
                  ["Saldo líquido",`${flowBalance>0?"+":""}${flowBalance}`],
                  ["Variação backlog",`${delta>0?"+":""}${delta}`],
                  ["Universo",periodUniverse],
                ].map(([label,val],index)=>
                  <Box key={String(label)} sx={{minWidth:0}}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Stack direction="row" alignItems="center" gap={0.35}>
                      {index===2&&(delta<=0?<TrendingDownOutlined color="success" sx={{fontSize:18}}/>:<TrendingUpOutlined color="warning" sx={{fontSize:18}}/>)}
                      <Typography sx={{fontWeight:900,fontSize:"1.15rem"}}>{val}</Typography>
                    </Stack>
                  </Box>
                )}
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",xl:"2fr 1fr 1fr"},gap:1.25,alignItems:"stretch"}}>
          <Card elevation={0} sx={chartPanel}>
            <CardContent sx={{flex:1,display:"flex",flexDirection:"column",p:1.7,"&:last-child":{pb:1.7}}}>
              <CardHeading
                title="Pipeline no fechamento"
                subtitle={`${periodUniverse} task(s) distribuídas pelo status no snapshot final`}
                info="Distribui pelo status no snapshot de fechamento somente as Correções Clientes que participam do universo do período e filtros atuais. A soma das barras corresponde ao universo do período. Registro aparece no pipeline, mas é excluído de backlog."
              />
              <Box sx={{flex:1,minHeight:Math.max(290,pipeline.length*29),mt:.8}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipeline} layout="vertical" margin={{left:12,right:38,top:4,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 5" horizontal={false} stroke={theme.palette.divider} opacity={.55}/>
                    <XAxis type="number" allowDecimals={false} tick={{fill:theme.palette.text.secondary,fontSize:11}}/>
                    <YAxis type="category" dataKey="name" width={122} tick={{fill:theme.palette.text.secondary,fontSize:11}}/>
                    <ChartTooltip cursor={{fill:theme.palette.action.hover}}/>
                    <Bar dataKey="total" radius={[0,6,6,0]}
                      onClick={data=>{const name=(data as {name?:string}).name;if(name)selectSlice({kind:"status",value:name},`Status · ${name}`)}}>
                      {pipeline.map((_,index)=><Cell key={index} fill={chartPalette[index%chartPalette.length]}/>)}
                      <LabelList dataKey="total" position="right" fill={theme.palette.text.secondary}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>

          <Card elevation={0} sx={chartPanel}>
            <CardContent sx={{flex:1,display:"flex",flexDirection:"column",p:1.7,"&:last-child":{pb:1.7}}}>
              <CardHeading
                title="Urgência"
                subtitle="Distribuição do universo do período"
                info="Agrupa o mesmo universo do período pela urgência/criticidade registrada no Azure. Respeita todos os filtros globais. Clique em uma barra para abrir as Tasks correspondentes."
              />
              <Box sx={{flex:1,minHeight:300,mt:.8}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={urgency} layout="vertical" margin={{left:10,right:34,top:8,bottom:8}}>
                    <CartesianGrid strokeDasharray="3 5" horizontal={false} stroke={theme.palette.divider} opacity={.55}/>
                    <XAxis type="number" allowDecimals={false} tick={{fill:theme.palette.text.secondary,fontSize:11}}/>
                    <YAxis type="category" dataKey="name" width={88} tick={{fill:theme.palette.text.secondary,fontSize:11}}/>
                    <ChartTooltip cursor={{fill:theme.palette.action.hover}}/>
                    <Bar dataKey="total" fill={semanticChartColors.attention} radius={[0,6,6,0]}
                      onClick={data=>{const name=(data as {name?:string}).name;if(name)selectSlice({kind:"urgency",value:name},`Urgência · ${name}`)}}>
                      <LabelList dataKey="total" position="right" fill={theme.palette.text.secondary}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>

          <Card elevation={0} sx={chartPanel}>
            <CardContent sx={{flex:1,display:"flex",flexDirection:"column",p:1.7,"&:last-child":{pb:1.7}}}>
              <CardHeading
                title="Priorização"
                subtitle="Priorizadas x não priorizadas"
                info="Agrupa o mesmo universo do período pelo campo Priorizada do Azure. Respeita os filtros globais. Clique em um segmento para abrir as Tasks correspondentes."
              />
              <Box sx={{height:220,mt:.5}}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={priority} dataKey="total" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3}
                      onClick={data=>{const name=(data as {name?:string}).name;if(name)selectSlice({kind:"prioritized",value:name==="Priorizadas"?true:name==="Não priorizadas"?false:null},`Priorização · ${name}`)}}>
                      {priority.map((_,index)=><Cell key={index} fill={[aliareColors.green,aliareColors.info,semanticChartColors.attention][index%3]}/>)}
                    </Pie>
                    <ChartTooltip/>
                  </PieChart>
                </ResponsiveContainer>
              </Box>
              <Stack spacing={0.65} sx={{mt:"auto"}}>
                {priority.map(item=>
                  <Button key={item.name} size="small" onClick={()=>selectSlice(
                    {kind:"prioritized",value:item.name==="Priorizadas"?true:item.name==="Não priorizadas"?false:null},
                    `Priorização · ${item.name}`,
                  )} sx={{justifyContent:"space-between",textTransform:"none",color:"text.primary",px:.8,borderRadius:1.5}}>
                    <Typography variant="body2">{item.name}</Typography>
                    <Chip size="small" label={item.total}/>
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Box>

        <Card elevation={0} sx={panel}>
          <CardContent sx={{p:{xs:1.4,md:1.7},"&:last-child":{pb:{xs:1.4,md:1.7}}}}>
            <Stack direction={{xs:"column",lg:"row"}} justifyContent="space-between" alignItems={{lg:"center"}} gap={1}>
              <Box sx={{minWidth:0}}>
                <Box sx={{display:"flex",alignItems:"center",gap:.55}}>
                  <AssessmentOutlined color="primary" sx={{fontSize:20}}/>
                  <Typography sx={{fontWeight:900}}>Tasks do recorte</Typography>
                  <InfoButton
                    title="Tasks do recorte"
                    description="Lista as Tasks correspondentes aos filtros globais e ao card/gráfico selecionado. A exportação respeita também a busca textual atual. Clique em uma linha para abrir o detalhamento lateral."
                  />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {activeDrillLabel} · {detailed.length} task(s){search.trim()?" após busca textual":""}
                </Typography>
              </Box>
              <Stack direction={{xs:"column",sm:"row"}} gap={0.8} sx={{width:{xs:"100%",lg:"auto"}}}>
                <TextField size="small" label="Buscar ID ou título" value={search} onChange={event=>setSearch(event.target.value)}
                  sx={{minWidth:{sm:260}}}/>
                <ExportCorrectionTasksButton
                  rows={detailed}
                  title={`Correções Azure · ${activeDrillLabel}`}
                  subtitle={`Período ${month} · filtros e busca atuais`}
                />
              </Stack>
            </Stack>

            <TableContainer sx={{mt:1.2,maxHeight:520,border:"1px solid",borderColor:"divider",borderRadius:2,overflow:"auto"}}>
              <Table stickyHeader size="small">
                <TableHead sx={{"& .MuiTableCell-head":{bgcolor:theme.palette.mode==="dark"?"#111827":"#172033",color:"#fff",fontWeight:850,borderBottom:"none",whiteSpace:"nowrap"}}}>
                  <TableRow>
                    {["ID","Título","Cliente","Criado por","Criação","Status","Última mudança","Urgência","Priorizada","Responsável","Conclusão/Cancelamento"].map(header=><TableCell key={header}>{header}</TableCell>)}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detailed.map(row=>
                    <TableRow hover key={row.id} onClick={()=>{setSelectedTaskId(row.id);setDrawerTitle(`Task #${row.id}`);setDrawerOpen(true)}} sx={{cursor:"pointer"}}>
                      <TableCell><Button size="small" onClick={event=>{event.stopPropagation();setDrawerOpen(false);navigate(`/correcoes?task=${row.id}`)}}>{row.id}</Button></TableCell>
                      <TableCell sx={{minWidth:240,maxWidth:360,fontWeight:650}}>{row.title}</TableCell>
                      <TableCell>{row.client||"—"}</TableCell>
                      <TableCell>{row.createdBy||"—"}</TableCell>
                      <TableCell>{fmt(row.createdAt)}</TableCell>
                      <TableCell><Chip size="small" label={row.status}/></TableCell>
                      <TableCell>{fmt(row.lastStateChangedAt)}</TableCell>
                      <TableCell>{row.urgency||"—"}</TableCell>
                      <TableCell>{row.prioritized===null?"—":row.prioritized?"Sim":"Não"}</TableCell>
                      <TableCell>{row.assignedTo||"—"}</TableCell>
                      <TableCell>{TERMINAL.has(row.status)?fmt(row.terminalAt):"—"}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="caption" color="text.secondary" sx={{display:"block",mt:.9}}>
              Fonte: {report.source}. O fechamento histórico não deve ser alterado por movimentações posteriores ao período.
            </Typography>
          </CardContent>
        </Card>

        <Drawer anchor="right" open={drawerOpen} onClose={()=>setDrawerOpen(false)}
          slotProps={{paper:{sx:detailDrawerPaperSx}}}>
          <DetailPanelHeader
            eyebrow={`Correções Clientes · ${month}`}
            title={drawerTitle}
            identifier={`${drawerRows.length} task(s) no recorte`}
            onClose={()=>setDrawerOpen(false)}
          />

          <Stack direction={{xs:"column",sm:"row"}} spacing={0.8} sx={{mb:2}}>
            <ExportCorrectionTasksButton
              rows={drawerRows}
              title={`Correções Azure · ${drawerTitle}`}
              subtitle={`Período ${month} · recorte do painel mensal`}
              fullWidth
            />
            <Button fullWidth size="small" variant="outlined" startIcon={<ShareOutlined/>} onClick={shareSelection}>
              Compartilhar recorte
            </Button>
          </Stack>

          {selectedTask&&<>
            <DetailSection title="Task selecionada">
              <Box sx={{p:1.2,border:"1px solid",borderColor:"primary.main",borderRadius:2,bgcolor:"action.hover"}}>
                <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
                  <Box sx={{minWidth:0}}>
                    <Typography variant="caption" color="text.secondary">Correção Clientes #{selectedTask.id}</Typography>
                    <Typography sx={{fontWeight:850,mt:.25}}>{selectedTask.title}</Typography>
                  </Box>
                  <Chip size="small" label={selectedTask.status}/>
                </Stack>
                <Box sx={{mt:1.2}}>
                  <DetailFieldGrid fields={[
                    ["Cliente",selectedTask.client||"Não informado"],
                    ["Urgência",selectedTask.urgency||"Não informado"],
                    ["Criado por",selectedTask.createdBy||"Não informado"],
                    ["Responsável atual",selectedTask.assignedTo||"Não informado"],
                    ["Data de criação",fmt(selectedTask.createdAt)],
                    ["Última mudança de status",fmt(selectedTask.lastStateChangedAt)],
                    ["Priorizada",selectedTask.prioritized===null?"Não informado":selectedTask.prioritized?"Sim":"Não"],
                    ["Conclusão/Cancelamento",TERMINAL.has(selectedTask.status)?fmt(selectedTask.terminalAt):"Não aplicável"],
                  ]}/>
                </Box>
                <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(3,minmax(0,1fr))"},gap:.7,mt:1.2}}>
                  <Button size="small" variant="contained" onClick={()=>{setDrawerOpen(false);navigate(`/correcoes?task=${selectedTask.id}`)}}>
                    Ver no Hub
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<ShareOutlined/>} onClick={()=>shareTask(selectedTask)}>
                    Compartilhar
                  </Button>
                  {selectedTask.remoteUrl&&
                    <Button size="small" variant="outlined" endIcon={<OpenInNewOutlined/>} component="a"
                      href={selectedTask.remoteUrl} target="_blank" rel="noopener noreferrer">
                      Azure
                    </Button>
                  }
                </Box>
              </Box>
            </DetailSection>
            <Divider sx={{mb:2}}/>
          </>}

          <DetailSection title="Tasks">
            <Stack spacing={0.8}>
              {drawerRows.map(row=>
                <Button
                  key={row.id}
                  variant={selectedTaskId===row.id?"contained":"outlined"}
                  color={selectedTaskId===row.id?"primary":"inherit"}
                  onClick={()=>setSelectedTaskId(row.id)}
                  sx={{justifyContent:"flex-start",textTransform:"none",textAlign:"left",p:1.05,borderRadius:2}}
                >
                  <Box sx={{minWidth:0,width:"100%"}}>
                    <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                      <Typography sx={{fontWeight:800,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        #{row.id} · {row.title}
                      </Typography>
                      <Chip size="small" label={row.status} sx={{flexShrink:0}}/>
                    </Stack>
                    <Typography variant="caption" color={selectedTaskId===row.id?"inherit":"text.secondary"} sx={{display:"block",mt:.25}}>
                      {[row.client,row.urgency,row.assignedTo].filter(Boolean).join(" · ")||"Sem dimensões adicionais"}
                    </Typography>
                  </Box>
                </Button>
              )}
              {!drawerRows.length&&<Alert severity="info">Nenhuma Task encontrada neste recorte.</Alert>}
            </Stack>
          </DetailSection>
        </Drawer>
      </>
    }
  </Box>;
}
