import assert from "node:assert/strict";
import test from "node:test";
import { mergeNotificationItems } from "../src/utils/notificationItems.ts";
const item=(key,kind,day)=>({key,kind,occurredAt:`2026-10-${day}T12:00:00Z`});
test("atualização preserva reuniões e desktop, remove alertas antigos e evita duplicatas",()=>{
  const meeting=item("meeting","MEETING_REMINDER","12");
  const app=item("app","APP_VERSION","10");
  const current=[meeting,app,item("old","AZURE_UPDATED","09")];
  const updated={...app,occurredAt:"2026-10-13T12:00:00Z"};
  assert.deepEqual(mergeNotificationItems(current,[updated,item("new","CHAT_MENTION","11")]),
    [updated,meeting,item("new","CHAT_MENTION","11")]);
  assert.equal(current.length,3);
});
test("resposta vazia mantém apenas notificações de fontes independentes",()=>{
  const meeting=item("meeting","MEETING_REMINDER","12");
  assert.deepEqual(mergeNotificationItems([meeting,item("old","AZURE_UPDATED","09")],[]),[meeting]);
});
