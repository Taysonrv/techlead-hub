import { useEffect,useMemo,useState } from "react";
import { Alert,Box,Button,Card,CardContent,Chip,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,Divider,FormControl,InputLabel,MenuItem,Select,Stack,TextField,Typography,useTheme } from "@mui/material";
import { AccountTreeOutlined,AnalyticsOutlined,PictureAsPdfOutlined,SearchOutlined,TimelineOutlined } from "@mui/icons-material";
import { useNavigate,useSearchParams } from "react-router-dom";
import { Bar,BarChart,CartesianGrid,Cell,Pie,PieChart,ResponsiveContainer,Tooltip as ChartTooltip,XAxis,YAxis } from "recharts";
import { api } from "../services/api"; import { PageHeader } from "../components/PageHeader"; import { SectionInfo } from "../components/SectionInfo";
type Item={id:string;type:string;title:string;subtitle:string;path:string};
type TopicData={query:string;terms:string[];context?:{original:string;concepts:string[];phrases:string[];interpretation:string;strategy:string};summary:{tickets:number;workItems:number;knownProblems:number;evidence:number;rules:number;clients:number;strongRecurrence:number};tickets:Array<{movideskId:number;subject:string;client?:string|null;status:string;score:number;matchedTerms:string[];deliveredVersion?:string|null;registeredVersion?:string|null}>;workItems:Array<{id:number;title:string;workItemType:string;state:string;client?:string|null;score:number;matchedTerms:string[];deliveredVersion?:string|null;registeredVersion?:string|null}>;knownProblems:Array<{id:number;title:string;symptom:string;solution:string;status:string;severity:string;score:number;matchedTerms:string[];workaround?:string|null;technicalSolution?:string|null;version?:string|null}>;evidence:Array<{id:number;title:string;path?:string;mapName?:string;score:number;kind:string}>;ruleItems:Array<{id?:number;name?:string;nodeText?:string;path?:string}>;topVersions:Array<{version:string;total:number}>;signals:string[]};
type InvestigationData={ticket:{movideskId:number;subject:string;client?:string;status:string;category?:string;cause?:string;owner?:string};summary:{similarCases:number;relatedWorkItems:number;technicalEvidence?:number;rules?:number;service?:string;version?:string};quality:{score:number;checks:Record<string,boolean>};similar:Array<{movideskId:number;subject:string;client?:string;score:number;reasons:string[];signals?:Array<{key:string;label:string;weight:number;matched:boolean;detail?:string}>;explanation?:{matchedSignals:number;matchedWeight:number;maxWeight:number}}>;workItems:Array<{id:number;title:string;workItemType:string;state:string}>;timeline:Array<{date:string;kind:string;title:string;source?:string;status?:string|null;path?:string;version?:string|null}>;evidence?:Array<{id:number;title:string;path?:string;mapName?:string;score:number;kind:string}>;ruleItems?:Array<{id?:number;name?:string;nodeText?:string;path?:string}>;anomalies?:string[];diagnosticPlan?:Array<{key:string;title:string;status:"ready"|"attention"|"neutral";detail:string}>;intelligence?:{clientDna:{client?:string|null;totalTickets:number;taskRate:number;topServices:Array<{name:string;total:number}>;topCategories:Array<{name:string;total:number}>;serviceCases:number;periodStart:string;periodEnd:string;monthly:Array<{month:string;total:number}>};recurrence:{strongCases:number;crossClient:boolean;clients:number;concentration:number};versionSignal?:{version:string;cases:number;text:string}|null;versionDistribution:Array<{version:string;total:number}>;clusters:Array<{service:string;category:string;version:string;cases:number;clients:number;tickets:number[];scope:"transversal"|"cliente"}>;signals:Array<{severity:"info"|"warning"|"success";title:string;detail:string}>;confidence:{score:number;basis:string[]}};technicalDna?:{product:string;client?:string|null;category?:string|null;cause?:string|null;service?:string|null;subject:string;version?:string|null;task?:number|null;taskStatus?:string|null;recurrence:string;crossClient:boolean;knownProblemCandidate:boolean;evidenceCount:number;ruleCount:number};knownProblemCandidate?:{eligible:boolean;level:"high"|"medium"|"low";strongCases:number;clients:number;rationale:string;suggestedTitle:string;path:string};anomalyRadar?:Array<{key:string;label:string;value:number;status:"attention"|"normal";detail:string}>};
type InvestigationReportInput={
 query:string;
 topicData:TopicData|null;
 data:InvestigationData|null;
 items:Item[];
 source?:string|null;
 origin?:string|null;
 sourceClient?:string|null;
 sourceTrend?:string|null;
 sourcePattern?:string|null;
 sourceConfidence?:string|null;
 clientScope:"all"|"predominant"|"others";
 comparison:{predominantTickets:number;otherTickets:number;otherClients:number}|null;
};

function reportEscape(value:unknown){
 return String(value??"—")
  .replace(/&/g,"&amp;")
  .replace(/</g,"&lt;")
  .replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;")
  .replace(/'/g,"&#039;");
}

function reportScalar(value:unknown):string{
 if(value===null||value===undefined||value==="") return "—";
 if(typeof value==="boolean") return value?"Sim":"Não";
 if(typeof value==="number") return String(value);
 if(typeof value==="string") return value;
 if(Array.isArray(value)) return value.map(reportScalar).join(" · ");
 try{return JSON.stringify(value)}catch{return String(value)}
}

const reportLabels:Record<string,string>={
 movideskId:"Atendimento",
 subject:"Assunto",
 client:"Cliente",
 status:"Status",
 score:"Score",
 matchedTerms:"Termos correlacionados",
 deliveredVersion:"Versão entregue",
 registeredVersion:"Versão registrada",
 id:"ID",
 title:"Título",
 workItemType:"Tipo",
 state:"Status Azure",
 severity:"Severidade",
 symptom:"Sintoma",
 solution:"Solução",
 workaround:"Solução de contorno",
 technicalSolution:"Solução técnica",
 version:"Versão",
 kind:"Tipo de evidência",
 mapName:"Mapa",
 path:"Caminho",
 total:"Quantidade",
 name:"Nome",
 nodeText:"Regra",
 date:"Data",
 source:"Fonte",
 reasons:"Motivos",
 signals:"Sinais",
 explanation:"Explicação",
 key:"Chave",
 label:"Indicador",
 value:"Valor",
 detail:"Detalhe",
 query:"Consulta",
 terms:"Termos",
 original:"Texto original",
 concepts:"Conceitos",
 phrases:"Frases",
 interpretation:"Interpretação",
 strategy:"Estratégia",
 tickets:"Tickets",
 workItems:"Itens Azure",
 knownProblems:"Problemas conhecidos",
 evidence:"Evidências",
 rules:"Regras",
 clients:"Clientes",
 strongRecurrence:"Recorrências fortes",
 similarCases:"Casos semelhantes",
 relatedWorkItems:"Itens Azure relacionados",
 technicalEvidence:"Evidências técnicas",
 service:"Serviço",
 quality:"Qualidade",
 checks:"Validações",
 owner:"Responsável",
 category:"Categoria",
 cause:"Causa",
};

function reportLabel(key:string){
 return reportLabels[key]??key.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,value=>value.toUpperCase());
}

function reportTable(rows:Array<Record<string,unknown>>,preferred?:string[]){
 if(!rows.length) return '<p class="empty">Nenhum registro.</p>';
 const discovered=[...new Set(rows.flatMap(row=>Object.keys(row)))];
 const columns=preferred?.length
  ? [...preferred.filter(key=>discovered.includes(key)),...discovered.filter(key=>!preferred.includes(key))]
  : discovered;
 return `<div class="table-wrap"><table><thead><tr>${columns.map(key=>`<th>${reportEscape(reportLabel(key))}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${columns.map(key=>`<td>${reportEscape(reportScalar(row[key]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function reportObject(title:string,value:unknown){
 if(value===null||value===undefined) return "";
 if(Array.isArray(value)){
  const rows=value.filter(item=>item&&typeof item==="object"&&!Array.isArray(item)) as Array<Record<string,unknown>>;
  if(rows.length===value.length) return `<section><h2>${reportEscape(title)}</h2>${reportTable(rows)}</section>`;
  return `<section><h2>${reportEscape(title)}</h2><div class="text-block">${reportEscape(reportScalar(value))}</div></section>`;
 }
 if(typeof value==="object"){
  const entries=Object.entries(value as Record<string,unknown>);
  return `<section><h2>${reportEscape(title)}</h2><div class="kv">${entries.map(([key,item])=>`<div><span>${reportEscape(reportLabel(key))}</span><strong>${reportEscape(reportScalar(item))}</strong></div>`).join("")}</div></section>`;
 }
 return `<section><h2>${reportEscape(title)}</h2><div class="text-block">${reportEscape(reportScalar(value))}</div></section>`;
}

function buildInvestigationReportHtml(input:InvestigationReportInput){
 const generatedAt=new Intl.DateTimeFormat("pt-BR",{dateStyle:"full",timeStyle:"medium"}).format(new Date());
 const subject=input.topicData?.query??(input.data?`#${input.data.ticket.movideskId} · ${input.data.ticket.subject}`:input.query);
 const sections:string[]=[];

 if(input.source==="leadership"){
  sections.push(reportObject("Origem da investigação",{
   origem:input.origin??"leadership",
   clientePredominante:input.sourceClient??null,
   tendencia:input.sourceTrend??null,
   padrao:input.sourcePattern??null,
   confianca:input.sourceConfidence??null,
   recorte:input.clientScope,
   comparacao:input.comparison,
  }));
 }

 if(input.topicData){
  const topic=input.topicData;
  sections.push(reportObject("Contexto interpretado",topic.context??{query:topic.query,terms:topic.terms}));
  sections.push(reportObject("Termos da investigação",topic.terms));
  sections.push(reportObject("Resumo da investigação",topic.summary));
  sections.push(reportObject("Leitura investigativa",topic.signals));
  sections.push(`<section><h2>Tickets correlacionados</h2>${reportTable(topic.tickets as unknown as Array<Record<string,unknown>>,["movideskId","subject","client","status","score","matchedTerms","registeredVersion","deliveredVersion"])}</section>`);
  sections.push(`<section><h2>Desenvolvimento relacionado · Azure DevOps</h2>${reportTable(topic.workItems as unknown as Array<Record<string,unknown>>,["id","title","workItemType","state","client","score","matchedTerms","registeredVersion","deliveredVersion"])}</section>`);
  sections.push(`<section><h2>Soluções e Problemas Conhecidos</h2>${reportTable(topic.knownProblems as unknown as Array<Record<string,unknown>>,["id","title","status","severity","score","symptom","solution","workaround","technicalSolution","version","matchedTerms"])}</section>`);
  sections.push(`<section><h2>Evidências técnicas</h2>${reportTable(topic.evidence as unknown as Array<Record<string,unknown>>,["id","title","kind","score","mapName","path"])}</section>`);
  sections.push(`<section><h2>Regras do Sistema relacionadas</h2>${reportTable(topic.ruleItems as unknown as Array<Record<string,unknown>>,["id","name","nodeText","path"])}</section>`);
  sections.push(`<section><h2>Versões mais relacionadas</h2>${reportTable(topic.topVersions as unknown as Array<Record<string,unknown>>,["version","total"])}</section>`);
 }

 if(input.data){
  const data=input.data;
  sections.push(reportObject("Atendimento investigado",data.ticket));
  sections.push(reportObject("Resumo técnico",data.summary));
  sections.push(reportObject("Qualidade dos dados",data.quality));
  sections.push(reportObject("DNA Técnico do Atendimento",data.technicalDna));
  sections.push(reportObject("Candidato a Problema Conhecido",data.knownProblemCandidate));
  sections.push(reportObject("Plano de investigação",data.diagnosticPlan));
  sections.push(reportObject("Radar de anomalias",data.anomalyRadar));
  sections.push(reportObject("Sinais para investigação",data.anomalies));
  sections.push(reportObject("Inteligência de recorrência e DNA do cliente",data.intelligence));
  sections.push(`<section><h2>Casos semelhantes</h2>${reportTable(data.similar as unknown as Array<Record<string,unknown>>,["movideskId","subject","client","score","reasons","signals","explanation"])}</section>`);
  sections.push(`<section><h2>Azure relacionado</h2>${reportTable(data.workItems as unknown as Array<Record<string,unknown>>,["id","title","workItemType","state"])}</section>`);
  sections.push(`<section><h2>Timeline operacional</h2>${reportTable(data.timeline as unknown as Array<Record<string,unknown>>,["date","kind","title","source","status","version","path"])}</section>`);
  sections.push(`<section><h2>Regra × evidência</h2>${reportTable((data.evidence??[]) as unknown as Array<Record<string,unknown>>,["id","title","kind","score","mapName","path"])}</section>`);
  sections.push(`<section><h2>Regras do Sistema relacionadas</h2>${reportTable((data.ruleItems??[]) as unknown as Array<Record<string,unknown>>,["id","name","nodeText","path"])}</section>`);
 }

 if(input.items.length){
  sections.push(`<section><h2>Resultados complementares da busca global</h2>${reportTable(input.items as unknown as Array<Record<string,unknown>>,["type","id","title","subtitle","path"])}</section>`);
 }

 return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Relatório de Investigação · ${reportEscape(subject)}</title>
<style>
 @page{size:A4 landscape;margin:10mm}
 *{box-sizing:border-box}
 body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;background:#fff;font-size:11px;line-height:1.45}
 header{border-bottom:3px solid #18c77a;padding:0 0 14px;margin-bottom:16px}
 .eyebrow{font-size:10px;letter-spacing:.12em;font-weight:800;color:#0b8f60;text-transform:uppercase}
 h1{font-size:24px;line-height:1.15;margin:5px 0 5px}
 .subtitle{color:#586174;font-size:11px}
 .notice{margin-top:10px;padding:9px 11px;border:1px solid #d8e4df;border-radius:8px;background:#f5fbf8;color:#3e4b46}
 section{break-inside:avoid;margin:0 0 15px}
 h2{font-size:14px;margin:0 0 7px;padding-bottom:5px;border-bottom:1px solid #dfe4ea}
 .kv{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
 .kv>div{border:1px solid #dfe4ea;border-radius:7px;padding:7px;background:#fafbfc;overflow-wrap:anywhere}
 .kv span{display:block;color:#697386;font-size:9px;text-transform:uppercase;margin-bottom:2px}
 .kv strong{font-size:10px;font-weight:700}
 .text-block{white-space:pre-wrap;border:1px solid #dfe4ea;border-radius:7px;padding:8px;background:#fafbfc}
 .table-wrap{width:100%;overflow:visible}
 table{width:100%;border-collapse:collapse;table-layout:auto;font-size:8.5px}
 th{background:#172033;color:#fff;text-align:left;padding:5px;border:1px solid #2c3548;white-space:nowrap}
 td{padding:5px;border:1px solid #dfe4ea;vertical-align:top;overflow-wrap:anywhere;max-width:250px}
 tr:nth-child(even) td{background:#f8fafb}
 .empty{color:#697386;font-style:italic}
 footer{margin-top:16px;padding-top:9px;border-top:1px solid #dfe4ea;color:#697386;font-size:9px}
 @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact} a{color:inherit;text-decoration:none}}
</style>
</head>
<body>
<header>
 <div class="eyebrow">TechLead Hub · Central de Investigação</div>
 <h1>${reportEscape(subject)}</h1>
 <div class="subtitle">Relatório emitido em ${reportEscape(generatedAt)} · consulta: ${reportEscape(input.query)}</div>
 <div class="notice"><strong>Nota de interpretação:</strong> correlações, recorrências, scores e sinais apresentados neste documento apoiam a investigação técnica e não estabelecem causalidade automaticamente.</div>
</header>
${sections.join("")}
<footer>TechLead Hub · Relatório de investigação · Dados correspondentes ao resultado disponível no momento da emissão.</footer>
</body>
</html>`;
}

export function Investigation(){const navigate=useNavigate();const theme=useTheme();const [params,setParams]=useSearchParams();const [query,setQuery]=useState(params.get("q")??"");const source=params.get("source");const origin=params.get("origin");const sourceClient=params.get("client");const sourceTrend=params.get("trend");const sourcePattern=params.get("pattern");const sourceConfidence=params.get("confidence");const [clientScope,setClientScope]=useState<"all"|"predominant"|"others">("all");const [items,setItems]=useState<Item[]>([]);const [comparison,setComparison]=useState<{predominantTickets:number;otherTickets:number;otherClients:number}|null>(null);const [data,setData]=useState<InvestigationData|null>(null);const [topicData,setTopicData]=useState<TopicData|null>(null);const [loading,setLoading]=useState(false);const [searchError,setSearchError]=useState("");const [reportError,setReportError]=useState("");const [topicView,setTopicView]=useState<"all"|"tickets"|"azure"|"knowledge"|"technical">("all");const [detail,setDetail]=useState<{kind:"ticket"|"azure"|"generic";title:string;subtitle?:string;path?:string;score?:number;meta?:string[]}|null>(null);
const emitReport=()=>{setReportError("");if(!topicData&&!data){setReportError("Execute uma investigação antes de emitir o relatório.");return;}const reportWindow=window.open("","_blank");if(!reportWindow){setReportError("O navegador bloqueou a janela do relatório. Libere pop-ups para o TechLead Hub e tente novamente.");return;}reportWindow.opener=null;const html=buildInvestigationReportHtml({query:query.trim(),topicData,data,items,source,origin,sourceClient,sourceTrend,sourcePattern,sourceConfidence,clientScope,comparison});reportWindow.document.open();reportWindow.document.write(html);reportWindow.document.close();reportWindow.focus();window.setTimeout(()=>reportWindow.print(),300);};
const run=async(value=query,scope: "all"|"predominant"|"others"=clientScope)=>{const q=value.trim();if(q.length<2)return;setLoading(true);setSearchError("");setData(null);setTopicData(null);setItems([]);try{const numeric=Number(q.replace(/^#/,""));if(Number.isSafeInteger(numeric)){const r=await api.get<InvestigationData>("/global/investigate",{params:{q}});setData(r.data);}else{const [topicResult,searchResult]=await Promise.allSettled([api.get<TopicData>("/global/investigate-topic",{params:{q}}),api.get<{items:Item[];comparison?:{predominantTickets:number;otherTickets:number;otherClients:number}|null}>("/global/search",{params:{q,client:sourceClient||undefined,clientScope:sourceClient?scope:"all"}})]);if(topicResult.status==="fulfilled")setTopicData(topicResult.value.data);if(searchResult.status==="fulfilled"){setItems(searchResult.value.data.items);setComparison(searchResult.value.data.comparison??null);}if(topicResult.status==="rejected"&&searchResult.status==="rejected")setSearchError("Não foi possível concluir a investigação agora. Verifique a conexão com o backend e tente novamente.");else if(topicResult.status==="rejected")setSearchError("Os resultados básicos foram carregados, mas o dossiê técnico não respondeu. Tente novamente para completar a correlação.");}setParams(prev=>{const next=new URLSearchParams(prev);next.set("q",q);return next;});}catch(error){console.error("Erro ao investigar:",error);setSearchError("A investigação não pôde ser concluída. Verifique a conexão com o backend e tente novamente.");}finally{setLoading(false)}};
useEffect(()=>{if(query.trim().length>=2)void run(query)},[]);const grouped=useMemo(()=>items.reduce<Record<string,Item[]>>((a,i)=>{(a[i.type]??=[]).push(i);return a},{}),[items]);
return <Box><PageHeader eyebrow="INTELIGÊNCIA" title="Central de Investigação" description="Cruze atendimento, Azure, cliente, versão, regra, conhecimento e o caminho funcional do SIMER em um único workspace."/>{source==="leadership"&&origin==="recurrence"&&<Alert severity="info" sx={{mb:2}}><Typography sx={{fontWeight:800}}>Investigação iniciada pela Liderança Técnica</Typography><Typography variant="body2" sx={{mt:.35}}>Contexto do padrão detectado: {sourceClient?`cliente predominante ${sourceClient}`:"sem cliente predominante"} · {sourceTrend==="EMERGING"?"tema emergente":sourceTrend==="GROWING"?"em crescimento":sourceTrend==="DECLINING"?"em redução":sourceTrend==="STABLE"?"estável":"tendência não informada"} · {sourcePattern==="TRANSVERSAL"?"transversal entre clientes":sourcePattern==="CONCENTRATED"?"concentrado em cliente":sourcePattern==="DISTRIBUTED"?"distribuído":"distribuição não informada"}{sourceConfidence?` · confiança ${sourceConfidence.toLowerCase()}`:""}.</Typography><Typography variant="caption" color="text.secondary">Este contexto explica a origem da investigação e não altera sozinho os resultados da busca.</Typography></Alert>}{source==="leadership"&&sourceClient&&comparison&&<Card variant="outlined" sx={{mb:2}}><CardContent><Typography sx={{fontWeight:850}}>Comparação do padrão entre clientes</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1.2}}>Evidência comparativa da busca atual; ajuda a validar se o tema permanece concentrado ou também aparece fora do cliente predominante.</Typography><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(3,1fr)"},gap:1}}>{[["Cliente predominante",comparison.predominantTickets],["Outros clientes",comparison.otherTickets],["Clientes externos ao predominante",comparison.otherClients]].map(([label,value])=><Box key={label} sx={{p:1.2,border:"1px solid",borderColor:"divider",borderRadius:2}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{fontWeight:900}}>{value}</Typography></Box>)}</Box><Alert severity={comparison.otherTickets>0?"info":"warning"} sx={{mt:1.2}}>{comparison.otherTickets>0?`O tema também possui ocorrências fora de ${sourceClient}; valide as evidências antes de concluir que a causa é local.`:`A busca atual não encontrou ocorrências fora de ${sourceClient}; isso indica concentração no recorte consultado, não causalidade.`}</Alert></CardContent></Card>}<Card variant="outlined" sx={{mb:2,overflow:"hidden",borderColor:t=>t.palette.mode==="dark"?"rgba(66,230,193,.18)":"rgba(15,118,110,.14)",background:t=>t.palette.mode==="dark"?"radial-gradient(circle at 5% 0%,rgba(24,199,122,.09),transparent 34%),linear-gradient(135deg,rgba(16,42,67,.94),rgba(18,30,55,.9))":"linear-gradient(135deg,#fff,#f7fbfa)"}}><CardContent sx={{p:{xs:1.5,md:2},"&:last-child":{pb:{xs:1.5,md:2}}}}><Stack direction="row" sx={{alignItems:"center",mb:1}}><Box><Typography sx={{fontWeight:900}}>Investigar contexto</Typography><Typography variant="caption" color="text.secondary">Descreva o comportamento observado ou informe um atendimento.</Typography></Box><SectionInfo title="A Central cruza Tickets, Azure, Problemas Conhecidos, versões, estrutura SIMER e Regras do Sistema. A correlação ajuda a investigar, mas não confirma causa automaticamente."/></Stack>{source==="leadership"&&sourceClient&&<Stack direction={{xs:"column",sm:"row"}} spacing={1} sx={{mb:1.2,alignItems:{sm:"center"}}}><Typography variant="caption" sx={{fontWeight:800,color:"text.secondary"}}>RECORTE INVESTIGATIVO</Typography><FormControl size="small" sx={{minWidth:220}}><InputLabel>Casos</InputLabel><Select value={clientScope} label="Casos" onChange={e=>{const scope=e.target.value as "all"|"predominant"|"others";setClientScope(scope);void run(query,scope)}}><MenuItem value="all">Todos os casos</MenuItem><MenuItem value="predominant">Cliente predominante</MenuItem><MenuItem value="others">Outros clientes</MenuItem></Select></FormControl></Stack>}<Stack direction={{xs:"column",md:"row"}} spacing={1}><TextField fullWidth value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void run()}} placeholder="Descreva o que está acontecendo. Ex.: boleto com status emitido, duplicidade de receituário após solicitação..." slotProps={{input:{startAdornment:<SearchOutlined sx={{mr:1,color:"text.secondary"}}/>}}}/><Button variant="contained" onClick={()=>void run()} disabled={loading}>{loading?<CircularProgress size={20}/>:"Investigar"}</Button></Stack></CardContent></Card>{searchError&&<Alert severity="warning" sx={{mb:2}}>{searchError}</Alert>}{reportError&&<Alert severity="warning" sx={{mb:2}}>{reportError}</Alert>}{!items.length&&!data&&!topicData&&!loading&&!searchError&&query.trim().length>=2&&<Alert severity="info" sx={{mb:2}}><Typography sx={{fontWeight:800}}>Nenhuma correlação encontrada para “{query.trim()}”.</Typography><Typography variant="body2">Tente um termo do assunto, serviço, rotina, cliente, versão ou número de atendimento. A busca não cria relações sem evidência na base.</Typography></Alert>}{!items.length&&!data&&!topicData&&!loading&&!searchError&&query.trim().length<2&&<Alert severity="info">Informe um número de atendimento ou descreva o assunto. A investigação cruza Tickets, Azure, Problemas Conhecidos, versões, estrutura SIMER e Regras do Sistema.</Alert>}
{topicData&&<Stack spacing={1.5} sx={{mb:2}}>
<Card variant="outlined" sx={{borderColor:"divider"}}><CardContent sx={{py:1.25,"&:last-child":{pb:1.25}}}><Stack direction={{xs:"column",md:"row"}} spacing={1} sx={{alignItems:{md:"center"},justifyContent:"space-between"}}><Stack direction="row" sx={{alignItems:"center"}}><Box><Typography sx={{fontWeight:850}}>Visualização da investigação</Typography><Typography variant="caption" color="text.secondary">Selecione quais evidências deseja analisar.</Typography></Box><SectionInfo title="Todos mostra o dossiê completo. Os demais modos reduzem a tela para Tickets, Desenvolvimento, Conhecimento ou evidências técnicas, sem executar uma nova busca."/></Stack><Stack direction={{xs:"column",sm:"row"}} spacing={1} sx={{width:{xs:"100%",md:"auto"}}}><TextField select size="small" label="Exibir" value={topicView} onChange={e=>setTopicView(e.target.value as typeof topicView)} sx={{minWidth:{xs:"100%",md:240}}}><MenuItem value="all">Visão completa</MenuItem><MenuItem value="tickets">Tickets correlacionados</MenuItem><MenuItem value="azure">Desenvolvimento relacionado</MenuItem><MenuItem value="knowledge">Problemas Conhecidos</MenuItem><MenuItem value="technical">Regra, evidência e versões</MenuItem></TextField><Button variant="outlined" startIcon={<PictureAsPdfOutlined/>} onClick={emitReport} sx={{whiteSpace:"nowrap"}}>Emitir relatório</Button></Stack></Stack></CardContent></Card>
<Card variant="outlined"><CardContent><Typography variant="overline" color="text.secondary">DOSSIÊ DO ASSUNTO</Typography><Typography variant="h5" sx={{fontWeight:900}}>{topicData.query}</Typography><Typography variant="body2" color="text.secondary" sx={{mt:.4}}>Correlação determinística pelas evidências disponíveis. Os resultados indicam relação textual/técnica e não estabelecem causa automaticamente.</Typography>{topicData.context&&<Box sx={{mt:1.2,p:1.2,border:"1px solid",borderColor:"divider",borderRadius:2,bgcolor:"action.hover"}}><Typography variant="caption" color="text.secondary" sx={{fontWeight:800}}>CONTEXTO INTERPRETADO</Typography><Typography variant="body2" sx={{mt:.35}}>{topicData.context.interpretation}</Typography><Stack direction="row" spacing={.6} useFlexGap sx={{flexWrap:"wrap",mt:.8}}>{topicData.context.concepts.map(term=><Chip key={term} size="small" variant="outlined" label={term}/>)}</Stack></Box>}<Stack direction="row" spacing={.7} useFlexGap sx={{flexWrap:"wrap",mt:1.3}}><Chip color="primary" label={`${topicData.summary.tickets} tickets`}/><Chip label={`${topicData.summary.workItems} Azure`}/><Chip label={`${topicData.summary.knownProblems} problemas conhecidos`}/><Chip label={`${topicData.summary.clients} clientes`}/><Chip label={`${topicData.summary.evidence} evidências técnicas`}/><Chip label={`${topicData.summary.rules} regras`}/></Stack></CardContent></Card>
{topicData.signals.length>0&&<Alert severity={topicData.summary.strongRecurrence>=3?"warning":"info"}><Typography sx={{fontWeight:850,mb:.4}}>Leitura investigativa</Typography>{topicData.signals.map((signal,i)=><Typography key={i} variant="body2">• {signal}</Typography>)}</Alert>}
{(topicView==="all"||topicView==="tickets"||topicView==="azure")&&<Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",xl:topicView==="all"?"1fr 1fr":"1fr"},gap:1.5}}>
{(topicView==="all"||topicView==="tickets")&&<Card variant="outlined" sx={{borderTop:"2px solid",borderTopColor:"primary.main"}}><CardContent><Stack direction="row" sx={{alignItems:"center",mb:1}}><Typography sx={{fontWeight:850}}>Tickets correlacionados</Typography><SectionInfo title="Atendimentos que compartilham conceitos com o contexto pesquisado. O percentual representa aderência textual/técnica, não probabilidade de mesma causa."/></Stack>{topicData.tickets.slice(0,12).map(x=><Box key={x.movideskId} onClick={()=>setDetail({kind:"ticket",title:`#${x.movideskId} · ${x.subject}`,subtitle:x.client??undefined,path:`/tickets?movidesk=${x.movideskId}`,score:x.score,meta:[x.status,x.matchedTerms.join(", ")].filter(Boolean)})} sx={{p:1,borderRadius:2,cursor:"pointer","&:hover":{bgcolor:"action.hover"}}}><Stack direction="row" spacing={1} sx={{alignItems:"center"}}><Chip size="small" color={x.score>=60?"success":x.score>=40?"warning":"default"} label={`${x.score}%`}/><Typography sx={{fontWeight:750,flex:1}}>#{x.movideskId} · {x.subject}</Typography></Stack><Typography variant="caption" color="text.secondary">{[x.client,x.status,x.matchedTerms.join(", ")].filter(Boolean).join(" · ")}</Typography></Box>)}</CardContent></Card>}
{(topicView==="all"||topicView==="azure")&&<Card variant="outlined" sx={{borderTop:"2px solid",borderTopColor:"info.main"}}><CardContent><Stack direction="row" sx={{alignItems:"center",mb:1}}><Typography sx={{fontWeight:850}}>Desenvolvimento relacionado</Typography><SectionInfo title="Correções, Evoluções e APOIOs do Azure relacionados aos conceitos investigados, incluindo versão quando disponível."/></Stack>{topicData.workItems.slice(0,12).map(x=><Box key={x.id} onClick={()=>{const path=`${x.workItemType.toLowerCase().includes("apoio")?"/apoios":x.workItemType.toLowerCase().includes("evolu")?"/evolucoes":"/correcoes"}?task=${x.id}`;setDetail({kind:"azure",title:`#${x.id} · ${x.title}`,subtitle:x.workItemType,path,score:x.score,meta:[x.state,x.client??"",x.deliveredVersion??x.registeredVersion??""].filter(Boolean)})}} sx={{p:1,borderRadius:2,cursor:"pointer","&:hover":{bgcolor:"action.hover"}}}><Stack direction="row" spacing={1} sx={{alignItems:"center"}}><Chip size="small" label={`${x.score}%`}/><Typography sx={{fontWeight:750,flex:1}}>#{x.id} · {x.title}</Typography></Stack><Typography variant="caption" color="text.secondary">{[x.workItemType,x.state,x.client,x.deliveredVersion??x.registeredVersion].filter(Boolean).join(" · ")}</Typography></Box>)}</CardContent></Card>}
</Box>}
{(topicView==="all"||topicView==="knowledge")&&topicData.knownProblems.length>0&&<Card variant="outlined"><CardContent><Stack direction="row" spacing={1} sx={{alignItems:"center",mb:1}}><Typography sx={{fontWeight:850}}>Soluções e Problemas Conhecidos</Typography><Button size="small" onClick={()=>navigate(`/problemas-conhecidos?q=${encodeURIComponent(topicData.query)}`)}>Abrir quadro</Button></Stack><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"repeat(2,1fr)"},gap:1}}>{topicData.knownProblems.slice(0,8).map(x=><Box key={x.id} sx={{p:1.2,border:"1px solid",borderColor:"divider",borderRadius:2}}><Stack direction="row" spacing={.7} sx={{alignItems:"center",mb:.5}}><Chip size="small" color={x.score>=60?"success":"default"} label={`${x.score}%`}/><Chip size="small" variant="outlined" label={x.status}/><Typography sx={{fontWeight:800}}>{x.title}</Typography></Stack><Typography variant="body2" color="text.secondary">{x.symptom}</Typography><Typography variant="body2" sx={{mt:.7,fontWeight:700}}>{x.technicalSolution||x.workaround||x.solution}</Typography></Box>)}</Box></CardContent></Card>}
{(topicView === "all" || topicView === "technical") && (
  <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5}>
    <Card variant="outlined" sx={{ flex: 1, borderTop: "2px solid", borderTopColor: "success.main" }}>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: "center", mb: 1 }}>
          <Typography sx={{ fontWeight: 850 }}>Regra × evidência</Typography>
          <SectionInfo title="Cruza o contexto pesquisado com a base estrutural do SIMER e as Regras do Sistema. O caminho apresentado é uma trilha técnica para validação, não confirmação automática de causa." />
        </Stack>
        {topicData.evidence.length ? (
          topicData.evidence.slice(0, 10).map((x) => (
            <Box
              key={x.id}
              sx={{ p: 1, borderRadius: 2, border: "1px solid", borderColor: "divider", bgcolor: "action.hover" }}
            >
              <Typography sx={{ fontWeight: 750 }}>{x.title}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .35 }}>Caminho no SIMER</Typography>\n              <Typography variant="body2" sx={{ fontWeight: 700 }}>{[x.mapName, x.path, x.title].filter(Boolean).join(" → ")}</Typography>
            </Box>
          ))
        ) : (
          <Alert severity="info">Nenhuma evidência técnica correlacionada.</Alert>
        )}
      </CardContent>
    </Card>
    <Card variant="outlined" sx={{ flex: 1 }}>
      <CardContent>
        <Typography sx={{ fontWeight: 850, mb: 1 }}>Versões e recorrência</Typography>
        {topicData.topVersions.length ? (
          topicData.topVersions.map((x) => (
            <Box
              key={x.version}
              onClick={() =>
                setDetail({
                  kind: "generic",
                  title: `Versão ${x.version}`,
                  subtitle: "Recorrência por versão",
                  score: x.total,
                  meta: [`${x.total} evidências relacionadas ao contexto investigado`],
                })
              }
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                p: 0.8,
                borderRadius: 1.5,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Typography sx={{ fontWeight: 750 }}>{x.version}</Typography>
              <Chip clickable size="small" label={`${x.total} evidências`} />
            </Box>
          ))
        ) : (
          <Alert severity="info">Nenhuma versão recorrente identificada.</Alert>
        )}
      </CardContent>
    </Card>
  </Stack>
)}
</Stack>}
{data&&<Stack spacing={2}>
<Card variant="outlined"><CardContent><Stack direction={{xs:"column",md:"row"}} spacing={2} sx={{justifyContent:"space-between"}}><Box><Typography variant="overline" color="text.secondary">DOSSIÊ TÉCNICO</Typography><Typography variant="h5" sx={{fontWeight:900}}>#{data.ticket.movideskId} · {data.ticket.subject}</Typography><Typography color="text.secondary">{[data.ticket.client,data.ticket.status,data.ticket.owner].filter(Boolean).join(" · ")}</Typography></Box><Stack direction="row" spacing={1} useFlexGap sx={{flexWrap:"wrap",alignContent:"flex-start"}}><Chip label={`Qualidade ${data.quality.score}%`} color={data.quality.score>=80?"success":"warning"}/><Chip label={`${data.summary.similarCases} similares`}/><Chip label={`${data.summary.relatedWorkItems} Azure`}/><Chip label={`${data.summary.technicalEvidence??0} evidências`}/><Chip label={`${data.summary.rules??0} regras`}/><Button size="small" variant="outlined" startIcon={<PictureAsPdfOutlined/>} onClick={emitReport}>Emitir relatório</Button></Stack></Stack></CardContent></Card>
{data.technicalDna&&<Card variant="outlined"><CardContent><Stack direction={{xs:"column",md:"row"}} spacing={1} sx={{justifyContent:"space-between",alignItems:{md:"center"},mb:1.25}}><Box><Typography sx={{fontWeight:900}}>DNA Técnico do Atendimento</Typography><Typography variant="body2" color="text.secondary">Assinatura técnica construída somente com dados e correlações disponíveis no Hub.</Typography></Box><Chip color={data.technicalDna.knownProblemCandidate?"warning":"default"} label={`Recorrência ${data.technicalDna.recurrence}`}/></Stack><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(2,minmax(0,1fr))",xl:"repeat(4,minmax(0,1fr))"},gap:1}}>{[["Produto",data.technicalDna.product],["Cliente",data.technicalDna.client],["Categoria",data.technicalDna.category],["Causa",data.technicalDna.cause],["Serviço",data.technicalDna.service],["Versão",data.technicalDna.version],["Task",data.technicalDna.task?`#${data.technicalDna.task}`:"—"],["Regra / evidência",`${data.technicalDna.ruleCount} / ${data.technicalDna.evidenceCount}`]].map(([label,value])=><Box key={label} sx={{p:1.1,border:"1px solid",borderColor:"divider",borderRadius:2,minWidth:0}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography noWrap sx={{fontWeight:800}}>{value||"—"}</Typography></Box>)}</Box></CardContent></Card>}
{data.knownProblemCandidate?.eligible&&<Alert severity={data.knownProblemCandidate.level==="high"?"warning":"info"} action={<Button color="inherit" size="small" onClick={()=>navigate(data.knownProblemCandidate!.path)}>Revisar no quadro</Button>}><Typography sx={{fontWeight:850}}>Candidato a Problema Conhecido</Typography><Typography variant="body2">{data.knownProblemCandidate.rationale}</Typography><Typography variant="caption">O Hub sinaliza o candidato; a criação continua dependendo de revisão humana.</Typography></Alert>}
{Boolean(data.anomalyRadar?.length)&&<Card variant="outlined"><CardContent><Typography sx={{fontWeight:900}}>Radar de Anomalias da Investigação</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1.2}}>Sinais objetivos do contexto atual. “Atenção” indica necessidade de investigação, não causa confirmada.</Typography><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(2,minmax(0,1fr))",lg:"repeat(3,minmax(0,1fr))",xl:"repeat(5,minmax(0,1fr))"},gap:1}}>{data.anomalyRadar!.map(item=><Box key={item.key} sx={{p:1.2,border:"1px solid",borderColor:item.status==="attention"?"warning.main":"divider",borderRadius:2}}><Stack direction="row" sx={{justifyContent:"space-between",alignItems:"center",gap:1}}><Typography variant="caption" color="text.secondary">{item.label}</Typography><Chip size="small" color={item.status==="attention"?"warning":"default"} label={item.value}/></Stack><Typography variant="caption" sx={{display:"block",mt:.7}}>{item.detail}</Typography></Box>)}</Box></CardContent></Card>}
<Stack direction={{xs:"column",lg:"row"}} spacing={2}>
<Card variant="outlined" sx={{flex:1}}><CardContent><Typography sx={{fontWeight:850,mb:1}}>Contexto técnico</Typography>{[["Cliente",data.ticket.client],["Categoria",data.ticket.category],["Causa",data.ticket.cause],["Serviço",data.summary.service],["Versão",data.summary.version]].map(([k,v])=><Box key={k} sx={{display:"flex",justifyContent:"space-between",gap:2,py:.6}}><Typography color="text.secondary">{k}</Typography><Typography sx={{fontWeight:700,textAlign:"right"}}>{v||"—"}</Typography></Box>)}</CardContent></Card>
<Card variant="outlined" sx={{flex:1}}><CardContent><Typography sx={{fontWeight:850,mb:1}}>Qualidade dos dados</Typography>{Object.entries(data.quality.checks).map(([k,v])=><Stack key={k} direction="row" spacing={1} sx={{alignItems:"center",py:.45}}><Chip size="small" color={v?"success":"default"} label={v?"OK":"Pendente"}/><Typography>{k}</Typography></Stack>)}</CardContent></Card>
</Stack>
{Boolean(data.diagnosticPlan?.length)&&<Card variant="outlined"><CardContent><Typography sx={{fontWeight:850,mb:.25}}>Plano de investigação</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1.25}}>Sequência auditável de verificações. O sistema apresenta evidências; a conclusão técnica permanece com o analista.</Typography><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(2,minmax(0,1fr))",lg:"repeat(3,minmax(0,1fr))",xl:"repeat(5,minmax(0,1fr))"},gap:1}}>{data.diagnosticPlan!.map((step,index)=><Box key={step.key} sx={{p:1.25,border:"1px solid",borderColor:step.status==="attention"?"warning.main":"divider",borderRadius:2,bgcolor:"background.paper"}}><Stack direction="row" spacing={.7} sx={{alignItems:"center",mb:.6}}><Chip size="small" color={step.status==="ready"?"success":step.status==="attention"?"warning":"default"} label={index+1}/><Typography sx={{fontWeight:800}}>{step.title}</Typography></Stack><Typography variant="caption" color="text.secondary">{step.detail}</Typography></Box>)}</Box></CardContent></Card>}
{data.intelligence&&<><Card variant="outlined"><CardContent><Stack direction={{xs:"column",md:"row"}} spacing={2} sx={{justifyContent:"space-between",alignItems:{md:"center"},mb:1.5}}><Box><Typography sx={{fontWeight:850}}>Inteligência de recorrência</Typography><Typography variant="body2" color="text.secondary">Sinais determinísticos baseados no histórico local. Associação não implica causalidade.</Typography></Box><Chip color={data.intelligence.confidence.score>=75?"success":data.intelligence.confidence.score>=50?"warning":"default"} label={`Confiança dos dados · ${data.intelligence.confidence.score}%`}/></Stack><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(2,minmax(0,1fr))",xl:"repeat(4,minmax(0,1fr))"},gap:1}}>{[["Casos fortes",data.intelligence.recurrence.strongCases],["Clientes no padrão",data.intelligence.recurrence.clients],["Concentração no cliente",`${data.intelligence.recurrence.concentration}%`],["Versão recorrente",data.intelligence.versionSignal?.version??"—"]].map(([label,value])=><Box key={label} sx={{p:1.25,border:"1px solid",borderColor:"divider",borderRadius:2}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{fontWeight:900}}>{value}</Typography></Box>)}</Box><Stack spacing={1} sx={{mt:1.5}}>{data.intelligence.signals.map((x,i)=><Alert key={i} severity={x.severity}><Typography sx={{fontWeight:800}}>{x.title}</Typography><Typography variant="body2">{x.detail}</Typography></Alert>)}</Stack></CardContent></Card>
<Card variant="outlined"><CardContent><Typography sx={{fontWeight:850}}>DNA Técnico do Cliente</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1.5}}>Perfil do histórico próximo ao atendimento investigado; serve para contexto, não para atribuição automática de causa.</Typography><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"repeat(2,minmax(0,1fr))"},gap:1.5}}><Box><Stack direction="row" spacing={1} useFlexGap sx={{flexWrap:"wrap",mb:1}}><Chip label={`${data.intelligence.clientDna.totalTickets} tickets no recorte`}/><Chip label={`${data.intelligence.clientDna.taskRate}% com Task`}/><Chip label={`${data.intelligence.clientDna.serviceCases} no serviço atual`}/></Stack><Typography variant="caption" color="text.secondary">Serviços mais frequentes</Typography>{data.intelligence.clientDna.topServices.map(x=><Box key={x.name} sx={{display:"flex",justifyContent:"space-between",py:.45}}><Typography variant="body2">{x.name}</Typography><Chip size="small" variant="outlined" label={x.total}/></Box>)}</Box><Box><Typography variant="caption" color="text.secondary">Categorias mais frequentes</Typography>{data.intelligence.clientDna.topCategories.map(x=><Box key={x.name} sx={{display:"flex",justifyContent:"space-between",py:.45}}><Typography variant="body2">{x.name}</Typography><Chip size="small" variant="outlined" label={x.total}/></Box>)}</Box></Box><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"repeat(2,minmax(0,1fr))"},gap:1.5,mt:1.5}}><Box><Typography variant="caption" color="text.secondary">Evolução do volume do cliente</Typography><Box sx={{height:{xs:190,md:205},mt:1,minWidth:0}}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.intelligence.clientDna.monthly}><CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" opacity={.3}/><XAxis dataKey="month" tick={{fill:theme.palette.text.secondary,fontSize:11}}/><YAxis allowDecimals={false} tick={{fill:theme.palette.text.secondary,fontSize:11}}/><ChartTooltip cursor={false} contentStyle={{backgroundColor:theme.palette.background.paper,border:`1px solid ${theme.palette.divider}`,borderRadius:10,color:theme.palette.text.primary}}/><Bar dataKey="total" name="Tickets" fill={theme.palette.primary.main} radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></Box></Box><Box><Typography variant="caption" color="text.secondary">Versões nos casos correlacionados</Typography><Box sx={{height:210,mt:1}}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.intelligence.versionDistribution} layout="vertical"><CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" opacity={.3}/><XAxis type="number" allowDecimals={false} tick={{fill:theme.palette.text.secondary,fontSize:11}}/><YAxis type="category" dataKey="version" width={95} tick={{fill:theme.palette.text.secondary,fontSize:11}}/><ChartTooltip cursor={false} contentStyle={{backgroundColor:theme.palette.background.paper,border:`1px solid ${theme.palette.divider}`,borderRadius:10,color:theme.palette.text.primary}}/><Bar dataKey="total" name="Casos" fill={theme.palette.secondary.main} radius={[0,5,5,0]}/></BarChart></ResponsiveContainer></Box></Box></Box></CardContent></Card></>}
{Boolean(data.intelligence?.clusters?.length)&&<Card variant="outlined"><CardContent><Typography sx={{fontWeight:850}}>Clusters de recorrência</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1.25}}>Agrupamentos explicáveis por Serviço × Categoria × Versão. “Transversal” indica presença em mais de um cliente, não causalidade.</Typography><Stack spacing={.8}>{data.intelligence!.clusters.map((c,i)=><Box key={i} sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"100px minmax(0,1fr) 100px",lg:"100px minmax(0,1fr) 110px 100px"},gap:1,alignItems:"center",p:1.1,border:"1px solid",borderColor:"divider",borderRadius:2}}><Chip size="small" color={c.scope==="transversal"?"warning":"default"} label={c.scope}/><Box sx={{minWidth:0}}><Typography noWrap sx={{fontWeight:800}}>{c.service}</Typography><Typography noWrap variant="caption" color="text.secondary">{c.category} · {c.version}</Typography></Box><Chip size="small" variant="outlined" label={`${c.cases} casos`}/><Typography variant="caption" color="text.secondary">{c.clients} cliente(s)</Typography></Box>)}</Stack></CardContent></Card>}
{Boolean(data.anomalies?.length)&&<Alert severity="warning"><Typography sx={{fontWeight:800,mb:.5}}>Sinais para investigação</Typography>{data.anomalies!.map((x,i)=><Typography key={i} variant="body2">• {x}</Typography>)}</Alert>}
<Stack direction={{xs:"column",lg:"row"}} spacing={2}>
<Card variant="outlined" sx={{ flex: 1 }}>
  <CardContent>
    <Typography sx={{ fontWeight: 850, mb: 1 }}>Regra × evidência</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
      Pontos técnicos encontrados na estrutura do SIMER e confrontados com o contexto do atendimento.
    </Typography>
    {data.evidence?.length ? (
      data.evidence.map((x) => (
        <Box key={x.id} sx={{ p: 1, mb: 1, borderRadius: 2, border: "1px solid", borderColor: "divider", bgcolor: "action.hover" }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Chip size="small" label={x.kind} />
            <Chip size="small" variant="outlined" label={`${x.score} pts`} />
            <Typography sx={{ fontWeight: 700 }}>{x.title}</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.6 }}>
            Caminho no SIMER
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {[x.mapName, x.path, x.title].filter(Boolean).join(" → ")}
          </Typography>
        </Box>
      ))
    ) : (
      <Alert severity="info">Nenhuma evidência técnica correlacionada.</Alert>
    )}
  </CardContent>
</Card>
<Card variant="outlined" sx={{flex:1}}><CardContent><Typography sx={{fontWeight:850,mb:1}}>Regras do Sistema relacionadas</Typography>{data.ruleItems?.length?data.ruleItems.slice(0,8).map((x,i)=><Box key={x.id??i} sx={{py:.7}}><Typography sx={{fontWeight:700}}>{x.name??x.nodeText??"Regra relacionada"}</Typography><Typography variant="caption" color="text.secondary">{x.path??""}</Typography></Box>):<Alert severity="info">Nenhuma regra BPMN relacionada ao contexto.</Alert>}</CardContent></Card>
</Stack>
<Card variant="outlined"><CardContent><Typography sx={{fontWeight:850}}>Casos semelhantes</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1}}>Score explicável por cliente, serviço, categoria, causa, versão e termos do assunto.</Typography>{data.similar.length?data.similar.map(x=><Box key={x.movideskId} onClick={()=>navigate(`/tickets?movidesk=${x.movideskId}`)} sx={{p:1.2,borderRadius:2,cursor:"pointer","&:hover":{bgcolor:"action.hover"}}}><Stack direction={{xs:"column",md:"row"}} spacing={1} sx={{alignItems:{md:"center"}}}><Chip size="small" color={x.score>=60?"success":x.score>=45?"warning":"default"} label={`${x.score} pts`}/><Typography sx={{fontWeight:750,flex:1}}>#{x.movideskId} · {x.subject}</Typography><Typography variant="caption" color="text.secondary">{x.explanation?.matchedSignals??x.reasons.length} sinais</Typography></Stack><Typography variant="caption" color="text.secondary">{x.client}</Typography><Stack direction="row" spacing={.6} useFlexGap sx={{flexWrap:"wrap",mt:.7}}>{(x.signals??[]).filter(s=>s.matched).map(sig=><Chip key={sig.key} size="small" variant="outlined" label={`${sig.label} +${sig.weight}`}/>)}</Stack></Box>):<Alert severity="info">Nenhum caso com correlação mínima encontrado.</Alert>}</CardContent></Card>
<Stack direction={{xs:"column",lg:"row"}} spacing={2}><Card variant="outlined" sx={{flex:1}}><CardContent><Typography sx={{fontWeight:850,mb:1}}>Azure relacionado</Typography>{data.workItems.map(x=><Box key={x.id} sx={{py:.7}}><Typography sx={{fontWeight:700}}>#{x.id} · {x.title}</Typography><Typography variant="caption" color="text.secondary">{x.workItemType} · {x.state}</Typography></Box>)}</CardContent></Card><Card variant="outlined" sx={{flex:1}}><CardContent><Stack direction="row" sx={{alignItems:"center",mb:1}}><Box><Typography sx={{fontWeight:900}}>Timeline operacional</Typography><Typography variant="caption" color="text.secondary">Movidesk → Desenvolvimento → versão, em ordem cronológica.</Typography></Box><SectionInfo title="A timeline usa somente datas persistidas no Movidesk e Azure. Ausência de uma etapa significa ausência da evidência correspondente na base, não que a etapa não ocorreu."/></Stack>{data.timeline.map((x,i)=><Box key={i} onClick={()=>x.path&&navigate(x.path)} sx={{position:"relative",borderLeft:"2px solid",borderColor:x.kind.includes("closed")||x.kind.includes("resolved")?"success.main":x.kind.startsWith("azure")?"info.main":"primary.main",pl:1.6,pb:1.35,cursor:x.path?"pointer":"default","&:hover":x.path?{bgcolor:"action.hover"}:{}}}><Box sx={{position:"absolute",width:9,height:9,borderRadius:"50%",bgcolor:x.kind.includes("closed")||x.kind.includes("resolved")?"success.main":x.kind.startsWith("azure")?"info.main":"primary.main",left:-5,top:6}}/><Stack direction="row" spacing={.6} useFlexGap sx={{alignItems:"center",flexWrap:"wrap"}}><Typography sx={{fontWeight:800}}>{x.title}</Typography>{x.source&&<Chip size="small" variant="outlined" label={x.source}/>} {x.version&&<Chip size="small" color="success" label={`Versão ${x.version}`}/>}</Stack><Typography variant="caption" color="text.secondary">{new Date(x.date).toLocaleString("pt-BR")}{x.status?` · ${x.status}`:""}</Typography></Box>)}</CardContent></Card></Stack>
</Stack>}
<Stack spacing={2}>
  {Object.entries(grouped).map(([type, list]) => (
    <Card key={type} variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
          <AnalyticsOutlined fontSize="small" />
          <Typography sx={{ fontWeight: 850 }}>{type}</Typography>
          <Chip size="small" label={list.length} />
        </Stack>
        <Divider sx={{ mb: 1 }} />
        {list.slice(0, 8).map((i) => (
          <Box
            key={i.id}
            onClick={() => setDetail({ kind: "generic", title: i.title, subtitle: i.subtitle, path: i.path })}
            sx={{ p: 1.2, borderRadius: 2, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
          >
            <Typography sx={{ fontWeight: 750 }}>{i.title}</Typography>
            <Typography variant="caption" color="text.secondary">{i.subtitle}</Typography>
          </Box>
        ))}
      </CardContent>
    </Card>
  ))}
</Stack>
{topicData && (
  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "minmax(0,.8fr) minmax(0,1.2fr)" }, gap: 1.5, mb: 2 }}>
    <Card variant="outlined">
      <CardContent>
        <Typography sx={{ fontWeight: 850 }}>Distribuição das evidências</Typography>
        <Box sx={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={[
                  { name: "Tickets", value: topicData.summary.tickets },
                  { name: "Azure", value: topicData.summary.workItems },
                  { name: "Conhecimento", value: topicData.summary.knownProblems },
                  { name: "Técnicas", value: topicData.summary.evidence },
                ].filter((x) => x.value > 0)}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={3}
              >
                {["#18C77A", "#4C8DFF", "#A78BFA", "#F59E0B"].map((fill, i) => <Cell key={i} fill={fill} />)}
              </Pie>
              <ChartTooltip />
            </PieChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
    <Card variant="outlined">
      <CardContent>
        <Typography sx={{ fontWeight: 850 }}>Versões mais relacionadas</Typography>
        <Box sx={{ height: 220 }}>
          {topicData.topVersions.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topicData.topVersions.slice(0, 8)} layout="vertical">
                <CartesianGrid horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="version" width={92} />
                <ChartTooltip />
                <Bar dataKey="total" name="Evidências" radius={[0, 6, 6, 0]} fill="#18C77A" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ height: "100%", display: "grid", placeItems: "center" }}>
              <Typography variant="body2" color="text.secondary">Sem versões relacionadas.</Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  </Box>
)}
<Card variant="outlined" sx={{ mt: 2 }}>
  <CardContent>
    <Typography sx={{ fontWeight: 850 }}>Inteligência de diagnóstico</Typography>
    <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 1, mt: 1 }}>
      <Chip icon={<AccountTreeOutlined />} label="Regra × evidência" />
      <Chip icon={<TimelineOutlined />} label="O que mudou?" />
      <Chip label="Casos semelhantes" />
      <Chip label="Anomalias" />
      <Chip label="SQL diagnóstico" />
    </Stack>
  </CardContent>
</Card>
<Dialog open={Boolean(detail)} onClose={() => setDetail(null)} fullWidth maxWidth="sm">
  <DialogTitle>Detalhamento da investigação</DialogTitle>
  <DialogContent>
    <Typography variant="overline" color="text.secondary">
      {detail?.kind === "ticket" ? "ATENDIMENTO" : detail?.kind === "azure" ? "DESENVOLVIMENTO" : "EVIDÊNCIA"}
    </Typography>
    <Typography variant="h6" sx={{ fontWeight: 900 }}>{detail?.title}</Typography>
    {detail?.subtitle && <Typography color="text.secondary">{detail.subtitle}</Typography>}
    {typeof detail?.score === "number" && (
      <Chip sx={{ mt: 1.2 }} label={detail.kind === "generic" ? `${detail.score} evidências` : `Aderência ${detail.score}%`} />
    )}
    <Stack spacing={0.6} sx={{ mt: 1.5 }}>
      {detail?.meta?.map((x, i) => <Typography key={i} variant="body2">• {x}</Typography>)}
    </Stack>
    <Alert severity="info" sx={{ mt: 1.5 }}>
      O detalhamento mantém a investigação aberta. Acesse a rotina de origem apenas quando precisar continuar a análise nela.
    </Alert>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setDetail(null)}>Fechar</Button>
    {detail?.path && <Button variant="contained" onClick={() => navigate(detail.path!)}>Abrir rotina</Button>}
  </DialogActions>
</Dialog>
</Box>}
