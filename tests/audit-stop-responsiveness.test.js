const test=require('node:test'),assert=require('node:assert/strict');
const {cooperativeRead,parallel}=require('../src/document-audit/reads');

for(const mode of ['cached native reads','cached parallel work'])test('Stop is delivered during '+mode,async()=>{
 let stopped=false,completed=0;
 const timer=setTimeout(()=>{stopped=true;},0),guard=()=>{if(stopped)throw Error('AUDIT_CANCELLED');};
 try{
  const work=mode==='cached native reads'?(async()=>{for(let i=0;i<512;i++){await cooperativeRead(()=>Promise.resolve(i),50,guard);completed++;}})():parallel(Array.from({length:512}),16,async()=>{guard();await Promise.resolve();guard();completed++;});
  await assert.rejects(work,/AUDIT_CANCELLED/);
  assert(completed<512,'the host must receive Stop before all cached work completes');
 }finally{clearTimeout(timer);}
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
