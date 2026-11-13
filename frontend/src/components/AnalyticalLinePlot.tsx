import {Box,Typography} from '@mui/material';
export type PlotRow={key:string;label:string;[field:string]:string|number};
export type PlotSeries={key:string;name:string;color:string};
/** Deterministic SVG geometry: no ResizeObserver or chart portal is required to draw. */
export function AnalyticalLinePlot({data,series,onInspect}:{data:PlotRow[];series:PlotSeries[];onInspect?:(key:string,series:string)=>void}){
 if(!data.length||!series.length)return <Box sx={{py:5,textAlign:'center'}}><Typography variant="body2" color="text.secondary">Sem dados ou séries visíveis neste intervalo.</Typography></Box>;
 const width=720,height=280,left=48,right=22,top=18,bottom=44;
 const max=Math.max(1,...data.flatMap(row=>series.map(s=>Number(row[s.key])||0)));
 const ceiling=Math.max(1,Math.ceil(max/4)*4);
 const x=(i:number)=>data.length===1?(left+width-right)/2:left+i/(data.length-1)*(width-left-right);
 const y=(value:number)=>height-bottom-Math.max(0,value)/ceiling*(height-top-bottom);
 const tickEvery=Math.max(1,Math.ceil((data.length-1)/6));
 return <Box sx={{width:'100%',minWidth:0,lineHeight:0}}>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width="100%" height={260} role="img" aria-label="Evolução dos indicadores no período" style={{display:'block',overflow:'visible'}}
    onClick={event=>{if(!onInspect)return;const matrix=event.currentTarget.getScreenCTM();if(!matrix)return;const point=event.currentTarget.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const local=point.matrixTransform(matrix.inverse());if(local.x<left||local.x>width-right||local.y<top||local.y>height-bottom)return;const index=data.length===1?0:Math.max(0,Math.min(data.length-1,Math.round((local.x-left)/(width-left-right)*(data.length-1))));onInspect(data[index]!.key,series.length===1?series[0]!.key:'tickets');}}>
   <title>Evolução por período. Os pontos permitem consultar os registros.</title>
   {[0,1,2,3,4].map(i=>{const value=ceiling*i/4;return <g key={i}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke="currentColor" opacity={.12} strokeDasharray="3 4"/><text x={left-9} y={y(value)+4} textAnchor="end" fill="currentColor" fontSize={12}>{value.toLocaleString('pt-BR',{maximumFractionDigits:1})}</text></g>;})}
   {data.map((row,i)=>(i%tickEvery===0||i===data.length-1)&&<text key={row.key} x={x(i)} y={height-14} textAnchor="middle" fill="currentColor" fontSize={12}>{row.label}</text>)}
   {series.map(s=><g key={s.key}>
    <polyline points={data.map((row,i)=>`${x(i)},${y(Number(row[s.key])||0)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={3} strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
    {data.map((row,i)=><circle key={row.key} cx={x(i)} cy={y(Number(row[s.key])||0)} r={5} fill={s.color} stroke="white" strokeWidth={1.5} role={onInspect?'button':undefined} tabIndex={onInspect?0:undefined}
      aria-label={`Consultar ${s.name} em ${row.label}: ${row[s.key]??0}`} style={{cursor:onInspect?'pointer':'default'}}
      onClick={event=>{event.stopPropagation();onInspect?.(row.key,s.key);}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onInspect?.(row.key,s.key);}}}>
      <title>{`${row.label} · ${s.name}: ${row[s.key]??0}`}</title>
    </circle>)}
   </g>)}
  </svg>
 </Box>;
}
