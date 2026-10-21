const test=require('node:test'),assert=require('node:assert/strict');
const {preparePatternAttachments,createPatternAvailabilityPort}=require("../scripts/generation-pattern-inputs");
const {makePattern,readSynthetic}=require("../packages/pattern-core/tests/synthetic.cjs");
const {fixture,hash}=require("../packages/generation-core/tests/planning-fixtures.cjs");
const {createCompositionPlan,preflightPlan}=require("../packages/generation-core/dist/planning.cjs");
test('draft pattern source, selected decisions, activeStates and unresolved product/UI gaps survive in the frozen common plan',()=>{
 const f=fixture(),pattern=makePattern();
 f.context.patterns=preparePatternAttachments({requests:[{pattern,context:{needsReview:true,platform:'desktop'},platform:'desktop',target:'frontend'}],
  context:f.context,hash,readSource:readSynthetic});
 const p=createCompositionPlan(f.spec,f.context,hash),r=preflightPlan(p,f.context,hash);
 assert.equal(p.patterns[0].requirements.executionAllowed,false);assert.equal(p.patterns[0].requirements.sourceVerification,'passed');
 assert.equal(p.patterns[0].requirements.decisions[0].rowId,'review');assert.deepEqual(p.patterns[0].requirements.compositions[0].activeStates,['reviewing']);
 assert.equal(p.patterns[0].requirements.scenario.transitions.find(t=>t.id==='unknown-result').target.gapId,'product-gap');
 assert.deepEqual(r.targets,{figma:'blocked',frontend:'blocked'});
 for(const code of ['PATTERN_DRAFT','PATTERN_AVAILABILITY_UNRESOLVED','PATTERN_GAP_UNRESOLVED','PATTERN_ROLE_BINDING_UNRESOLVED'])assert.ok(r.diagnostics.some(d=>d.code===code));
 f.context.patterns[0].requirements.context.needsReview=false;
 assert.ok(preflightPlan(p,f.context,hash).diagnostics.some(d=>d.code==='PATTERN_PLAN_STALE'));
});
test('a real source check is required, missing product context remains unresolved and drafts cannot be promoted',()=>{
 const f=fixture(),request={pattern:makePattern(),context:{needsReview:true,platform:'desktop'},platform:'desktop',target:'frontend'};
 const run=(r,read=readSynthetic)=>preparePatternAttachments({requests:[r],context:f.context,hash,readSource:read});
 assert.throws(()=>run(request,ref=>({bytes:Buffer.from('drift'),commit:ref.commit})),e=>e.code==='PATTERN_SOURCE_UNVERIFIED');
 request.context={platform:'desktop'};assert.throws(()=>run(request),e=>e.code==='PATTERN_CONTEXT_UNRESOLVED');
 request.pattern.status='ready';assert.throws(()=>run(request),e=>e.code==='PATTERN_SOURCE_UNVERIFIED');
});
test('API availability alone never grants a semantic pattern role or a standalone internal Button',()=>{
 const f=fixture();f.context.registry.source={digest:hash('registry')};
 assert.equal(createPatternAvailabilityPort(f.context)({entryId:'content',registrySha256:hash('registry'),semanticRole:'dialog.surface'}),null);
 assert.equal(createPatternAvailabilityPort(f.context)({entryId:'arui-private/button',registrySha256:hash('registry'),semanticRole:'action'}),null);
});

test('reviewed role bridge uses compiled hash and target representation without promoting API into parity or native readiness',()=>{
 const {producerFixture}=require("../packages/generation-core/tests/code-connect-fixtures.cjs");
 const {normalizeCodeConnect,codeObservationFromProducer}=require("../packages/generation-core/dist/planning.cjs");
 const {checkAvailability}=require("../packages/pattern-core/dist/index.cjs");
 const f=producerFixture();f.context.registry=normalizeCodeConnect(f.raw,f.lock,f.context.view,['content','group'],hash);
 f.context.code=codeObservationFromProducer(f.context.registry);f.context.producerObservation={status:'availability-pass',registryDigest:f.raw.registryDigest,lockHash:hash(f.lock)};
 const entry=f.context.registry.entries[1],semanticRole='synthetic.action-group';
 const port=createPatternAvailabilityPort(f.context,[{entryId:entry.id,registryDigest:f.raw.registryDigest,compiledHash:entry.pin.compiledHash,semanticRole,evidenceHash:hash('reviewed-synthetic-role')}]);
 const request={entryId:entry.id,registrySha256:f.raw.registryDigest,semanticRole,platform:'desktop',target:'frontend',requiredInputs:['elements'],requiredSlots:[],
  lock:{contractId:entry.pin.contractId,revision:entry.pin.revision,contractSha256:entry.pin.compiledHash,representationId:entry.code.representationId}};
 const checked=checkAvailability(request,port);assert.equal(checked.status,'passed');
 assert.equal(checked.evidence.readiness.fullContractParity,'not-confirmed');assert.equal(checked.evidence.readiness.codeRepresentation,'proposed-for-authoring');
 assert.equal(checked.evidence.readiness.builtPackage,'not-built-in-checkout');
 request.target='figma';request.lock.representationId=entry.figma.representationId;
 assert.ok(checkAvailability(request,port).issues.some(i=>i.code==='TARGET_UNAVAILABLE'));
 request.target='frontend';request.lock.representationId=entry.code.representationId;request.lock.contractSha256=f.raw.mappings[1].contract.archiveSha256;
 assert.ok(checkAvailability(request,port).issues.some(i=>i.code==='STALE_COMPONENT_LOCK'));
});
