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
