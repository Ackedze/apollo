const {validateStaticBindingResult,STATIC_BINDING_REQUEST_VERSION,STATIC_BINDING_RESPONSE_VERSION}=require("../../../packages/generation-core/src/planning/static-review-binding-transport");
const {stableHash}=require('@apollo/predicate-engine');
// Fixed endpoint; imported documents never select paths, URLs or trusted pins.
function createStaticReviewTransport(buildHash,fetcher=fetch){
 let sequence=0,revision=0,active=null;
 function invalidate(){revision++;if(active)active.abort();active=null;}
 async function review(input){
  invalidate();const current=revision,requestId='static-review:'+(++sequence),controller=new AbortController();active=controller;
  const timer=setTimeout(()=>controller.abort(),30000);
  try{
   const body={schemaVersion:STATIC_BINDING_REQUEST_VERSION,requestId,input:JSON.parse(JSON.stringify(input)),buildHash};
   const response=await fetcher('http://localhost:3001/generation/static-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   let data;try{data=await response.json();}catch{throw Error(response.status===404?'STATIC_REVIEW_ROUTE_UNAVAILABLE':'STATIC_REVIEW_RESPONSE_INVALID');}
   if(current!==revision)throw Error('STATIC_REVIEW_STALE');
   if(!response.ok||data?.success!==true)throw Error(typeof data?.code==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(data.code)?data.code:response.status===404?'STATIC_REVIEW_ROUTE_UNAVAILABLE':'STATIC_REVIEW_PROXY_UNAVAILABLE');
   if(Object.keys(data).length!==3||data.schemaVersion!==STATIC_BINDING_RESPONSE_VERSION||!validateStaticBindingResult(data.result,{requestId,input:body.input,buildHash},stableHash))throw Error('STATIC_REVIEW_RESPONSE_INVALID');
   return data.result;
  }catch(e){throw Error(current!==revision?'STATIC_REVIEW_STALE':e.name==='AbortError'?'STATIC_REVIEW_TIMEOUT':/^[A-Z][A-Z0-9_]{1,79}$/.test(e.message||'')?e.message:'STATIC_REVIEW_PROXY_UNAVAILABLE');}
  finally{clearTimeout(timer);if(current===revision)active=null;}
 }
 return {review,invalidate};
}
module.exports={createStaticReviewTransport};
