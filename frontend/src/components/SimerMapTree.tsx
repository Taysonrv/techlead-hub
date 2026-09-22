import { Box, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { AddOutlined, RemoveOutlined, AccountTreeOutlined, OpenInNewOutlined } from "@mui/icons-material";
import { useMemo, useState } from "react";

export type SimerTreeNode={id:number;nodeId:string|null;parentNodeId:string|null;nodeText:string;path:string;depth:number;nodeKind:string|null;link:string|null;sourceFile:string;mapName:string};
type ViewNode=SimerTreeNode&{children:ViewNode[]};

function buildTree(items:SimerTreeNode[]){
 const byId=new Map<string,ViewNode>(),roots:ViewNode[]=[];
 items.forEach((x,i)=>byId.set(x.nodeId||`row-${i}`,{...x,children:[]}));
 items.forEach((x,i)=>{const node=byId.get(x.nodeId||`row-${i}`)!;const parent=x.parentNodeId?byId.get(x.parentNodeId):undefined;if(parent)parent.children.push(node);else roots.push(node);});
 return roots;
}
function Branch({node,level=0,onSelect}:{node:ViewNode;level?:number;onSelect:(n:SimerTreeNode)=>void}){
 const[open,setOpen]=useState(level<2);const children=node.children.length>0;
 return <Box sx={{position:"relative",pl:level?2.4:0}}>
  {level>0&&<Box sx={{position:"absolute",left:7,top:0,bottom:"50%",borderLeft:"1px solid",borderBottom:"1px solid",borderColor:"divider",width:12,borderBottomLeftRadius:8}}/>}
  <Stack direction="row" spacing={.5} sx={{alignItems:"center",minHeight:34,position:"relative",zIndex:1}}>
   {children?<IconButton size="small" onClick={()=>setOpen(v=>!v)} sx={{width:24,height:24,bgcolor:"background.paper",border:"1px solid",borderColor:"divider"}}>{open?<RemoveOutlined sx={{fontSize:15}}/>:<AddOutlined sx={{fontSize:15}}/>}</IconButton>:<Box sx={{width:24}}/>}
   <Box onClick={()=>onSelect(node)} sx={{display:"flex",alignItems:"center",gap:.7,px:1,py:.45,border:"1px solid",borderColor:"divider",borderRadius:1.5,bgcolor:"background.paper",cursor:"pointer","&:hover":{borderColor:"primary.main",bgcolor:"action.hover"}}}>
    <Typography variant="body2" sx={{fontWeight:level===0?900:700,whiteSpace:"nowrap"}}>{node.nodeText}</Typography>
    {node.nodeKind&&<Chip size="small" label={node.nodeKind} sx={{height:19,fontSize:".62rem"}}/>}
    {node.link&&<Tooltip title={node.link}><OpenInNewOutlined color="primary" sx={{fontSize:14}}/></Tooltip>}
   </Box>
  </Stack>
  {open&&children&&<Box sx={{ml:1.5,borderLeft:"1px solid",borderColor:"divider"}}>{node.children.map(child=><Branch key={child.id} node={child} level={level+1} onSelect={onSelect}/>)}</Box>}
 </Box>;
}
export function SimerMapTree({items,onSelect}:{items:SimerTreeNode[];onSelect:(n:SimerTreeNode)=>void}){
 const roots=useMemo(()=>buildTree(items),[items]);
 return <Box sx={{minHeight:420,maxHeight:"68vh",overflow:"auto",p:2,border:"1px solid",borderColor:"divider",borderRadius:3,bgcolor:"background.default"}}>
  <Stack direction="row" spacing={1} sx={{alignItems:"center",mb:1.5}}><AccountTreeOutlined color="primary"/><Typography sx={{fontWeight:900}}>Árvore técnica</Typography><Chip size="small" label={`${items.length.toLocaleString("pt-BR")} nós`}/></Stack>
  <Box sx={{minWidth:"max-content"}}>{roots.map(root=><Branch key={root.id} node={root} onSelect={onSelect}/>)}</Box>
 </Box>;
}