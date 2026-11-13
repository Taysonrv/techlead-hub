import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
process.env.TZ='America/Sao_Paulo';
const js=ts.transpileModule(readFileSync(new URL('../src/utils/clientDeliveries.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {buildClientDeliveries}=await import('data:text/javascript,'+encodeURIComponent(js));
const start=new Date('2026-10-01T00:00:00-03:00'),end=new Date('2026-10-10T23:59:59.999-03:00');
const row=(id,task,more={})=>({id,azureWorkItem:{id:task,workItemType:'Correção Clientes',state:'Concluído',deliveredVersion:'7.18.35-rc',azureClosedAt:'2026-10-05T12:00:00-03:00',...more}});
test('entregas contam Tasks únicas, mantêm vínculos e agrupam versões',()=>{
 const a=buildClientDeliveries([row(1,100),row(2,100),row(3,101,{workItemType:'Evolução'})],start,end);
 assert.equal(a.corrections.length,1);assert.equal(a.evolutions.length,1);assert.equal(a.versions.length,1);
 assert.deepEqual(a.corrections[0].ticketIds,[1,2]);assert.equal(a.versions[0].items.length,2);
});
test('conclusão oficial determina período, excluindo cancelados, APOIO e versão ausente',()=>{
 const a=buildClientDeliveries([row(1,1,{azureClosedAt:'2026-09-25T10:00:00-03:00'}),row(2,2,{state:'Cancelado'}),row(3,3,{workItemType:'APOIO'}),row(4,4,{deliveredVersion:' '})],start,end);
 assert.equal(a.delivered.length,0);assert.equal(a.withoutVersion.length,1);assert.equal(a.previous.length,1);
 assert.equal(a.previousEnd.getTime()-a.previousStart.getTime(),end.getTime()-start.getTime());
});
test('data de alteração não substitui conclusão oficial; datas ausentes ficam explícitas',()=>{
 const a=buildClientDeliveries([row(1,1,{azureClosedAt:null,stateChangedAt:'2026-10-05T12:00:00-03:00'}),row(2,2,{azureClosedAt:'invalid'}),row(3,3,{state:'Em desenvolvimento'})],start,end);
 assert.equal(a.delivered.length,0);assert.equal(a.missingDate.length,2);assert.equal(a.inProgress.length,1);
});
test('série mensal concilia entregas, inclui mês anterior e respeita corte',()=>{
 const a=buildClientDeliveries([row(1,1),row(2,2,{azureClosedAt:'2026-10-11T00:00:00-03:00'}),row(3,3,{azureClosedAt:'2026-09-10T12:00:00-03:00'})],start,end);
 assert.equal(a.months.at(-1).corrections,1);assert.equal(a.months.at(-2).corrections,1);
 assert.equal(a.months.at(-1).rows.length,a.delivered.length);
});
test('comparação do intervalo usa datas de evento, inclusive resolução de ticket antigo',()=>{
 const tickets=[{...row(1,1),createdDate:'2026-09-25T10:00:00-03:00',resolvedDate:'2026-10-05T10:00:00-03:00',category:'Bug'},{...row(2,2),createdDate:'2026-10-03T10:00:00-03:00',category:'Bug'}];
 const a=buildClientDeliveries(tickets,start,end);
 assert.deepEqual(a.movements.map(m=>[m.current,m.previous]),[[1,1],[1,0],[1,1]]);
 assert.equal(a.movements[1].rate,null);
});
