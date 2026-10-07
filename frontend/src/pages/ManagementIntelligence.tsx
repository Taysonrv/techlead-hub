import { Box,Card,CardContent,Chip,Stack,Tab,Tabs,Typography,useTheme } from "@mui/material";
import { AutoGraphOutlined,GroupsOutlined,PsychologyOutlined,RadarOutlined } from "@mui/icons-material";
import { useMemo } from "react";
import { useLocation,useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Intelligence } from "./Intelligence";
import { Coordination } from "./Coordination";
import { TechnicalLeadership } from "./TechnicalLeadership";

type Section="executive"|"intelligence"|"coordination"|"leadership";
const routes:Record<Section,string>={executive:"/gestao-inteligencia",intelligence:"/gestao-inteligencia/inteligencia",coordination:"/gestao-inteligencia/coordenacao",leadership:"/gestao-inteligencia/lideranca"};

export function ManagementIntelligence(){
 const location=useLocation(),navigate=useNavigate(),theme=useTheme();
 const section:Section=location.pathname.endsWith("/inteligencia")?"intelligence":location.pathname.endsWith("/coordenacao")?"coordination":location.pathname.endsWith("/lideranca")?"leadership":"executive";
 const cards=useMemo(()=>[
  {key:"intelligence" as Section,title:"Inteligência operacional",detail:"Anomalias, recorrências, clusters, DNA Técnico e confiabilidade das evidências.",icon:<PsychologyOutlined/>},
  {key:"coordination" as Section,title:"Coordenação",detail:"Carga, prioridades, SLA × OLA, CSAT, serviços e qualidade operacional.",icon:<GroupsOutlined/>},
  {key:"leadership" as Section,title:"Liderança técnica",detail:"Radar, auditoria, gaps, recorrências e desenvolvimento técnico.",icon:<RadarOutlined/>},
 ],[]);
 if(section==="intelligence") return <Intelligence/>;
 if(section==="coordination") return <Coordination/>;
 if(section==="leadership") return <TechnicalLeadership/>;
 return <Box sx={{pb:4}}>
  <PageHeader eyebrow="Gestão 2.1" title="Central de Gestão & Inteligência" description="Uma única porta de entrada para decisão executiva, coordenação operacional e liderança técnica da carteira SIMER."/>
  <Tabs value={section} onChange={(_,v:Section)=>navigate(routes[v])} variant="scrollable" scrollButtons="auto" sx={{mb:2}}>
   <Tab value="executive" label="Visão executiva"/><Tab value="intelligence" label="Inteligência"/><Tab value="coordination" label="Operação & Coordenação"/><Tab value="leadership" label="Liderança Técnica"/>
  </Tabs>
  <Stack direction={{xs:"column",md:"row"}} spacing={1} sx={{mb:2}}><Chip label="Carteira SIMER" color="success" variant="outlined"/><Chip label="Inteligência + Coordenação + Liderança" variant="outlined"/><Chip label="Motores especializados preservados" variant="outlined"/></Stack>
  <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"repeat(3,1fr)"},gap:2}}>
   {cards.map(card=><Card key={card.key} elevation={0} role="button" tabIndex={0} onClick={()=>navigate(routes[card.key])} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")navigate(routes[card.key])}} sx={{border:"1px solid",borderColor:"divider",borderRadius:3,minHeight:210,background:theme.palette.mode==="dark"?"linear-gradient(145deg,rgba(12,31,55,.96),rgba(8,22,40,.98))":"linear-gradient(145deg,#fff,#f8fbff)",transition:"transform .16s ease,border-color .16s ease"}}>
    <CardContent sx={{height:"100%",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
     <Box><Box sx={{width:44,height:44,borderRadius:2,display:"grid",placeItems:"center",bgcolor:"action.hover",mb:2}}>{card.icon}</Box><Typography variant="h6" sx={{fontWeight:900}}>{card.title}</Typography><Typography variant="body2" color="text.secondary" sx={{mt:1,lineHeight:1.65}}>{card.detail}</Typography></Box>
     <Stack direction="row" spacing={1} sx={{alignItems:"center",mt:2}}><AutoGraphOutlined fontSize="small"/><Typography variant="caption" sx={{fontWeight:800}}>Abrir módulo especializado</Typography></Stack>
    </CardContent>
   </Card>)}
  </Box>
 </Box>;
}
