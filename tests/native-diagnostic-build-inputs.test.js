const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDiagnosticInputs } = require('../scripts/native-diagnostic-inputs.cjs');

test('normal builds do not read a runtime, author checkout or catalog for optional diagnostics', async () => {
  const absentRoot = '/this-build-probe-has-no-runtime-or-neighbour-repositories';
  assert.equal(await prepareDiagnosticInputs(absentRoot, {}), null);
  assert.equal(await prepareDiagnosticInputs(absentRoot, { APOLLO_NATIVE_DIAGNOSTICS: '0' }), null);
});

test('diagnostic opt-in requires explicit source locations and rejects invalid configuration', async () => {
  await assert.rejects(prepareDiagnosticInputs(__dirname, { APOLLO_NATIVE_DIAGNOSTICS: 'yes' }), /must be 0 or 1/);
  await assert.rejects(prepareDiagnosticInputs(__dirname, { APOLLO_NATIVE_DIAGNOSTICS: '1' }), /NATIVE_DIAGNOSTIC_SOURCE_CONFIG_REQUIRED/);
});
