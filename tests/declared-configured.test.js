const test = require('node:test'), assert = require('node:assert/strict');
const core = require("../packages/component-contract-core/dist/core.cjs");
const {fixture, switchVariant, absentFixture, clone} = require("../packages/component-contract-core/tests/helpers/declared-configured.cjs");
const {loadRuntimeContract, auditContractSnapshot} = require("../dist/runtime.cjs");

function parity(f, expected) {
  const c = f.compile().contract;
  loadRuntimeContract(c);
  const actual = auditContractSnapshot(f.snapshot, c).engine;
  assert.deepEqual(actual, core.evaluateCompiledContract(f.snapshot, c));
  assert.equal(actual.evaluations[0].classification, expected);
  return c;
}

test('Apollo reads independently configured native targets using the new exact producer profile', () => {
  const f = switchVariant(fixture(core), core), c = parity(f, 'violation');
  assert.equal(c.package.sourceExportVersion, 'component-contract-editor@0.2.95');
  const bad = clone(c); bad.package.sourceExportVersion = 'component-contract-editor@0.2.94';
  assert.throws(() => loadRuntimeContract(bad), {code: 'APOLLO_V4_CONTRACT_INCOMPATIBLE'});
  c.status = 'draft';
  assert.throws(() => loadRuntimeContract(c), {code: 'APOLLO_V4_CONTRACT_INCOMPATIBLE'});
});

test('Apollo agrees on Icon applicability and retains unknown without independent proof', () => {
  const f = switchVariant(fixture(core), core, 'Presets', 'Icon');
  f.manual.rules[0].applicability.context = {'semanticApi.Preset': 'Image'};
  parity(f, 'not-applicable');
  delete f.snapshot.instanceContentReferences;
  parity(f, 'human-review');
});

test('Apollo agrees on false root applicability without asserting child absence', () => {
  const f = absentFixture(core);
  parity(f, 'not-applicable');
  f.snapshot.nodes[0].unknownFacts = ['component.properties.Background'];
  parity(f, 'human-review');
});
