import assert from "node:assert/strict";
import test from "node:test";
import { inflateSync } from "node:zlib";
import { renderDonut, renderMonthlyLine } from "../src/services/ExecutiveChartPng";

function verifyPng(bytes:Buffer,w:number,h:number){
  assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  assert.equal(bytes.subarray(12,16).toString("ascii"),"IHDR");
  assert.equal(bytes.readUInt32BE(16),w);
  assert.equal(bytes.readUInt32BE(20),h);
  const parts:Buffer[]=[];let cursor=8;
  while(cursor<bytes.length){
    const length=bytes.readUInt32BE(cursor),type=bytes.toString("ascii",cursor+4,cursor+8);
    if(type==="IDAT")parts.push(bytes.subarray(cursor+8,cursor+8+length));
    cursor+=12+length;
    if(type==="IEND")break;
  }
  const pixels=inflateSync(Buffer.concat(parts));
  assert.equal(pixels.byteLength,h*(w*4+1));
  assert.equal(pixels[0],0);
}
test("PNG donut tem dados válidos inclusive para distribuição vazia",()=>{
  verifyPng(renderDonut("CORRECOES",[{name:"CONCLUIDAS",value:8},{name:"ABERTAS",value:3},{name:"CANCELADAS",value:1}],640,320),640,320);
  verifyPng(renderDonut("OLA",[],640,320),640,320);
});
test("PNG linha apresenta gráfico mesmo com um mês e com série vazia",()=>{
  verifyPng(renderMonthlyLine("TENDENCIA",[{month:"2026-11",tickets:12,corrections:5,olaAlerts:2}],"volume",700,350),700,350);
  verifyPng(renderMonthlyLine("OLA",[],"ola",700,350),700,350);
});
