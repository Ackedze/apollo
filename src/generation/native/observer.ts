export type NativeDiagnosticObserver = {
 status:'available'|'unknown'; scope:'current-page-nodechange'; pageId:string|null;
 coverage:'page-node-events-only'; otherPages:'not-observed'; styles:'not-observed';
 cleanup:'confirmed'|'unknown';
};
/** Event subscription only. Never loads, enumerates or modifies any page. */
export function createCurrentPageDiagnosticObserver(api:Pick<PluginAPI,'currentPage'|'on'|'off'>,invalidate:()=>void){
 let page:PageNode|null=null,callback:((event:NodeChangeEvent)=>void)|null=null;
 let running=false,pageListener=false,closeListener=false,cleanup=true;
 function detach(){
  const oldPage=page,oldCallback=callback;page=null;callback=null;
  if(oldPage&&oldCallback){try{oldPage.off('nodechange',oldCallback);}catch{cleanup=false;}}
 }
 function bind(){
  detach();if(!running)return;
  try{
   const current=api.currentPage;
   if(current.removed)return;
   const listener=()=>{if(running&&page===current&&callback===listener&&api.currentPage===current)invalidate();};
   page=current;callback=listener;
   try{current.on('nodechange',listener);}catch{callback=null;}
  }catch{page=null;callback=null;}
 }
 const changed=()=>{invalidate();bind();};
 function start(){
  if(running)return;running=true;
  try{api.on('currentpagechange',changed);pageListener=true;}catch{pageListener=false;}
  try{api.on('close',stop);closeListener=true;}catch{closeListener=false;}
  bind();
 }
 function stop(){
  running=false;detach();
  if(pageListener){try{api.off('currentpagechange',changed);}catch{cleanup=false;}pageListener=false;}
  if(closeListener){try{api.off('close',stop);}catch{cleanup=false;}closeListener=false;}
 }
 function snapshot():NativeDiagnosticObserver{
  let current=false;try{current=!!page&&!page.removed&&page===api.currentPage;}catch{current=false;}
  return{status:running&&pageListener&&current&&callback&&cleanup?'available':'unknown',scope:'current-page-nodechange',pageId:page?.id||null,coverage:'page-node-events-only',otherPages:'not-observed',styles:'not-observed',cleanup:cleanup?'confirmed':'unknown'};
 }
 return{start,stop,snapshot};
}
