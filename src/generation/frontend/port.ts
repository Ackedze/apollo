import type {CompositionPlan,Hash,ScreenSpec,TargetReceipt,GenerationContext} from "../../../packages/generation-core/src/planning";
import type {FrontendHost} from "../../../packages/adapter-frontend/src";
/** Main never compiles/renders HTML. The fixed external host owns the workspace. */
export function createGenerationFrontendPort(post:(message:unknown)=>void,hash:Hash,readContext:(spec:ScreenSpec)=>Promise<GenerationContext>,timeoutMs=70000){
 const nonce=Array.from({length:16},()=>Math.floor(Math.random()*16).toString(16)).join('');let sequence=0;
 const pending=new Map<string,{plan:CompositionPlan;resolve:(r:TargetReceipt)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 const transactions=new Map<string,string>();
 function cancel(id:string,planHash:string){post({type:'generation-frontend-cancel',requestId:id,planHash});}
 function invalidate(){for(const [id,item] of pending){clearTimeout(item.timer);item.reject(new Error('GENERATION_SESSION_STALE'));}pending.clear();for(const [id,planHash] of transactions)cancel(id,planHash);transactions.clear();}
 function accept(message:any){if(message?.type!=='generation-frontend-response')return false;const item=pending.get(message.requestId);if(!item)return true;pending.delete(message.requestId);clearTimeout(item.timer);
  if(message.error){cancel(message.requestId,hash(item.plan));transactions.delete(message.requestId);item.reject(new Error(typeof message.code==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(message.code)?message.code:'FRONTEND_PROXY_UNAVAILABLE'));}
  else {const d=message.data;if(!d||d.success!==true||d.schemaVersion!=='apollo.v4-frontend-execution.v1-experimental'||d.requestId!==message.requestId||d.planHash!==hash(item.plan)||!d.receipt||d.receiptHash!==hash(d.receipt)){cancel(message.requestId,hash(item.plan));transactions.delete(message.requestId);item.reject(new Error('FRONTEND_PROXY_RESPONSE_INVALID'));}else item.resolve(d.receipt);}return true;
 }
 const host:FrontendHost={readContext,create:async()=>{throw new Error('FRONTEND_EXTERNAL_HOST_ONLY');},verify:async()=>{throw new Error('FRONTEND_EXTERNAL_HOST_ONLY');},rollback:async()=>{invalidate();},
  executeRemote(plan){const id='generation-frontend:'+nonce+':'+(++sequence);transactions.set(id,hash(plan));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);cancel(id,hash(plan));transactions.delete(id);reject(new Error('FRONTEND_PROXY_TIMEOUT'));},timeoutMs);pending.set(id,{plan,resolve,reject,timer});try{post({type:'generation-frontend-request',requestId:id,spec:plan.spec,planHash:hash(plan),pins:plan.pins});}catch(error){clearTimeout(timer);pending.delete(id);transactions.delete(id);reject(error as Error);}});}
 };
 return {host,accept,invalidate};
}
