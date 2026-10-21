// Only fixed loopback routes. No prompt-controlled URL, code or output path.
function createFrontendTransport(send,fetcher=fetch){
 const active=new Map(),request=/^generation-frontend:[a-f0-9]{16}:[1-9][0-9]{0,15}$/;
 async function cancel(data){if(!request.test(data.requestId)||!/^[a-f0-9]{64}$/.test(data.planHash))return;const controller=active.get(data.requestId);if(controller)controller.abort();active.delete(data.requestId);try{await fetcher('http://localhost:3001/generation/frontend/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:data.requestId,planHash:data.planHash}),signal:AbortSignal.timeout(5000)});}catch{}}
 async function execute(data){if(!request.test(data.requestId)||!/^[a-f0-9]{64}$/.test(data.planHash))return;const controller=new AbortController();active.set(data.requestId,controller);const timer=setTimeout(()=>controller.abort(),67000);
  try{const response=await fetcher('http://localhost:3001/generation/frontend/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:data.requestId,spec:data.spec,planHash:data.planHash,pins:data.pins}),signal:controller.signal});let body;try{body=await response.json();}catch{throw Object.assign(new Error(),{code:response.status===404?'FRONTEND_PROXY_ROUTE_UNAVAILABLE':'FRONTEND_PROXY_RESPONSE_INVALID'});}if(!response.ok||body.success!==true)throw Object.assign(new Error(),{code:/^[A-Z][A-Z0-9_]{1,79}$/.test(body.code)?body.code:'FRONTEND_PROXY_UNAVAILABLE'});send({type:'generation-frontend-response',requestId:data.requestId,data:body});}
  catch(e){await cancel(data);send({type:'generation-frontend-response',requestId:data.requestId,error:true,code:e.name==='AbortError'?'FRONTEND_PROXY_TIMEOUT':e.code||'FRONTEND_PROXY_UNAVAILABLE'});}finally{clearTimeout(timer);active.delete(data.requestId);}
 }
 return {execute,cancel};
}
module.exports={createFrontendTransport};
