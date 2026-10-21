const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../packages/component-contract-core/dist/core.cjs');
const { fixture: configured, clone } = require('../packages/component-contract-core/tests/helpers/declared-configured.cjs');
const runtime = require('../dist/runtime.cjs');

function replacementFixture() {
  const f = configured(core), root = f.snapshot.nodes[0];
  f.manual.metadata.declaredTargetConfigurationVersion = 1;
  f.part.component.identity = { componentKey: '3'.repeat(40), componentSetKey: '1'.repeat(40), mainComponentId: 'original' };
  f.part.component.properties = { Size: 'S' };
  f.part.component.propertyTypes = { Size: 'VARIANT' };
  f.snapshot.source.instanceSourceIdentityCapture = { owners: [
    Object.assign({}, root.component.identity, { status: 'captured' }),
    Object.assign({}, f.part.component.identity, { status: 'captured' }),
  ] };
  const ref = f.snapshot.variantReference = core.captureVariantReference(clone(f.snapshot), 'synthetic-variant', 'synthetic-set');
  const structureId = core.stableHash(ref.nodes);
  f.evidence.structures = { [structureId]: ref.nodes };
  f.evidence.variants[0].structureId = structureId;
  for (const target of f.manual.targets) for (const binding of target.identityBindingsV1) {
    binding.referenceHash = core.stableHash(ref);
    binding.portableReferenceHash = core.portableDeclaredTargetReferenceHash(ref);
    binding.configurationReferenceHash = core.configurationDeclaredTargetReferenceHash(ref);
  }
  f.manual.semanticApi = [];
  f.manual.rules = [Object.assign({}, f.manual.rules[0], {
    id: 'synthetic.replacement', targetId: 'root', targetScope: 'self', capability: 'component.swap',
    permission: 'constrained', controlPaths: [], execution: { route: 'predicate' },
    applicability: { variants: 'all', modes: 'all', platforms: [], scopeStatus: 'confirmed' },
    constraints: [{ type: 'instanceReplacementDomain', replacement: { targetRole: 'part', alternatives: [
      { componentSetKey: '1'.repeat(40) }, { componentSetKey: '2'.repeat(40), properties: { Size: ['L'] } },
    ] } }],
  })];
  f.contract = core.compileManualSource(f.manual, f.evidence).contract;
  return f;
}

test('Apollo admits the shared replacement policy and agrees with Core on allowed, forbidden and unproved swaps', () => {
  const f = replacementFixture();
  const evaluate = expected => {
    const before = JSON.stringify(f.contract);
    runtime.loadRuntimeContract(f.contract);
    const actual = runtime.auditContractSnapshot(f.snapshot, f.contract);
    assert.equal(actual.engine.evaluations[0].classification, expected);
    assert.deepEqual(actual.engine, core.evaluateCompiledContract(f.snapshot, f.contract));
    assert.equal(JSON.stringify(f.contract), before);
  };
  evaluate('compliant');
  f.part.component.identity = { componentKey: '4'.repeat(40), componentSetKey: '2'.repeat(40), mainComponentId: 'replacement' };
  f.part.component.properties.Size = 'L';
  f.snapshot.source.instanceSourceIdentityCapture.owners.push(Object.assign({}, f.part.component.identity, { status: 'captured' }));
  evaluate('compliant');
  f.part.component.properties.Size = 'S';
  evaluate('violation');
  f.snapshot.source.instanceSourceIdentityCapture.owners.pop();
  evaluate('human-review');
});

test('replacement admission preserves unsupported version, orphan policy and malformed binding guards', () => {
  const original = replacementFixture().contract;
  for (const mutate of [
    c => { c.runtimePolicy.nativeInstanceReplacementsVersion = 2; },
    c => { delete c.runtimePolicy.nativeInstanceReplacementsVersion; },
    c => { delete c.runtimePolicy.nativeInstanceReplacements; },
    c => { c.runtimePolicy.nativeInstanceReplacements.push(clone(c.runtimePolicy.nativeInstanceReplacements[0])); },
    c => { c.runtimePolicy.nativeInstanceReplacements[0].id = 'forged'; },
    c => { c.runtimePolicy.nativeInstanceReplacements[0].propertyNames = ['__proto__']; },
    c => { c.runtimePolicy.futureFeatureVersion = 1; },
  ]) {
    const bad = clone(original); mutate(bad);
    assert.throws(() => runtime.loadRuntimeContract(bad), { code: 'APOLLO_V4_CONTRACT_INCOMPATIBLE' });
  }
});
