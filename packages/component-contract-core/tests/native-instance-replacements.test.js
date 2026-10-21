const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../dist/core.cjs');
const {fixture: base, clone} = require('./helpers/declared-configured.cjs');
const originalSet = '1'.repeat(40), replacementSet = '2'.repeat(40);

// Invented native identities only. No library catalogs or user captures.
function fixture() {
  const f = base(core), root = f.snapshot.nodes[0];
  f.manual.metadata.declaredTargetConfigurationVersion = 1;
  f.part.component.identity = {componentKey: '3'.repeat(40), componentSetKey: originalSet, mainComponentId: 'original-main'};
  f.part.component.properties = {Size: 'S'};
  f.part.component.propertyTypes = {Size: 'VARIANT'};
  f.snapshot.source.instanceSourceIdentityCapture = {owners: [
    {...root.component.identity, status: 'captured'}, {...f.part.component.identity, status: 'captured'},
  ]};
  const ref = f.snapshot.variantReference = core.captureVariantReference(clone(f.snapshot), 'synthetic-variant', 'synthetic-set');
  const structureId = core.stableHash(ref.nodes);
  f.evidence.structures = {[structureId]: ref.nodes};
  f.evidence.variants[0].structureId = structureId;
  for (const target of f.manual.targets) for (const binding of target.identityBindingsV1) {
    binding.referenceHash = core.stableHash(ref);
    binding.portableReferenceHash = core.portableDeclaredTargetReferenceHash(ref);
    binding.configurationReferenceHash = core.configurationDeclaredTargetReferenceHash(ref);
  }
  f.manual.semanticApi = [];
  f.manual.rules = [{...f.manual.rules[0], id: 'synthetic.replacement', targetId: 'root', targetScope: 'self',
    capability: 'component.swap', permission: 'constrained', controlPaths: [], execution: {route: 'predicate'},
    applicability: {variants: 'all', modes: 'all', platforms: [], scopeStatus: 'confirmed'},
    constraints: [{type: 'instanceReplacementDomain', replacement: {targetRole: 'part', alternatives: [
      {componentSetKey: originalSet}, {componentSetKey: replacementSet, properties: {Size: ['L']}},
    ]}}]}];
  f.compile = () => core.compileManualSource(f.manual, f.evidence);
  f.swap = size => {
    f.part.component.identity = {componentKey: '4'.repeat(40), componentSetKey: replacementSet, mainComponentId: 'replacement-main'};
    f.part.component.properties.Size = size;
    f.snapshot.source.instanceSourceIdentityCapture.owners.push({...f.part.component.identity, status: 'captured'});
  };
  return f;
}
const evaluate = f => core.evaluateCompiledContract(f.snapshot, f.compile().contract).evaluations[0].classification;
test('native replacement keeps the original family and permits only the declared foreign configuration', () => {
  const f = fixture();
  assert.equal(f.compile().contract.status, 'ready');
  assert.equal(evaluate(f), 'compliant');
  f.swap('L'); assert.equal(evaluate(f), 'compliant');
  f.part.component.properties.Size = 'S'; assert.equal(evaluate(f), 'violation');
});
for (const [name, mutate] of [
  ['missing VARIANT', f => delete f.part.component.properties.Size],
  ['wrong native type', f => f.part.component.propertyTypes.Size = 'BOOLEAN'],
  ['missing independent capture', f => f.snapshot.source.instanceSourceIdentityCapture.owners.pop()],
  ['wrong source address', f => f.part.component.sourceIdentity.sourceNodeId = 'foreign'],
]) test('native replacement remains UNKNOWN with ' + name, () => {
  const f = fixture(); f.swap('L'); mutate(f);
  assert.equal(evaluate(f), 'human-review');
});
for (const [name, mutate] of [
  ['same-rule duplicate', f => f.manual.rules[0].constraints.push(clone(f.manual.rules[0].constraints[0]))],
  ['another-rule duplicate', f => f.manual.rules.push({...clone(f.manual.rules[0]), id: 'synthetic.duplicate'})],
  ['array properties', f => f.manual.rules[0].constraints[0].replacement.alternatives[0].properties = []],
  ['null properties', f => f.manual.rules[0].constraints[0].replacement.alternatives[0].properties = null],
]) test('native replacement rejects ' + name + ' before Ready', () => {
  const f = fixture(); mutate(f);
  const result = f.compile();
  assert(result.issues.some(issue => issue.level === 'error' && issue.code === 'CONSTRAINT_INSTANCE_REPLACEMENT'));
  assert.notEqual(result.contract.status, 'ready');
});

function unavailableFixture() {
  const f = fixture(), root = f.snapshot.nodes[0];
  f.manual.rules[0].applicability.variants = {Background: ['True']};
  f.snapshot.nodes = f.snapshot.nodes.filter(n => n !== f.part);
  root.childIds = root.childIds.filter(id => id !== f.part.id);
  root.component.properties.Background = 'False';
  root.component.identity = {componentKey: 'synthetic-without-part', componentSetKey: 'synthetic-set', mainComponentId: 'without-part-main'};
  for (const n of f.snapshot.nodes) if (n.component.sourceIdentity) Object.assign(n.component.sourceIdentity, {
    ownerComponentKey: root.component.identity.componentKey, ownerMainComponentId: root.component.identity.mainComponentId,
  });
  root.layout = {itemSpacing: 0};
  root.baseline = {effective: {layout: {itemSpacing: 0}}};
  f.snapshot.source.componentKey = root.component.identity.componentKey;
  f.snapshot.source.instanceSourceIdentityCapture.owners = [{...root.component.identity, status: 'captured'}];
  const ref = f.snapshot.variantReference = core.captureVariantReference(clone(f.snapshot), root.component.identity.componentKey, 'synthetic-set');
  const structureId = core.stableHash(ref.nodes);
  f.evidence.structures[structureId] = ref.nodes;
  f.evidence.variants.push({componentKey: ref.componentKey, componentSetKey: ref.componentSetKey, structureId, properties: {Background: 'False'}});
  for (const target of f.manual.targets.filter(t => t.semanticRole !== 'part')) {
    const b = clone(target.identityBindingsV1[0]);
    b.componentKey = ref.componentKey;
    b.referenceHash = core.stableHash(ref);
    b.portableReferenceHash = core.portableDeclaredTargetReferenceHash(ref);
    b.configurationReferenceHash = core.configurationDeclaredTargetReferenceHash(ref);
    if (b.nativeSource) Object.assign(b.nativeSource, {ownerComponentKey: ref.componentKey, ownerMainComponentId: root.component.identity.mainComponentId});
    target.identityBindingsV1.push(b);
  }
  f.manual.rules.push({...clone(f.manual.rules[0]), id: 'synthetic.root-gap', capability: 'layout.itemSpacing',
    permission: 'forbidden', targetScope: 'self-and-descendants',
    boundaryPolicy: 'component-owned@1', applicability: {...f.manual.rules[0].applicability, variants: 'all'},
    constraints: [{type: 'propertyForbidden', fact: 'layout.itemSpacing'}]});
  return f;
}

test('an ineligible published variant keeps unrelated component-owned checks executable', () => {
  const f = unavailableFixture();
  const run = () => {
    const compiled = f.compile();
    assert.deepEqual(compiled.issues.filter(i => i.level === 'error'), []);
    return core.evaluateCompiledContract(f.snapshot, compiled.contract).evaluations;
  };
  assert.equal(run().find(e => e.ruleId.startsWith('synthetic.replacement.')).classification, 'not-applicable');
  assert.equal(run().find(e => e.ruleId.startsWith('synthetic.root-gap.')).classification, 'compliant');
  f.snapshot.nodes[0].layout.itemSpacing = 8;
  assert.equal(run().find(e => e.ruleId.startsWith('synthetic.root-gap.')).classification, 'violation');
});

test('a scoped eligible replacement still checks original, allowed and forbidden configurations', () => {
  const f = fixture();
  f.manual.rules[0].applicability.variants = {Background: ['True']};
  assert.equal(evaluate(f), 'compliant');
  f.swap('L'); assert.equal(evaluate(f), 'compliant');
  f.part.component.properties.Size = 'S'; assert.equal(evaluate(f), 'violation');
});

test('ALL scope does not infer absence from an unavailable binding', () => {
  const f = unavailableFixture(); f.manual.rules[0].applicability.variants = 'all';
  const prepared = core.prepareValidationSnapshot(f.snapshot, f.compile().contract);
  assert.equal(prepared.nodes[0].ruleScopeV1.local, undefined);
});

for (const [name, mutate] of [
  ['forged published identity', f => f.snapshot.nodes[0].component.identity.componentKey = 'forged'],
  ['missing published capture', f => f.snapshot.source.instanceSourceIdentityCapture.owners = []],
  ['ambiguous published capture', f => f.snapshot.source.instanceSourceIdentityCapture.owners.push(clone(f.snapshot.source.instanceSourceIdentityCapture.owners[0]))],
  ['missing source variant', f => f.evidence.variants = f.evidence.variants.slice(0,1)],
  ['ambiguous source variant', f => f.evidence.variants.push(clone(f.evidence.variants[1]))],
  ['editable actual value contradicts source', f => f.snapshot.nodes[0].component.properties.Background = 'True'],
  ['wrong selector native type', f => f.snapshot.nodes[0].component.propertyTypes.Background = 'BOOLEAN'],
]) test('ineligible replacement cannot establish local ownership with ' + name, () => {
  const f = unavailableFixture(); mutate(f);
  const contract = f.compile().contract, prepared = core.prepareValidationSnapshot(f.snapshot, contract);
  assert.equal(prepared.nodes[0].ruleScopeV1.local, undefined);
  const evaluations = core.evaluateCompiledContract(f.snapshot, contract).evaluations;
  assert(evaluations.some(e => e.classification === 'human-review'));
});
