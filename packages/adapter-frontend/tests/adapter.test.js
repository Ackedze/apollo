const test=require('node:test'), assert=require('node:assert/strict');
const ts=require('typescript');
const {prepareFrontend,executeFrontend}=require('../dist/index.cjs');
const {createCompositionPlan}=require('../../generation-core/dist/index.cjs');
const {fixture,hash,clone}=require('../../generation-core/tests/planning-fixtures.cjs');
function hostFor(context,overrides={}) {
  const calls=[];
  return Object.assign({calls,readContext:async()=>context,create:async p=>{calls.push(['create',p]);},verify:async()=>({status:'incomplete',diagnostics:[]}),rollback:async()=>{calls.push(['rollback']);}},overrides);
}
test('generates only confirmed arui-private imports and owned elements with explicit events/states',()=>{
  const f=fixture(),p=createCompositionPlan(f.spec,f.context,hash), prepared=prepareFrontend(p,f.context,hash), text=prepared.files[0].text;
  assert.match(text,/from "arui-private\/corporate-content"/); assert.match(text,/from "arui-private\/button-group"/);
  assert.doesNotMatch(text,/@alfalab|overflow|dangerouslySetInnerHTML/); assert.match(text,/onClick:\(\) => dispatch\("first"\)/);
  assert.match(text,/useState<ScreenState>\("ready"\)/); assert.equal(prepared.provenance.length,4);
  for (const p of prepared.provenance) {const line=Number(p.artifactId.split(':')[1]);assert.ok(line>0);assert.ok(text.split('\n')[line-1].includes(p.planNodeId));}
  const syntax=ts.transpileModule(text,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
  assert.equal((syntax.diagnostics||[]).length,0,'syntax only; not a real library typecheck');
});
test('JSX content escaping preserves text without treating it as source',()=>{
  const f=fixture();f.spec.nodes[1].actions.items[0].label='</script><span>{evil}</span>\u2028"&';
  const p=createCompositionPlan(f.spec,f.context,hash),text=prepareFrontend(p,f.context,hash).files[0].text;
  assert.doesNotMatch(text,/<\/script>/); assert.match(text,/\\u003c/);
  assert.equal(ts.transpileModule(text,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true}).diagnostics.length,0);
});
test('Draft source blocks before file creation',async()=>{
  const f=fixture();f.context.view.components[1].sourceStatus='draft';const h=hostFor(f.context),p=createCompositionPlan(f.spec,f.context,hash);
  const r=await executeFrontend(p,hash,h);assert.equal(r.status,'blocked');assert.equal(h.calls.length,0);
});
test('stale checkout after preparation blocks before file creation',async()=>{
  const f=fixture(),p=createCompositionPlan(f.spec,f.context,hash);let reads=0;
  const changed=clone(f.context);changed.code.package.commit='b'.repeat(40);
  const h=hostFor(f.context,{readContext:async()=>++reads===1?f.context:changed});
  const r=await executeFrontend(p,hash,h);assert.equal(r.status,'blocked');assert.equal(h.calls.length,0);
});
test('partial write/compile failure rolls back and never emits verified receipt',async()=>{
  const f=fixture(),p=createCompositionPlan(f.spec,f.context,hash),h=hostFor(f.context,{create:async()=>{h.calls.push(['partial']);throw new Error('REAL_IMPORT_UNAVAILABLE');}});
  const r=await executeFrontend(p,hash,h);assert.equal(r.status,'failed');assert.equal(r.rollback,'complete');assert.equal(r.verification,'not-run');
  assert.deepEqual(h.calls.map(c=>c[0]),['partial','rollback']);
});
test('failed browser scenario invokes rollback and reports actual verification failure',async()=>{
  const f=fixture(),p=createCompositionPlan(f.spec,f.context,hash),h=hostFor(f.context,{verify:async()=>({status:'failed',diagnostics:[{code:'SCENARIO_FAILED',stage:'execution',message:'Synthetic event did not reach expected state.'}]})});
  const r=await executeFrontend(p,hash,h);assert.equal(r.verification,'failed');assert.equal(r.status,'failed');assert.equal(r.rollback,'complete');
});
test('unexecuted context-only rules prevent a complete verified claim',async()=>{
  const f=fixture();f.context.view.components[1].coverage.pendingRoutes.push({ruleId:'context.rule',route:'context-only'});
  const p=createCompositionPlan(f.spec,f.context,hash),h=hostFor(f.context,{verify:async()=>({status:'passed',diagnostics:[]})});
  const r=await executeFrontend(p,hash,h);assert.equal(r.status,'created');assert.equal(r.verification,'incomplete');assert.equal(r.planHash,hash(p));
});
test('confirmed owned recipe emits first primary and typed disabled state without standalone Button imports',()=>{
  const f=fixture();delete f.spec.nodes[1].props.primaryFirst;
  Object.assign(f.context.registry.entries[1].actions.fields,{disabled:'disabled',priorityProp:'primaryFirst'});
  Object.assign(f.spec.nodes[1].actions.items[0],{view:'primary',disabled:{state:{ready:false,changed:true}}});
  Object.assign(f.spec.nodes[1].actions.items[1],{view:'secondary',disabled:false});
  const p=createCompositionPlan(f.spec,f.context,hash),text=prepareFrontend(p,f.context,hash).files[0].text;
  assert.match(text,/primaryFirst=\{true\}/);assert.match(text,/disabled:\(\{"ready":false,"changed":true\} as const\)\[state\]/);
  assert.doesNotMatch(text,/@alfalab/);assert.equal(ts.transpileModule(text,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true}).diagnostics.length,0);
});

test('static/unknown plan versions cannot emit JSX, read context, call remote host or create artifacts',async()=>{
 const g=require('../../generation-core/dist/planning.cjs'),{staticFixture}=require('../../generation-core/tests/static-content-fixtures.cjs');
 const f=staticFixture(),p=g.createStaticCompositionPlan(f.spec,f.context,hash);
 assert.throws(()=>prepareFrontend(p,f.context,hash),/GENERATION_PREFLIGHT_BLOCKED/);
 for(const plan of [p,Object.assign(clone(p),{schemaVersion:'future'})]){
  const calls=[],h=new Proxy({},{get:(_,name)=>async()=>{calls.push(name);throw Error('HOST_MUST_NOT_BE_CALLED');}});
  const r=await executeFrontend(plan,hash,h);assert.equal(r.status,'blocked');assert.equal(r.rollback,'not-needed');assert.equal(r.verification,'not-run');assert.deepEqual(r.provenance,[]);assert.equal(r.artifact,undefined);assert.deepEqual(calls,[]);assert.ok(r.diagnostics.some(d=>d.code==='GENERATION_PLAN_VERSION_UNSUPPORTED'));
 }
});

test('v2 static owned elements emit labels without click handlers or invented disabled state',()=>{
 const f=fixture();f.spec.schemaVersion='apollo.screen-spec.v2-experimental';f.spec.capabilityGaps=[];f.spec.events=[];f.spec.transitions=[];
 for(const a of f.spec.nodes[1].actions.items){delete a.eventId;a.behavior='none';}
 const p=createCompositionPlan(f.spec,f.context,hash),text=prepareFrontend(p,f.context,hash).files[0].text;
 assert.match(text,/Synthetic action A/);assert.match(text,/Synthetic action B/);assert.doesNotMatch(text,/onClick:|event_-1|disabled:/);
 assert.equal(ts.transpileModule(text,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true}).diagnostics.length,0);
});
