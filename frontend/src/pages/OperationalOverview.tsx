import { Box, Tab, Tabs } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { Performance } from "./Performance";
export function OperationalOverview(){
 const location=useLocation(),navigate=useNavigate();
 const performance=location.pathname.endsWith("/desempenho");
 return <Box><Tabs value={performance?"performance":"summary"} onChange={(_,v)=>navigate(v==="performance"?"/visao-operacional/desempenho":"/visao-operacional")} variant="scrollable" scrollButtons="auto" sx={{mb:2}}><Tab value="summary" label="Resumo executivo"/><Tab value="performance" label="Desempenho & SLA"/></Tabs>{performance?<Performance/>:<Dashboard/>}</Box>;
}