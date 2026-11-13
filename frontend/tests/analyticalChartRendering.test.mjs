import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const uri=code=>'data:text/javascript,'+encodeURIComponent(code);
const compile=file=>ts.transpileModule(readFileSync(new URL('../src/components/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
 .replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 .replaceAll('"@mui/material"',JSON.stringify(import.meta.resolve('@mui/material')))
 .replaceAll("'@mui/material'",JSON.stringify(import.meta.resolve('@mui/material')))
 .replaceAll('"react"',JSON.stringify(import.meta.resolve('react')))
 .replaceAll('"@mui/icons-material/ListAltOutlined"',JSON.stringify(import.meta.resolve('@mui/icons-material/ListAltOutlined')));
const plotUri=uri(compile('AnalyticalLinePlot.tsx'));
const {AnalyticalLinePlot}=await import(plotUri);
const {SelectableDonut,SelectableHorizontalBars}=await import(uri(compile('ExecutiveChartControls.tsx').replace('"./AnalyticalLinePlot"',JSON.stringify(plotUri))));
const parts=[{name:'Alan',value:12,color:'#197350'},{name:'Thiago',value:8,color:'#316885'}];
test('linhas e pontos são desenhados sem depender de ResizeObserver ou montagem de portal',()=>{
 const html=renderToStaticMarkup(React.createElement(AnalyticalLinePlot,{data:[{key:'2026-11-12',label:'12/11',opened:42},{key:'2026-11-13',label:'13/11',opened:71}],series:[{key:'opened',name:'Abertos',color:'#197350'}],onInspect:()=>{}}));
 assert.ok(html.includes('<polyline'));assert.equal((html.match(/<circle/g)||[]).length,2);assert.ok(html.includes('Consultar Abertos em 13/11: 71'));assert.ok(!html.includes('recharts'));assert.ok(!html.includes('NaN'));
});
test('donut renderiza a composição colorida e legendas por nome sem checkbox',()=>{
 const html=renderToStaticMarkup(React.createElement(SelectableDonut,{title:'Carteira',description:'Atual',parts}));
 assert.ok(html.includes('conic-gradient'));assert.ok(html.includes('#197350'));assert.ok(html.includes('Ocultar Alan'));assert.ok(html.includes('aria-pressed="true"'));assert.ok(!html.includes('type="checkbox"'));
});
test('ranking apresenta barras, quantidades e consulta sem canvas SVG de biblioteca',()=>{
 const html=renderToStaticMarkup(React.createElement(SelectableHorizontalBars,{title:'Equipe',description:'Atual',parts,onInspect:()=>{}}));
 assert.ok(html.includes('Consultar Alan: 12'));assert.ok(html.includes('60%'));assert.ok(html.includes('40%'));assert.ok(!html.includes('recharts'));assert.ok(!html.includes('type="checkbox"'));
});
