// Cached RPCs may resolve entirely in microtasks, starving host Stop messages.
let sliceStarted=Date.now(),hostTurn=null;
const scheduling={readCount:0,readWaitMs:0,hostYieldCount:0,hostYieldWaitMs:0};
function yieldToHost(){
 if(hostTurn)return hostTurn;
 if(Date.now()-sliceStarted<8)return null;
 const started=Date.now();scheduling.hostYieldCount++;
 hostTurn=new Promise(resolve=>setTimeout(()=>{sliceStarted=Date.now();scheduling.hostYieldWaitMs+=Math.max(0,sliceStarted-started);hostTurn=null;resolve();},0));
 return hostTurn;
}
function readScheduling(since={}){
 return{readCount:scheduling.readCount-(since.readCount||0),readWaitMs:scheduling.readWaitMs-(since.readWaitMs||0),hostYieldCount:scheduling.hostYieldCount-(since.hostYieldCount||0),hostYieldWaitMs:scheduling.hostYieldWaitMs-(since.hostYieldWaitMs||0)};
}
// Figma reads cannot be physically aborted. Only bounded, guarded results escape
// a run; late resolutions do not write facts, emit progress or start more work.
async function boundedRead(read,timeoutMs,guard=()=>{}){
 guard();if(timeoutMs<=0)throw Error('NATIVE_READ_TIMEOUT');let timer;
 try{const value=await Promise.race([Promise.resolve().then(read),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('NATIVE_READ_TIMEOUT')),timeoutMs);})]);guard();return value;}finally{clearTimeout(timer);}
}
async function parallel(items,concurrency,visit){
 let next=0,failed=null;
 await Promise.all(Array.from({length:Math.min(items.length,concurrency)},async()=>{while(next<items.length&&!failed){const turn=yieldToHost();if(turn)await turn;if(failed||next>=items.length)break;const index=next++;try{await visit(items[index],index);}catch(e){failed=e;}}}));
 if(failed)throw failed;
}
// Wait on the SAME native RPC. A slow read is not a reason to issue a second
// unabortable Figma call; cancellation is checked even while it is pending.
function cooperativeRead(read,intervalMs,guard=()=>{},onWait=()=>{}){
 guard();return new Promise((resolve,reject)=>{
  let settled=false,last=Date.now(),timer,readStarted;
  const finish=(error,value,failed=false)=>{if(settled)return;settled=true;if(readStarted!==undefined)scheduling.readWaitMs+=Math.max(0,Date.now()-readStarted);clearTimeout(timer);if(failed)reject(error&&typeof error.message==='string'?error:Error(typeof error==='string'?error:'NATIVE_READ_FAILED'));else try{guard();resolve(value);}catch(e){reject(e);}};
  const poll=()=>{if(settled)return;try{guard();if(Date.now()-last>=intervalMs){last=Date.now();onWait();}timer=setTimeout(poll,Math.max(5,Math.min(100,intervalMs)));}catch(e){finish(e,undefined,true);}};timer=setTimeout(poll,Math.max(5,Math.min(100,intervalMs)));
  Promise.resolve().then(async()=>{const turn=yieldToHost();if(turn)await turn;if(settled)return;guard();readStarted=Date.now();scheduling.readCount++;return read();}).then(value=>finish(null,value),error=>finish(error,undefined,true));
 });
}
const retryableRead=error=>/TIMEOUT|TEMPORAR|UNAVAILABLE|SUPERSEDED|CANCELLED|CONTEXT_CHANGED/.test(String(error?.code||error?.message||''));
function readError(error,context){
 if(error&&typeof error==='object'&&typeof error.message==='string'){
  try{if(!error.nativeRead&&context)error.nativeRead=context;if(error.nativeRead||!context)return error;}catch(_){}
 }
 const failure=Error(typeof error?.message==='string'?error.message:typeof error==='string'?error:'NATIVE_READ_FAILED');
 failure.name=typeof error?.name==='string'?error.name:'Error';
 if(error?.code!==undefined)failure.code=error.code;
 if(error?.nativeFailure)failure.nativeFailure=error.nativeFailure;
 failure.nativeRead=error?.nativeRead||context;
 return failure;
}
module.exports={boundedRead,cooperativeRead,parallel,retryableRead,readError,readScheduling};
