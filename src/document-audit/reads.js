// Figma reads cannot be physically aborted. Only bounded, guarded results escape
// a run; late resolutions do not write facts, emit progress or start more work.
async function boundedRead(read,timeoutMs,guard=()=>{}){
 guard();if(timeoutMs<=0)throw Error('NATIVE_READ_TIMEOUT');let timer;
 try{const value=await Promise.race([Promise.resolve().then(read),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('NATIVE_READ_TIMEOUT')),timeoutMs);})]);guard();return value;}finally{clearTimeout(timer);}
}
async function parallel(items,concurrency,visit){
 let next=0,failed=null;
 await Promise.all(Array.from({length:Math.min(items.length,concurrency)},async()=>{while(next<items.length&&!failed){const index=next++;try{await visit(items[index],index);}catch(e){failed=e;}}}));
 if(failed)throw failed;
}
module.exports={boundedRead,parallel};
