import { useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Checkbox, Chip, Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";

type InvestigationContext = {
  ticket?: { movideskId: number; subject: string; client?: string; category?: string; cause?: string; status?: string; owner?: string };
  summary?: { similarCases: number; relatedWorkItems: number; technicalEvidence?: number; rules?: number; service?: string; version?: string };
  diagnosticPlan?: Array<{ key: string; title: string; detail: string; status: string }>;
  anomalies?: string[];
};
type Props = { subject: string; context?: InvestigationContext | null; topicSummary?: { tickets: number; workItems: number; knownProblems: number; evidence: number; rules: number } | null };
type Check = { id: string; title: string; hint: string };
const DEFAULT_CHECKS: Check[] = [
  { id: "reproduce", title: "Reproduzir o comportamento", hint: "Registrar ambiente, versão, sequência de ações e resultado observado." },
  { id: "expected", title: "Confirmar a regra esperada", hint: "Comparar com documentação, BPMN, requisito ou validação de Produto." },
  { id: "scope", title: "Delimitar o impacto", hint: "Confirmar cliente, usuários, frequência, período e outros cenários afetados." },
  { id: "data", title: "Verificar dados e integrações", hint: "Investigar entradas, logs, vínculos e consistência; não executar alterações destrutivas." },
  { id: "history", title: "Conferir casos e Tasks anteriores", hint: "Diferenciar semelhança textual de causa comprovadamente igual." },
  { id: "evidence", title: "Documentar evidências", hint: "Guardar IDs, prints, consultas e resultados de testes sem expor dados sensíveis." },
];
const OPTIONS = [
  ["investigating", "Investigação em andamento"],
  ["guidance", "Orientação ao cliente"],
  ["correction", "Possível correção"],
  ["improvement", "Possível melhoria"],
  ["n2", "Escalonamento N2"],
  ["n3", "Escalonamento N3 / Desenvolvimento"],
  ["product", "Análise de Produto"],
] as const;
export function GuidedInvestigation({ subject, context, topicSummary }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [observed, setObserved] = useState("");
  const [expected, setExpected] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [evidence, setEvidence] = useState("");
  const [tests, setTests] = useState("");
  const [decision, setDecision] = useState<string>("investigating");
  const [conclusion, setConclusion] = useState("");
  const [copied, setCopied] = useState(false);
  const checks = useMemo(() => {
    const specific = (context?.diagnosticPlan ?? []).map(item => ({
      id: `plan:${item.key}`, title: item.title, hint: item.detail,
    }));
    return [...specific, ...DEFAULT_CHECKS];
  }, [context]);
  const done = checks.filter(item => checked[item.id]).length;
  const report = [
    "REGISTRO DE INVESTIGAÇÃO ASSISTIDA",
    `Assunto: ${subject}`,
    context?.ticket ? `Ticket Movidesk: #${context.ticket.movideskId} | Cliente: ${context.ticket.client || "Não informado"} | Responsável: ${context.ticket.owner || "Não informado"}` : "Investigação por tema (sem ticket individual vinculado)",
    `Evidências relacionadas na base: ${context ? `${context.summary?.similarCases ?? 0} casos semelhantes, ${context.summary?.relatedWorkItems ?? 0} itens Azure` : topicSummary ? `${topicSummary.tickets} tickets, ${topicSummary.workItems} itens Azure, ${topicSummary.knownProblems} problemas conhecidos` : "Não consultadas"}`,
    "", "COMPORTAMENTO OBSERVADO", observed || "Não registrado",
    "", "COMPORTAMENTO ESPERADO", expected || "Não registrado",
    "", "HIPÓTESES (NÃO CONFIRMADAS)", hypothesis || "Não registradas",
    "", "TESTES REALIZADOS", tests || "Não registrados",
    "", "EVIDÊNCIAS E FONTES", evidence || "Não registradas",
    "", "CHECKLIST", ...checks.map(item => `[${checked[item.id] ? "x" : " "}] ${item.title}`),
    "", "ENCAMINHAMENTO PROPOSTO", OPTIONS.find(option => option[0] === decision)?.[1] || decision,
    "", "CONCLUSÃO DO ANALISTA", conclusion || "Pendente",
    "", "Observação: correlação e hipóteses não comprovam causa raiz. Validar evidências antes do escalonamento.",
  ].join("\n");
  return <Card variant="outlined" sx={{borderRadius:3,mt:2}}>
    <CardContent sx={{p:{xs:2,md:3}}}>
      <Stack direction="row" spacing={1} useFlexGap sx={{flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
        <Box><Typography variant="h6" sx={{fontWeight:900}}>Investigação orientada do analista</Typography><Typography variant="body2" color="text.secondary">Registre o raciocínio técnico, valide as hipóteses e prepare um encaminhamento fundamentado.</Typography></Box>
        <Chip color={done===checks.length?"success":"primary"} variant="outlined" label={`${done}/${checks.length} verificações`}/>
      </Stack>
      <Alert severity="info" sx={{mt:2}}>As correlações da base são indícios, não diagnóstico confirmado. O analista é responsável pela validação. Este formulário permanece somente na sessão atual; copie o registro antes de sair.</Alert>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"minmax(0,1fr) minmax(0,1fr)"},gap:2,mt:2}}>
        <TextField label="Comportamento observado" value={observed} onChange={e=>setObserved(e.target.value)} multiline minRows={3} placeholder="O que ocorre? Em qual tela, operação, cliente e versão?"/>
        <TextField label="Comportamento esperado" value={expected} onChange={e=>setExpected(e.target.value)} multiline minRows={3} placeholder="Qual regra ou resultado deveria ser aplicado? Qual a fonte?"/>
        <TextField label="Hipóteses em investigação" value={hypothesis} onChange={e=>setHypothesis(e.target.value)} multiline minRows={3} placeholder="Possíveis causas, ainda não confirmadas."/>
        <TextField label="Testes e resultados" value={tests} onChange={e=>setTests(e.target.value)} multiline minRows={3} placeholder="Passos executados, resultado, ambiente e data."/>
      </Box>
      <Divider sx={{my:2}}/>
      <Typography sx={{fontWeight:850,mb:1}}>Roteiro de verificações</Typography>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"repeat(2,minmax(0,1fr))"},gap:1}}>
        {checks.map(item=><Box key={item.id} sx={{display:"flex",gap:1,border:"1px solid",borderColor:"divider",borderRadius:2,p:1.2,minWidth:0}}>
          <Checkbox size="small" checked={Boolean(checked[item.id])} onChange={e=>setChecked(old=>({...old,[item.id]:e.target.checked}))} inputProps={{"aria-label":item.title}}/>
          <Box sx={{minWidth:0}}><Typography variant="body2" sx={{fontWeight:750}}>{item.title}</Typography><Typography variant="caption" color="text.secondary">{item.hint}</Typography></Box>
        </Box>)}
      </Box>
      <TextField sx={{mt:2}} fullWidth label="Evidências e referências verificadas" value={evidence} onChange={e=>setEvidence(e.target.value)} multiline minRows={3} placeholder="Ticket, Task, regra BPMN, log, consulta SQL, print ou documento. Indique o resultado e a origem."/>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"minmax(0,1fr) minmax(0,2fr)"},gap:2,mt:2}}>
        <FormControl fullWidth><InputLabel id="guided-decision-label">Encaminhamento proposto</InputLabel><Select labelId="guided-decision-label" label="Encaminhamento proposto" value={decision} onChange={e=>setDecision(e.target.value)}>{OPTIONS.map(([key,label])=><MenuItem key={key} value={key}>{label}</MenuItem>)}</Select></FormControl>
        <TextField label="Conclusão fundamentada" value={conclusion} onChange={e=>setConclusion(e.target.value)} multiline minRows={2} placeholder="O que foi comprovado, o que permanece pendente e qual a próxima ação?"/>
      </Box>
      <Stack direction="row" spacing={1} sx={{justifyContent:"flex-end",mt:2}}>
        <Button variant="contained" startIcon={<ContentCopyOutlined/>} onClick={()=>void navigator.clipboard.writeText(report).then(()=>setCopied(true)).catch(()=>setCopied(false))}>Copiar registro técnico</Button>
      </Stack>
      {copied&&<Typography variant="caption" color="success.main" sx={{display:"block",textAlign:"right",mt:.5}}>Registro copiado. Anexe ao atendimento ou à tarefa para preservar o histórico.</Typography>}
    </CardContent>
  </Card>;
}
