const test = require('node:test'), assert = require('node:assert/strict');
const built = require('esbuild').buildSync(require('../build').runtimeBuildOptions(false));
const sourceModule = {exports:{}};
new Function('require','module','exports',built.outputFiles[0].text)(require,sourceModule,sourceModule.exports);
const sourceRuntime = sourceModule.exports;
const { collectContractOwnedParts, contractHash, aggregateAreaResult } = sourceRuntime;
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

function rawOwnerFixture() {
  const f=fixture(1), A='a'.repeat(40), B='b'.repeat(40), C='c'.repeat(40), D='d'.repeat(40), H='1'.repeat(64);
  const root=f.snapshot.nodes[0],part=f.snapshot.nodes[1];
  root.component.identity={componentKey:A,componentSetKey:B};part.component.identity={componentKey:C,componentSetKey:D};
  part.appearance={opacity:1};f.snapshot.source.componentKey=A;f.snapshot.source.componentSetKey=B;
  f.snapshot.source.representationId='figma';f.snapshot.source.captureTopology={complete:true,issues:[]};
  f.contract.facts.component.componentKey=A;f.contract.facts.representations[0].locator={componentSetKey:B};
  delete f.snapshot.variantReference;delete f.contract.facts.variantEvidence;
  f.contract.customizationPolicy[0].targetId='root';f.contract.customizationPolicy[0].targetScope='self-and-descendants';
  f.contract.rules[0].select.traverse='self-and-descendants';
  const base=JSON.parse(JSON.stringify(f.snapshot));
  base.source.rawCatalogue={referenceHash:H,catalog:{file:'fixture.json',sha256:H},manualSourceHash:f.contract.package.manualSourceHash,
    representationId:'figma',paths:{root:'','part-0':'Part 0'},families:{[A]:B,[C]:D}};
  f.snapshot.rawCatalogueReference={base};return f;
}
test('raw owner attribution retains actual rule/target traces and partial coverage without complete-reference forgery',()=>{
 const f=rawOwnerFixture(),before=JSON.stringify(f.snapshot),parts=collectContractOwnedParts(f.snapshot,f.contract);
 assert.equal(parts.length,1);assert.equal(parts[0].snapshotNodeId,'part-0');assert.equal(parts[0].proofBasis,'pinned-raw-catalogue');
 assert(parts[0].ruleEvidence.some(e=>e.ruleId==='source.rule.1'&&e.subjectNodeId==='part-0'&&e.classification==='compliant'));
 assert.equal(parts[0].coverage.state,'evaluated');assert.equal(f.snapshot.variantReference,undefined);
 assert.equal(JSON.stringify(f.snapshot),before);
 f.snapshot.nodes[1].unknownFacts=['appearance.opacity'];
 assert.equal(collectContractOwnedParts(f.snapshot,f.contract).length,0,'unknown-only attempts are not checked coverage');
 f.contract.rules.push(Object.assign({},f.contract.rules[0],{ruleId:'source.rule.2',assert:{predicate:'equals',actual:{fact:'type'},expected:{literal:'INSTANCE'}}}));
 assert.equal(collectContractOwnedParts(f.snapshot,f.contract)[0].coverage.state,'partial');
 assert.equal(collectContractOwnedParts(f.snapshot,f.contract,[]).length,0,'no run is not coverage');
});
test('raw owner refuses stale source, foreign identity, unknown ownership and external swap content',()=>{
 for(const edit of [f=>f.snapshot.rawCatalogueReference.base.source.rawCatalogue.manualSourceHash='2'.repeat(64),
  f=>f.snapshot.nodes[1].component.identity.componentKey='e'.repeat(40),
  f=>f.snapshot.nodes[1].unknownFacts=['component.propertyReferenceBindings'],
  f=>f.snapshot.nodes[1].component.propertyReferenceBindings={mainComponent:'Swap'},
  f=>f.contract.customizationPolicy[0].controlPaths=[{contentOwnership:'external',target:'part-0'}]]) {
  const f=rawOwnerFixture();edit(f);assert.equal(collectContractOwnedParts(f.snapshot,f.contract).length,0);
 }
});

function hiddenPartAudit() {
  const f = fixture(1), part = f.snapshot.nodes[1];
  f.snapshot.source.captureTopology = { complete:true, limitReached:false, issues:[] };
  part.semantic.role = 'part-0';
  part.visible = false; f.sync();
  const rule = f.contract.rules[0], policy = f.contract.customizationPolicy[0];
  rule.select.traverse = 'self-and-descendants';
  rule.select.where = [{predicate:'equals',actual:{fact:'semantic.role'},expected:{literal:'part-0'},missingPolicy:'unknown'}];
  policy.targetId = 'part-0'; policy.targetScope = 'self';
  return { ...f, part, audit: () => sourceRuntime.auditContractSnapshot(f.snapshot,f.contract) };
}
test('a proven hidden target retains its raw not-applicable verdict without an empty-selector coverage gap', () => {
  const f = hiddenPartAudit(), before = JSON.stringify(f.snapshot), result = f.audit();
  assert.equal(result.engine.evaluations[0].classification,'not-applicable');
  assert.equal(result.engine.evaluations[0].trace.reason,'selector matched no visible nodes');
  assert.equal(result.coverage.executionComplete,true);
  assert.equal(result.hiddenTargetScopes[0].nodeId,f.part.id);
  assert.equal(JSON.stringify(f.snapshot),before);
});
for (const [name, edit] of [
  ['missing independent reference', f=>delete f.snapshot.variantReference],
  ['incomplete independent reference', f=>f.snapshot.variantReference.complete=false],
  ['unknown visibility', f=>f.part.unknownFacts.push('visible')],
  ['unknown ancestor visibility', f=>f.snapshot.nodes[0].unknownFacts=['visible']],
  ['missing target', f=>{f.snapshot.nodes.splice(1,1);f.snapshot.nodes[0].childIds=[];}],
  ['changed source identity', f=>f.part.component.identity.componentKey='foreign'],
  ['unresolved target', f=>f.contract.facts.targets[1].resolution='unknown'],
  ['visibility requirement', f=>{f.contract.customizationPolicy[0].capability='visibility';f.contract.rules[0].assert.actual.fact='visible';}],
]) test(name+' cannot turn an empty selector into complete hidden-target coverage',()=>{
  const f=hiddenPartAudit();edit(f);const result=f.audit();
  assert.equal(result.coverage.executionComplete,false);
  assert.equal(result.hiddenTargetScopes?.length||0,0);
});
test('a visible target still executes its assertion; unrelated missing facts are not hidden',()=>{
  const f=hiddenPartAudit();f.part.visible=true;f.part.appearance={opacity:0.5};
  const result=f.audit();assert.equal(result.engine.evaluations[0].classification,'violation');
  assert.equal(result.hiddenTargetScopes?.length||0,0);
  delete f.part.appearance.opacity;assert.equal(f.audit().coverage.executionComplete,false);
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
const { scopeContractCaptureWarnings } = sourceRuntime;
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


const { auditContractSnapshot } = sourceRuntime;
function directRawAuditFixture() {
  const f=rawOwnerFixture(), part=f.snapshot.nodes[1], E='e'.repeat(40), F='f'.repeat(40);
  const label={id:'label-owner',name:'Current label',type:'INSTANCE',parentId:part.id,childIds:['label-text'],visible:true,
    appearance:{opacity:1},resolvedModes:{},component:{identity:{componentKey:E,componentSetKey:F},properties:{},propertyTypes:{},propertyReferenceBindings:{}},unknownFacts:[]};
  const text={id:'label-text',name:'Caption',type:'TEXT',parentId:label.id,childIds:[],visible:true,
    appearance:{opacity:1},text:{fontSize:16},resolvedModes:{},unknownFacts:[]};
  part.childIds=[label.id];part.resolvedModes={};f.snapshot.nodes.push(label,text);
  Object.assign(f.snapshot.source,{fileKey:'synthetic-file',pageId:'synthetic-page',occurrenceAddressVersion:1,
    catalogueNodeIds:{root:'1:1',[part.id]:'I1:1;2:1',[label.id]:'I1:1;2:1;3:1',[text.id]:'I1:1;2:1;3:1;4:1'}});
  f.snapshot.context.unknownFacts=[];
  const base=clone(f.snapshot);delete base.rawCatalogueReference;
  base.source.rawCatalogue=clone(f.snapshot.rawCatalogueReference.base.source.rawCatalogue);
  Object.assign(base.source.rawCatalogue.paths,{[label.id]:'Part 0 / Current label',[text.id]:'Part 0 / Current label / Caption'});
  f.snapshot.rawCatalogueReference={base};
  const child=clone(f.snapshot);delete child.rawCatalogueReference;child.selection=[part.id];child.nodes=child.nodes.slice(1);child.nodes[0].parentId=null;
  Object.assign(child.source,{rootNodeId:f.snapshot.source.catalogueNodeIds[part.id],componentKey:part.component.identity.componentKey,componentSetKey:part.component.identity.componentSetKey});
  child.context.platform='universal';
  const contract=fixtures.contract();contract.package.id=contract.package.componentId=contract.facts.component.componentId='fixture.direct-child';
  contract.facts.component.componentKey=child.source.componentKey;contract.facts.component.platform='universal';
  contract.facts.representations[0].locator={componentSetKey:child.source.componentSetKey};contract.facts.representations[0].platform='universal';
  contract.capabilities.facts=['baseline.effective.appearance.opacity'];
  contract.rules[0].assert.expected={fact:'baseline.effective.appearance.opacity'};contract.rules[0].select.traverse='self-and-descendants';
  contract.customizationPolicy[0].targetId='root';contract.customizationPolicy[0].targetScope='self-and-descendants';
  const standalone=clone(child);standalone.nodes[0].appearance.opacity=.4;standalone.nodes[1].name='Historical anonymous';delete standalone.nodes[1].component.identity;
  standalone.source.rawCatalogue={referenceHash:'2'.repeat(64),catalog:{file:'child.json',sha256:'2'.repeat(64)},manualSourceHash:contract.package.manualSourceHash,
    representationId:'figma',paths:{[part.id]:'',[label.id]:'Historical anonymous',[text.id]:'Historical anonymous / Caption'},families:{[child.source.componentKey]:child.source.componentSetKey}};
  child.rawCatalogueReference={base:standalone};
  f.snapshot.source.catalogReference={referenceHash:base.source.rawCatalogue.referenceHash,releaseId:'synthetic-release'};
  child.source.catalogReference={referenceHash:standalone.source.rawCatalogue.referenceHash,releaseId:'synthetic-release'};
  const owner={snapshot:f.snapshot,contract:f.contract,nodeId:part.id,nodeMap:Object.fromEntries(child.nodes.map(n=>[n.id,n.id]))};
  const repin=()=>{base.source.rawCatalogue.compiledContractHash=contractHash(f.contract);standalone.source.rawCatalogue.compiledContractHash=contractHash(contract);};
  repin();return {f,part,label,text,child,contract,owner,base,standalone,repin};
}
test('direct raw owner binds an anonymous source subtree without borrowing actual expected values',()=>{
  const a=directRawAuditFixture(),before=JSON.stringify(a);
  assert.equal(sourceRuntime.canUseDirectRawOwnerContext(a.child,a.contract,a.owner),true);
  const result=auditContractSnapshot(a.child,a.contract,undefined,a.owner);
  assert.deepEqual(result.engine.evaluations.map(e=>e.classification),['compliant','compliant','compliant']);
  assert.equal(JSON.stringify(a),before);
  a.part.appearance.opacity=a.child.nodes[0].appearance.opacity=.5;
  const changed=auditContractSnapshot(a.child,a.contract,undefined,a.owner).engine.evaluations;
  const root=changed.find(e=>e.subjectNodeId===a.part.id);
  assert.equal(root.classification,'violation');assert.equal(root.trace.expected,1);
});
for(const [name,mutate]of [
  ['parent platform outside its representation',a=>a.f.snapshot.context.platform='ios'],
  ['child channel outside the current parent',a=>a.child.context.platform='ios'],
  ['foreign parent representation',a=>{a.f.snapshot.source.representationId=a.base.source.representationId=a.base.source.rawCatalogue.representationId='foreign';}],
  ['foreign child representation',a=>{a.child.source.representationId=a.standalone.source.representationId=a.standalone.source.rawCatalogue.representationId='foreign';}],
  ['parent base representation mismatch',a=>a.base.source.representationId='foreign'],
  ['child base representation mismatch',a=>a.standalone.source.representationId='foreign'],
  ['deprecated parent representation',a=>a.f.contract.facts.representations[0].status='deprecated'],
  ['deprecated child representation',a=>a.contract.facts.representations[0].status='deprecated'],
  ['ambiguous parent representation',a=>a.f.contract.facts.representations.push(Object.assign({},clone(a.f.contract.facts.representations[0]),{id:'another'}))],
  ['ambiguous child representation',a=>a.contract.facts.representations.push(Object.assign({},clone(a.contract.facts.representations[0]),{id:'another'}))],
  ['wrong parent capture source key',a=>a.f.snapshot.source.componentKey='9'.repeat(40)],
  ['wrong child capture source key',a=>a.child.source.componentKey='9'.repeat(40)],
  ['wrong parent independent source key',a=>a.base.source.componentKey='9'.repeat(40)],
  ['wrong child independent source key',a=>a.standalone.source.componentKey='9'.repeat(40)],
  ['wrong parent capture source family',a=>a.f.snapshot.source.componentSetKey='9'.repeat(40)],
  ['wrong child independent source family',a=>a.standalone.source.componentSetKey='9'.repeat(40)],
  ['parent independent platform mismatch',a=>a.base.context.platform='ios'],
  ['child independent platform mismatch',a=>a.standalone.context.platform='desktop'],
  ['coincident parent key cannot bypass an explicit foreign set',a=>a.f.contract.facts.representations[0].locator={componentKey:a.f.snapshot.source.componentKey,componentSetKey:'9'.repeat(40)}],
  ['coincident child key cannot bypass an explicit foreign set',a=>a.contract.facts.representations[0].locator={componentKey:a.child.source.componentKey,componentSetKey:'9'.repeat(40)}],
])test('raw owner representation proof refuses '+name,()=>{
  const a=directRawAuditFixture();mutate(a);a.repin();
  assert.equal(sourceRuntime.canUseDirectRawOwnerContext(a.child,a.contract,a.owner),false);
  assert.throws(()=>auditContractSnapshot(a.child,a.contract,undefined,a.owner),error=>['APOLLO_V4_OWNER_CONTEXT_UNAVAILABLE','APOLLO_V4_CONTRACT_INCOMPATIBLE'].includes(error.code));
});
test('raw owner representation proof preserves the declared and captured universal child channels',()=>{
  for(const channel of ['universal','desktop']){
    const a=directRawAuditFixture();a.child.context.platform=channel;
    a.f.contract.facts.representations.push(Object.assign({},clone(a.f.contract.facts.representations[0]),{id:'historical',status:'deprecated'}));a.repin();
    assert.equal(sourceRuntime.canUseDirectRawOwnerContext(a.child,a.contract,a.owner),true,channel);
    assert(auditContractSnapshot(a.child,a.contract,undefined,a.owner).engine.evaluations.every(e=>e.classification==='compliant'));
  }
});
for(const [name,mutate]of [
  ['parent manual',a=>a.base.source.rawCatalogue.manualSourceHash='9'.repeat(64)],
  ['child manual',a=>a.standalone.source.rawCatalogue.manualSourceHash='9'.repeat(64)],
  ['parent compiled input',a=>a.f.contract.rules[0].presentation.title='changed'],
  ['child compiled input',a=>a.contract.rules[0].presentation.title='changed'],
  ['parent reference',a=>a.base.source.rawCatalogue.referenceHash='9'.repeat(64)],
  ['child reference',a=>a.standalone.source.rawCatalogue.referenceHash='9'.repeat(64)],
  ['source catalogue pin',a=>a.base.source.rawCatalogue.catalog.sha256='bad'],
  ['foreign release',a=>a.child.source.catalogReference.releaseId='other'],
  ['foreign parent',a=>a.f.snapshot.nodes[0].component.identity.componentKey='9'.repeat(40)],
  ['foreign standalone source key',a=>a.standalone.nodes[1].component.identity={componentKey:'9'.repeat(40)}],
  ['foreign anonymous source family',a=>a.standalone.nodes[1].component.identity={componentSetKey:'9'.repeat(40)}],
  ['failed catalogue read',a=>a.child.source.catalogReference.failures=['unavailable']],
  ['incomplete source topology',a=>a.standalone.source.captureTopology.complete=false],
  ['foreign capture id',a=>a.child.source.catalogueNodeIds[a.label.id]='foreign'],
  ['duplicate capture id',a=>a.f.snapshot.source.catalogueNodeIds.root=a.child.source.catalogueNodeIds[a.label.id]],
  ['missing native map',a=>delete a.owner.nodeMap[a.label.id]],
  ['changed child',a=>a.child.nodes[0].appearance.opacity=.5],
  ['different page',a=>a.child.source.pageId='other'],
  ['unknown actual modes',a=>a.child.context.unknownFacts.push('modes')],
  ['unknown resolved modes',a=>a.child.nodes[0].unknownFacts.push('resolvedModes')],
  ['changed resolved modes',a=>a.child.context.modes={other:'mode'}],
  ['truncated topology',a=>a.f.snapshot.source.truncated=true],
  ['incomplete topology',a=>a.child.source.captureTopology.complete=false],
  ['open swap',a=>{a.child.nodes[1].component.propertyReferenceBindings.mainComponent='Swap';a.label.component.propertyReferenceBindings.mainComponent='Swap';}],
  ['incomplete source tree',a=>a.standalone.nodes.pop()],
])test('direct raw owner refuses '+name,()=>{
  const a=directRawAuditFixture();mutate(a);
  assert.equal(sourceRuntime.canUseDirectRawOwnerContext(a.child,a.contract,a.owner),false);
  assert.throws(()=>auditContractSnapshot(a.child,a.contract,undefined,a.owner),{code:'APOLLO_V4_OWNER_CONTEXT_UNAVAILABLE'});
});
test('direct raw owner retains independent typography and source gaps',()=>{
  const a=directRawAuditFixture(),rule=clone(a.contract.rules[0]);
  rule.ruleId='source.font';rule.select.where=[{predicate:'equals',actual:{fact:'type'},expected:{literal:'TEXT'}}];
  rule.assert.actual={fact:'text.fontSize'};rule.assert.expected={fact:'baseline.effective.text.fontSize'};
  a.contract.rules.push(rule);a.contract.coverage.compiledRules=2;a.contract.capabilities.facts.push('baseline.effective.text.fontSize');a.repin();
  a.text.text.fontSize=a.child.nodes[2].text.fontSize=20;
  const changed=auditContractSnapshot(a.child,a.contract,undefined,a.owner).engine.evaluations.find(e=>e.ruleId==='source.font');
  assert.equal(changed.classification,'violation');assert.equal(changed.trace.expected,16);
  a.base.nodes.find(n=>n.id===a.text.id).unknownFacts.push('text.fontSize');
  assert.equal(auditContractSnapshot(a.child,a.contract,undefined,a.owner).engine.evaluations.find(e=>e.ruleId==='source.font').classification,'human-review');
});
test('direct raw owner Draft evidence executes only in the existing explicit authoring-preview mode',()=>{
  const a=directRawAuditFixture();a.f.contract.status='draft';a.f.contract.rules[0].authority.status='draft';a.repin();
  assert.throws(()=>auditContractSnapshot(a.child,a.contract,undefined,a.owner),{code:'APOLLO_V4_CONTRACT_INCOMPATIBLE'});
  a.owner.evaluationMode='authoring-preview';
  assert(auditContractSnapshot(a.child,a.contract,undefined,a.owner).engine.evaluations.every(e=>e.classification==='compliant'));
  assert.equal(a.f.contract.rules[0].authority.status,'draft');
});
test('direct raw owner never chooses anonymous siblings by their order or name',()=>{
  for(const reverse of [false,true]){
    const a=directRawAuditFixture(),extra=clone(a.label),text=clone(a.text);
    extra.id='second-label';extra.name='Second';extra.component.identity.componentKey='9'.repeat(40);extra.childIds=['second-text'];
    text.id='second-text';text.parentId=extra.id;
    for(const s of [a.f.snapshot,a.base,a.child,a.standalone]){
      s.nodes.find(n=>n.id===a.part.id).childIds.push(extra.id);s.nodes.push(clone(extra),clone(text));
      if(reverse)s.nodes.find(n=>n.id===a.part.id).childIds.reverse();
    }
    a.base.source.rawCatalogue.paths[extra.id]='Part 0 / Second';a.base.source.rawCatalogue.paths[text.id]='Part 0 / Second / Caption';
    for(const id of [extra.id,text.id]){a.owner.nodeMap[id]=id;a.child.source.catalogueNodeIds[id]=a.f.snapshot.source.catalogueNodeIds[id]='I1:1;2:1;'+id;}
    delete a.standalone.nodes.find(n=>n.id===extra.id).component.identity;
    a.standalone.source.rawCatalogue.paths[extra.id]='Anonymous second';a.standalone.source.rawCatalogue.paths[text.id]='Anonymous second / Caption';
    assert.equal(sourceRuntime.canUseDirectRawOwnerContext(a.child,a.contract,a.owner),false);
  }
});
let directRawCoreModule;
function directRawSourceCore(){
  if(!directRawCoreModule){
    const built=require('esbuild').buildSync({stdin:{contents:"export {validatedDirectRawOwnerCapture} from './packages/component-contract-core/src/component-dependencies'; export {prepareValidationSnapshot} from './packages/component-contract-core/src/runtime';",resolveDir:require('node:path').join(__dirname,'..'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs'});
    directRawCoreModule={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,directRawCoreModule,directRawCoreModule.exports);
  }return directRawCoreModule;
}
test('direct raw owner absence needs independent compiled shape and known variant agreement',()=>{
  for(const mode of ['closed','no-shape','shape-disagrees','unknown-properties','extra-variant-property']){
    const a=directRawAuditFixture(),shape=[{path:'',type:'ROOT'},{path:'Historical anonymous',type:'INSTANCE'},{path:'Historical anonymous / Caption',type:'TEXT'}];
    a.contract.facts.variantEvidence={schemaVersion:'apollo.variant-anatomy.v1',sourceHash:'c'.repeat(64),structures:{shape},variants:[{componentKey:a.child.source.componentKey,componentSetKey:a.child.source.componentSetKey,structureId:'shape',properties:{}}]};
    a.contract.facts.targets.push({id:'addon',semanticRole:'addon',pathHint:'Test / Addon',resolution:'resolved',lineage:[]});
    if(mode==='no-shape')delete a.contract.facts.variantEvidence;
    if(mode==='shape-disagrees')shape.push({path:'Addon',type:'INSTANCE'});
    if(mode==='unknown-properties'){a.part.unknownFacts.push('component.properties');a.child.nodes[0].unknownFacts.push('component.properties');}
    if(mode==='extra-variant-property')for(const n of [a.part,a.child.nodes[0]]){n.component.propertyTypes.Other='VARIANT';n.component.properties.Other='True';}
    a.repin();
    const capture=clone(a.f.snapshot);capture.componentDependencyCaptures=[{nodeId:a.owner.nodeId,nodeMap:a.owner.nodeMap,snapshot:a.child}];
    const m=directRawSourceCore();
    const proof=m.exports.validatedDirectRawOwnerCapture(capture,a.owner.nodeId,a.f.contract,a.contract);
    assert.ok(proof.ownerBaseline);
    const prepared=m.exports.prepareValidationSnapshot(a.child,a.contract,undefined,proof.ownerBaseline),fact=prepared.declaredTargetIdentitiesV1.targets.find(t=>t.targetId==='addon');
    assert.equal(fact.status,mode==='closed'?'resolved':'unknown',mode);
    if(mode==='closed')assert.equal(fact.present,false);
  }
});
test('direct raw owner preserves normal palette and narrowly scoped Custom token authority',()=>{
  const a=directRawAuditFixture(),paint=token=>[{type:'SOLID',visible:true,opacity:1,color:{r:1,g:2,b:3},tokenId:token}];
  a.base.nodes.find(n=>n.id===a.part.id).appearance.fill=paint('neutral');a.standalone.nodes[0].appearance.fill=paint('standalone-blue');
  a.part.appearance.fill=paint('neutral');a.child.nodes[0].appearance.fill=paint('neutral');
  const fill=clone(a.contract.rules[0]);fill.ruleId='synthetic.raw-fill';fill.select={from:'selection-root',traverse:'self'};
  fill.assert={predicate:'matches-effective-baseline',actual:{fact:'appearance.fill'},expected:{fact:'baseline.effective.appearance.fill'},missingPolicy:'unknown'};
  a.contract.rules.push(fill);a.contract.coverage.compiledRules=2;a.contract.capabilities.facts.push('baseline.effective.appearance.fill');a.repin();
  const audit=()=>auditContractSnapshot(a.child,a.contract,undefined,a.owner);
  assert.equal(audit().engine.evaluations.find(e=>e.ruleId===fill.ruleId).classification,'compliant');
  const parent=a.f.contract,policy={id:'raw-custom',status:'reviewed',targetId:'part-0',targetScope:'self',permission:'constrained',capability:'appearance.fill',controlPaths:[{kind:'direct',target:'part-0',property:'appearance.fill'}],execution:{route:'predicate'}};
  parent.customizationPolicy.push(policy);const token=clone(parent.rules[0]);token.ruleId='raw-custom.1';token.source.anchor=policy.id;
  token.select={from:'selection-root',traverse:'self-and-descendants',where:[{predicate:'equals',actual:{fact:'id'},expected:{literal:a.part.id}}]};
  token.assert={predicate:'binding-satisfies',actual:{fact:'paintBindingsV1.fill'},expected:{literal:{required:true}},missingPolicy:'unknown'};
  parent.rules.push(token);parent.runtimePolicy.paintBindingFactsVersion=1;parent.coverage={sourceRules:2,policyRules:2,policyOnlyRules:0,compiledRules:2,nonExecutableRules:0};a.repin();
  a.part.appearance.fill=a.child.nodes[0].appearance.fill=paint('custom-orange');
  assert.equal(audit().engine.evaluations.find(e=>e.ruleId===fill.ruleId).classification,'not-applicable');
  a.part.appearance.opacity=a.child.nodes[0].appearance.opacity=.5;
  assert(audit().engine.evaluations.some(e=>e.classification==='violation'));
  a.part.appearance.fill=a.child.nodes[0].appearance.fill=paint(null);
  assert.equal(auditContractSnapshot(a.f.snapshot,parent).engine.evaluations.find(e=>e.ruleId===token.ruleId).classification,'violation');
  assert.equal(audit().engine.evaluations.find(e=>e.ruleId===fill.ruleId).classification,'not-applicable');
  token.when={predicate:'equals',actual:{literal:false},expected:{literal:true}};a.repin();
  assert.notEqual(audit().engine.evaluations.find(e=>e.ruleId===fill.ruleId).classification,'not-applicable');
});
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
test('native SLOT chooses the independently typed representation port before testing ambiguity',()=>{
  const f=payloadFixture();Object.assign(f.contract.runtimePolicy,{nativeSlotTargetsVersion:1,slotTargetFactsVersion:1});f.contract.package.snapshotProfile='variant-facts-v4';f.contract.customizationPolicy[0].targetId='part-0';
  f.contract.customizationPolicy[0].controlPaths.push({kind:'slot-api',target:'part-0',property:'MobileBody',contentOwnership:'external'});
  const prepared=core.prepareValidationSnapshot(f.snapshot,f.contract);
  assert.equal(prepared.nodes.find(n=>n.id==='part-0').slotBoundaryV1?.contentOwnership,'external');
  f.root.component.propertyTypes.MobileBody='SLOT';f.snapshot.variantReference.nodeProperties[''].propertyTypes.MobileBody='SLOT';
  const ambiguous=core.prepareValidationSnapshot(f.snapshot,f.contract);
  assert.equal(ambiguous.nodes.find(n=>n.id==='part-0').slotBoundaryV1,undefined);
});
test('area audit revalidates independent enclosing configuration without mutating either snapshot',()=>{
  const a=ownedAuditFixture(),before=JSON.stringify(a);
  assert.equal(auditContractSnapshot(a.child,a.contract).engine.evaluations[0].classification,'violation');
  assert.equal(auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext).engine.evaluations[0].classification,'compliant');
  assert.equal(JSON.stringify(a),before);
  a.part.appearance.opacity=a.child.nodes[0].appearance.opacity=.4;
  const result=auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext).engine.evaluations[0];
  assert.equal(result.classification,'violation');assert.equal(result.trace.expected,.8);
});
function ownedWarningFixture(ids) {
  const a=ownedAuditFixture(), warnings=['Unrelated capture warning'], unmatchedBaselineNodeIds=ids||[a.part.id];
  const captured={snapshot:a.child,warnings,unmatchedBaselineNodeIds,
    baselineDiagnostics:appendUnmatchedBaselineWarning(warnings,unmatchedBaselineNodeIds)};
  return Object.assign(a,{diagnostics:scopeContractCaptureWarnings(captured,a.contract)});
}
test('owner warning projection reuses the current validated baseline, preserving raw diagnostics and verdicts',()=>{
  const a=ownedWarningFixture(), before=JSON.stringify(a);
  const result=auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext,a.diagnostics);
  const unchanged=auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext);
  assert.deepEqual(result.engine,unchanged.engine);assert.deepEqual(result.coverage,unchanged.coverage);
  assert.deepEqual(result.captureDiagnostics.warnings,['Unrelated capture warning']);
  assert.deepEqual(result.captureDiagnostics.baselineDiagnostics.ownerBaselineMatchedNodeIds,[a.part.id]);
  assert.deepEqual(result.captureDiagnostics.baselineDiagnostics.unresolvedBaselineNodeIds,[]);
  for(const key of ['rawWarnings','rawUnmatchedBaselineNodeIds','producer','externalSlotPayloadNodeIds'])
    assert.deepEqual(result.captureDiagnostics.baselineDiagnostics[key],a.diagnostics.baselineDiagnostics[key]);
  assert.equal(JSON.stringify(a),before);
});
test('a missing node keeps its warning while independently matched owner nodes reduce only the indexed count',()=>{
  const a=ownedWarningFixture(['part-0','missing']);
  const result=auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext,a.diagnostics).captureDiagnostics;
  assert.deepEqual(result.warnings,['Unrelated capture warning','1 узлов instance не сопоставлены с reference baseline.']);
  assert.deepEqual(result.baselineDiagnostics.unresolvedBaselineNodeIds,['missing']);
});
test('an identical unrelated warning at another index is never removed',()=>{
  const a=ownedWarningFixture(),d=a.diagnostics;
  d.warnings[0]=d.baselineDiagnostics.rawWarnings[0]=d.warnings[1];
  const result=auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext,d).captureDiagnostics;
  assert.deepEqual(result.warnings,[d.warnings[0]]);
});
for(const [name,edit] of [
  ['no enclosing evidence',a=>{a.options.ownerContext=undefined;a.child.nodes[0].baselineProvenance={status:'matched',referencePath:''};}],
  ['missing marker',a=>{delete a.diagnostics.baselineDiagnostics.producer;}],
  ['unaccepted marker',a=>{a.diagnostics.baselineDiagnostics.markerAccepted=false;}],
  ['foreign marker index',a=>{a.diagnostics.baselineDiagnostics.producer.warningIndex=0;}],
  ['foreign marker IDs',a=>{a.diagnostics.baselineDiagnostics.producer.unmatchedNodeIds=['foreign'];}],
  ['duplicate unmatched IDs',a=>{a.diagnostics.baselineDiagnostics.rawUnmatchedBaselineNodeIds.push('part-0');}],
  ['unrelated warning projection',a=>{a.diagnostics.warnings[1]='Other warning';}],
]) test(name+' cannot suppress unmatched owner diagnostics',()=>{
  const a=ownedWarningFixture();edit(a);
  assert.deepEqual(auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext,a.diagnostics).captureDiagnostics,a.diagnostics);
});
for(const [name,mutate] of [
  ['foreign mapping',a=>a.options.ownerContext.nodeMap[a.part.id]='root'],
  ['stale child actual',a=>a.child.nodes[0].appearance.opacity=.4],
  ['missing independent owner',a=>delete a.f.snapshot.instanceContentReferences],
  ['external content',a=>a.f.contract.customizationPolicy[0].controlPaths=[{kind:'slot-api',target:a.part.id,contentOwnership:'external'}]],
])test('area owner context fails closed for '+name,()=>{
  const a=ownedAuditFixture();mutate(a);assert.throws(()=>auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext),{code:'APOLLO_V4_OWNER_CONTEXT_UNAVAILABLE'});
});

function customFieldFixture() {
  const a=ownedAuditFixture(), parent=a.f.contract, child=a.contract;
  const paint={type:'SOLID',visible:true,opacity:1,tokenId:'synthetic-library-token',color:{r:0,g:0,b:0}};
  for(const snapshot of [a.f.snapshot,a.child]) snapshot.nodes.find(n=>n.id===a.part.id).appearance.fill=[clone(paint)];
  const fillRule=clone(child.rules[0]);
  fillRule.ruleId='synthetic.fill';fillRule.assert={predicate:'matches-effective-baseline',actual:{fact:'appearance.fill'},expected:{fact:'baseline.effective.appearance.fill'}};
  child.rules.push(fillRule);child.capabilities.facts.push('baseline.effective.appearance.fill');
  const tokenRule=clone(parent.rules[0]);
  tokenRule.ruleId='synthetic.custom-fill';tokenRule.source.anchor='source.custom-fill';
  tokenRule.select={from:'selection-root',traverse:'self-and-descendants',where:[{predicate:'equals',actual:{fact:'id'},expected:{literal:a.part.id}}]};
  tokenRule.assert={predicate:'binding-satisfies',actual:{fact:'paintBindingsV1.fill'},expected:{literal:{required:true}},missingPolicy:'unknown'};
  parent.runtimePolicy.paintBindingFactsVersion=1;parent.rules.push(tokenRule);
  parent.customizationPolicy.push({id:'source.custom-fill',status:'reviewed',permission:'constrained',capability:'appearance.fill',targetScope:'self',targetId:a.part.id,controlPaths:[{kind:'direct',target:a.part.id,property:'appearance.fill'}],execution:{route:'predicate'}});
  child.coverage.compiledRules=child.rules.length;
  parent.coverage={sourceRules:2,policyRules:2,policyOnlyRules:0,compiledRules:2,nonExecutableRules:0};
  return a;
}
test('an enclosing token field owns only child fill; token and other property violations survive',()=>{
  const a=customFieldFixture(), audit=()=>auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext);
  const result=audit();assert.equal(result.engine.evaluations.find(e=>e.ruleId==='synthetic.fill').classification,'not-applicable');
  assert.equal(result.ownerFieldConstraints.length,1);
  a.part.appearance.opacity=a.child.nodes[0].appearance.opacity=.3;
  assert.equal(audit().engine.evaluations.filter(e=>e.classification==='violation').length,1);
  a.part.appearance.fill[0].tokenId=a.child.nodes[0].appearance.fill[0].tokenId=null;
  assert.equal(core.evaluateCompiledContract(a.f.snapshot,a.f.contract).evaluations.find(e=>e.ruleId==='synthetic.custom-fill').classification,'violation');
  assert.equal(audit().engine.evaluations.find(e=>e.ruleId==='synthetic.fill').classification,'not-applicable');
});
test('inactive or unknown enclosing token constraints never suppress child baselines',()=>{
  for(const condition of [false,undefined]) {
    const a=customFieldFixture();a.f.contract.rules.at(-1).when=condition===false?{predicate:'equals',actual:{literal:false},expected:{literal:true}}:{predicate:'equals',actual:{fact:'missing.context'},expected:{literal:true},missingPolicy:'unknown'};
    const result=auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext);
    assert.notEqual(result.engine.evaluations.find(e=>e.ruleId==='synthetic.fill').classification,'not-applicable');
    assert.equal(result.ownerFieldConstraints,undefined);
  }
});

test('an ordinary token requirement alone preserves the fixed child fill baseline',()=>{
  const a=customFieldFixture();a.f.contract.customizationPolicy.at(-1).controlPaths=[];
  const result=auditContractSnapshot(a.child,a.contract,undefined,a.options.ownerContext);
  assert.notEqual(result.engine.evaluations.find(e=>e.ruleId==='synthetic.fill').classification,'not-applicable');
  assert.equal(result.ownerFieldConstraints,undefined);
});
