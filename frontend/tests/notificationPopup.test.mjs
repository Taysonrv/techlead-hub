import assert from 'node:assert/strict';
import test from 'node:test';
import {selectPopupCandidates} from '../src/utils/notificationPopup.ts';
const now=Date.parse('2026-11-13T18:00:00Z');
const item=(key,kind,age)=>({key,kind,occurredAt:new Date(now-age).toISOString()});
test('popups incluem versões e Tasks recentes, sem repetir exibidos ou avisos antigos',()=>{
 const rows=[item('a','APP_VERSION',1000),item('b','AZURE_COMPLETED',2000),item('c','SIMER_VERSION',3000),item('d','USER_ONLINE',100),item('old','OPERATION_ALERT',600000),item('future','CHAT_MENTION',-1000)];
 assert.deepEqual(selectPopupCandidates(rows,new Set(['a']),now,2).map(i=>i.key),['b','c']);
});
test('fila preserva excedentes para o próximo lote e respeita capacidade zero',()=>{
 const rows=[item('a','TEAM_ACTION',1000),item('b','AZURE_UPDATED',2000),item('c','KNOWN_PROBLEM',3000)];
 const first=selectPopupCandidates(rows,new Set(),now,2);
 assert.deepEqual(first.map(i=>i.key),['a','b']);
 assert.deepEqual(selectPopupCandidates(rows,new Set(first.map(i=>i.key)),now,2).map(i=>i.key),['c']);
 assert.deepEqual(selectPopupCandidates(rows,new Set(),now,0),[]);
 assert.equal(rows.length,3);
});
