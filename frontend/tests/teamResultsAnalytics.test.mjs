import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
process.env.TZ='America/Sao_Paulo';
const code=name=>ts.transpileModule(readFileSync(new URL('../src/utils/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=js=>'data:text/javascript,'+encodeURIComponent(js);
const source=code('teamResultsAnalytics').replace("'./operationalMetrics'",JSON.stringify(url(code('operationalMetrics')))).replace('"./operationalMetrics"',JSON.stringify(url(code('operationalMetrics')))).replace("'./timestampSla'",JSON.stringify(url(code('timestampSla')))).replace('"./timestampSla"',JSON.stringify(url(code('timestampSla'))));
const {buildTeamResults,buildTeamTimeline,localDateKey}=await import(url(source));
const start=new Date('2026-11-01T00:00:00-03:00'),end=new Date('2026-11-13T23:59:59.999-03:00');
const row=(id,extra={})=>({id,movideskId:id,createdDate:'2026-11-03T12:00:00-03:00',ticketType:2,isWithSimer:true,baseStatus:'InAttendance',owner:'Analista '+id,...extra});
test('timeline reconcilia entradas e resoluções antigas e preserva limites locais',()=>{
 const rows=[row(1),row(2,{createdDate:'2026-10-01T12:00:00-03:00',resolvedDate:'2026-11-05T12:00:00-03:00'}),row(3,{createdDate:'2026-11-13T23:30:00-03:00'})];
 const a=buildTeamResults(rows,start,end);assert.equal(a.opened.length,2);assert.equal(a.resolved.length,1);
 assert.equal(a.chart.reduce((s,r)=>s+r.abertos,0),2);assert.equal(a.chart.reduce((s,r)=>s+r.resolvidos,0),1);
 assert.equal(a.chart.at(-1).date,'2026-11-13');assert.equal(localDateKey(new Date('2026-11-13T23:30:00-03:00')),'2026-11-13');
});
test('mais de 370 dias não corta eventos no final e agrupa por mês',()=>{
 const first=new Date('2023-01-15T00:00:00-03:00'),last=new Date('2026-11-13T23:59:59.999-03:00');
 const a=buildTeamTimeline([row(1,{createdDate:'2026-11-13T12:00:00-03:00'})],[],first,last);
 assert.equal(a.grain,'month');assert.equal(a.buckets.at(-1).abertos,1);assert.equal(a.buckets.at(-1).end.getTime(),last.getTime());
});
test('ranking mantém responsáveis com backlog e sem resoluções, inclusive após os 15 primeiros',()=>{
 const rows=Array.from({length:20},(_,i)=>row(i,{resolvedDate:i<15?'2026-11-05T12:00:00-03:00':null}));
 const a=buildTeamResults(rows,start,end);assert.equal(a.team.length,20);assert.equal(a.team.find(r=>r.name==='Analista 19').backlog,1);
});
test('CSAT usa resposta da pesquisa, somente público e nota válida',()=>{
 const rows=[row(1,{createdDate:'2026-09-01T00:00:00-03:00',satisfactionDate:'2026-11-06T00:00:00-03:00',satisfactionScore:5}),row(2,{satisfactionScore:4,closedDate:'2026-11-06T00:00:00-03:00'}),row(3,{ticketType:1,satisfactionScore:5,satisfactionDate:'2026-11-06T00:00:00-03:00'}),row(4,{satisfactionScore:7,satisfactionDate:'2026-11-06T00:00:00-03:00'})];
 const a=buildTeamResults(rows,start,end);assert.equal(a.satisfaction.length,1);assert.equal(a.good,1);
});
test('fechamentos cancelados não entram e comparação tem duração equivalente',()=>{
 const a=buildTeamResults([row(1,{closedDate:'2026-11-05T00:00:00-03:00',baseStatus:'Canceled'}),row(2,{closedDate:'2026-11-05T00:00:00-03:00',baseStatus:'Closed'})],start,end);
 assert.equal(a.closed.length,1);assert.equal(a.comparison.previousEnd.getTime()-a.comparison.previousStart.getTime(),end.getTime()-start.getTime());
});
