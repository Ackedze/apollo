// Console-only audit timeline. Never include document values or exception bodies.
const fields=['runId','attempt','stage','operation','nodeId','resourceId','factKind','reason','expectedHash','actualHash','count','durationMs'];
function createAuditTrace(write=entry=>console.info('[Apollo audit]',entry),now=Date.now){
 const recent=[];let sequence=0;
 return(event,data={})=>{
  const entry={event,sequence:++sequence,at:now()};
  for(const key of fields){const value=data[key];if(typeof value==='string')entry[key]=value.slice(0,250);else if(typeof value==='number'&&Number.isFinite(value))entry[key]=value;}
  if(Array.isArray(data.changedFields))entry.changedFields=data.changedFields.filter(v=>typeof v==='string').slice(0,24).map(v=>v.slice(0,200));
  recent.push(entry);if(recent.length>80)recent.shift();
  if(['facts-changed','phase-drift','phase-summary','audit-start','audit-complete','audit-stop'].includes(event)){
   const output=Object.assign({},entry);if(event==='facts-changed'||event==='phase-drift')output.timeline=recent.slice(-24);
   try{write(output);}catch(_){}
  }
 };
}
const trace=createAuditTrace();
module.exports={trace,createAuditTrace};
