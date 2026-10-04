import { Box, Tab, Tabs } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { Attention } from "./Attention";
import { DataQuality } from "./DataQuality";
export function RiskPendingHub(){
 const location=useLocation(),navigate=useNavigate();
 const quality=location.pathname.endsWith("/qualidade");
 return <Box><Tabs value={quality?"quality":"risk"} onChange={(_,v)=>navigate(v==="quality"?"/pendencias-riscos/qualidade":"/pendencias-riscos")} variant="scrollable" scrollButtons="auto" sx={{mb:2}}><Tab value="risk" label="Riscos & Atenção"/><Tab value="quality" label="Qualidade & Governança"/></Tabs>{quality?<DataQuality/>:<Attention/>}</Box>;
}