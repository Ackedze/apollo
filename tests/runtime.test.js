const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRuntimeContract, auditContractSnapshot, replayArchivedReport } = require("../dist/runtime.cjs");
const fixture = require("./fixtures");

test('a reviewed contract evaluates through the shared engine without mutating input', () => {
  const contract = fixture.contract(), snapshot = fixture.snapshot();
  const before = JSON.stringify({ contract, snapshot });
  const result = auditContractSnapshot(snapshot, contract);
  assert.equal(result.engine.evaluations[0].classification, 'compliant');
  assert.equal(result.coverage.executionComplete, true);
  assert.equal(JSON.stringify({ contract, snapshot }), before);
  snapshot.nodes[0].appearance.opacity = 0.5;
  const failure = auditContractSnapshot(snapshot, contract);
  assert.equal(failure.engine.evaluations[0].classification, 'violation');
  assert.equal(failure.coverage.executionComplete, true);
});

test('missing facts and truncated capture remain incomplete', () => {
  const missing = fixture.snapshot(); delete missing.nodes[0].appearance.opacity;
  const result = auditContractSnapshot(missing, fixture.contract());
  assert.equal(result.coverage.executionComplete, false);
  assert.equal(result.engine.evaluations[0].classification, 'human-review');
  const truncated = fixture.snapshot(); truncated.source.truncated = true;
  assert.equal(auditContractSnapshot(truncated, fixture.contract()).coverage.captureIncomplete, true);
});

test('foreign or absent identity cannot route by name', () => {
  for (const key of ['other-key', undefined]) {
    const snapshot = fixture.snapshot(); snapshot.source.componentKey = key;
    assert.throws(() => auditContractSnapshot(snapshot, fixture.contract()), { code: 'APOLLO_V4_COMPONENT_NOT_COVERED' });
  }
});

test('the pilot explicitly rejects multiple selected roots', () => {
  const snapshot = fixture.snapshot(); snapshot.selection.push('other');
  assert.throws(() => auditContractSnapshot(snapshot, fixture.contract()), /one component snapshot/);
});

test('invalid snapshot schemas and missing or repeated root identities cannot produce a pass', () => {
  for (const mutate of [
    s => { s.schemaVersion = 'legacy.snapshot'; },
    s => { s.selection = ['missing']; },
    s => { s.nodes.push(s.nodes[0]); },
  ]) {
    const snapshot = fixture.snapshot(); mutate(snapshot);
    assert.throws(() => auditContractSnapshot(snapshot, fixture.contract()), TypeError);
  }
});

for (const [name, mutate] of [
  ['legacy schema', c => { c.schemaVersion = 'apollo.component-contract.v2-experimental'; }],
  ['draft package', c => { c.status = 'draft'; }],
  ['draft authority', c => { c.rules[0].authority.status = 'draft'; }],
  ['draft source policy', c => { c.customizationPolicy[0].status = 'draft'; }],
  ['different source hash', c => { c.rules[0].source.checksum = 'b'.repeat(64); }],
  ['duplicate RuleIR', c => { c.rules.push(c.rules[0]); }],
  ['unclosed source rule', c => { c.rules = []; c.coverage.compiledRules = 0; }],
  ['unknown operator', c => { c.rules[0].assert.predicate = 'guess-from-prose'; }],
  ['unknown runtime version', c => { c.runtimePolicy.nativeSlotTargetsVersion = 99; }],
  ['unknown runtime feature', c => { c.runtimePolicy.futureFactVersion = 1; }],
  ['unsupported snapshot profile', c => { c.package.snapshotProfile = 'future-profile'; }],
  ['unsupported declared capability', c => { c.capabilities.operators = ['guess-from-prose']; }],
  ['malformed component dependencies', c => { c.componentDependencies = [{ id: 'child' }]; }],
  ['invalid rule revision', c => { c.rules[0].revision = 0; }],
  ['inconsistent coverage', c => { c.coverage.compiledRules = 2; }],
  ['missing presentation', c => { delete c.rules[0].presentation; }],
  ['delegated source with a predicate', c => { c.customizationPolicy[0].execution.route = 'delegated'; }],
]) {
  test(`${name} is rejected before execution`, () => {
    const contract = fixture.contract(); mutate(contract);
    assert.throws(() => loadRuntimeContract(contract), { code: 'APOLLO_V4_CONTRACT_INCOMPATIBLE' });
  });
}

test('explicit delegated and context-only rules preserve pending coverage', () => {
  for (const route of ['delegated', 'context-only']) {
    const contract = fixture.contract();
    contract.customizationPolicy.push({ id: 'source.context', status: 'reviewed', permission: 'constrained', capability: '', controlPaths: [], execution: { route } });
    contract.coverage.sourceRules++; contract.coverage.policyRules++;
    const result = auditContractSnapshot(fixture.snapshot(), contract);
    assert.equal(result.coverage.executionComplete, false);
    assert.deepEqual(result.coverage.pendingSources, [{ ruleId: 'source.context', route }]);
    assert.equal(result.engine.evaluations.length, 1);
  }
});

test('historical authoring activation stays separate from the runtime gate', () => {
  const contract = fixture.contract(); contract.status = 'draft';
  const report = { schemaVersion: 'apollo.editor-validation-report.v1', snapshot: fixture.snapshot(), runtime: { evaluatedContract: contract } };
  assert.equal(replayArchivedReport(report).evaluations[0].classification, 'compliant');
  assert.throws(() => loadRuntimeContract(contract), { code: 'APOLLO_V4_CONTRACT_INCOMPATIBLE' });
});
