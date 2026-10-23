const test = require('node:test'), assert = require('node:assert/strict');
const { collectContractOwnedParts, contractHash, aggregateAreaResult } = require("../dist/runtime.cjs");
const fixtures = require("./fixtures"), { reference } = require("./dependency-fixtures");

function fixture(count = 4) {
  const snapshot = fixtures.snapshot(), contract = fixtures.contract();
  snapshot.source.instanceIdentityVersion = 1; snapshot.source.propertyReferenceIdentityVersion = 1;
  const root = snapshot.nodes[0]; root.semantic = { path: 'Test', role: 'root' };
  root.component = { identity: { componentKey: 'test-key', componentSetKey: '', mainComponentId: 'test-main' },
    properties: {}, propertyTypes: {}, propertyReferences: [], propertyReferenceBindings: {} };
  for (let index = 0; index < count; index++) {
    const id = `part-${index}`, name = `Part ${index}`;
    snapshot.nodes.push({ id, name, type: 'INSTANCE', parentId: 'root', childIds: [], order: index, visible: true,
      semantic: { path: `Test / ${name}` }, component: { identity: { componentKey: `part-key-${index}`, componentSetKey: '', mainComponentId: `part-main-${index}` },
        properties: {}, propertyTypes: {}, propertyReferences: [], propertyReferenceBindings: {} }, unknownFacts: [] });
    root.childIds.push(id);
    contract.facts.targets.push({ id, semanticRole: id, pathHint: `Test / ${name}`, lineage: ['test'], resolution: 'resolved' });
  }
  function sync() {
    snapshot.variantReference = reference(snapshot);
    for (const node of snapshot.nodes) {
      const path = node.parentId === null ? '' : node.semantic.path.split(' / ').slice(1).join(' / ');
      snapshot.variantReference.nodeProperties[path].propertyReferenceBindings = Object.assign({}, node.component.propertyReferenceBindings);
    }
    const shape = snapshot.variantReference.nodes, structureId = contractHash(shape);
    contract.facts.variantEvidence = { schemaVersion: 'apollo.variant-anatomy.v1', sourceHash: 'c'.repeat(64),
      structures: { [structureId]: shape }, variants: [{ componentKey: 'test-key', componentSetKey: 'test-key', structureId, properties: {} }] };
  }
  sync(); return { snapshot, contract, sync };
}

test('ownership records the exact declared part, independent reference and current manual without mutating facts', () => {
  const f = fixture(), before = JSON.stringify(f);
  const parts = collectContractOwnedParts(f.snapshot, f.contract);
  assert.equal(parts.length, 4);
  assert.deepEqual(parts.map(p => p.snapshotNodeId), ['part-0', 'part-1', 'part-2', 'part-3']);
  assert.ok(parts.every(p => p.ownerComponentId === 'test.component' && p.manualSourceHash === f.contract.package.manualSourceHash && p.targetId === p.snapshotNodeId));
  assert.equal(JSON.stringify(f), before);
});

test('declared external content cannot be reclassified as an internal part', () => {
  const f = fixture(1);
  f.contract.customizationPolicy[0].controlPaths = [{ kind: 'slot-api', target: 'part-0', contentOwnership: 'external' }];
  assert.deepEqual(collectContractOwnedParts(f.snapshot, f.contract), []);
});

test('native SLOT payload stays external even when its key, target and reference match', () => {
  const f = fixture(1), root = f.snapshot.nodes[0], child = f.snapshot.nodes[1];
  const slot = { id: 'body', name: 'Body', type: 'SLOT', parentId: 'root', childIds: ['part-0'], order: 0,
    component: { identity: {}, properties: {}, propertyTypes: {}, propertyReferenceBindings: { slotContentId: 'Body' } }, semantic: { path: 'Test / Body' } };
  root.childIds = ['body']; root.component.propertyTypes.Body = 'SLOT';
  child.parentId = 'body'; child.semantic.path = 'Test / Body / Part 0'; f.snapshot.nodes.push(slot);
  f.contract.facts.targets[1].pathHint = child.semantic.path; f.sync();
  assert.deepEqual(collectContractOwnedParts(f.snapshot, f.contract), []);
});

test('INSTANCE_SWAP content and its descendants cannot become implicit internal parts', () => {
  const f = fixture(2), root = f.snapshot.nodes[0], swapped = f.snapshot.nodes[1], nested = f.snapshot.nodes[2];
  root.component.propertyTypes.Content = 'INSTANCE_SWAP'; root.component.properties.Content = 'part-main-0';
  swapped.component.propertyReferenceBindings.mainComponent = 'Content';
  swapped.childIds = ['part-1']; root.childIds = ['part-0']; nested.parentId = 'part-0'; nested.semantic.path = 'Test / Part 0 / Part 1';
  f.contract.facts.targets[2].pathHint = nested.semantic.path; f.sync();
  assert.deepEqual(collectContractOwnedParts(f.snapshot, f.contract), []);
});

for (const [name, edit] of [
  ['missing independent reference', f => { delete f.snapshot.variantReference; }],
  ['incomplete independent reference', f => { f.snapshot.variantReference.complete = false; }],
  ['unresolved semantic target', f => { f.contract.facts.targets[1].resolution = 'unknown'; }],
  ['foreign component replacement', f => { f.snapshot.nodes[1].component.identity.componentKey = 'foreign'; }],
  ['unknown identity', f => { f.snapshot.nodes[1].unknownFacts.push('component.identity'); }],
  ['unknown swap bindings', f => { f.snapshot.nodes[1].unknownFacts.push('component.propertyReferenceBindings'); }],
  ['incomplete capture topology', f => { f.snapshot.source.captureTopology = { complete: false, issues: [{}] }; }],
  ['unconfirmed property-reference capture', f => { delete f.snapshot.source.propertyReferenceIdentityVersion; }],
  ['stale catalog shape', f => { f.contract.facts.variantEvidence.structures = {}; }],
]) test(name + ' never proves internal ownership', () => {
  const f = fixture(1); edit(f);
  assert.deepEqual(collectContractOwnedParts(f.snapshot, f.contract), []);
});

test('an unresolved external boundary preserves uncertainty instead of hiding caller content', () => {
  const f = fixture(1);
  f.contract.customizationPolicy[0].controlPaths = [{ kind: 'slot-api', target: 'missing-target', contentOwnership: 'external' }];
  assert.deepEqual(collectContractOwnedParts(f.snapshot, f.contract), []);
});

test('attribution cannot promote incomplete host coverage to complete', () => {
  const f = fixture(1), owned = collectContractOwnedParts(f.snapshot, f.contract);
  const component = { scopeId: 'root', result: { engine: { evaluations: [] }, coverage: { executionComplete: false } } };
  const result = aggregateAreaResult([component], [], { complete: true, components: [{}, {}] }, owned);
  assert.equal(result.coverage.executionComplete, false);
  assert.equal(result.coverage.governedComponents, 1);
  assert.equal(result.coverage.incompleteComponents, 1);
});

const core = require('../packages/component-contract-core/dist/core.cjs');
const { fixture: configured, switchVariant, clone } = require('../packages/component-contract-core/tests/helpers/declared-configured.cjs');
const { scopeContractCaptureWarnings } = require('../dist/runtime.cjs');
const { appendUnmatchedBaselineWarning, captureInstanceAudit } = require('../packages/component-contract-core/dist/capture.cjs');
const { runNativeOccurrenceCapture } = require('../packages/component-contract-core/tests/helpers/native-occurrence-capture.cjs');
function variantPart() {
  const f = configured(core); f.snapshot.source.propertyReferenceIdentityVersion = 1;
  switchVariant(f, core);
  return { snapshot: f.snapshot, contract: f.compile().contract };
}
test('independently configured same-family boundary root is owned without changing its facts or verdict', () => {
  const f = variantPart(), before = JSON.stringify(f), result = core.evaluateCompiledContract(f.snapshot, f.contract);
  const parts = collectContractOwnedParts(f.snapshot, f.contract);
  assert.equal(parts.length, 1); assert.equal(parts[0].snapshotNodeId, 'part'); assert.equal(parts[0].targetId, 'part.target');
  assert.equal(JSON.stringify(f), before); assert.deepEqual(core.evaluateCompiledContract(f.snapshot, f.contract), result);
});
for (const [name, edit] of [
  ['same-set foreign key', f => { f.snapshot.nodes.find(n => n.id === 'part').component.identity.componentKey = 'foreign-variant'; }],
  ['missing independent host evidence', f => { delete f.snapshot.instanceContentReferences; }],
  ['missing configured reference', f => { delete f.snapshot.instanceContentReferences.attempts[0].reference; }],
  ['incomplete configured reference', f => { f.snapshot.instanceContentReferences.attempts[0].reference.source.captureTopology.complete = false; }],
  ['unproven capture strategy', f => { delete f.snapshot.instanceContentReferences.attempts[0].strategy; }],
  ['foreign host context', f => { f.snapshot.instanceContentReferences.attempts[0].reference.nodes[0].component.properties.Background = 'False'; }],
  ['unknown variant identity', f => { f.snapshot.nodes.find(n => n.id === 'part').unknownFacts.push('component.identity'); }],
  ['missing variant key', f => { delete f.snapshot.nodes.find(n => n.id === 'part').component.identity.componentKey; }],
  ['unknown variant port', f => { f.snapshot.nodes.find(n => n.id === 'part').unknownFacts.push('component.propertyReferenceBindings'); }],
  ['external declared variant', f => { f.contract.customizationPolicy[0].controlPaths.push({kind:'slot-api',target:'part.target',contentOwnership:'external'}); }],
]) test(name + ' cannot reuse cached independent-variant ownership', () => {
  const f = variantPart();
  // Cached roles, baselines and successful result must be revalidated, never trusted.
  const proven = core.prepareValidationSnapshot(f.snapshot, f.contract);
  f.snapshot = proven; edit(f);
  assert.deepEqual(collectContractOwnedParts(f.snapshot, f.contract), []);
});
function payloadFixture(type = 'SLOT') {
  const f = fixture(1), root = f.snapshot.nodes[0], slot = f.snapshot.nodes[1];
  root.component.propertyTypes.Body = 'SLOT';
  slot.type = type; slot.component = {identity:{},properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{slotContentId:'Body'}};
  const payload = {id:'payload',name:'Arbitrary caller content',type:'FRAME',parentId:slot.id,childIds:[],order:0,visible:true,unknownFacts:[],
    component:{identity:{},properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{}},semantic:{path:'Test / Part 0 / Arbitrary caller content'},baselineProvenance:{status:'unresolved',reason:'structural-identity-unresolved'}};
  slot.childIds = [payload.id]; f.snapshot.nodes.push(payload);
  f.contract.customizationPolicy[0].controlPaths = [{kind:'slot-api',target:'part-0',property:'Body',contentOwnership:'external'}]; f.sync();
  const warnings = ['Other capture warning'], unmatchedBaselineNodeIds = ['payload'];
  const captured = {snapshot:f.snapshot,unmatchedBaselineNodeIds,warnings,baselineDiagnostics:appendUnmatchedBaselineWarning(warnings,unmatchedBaselineNodeIds)};
  return {...f,captured,slot,payload,root};
}
test('only declared native SLOT descendants leave parent baseline warnings; raw evidence remains intact', () => {
  const f = payloadFixture(), before = JSON.stringify(f), scoped = scopeContractCaptureWarnings(f.captured, f.contract);
  assert.deepEqual(scoped.warnings, ['Other capture warning']);
  assert.deepEqual(scoped.baselineDiagnostics.externalSlotPayloadNodeIds, ['payload']);
  assert.deepEqual(scoped.baselineDiagnostics.rawUnmatchedBaselineNodeIds, ['payload']);
  assert.deepEqual(scoped.baselineDiagnostics.rawWarnings, f.captured.warnings); assert.equal(JSON.stringify(f), before);
  // The SLOT itself and a missing host baseline remain parent diagnostics.
  f.captured.unmatchedBaselineNodeIds.push('root', 'part-0'); f.captured.warnings = ['Other capture warning'];
  f.captured.baselineDiagnostics = appendUnmatchedBaselineWarning(f.captured.warnings,f.captured.unmatchedBaselineNodeIds);
  const own = scopeContractCaptureWarnings(f.captured, f.contract);
  assert.deepEqual(own.warnings, ['Other capture warning','2 узлов instance не сопоставлены с reference baseline.']);
  assert.deepEqual(own.baselineDiagnostics.unresolvedBaselineNodeIds, ['root','part-0']);
});
test('parent diagnostic scoping uses the capture channel, not matching warning strings', () => {
  const f = payloadFixture();
  f.captured.warnings = ['Untranslated mode failure','Untranslated baseline diagnostic'];
  f.captured.baselineDiagnostics.warning = f.captured.warnings[1];
  assert.deepEqual(scopeContractCaptureWarnings(f.captured,f.contract).warnings,['Untranslated mode failure']);
  f.captured.warnings = ['1 узлов instance не сопоставлены с reference baseline.'];
  f.captured.baselineDiagnostics = appendUnmatchedBaselineWarning(f.captured.warnings,f.captured.unmatchedBaselineNodeIds);
  assert.equal(f.captured.warnings[0],f.captured.warnings[1]);
  assert.deepEqual(scopeContractCaptureWarnings(f.captured,f.contract).warnings,[f.captured.warnings[0]]);
});
test('legacy or invalid diagnostic markers preserve every raw warning', () => {
  for (const edit of [
    f=>{delete f.captured.baselineDiagnostics;},
    f=>{f.captured.baselineDiagnostics=null;},
    f=>{f.captured.baselineDiagnostics.kind='other-warning';},
    f=>{f.captured.baselineDiagnostics.warningIndex=-1;},
    f=>{f.captured.baselineDiagnostics.warningIndex=0;},
    f=>{f.captured.baselineDiagnostics.warningIndex=1.5;},
    f=>{f.captured.baselineDiagnostics.warning='Foreign entry';},
    f=>{f.captured.baselineDiagnostics.unmatchedNodeIds=['root'];},
    f=>{f.captured.baselineDiagnostics.unmatchedNodeIds.push('payload');},
    f=>{f.captured.baselineDiagnostics.extra='unknown-field';},
  ]) {
    const f=payloadFixture();edit(f);const result=scopeContractCaptureWarnings(f.captured,f.contract);
    assert.deepEqual(result.warnings,f.captured.warnings);assert.equal(result.baselineDiagnostics.markerAccepted,false);
  }
});
test('actual capture emits the optional marker at the same time as its raw baseline warning',async()=>{
  await runNativeOccurrenceCapture(async(api,actual,request)=>{
    actual.children.push({id:'I10:1;external-frame',name:'Additional frame',type:'FRAME',parent:actual,children:[],visible:true,
      opacity:1,width:10,height:10,x:0,y:0,resolvedVariableModes:{},componentPropertyReferences:{}});
    request.includePreview=false;const previous=global.figma;global.figma=api;
    try {
      const captured=await captureInstanceAudit(actual,request),marker=captured.baselineDiagnostics;
      assert.ok(captured.unmatchedBaselineNodeIds.length);assert.equal(marker.kind,'unmatched-baseline');
      assert.deepEqual(marker.unmatchedNodeIds,captured.unmatchedBaselineNodeIds);
      assert.equal(captured.warnings[marker.warningIndex],marker.warning);
      assert.equal(captured.warnings.filter((_,index)=>index===marker.warningIndex).length,1);
    }finally{if(previous===undefined)delete global.figma;else global.figma=previous;}
  },{reset:true});
});
for (const [name, edit] of [
  ['same-name FRAME', f => { f.slot.type = 'FRAME'; f.slot.name = 'Slot'; }],
  ['missing external policy', f => { f.contract.customizationPolicy[0].controlPaths = []; }],
  ['unconfirmed declared owner', f => { f.contract.customizationPolicy[0].controlPaths[0].ownerTargetId = 'missing-owner'; }],
  ['foreign slot binding', f => { f.slot.component.propertyReferenceBindings.slotContentId = 'Other'; }],
  ['unknown native slot binding', f => { f.slot.unknownFacts = ['component.propertyReferenceBindings']; }],
  ['untyped native owner', f => { delete f.root.component.propertyTypes.Body; }],
  ['unknown native owner identity', f => { f.root.unknownFacts = ['component.identity']; }],
  ['missing independent baseline', f => { delete f.snapshot.variantReference; }],
  ['incomplete independent baseline', f => { f.snapshot.variantReference.complete = false; }],
  ['incomplete actual topology', f => { f.snapshot.source.captureTopology = {complete:false}; }],
  ['unknown payload parent', f => { f.payload.unknownFacts = ['parentId']; }],
]) test(name + ' preserves the parent baseline warning', () => {
  const f = payloadFixture(); edit(f);
  assert.deepEqual(scopeContractCaptureWarnings(f.captured,f.contract).warnings, f.captured.warnings);
});


const { auditContractSnapshot } = require('../dist/runtime.cjs');
function ownedAuditFixture() {
  const f=fixture(1), part=f.snapshot.nodes[1];
  f.snapshot.source.occurrenceAddressVersion=1;
  f.snapshot.source.captureTopology={complete:true,issues:[]};
  part.resolvedModes={};part.appearance={opacity:.8};
  f.sync();f.snapshot.variantReference=core.captureVariantReference(f.snapshot,'test-key','');
  const base=clone(f.snapshot);base.source.rootNodeId='independent-enclosing';
  f.snapshot.instanceContentReferences={schemaVersion:'apollo.instance-content-references.v4',base,attempts:[]};
  const child=clone(f.snapshot);child.nodes=[clone(part)];child.nodes[0].parentId=null;child.nodes[0].semantic={path:'Test',role:'root'};
  child.source.componentKey='part-key-0';child.source.rootNodeId='actual-child';child.selection=[part.id];delete child.instanceContentReferences;
  const standalone=clone(child);standalone.source.rootNodeId='independent-standalone';standalone.nodes[0].appearance.opacity=1;
  child.variantReference=core.captureVariantReference(standalone,'part-key-0','');
  child.instanceContentReferences={schemaVersion:'apollo.instance-content-references.v4',base:standalone,attempts:[]};
  child.nodes=core.materializeEffectiveBaseline(child,standalone,true).snapshot.nodes;
  const contract=fixtures.contract();contract.package.id=contract.package.componentId=contract.facts.component.componentId='test.owned';
  contract.package.snapshotProfile='variant-facts-v4';contract.facts.component.componentKey='part-key-0';
  contract.facts.representations[0].locator.componentKey='part-key-0';
  const shape=child.variantReference.nodes,id=contractHash(shape);
  contract.facts.variantEvidence={schemaVersion:'apollo.variant-anatomy.v1',sourceHash:'c'.repeat(64),structures:{[id]:shape},variants:[{componentKey:'part-key-0',componentSetKey:'part-key-0',structureId:id,properties:{}}]};
  contract.rules[0].assert.expected={fact:'baseline.effective.appearance.opacity'};contract.capabilities.facts=['baseline.effective.appearance.opacity'];
  return {f,part,child,contract,options:{ownerContext:{snapshot:f.snapshot,contract:f.contract,nodeId:part.id,nodeMap:{[part.id]:part.id}}}};
}
test('area audit revalidates independent enclosing configuration without mutating either snapshot',()=>{
  const a=ownedAuditFixture(),before=JSON.stringify(a);
  assert.equal(auditContractSnapshot(a.child,a.contract).engine.evaluations[0].classification,'violation');
  assert.equal(auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext).engine.evaluations[0].classification,'compliant');
  assert.equal(JSON.stringify(a),before);
  a.part.appearance.opacity=a.child.nodes[0].appearance.opacity=.4;
  const result=auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext).engine.evaluations[0];
  assert.equal(result.classification,'violation');assert.equal(result.trace.expected,.8);
});
for(const [name,mutate] of [
  ['foreign mapping',a=>a.options.ownerContext.nodeMap[a.part.id]='root'],
  ['stale child actual',a=>a.child.nodes[0].appearance.opacity=.4],
  ['missing independent owner',a=>delete a.f.snapshot.instanceContentReferences],
  ['external content',a=>a.f.contract.customizationPolicy[0].controlPaths=[{kind:'slot-api',target:a.part.id,contentOwnership:'external'}]],
])test('area owner context fails closed for '+name,()=>{
  const a=ownedAuditFixture();mutate(a);assert.throws(()=>auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext),{code:'APOLLO_V4_OWNER_CONTEXT_UNAVAILABLE'});
});
