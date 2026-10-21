const test=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),vm=require('node:vm'),path=require('node:path');
const {fixture,hash}=require("../packages/generation-core/tests/planning-fixtures.cjs");
const result=esbuild.buildSync({entryPoints:[path.resolve(__dirname,"../src/generation/controller.ts")],bundle:true,platform:'browser',format:'cjs',write:false});
const moduleObject={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module:moduleObject,exports:moduleObject.exports});
const {GenerationController}=moduleObject.exports;
test('v4 session validates imported schema without trusting it as checkout evidence',async()=>{
  let reads=0;const c=new GenerationController({hash,readContext:async()=>{reads++;throw new Error('CODE_EVIDENCE_PORT_UNAVAILABLE');}});
  const invalid=await c.prepare({});assert.equal(invalid.schemaAccepted,false);assert.equal(reads,0);
  const f=fixture(),valid=await c.prepare(f.spec);assert.equal(valid.schemaAccepted,true);assert.equal(valid.status,'blocked');assert.equal(valid.apiAvailability,'unverified');
  assert.equal(valid.plan,null);assert.equal(valid.receipts.length,0);assert.ok(valid.diagnostics.some(d=>d.code==='CODE_EVIDENCE_PORT_UNAVAILABLE'));
});
test('v4 separates confirmed API, Draft source, preflight and target execution ports',async()=>{
  const f=fixture();f.context.view.components[1].sourceStatus='draft';
  const c=new GenerationController({hash,readContext:async()=>f.context}),r=await c.prepare(f.spec);
  assert.equal(r.apiAvailability,'confirmed');assert.equal(r.sourceReadiness,'blocked');assert.equal(r.preflight.targets.figma,'blocked');
  assert.equal(r.executionPorts.frontend,'unavailable');assert.equal(r.receipts.length,0);
});
test('v4 retains target results and consumes prepared session after execution',async()=>{
  const f=fixture(),c=new GenerationController({hash,readContext:async()=>f.context}),p=await c.prepare(f.spec);
  assert.equal(p.status,'prepared');const r=await c.execute(p.sessionId,['figma','frontend']);
  assert.equal(r.status,'blocked');assert.deepEqual(Array.from(r.receipts,r=>r.target),['figma','frontend']);
  assert.ok(r.receipts.every(r=>r.status==='blocked'&&r.verification==='not-run'));
  await assert.rejects(c.execute(p.sessionId,['frontend']),/GENERATION_SESSION_STALE/);
});
test('input invalidation during asynchronous preparation cannot publish an old plan',async()=>{
  const f=fixture();let release;const c=new GenerationController({hash,readContext:()=>new Promise(r=>release=r)});
  const pending=c.prepare(f.spec);c.invalidate();release(f.context);const r=await pending;
  assert.equal(r.plan,null);assert.ok(r.diagnostics.some(d=>d.code==='GENERATION_SESSION_STALE'));
});
test('fresh source changes between prepare and execute block the existing session',async()=>{
  const f=fixture(),c=new GenerationController({hash,readContext:async()=>f.context}),p=await c.prepare(f.spec);
  f.context.code.package.files['src/button-group/typings.ts']=hash('edited');
  const r=await c.execute(p.sessionId,['figma']);assert.equal(r.receipts[0].status,'blocked');
  assert.equal(r.apiAvailability,'blocked');
  assert.ok(r.receipts[0].diagnostics.some(d=>d.code==='STALE_PLAN'));
});
test('v4 invalidation during an active write rolls back and preserves the failure receipt',async()=>{
  const f=fixture(),calls=[];let c;
  const host={readContext:async()=>f.context,create:async()=>{calls.push('partial-write');c.invalidate();},verify:async()=>{calls.push('verify');return{status:'incomplete',diagnostics:[]};},rollback:async()=>{calls.push('rollback');}};
  c=new GenerationController({hash,readContext:async()=>f.context,frontend:host});const p=await c.prepare(f.spec),r=await c.execute(p.sessionId,['frontend']);
  assert.equal(r.status,'blocked');assert.equal(r.receipts[0].status,'failed');assert.equal(r.receipts[0].rollback,'complete');
  assert.deepEqual(calls,['partial-write','rollback']);assert.ok(r.diagnostics.some(d=>d.code==='GENERATION_SESSION_STALE'));
});

test('controller passes the same frozen ScreenSpec to trusted preparation and execution readers',async()=>{
 const f=fixture(),observed=[],readContext=async spec=>{observed.push(JSON.stringify(spec));return f.context;};
 const c=new GenerationController({hash,readContext}),p=await c.prepare(f.spec);
 await c.execute(p.sessionId,['frontend']);assert.equal(observed.length,2);
 assert.equal(observed[0],JSON.stringify(f.spec));assert.equal(observed[1],JSON.stringify(p.plan.spec));
});

test('v4 interactive consumer explicitly blocks static Draft import before context or host calls',async()=>{
 const {staticFixture}=require("../packages/generation-core/tests/static-content-fixtures.cjs"),f=staticFixture();
 let reads=0;const c=new GenerationController({hash,readContext:async()=>{reads++;throw Error('NO_STATIC_CONTEXT_ROUTE');}}),r=await c.prepare(f.spec);
 assert.equal(r.status,'blocked');assert.equal(r.schemaAccepted,false);assert.equal(r.plan,null);assert.equal(r.receipts.length,0);assert.equal(reads,0);assert.ok(r.diagnostics.some(d=>d.code==='STATIC_PROTOCOL_UNSUPPORTED'));
 await assert.rejects(c.execute(r.sessionId,['figma']),/GENERATION_SESSION_STALE/);
});
test('static fields cannot be smuggled into v1 events/actions; unsupported shape invalidates prior preparation',async()=>{
 const f=fixture(),c=new GenerationController({hash,readContext:async()=>f.context}),prepared=await c.prepare(f.spec);
 const changed=JSON.parse(JSON.stringify(f.spec));changed.nodes[1].staticActions={items:[]};const rejected=await c.prepare(changed);assert.equal(rejected.schemaAccepted,false);
 await assert.rejects(c.execute(prepared.sessionId,['frontend']),/GENERATION_SESSION_STALE/);
});
