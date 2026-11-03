const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/document-audit/reads.js'),'utf8');
function harness({hostDelay=400,timerDelay=20}={}){
 let now=0,timerWins=0,bridgeEvents=0;const module={exports:{}},timers=new Set();
 class Clock extends Date{static now(){return Math.floor(now);}}
 const schedule=(fn,ms)=>{let id;id=setTimeout(()=>{timers.delete(id);if(ms===0){now+=hostDelay;timerWins++;}fn();},ms===0?timerDelay:ms);timers.add(id);return id;};
 const clear=id=>{clearTimeout(id);timers.delete(id);};
 vm.runInNewContext(source,{module,Date:Clock,setTimeout:schedule,clearTimeout:clear});
 return{api:module.exports,work:ms=>{now+=ms;},timerWins:()=>timerWins,bridgeEvents:()=>bridgeEvents,
 bridge:ticket=>setImmediate(()=>{now++;bridgeEvents++;module.exports.completeHostYield(ticket);}),
 dispose:()=>{for(const id of timers)clearTimeout(id);timers.clear();},pendingTimers:()=>timers.size};
}
async function microtasks(){for(let i=0;i<8;i++)await Promise.resolve();}
function guarded(h,visit){return async()=>{try{await visit();}finally{h.dispose();}};}

test('wrong, duplicate and stale tickets cannot complete another coalesced host turn',async()=>{
 const h=harness();try{const sent=[],read=[];h.api.setHostYieldTransport(t=>sent.push(t));h.work(8);
  const first=h.api.cooperativeRead(()=>{read.push(1);return 1;},1000);await microtasks();assert.equal(sent.length,1);assert.equal(read.length,0);
  assert.equal(h.api.completeHostYield('foreign-session:1'),false);assert.equal(h.api.completeHostYield(null),false);assert.equal(read.length,0);
  assert.equal(h.api.completeHostYield(sent[0]),true);assert.equal(await first,1);assert.equal(h.api.completeHostYield(sent[0]),false);
  h.work(8);const second=h.api.cooperativeRead(()=>{read.push(2);return 2;},1000);await microtasks();assert.equal(sent.length,2);assert.notEqual(sent[0],sent[1]);
  assert.equal(h.api.completeHostYield(sent[0]),false);assert.equal(read.length,1);assert.equal(h.api.completeHostYield(sent[1]),true);assert.equal(await second,2);
  assert.equal(h.api.readScheduling().hostYieldCount,2);assert.deepEqual(read,[1,2]);assert.equal(h.timerWins(),0);
 }finally{h.dispose();}
});

test('session tickets cannot cross independent reader instances',async()=>{
 const a=harness(),b=harness();try{const x=[],y=[];a.api.setHostYieldTransport(t=>x.push(t));b.api.setHostYieldTransport(t=>y.push(t));a.work(8);b.work(8);
  const pa=a.api.cooperativeRead(()=>1,1000),pb=b.api.cooperativeRead(()=>2,1000);await microtasks();
  assert.notEqual(x[0],y[0]);assert.equal(a.api.completeHostYield(y[0]),false);assert.equal(b.api.completeHostYield(x[0]),false);
  assert.equal(a.api.completeHostYield(x[0]),true);assert.equal(b.api.completeHostYield(y[0]),true);assert.deepEqual(await Promise.all([pa,pb]),[1,2]);
 }finally{a.dispose();b.dispose();}
});

test('parallel workers share one pending host event and preserve every result and bound',async()=>{
 const h=harness();try{const sent=[],values=[],counts=new Map();let active=0,max=0;h.api.setHostYieldTransport(t=>sent.push(t));h.work(8);
  const work=h.api.parallel(Array.from({length:257},(_,i)=>i),4,async i=>{active++;max=Math.max(max,active);try{values[i]=await h.api.cooperativeRead(()=>i*2,1000);counts.set(i,(counts.get(i)||0)+1);}finally{active--;}});
  await microtasks();assert.equal(sent.length,1);assert.equal(active,0);assert.equal(h.api.completeHostYield(sent[0]),true);await work;
  assert.deepEqual(values,Array.from({length:257},(_,i)=>i*2));assert.equal(counts.size,257);assert([...counts.values()].every(n=>n===1));assert(max<=4);assert.equal(active,0);assert.equal(h.timerWins(),0);assert.equal(h.api.readScheduling().hostYieldCount,1);
 }finally{h.dispose();}
});

test('missing UI retains the previous slow-timer fallback and ignores a late reply',async()=>{
 const h=harness();try{const sent=[];h.api.setHostYieldTransport(t=>sent.push(t));h.work(8);
  assert.equal(await h.api.cooperativeRead(()=>42,1000),42);assert.equal(h.timerWins(),1);assert.equal(h.api.readScheduling().hostYieldWaitMs,400);assert.equal(h.api.completeHostYield(sent[0]),false);
  h.work(8);const next=h.api.cooperativeRead(()=>43,1000);await microtasks();assert.equal(h.api.completeHostYield(sent[0]),false);assert.equal(h.api.completeHostYield(sent[1]),true);assert.equal(await next,43);
 }finally{h.dispose();}
});

test('a throwing post callback falls back without rejecting or repeating the native read',async()=>{
 const h=harness();try{let calls=0,posted=0;h.api.setHostYieldTransport(()=>{posted++;throw Error('UI_UNAVAILABLE');});h.work(8);
  assert.equal(await h.api.cooperativeRead(()=>{calls++;return 'fact';},1000),'fact');assert.equal(calls,1);assert.equal(posted,1);assert.equal(h.timerWins(),1);assert.equal(h.api.readScheduling().hostYieldCount,1);
 }finally{h.dispose();}
});

test('no registered UI preserves timer behavior and the elapsed 8ms slice',async()=>{
 const h=harness();try{const values=[];for(let i=0;i<4096;i++)values.push(await h.api.cooperativeRead(()=>{h.work(.02);return i;},1000));
  assert.deepEqual(values,Array.from({length:4096},(_,i)=>i));assert(h.timerWins()>=9&&h.timerWins()<=12);const m=h.api.readScheduling();assert.equal(m.readCount,4096);assert.equal(m.hostYieldCount,h.timerWins());assert.equal(m.hostYieldWaitMs,h.timerWins()*400);assert(m.readWaitMs>=0&&m.readWaitMs<100);
 }finally{h.dispose();}
});

test('cheap cached facts do not request a host event before the slice is used',async()=>{
 const h=harness();try{let sent=0;h.api.setHostYieldTransport(()=>sent++);for(let i=0;i<512;i++)assert.equal(await h.api.cooperativeRead(()=>{h.work(.001);return i;},1000),i);
  assert.equal(sent,0);assert.equal(h.timerWins(),0);assert.equal(h.api.readScheduling().hostYieldCount,0);
 }finally{h.dispose();}
});

for(const mode of ['cached native reads','cached parallel work'])test('Stop reaches '+mode+' via actual bridge events despite slow fallback timers',async()=>{
 const h=harness();let stopped=false,completed=0,stop;try{h.api.setHostYieldTransport(h.bridge);const guard=()=>{if(stopped)throw Error('AUDIT_CANCELLED');};stop=setImmediate(()=>{stopped=true;});
  const work=mode==='cached native reads'?(async()=>{for(let i=0;i<512;i++){await h.api.cooperativeRead(()=>{h.work(1);return Promise.resolve(i);},1000,guard);completed++;}})():h.api.parallel(Array.from({length:512}),16,async()=>{guard();h.work(1);await Promise.resolve();guard();completed++;});
  await assert.rejects(work,/AUDIT_CANCELLED/);assert(completed<512);assert(h.bridgeEvents()>0);assert.equal(h.timerWins(),0);
 }finally{clearImmediate(stop);h.dispose();}
});

test('a cancelled coalesced read never invokes its native callback after a late bridge event',async()=>{
 const h=harness();try{const sent=[];let stopped=false,calls=0;h.api.setHostYieldTransport(t=>sent.push(t));h.work(8);
  const work=h.api.cooperativeRead(()=>{calls++;return 'late';},5,()=>{if(stopped)throw Error('AUDIT_CANCELLED');});await microtasks();stopped=true;
  await assert.rejects(work,/AUDIT_CANCELLED/);assert.equal(calls,0);assert.equal(h.api.completeHostYield(sent[0]),true);await microtasks();assert.equal(calls,0);assert.equal(h.api.readScheduling().readCount,0);
 }finally{h.dispose();}
});

test('Stop on a pending native RPC preserves late-value and finished-read metrics isolation',async()=>{
 const h=harness();try{h.api.setHostYieldTransport(h.bridge);let stopped=false,resolveNative,delivered=false;const native=new Promise(r=>{resolveNative=r;});
  const work=h.api.cooperativeRead(()=>native,5,()=>{if(stopped)throw Error('AUDIT_CANCELLED');}).then(()=>{delivered=true;});await microtasks();h.work(3);stopped=true;
  await assert.rejects(work,/AUDIT_CANCELLED/);const finished=h.api.readScheduling();h.work(100);resolveNative('late');await microtasks();assert.equal(delivered,false);assert.deepEqual(h.api.readScheduling(),finished);assert.equal(finished.readCount,1);assert.equal(finished.readWaitMs,3);
 }finally{h.dispose();}
});

test('disposing or replacing a transport rejects its old tickets and retains fallback progress',async()=>{
 const h=harness();try{const sent=[],first=t=>sent.push(t),release=h.api.setHostYieldTransport(first);h.work(8);
  const pending=h.api.cooperativeRead(()=>1,1000);await microtasks();release();assert.equal(h.api.completeHostYield(sent[0]),false);assert.equal(await pending,1);assert.equal(h.timerWins(),1);
  h.api.setHostYieldTransport(first);const newRelease=h.api.setHostYieldTransport(first);release();h.work(8);const second=h.api.cooperativeRead(()=>2,1000);await microtasks();assert.equal(h.api.completeHostYield(sent[1]),true);assert.equal(await second,2);newRelease();
  assert.throws(()=>h.api.setHostYieldTransport({}),/HOST_YIELD_TRANSPORT_INVALID/);h.api.setHostYieldTransport(null);
 }finally{h.dispose();}
});
