import { deflateSync } from "node:zlib";

/**
 * Dependency-free, deterministic PNG charts for ExcelJS.
 * Charts are visual snapshots; source data remains editable in the workbook.
 */
type RGB = readonly [number, number, number];
const COLOR={
  background:[255,255,255] as RGB, grid:[226,234,228] as RGB,
  ink:[29,63,49] as RGB, muted:[112,130,117] as RGB,
  green:[26,119,79] as RGB, lightGreen:[94,171,126] as RGB,
  amber:[202,139,51] as RGB, red:[183,77,66] as RGB,
  blue:[52,113,150] as RGB, gray:[182,197,185] as RGB,
  lilac:[116,116,167] as RGB,
};
export type ChartDatum={name:string;value:number;color?:RGB};
export type TrendDatum={month:string;tickets:number;corrections:number;olaAlerts:number};

const glyphs:Record<string,string[]>={
 A:["01110","10001","10001","11111","10001","10001","10001"],
 B:["11110","10001","10001","11110","10001","10001","11110"],
 C:["01111","10000","10000","10000","10000","10000","01111"],
 D:["11110","10001","10001","10001","10001","10001","11110"],
 E:["11111","10000","10000","11110","10000","10000","11111"],
 F:["11111","10000","10000","11110","10000","10000","10000"],
 G:["01111","10000","10000","10111","10001","10001","01111"],
 H:["10001","10001","10001","11111","10001","10001","10001"],
 I:["11111","00100","00100","00100","00100","00100","11111"],
 J:["00111","00010","00010","00010","10010","10010","01100"],
 K:["10001","10010","10100","11000","10100","10010","10001"],
 L:["10000","10000","10000","10000","10000","10000","11111"],
 M:["10001","11011","10101","10101","10001","10001","10001"],
 N:["10001","11001","10101","10011","10001","10001","10001"],
 O:["01110","10001","10001","10001","10001","10001","01110"],
 P:["11110","10001","10001","11110","10000","10000","10000"],
 Q:["01110","10001","10001","10001","10101","10010","01101"],
 R:["11110","10001","10001","11110","10100","10010","10001"],
 S:["01111","10000","10000","01110","00001","00001","11110"],
 T:["11111","00100","00100","00100","00100","00100","00100"],
 U:["10001","10001","10001","10001","10001","10001","01110"],
 V:["10001","10001","10001","10001","10001","01010","00100"],
 W:["10001","10001","10001","10101","10101","10101","01010"],
 X:["10001","10001","01010","00100","01010","10001","10001"],
 Y:["10001","10001","01010","00100","00100","00100","00100"],
 Z:["11111","00001","00010","00100","01000","10000","11111"],
 "0":["01110","10011","10101","10101","11001","10001","01110"],
 "1":["00100","01100","00100","00100","00100","00100","01110"],
 "2":["01110","10001","00001","00010","00100","01000","11111"],
 "3":["11110","00001","00001","01110","00001","00001","11110"],
 "4":["00010","00110","01010","10010","11111","00010","00010"],
 "5":["11111","10000","10000","11110","00001","00001","11110"],
 "6":["01111","10000","10000","11110","10001","10001","01110"],
 "7":["11111","00001","00010","00100","01000","01000","01000"],
 "8":["01110","10001","10001","01110","10001","10001","01110"],
 "9":["01110","10001","10001","01111","00001","00001","11110"],
 " ":["00000","00000","00000","00000","00000","00000","00000"],
 "-":["00000","00000","00000","11111","00000","00000","00000"],
 ".":["00000","00000","00000","00000","00000","01100","01100"],
 "/":["00001","00001","00010","00100","01000","10000","10000"],
 ":":["00000","01100","01100","00000","01100","01100","00000"],
 "%":["11001","11010","00100","00100","01011","10011","00000"],
 "(" :["00010","00100","01000","01000","01000","00100","00010"],
 ")" :["01000","00100","00010","00010","00010","00100","01000"],
 "+" :["00000","00100","00100","11111","00100","00100","00000"],
 "?" :["01110","10001","00001","00010","00100","00000","00100"],
};
class Raster {
  readonly pixels:Uint8Array;
  constructor(public readonly width:number,public readonly height:number){
    this.pixels=new Uint8Array(width*height*4);
    this.rect(0,0,width,height,COLOR.background);
  }
  pixel(x:number,y:number,color:RGB){
    x=Math.round(x);y=Math.round(y);
    if(x<0||y<0||x>=this.width||y>=this.height)return;
    const p=(y*this.width+x)*4;
    this.pixels[p]=color[0];this.pixels[p+1]=color[1];this.pixels[p+2]=color[2];this.pixels[p+3]=255;
  }
  rect(x:number,y:number,w:number,h:number,color:RGB){
    const loX=Math.max(0,Math.floor(x)),hiX=Math.min(this.width,Math.ceil(x+w));
    const loY=Math.max(0,Math.floor(y)),hiY=Math.min(this.height,Math.ceil(y+h));
    for(let yy=loY;yy<hiY;yy++)for(let xx=loX;xx<hiX;xx++)this.pixel(xx,yy,color);
  }
  circle(cx:number,cy:number,r:number,color:RGB){
    const radius=r*r;
    for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++)
      for(let x=Math.floor(cx-r);x<=Math.ceil(cx+r);x++)
        if((x-cx)**2+(y-cy)**2<=radius)this.pixel(x,y,color);
  }
  line(x0:number,y0:number,x1:number,y1:number,color:RGB,width=2){
    const steps=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)*2));
    for(let n=0;n<=steps;n++){
      const t=n/steps,x=x0+(x1-x0)*t,y=y0+(y1-y0)*t;
      if(width<=1)this.pixel(x,y,color);else this.circle(x,y,width/2,color);
    }
  }
  text(x:number,y:number,value:string,color:RGB=COLOR.ink,scale=2){
    const raw=value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    let px=x;
    for(const ch of raw){
      const rows=glyphs[ch]??glyphs["?"]!;
      rows.forEach((bits,ry)=>{for(let cx=0;cx<5;cx++)if(bits[cx]==="1")
        this.rect(px+cx*scale,y+ry*scale,scale,scale,color);});
      px+=6*scale;
    }
  }
  png():Buffer{
    const raw=Buffer.alloc(this.height*(1+this.width*4));
    for(let y=0;y<this.height;y++){
      const target=y*(this.width*4+1);
      raw[target]=0; // PNG filter None
      Buffer.from(this.pixels.buffer).copy(raw,target+1,y*this.width*4,(y+1)*this.width*4);
    }
    const signature=Buffer.from([137,80,78,71,13,10,26,10]);
    const ihdr=Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width,0);ihdr.writeUInt32BE(this.height,4);
    ihdr[8]=8;ihdr[9]=6;
    return Buffer.concat([signature,chunk("IHDR",ihdr),chunk("IDAT",deflateSync(raw,{level:6})),chunk("IEND",Buffer.alloc(0))]);
  }
}
const crcTable=Uint32Array.from({length:256},(_,index)=>{
  let c=index;
  for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;
  return c>>>0;
});
function chunk(name:string,data:Buffer){
  const n=Buffer.from(name,"ascii"),part=Buffer.concat([n,data]);
  let crc=0xffffffff;
  for(const byte of part)crc=crcTable[(crc^byte)&0xff]!^(crc>>>8);
  const header=Buffer.alloc(4),tail=Buffer.alloc(4);
  header.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([header,part,tail]);
}
function title(g:Raster,heading:string,subheading:string){
  g.text(28,18,heading,COLOR.ink,3);
  g.text(28,51,subheading,COLOR.muted,2);
  g.rect(28,80,g.width-56,2,COLOR.grid);
}
export function renderDonut(titleText:string,values:ChartDatum[],width=800,height=380):Buffer{
  const g=new Raster(width,height);
  title(g,titleText,"DISTRIBUICAO POR SITUACAO");
  const items=values.map(v=>({...v,value:Math.max(0,Number(v.value)||0)}));
  const total=items.reduce((sum,d)=>sum+d.value,0);
  const colors=[COLOR.green,COLOR.amber,COLOR.red,COLOR.blue,COLOR.gray,COLOR.lilac];
  const cx=Math.round(width*.28),cy=Math.round(height*.60),outer=Math.min(125,Math.round(height*.31));
  if(total){
    const start=-Math.PI/2;const bounds:number[]=[];let cumulative=0;
    for(const item of items){cumulative+=item.value/total*Math.PI*2;bounds.push(start+cumulative);}
    for(let y=cy-outer;y<=cy+outer;y++)for(let x=cx-outer;x<=cx+outer;x++){
      const dist=Math.hypot(x-cx,y-cy);
      if(dist>outer||dist<outer*.55)continue;
      let angle=Math.atan2(y-cy,x-cx);if(angle<start)angle+=Math.PI*2;
      const k=bounds.findIndex(b=>angle<=b);
      g.pixel(x,y,items[Math.max(0,k)]?.color??colors[Math.max(0,k)%colors.length]!);
    }
  }else{
    g.circle(cx,cy,outer,COLOR.grid);
    g.circle(cx,cy,outer*.55,COLOR.background);
  }
  const big=String(total);
  g.text(cx-big.length*9,cy-16,big,COLOR.ink,3);
  g.text(cx-30,cy+16,"TOTAL",COLOR.muted,2);
  const sx=Math.round(width*.51),legendStart=112,gap=Math.min(62,Math.floor((height-150)/Math.max(1,items.length)));
  items.slice(0,5).forEach((item,i)=>{
    const y=legendStart+i*gap,c=item.color??colors[i%colors.length]!;
    g.rect(sx,y,13,13,c);
    const label=item.name.length>23?item.name.slice(0,23):item.name;
    g.text(sx+25,y,label,COLOR.ink,2);
    g.text(sx+25,y+21,`${item.value}  (${total?(item.value/total*100).toFixed(1):"0.0"}%)`,COLOR.muted,2);
  });
  return g.png();
}
export function renderMonthlyLine(titleText:string,data:TrendDatum[],series:"volume"|"ola"="volume",width=1000,height=420):Buffer{
  const g=new Raster(width,height);
  title(g,titleText,series==="volume"?"ABERTURAS X CORRECOES  -  EVOLUCAO MENSAL":"OCORRENCIAS DE ALERTA DE PRAZO  -  OLA");
  const left=82,right=width-45,top=115,bottom=height-84;
  const tracks:ReadonlyArray<{key:keyof TrendDatum;label:string;color:RGB}>=series==="volume"
    ? [{key:"tickets",label:"ATENDIMENTOS",color:COLOR.green},{key:"corrections",label:"CORRECOES",color:COLOR.blue}]
    : [{key:"olaAlerts",label:"ALERTAS OLA",color:COLOR.amber},{key:"corrections",label:"CORRECOES",color:COLOR.green}];
  const source=data.slice(-9);
  const max=Math.max(4,...source.flatMap(d=>tracks.map(t=>Number(d[t.key])||0)));
  const yMax=Math.ceil(max/4)*4,plotHeight=bottom-top;
  for(let i=0;i<=4;i++){
    const value=yMax*i/4,y=bottom-i/4*plotHeight;
    g.line(left,y,right,y,COLOR.grid,1);
    g.text(12,y-8,String(Math.round(value)),COLOR.muted,2);
  }
  g.line(left,bottom,right,bottom,COLOR.muted,1);
  const xAt=(i:number)=>left+(source.length<=1?(right-left)/2:i/(source.length-1)*(right-left));
  source.forEach((d,i)=>{
    const label=d.month.length>=7?d.month.slice(5,7)+"/"+d.month.slice(2,4):d.month;
    g.text(xAt(i)-25,bottom+14,label,COLOR.muted,2);
  });
  tracks.forEach((track,i)=>{
    const vals=source.map(d=>Number(d[track.key])||0);
    vals.forEach((v,j)=>{
      const x=xAt(j),y=bottom-v/yMax*plotHeight;
      if(j>0)g.line(xAt(j-1),bottom-vals[j-1]!/yMax*plotHeight,x,y,track.color,4);
      g.circle(x,y,5,track.color);
      if(source.length<=7&&i===0)g.text(x-7,Math.max(top-5,y-25),String(v),track.color,2);
    });
    const legendX=left+i*265;
    g.rect(legendX,height-32,15,10,track.color);
    g.text(legendX+22,height-38,track.label,COLOR.ink,2);
  });
  if(!source.length)g.text(width/2-100,height/2,"SEM REGISTROS",COLOR.muted,2);
  return g.png();
}
