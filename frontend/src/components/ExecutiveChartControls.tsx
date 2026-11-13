import { AnalyticalLinePlot } from "./AnalyticalLinePlot";
import { useMemo, useState } from "react";
import {
  Box, Button, IconButton, Stack, Tooltip, Typography,
} from "@mui/material";
import ListAltOutlined from "@mui/icons-material/ListAltOutlined";

type Part={name:string;value:number;color:string};
type Series={key:string;name:string;color:string};
type Period={month:string;[key:string]:string|number};
type Props={title:string;description:string;embedded?:boolean};

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
    <Stack direction="row" sx={{gap:.4,flexWrap:"wrap",alignItems:"center",maxHeight:170,overflowY:"auto"}}>
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
export function SelectableDonut({title,description,parts,onInspect,embedded=false}:Props&{
  parts:Part[];onInspect?:(name:string)=>void;
}){
 const keys=useMemo(()=>parts.map(p=>p.name),[parts]);const choice=useSelection(keys);
 const visibleParts=parts.filter(p=>choice.visible.has(p.name)&&p.value>0);
 const visibleTotal=visibleParts.reduce((sum,p)=>sum+p.value,0);
 let offset=0;const slices=visibleParts.map(part=>{const start=offset;offset+=part.value/Math.max(1,visibleTotal)*100;return {...part,start,end:offset};});
 return <Box sx={embedded?{minWidth:0}:surface}>
  {title&&<Typography variant="subtitle1" sx={{fontWeight:750}}>{title}</Typography>}
  {description&&<Typography variant="caption" color="text.secondary">{description}</Typography>}
  {visibleTotal>0?<Box sx={{minHeight:230,display:"grid",placeItems:"center",py:2}}>
   <Box role="img" aria-label={slices.map(p=>`${p.name}: ${p.value}`).join(", ")} title="Clique no segmento para consultar os registros"
    onClick={event=>{if(!onInspect)return;const rect=event.currentTarget.getBoundingClientRect();const dx=event.clientX-rect.left-rect.width/2,dy=event.clientY-rect.top-rect.height/2;const radius=Math.hypot(dx,dy);if(radius<rect.width*.31||radius>rect.width/2)return;const angle=((Math.atan2(dy,dx)*180/Math.PI+450)%360)/3.6;const part=slices.find(p=>angle>=p.start&&angle<p.end);if(part)onInspect(part.name);}}
    sx={{width:190,height:190,borderRadius:"50%",background:`conic-gradient(${slices.map(p=>`${p.color} ${p.start}% ${p.end}%`).join(",")})`,display:"grid",placeItems:"center",cursor:onInspect?"pointer":"default",printColorAdjust:"exact",WebkitPrintColorAdjust:"exact"}}>
     <Box sx={{width:120,height:120,borderRadius:"50%",bgcolor:"background.paper",display:"grid",placeContent:"center",textAlign:"center",pointerEvents:"none"}}>
      <Typography variant="h5" sx={{fontWeight:800}}>{readable(visibleTotal)}</Typography><Typography variant="caption" color="text.secondary">visíveis</Typography>
     </Box>
   </Box>
  </Box>:empty}
  <Selector parts={parts.map(p=>({...p,detail:readable(p.value)+" · "+(choice.visible.has(p.name)?percent(p.value,visibleTotal):"oculto")}))} visible={choice.visible} toggle={choice.toggle} all={choice.all} clear={choice.clear} onInspect={onInspect}/>
  <Typography variant="caption" color="text.secondary" sx={{display:"block",mt:.7}}>Percentuais sobre os itens visíveis. O ícone ao lado do nome também abre os registros.</Typography>
 </Box>;
}
export function SelectableHorizontalBars({title,description,parts,onInspect,embedded=false}:Props&{parts:Part[];onInspect?:(name:string)=>void}){
 const keys=useMemo(()=>parts.map(p=>p.name),[parts]);const choice=useSelection(keys);
 const visible=parts.filter(p=>choice.visible.has(p.name));const total=visible.reduce((sum,p)=>sum+p.value,0);const maximum=Math.max(1,...visible.map(p=>p.value));
 return <Box sx={embedded?{minWidth:0}:surface}>
  {title&&<Typography variant="subtitle1" sx={{fontWeight:750}}>{title}</Typography>}
  {description&&<Typography variant="caption" color="text.secondary">{description}</Typography>}
  <Stack direction="row" sx={{gap:1,mt:1,mb:1,flexWrap:"wrap"}}><Button size="small" onClick={choice.all}>Mostrar todos</Button><Button size="small" color="inherit" onClick={choice.clear}>Ocultar todos</Button></Stack>
  {parts.length?<Stack spacing={1.2} sx={{maxHeight:380,overflowY:"auto",pr:.5}}>
   {parts.map(p=><Box key={p.name} sx={{minWidth:0}}>
    <Stack direction="row" sx={{alignItems:"center",gap:.7,minWidth:0}}>
     <Button size="small" aria-pressed={choice.visible.has(p.name)} aria-label={(choice.visible.has(p.name)?"Ocultar ":"Mostrar ")+p.name} onClick={()=>choice.toggle(p.name)}
      sx={{textTransform:"none",textAlign:"left",justifyContent:"flex-start",minWidth:0,flex:1,color:"text.primary",opacity:choice.visible.has(p.name)?1:.45,textDecoration:choice.visible.has(p.name)?"none":"line-through",overflowWrap:"anywhere",px:0}}>
      <Box component="span" sx={{width:8,height:8,borderRadius:"50%",bgcolor:p.color,flexShrink:0,mr:1}}/>{p.name}
     </Button>
     <Typography variant="caption" sx={{fontWeight:800,whiteSpace:"nowrap"}}>{choice.visible.has(p.name)?`${readable(p.value)} · ${percent(p.value,total)}`:"oculto"}</Typography>
     {onInspect&&<IconButton size="small" aria-label={"Listar atendimentos de "+p.name} onClick={()=>onInspect(p.name)}><ListAltOutlined fontSize="small"/></IconButton>}
    </Stack>
    {choice.visible.has(p.name)&&<Box component={onInspect?"button":"div"} onClick={()=>onInspect?.(p.name)} aria-label={`Consultar ${p.name}: ${p.value}`} title={`${p.name}: ${p.value}`}
      sx={{display:"block",width:"100%",height:13,p:0,border:0,borderRadius:1,bgcolor:"action.hover",overflow:"hidden",cursor:onInspect?"pointer":"default"}}>
      <Box sx={{height:"100%",width:`${p.value>0?Math.max(1,p.value/maximum*100):0}%`,bgcolor:p.color,borderRadius:1,printColorAdjust:"exact"}}/>
    </Box>}
   </Box>)}
  </Stack>:empty}
  <Typography variant="caption" color="text.secondary" sx={{display:"block",mt:1}}>Clique no nome para ocultar ou reexibir; na barra, consulte os registros.</Typography>
 </Box>;
}
export function SelectableLines({title,description,data,series,onInspect,embedded=false}:Props&{data:Period[];series:Series[];onInspect?:(period:string,seriesKey:string)=>void}){
 const keys=useMemo(()=>series.map(s=>s.key),[series]);const choice=useSelection(keys);
 return <Box sx={embedded?{minWidth:0}:surface}>
  {title&&<Typography variant="subtitle1" sx={{fontWeight:750}}>{title}</Typography>}
  {description&&<Typography variant="caption" color="text.secondary">{description}</Typography>}
  <AnalyticalLinePlot data={data.map(row=>({...row,key:row.month,label:typeof row.label==="string"?row.label:row.month}))} series={series.filter(s=>choice.visible.has(s.key))} onInspect={onInspect}/>
  {onInspect&&<Typography variant="caption" color="text.secondary" sx={{display:"block",mt:1}}>Clique no ponto do gráfico para consultar o período e a série.</Typography>}
  <Selector parts={series.map(s=>({name:s.name,key:s.key,color:s.color}))} visible={choice.visible} toggle={choice.toggle} all={choice.all} clear={choice.clear}/>
 </Box>;
}
