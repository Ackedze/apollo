const test=require('node:test'),assert=require('node:assert/strict');
const g=require('../dist/planning.cjs'),{fixture:legacyFixture}=require('./planning-fixtures.cjs');
const {staticFixture,filledFacts,hash,clone}=require('./static-content-fixtures.cjs');
const codes=r=>r.diagnostics.map(d=>d.code);
function planFixture(){const f=staticFixture();f.plan=g.createStaticCompositionPlan(f.spec,f.context,hash);return f;}
test('static version requires explicit product content and accepts independent priority despite View/identical labels',()=>{
 const f=staticFixture();assert.deepEqual(g.validateStaticScreenSpec(f.spec),[]);
 const p=g.createStaticCompositionPlan(f.spec,f.context,hash);
 assert.deepEqual(p.content.priorityOrder,['synthetic-secondary','synthetic-primary']);assert.equal(p.content.actions[0].view,'secondary');
 assert.ok(p.content.actions.every(a=>a.loading===false));assert.equal(p.content.actions[0].disabled,true);
 assert.ok(p.content.provenance.every(a=>a.canonicalOccurrenceId===null&&a.symbolId===null));
});
test('closed static schema rejects interaction/authority/extensions and unapproved scope',()=>{
 const mutations=[s=>s.events=[],s=>s.transitions=[],s=>s.executionAllowed=true,s=>s.status='accepted',s=>s.acceptedReceipts=[],s=>s.schemaVersion='apollo.screen-spec.static-content.v2-draft',s=>s.viewport.width=1200,s=>s.platform='mobile-web',s=>s.states.values.push('loading'),s=>s.nodes[1].props.overflow=false,s=>s.nodes[1].actions={port:'button-label',items:[]},s=>s.nodes[1].staticActions.items[0].eventId='fake',s=>s.nodes[1].staticActions.items[0].onClick='noop',s=>s.nodes.push({kind:'text',id:'extra',text:'x'})];
 for(const mutate of mutations){const f=staticFixture();mutate(f.spec);assert.ok(g.validateStaticScreenSpec(f.spec).length);assert.throws(()=>g.createStaticCompositionPlan(f.spec,f.context,hash),/STATIC_SCREEN_SCHEMA/);}
});
for(const field of ['id','label','view','disabled','loading'])test('static action cannot infer missing '+field+' from default/source/View',()=>{
 for(const bad of [null,undefined]){const f=staticFixture();if(bad===undefined)delete f.spec.nodes[1].staticActions.items[0][field];else f.spec.nodes[1].staticActions.items[0][field]=bad;assert.ok(g.validateStaticScreenSpec(f.spec).length);}
});
test('priority membership is exact and Loading=true or missing viewport height cannot masquerade as default',()=>{
 const mutations=[s=>s.nodes[1].staticActions.priorityOrder=[],s=>s.nodes[1].staticActions.priorityOrder=['synthetic-secondary','synthetic-secondary'],s=>s.nodes[1].staticActions.priorityOrder=['synthetic-secondary','unknown'],s=>s.nodes[1].staticActions.items[1].id='synthetic-secondary',s=>s.nodes[1].staticActions.items[0].id='group',s=>s.nodes[1].staticActions.items[0].loading=true,s=>s.viewport.height=null];
 for(const mutate of mutations){const f=staticFixture();mutate(f.spec);assert.ok(g.validateStaticScreenSpec(f.spec).length);}
});
test('static content projection is deterministic, independently ordered and deeply frozen without borrowing input',()=>{
 const f=staticFixture(),a=g.createStaticCompositionPlan(f.spec,f.context,hash);f.spec.nodes[1].staticActions.items.reverse();
 const b=g.createStaticCompositionPlan(f.spec,f.context,hash);assert.deepEqual(a.content,b.content);assert.equal(a.contentHash,b.contentHash);assert.notEqual(a.pins.specHash,b.pins.specHash);
 f.spec.nodes[1].staticActions.items[0].label='edited';assert.ok(a.content.actions.every(x=>x.label==='Synthetic identical label'));assert.ok(Object.isFrozen(a.content.actions[0]));assert.ok(Object.isFrozen(a.spec.nodes));
 assert.deepEqual(g.createStaticCompositionPlan(b.spec,f.context,hash),b);assert.equal(a.executionAllowed,false);
 for(const word of ['eventId','onClick','handlerRef','scenario'])assert.ok(!JSON.stringify(a.content).includes(word));
 assert.equal(a.requirements.sourceOccurrences,4);assert.equal(a.requirements.hiddenSourceOccurrences,2);assert.equal(a.requirements.deleteSourceOccurrences,false);assert.equal(a.requirements.requiredContextRuleIds.length,9);
});
test('display order and business priority are separate explicit facts; mismatches never silently reorder content',()=>{
 const f=staticFixture();f.spec.nodes[1].staticActions.priorityOrder.reverse();const p=g.createStaticCompositionPlan(f.spec,f.context,hash);
 assert.deepEqual(p.content.displayOrder,['synthetic-secondary','synthetic-primary']);assert.deepEqual(p.content.priorityOrder,['synthetic-primary','synthetic-secondary']);
 assert.deepEqual(p.content.actions.map(a=>a.id),p.content.displayOrder);assert.ok(codes(g.preflightStaticPlan(p,f.context,hash)).includes('STATIC_PRIORITY_ORDER_MISMATCH'));
 f.spec.nodes[1].staticActions.displayOrder=null;assert.ok(g.validateStaticScreenSpec(f.spec).some(d=>d.code==='STATIC_DISPLAY_ORDER_REQUIRED'));
 delete f.spec.nodes[1].staticActions.displayOrder;assert.ok(g.validateStaticScreenSpec(f.spec).length);
});
test('static preflight preserves Draft source, full pending coverage and both target/profile/native blockers',()=>{
 const f=staticFixture();f.context.view.components[1].sourceStatus='draft';f.context.view.components[1].coverage.pendingRoutes=[{ruleId:'synthetic.context-rule',route:'context-only'}];f.context.view.components[1].coverage.nonExecutableRuleIds=['synthetic.context-rule'];
 const p=g.createStaticCompositionPlan(f.spec,f.context,hash),r=g.preflightStaticPlan(p,f.context,hash);
 assert.equal(r.sourceReadiness,'blocked');assert.deepEqual(r.targets,{figma:'blocked',frontend:'blocked'});assert.equal(r.coverage[1].pendingRoutes.length,1);
 for(const code of ['SOURCE_NOT_READY','STATIC_PRODUCER_UNSUPPORTED','STATIC_CONTEXT_RECEIPTS_UNACCEPTED','CODE_PROFILE_UNACCEPTED','FIGMA_NATIVE_BINDING_UNACCEPTED','STATIC_CANONICAL_CROSSWALK_MISSING','STATIC_WIDTH_FACTS_MISSING'])assert.ok(codes(r).includes(code),code);
});
test('populated synthetic Draft facts and historical source Ready never authorize static producer/target execution',()=>{
 const f=planFixture(),facts=filledFacts(g,f.plan);assert.deepEqual(g.validateStaticFactInputDraft(facts,f.plan,hash),[]);
 const r=g.preflightStaticPlan(f.plan,f.context,hash,facts);assert.equal(r.sourceReadiness,'ready');assert.equal(r.apiAvailability,'blocked');assert.equal(r.executionAllowed,false);
 assert.deepEqual(r.targets,{figma:'blocked',frontend:'blocked'});assert.ok(codes(r).includes('STATIC_FACT_INPUT_UNACCEPTED'));assert.ok(codes(r).includes('CODE_PROFILE_UNACCEPTED'));
 assert.ok(!codes(r).includes('STATIC_WIDTH_FACTS_MISSING'));assert.ok(!codes(r).includes('STATIC_CANONICAL_CROSSWALK_MISSING'));
});
test('fact shape is closed and cannot import acceptance, overwrite scope or duplicate/drop action and source membership',()=>{
 const mutations=[x=>x.accepted=true,x=>x.authority='accepted',x=>x.targetSupport.figma='supported',x=>x.planHash=hash('different-plan'),x=>x.buildHash='unknown',x=>x.canonical.occurrences.pop(),x=>x.canonical.occurrences[1].occurrenceId=x.canonical.occurrences[0].occurrenceId,x=>x.canonical.occurrences[1].actionId=x.canonical.occurrences[0].actionId,x=>x.canonical.occurrences[2].actionId='invented',x=>x.widths.frontend.buttonWidths[0].actionId='unknown',x=>x.widths.frontend.buttonWidths[0].width=NaN,x=>delete x.widths.frontend.fontHash];
 for(const mutate of mutations){const f=planFixture(),facts=filledFacts(g,f.plan);mutate(facts);assert.ok(g.validateStaticFactInputDraft(facts,f.plan,hash).length);assert.deepEqual(g.preflightStaticPlan(f.plan,f.context,hash,facts).targets,{figma:'blocked',frontend:'blocked'});}
});
test('candidate width-fit/order mismatches are concrete blockers, not not-applicable context PASS',()=>{
 const f=planFixture(),facts=filledFacts(g,f.plan);facts.widths.figma.availableWidth=100;facts.canonical.occurrences.reverse();
 const r=g.preflightStaticPlan(f.plan,f.context,hash,facts);assert.ok(codes(r).includes('STATIC_WIDTH_DOES_NOT_FIT'));assert.ok(codes(r).includes('STATIC_PRIORITY_OBSERVATION_MISMATCH'));
 assert.ok(!JSON.stringify(r).includes('not-applicable'));
});
test('plan/content/source dependency drift and product unresolved fields remain closed blockers',()=>{
 const f=planFixture(),changed=clone(f.plan);changed.content.actions.reverse();assert.ok(codes(g.preflightStaticPlan(changed,f.context,hash)).includes('STALE_PLAN'));
 f.context.view.components[1].pin.compiledHash=hash('drift');assert.ok(codes(g.preflightStaticPlan(f.plan,f.context,hash)).includes('CONTRACT_MISSING'));
 const missing=staticFixture();missing.spec.unresolved=['Synthetic product gap'];const p=g.createStaticCompositionPlan(missing.spec,missing.context,hash);assert.ok(codes(g.preflightStaticPlan(p,missing.context,hash)).includes('SCREEN_UNRESOLVED'));
});
test('malformed context/unknown static plan version fail closed without throwing successful review',()=>{
 const f=planFixture();for(const [plan,context] of [[f.plan,{}],[Object.assign(clone(f.plan),{schemaVersion:'future'}),f.context]]){const r=g.preflightStaticPlan(plan,context,hash);assert.deepEqual(r.targets,{figma:'blocked',frontend:'blocked'});assert.equal(r.sourceReadiness,'blocked');}
 assert.throws(()=>g.createStaticFactInputDraft(f.plan,hash,'unknown'),/STATIC_BUILD_PIN_REQUIRED/);
});
test('v1 schema/interactive events stay unchanged and neither version can be silently migrated into the other',()=>{
 const legacy=legacyFixture(),p=g.createCompositionPlan(legacy.spec,legacy.context,hash);assert.deepEqual(g.validateScreenSpec(legacy.spec),[]);assert.equal(g.preflightPlan(p,legacy.context,hash).targets.frontend,'prepared');assert.equal(p.spec.nodes[1].actions.items[0].eventId,'first');
 const f=planFixture();assert.ok(g.validateScreenSpec(f.spec).some(d=>d.code==='STATIC_PROTOCOL_UNSUPPORTED'));assert.ok(g.validateStaticScreenSpec(legacy.spec).length);assert.throws(()=>g.createCompositionPlan(f.spec,f.context,hash),/SCREEN_SCHEMA/);
 assert.equal(g.preflightPlan(f.plan,f.context,hash).targets.frontend,'blocked');assert.equal(g.assessVerification(f.plan,f.context,{status:'passed',evidence:{factsHash:hash('fake'),checks:[]},diagnostics:[]}),'incomplete');
});

test('current Code Connect emit refuses static content before reading producer mapping or creating onClick',()=>{
 const f=staticFixture();assert.throws(()=>g.screenSpecForProducer(f.spec,{},f.context.registry,'default'),/SCREEN_SCHEMA/);
});
test('static source check retains transitive dependency Draft and exact pin gates',()=>{
 const f=staticFixture(),child=clone(f.context.view.components[1]);child.pin={componentId:'synthetic-dependency',contractId:'synthetic-dependency-contract',revision:1,manualSourceHash:hash('dep-source'),compiledHash:hash('dep-compiled')};child.dependencies=[];child.sourceStatus='draft';f.context.view.components.push(child);
 const lock=Object.assign(clone(f.context.view.lock.packages[1]),child.pin,{dependencies:[]});f.context.view.lock.packages.push(lock);
 f.context.view.lock.packages[1].dependencies=[{componentId:child.pin.componentId,revision:1,manualSourceHash:child.pin.manualSourceHash,compiledHash:child.pin.compiledHash}];f.context.view.components[1].dependencies=[child.pin.componentId];f.context.view.lockHash=hash(f.context.view.lock);
 let p=g.createStaticCompositionPlan(f.spec,f.context,hash),r=g.preflightStaticPlan(p,f.context,hash);assert.equal(r.sourceReadiness,'blocked');assert.equal(r.coverage.length,3);assert.ok(codes(r).includes('SOURCE_NOT_READY'));
 f.context.view.lock.packages[1].dependencies[0].compiledHash=hash('wrong');f.context.view.lockHash=hash(f.context.view.lock);p=g.createStaticCompositionPlan(f.spec,f.context,hash);r=g.preflightStaticPlan(p,f.context,hash);assert.ok(codes(r).includes('DEPENDENCY_PIN_INVALID'));
});
test('forged static fields under v1 discriminants cannot receive interaction PASS from fabricated complete checks',()=>{
 const f=legacyFixture(),p=g.createCompositionPlan(f.spec,f.context,hash),checks=[];
 for(const c of f.context.view.components)for(const id of c.coverage.predicateRuleIds)checks.push({id,componentId:c.pin.componentId,status:'passed',evidenceHash:hash(id)});
 const names=p.spec.nodes.map(n=>'node.'+n.id).concat(p.spec.states.values.map(s=>'state.'+s),p.spec.events.map(e=>'event.'+e.id),p.spec.nodes[1].actions.items.map(a=>'action.'+a.id));
 for(const id of names)checks.push({id,status:'passed',evidenceHash:hash(id)});
 const verification={status:'passed',evidence:{factsHash:hash('synthetic-facts'),checks},diagnostics:[]};assert.equal(g.assessVerification(p,f.context,verification),'passed');
 const forged=clone(p);forged.spec.nodes[1].staticActions={items:[],displayOrder:[],priorityOrder:[]};assert.equal(g.assessVerification(forged,f.context,verification),'incomplete');
});
