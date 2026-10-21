const test = require('node:test'), assert = require('node:assert/strict'), core = require('../dist/core.cjs');
const {fixture, switchVariant, absentFixture, clone} = require('./helpers/declared-configured.cjs');
const run = f => core.evaluateCompiledContract(f.snapshot, core.prepareAuthoringPreviewContract(f.compile().contract));
const verdict = f => run(f).evaluations[0].classification;

test('configured native target preserves the original forbidden property baseline', () => {
  const f = fixture(core); assert.equal(verdict(f), 'compliant');
  switchVariant(f, core); assert.equal(verdict(f), 'violation');
  const s = core.prepareValidationSnapshot(f.snapshot, f.compile().contract);
  const part = s.nodes.find(n => n.id === 'part');
  assert.equal(part.component.properties.Color, 'Accent');
  assert.equal(part.baseline.effective.component.properties.Color, 'Neutral');
  assert.equal(s.declaredTargetIdentitiesV1.targets.find(t => t.targetId === 'part.target').status, 'resolved');
});
test('configured native target makes Image rules inapplicable for a proven Icon preset', () => {
  const f = fixture(core), r = f.manual.rules[0];
  r.applicability.context = {'semanticApi.Preset': 'Image'};
  switchVariant(f, core, 'Presets', 'Icon');
  assert.equal(verdict(f), 'not-applicable');
  r.applicability.context = undefined; r.targetId = 'root'; r.constraints = [{type: 'quantity', targetRoles: ['part'], min: 1, max: 1, visibleOnly: true}];
  assert.equal(verdict(f), 'compliant');
});
test('known false root applicability excludes an unavailable child without proving its absence', () => {
  const f = absentFixture(core); assert.equal(verdict(f), 'not-applicable');
  const s = core.prepareValidationSnapshot(f.snapshot, f.compile().contract);
  assert.notEqual(s.declaredTargetIdentitiesV1.targets.find(t => t.targetId === 'part.target').status, 'resolved');
  f.manual.rules[0].applicability.variants = 'all'; assert.equal(verdict(f), 'human-review');
});
test('unknown root applicability and missing child stay unknown', () => {
  const f = absentFixture(core); f.snapshot.nodes[0].unknownFacts = ['component.properties.Background'];
  assert.equal(verdict(f), 'human-review');
});
test('false root context cannot exclude the rule with an unproven root identity', () => {
  const f = absentFixture(core); f.snapshot.nodes[0].component.identity.mainComponentId = 'foreign-main';
  assert.equal(verdict(f), 'human-review');
});
test('historical declared policy v2 retains its configured-target unknown replay', () => {
  const f = fixture(core, 2); switchVariant(f, core); assert.equal(verdict(f), 'human-review');
});
test('reset restores the original configured target result without cached continuity', () => {
  const f = fixture(core), pristine = clone(f.snapshot);
  switchVariant(f, core); assert.equal(verdict(f), 'violation');
  f.snapshot = pristine; assert.equal(verdict(f), 'compliant');
});
test('configured target descendants retain their own owner proof', () => {
  const f = fixture(core);
  const child = {id:'part-child', parentId:f.part.id, childIds:[], type:'FRAME', name:'Inner', order:0, visible:true, unknownFacts:[],
    semantic:{role:'inner',path:'Card / Part / Inner'}, component:{properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{},
      sourceIdentity:{version:1,sourceNodeId:'inner-source',ownerComponentKey:'part-neutral',ownerMainComponentId:'part-neutral-main'}}};
  f.part.childIds.push(child.id); f.snapshot.nodes.push(child);
  f.snapshot.variantReference = core.captureVariantReference(clone(f.snapshot),'synthetic-variant','synthetic-set');
  const ref = f.snapshot.variantReference, structureId = core.stableHash(ref.nodes);
  f.evidence.structures[structureId] = ref.nodes; f.evidence.variants[0].structureId = structureId;
  for (const t of f.manual.targets) for (const b of t.identityBindingsV1) {
    b.referenceHash = core.stableHash(ref); b.portableReferenceHash = core.portableDeclaredTargetReferenceHash(ref);
  }
  f.manual.targets.push({id:'inner.target',semanticRole:'inner',label:'Inner',lineage:['Part'],resolution:'resolved',pathHint:'Card / Part / Inner',
    identityBindingsV1:[{representationId:'desktop',componentKey:ref.componentKey,componentSetKey:ref.componentSetKey,
      referenceHash:core.stableHash(ref),portableReferenceHash:core.portableDeclaredTargetReferenceHash(ref),referencePath:'Part / Inner',nodeType:'FRAME',nativeSource:{sourceNodeId:'inner-source',ownerComponentKey:'part-neutral',ownerMainComponentId:'part-neutral-main'}}]});
  switchVariant(f,core);
  Object.assign(child.component.sourceIdentity,{ownerComponentKey:'part-configured',ownerMainComponentId:'part-configured-main'});
  f.snapshot.instanceContentReferences.attempts[0].reference = clone(f.snapshot);
  delete f.snapshot.instanceContentReferences.attempts[0].reference.instanceContentReferences;
  f.snapshot.instanceContentReferences.attempts[0].reference.source.rootNodeId = 'independent-configured-host';
  assert.equal(verdict(f),'violation');
  const ledger = core.prepareValidationSnapshot(f.snapshot,f.compile().contract).declaredTargetIdentitiesV1;
  assert.equal(ledger.targets.find(t=>t.targetId==='part.target').status,'resolved');
  assert.equal(ledger.targets.find(t=>t.targetId==='inner.target').status,'unknown');
});
for (const [name, mutate] of [
  ['missing independent capture', f => delete f.snapshot.instanceContentReferences],
  ['forged cached correspondence', f => {delete f.snapshot.instanceContentReferences; f.snapshot.instanceContentResults=[{boundaryNodeId:'part',lineageProven:true,status:'matched',matchedNodeIds:['part']}]; f.part.baselineProvenance={status:'matched',kind:'independent-host-variant',boundaryNodeId:'part',componentKey:'part-configured',componentSetKey:'part-set'};}],
  ['failed independent capture', f => f.snapshot.instanceContentReferences.attempts[0].failure = 'unavailable'],
  ['duplicate capture', f => f.snapshot.instanceContentReferences.attempts.push(clone(f.snapshot.instanceContentReferences.attempts[0]))],
  ['foreign component family', f => f.part.component.identity.componentSetKey = 'foreign-set'],
  ['forged native source', f => f.part.component.sourceIdentity.sourceNodeId = 'foreign-source'],
  ['foreign native owner', f => f.part.component.sourceIdentity.ownerComponentKey = 'foreign-owner'],
  ['stale reference pin', f => f.manual.targets[2].identityBindingsV1[0].portableReferenceHash = 'b'.repeat(64)],
  ['incomplete topology', f => f.snapshot.source.captureTopology.complete = false],
  ['independent host changed', f => f.snapshot.instanceContentReferences.attempts[0].reference.nodes[0].visible = false],
  ['unproven variant properties', f => f.snapshot.instanceContentReferences.attempts[0].reference.nodes.find(n => n.id === 'part').component.properties.Color = 'Other'],
  ['duplicate native occurrence', f => {const n = clone(f.part); n.id = 'duplicate'; f.snapshot.nodes.push(n); f.snapshot.nodes[0].childIds.push(n.id);}],
]) test('configured identity fails closed: ' + name, () => {
  const f = switchVariant(fixture(core), core); mutate(f); assert.equal(verdict(f), 'human-review');
});
test('configured policy requires its exact new exporter stamp', () => {
  const c = fixture(core).compile().contract;
  c.package.sourceExportVersion = 'component-contract-editor@0.2.94';
  assert.throws(() => core.prepareValidationSnapshot(fixture(core).snapshot, c), {code: 'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});
});
test('declared policy rejects string and future versions', () => {
  for (const version of ['3', 4]) {
    const f = fixture(core); f.manual.metadata.declaredTargetIdentityVersion = version;
    assert.throws(() => f.compile(), {code: 'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});
  }
});
