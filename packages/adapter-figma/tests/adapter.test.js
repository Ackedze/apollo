const test=require('node:test'),assert=require('node:assert/strict');
const {executeFigma}=require('../dist/index.cjs');
const {createCompositionPlan}=require('../../generation-core/dist/index.cjs');
const {fixture,hash,clone}=require('../../generation-core/tests/planning-fixtures.cjs');
function hostFor(context,overrides={}) {
  const calls=[],nodes=new Set(); let next=0;
  function create(kind) {const id=kind+'-'+(++next);nodes.add(id);calls.push(kind);return id;}
  return Object.assign({calls,nodes,readContext:async()=>context,resolve:async()=>{calls.push('resolve');},assertResolved:async()=>{},
    begin:async()=>create('canvas'),createInstance:async(m,props)=>{calls.push(props);return create('instance');},
    createPrimitive:async n=>create(n.kind),append:async()=>{calls.push('append');},fillNativeSlot:async()=>{calls.push('native-slot');},
    fillOwnedActions:async(id,handler,actions)=>actions.map(a=>({actionId:a.id,nodeId:create('owned-action')})),bindEvents:async()=>{calls.push('events');},
    captureAndVerify:async()=>({status:'incomplete',diagnostics:[]}),rollback:async()=>{calls.push('rollback');nodes.clear();}},overrides);
}
test('native instance/slot operations share one plan and keep action provenance',async()=>{
  const f=fixture(),p=createCompositionPlan(f.spec,f.context,hash),h=hostFor(f.context),r=await executeFigma(p,hash,h);
  assert.equal(r.status,'created');assert.equal(r.verification,'incomplete');assert.equal(r.planHash,hash(p));assert.equal(r.provenance.length,4);
  assert.equal(h.calls.filter(c=>c==='instance').length,2);assert.ok(h.calls.includes('native-slot'));
  assert.ok(h.calls.some(c=>c&&typeof c==='object'&&c.primaryFirst==='True'));
});
test('missing public code export prevents any Figma operation',async()=>{
  const f=fixture();f.context.code.publicExports=[];const h=hostFor(f.context),p=createCompositionPlan(f.spec,f.context,hash),r=await executeFigma(p,hash,h);
  assert.equal(r.status,'blocked');assert.deepEqual(h.calls,[]);assert.equal(h.nodes.size,0);
});
test('unsupported native slot prevents writes',async()=>{
  const f=fixture();delete f.context.registry.entries[0].slots.Body.figma;
  const h=hostFor(f.context),p=createCompositionPlan(f.spec,f.context,hash),r=await executeFigma(p,hash,h);
  assert.equal(r.status,'blocked');assert.deepEqual(h.calls,[]);
});
test('font/import/handler resolution failure creates no canvas',async()=>{
  const f=fixture(),p=createCompositionPlan(f.spec,f.context,hash),h=hostFor(f.context,{resolve:async()=>{throw new Error('FONT_UNAVAILABLE');}}),r=await executeFigma(p,hash,h);
  assert.equal(r.status,'blocked');assert.equal(r.rollback,'not-needed');assert.equal(h.nodes.size,0);
});
test('checkout edit during component resolution rejects before begin',async()=>{
  const f=fixture(),p=createCompositionPlan(f.spec,f.context,hash),changed=clone(f.context);changed.code.package.files['src/button-group/typings.ts']=hash('changed');let reads=0;
  const h=hostFor(f.context,{readContext:async()=>++reads===1?f.context:changed}),r=await executeFigma(p,hash,h);
  assert.equal(r.status,'blocked');assert.deepEqual(h.calls,['resolve']);assert.equal(h.nodes.size,0);
});
test('partial slot failure cleans only transaction nodes',async()=>{
  const f=fixture(),p=createCompositionPlan(f.spec,f.context,hash),h=hostFor(f.context,{fillNativeSlot:async()=>{throw new Error('SLOT_WRITE_FAILED');}}),r=await executeFigma(p,hash,h);
  assert.equal(r.status,'failed');assert.equal(r.rollback,'complete');assert.equal(h.nodes.size,0);
});
test('cleanup failure is explicit',async()=>{
  const f=fixture(),p=createCompositionPlan(f.spec,f.context,hash),h=hostFor(f.context,{bindEvents:async()=>{throw new Error('EVENTS_FAILED');},rollback:async()=>{throw new Error('REMOVED_SCOPE');}}),r=await executeFigma(p,hash,h);
  assert.equal(r.status,'failed');assert.equal(r.rollback,'incomplete');
});
test('missing owned action correspondence rejects and rolls back',async()=>{
  const f=fixture(),p=createCompositionPlan(f.spec,f.context,hash),h=hostFor(f.context,{fillOwnedActions:async()=>[]}),r=await executeFigma(p,hash,h);
  assert.equal(r.status,'failed');assert.equal(r.rollback,'complete');assert.ok(r.diagnostics.some(d=>d.code==='ACTION_PROVENANCE_INCOMPLETE'));
});

test('static/unknown plan versions block before any trusted read, import, mutation or rollback',async()=>{
 const g=require('../../generation-core/dist/planning.cjs'),{staticFixture}=require('../../generation-core/tests/static-content-fixtures.cjs');
 const f=staticFixture(),staticPlan=g.createStaticCompositionPlan(f.spec,f.context,hash);
 for(const plan of [staticPlan,Object.assign(clone(staticPlan),{schemaVersion:'future'})]){
  const calls=[],h=new Proxy({},{get:(_,name)=>async()=>{calls.push(name);throw Error('HOST_MUST_NOT_BE_CALLED');}});
  const r=await executeFigma(plan,hash,h);assert.equal(r.status,'blocked');assert.equal(r.rollback,'not-needed');assert.equal(r.verification,'not-run');assert.deepEqual(r.provenance,[]);assert.deepEqual(calls,[]);assert.ok(r.diagnostics.some(d=>d.code==='GENERATION_PLAN_VERSION_UNSUPPORTED'));
 }
});

test('v2 static elements reach native owned handler unchanged; no invented business events or verification PASS',async()=>{
 const f=fixture();f.spec.schemaVersion='apollo.screen-spec.v2-experimental';f.spec.capabilityGaps=[];f.spec.events=[];f.spec.transitions=[];
 for(const a of f.spec.nodes[1].actions.items){delete a.eventId;a.behavior='none';}
 let actions,events;const h=hostFor(f.context,{fillOwnedActions:async(id,handler,items)=>{actions=items;return items.map(a=>({actionId:a.id,nodeId:'native-'+a.id}));},bindEvents:async p=>{events=p.spec.events;}});
 const p=createCompositionPlan(f.spec,f.context,hash),r=await executeFigma(p,hash,h);
 assert.equal(r.status,'created');assert.equal(r.verification,'incomplete');assert.deepEqual(events,[]);assert(actions.every(a=>a.behavior==='none'&&a.eventId===undefined&&a.disabled===undefined));
 assert.equal(r.provenance.length,4);
});
