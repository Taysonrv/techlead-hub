import { Box, Tab, Tabs } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { Tickets } from "./Tickets";
import { MyOperation } from "./MyOperation";
export function OperationsHub(){
 const location=useLocation(),navigate=useNavigate();
 const mine=location.pathname.endsWith("/minha-operacao");
 return <Box><Tabs value={mine?"mine":"tickets"} onChange={(_,v)=>navigate(v==="mine"?"/operacao/minha-operacao":"/operacao/tickets")} variant="scrollable" scrollButtons="auto" sx={{mb:2}}><Tab value="tickets" label="Tickets"/><Tab value="mine" label="Minha Operação"/></Tabs>{mine?<MyOperation/>:<Tickets/>}</Box>;
}