const test = require('node:test'), assert = require('node:assert/strict'), core = require('../dist/core.cjs');
const {fixture, configure, clone} = require('./helpers/declared-target-configuration.cjs');
const run = f => core.evaluateCompiledContract(f.snapshot, f.compile().contract);
for (const [name, label, show] of [['default', 'Default', true], ['public TEXT', 'A longer public label', true], ['public BOOLEAN false', 'Default', false]]) {
  test('configuration identity resolves native targets after ' + name, () => {
    const f = fixture(core); configure(f, label, show);
    assert(run(f).evaluations.every(e => ['compliant','not-applicable'].includes(e.classification)));
    const prepared = core.prepareValidationSnapshot(f.snapshot, f.compile().contract);
    assert(prepared.declaredTargetIdentitiesV1.targets.every(t => t.status === 'resolved'));
    assert.equal(prepared.declaredTargetIdentitiesV1.targets[1].effectiveVisible, show);
  });
}
test('configured TEXT preserves font violation and same-instance restoration', () => {
  const f = fixture(core); configure(f, 'Public label'); f.snapshot.nodes[2].text.fontSize = 18;
  assert.equal(run(f).evaluations.find(e => e.ruleId === 'synthetic.font-size.1.1').classification, 'violation');
  f.snapshot.nodes[2].text.fontSize = 16;
  assert(run(f).evaluations.every(e => e.classification === 'compliant'));
});
test('configuration identity does not bypass a public property domain', () => {
  const f = fixture(core);
  f.snapshot.nodes[0].component.propertyReferences = ['Show'];
  f.snapshot.nodes[1].component.propertyReferences = ['Show'];
  f.snapshot.nodes[1].component.propertyReferenceBindings = {visible: 'Show'};
  f.snapshot.variantReference = clone(core.captureVariantReference(clone(f.snapshot), 'synthetic-variant', 'synthetic-set', Object.keys(f.snapshot.nodes[0].component.properties)));
  for (const target of f.manual.targets) for (const binding of target.identityBindingsV1) {
    binding.referenceHash = core.stableHash(f.snapshot.variantReference);
    binding.portableReferenceHash = core.portableDeclaredTargetReferenceHash(f.snapshot.variantReference);
    binding.configurationReferenceHash = core.configurationDeclaredTargetReferenceHash(f.snapshot.variantReference);
  }
  f.manual.rules.push(Object.assign({}, f.manual.rules[0], {
    id: 'synthetic.show-domain', capability: 'component.configuration',
    constraints: [{type: 'propertyDomain', fact: 'component.properties.Show', values: [true]}],
  }));
  configure(f, 'Public label', false);
  const prepared = core.prepareValidationSnapshot(f.snapshot, f.compile().contract);
  assert(prepared.declaredTargetIdentitiesV1.targets.every(t => t.status === 'resolved'));
  assert.equal(run(f).evaluations.find(e => e.ruleId === 'synthetic.show-domain.1.1').classification, 'violation');
  configure(f, 'Public label', true);
  assert(run(f).evaluations.every(e => e.classification === 'compliant'));
});
test('historical v3 pin semantics are unchanged without the configuration marker', () => {
  const f = fixture(core); delete f.manual.metadata.declaredTargetConfigurationVersion;
  for (const t of f.manual.targets) for (const b of t.identityBindingsV1) delete b.configurationReferenceHash;
  assert(run(f).evaluations.every(e => e.classification === 'compliant'));
  configure(f, 'Changed'); assert(run(f).evaluations.every(e => e.classification === 'human-review'));
});
for (const [name, mutate] of [
  ['changed reference source', f => {f.snapshot.variantReference.nodeProperties['Title / value'].sourceIdentity.sourceNodeId = 'foreign';}],
  ['changed reference owner', f => {f.snapshot.variantReference.nodeProperties['Title / value'].sourceIdentity.ownerComponentKey = 'foreign';}],
  ['changed actual source', f => {f.snapshot.nodes[2].component.sourceIdentity.sourceNodeId = 'foreign';}],
  ['missing reference', f => {delete f.snapshot.variantReference;}],
  ['unknown actual owner', f => {f.snapshot.nodes[0].unknownFacts = ['component.identity.mainComponentId'];}],
  ['incomplete topology', f => {f.snapshot.source.captureTopology.complete = false;}],
  ['duplicate source', f => {const n = clone(f.snapshot.nodes[2]); n.id = 'duplicate'; f.snapshot.nodes.push(n); f.snapshot.nodes[1].childIds.push(n.id);}],
  ['untyped BOOLEAN', f => {for (const p of [f.snapshot.variantReference.properties, f.snapshot.variantReference.nodeProperties[''].properties]) p.Show = 'false';}],
  ['inconsistent root maps', f => {f.snapshot.variantReference.properties.Show = false;}],
  ['missing public property', f => {delete f.snapshot.variantReference.nodeProperties[''].properties.Label;}],
  ['VARIANT change', f => {for (const p of [f.snapshot.variantReference.properties, f.snapshot.variantReference.nodeProperties[''].properties]) p.Size = 'L';}],
  ['INSTANCE_SWAP change', f => {for (const p of [f.snapshot.variantReference.properties, f.snapshot.variantReference.nodeProperties[''].properties]) p.Slot = 'other-main';}],
  ['nested property change', f => {f.snapshot.variantReference.nodeProperties['Title / value'].properties.Label = 'Foreign';}],
]) test('configuration identity fails closed on ' + name, () => {
  const f = fixture(core); configure(f, 'Public label'); mutate(f);
  const prepared = core.prepareValidationSnapshot(f.snapshot, f.compile().contract);
  assert(prepared.declaredTargetIdentitiesV1.targets.some(t => t.status !== 'resolved'));
  assert(run(f).evaluations.some(e => e.classification === 'human-review'));
});
test('configuration policy, pins and producer require explicit matching opt-in', () => {
  for (const edit of [
    f => {f.manual.metadata.declaredTargetConfigurationVersion = 3;},
    f => {delete f.manual.metadata.declaredTargetConfigurationVersion;},
    f => {f.manual.metadata.declaredTargetIdentityVersion = 2;},
    f => {delete f.manual.targets[0].identityBindingsV1[0].configurationReferenceHash;},
    f => {f.manual.targets[0].identityBindingsV1[0].configurationReferenceHash = 'guess';},
  ]) {const f = fixture(core); edit(f); assert.throws(() => f.compile(), {code: 'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});}
  const f = fixture(core), c = f.compile().contract;
  assert.equal(c.runtimePolicy.declaredTargetConfigurationVersion, 1);
  assert.equal(c.package.sourceExportVersion, 'component-contract-editor@0.2.99');
  c.package.sourceExportVersion = 'component-contract-editor@0.2.95';
  assert.throws(() => core.evaluateCompiledContract(f.snapshot, c), {code: 'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});
});
