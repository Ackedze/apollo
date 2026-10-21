const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const core = require("../packages/component-contract-core/dist/core.cjs"), runtime = require("../dist/runtime.cjs");
const { runNativeOccurrenceCapture } = require("../packages/component-contract-core/tests/helpers/native-occurrence-capture.cjs");
const { hostModeContract } = require("../packages/component-contract-core/tests/helpers/host-mode-contract.cjs");

for (const direction of ['remove', 'add']) for (const reset of [false, true]) for (const aliasMode of [false, true])
  test(`Apollo bundled host context: collection ${direction}, reset=${reset}, alias=${aliasMode}, exact shared verdict`, async () => {
    const f = hostModeContract(core, direction);
    const { result } = await runNativeOccurrenceCapture(async (figma, actual) => {
      const messages = []; figma.showUI = () => {}; figma.on = () => {}; figma.ui = { postMessage: m => messages.push(JSON.parse(JSON.stringify(m))) };
      vm.runInNewContext(fs.readFileSync(require.resolve('../dist/code.js'), 'utf8'), { figma, __html__: '', TextEncoder, setTimeout, clearTimeout });
      await figma.ui.onmessage({ type: 'load-contract', source: { schemaVersion: runtime.SOURCE_SCHEMA, documentType: 'component-contract-source', manual: f.manual, variantEvidence: f.evidence, dependencies: [] } });
      assert.deepEqual(messages.filter(m => m.type === 'error'), []);
      await figma.ui.onmessage({ type: 'audit', requestId: 'host-modes' });
      assert.deepEqual(messages.filter(m => m.type === 'error'), []);
      const summary = messages.find(m => m.type === 'audit-result')?.audit;
      const audit = await require("./full-audit.fixture.cjs").fullAudit(figma,messages,summary); assert(audit);
      return audit.components[0];
    }, { modeCatalogDrift: direction, modePair: direction === 'remove', aliasMode, selectedIndex: direction === 'remove' ? 0 : 1, reset });
    assert.equal(result.snapshot.instanceContentReferences.hostContextVariableModesVersion, 1);
    assert.equal(result.snapshot.nodes.filter(n => n.baselineProvenance.status === 'matched').length, 9);
    assert.deepEqual(result.result.engine, core.evaluateCompiledContract(result.snapshot, f.contract));
    assert.equal(result.result.engine.evaluations.find(e => e.ruleId.startsWith('synthetic.primary-position')).classification, reset ? 'compliant' : 'violation');
    assert.equal(result.result.coverage.executionComplete, true);
    assert.deepEqual(runtime.auditContractSnapshot(result.snapshot, f.contract).engine, result.result.engine);
  });
