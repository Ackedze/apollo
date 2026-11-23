const test=require('node:test'),assert=require('node:assert/strict');
const {cooperativeRead,parallel}=require('../src/document-audit/reads');
function clockedReads(hostDelay=0){
 const vm=require('node:vm'),fs=require('node:fs'),module={exports:{}};let now=0,yields=0;
 class Clock extends Date{static now(){return Math.floor(now);}}
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/document-audit/reads'),'utf8'),{module,Date:Clock,setTimeout:(fn,ms)=>setTimeout(()=>{if(ms===0){now+=hostDelay;yields++;}fn();},ms),clearTimeout});
 return{api:module.exports,work:ms=>{now+=ms;},yields:()=>yields};
}

for(const mode of ['cached native reads','cached parallel work'])test('Stop is delivered during '+mode,async()=>{
 const clock=clockedReads(),{cooperativeRead,parallel}=clock.api;let stopped=false,completed=0;
 const timer=setTimeout(()=>{stopped=true;},0),guard=()=>{if(stopped)throw Error('AUDIT_CANCELLED');};
 try{
  const work=mode==='cached native reads'?(async()=>{for(let i=0;i<512;i++){await cooperativeRead(()=>{clock.work(1);return Promise.resolve(i);},50,guard);completed++;}})():parallel(Array.from({length:512}),16,async()=>{guard();clock.work(1);await Promise.resolve();guard();completed++;});
  await assert.rejects(work,/AUDIT_CANCELLED/);
  assert(completed<512,'the host must receive Stop before all cached work completes');
 }finally{clearTimeout(timer);}
});

test('cheap cached facts do not force host waits before the time slice is used',async()=>{
 const clock=clockedReads(100),values=[];
 for(let i=0;i<512;i++)values.push(await clock.api.cooperativeRead(()=>{clock.work(.001);return i;},1000));
 assert.deepEqual(values,Array.from({length:512},(_,i)=>i));
 assert.equal(clock.yields(),0,'sub-millisecond work needs no forced host turn');
});

test('slow host timers are coalesced by elapsed work without losing facts or counting their wait as work',async()=>{
 const clock=clockedReads(100),values=[];
 for(let i=0;i<4096;i++)values.push(await clock.api.cooperativeRead(()=>{clock.work(.02);return i;},1000));
 assert.deepEqual(values,Array.from({length:4096},(_,i)=>i));
 assert(clock.yields()>=9&&clock.yields()<=12,'yield only after an 8ms work slice, including after a slow timer');
 const metrics=clock.api.readScheduling();assert.equal(metrics.readCount,4096);
 assert.equal(metrics.hostYieldCount,clock.yields());assert.equal(metrics.hostYieldWaitMs,clock.yields()*100);
 assert(metrics.readWaitMs>=0&&metrics.readWaitMs<100,'host yield wait is separate from native read wait');
});

test('Stop while a native RPC is pending keeps its late value and timing outside the finished run',async()=>{
 const clock=clockedReads();let stopped=false,resolveNative,delivered=false;
 const native=new Promise(resolve=>{resolveNative=resolve;});
 const work=clock.api.cooperativeRead(()=>native,5,()=>{if(stopped)throw Error('AUDIT_CANCELLED');}).then(()=>{delivered=true;});
 await new Promise(resolve=>setTimeout(resolve,0));clock.work(3);stopped=true;
 await assert.rejects(work,/AUDIT_CANCELLED/);
 const finished=clock.api.readScheduling();clock.work(100);resolveNative('late');await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(delivered,false);assert.deepEqual(clock.api.readScheduling(),finished);assert.equal(finished.readCount,1);assert.equal(finished.readWaitMs,3);
});

test('host yielding preserves every successful result and the parallel concurrency bound',async()=>{
 const values=[],counts=new Map();let active=0,maximum=0;
 await parallel(Array.from({length:257},(_,i)=>i),4,async i=>{
  active++;maximum=Math.max(maximum,active);
  try{values[i]=await cooperativeRead(()=>Promise.resolve(i*2),50);counts.set(i,(counts.get(i)||0)+1);}finally{active--;}
 });
 assert.deepEqual(values,Array.from({length:257},(_,i)=>i*2));
 assert.equal(counts.size,257);assert([...counts.values()].every(n=>n===1));assert(maximum<=4);assert.equal(active,0);
});

test('phase and Stop traces expose metadata without document contents',()=>{
 const rows=[],{createAuditTrace}=require('../src/document-audit/trace');const trace=createAuditTrace(row=>rows.push(row));
 for(const event of ['phase-start','phase-end','audit-stop'])trace(event,{runId:'fixture',stage:'published-imports',count:3,documentText:'PRIVATE'});
 assert.deepEqual(rows.map(row=>row.event),['phase-start','phase-end','audit-stop']);assert(!JSON.stringify(rows).includes('PRIVATE'));
});

test('a missing published component keeps freshness unknown and still checks obsolete styles',async()=>{
 const {fixture,hash}=require('./document-audit.test'),{collect}=require('../src/document-audit/engine'),{validateIndex}=require('../src/document-audit/deprecated-styles');
 const crypto=require('node:crypto'),stable=v=>v&&typeof v==='object'?Array.isArray(v)?v.map(stable):Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 const digest=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
 const f=fixture(),main=f.component('remote',true,'missing-key'),node=f.instance('selected',main),key='a'.repeat(40);
 node.fills=[{type:'SOLID',color:{r:1,g:0,b:0}}];node.fillStyleId='style-id';f.page.selection=[node];
 f.api.getStyleByIdAsync=async id=>({id,key,type:'PAINT',name:'Synthetic obsolete style'});
 f.api.importComponentByKeyAsync=async()=>{throw Error('Component not found or not published');};
 const data={schemaVersion:'apollo.deprecated-styles.v1',policyVersion:1,createdAt:'2026-10-31T00:00:00Z',policySha256:'d'.repeat(64),sources:[{path:'JSONS/styles/synthetic.json',sha256:'e'.repeat(64)}],styles:[{key,type:'PAINT',name:'Synthetic obsolete style',library:'Synthetic',status:'deprecated',sourceIds:['JSONS/styles/synthetic.json']}]};
 const index=validateIndex(Object.assign({indexId:digest(data)},data),digest);
 const result=await collect(f.api,f.context(),{hash,assertCurrent:()=>{},deprecatedStyleReader:{read:async()=>index}});
 const freshness=result.checks.find(c=>c.id==='freshness'),styles=result.checks.find(c=>c.id==='deprecatedStyles');
 assert.equal(freshness.status,'incomplete');assert(freshness.findings.some(f=>f.status==='unknown'));
 assert.equal(styles.status,'complete');assert(styles.findings.some(f=>f.status==='deprecated-style'));
});
