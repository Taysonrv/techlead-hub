import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";

const page=readFileSync(new URL("../src/pages/Clients.tsx",import.meta.url),"utf8");
const meeting=readFileSync(new URL("../src/components/ClientMeetingInsights.tsx",import.meta.url),"utf8");
const analytics=readFileSync(new URL("../src/utils/clientMeetingAnalytics.ts",import.meta.url),"utf8");
const occurs=(source,phrase)=>source.split(phrase).length-1;

test("Clientes apresenta um cockpit primário e mantém histórico/apresentação recolhíveis",()=>{
 assert.equal(occurs(page,"<ClientMeetingInsights"),1);
 assert.equal(occurs(page,"<ClientMeetingPresentation"),1);
 assert.ok(page.includes("Detalhamento operacional e histórico"));
 assert.ok(page.includes("Distribuições complementares da carteira"));
 assert.ok(page.includes('className="client-presentation-container"'));
 assert.ok(page.includes('expanded={presentationExpanded}'));
 assert.ok(page.includes("Abrir apresentação / PDF")||meeting.includes("Abrir apresentação / PDF"));
});
test("não duplica gráfico de fluxo mensal nem usa os antigos PieCharts com legendas inconsistentes",()=>{
 assert.equal(occurs(page,"Evolução mensal de abertos, resolvidos e encerrados"),0);
 assert.ok(page.includes("<SelectableDonut"));
 assert.ok(page.includes("<SelectableHorizontalBars"));
 assert.equal(occurs(page,"function CompactPieTooltip"),0);
 assert.equal(occurs(page,"function ChartCard"),0);
 assert.equal(occurs(page,"function EmptyChart"),0);
});
test("cliente com backlog histórico permanece no seletor e o PDF inclui seis páginas",()=>{
 assert.ok(page.includes("tickets.filter((ticket) => ticket.isWithSimer === true)"));
 assert.ok(page.includes("Página {presentationPage + 1} de 6"));
 assert.ok(page.includes("[0, 1, 2, 3, 4, 5]"));
 assert.ok(page.includes("overflow: visible !important;"));
 assert.ok(page.includes("body.client-pdf-export .client-presentation-container"));
 assert.ok(!page.includes("body.client-pdf-export main > div:last-child > :not(#client-export-content)"));
});
test("relatório usa uma única fonte para pendências públicas e mantém marcos de solução",()=>{
 assert.ok(page.includes("meetingAnalytics.pendingNow.length"));
 assert.ok(!page.includes("presentationSummary.pending"));
 assert.ok(analytics.includes("pendingByOwner:group(pendingNow"));
 assert.ok(analytics.includes("pendingByAge:group(pendingNow"));
 assert.ok(analytics.includes("isTicketCancelled"));
 assert.ok(page.includes('if (ticket.isWithSimer !== true || !ticket.resolvedDate) return false;'));
 assert.ok(page.includes("solvedInPeriod.averageMinutes"));
});

test("categoria Bug não é inferida de uma Task Correção nem de rótulo de problema",()=>{
 const start=page.indexOf("function isBug(ticket: Ticket)");
 const end=page.indexOf("function taskStatusGroup",start);
 assert.ok(start>=0&&end>start);
 const implementation=page.slice(start,end);
 assert.ok(implementation.includes('normalize(ticket.category)==="bug"'));
 assert.ok(!implementation.includes("workItemType"));
 assert.ok(!implementation.includes("erro de sistema"));
});

test("tempo de solução não é inflado pela data posterior de encerramento",()=>{
 assert.ok(page.includes("ticket.resolvedDate || ticket.closedDate"));
 assert.ok(page.includes("solvedInPeriod.averageMinutes"));
});

test("cliente é a seleção primária, filtros avançados recolhíveis, consulta pública removida",()=>{
 assert.ok(page.includes("<Autocomplete"));
 assert.ok(page.includes('noOptionsText="Nenhum cliente da carteira encontrado"'));
 assert.ok(page.includes('aria-controls="clients-advanced-filters"'));
 assert.ok(page.includes("<Collapse in={advancedFiltersOpen} unmountOnExit>"));
 assert.ok(page.includes("Limpar filtros adicionais"));
 assert.ok(!page.includes("<PublicClientEnrichment"));
 assert.ok(!page.includes('from "../components/PublicIntegrations"'));
});
test("qualidade de atendimento aparece em quatro cards e não em chips de métricas",()=>{
 const metricComponent=readFileSync(new URL("../src/components/ClientMeetingInsights.tsx",import.meta.url),"utf8");
 for(const label of ["SLA de solução","Resolução no primeiro contato","Satisfação do cliente (CSAT)","Tickets reabertos no mês"]){
  assert.ok(metricComponent.includes('<Kpi label="'+label),label);
 }
 assert.ok(!metricComponent.includes('<Chip size="small" variant="outlined" label={"Primeiro contato:'));
 assert.ok(metricComponent.includes('a.csat.percentage===null?"N/D"'));
});

test("CSAT e primeiro contato possuem trilha completa do Movidesk ao card",()=>{
 const snapshot=readFileSync(new URL("../../backend/src/controllers/DashboardController.ts",import.meta.url),"utf8");
 const importer=readFileSync(new URL("../../backend/src/services/MovideskJsonImportService.ts",import.meta.url),"utf8");
 const audit=readFileSync(new URL("../src/utils/clientMeetingAnalytics.ts",import.meta.url),"utf8");
 assert.ok(snapshot.includes("satisfactionDate:"));
 assert.ok(snapshot.includes("resolvedInFirstCall:"));
 assert.ok(snapshot.includes("reopenedDate:"));
 assert.ok(importer.includes('typeof row.resolvedInFirstCall === "boolean"'));
 assert.ok(audit.includes('const firstCallMeasured=resolvedTickets.filter'));
 assert.ok(audit.includes('eventWithin(t,"satisfactionDate",monthStart,monthCutoff)'));
 assert.ok(audit.includes('eventWithin(t,"reopenedDate",monthStart,monthCutoff)'));
});

test("filtro de período fica na mesma barra do cliente, fora do cabeçalho",()=>{
 assert.equal(occurs(page,"<PeriodFilter />"),1);
 const headerStart=page.indexOf('<PageHeader');
 const headerEnd=page.indexOf('/>',headerStart);
 assert.ok(headerStart>=0&&headerEnd>headerStart);
 assert.ok(!page.slice(headerStart,headerEnd).includes('action={<PeriodFilter />'));
 const toolbarStart=page.indexOf("Seleção rápida do cliente");
 const toolbarEnd=page.indexOf("Pacote gerencial",toolbarStart);
 assert.ok(toolbarStart>headerEnd);
 assert.ok(page.slice(toolbarStart,toolbarEnd).includes("<Autocomplete"));
 assert.ok(page.slice(toolbarStart,toolbarEnd).includes("<PeriodFilter />"));
 assert.ok(page.slice(toolbarStart,toolbarEnd).includes("Mais filtros"));
 assert.ok(page.slice(toolbarStart,toolbarEnd).includes("Limpar tudo"));
});
test("cards semanais reutilizam o Dashboard KpiCard com favorito, info e drilldown",()=>{
 assert.ok(meeting.includes('import { KpiCard as ExecutiveKpiCard } from "./KpiCard"'));
 assert.ok(meeting.includes("<ExecutiveKpiCard title={label}"));
 assert.ok(meeting.includes("info={info} accent={accent} onClick={onClick}"));
 assert.ok(meeting.includes("KPI_EXPLANATIONS"));
 assert.ok(meeting.includes('a.csat.percentage===null?"N/D"'));
 const shared=readFileSync(new URL("../src/components/KpiCard.tsx",import.meta.url),"utf8");
 assert.ok(shared.includes("InfoOutlined"));
 assert.ok(shared.includes("StarBorderRounded"));
 assert.ok(shared.includes('event.stopPropagation()'));
});

test("indicadores de SLA aplicam a régua visual do Dashboard e possuem explicação no i",()=>{
 assert.ok(meeting.includes('const slaAccent=(value:number|null)'));
 assert.ok(meeting.includes('value>=90?semanticChartColors.positive'));
 assert.ok(meeting.includes('value>=80?semanticChartColors.attention:semanticChartColors.overdue'));
 assert.ok(meeting.includes('color={slaAccent(a.responseSla.percentage)}'));
 assert.ok(meeting.includes('color={slaAccent(a.solutionSla.percentage)}'));
 assert.ok(meeting.includes('metadata={{source:"Movidesk — snapshot sincronizado no HUB"'));
 assert.ok(meeting.includes("KPI_EXPLANATIONS"));
});
test("cliente e período possuem rótulos alinhados e a seleção do cliente não é excessivamente larga",()=>{
 assert.ok(page.includes('htmlFor="clients-client-selector"'));
 assert.ok(page.includes('id="clients-client-selector"'));
 assert.ok(page.includes('maxWidth:{xs:"100%",xl:620}'));
 assert.ok(page.includes('gridTemplateColumns:{\n              xs:"minmax(0,1fr)"'));
});
