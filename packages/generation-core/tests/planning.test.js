const test = require('node:test'), assert = require('node:assert/strict');
const {createCompositionPlan,preflightPlan,validateScreenSpec,transformValue} = require('../dist/index.cjs');
const {fixture,hash,clone} = require('./planning-fixtures.cjs');
test('one frozen plan has independent preparation and verification statuses', () => {
  const {spec,context}=fixture(), plan=createCompositionPlan(spec,context,hash), r=preflightPlan(plan,context,hash);
  assert.equal(r.apiAvailability,'confirmed'); assert.equal(r.sourceReadiness,'ready');
  assert.deepEqual(r.targets,{figma:'prepared',frontend:'prepared'}); assert.deepEqual(r.diagnostics,[]);
  assert.equal(Object.isFrozen(plan.spec.nodes),true); spec.nodes[1].props.primaryFirst=false;
  assert.equal(preflightPlan(plan,context,hash).targets.frontend,'prepared');
});
const negativeCases = [
  ['PUBLIC_EXPORT_MISSING',({context})=>context.code.publicExports.pop()],
  ['CODE_FILE_STALE',({context})=>context.code.package.files['src/button-group/typings.ts']=hash('changed')],
  ['CODE_CHECKOUT_STALE',({context})=>context.code.package.commit='b'.repeat(40)],
  ['REGISTRY_UNCONFIRMED',({context})=>context.registry.producer.status='draft'],
  ['PLATFORM_UNSUPPORTED',({spec})=>spec.platform='mobile-web'],
  ['MAPPING_CONTRACT_STALE',({context})=>context.registry.entries[1].pin.revision=2],
  ['PROPERTY_UNSUPPORTED',({spec})=>spec.nodes[1].props.overflow='Off'],
  ['PROPERTY_VALUE_UNSUPPORTED',({spec})=>spec.nodes[1].props.primaryFirst='True'],
  ['SLOT_UNSUPPORTED',({spec})=>{spec.nodes[0].slots.Body=[];spec.nodes.pop();}],
  ['ACTION_PORT_UNSUPPORTED',({spec})=>spec.nodes[1].actions.port='unknown'],
  ['ACTION_PORT_REQUIRED',({spec})=>delete spec.nodes[1].actions],
  ['SLOT_REQUIRED',({spec})=>{delete spec.nodes[0].slots.Body;spec.nodes.pop();}],
  ['SOURCE_NOT_READY',({context})=>context.view.components[1].sourceStatus='draft'],
  ['SCREEN_UNRESOLVED',({spec})=>spec.unresolved=['Action labels await product decision']],
];
for (const [code,mutate] of negativeCases) test(code+' blocks both routes before writes', () => {
  const f=fixture(); mutate(f); const plan=createCompositionPlan(f.spec,f.context,hash), result=preflightPlan(plan,f.context,hash);
  assert.ok(result.diagnostics.some(d=>d.code===code),code); assert.deepEqual(result.targets,{figma:'blocked',frontend:'blocked'});
});
test('missing Figma native slot blocks only its target while the common API remains available',()=>{
  const f=fixture(); delete f.context.registry.entries[0].slots.Body.figma;
  const r=preflightPlan(createCompositionPlan(f.spec,f.context,hash),f.context,hash);
  assert.equal(r.apiAvailability,'confirmed'); assert.deepEqual(r.targets,{figma:'blocked',frontend:'prepared'});
});
test('pending context routes remain visible and never upgrade Draft source',()=>{
  const f=fixture(); f.context.view.components[1].coverage.pendingRoutes.push({ruleId:'interaction.rule',route:'context-only'});
  f.context.view.components[1].sourceStatus='draft';
  const r=preflightPlan(createCompositionPlan(f.spec,f.context,hash),f.context,hash);
  assert.equal(r.sourceReadiness,'blocked'); assert.equal(r.coverage[1].pendingRoutes.length,1);
});
test('stale frozen pins reject drift including source status and coverage',()=>{
  const f=fixture(), plan=createCompositionPlan(f.spec,f.context,hash); f.context.view.components[1].coverage.pendingRoutes.push({ruleId:'new',route:'context-only'});
  assert.ok(preflightPlan(plan,f.context,hash).diagnostics.some(d=>d.code==='STALE_PLAN'));
  const broken=clone(plan); broken.components[1].mappingId='another';
  assert.ok(preflightPlan(broken,f.context,hash).diagnostics.some(d=>d.code==='PLAN_MAPPING_DRIFT'));
});
test('schema rejects disconnected trees, cycles, unknown primitives, invented functions and ambiguous transitions',()=>{
  const mutateCases=[s=>s.nodes.push({kind:'text',id:'orphan',text:'x'}),s=>s.nodes[1].slots.loop=['content'],s=>s.nodes[1].kind='button',
    s=>s.nodes[1].props.onClick={javascript:'execute()'},s=>s.transitions.push({eventId:'first',from:'ready',to:'ready'}),
    s=>s.nodes[1].actions.items[0].eventId='unknown',s=>delete s.nodes[1].props.primaryFirst.state.changed];
  for (const mutate of mutateCases) {const {spec}=fixture(); mutate(spec); assert.ok(validateScreenSpec(spec).length);}
});
test('malformed imported contexts produce a diagnostic, not a thrown success/fallback',()=>{
  const f=fixture(), p=createCompositionPlan(f.spec,f.context,hash);
  assert.equal(preflightPlan(p,{},hash).targets.figma,'blocked');
  assert.throws(()=>transformValue(true,{kind:'lookup',values:[]}),/MAPPING_VALUE_UNSUPPORTED/);
});
test('owned action priority/disabled state require a confirmed recipe and cannot override group props twice',()=>{
  const f=fixture();delete f.spec.nodes[1].props.primaryFirst;
  Object.assign(f.spec.nodes[1].actions.items[0],{view:'primary',disabled:{state:{ready:false,changed:true}}});
  Object.assign(f.spec.nodes[1].actions.items[1],{view:'secondary',disabled:false});
  let r=preflightPlan(createCompositionPlan(f.spec,f.context,hash),f.context,hash);
  assert.ok(r.diagnostics.some(d=>d.code==='ACTION_VIEW_UNSUPPORTED'));assert.ok(r.diagnostics.some(d=>d.code==='ACTION_DISABLED_UNSUPPORTED'));
  Object.assign(f.context.registry.entries[1].actions.fields,{disabled:'disabled',priorityProp:'primaryFirst'});
  r=preflightPlan(createCompositionPlan(f.spec,f.context,hash),f.context,hash);assert.equal(r.targets.frontend,'prepared');
  f.spec.nodes[1].actions.items[1].view='primary';
  r=preflightPlan(createCompositionPlan(f.spec,f.context,hash),f.context,hash);assert.equal(r.targets.figma,'blocked');
});
