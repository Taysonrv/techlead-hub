import { Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { AddOutlined, RemoveOutlined, AccountTreeOutlined, OpenInNewOutlined, UnfoldLessOutlined, CenterFocusStrongOutlined, LaunchOutlined } from "@mui/icons-material";
import { memo, useEffect, useMemo, useRef, useState } from "react";

export type SimerTreeNode={id:number;nodeId:string|null;parentNodeId:string|null;nodeText:string;path:string;depth:number;nodeKind:string|null;link:string|null;sourceFile:string;mapName:string};
type ViewNode=SimerTreeNode&{children:ViewNode[]};

function buildTree(items:SimerTreeNode[]){
 const byId=new Map<string,ViewNode>(),roots:ViewNode[]=[];
 items.forEach((x,i)=>byId.set(x.nodeId||`row-${i}`,{...x,children:[]}));
 items.forEach((x,i)=>{const node=byId.get(x.nodeId||`row-${i}`)!;const parent=x.parentNodeId?byId.get(x.parentNodeId):undefined;if(parent)parent.children.push(node);else roots.push(node);});
 return roots;
}
const Branch=memo(function Branch({node,level=0,expanded,active,onToggle,onSelect,onFollowLink}:{node:ViewNode;level?:number;expanded:Set<number>;active:number|null;onToggle:(id:number)=>void;onSelect:(n:SimerTreeNode)=>void;onFollowLink:(n:SimerTreeNode)=>void;onOpenContainer:(n:SimerTreeNode)=>void}){
 const open=expanded.has(node.id);const children=node.children.length>0;const containerRef=/\\$?container[A-Za-z0-9_]+/i.test(node.nodeText);
 return <Box id={`simer-node-${node.id}`} sx={{position:"relative",pl:level?2.4:0,scrollMargin:80}}>
  {level>0&&<Box sx={{position:"absolute",left:7,top:0,bottom:"50%",borderLeft:"1px solid",borderBottom:"1px solid",borderColor:"divider",width:12,borderBottomLeftRadius:8}}/>}
  <Stack direction="row" spacing={.5} sx={{alignItems:"center",minHeight:34,position:"relative",zIndex:1}}>
   {children?<IconButton size="small" onClick={()=>onToggle(node.id)} sx={{width:24,height:24,bgcolor:"background.paper",border:"1px solid",borderColor:"divider"}}>{open?<RemoveOutlined sx={{fontSize:15}}/>:<AddOutlined sx={{fontSize:15}}/>}</IconButton>:<Box sx={{width:24}}/>}
   <Box onClick={()=>onSelect(node)} sx={{display:"flex",alignItems:"center",gap:.7,px:1,py:.45,border:"1px solid",borderColor:active===node.id?"primary.main":"divider",borderRadius:1.5,bgcolor:active===node.id?"action.selected":"background.paper",boxShadow:active===node.id?"0 0 0 2px rgba(24,199,122,.12)":"none",cursor:"pointer","&:hover":{borderColor:"primary.main",bgcolor:"action.hover"}}}>
    <Typography variant="body2" sx={{fontWeight:level===0?900:700,whiteSpace:"nowrap"}}>{node.nodeText}</Typography>
    {node.nodeKind&&<Chip size="small" label={node.nodeKind} sx={{height:19,fontSize:".62rem"}}/>}
    {containerRef&&<Tooltip title="Abrir definição do container"><IconButton size="small" color="primary" onClick={e=>{e.stopPropagation();onOpenContainer(node);}} sx={{width:22,height:22}}><LaunchOutlined sx={{fontSize:14}}/></IconButton></Tooltip>}{node.link&&<Tooltip title="Abrir mapa vinculado"><IconButton size="small" color="primary" onClick={e=>{e.stopPropagation();onFollowLink(node);}} sx={{width:22,height:22}}><OpenInNewOutlined sx={{fontSize:14}}/></IconButton></Tooltip>}
   </Box>
  </Stack>
  {open&&children&&<Box sx={{ml:1.5,borderLeft:"1px solid",borderColor:"divider"}}>{node.children.map(child=><Branch key={child.id} node={child} level={level+1} expanded={expanded} active={active} onToggle={onToggle} onSelect={onSelect} onFollowLink={onFollowLink} onOpenContainer={onOpenContainer}/>)}</Box>}
 </Box>;
});
export function SimerMapTree({items,focusId,onSelect,onFollowLink,onOpenContainer}:{items:SimerTreeNode[];focusId?:number|null;onSelect:(n:SimerTreeNode)=>void;onFollowLink:(n:SimerTreeNode)=>void;onOpenContainer:(n:SimerTreeNode)=>void}){
 const roots=useMemo(()=>buildTree(items),[items]);const[expanded,setExpanded]=useState<Set<number>>(new Set());const[active,setActive]=useState<number|null>(focusId??null);const viewport=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{const next=new Set<number>();roots.forEach(r=>next.add(r.id));if(focusId){const target=items.find(x=>x.id===focusId);if(target){let parent=target.parentNodeId;next.add(target.id);while(parent){const p=items.find(x=>x.nodeId===parent);if(!p)break;next.add(p.id);parent=p.parentNodeId;}setActive(target.id);}}setExpanded(next);},[items,focusId]);
 const center=()=>{if(!active||!viewport.current)return;const el=viewport.current.querySelector<HTMLElement>(`#simer-node-${active}`);if(!el)return;viewport.current.scrollTo({top:Math.max(0,el.offsetTop-viewport.current.clientHeight/2),left:Math.max(0,el.offsetLeft-80),behavior:"smooth"});};
 return <Box ref={viewport} sx={{height:"58vh",minHeight:480,overflow:"auto",p:2,border:"1px solid",borderColor:"divider",borderRadius:3,bgcolor:"background.default"}}>
  <Stack direction="row" spacing={1} sx={{alignItems:"center",mb:1.5,position:"sticky",top:0,zIndex:3,bgcolor:"background.default",py:.5}}><AccountTreeOutlined color="primary"/><Typography sx={{fontWeight:900}}>Mapa navegável</Typography><Chip size="small" label={`${items.length.toLocaleString("pt-BR")} nós`}/><Box sx={{flex:1}}/><Chip size="small" variant="outlined" label="Carregamento otimizado"/><Button size="small" startIcon={<UnfoldLessOutlined/>} onClick={()=>setExpanded(new Set(roots.map(x=>x.id)))}>Recolher</Button><Button size="small" startIcon={<CenterFocusStrongOutlined/>} disabled={!active} onClick={center}>Centralizar</Button></Stack>
  <Box sx={{minWidth:"max-content",pb:3}}>{roots.map(root=><Branch key={root.id} node={root} expanded={expanded} active={active} onFollowLink={onFollowLink} onOpenContainer={onOpenContainer} onToggle={id=>setExpanded(v=>{const n=new Set(v);n.has(id)?n.delete(id):n.add(id);return n;})} onSelect={node=>{setActive(node.id);onSelect(node);}}/>)}</Box>
 </Box>;
}