const test = require('node:test'), assert = require('node:assert/strict');
const runtime = require("../dist/runtime.cjs"), fixture = require("./authoring-fixtures");
const clone = value => JSON.parse(JSON.stringify(value));

test('manual alone supplies normative constraints; compilation preserves the frozen source', () => {
  const source = fixture.source(), before = JSON.stringify(source);
  const snapshot = fixture.snapshot();
  const first = runtime.loadAuthoringSource(source);
  assert.equal(first.contract.package.manualSourceHash, runtime.contractHash(source.manual));
  assert.equal(runtime.auditContractSnapshot(snapshot, first.contract).engine.evaluations[0].classification, 'compliant');
  source.manual.rules[0].constraints[0].values = [.5]; source.manual.metadata.revision++;
  const second = runtime.loadAuthoringSource(source);
  assert.notEqual(second.sourceHash, first.sourceHash);
  assert.equal(runtime.auditContractSnapshot(snapshot, second.contract).engine.evaluations[0].classification, 'violation');
  assert.deepEqual(runtime.loadAuthoringSource(JSON.parse(before)).contract, first.contract);
  assert.equal(JSON.stringify(first.source), JSON.stringify(source));
});

for (const [name, edit] of [
  ['legacy manual', s => { s.manual.schemaVersion = 'apollo.component-contract.manual.v1'; }],
  ['draft rules', s => { s.manual.rules[0].status = 'draft'; }],
  ['absent bound facts', s => { delete s.variantEvidence; }],
  ['unknown fact schema', s => { s.variantEvidence.schemaVersion = 'future'; }],
  ['missing dependency manual', s => { s.dependencies = []; }],
  ['changed child source', s => { s.dependencies[0].manual.rules[0].constraints[0].values = [.5]; }],
]) test(name + ' never enables an audit', () => {
  const s = name.includes('dependency') || name.includes('child') ? fixture.nested().source : fixture.source();
  edit(s); assert.throws(() => runtime.loadAuthoringSource(s));
});

test('compiled-only input and a bare manual without facts are rejected', () => {
  assert.throws(() => runtime.loadAuthoringSource(require("./fixtures").contract()), { code: 'APOLLO_V4_SOURCE_INVALID' });
  assert.throws(() => runtime.loadAuthoringSource(fixture.source().manual), /факты/);
});

test('Editor compact anatomy can be reused but a stale or altered projection cannot supply norms', () => {
  const s = fixture.source(), c = runtime.loadAuthoringSource(s).contract;
  const files = () => [{ name: 'contract.manual.json', text: JSON.stringify(s.manual) }, { name: 'compiled/component-contract.v2.json', text: JSON.stringify(c) }];
  const loaded = runtime.loadAuthoringSource(runtime.sourceFromFiles(files()));
  assert.deepEqual(loaded.contract, c);
  const before = JSON.stringify(s); runtime.loadAuthoringSource(s); assert.equal(JSON.stringify(s), before);
  c.rules[0].assert.expected = { literal: .5 };
  assert.throws(() => runtime.loadAuthoringSource(runtime.sourceFromFiles(files())), /не воспроизводят/);
  s.manual.metadata.revision++;
  const fresh = runtime.loadAuthoringSource(runtime.sourceFromFiles(files()));
  assert.equal(fresh.source.projectionStamp, undefined);
  assert.equal(fresh.contract.rules[0].revision, 2);
  assert.equal(runtime.auditContractSnapshot(fixture.snapshot(), fresh.contract).engine.evaluations[0].classification, 'compliant');
});

test('bounded source recursion rejects a cycle before compilation or serialization', () => {
  const s = fixture.nested().source;
  s.dependencies[0].manual.componentDependencies = clone(s.manual.componentDependencies);
  s.dependencies[0].manual.componentDependencies[0].componentId = s.manual.component.componentId;
  s.dependencies[0].dependencies = [s];
  assert.throws(() => runtime.loadAuthoringSource(s), /Цикл/);
});

test('two fixed binding pins can share one child authoring source without duplicating its norms', () => {
  const f = fixture.nested(), pin = f.source.manual.componentDependencies[0];
  f.source.manual.componentDependencies = pin.bindings.map(binding => Object.assign({}, pin, { id: binding.id, bindings: [binding] }));
  const source = runtime.linkSourcePackages([f.source, f.childSource]);
  assert.equal(source.dependencies.length, 1);
  const loaded = runtime.loadAuthoringSource(source);
  const result = runtime.auditContractSnapshot(f.snapshot, loaded.contract);
  assert.deepEqual(result.engine.dependencyRuns.map(run => run.status), ['executed', 'executed']);
  assert.ok(result.engine.evaluations.filter(entry => entry.dependency).every(entry => entry.ruleId.startsWith('test.child.opacity.')));
});
