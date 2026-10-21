const {readFailure}=require("../failure");
const {stableHash}=require('@apollo/predicate-engine');
const {validateScreenSpec}=require("../../../packages/generation-core/src/planning/schema");
const {createOpaqueId}=require("../../design-check/opaque-id");
const SHA=/^[a-f0-9]{64}$/;
function validatePromptResult(result,requestId,input,generationMethod=null){
 if(!result||Object.keys(result).sort().join(',')!==['schemaVersion','requestId','status','executionAllowed','inputHash','contextHash','contracts','spec','specHash','resultHash'].concat(generationMethod?['generationMethod']:[]).sort().join(',')
  ||generationMethod&&result.generationMethod!==generationMethod
  ||result.schemaVersion!=='apollo.v4-prompt-plan.v1-experimental'||result.requestId!==requestId||result.status!=='draft'||result.executionAllowed!==false
  ||result.inputHash!==stableHash(input)||!SHA.test(result.contextHash)||!Array.isArray(result.contracts)||!result.contracts.length||result.contracts.length>32
  ||result.contracts.some(c=>!c||typeof c.componentId!=='string'||!Number.isInteger(c.revision)||c.revision<1||!SHA.test(c.manualSourceHash)||!SHA.test(c.archiveSha256)||!['ready','draft','unverified'].includes(c.sourceStatus))
  ||validateScreenSpec(result.spec).length||result.spec.platform!==input.platform||stableHash(result.spec.viewport)!==stableHash(input.viewport)||result.specHash!==stableHash(result.spec))return false;
 const copy=Object.assign({},result);delete copy.resultHash;return result.resultHash===stableHash(copy);
}
function createPromptTransport(fetcher=fetch){
 let revision=0,sequence=0,active=null;const client=createOpaqueId().replace(/-/g,'').slice(0,16);
 function invalidate(){revision++;active?.abort();active=null;}
 async function plan(input,target,generationMethod=null){
  if(generationMethod!==null&&(!['mcp','built-in'].includes(generationMethod)||target!=='figma'))throw Error('PROMPT_METHOD_INVALID');
  if(target!==undefined&&!['frontend','figma'].includes(target))throw Error('PROMPT_TARGET_INVALID');
  invalidate();const current=revision,requestId='prompt-plan:'+client+':'+(++sequence),controller=new AbortController();active=controller;
  const frozen=JSON.parse(JSON.stringify(input)),timer=setTimeout(()=>controller.abort(),300000);
  try{
   const response=await fetcher('http://localhost:3001/generation/plan',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
    body:JSON.stringify(Object.assign({schemaVersion:'apollo.v4-prompt-plan-request.v1-experimental',requestId,input:frozen},target===undefined?{}:{target},generationMethod?{generationMethod}:{}))});
   let body;try{body=await response.json();}catch{throw Error(response.status===404?'PROMPT_ROUTE_UNAVAILABLE':'PROMPT_RESPONSE_INVALID');}
   if(current!==revision)throw Error('PROMPT_PLAN_CANCELLED');
   if(!response.ok||body?.success!==true){const error=Error(response.status===404?'PROMPT_ROUTE_UNAVAILABLE':/^[A-Z][A-Z0-9_]{1,79}$/.test(body?.code||'')?body.code:'PROMPT_PROXY_UNAVAILABLE');const diagnostic=body?.diagnostic;if(readFailure(JSON.stringify(diagnostic))&&diagnostic.requestId===requestId&&diagnostic.code===error.message)error.diagnostic=JSON.stringify(diagnostic);throw error;}
   if(byteLength(body)>1024*1024||!validatePromptResult(body.result,requestId,frozen,generationMethod))throw Error('PROMPT_RESPONSE_INVALID');
   return body.result;
  }catch(e){const error=Error(current!==revision?'PROMPT_PLAN_CANCELLED':e.name==='AbortError'?'PROMPT_PLAN_TIMEOUT':/^[A-Z][A-Z0-9_]{1,79}$/.test(e.message||'')?e.message:'PROMPT_PROXY_UNAVAILABLE');if(current===revision&&error.message===e.message&&e.diagnostic)error.diagnostic=e.diagnostic;throw error;}
  finally{clearTimeout(timer);if(current===revision)active=null;}
 }
 return {plan,invalidate};
}
function byteLength(value){return new TextEncoder().encode(JSON.stringify(value)).length;}
module.exports={createPromptTransport,validatePromptResult};
