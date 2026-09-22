import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import { AccountTreeOutlined, SearchOutlined, UploadFileOutlined, OpenInNewOutlined } from "@mui/icons-material";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";

type Summary = { total:number; maps:number; importedAt:string|null; builderApiUrl:string; items:Array<{mapName:string;total:number}> };
type Result = { id:number; sourceFile:string; mapName:string; nodeText:string; path:string; depth:number; parentPath:string|null };

export function SimerMap() {
  const [summary,setSummary]=useState<Summary|null>(null);
  const [query,setQuery]=useState("");
  const [items,setItems]=useState<Result[]>([]);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const loadSummary=useCallback(async()=>{ const r=await api.get<Summary>("/simer-map/summary"); setSummary(r.data); },[]);
  useEffect(()=>{void loadSummary();},[loadSummary]);

  async function search(){
    if(!query.trim()){setItems([]);return;}
    setLoading(true); setMessage("");
    try { const r=await api.get<{items:Result[]}>("/simer-map/search",{params:{q:query.trim()}}); setItems(r.data.items); }
    catch { setMessage("Não foi possível consultar o mapa SIMER."); } finally { setLoading(false); }
  }
  async function importFiles(files: FileList|null){
    if(!files?.length)return;
    setLoading(true); setMessage("");
    try {
      let total=0;
      for(const file of Array.from(files)){
        if(!file.name.toLowerCase().endsWith(".mm")) continue;
        const content=await file.text();
        const r=await api.post<{total:number}>("/simer-map/import",{sourceFile:file.name,content});
        total+=r.data.total;
      }
      setMessage(`Importação concluída: ${total} nó(s) de conhecimento processado(s).`);
      await loadSummary();
    } catch(e:unknown){ setMessage((e as {response?:{data?:{message?:string}}}).response?.data?.message ?? "Falha ao importar o mapa."); }
    finally{setLoading(false);}
  }

  return <Box sx={{pb:4}}>
    <PageHeader eyebrow="Liderança técnica" title="Mapa SIMER" description="Consulta inteligente da estrutura funcional e técnica do SIMER para apoiar análise de atendimentos, diagnóstico e abertura de correções." meta={summary ? `${summary.maps} mapa(s) · ${summary.total} nó(s) indexado(s)` : "Carregando base"} />
    <Box sx={{mt:2,display:"grid",gridTemplateColumns:{xs:"1fr",lg:"2fr 1fr"},gap:2}}>
      <Card variant="outlined" sx={{borderRadius:3}}><CardContent>
        <Stack direction={{xs:"column",md:"row"}} spacing={1}>
          <TextField fullWidth value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&void search()} placeholder="Ex.: Pedido de Compra, faturamento, ContainerRateio, saldo..." slotProps={{input:{startAdornment:<InputAdornment position="start"><SearchOutlined/></InputAdornment>}}}/>
          <Button variant="contained" onClick={()=>void search()} disabled={loading} sx={{minWidth:130}}>Consultar</Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">A busca considera rotina, objeto, classe, função e o caminho hierárquico do mapa.</Typography>
      </CardContent></Card>
      <Card variant="outlined" sx={{borderRadius:3}}><CardContent>
        <Stack direction="row" spacing={1} alignItems="center"><AccountTreeOutlined sx={{color:aliareColors.green}}/><Box><Typography sx={{fontWeight:850}}>Builder API</Typography><Typography variant="caption" color="text.secondary">{summary?.builderApiUrl ?? "Configurando..."}</Typography></Box></Stack>
        <Button component="a" href={summary?.builderApiUrl} target="_blank" rel="noreferrer" size="small" endIcon={<OpenInNewOutlined/>} sx={{mt:1}}>Abrir origem</Button>
      </CardContent></Card>
    </Box>
    <Card variant="outlined" sx={{mt:2,borderRadius:3}}><CardContent>
      <Stack direction={{xs:"column",md:"row"}} spacing={1} justifyContent="space-between" alignItems={{md:"center"}}>
        <Box><Typography sx={{fontWeight:900}}>Base de mapas</Typography><Typography variant="body2" color="text.secondary">Importe os arquivos .mm extraídos do pacote de mapas. Reimportações substituem a versão anterior do mesmo arquivo.</Typography></Box>
        <Button component="label" variant="outlined" startIcon={<UploadFileOutlined/>}>Importar .mm<input hidden type="file" multiple accept=".mm,text/xml,application/xml" onChange={e=>void importFiles(e.target.files)}/></Button>
      </Stack>
      {summary?.items?.length ? <Stack direction="row" spacing={.7} useFlexGap flexWrap="wrap" sx={{mt:1.5}}>{summary.items.slice(0,18).map(x=><Chip key={x.mapName} label={`${x.mapName} · ${x.total}`} onClick={()=>{setQuery(x.mapName);}}/>)}</Stack>:null}
      {message&&<Alert severity={message.startsWith("Importação")?"success":"warning"} sx={{mt:1.5}}>{message}</Alert>}
    </CardContent></Card>
    <Box sx={{mt:2}}>
      {loading?<Box sx={{py:6,textAlign:"center"}}><CircularProgress/></Box>:items.length?<Stack spacing={1}>{items.map(item=><Card key={item.id} variant="outlined" sx={{borderRadius:2.5,"&:hover":{borderColor:aliareColors.green,boxShadow:"0 10px 28px rgba(16,24,40,.07)"}}}><CardContent sx={{py:1.4,"&:last-child":{pb:1.4}}}><Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label={item.mapName}/><Typography sx={{fontWeight:850}}>{item.nodeText}</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{mt:.7}}>{item.path}</Typography><Typography variant="caption" color="text.disabled">{item.sourceFile} · nível {item.depth}</Typography></CardContent></Card>)}</Stack>:query&&<Alert severity="info">Nenhum ponto do mapa encontrado para esta consulta.</Alert>}
    </Box>
  </Box>;
}
