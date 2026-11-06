'use strict';
// Generation writes go directly through CLI/Figma MCP; the plugin supplies UI context only.
function createLandingCanvasBridge({api,post,buildId=null}){
 const pageOf=node=>{for(let n=node;n;n=n.parent)if(n.type==='PAGE')return n;return null;};
 function context(){
  const page=api.currentPage,sections=[],queue=Array.from(page.children),selected=new Set();
  while(queue.length){const n=queue.shift();if(n.type==='SECTION'&&!n.removed){sections.push({id:n.id,name:n.name});queue.push(...n.children);}}
  for(let n of page.selection||[]){while(n&&n!==page&&n.type!=='SECTION')n=n.parent;selected.add(n?.type==='SECTION'&&pageOf(n)===page?n.id:null);}
  let fileKey=null;try{fileKey=api.fileKey||null;}catch{}
  return {pageId:page.id,fileKey,buildId,flow:'direct-cli-mcp-v1',sections,selectedSectionId:selected.size===1?Array.from(selected)[0]:null};
 }
 function accept(message){
  if(message?.type!=='landing-canvas')return false;
  if(typeof message.requestId!=='string'||!/^[a-zA-Z0-9._:-]{1,120}$/.test(message.requestId))return true;
  let value=null,error=null;
  try{
   if(message.operation==='context'&&message.payload&&Object.keys(message.payload).length===0)value=context();
   else if(message.operation==='release')value={preserved:true};
   else error={code:'LANDING_LEGACY_FLOW_RETIRED'};
  }catch(e){error={code:'LANDING_CONTEXT_UNAVAILABLE',nativeMessage:String(e.message).slice(0,500)};}
  post({type:'landing-canvas-result',requestId:message.requestId,operation:message.operation,value,error});return true;
 }
 return {accept,close(){},pageChanged(){},busy:()=>false};
}
module.exports={createLandingCanvasBridge};
