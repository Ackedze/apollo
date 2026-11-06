'use strict';
const {id}=require('./transport');
const VERSION='apollo.v3-audit-trace.v1',MAX_EVENTS=64,MAX_SESSIONS=4;
const word=v=>typeof v==='string'&&/^[a-z][-a-z]{0,79}$/.test(v);
const count=v=>Number.isSafeInteger(v)&&v>=0;
function event(value){
 if(!value||!word(value.event)||!count(value.sequence)||!Number.isFinite(value.elapsedMs)||value.elapsedMs<0)return null;
 const out={sequence:value.sequence,elapsedMs:value.elapsedMs,event:value.event};
 for(const key of ['stage','reason','outcome','resource','callsite'])if(word(value[key]))out[key]=value[key];
 if(typeof value.code==='string'&&/^AUDIT_[A-Z_]{1,80}$/.test(value.code))out.code=value.code;
 for(const key of ['nodeId','dataRequestId'])if(typeof value[key]==='string')out[key]=value[key].slice(0,200);
 for(const key of ['dataId','assetId'])if(typeof value[key]==='string'&&/^[a-f0-9]{64}$/.test(value[key]))out[key]=value[key];
 for(const key of ['serial','previousSerial','pending','checked','total','totalChanges','round','rootCount','revision','capturedRevision'])if(count(value[key]))out[key]=value[key];
 for(const key of ['pageChanged','fileChanged','revisionChanged','invalidated','mutationStarted'])if(typeof value[key]==='boolean')out[key]=value[key];
 if(Array.isArray(value.fields))out.fields=value.fields.slice(0,32).filter(v=>typeof v==='string').map(v=>v.slice(0,80));
 if(Array.isArray(value.changes))out.changes=value.changes.slice(0,8).map(v=>{
  const item={};if(typeof v?.id==='string')item.id=v.id.slice(0,200);
  if(['PROPERTY_CHANGE','CREATE','DELETE'].includes(v?.type))item.type=v.type;
  const fields=Array.isArray(v?.fields)?v.fields:v?.properties;
  if(Array.isArray(fields))item.fields=fields.slice(0,32).filter(x=>typeof x==='string').map(x=>x.slice(0,80));return item;
 });
 return out;
}
// Only this technical allowlist crosses the native/UI boundary or enters an export.
function readTrace(value){
 if(!value||value.schemaVersion!==VERSION||!id(value.requestId)||!id(value.runId)||!['components','texts'].includes(value.kind)||!['native','ui'].includes(value.side)||!Array.isArray(value.events))return null;
 const events=value.events.slice(-MAX_EVENTS).map(event).filter(Boolean);
 const out={schemaVersion:VERSION,requestId:value.requestId,runId:value.runId,kind:value.kind,side:value.side,
  dropped:(count(value.dropped)?value.dropped:0)+Math.max(0,value.events.length-MAX_EVENTS),firstFailure:event(value.firstFailure),events};
 if(typeof value.pluginVersion==='string'&&/^[a-zA-Z0-9._-]{1,80}$/.test(value.pluginVersion))out.pluginVersion=value.pluginVersion;
 return out;
}
function createRunTrace(context,now=()=>typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now()){
 const started=now(),events=[];let sequence=0,dropped=0,elapsedMs=0,firstFailure=null;
 return{
  add(name,details={},failed=false){
   elapsedMs=Math.max(elapsedMs,Math.round(Math.max(0,now()-started)*1000)/1000);
   const item=event(Object.assign({},details,{event:name,sequence:++sequence,elapsedMs}));if(!item)return;
   if(failed&&!firstFailure)firstFailure=item;
   if(events.length===MAX_EVENTS){events.shift();dropped++;}events.push(item);
  },
  snapshot(){return readTrace(Object.assign({},context,{schemaVersion:VERSION,dropped,firstFailure,events}));},
 };
}
module.exports={createRunTrace,readTrace,MAX_EVENTS,MAX_SESSIONS};
