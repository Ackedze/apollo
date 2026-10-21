const p=require("../protocol");
const {createOpaqueId}=require("../../../design-check/opaque-id");
const {readFailure}=require("../../failure");
function createMcpScopeClient(send){
 const tickets=new Map();let sequence=0;
 function request(identity,operation,payload={}){const requestId='mcp:'+createOpaqueId()+':'+(++sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{tickets.delete(requestId);reject(Error('AGENT_MCP_SCOPE_TIMEOUT'));},15000);tickets.set(requestId,{identity,resolve,reject,timer});send({type:'agent-mcp-scope',requestId,identity,operation,payload});});}
 return{open:(identity,version,componentIds)=>request(identity,'open',{version,componentIds}),read:identity=>request(identity,'capture'),retain:identity=>request(identity,'capture'),stop:identity=>request(identity,'stop'),focus:identity=>request(identity,'focus'),
  accept(message){if(message?.type!=='agent-mcp-scope-result')return false;const t=tickets.get(message.requestId);if(!t)return true;tickets.delete(message.requestId);clearTimeout(t.timer);if(!p.closed(message,['type','requestId','identity','value','error'])||!p.sameIdentity(message.identity,t.identity))t.reject(Error('AGENT_MCP_SCOPE_REPLY_INVALID'));else if(message.error){const diagnostic=readFailure(message.error),error=Error(diagnostic?.code||message.error);if(diagnostic){error.code=diagnostic.code;error.diagnostic=message.error;}t.reject(error);}else t.resolve(message.value);return true;}};
}
function validMcpSnapshot(run,identity,sequence=-1){
 return run?.schemaVersion==='apollo.mcp-run-snapshot.v1'&&run.generationMethod==='mcp'&&run.guaranteeProfile==='experimental-mcp-owned-root-post-readback'&&p.sameIdentity(run.identity,identity)&&Number.isSafeInteger(run.sequence)&&run.sequence>=sequence&&['queued','running','awaiting-operation','completed','failed','blocked','cancelled'].includes(run.status)&&Array.isArray(run.progress)&&run.progress.length<=256&&Array.isArray(run.gaps)&&run.gaps.length<=128&&(!run.result||run.result.Ready===false&&Array.isArray(run.result.checks)&&run.result.checks.every(p.validCheck))&&run.snapshotHash===p.hashWithout(run,'snapshotHash')&&p.bounded(run,2097152);
}
function createAgentMcpTransport({scope,fetcher=fetch,onSnapshot=()=>{},onPreservation=()=>{}}){
 let active=null,epoch=0;
 async function request(route,body,signal){const abort=new AbortController(),limit=route==='drafts'?30000:route.startsWith('runs/')&&route!=='runs/poll'?5000:15000,timer=setTimeout(()=>abort.abort(),limit),cancel=()=>abort.abort();if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});try{const r=await fetcher('http://localhost:3001/agent/mcp/'+route,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:abort.signal});let value;try{value=await r.json();}catch{throw Error('AGENT_MCP_UNAVAILABLE');}if(!r.ok||value?.success!==true)throw Error(/^AGENT_[A-Z_]+$/.test(value?.code||'')?value.code:'AGENT_MCP_UNAVAILABLE');if(!p.bounded(value,2097152))throw Error('AGENT_MCP_REPLY_INVALID');return value;}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}}
 async function status(){return request('status');}
 async function admit({input,version,parentIdentity=null,plannerRequestId=null}){const available=await status();if(!available.configured)throw Error('AGENT_MCP_UNAVAILABLE');const v=await request('drafts',{schemaVersion:'apollo.agent-draft-request.v1',input,version,target:'figma-owned',parentIdentity,generationMethod:'mcp',plannerRequestId});if(!p.validIdentity(v.identity)||v.identity.specHash!==version.specHash||v.identity.revision!==version.revision||v.generationMethod!=='mcp'||!p.validScreenVersion(v.version)||v.version.versionHash!==version.versionHash||!v.componentIds)throw Error('AGENT_MCP_ADMISSION_INVALID');return v;}
 async function preserve(run,acceptReply=null){
  try{const value=await scope.read(run.identity),reply=await request('runs/preservation',{identity:run.identity,scopeNonce:run.scope.ownerNonce,readback:value}),snapshot=acceptReply?acceptReply(reply):null;onPreservation({identity:run.identity,status:'observed',readback:value});return snapshot;}
  catch(error){onPreservation({identity:run.identity,status:'unknown',code:error.message});}
  finally{await scope.stop(run.identity).catch(()=>{});}
 }
 async function cancel(){epoch++;const prior=active;active=null;if(!prior)return;prior.controller.abort();await request('runs/cancel',prior.identity).catch(()=>{});await preserve(prior);}
 async function execute(args){
  await cancel();const mine=epoch,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),900000);let opened=null,identity=null,completed=false,seq=-1,lastHash=null;
  const guard=()=>{if(epoch!==mine||controller.signal.aborted)throw Error('AGENT_CANCELLED');};
  function accept(reply){guard();const run=reply.run;if(!validMcpSnapshot(run,identity,seq)||run.sequence===seq&&lastHash&&run.snapshotHash!==lastHash)throw Error('AGENT_MCP_REPLY_INVALID');seq=run.sequence;lastHash=run.snapshotHash;onSnapshot(run);return run;}
  try{
   const admitted=await admit(args);guard();identity=admitted.identity;opened=await scope.open(identity,admitted.version,admitted.componentIds);guard();active={identity,scope:opened,controller};
   let run=accept(await request('runs',{identity,scope:opened},controller.signal));const consumed=new Set();
   while(!p.TERMINAL.includes(run.status)){
    guard();if(run.pendingOperation){const op=run.pendingOperation;if(!['read','retain'].includes(op.kind)||typeof op.nonce!=='string'||consumed.has(op.nonce)||p.hashWithout(op.scope,'unused')!==p.hashWithout(opened,'unused'))throw Error('AGENT_MCP_READBACK_REPLAY');consumed.add(op.nonce);const readback=op.kind==='retain'?await scope.retain(identity):await scope.read(identity);guard();run=accept(await request('runs/observation',{identity,nonce:op.nonce,readback},controller.signal));}
    else{await new Promise(resolve=>setTimeout(resolve,500));guard();run=accept(await request('runs/poll',Object.assign({},identity,{afterSequence:seq}),controller.signal));}
   }
   completed=run.status==='completed';if(!completed)run=await preserve({identity,scope:opened,controller},accept)||run;return{identity,run};
  }catch(error){if(opened&&identity&&epoch===mine){let terminal=null;try{const reply=await request('runs/cancel',{identity,reason:/^AGENT_[A-Z_]+$/.test(error.message)?error.message:'AGENT_CANCELLED'});if(reply.run&&!controller.signal.aborted)terminal=accept(reply);}catch{}const publish=controller.signal.aborted?null:accept;terminal=await preserve({identity,scope:opened,controller},publish)||terminal;if(!error.diagnostic&&terminal?.firstFailure?.diagnostic)error.diagnostic=JSON.stringify(terminal.firstFailure.diagnostic);}throw error;}
  finally{clearTimeout(timeout);if(epoch===mine)active=null;}
 }
 return{status,admit,execute,cancel};
}
module.exports={createMcpScopeClient,createAgentMcpTransport,validMcpSnapshot};
