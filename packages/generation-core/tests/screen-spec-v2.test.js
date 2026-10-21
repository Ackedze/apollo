const test=require('node:test'),assert=require('node:assert/strict');
const {validateScreenSpec,createCompositionPlan,preflightPlan,normalizeCodeConnect,screenSpecForProducer}=require('../dist/planning.cjs');
const {fixture,hash,clone}=require('./planning-fixtures.cjs');const {producerFixture}=require('./code-connect-fixtures.cjs');
function noActions(f){f.spec.schemaVersion='apollo.screen-spec.v2-experimental';f.spec.capabilityGaps=[];f.spec.events=[];f.spec.transitions=[];
 for(const n of f.spec.nodes)if(n.kind==='component'&&n.actions)for(const a of n.actions.items){delete a.eventId;a.behavior='none';}
 return f;}
test('v2 explicitly preserves static owned labels/order without fake events; v1 remains strict',()=>{
 const f=noActions(fixture());assert.deepEqual(validateScreenSpec(f.spec),[]);const plan=createCompositionPlan(f.spec,f.context,hash);assert.equal(preflightPlan(plan,f.context,hash).targets.frontend,'prepared');
 assert.deepEqual(plan.spec.events,[]);assert.deepEqual(plan.spec.nodes[1].actions.items.map(a=>a.label),['Synthetic action A','Synthetic action B']);
 const old=clone(f.spec);old.schemaVersion='apollo.screen-spec.v1-experimental';delete old.capabilityGaps;assert(validateScreenSpec(old).length);assert.deepEqual(validateScreenSpec(fixture().spec),[]);
 for(const mutate of [s=>s.nodes[1].actions.items[0].eventId='first',s=>delete s.nodes[1].actions.items[0].behavior,s=>s.nodes[1].actions.items[0].behavior='noop',s=>delete s.capabilityGaps,s=>s.capabilityGaps=[{code:'gap',message:'x'}],s=>s.capabilityGaps=[{code:'MISSING_PORT',message:'x',nodeId:'missing'}]]){const s=clone(f.spec);mutate(s);assert(validateScreenSpec(s).length);}
});
test('known spacing and permitted placeholders survive; technical capability gaps block both targets separately from questions',()=>{
 const f=noActions(fixture());f.spec.nodes[0].slots.Body=['rows'];const second=clone(f.spec.nodes[1]);second.id='second-group';second.actions.items.forEach(a=>a.id='second-'+a.id);f.spec.nodes.push({kind:'stack',id:'rows',direction:'vertical',gap:24,children:['group','second-group']},second);
 f.spec.nodes[1].actions.items[0].label='Placeholder 1';for(let i=3;i<=5;i++)f.spec.nodes[1].actions.items.push({id:'placeholder-'+i,label:'Placeholder '+i,behavior:'none'});f.spec.capabilityGaps=[{code:'OVERFLOW_COLLECTION_UNAVAILABLE',message:'Synthetic adapter lacks overflow collection.',nodeId:'group'}];
 const p=createCompositionPlan(f.spec,f.context,hash),preflight=preflightPlan(p,f.context,hash);assert.equal(p.spec.nodes[2].gap,24);assert.equal(p.spec.nodes[1].actions.items.length,5);assert.equal(p.spec.nodes[3].actions.items.length,2);assert.equal(p.spec.unresolved.length,0);
 assert.equal(preflight.targets.figma,'blocked');assert.equal(preflight.targets.frontend,'blocked');assert(preflight.diagnostics.some(d=>d.code==='SCREEN_CAPABILITY_GAP'));assert(!preflight.diagnostics.some(d=>d.code==='SCREEN_UNRESOLVED'));
});
test('legacy producer rejects explicit none with capability error instead of generating event_-1',()=>{
 const f=noActions(producerFixture()),normalized=normalizeCodeConnect(f.raw,f.lock,f.context.view,['content','group'],hash);
 assert.throws(()=>screenSpecForProducer(f.spec,f.raw,normalized,f.spec.states.initial),/PRODUCER_NO_ACTION_UNSUPPORTED/);
});

test('v2 mixed static and eventful items remain explicit and compatible with declared events',()=>{
 const f=fixture();f.spec.schemaVersion='apollo.screen-spec.v2-experimental';f.spec.capabilityGaps=[];
 const a=f.spec.nodes[1].actions.items[0];delete a.eventId;a.behavior='none';
 assert.deepEqual(validateScreenSpec(f.spec),[]);assert.equal(f.spec.nodes[1].actions.items[1].eventId,'second');
});
test('no-business-action verification requires content evidence; fictitious action checks cannot substitute it',()=>{
 const {assessVerification}=require('../dist/planning.cjs'),f=noActions(fixture()),p=createCompositionPlan(f.spec,f.context,hash);
 const check=(id,componentId)=>({id,componentId,status:'passed',evidenceHash:hash(id)});
 const checks=f.context.view.components.flatMap(c=>c.coverage.predicateRuleIds.map(id=>check(id,c.pin.componentId)))
  .concat(p.spec.nodes.map(n=>check('node.'+n.id)),p.spec.states.values.map(s=>check('state.'+s)),p.spec.nodes[1].actions.items.map(a=>check('content.'+a.id)));
 const result={status:'passed',diagnostics:[],evidence:{factsHash:hash('observed-content'),checks}};
 assert.equal(assessVerification(p,f.context,result),'passed');
 result.evidence.checks=checks.map(c=>Object.assign({},c,{id:c.id.replace(/^content\./,'action.')}));assert.equal(assessVerification(p,f.context,result),'incomplete');
});
