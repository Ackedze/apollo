const p=require("./protocol");
function createAgentTransport({fetcher=fetch,onSnapshot=()=>{},nativeRead=async()=>{throw Error('AGENT_NATIVE_UNAVAILABLE');},nativeInvalidate=()=>{}}={}){
 let epoch=0,active=null,controller=null;
 async function request(route,body,signal){
  const response=await fetcher('http://localhost:3001/agent/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});let data;
  try{data=await response.json();}catch{throw Error(response.status===404?'AGENT_ROUTE_UNAVAILABLE':'AGENT_RESPONSE_INVALID');}
  if(!response.ok||data?.success!==true)throw Error(response.status===404?'AGENT_ROUTE_UNAVAILABLE':typeof data?.code==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(data.code)?data.code:'AGENT_PROXY_UNAVAILABLE');
  if(!p.bounded(data,2097152))throw Error('AGENT_RESPONSE_INVALID');return data;
 }
 async function cancel(){const previous=active;epoch++;active=null;controller?.abort();controller=null;nativeInvalidate();if(previous)try{const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5000);try{await request('runs/cancel',previous,abort.signal);}finally{clearTimeout(timer);}}catch{}return previous;}
 async function admit({input,version,target,parentIdentity=null}){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);
  try{const admitted=await request('drafts',{schemaVersion:'apollo.agent-draft-request.v1',input,version,target,parentIdentity},abort.signal);
   if(!p.closed(admitted,['success','identity','version'])||!p.validIdentity(admitted.identity)||!p.validScreenVersion(admitted.version)||admitted.version.versionHash!==version.versionHash||admitted.identity.specHash!==version.specHash||admitted.identity.revision!==version.revision||admitted.identity.target!==target)throw Error('AGENT_RESPONSE_INVALID');
   return admitted;
  }finally{clearTimeout(timer);}
 }
 async function execute({input,version,target,parentIdentity=null}){
  await cancel();const current=epoch,abort=new AbortController();controller=abort;const deadline=Date.now()+15*60*1000,timer=setTimeout(()=>abort.abort(),15*60*1000);
  const guard=()=>{if(current!==epoch||abort.signal.aborted)throw Error('AGENT_RUN_CANCELLED');};
  let sequence=-1,lastHash=null;
  const accept=data=>{guard();if(!p.closed(data,['success','run'])||!p.validPublicSnapshot(data.run,active,sequence)||data.run.sequence===sequence&&data.run.snapshotHash!==lastHash)throw Error('AGENT_RESPONSE_INVALID');sequence=data.run.sequence;lastHash=data.run.snapshotHash;onSnapshot(p.clone(data.run));return data.run;};
  try{
   const admitted=await request('drafts',{schemaVersion:'apollo.agent-draft-request.v1',input,version,target,parentIdentity},abort.signal);guard();
   if(!p.closed(admitted,['success','identity','version'])||!p.validIdentity(admitted.identity)||!p.validScreenVersion(admitted.version)||admitted.version.versionHash!==version.versionHash||admitted.identity.specHash!==version.specHash||admitted.identity.revision!==version.revision||admitted.identity.target!==target)throw Error('AGENT_RESPONSE_INVALID');
   active=p.clone(admitted.identity);let run=accept(await request('runs',active,abort.signal));const consumed=new Set();
   while(!p.TERMINAL.includes(run.status)&&run.status!=='question'){
    guard();if(Date.now()>deadline)throw Error('AGENT_RUN_TIMEOUT');
    if(run.pendingOperation){const op=run.pendingOperation,key=op.callId+':'+op.sequence+':'+op.nonce;if(consumed.has(key))throw Error('AGENT_OPERATION_REPLAY');consumed.add(key);const observation=await nativeRead(p.clone(active),p.clone(op));guard();run=accept(await request('runs/observation',observation,abort.signal));}
    else {await new Promise(resolve=>setTimeout(resolve,1000));guard();run=accept(await request('runs/poll',Object.assign({},active,{afterSequence:sequence}),abort.signal));}
   }
   return{identity:p.clone(active),run};
  }catch(e){if(current===epoch){const identity=active;active=null;nativeInvalidate();if(identity)void request('runs/cancel',identity).catch(()=>{});}throw Error(current!==epoch||e.name==='AbortError'?'AGENT_RUN_CANCELLED':e.message||'AGENT_PROXY_UNAVAILABLE');}
  finally{clearTimeout(timer);if(current===epoch)controller=null;}
 }
 return{execute,admit,cancel,identity:()=>active&&p.clone(active)};
}
function createAgentNativeClient(send){let pending=new Map();return{read(identity,operation){const key=identity.runId+':'+operation.callId+':'+operation.nonce;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(key);reject(Error('AGENT_NATIVE_TIMEOUT'));},15000);pending.set(key,{identity,operation,timer,resolve,reject});send(Object.assign({type:'agent-native-read',identity},operation));});},accept(message){if(message?.type!=='agent-native-result')return false;const key=message.identity?.runId+':'+message.callId+':'+message.nonce,ticket=pending.get(key);if(!ticket)return true;pending.delete(key);clearTimeout(ticket.timer);if(!p.closed(message,['type','identity','callId','sequence','nonce','observation'])||!p.sameIdentity(ticket.identity,message.identity)||message.sequence!==ticket.operation.sequence||!p.validObservation(message.observation,ticket.identity,ticket.operation))ticket.reject(Error('AGENT_NATIVE_RESPONSE_INVALID'));else ticket.resolve(message.observation);return true;},invalidate(){for(const ticket of pending.values()){clearTimeout(ticket.timer);ticket.reject(Error('AGENT_RUN_CANCELLED'));}pending.clear();send({type:'agent-native-cancel'});}};}
module.exports={createAgentTransport,createAgentNativeClient};
