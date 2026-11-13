import { useMemo, useState } from "react";
import {
  Box, Button, IconButton, Stack, Tooltip, Typography,
} from "@mui/material";
import ListAltOutlined from "@mui/icons-material/ListAltOutlined";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";

type Part={name:string;value:number;color:string};
type Series={key:string;name:string;color:string};
type Period={month:string;[key:string]:string|number};
type Props={title:string;description:string};

const readable=(count:number)=>count.toLocaleString("pt-BR");
const percent=(part:number,total:number)=>total>0?(100*part/total).toLocaleString("pt-BR",{maximumFractionDigits:1})+"%":"0%";
const surface={minWidth:0,p:2.25,border:"1px solid",borderColor:"divider",borderRadius:3,backgroundColor:"background.paper"};
const empty=<Box sx={{minHeight:160,display:"grid",placeItems:"center"}}><Typography variant="body2" color="text.secondary">Nenhum campo selecionado ou sem dados para este período.</Typography></Box>;

/** Selectable fields are local to a chart and never rewrite source ticket totals. */
function useSelection(keys:string[]){
  const [selected,setSelected]=useState<string[]|null>(null);
  const visible=useMemo(()=>new Set(selected===null?keys:selected.filter(k=>keys.includes(k))),[selected,keys]);
  const toggle=(name:string)=>{
    setSelected(current=>{
      const from=current===null?[...keys]:current.filter(x=>keys.includes(x));
      return from.includes(name)?from.filter(x=>x!==name):[...from,name];
    });
  };
  return {visible,toggle,all:()=>setSelected(null),clear:()=>setSelected([]),allSelected:keys.every(k=>visible.has(k))};
}
function Selector({parts,visible,toggle,all,clear,onInspect}:{
  parts:Array<{name:string;color:string;detail?:string;key?:string}>;
  visible:Set<string>;toggle:(key:string)=>void;all:()=>void;clear:()=>void;onInspect?:(key:string)=>void;
}){
  return <Stack spacing={.65} sx={{mt:1.2}}>
    <Stack direction="row" sx={{gap:.8,flexWrap:"wrap",alignItems:"center"}}>
      <Button size="small" variant="text" onClick={all} sx={{textTransform:"none",fontWeight:700}}>Mostrar todos</Button>
      <Button size="small" variant="text" color="inherit" onClick={clear} sx={{textTransform:"none"}}>Ocultar todos</Button>
      <Typography variant="caption" color="text.secondary">Clique na legenda para ocultar ou reexibir</Typography>
    </Stack>
    <Stack direction="row" sx={{gap:.4,flexWrap:"wrap",alignItems:"center"}}>
      {parts.map(part=><Tooltip key={part.key??part.name} title={part.detail??""} disableHoverListener={!part.detail}>
        <Box component="span" sx={{display:"inline-flex",alignItems:"center",minWidth:0}}>
          <Button
            size="small"
            aria-pressed={visible.has(part.key??part.name)}
            aria-label={(visible.has(part.key??part.name)?"Ocultar ":"Mostrar ")+part.name}
            onClick={()=>toggle(part.key??part.name)}
            sx={{textTransform:"none",textAlign:"left",justifyContent:"flex-start",minWidth:0,px:1,py:.6,gap:.8,
              color:"text.primary",fontWeight:500,fontSize:12,borderRadius:2,
              opacity:visible.has(part.key??part.name)?1:.5,
              textDecoration:visible.has(part.key??part.name)?"none":"line-through",
              "&:focus-visible":{outline:"2px solid",outlineColor:part.color,outlineOffset:2}}}>
            <Box component="span" aria-hidden="true" sx={{width:9,height:9,flexShrink:0,borderRadius:"50%",bgcolor:part.color}}/>
            {part.name+(part.detail?" · "+part.detail:"")}
          </Button>
          {onInspect&&<IconButton size="small" aria-label={"Listar atendimentos de "+part.name}
            onClick={()=>onInspect(part.key??part.name)} sx={{mr:1.5}}>
            <ListAltOutlined fontSize="small"/>
          </IconButton>}
        </Box>
      </Tooltip>)}
    </Stack>
  </Stack>;
}
export function SelectableDonut({title,description,parts,onInspect}:Props&{
  parts:Part[];
  onInspect?:(name:string)=>void;
}){
  const keys=useMemo(()=>parts.map(p=>p.name),[parts]);
  const choice=useSelection(keys);
  const visibleParts=parts.filter(p=>choice.visible.has(p.name)&&p.value>0);
  const visibleTotal=visibleParts.reduce((sum,p)=>sum+p.value,0);
  return <Box sx={surface}>
    <Typography variant="subtitle1" sx={{fontWeight:750}}>{title}</Typography>
    <Typography variant="caption" color="text.secondary">{description}</Typography>
    {visibleParts.length?<Box sx={{height:265,minWidth:0,position:"relative",mt:1}}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={visibleParts} dataKey="value" nameKey="name" cx="50%" cy="49%"
            innerRadius={57} outerRadius={95} stroke="none" paddingAngle={3}
            labelLine={false} label={({percent:partPercent})=>Number(partPercent??0)>=.045?
              (100*Number(partPercent)).toFixed(1).replace(".",",")+"%":""}>
            {visibleParts.map(p=><Cell key={p.name} fill={p.color}
              onClick={()=>onInspect?.(p.name)} style={{cursor:onInspect?"pointer":"default"}}/>)}
          </Pie>
          <RechartsTooltip formatter={(value,name)=>{
            const val=Number(value??0);
            return [readable(val)+" tickets ("+percent(val,visibleTotal)+")",String(name)];
          }}/>
        </PieChart>
      </ResponsiveContainer>
      <Box sx={{position:"absolute",pointerEvents:"none",top:"48%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
        <Typography variant="h5" sx={{fontWeight:800}}>{readable(visibleTotal)}</Typography>
        <Typography variant="caption" color="text.secondary">selecionados</Typography>
      </Box>
    </Box>:empty}
    <Selector parts={parts.map(p=>({...p,detail:readable(p.value)+" · "+(choice.visible.has(p.name)?percent(p.value,visibleTotal):"oculto")}))}
      visible={choice.visible} toggle={choice.toggle} all={choice.all} clear={choice.clear} onInspect={onInspect}/>
    <Typography variant="caption" color="text.secondary" sx={{display:"block",mt:.7}}>
      Percentuais recalculados sobre os itens visíveis. Clique em um segmento para consultar os atendimentos.
    </Typography>
  </Box>;
}
export function SelectableHorizontalBars({title,description,parts,onInspect}:Props&{
  parts:Part[];onInspect?:(name:string)=>void;
}){
  const keys=useMemo(()=>parts.map(x=>x.name),[parts]);
  const choice=useSelection(keys);
  const visibleParts=parts.filter(x=>choice.visible.has(x.name));
  const total=visibleParts.reduce((s,p)=>s+p.value,0);
  return <Box sx={surface}>
    <Typography variant="subtitle1" sx={{fontWeight:750}}>{title}</Typography>
    <Typography variant="caption" color="text.secondary">{description}</Typography>
    {visibleParts.length?<Box sx={{height:Math.max(230,visibleParts.length*48),minWidth:0,mt:1.5}}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={visibleParts} layout="vertical" margin={{top:5,right:40,left:4,bottom:5}}>
          <CartesianGrid strokeDasharray="3 4" horizontal={false} stroke="rgba(110,130,120,.18)"/>
          <XAxis type="number" allowDecimals={false} tick={{fontSize:11}}/>
          <YAxis type="category" dataKey="name" width={175} tick={{fontSize:11}}/>
          <RechartsTooltip formatter={(v)=>[readable(Number(v??0))+" tickets","Atendimentos"]}/>
          <Bar dataKey="value" name="Atendimentos" radius={[0,6,6,0]} maxBarSize={28}>
            {visibleParts.map(p=><Cell key={p.name} fill={p.color}
              onClick={()=>onInspect?.(p.name)} style={{cursor:onInspect?"pointer":"default"}}/>)}
            <LabelList dataKey="value" position="right" style={{fontSize:11,fill:"currentColor"}}/>
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>:empty}
    <Selector parts={parts.map(p=>({...p,detail:percent(p.value,total)}))} visible={choice.visible}
      toggle={choice.toggle} all={choice.all} clear={choice.clear} onInspect={onInspect}/>
  </Box>;
}
export function SelectableLines({title,description,data,series,onInspect}:Props&{
  data:Period[];series:Series[];onInspect?:(month:string,seriesKey:string)=>void;
}){
  const keys=useMemo(()=>series.map(s=>s.key),[series]);
  const choice=useSelection(keys);
  const selectedSeries=series.filter(s=>choice.visible.has(s.key));
  const [selectedMonth,setSelectedMonth]=useState("");
  const months=data.map(d=>String(d.month));
  const openMonth=(month:string)=>onInspect?.(month,"tickets");
  return <Box sx={surface}>
    <Typography variant="subtitle1" sx={{fontWeight:750}}>{title}</Typography>
    <Typography variant="caption" color="text.secondary">{description}</Typography>
    {selectedSeries.length&&data.length?<Box sx={{height:270,minWidth:0,mt:1}}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{top:12,left:-14,right:23,bottom:0}}
          onClick={state=>{
            const month=String(state?.activeLabel??"");
            const key=typeof state?.activeDataKey==="string" && selectedSeries.some(series=>series.key===state.activeDataKey)
              ? state.activeDataKey : "tickets";
            if(month&&onInspect)onInspect(month,key);
          }}>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="rgba(110,130,120,.2)"/>
          <XAxis dataKey="month" tick={{fontSize:11}}/>
          <YAxis tick={{fontSize:11}} allowDecimals={false}/>
          <RechartsTooltip/>
          {selectedSeries.map(s=><Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
            stroke={s.color} strokeWidth={3} dot={{r:4}} activeDot={{r:6}}/>)}
        </LineChart>
      </ResponsiveContainer>
    </Box>:empty}
    <Selector parts={series.map(s=>({name:s.name,key:s.key,color:s.color}))} visible={choice.visible}
      toggle={choice.toggle} all={choice.all} clear={choice.clear}
      onInspect={key=>{if(months.length&&onInspect)onInspect(selectedMonth||months[months.length-1]!,key);}}/>
    {onInspect&&months.length>0&&<Stack direction="row" sx={{gap:.55,alignItems:"center",flexWrap:"wrap",mt:1}}>
      <Typography variant="caption" color="text.secondary">Consultar mês:</Typography>
      {months.map(month=><Button key={month} size="small" variant={selectedMonth===month?"contained":"outlined"}
        onClick={()=>{setSelectedMonth(month);openMonth(month);}}
        sx={{textTransform:"none",minWidth:54,fontSize:11}}>{month.slice(5,7)+"/"+month.slice(2,4)}</Button>)}
    </Stack>}
  </Box>;
}
