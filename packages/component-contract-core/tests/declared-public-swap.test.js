const test = require('node:test'), assert = require('node:assert/strict'), core = require('../dist/core.cjs');
const {fixture, swap, clone} = require('./helpers/declared-public-swap.cjs');
const prepared = f => core.prepareValidationSnapshot(f.snapshot, f.compile().contract);
const run = f => core.evaluateCompiledContract(f.snapshot, f.compile().contract);
const resolved = f => assert(prepared(f).declaredTargetIdentitiesV1.targets.every(t => t.status === 'resolved'));

for (const sides of [['left'], ['right'], ['left','right']]) test('declared public swap keeps host and slot targets: ' + sides, () => {
  const f = fixture(core), reset = clone(f.snapshot);
  for (const side of sides) swap(f, side);
  resolved(f);
  assert(run(f).evaluations.every(e => e.classification === 'compliant'));
  f.snapshot = reset; resolved(f);
  // The fixture compile closure is independent of the captured snapshot.
  assert(run(f).evaluations.every(e => e.classification === 'compliant'));
});
for (const [name, mutate, rule] of [
  ['oversized left slot', f => {f.snapshot.nodes.find(n => n.id === 'left').bounds.height = 32;}, 'synthetic.left-height.1.1'],
  ['oversized right slot', f => {f.snapshot.nodes.find(n => n.id === 'right').bounds.height = 32;}, 'synthetic.right-height.1.1'],
  ['host layout', f => {f.snapshot.nodes[0].layout.itemSpacing = 12;}, 'synthetic.host-gap.1.1'],
  ['label typography', f => {f.snapshot.nodes[2].text.fontSize = 18;}, 'synthetic.font-size.1.1'],
]) test('public swap preserves violation and RESET: ' + name, () => {
  const f = fixture(core); swap(f, 'left'); swap(f, 'right');
  const reset = clone(f.snapshot); mutate(f); resolved(f);
  assert.equal(run(f).evaluations.find(e => e.ruleId === rule && e.classification === 'violation')?.classification, 'violation');
  Object.assign(f.snapshot, reset); resolved(f);
  assert(run(f).evaluations.every(e => e.classification === 'compliant'));
});
for (const [name, mutate] of [
  ['foreign source', f => {f.snapshot.nodes.find(n => n.id === 'left').component.sourceIdentity.sourceNodeId = 'foreign';}],
  ['foreign reference source', f => {f.snapshot.variantReference.nodeProperties['foreign left'].sourceIdentity.sourceNodeId = 'foreign';}],
  ['foreign reference owner', f => {f.snapshot.variantReference.nodeProperties['foreign left'].sourceIdentity.ownerComponentKey = 'foreign';}],
  ['untyped port', f => {f.snapshot.nodes[0].component.propertyTypes.Slot = 'TEXT';}],
  ['unknown port', f => {f.snapshot.nodes[0].unknownFacts.push('component.properties.Slot');}],
  ['port value differs from selected asset', f => {f.snapshot.nodes[0].component.properties.Slot = 'other-main';}],
  ['missing reference', f => {delete f.snapshot.variantReference;}],
  ['incomplete topology', f => {f.snapshot.source.captureTopology.complete = false;}],
  ['stale host structure', f => {f.snapshot.variantReference.nodes.find(n => n.path === 'Title').type = 'GROUP';}],
  ['stale nested value', f => {f.snapshot.variantReference.nodeProperties['Title / value'].properties.Foreign = true;}],
  ['duplicate source', f => {const n = clone(f.snapshot.nodes.find(n => n.id === 'left')); n.id = 'duplicate'; f.snapshot.nodes.push(n); f.snapshot.nodes[0].childIds.push(n.id);}],
  ['permission removed', f => {f.manual.rules.find(r => r.id === 'synthetic.left-swap').permission = 'forbidden';}],
  ['external ownership removed', f => {delete f.manual.rules.find(r => r.id === 'synthetic.left-swap').controlPaths[0].contentOwnership;}],
]) test('public swap fails closed: ' + name, () => {
  const f = fixture(core); swap(f, 'left'); mutate(f);
  assert(prepared(f).declaredTargetIdentitiesV1.targets.some(t => t.status !== 'resolved'));
  assert(run(f).evaluations.some(e => e.classification === 'human-review'));
});
test('legacy configuration v1 does not acquire public swap semantics', () => {
  const f = fixture(core, 1); swap(f, 'left');
  assert(prepared(f).declaredTargetIdentitiesV1.targets.every(t => t.status === 'unknown' && t.reason === 'reference-pin-stale'));
});
test('foreign glyph structure changes inside the allowed slot do not hide a host constraint', () => {
  const f = fixture(core); swap(f, 'left');
  const icon = f.snapshot.nodes.find(n => n.id === 'left');
  icon.childIds = ['glyph'];
  f.snapshot.nodes.push({id: 'glyph', parentId: 'left', childIds: [], name: 'Foreign glyph', type: 'VECTOR', visible: true,
    unknownFacts: [], semantic: {path: 'Card / foreign left / Foreign glyph'}, component: {properties: {}, propertyTypes: {},
      sourceIdentity: {version: 1, sourceNodeId: 'glyph-source', ownerComponentKey: 'foreign-key', ownerMainComponentId: 'foreign-main'}}});
  f.snapshot.variantReference.nodes.push({path: 'foreign left / Foreign glyph', type: 'VECTOR'});
  f.snapshot.variantReference.nodeProperties['foreign left / Foreign glyph'] = {properties: {}, propertyTypes: {}, propertyReferences: [], diagnosticName: 'Foreign glyph',
    sourceIdentity: {version: 1, sourceNodeId: 'glyph-source', ownerComponentKey: 'foreign-key', ownerMainComponentId: 'foreign-main'}};
  resolved(f); assert(run(f).evaluations.every(e => e.classification === 'compliant'));
  icon.bounds.height = 32;
  assert(run(f).evaluations.some(e => e.ruleId === 'synthetic.left-height.1.1' && e.classification === 'violation'));
});
test('v2 marker alone cannot reuse old v1 pins', () => {
  const f = fixture(core, 1); f.manual.metadata.declaredTargetConfigurationVersion = 2; swap(f, 'left');
  assert(prepared(f).declaredTargetIdentitiesV1.targets.every(t => t.status !== 'resolved'));
});
test('public swap policy requires its producer stamp and exact new pins', () => {
  const f = fixture(core), c = f.compile().contract;
  assert.equal(c.runtimePolicy.declaredTargetConfigurationVersion, 2);
  assert.equal(c.package.sourceExportVersion, 'component-contract-editor@0.2.103');
  c.package.sourceExportVersion = 'component-contract-editor@0.2.99';
  assert.throws(() => core.prepareValidationSnapshot(f.snapshot, c), {code: 'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});
});
