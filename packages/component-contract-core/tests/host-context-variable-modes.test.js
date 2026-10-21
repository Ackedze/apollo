const test = require('node:test'), assert = require('node:assert/strict');
const core = require('../dist/core.cjs'), { captureInstanceAudit } = require('../dist/capture.cjs');
const { runNativeOccurrenceCapture } = require('./helpers/native-occurrence-capture.cjs');
const { hostModeContract } = require('./helpers/host-mode-contract.cjs');
const clone = x => JSON.parse(JSON.stringify(x));
const invoke = async (figma, actual, request) => { global.figma = figma; try { return await captureInstanceAudit(actual, request); } finally { delete global.figma; } };
const sample = async (direction = 'remove', reset = false) => clone((await runNativeOccurrenceCapture(invoke,
  { modeCatalogDrift: direction, modePair: direction === 'remove', selectedIndex: direction === 'remove' ? 0 : 1, reset })).result.snapshot);

for (const direction of ['remove', 'add']) for (const reset of [false, true])
  test(`independent stages handle collection ${direction}, reset=${reset}, without approving the position change`, async () => {
    const snapshot = await sample(direction, reset), before = clone(snapshot), f = hostModeContract(core, direction);
    assert.equal(snapshot.instanceContentReferences.hostContextVariableModesVersion, 1);
    assert.equal(snapshot.nodes.filter(n => n.baselineProvenance.status === 'matched').length, 9);
    const engine = core.evaluateCompiledContract(snapshot, f.contract);
    const rule = engine.evaluations.find(e => e.ruleId.startsWith('synthetic.primary-position'));
    assert(rule); assert.equal(rule.classification, reset ? 'compliant' : 'violation', JSON.stringify(rule));
    const prepared = core.prepareValidationSnapshot(snapshot, f.contract);
    assert(prepared.instanceContentResults.every(r => r.status === 'matched'));
    assert.deepEqual(snapshot, before);
    assert.deepEqual(core.prepareValidationSnapshot(prepared, f.contract), prepared);
  });

for (const [name, edit, reason] of [
  ['used mode changes', n => { n.variable.modes['8'.repeat(40)] = 'dark'; n.resolvedModes['shared-collection'] = 'dark'; }, 'host-context-changed'],
  ['binding changes', n => { n.variable.bindings.width.tokenIds = ['different-token']; n.hostVariableUsageV1.bindings['different-token'] = n.hostVariableUsageV1.bindings['shared-token']; }, 'host-context-changed'],
  ['paint changes', n => { n.appearance.opacity = .2; }, 'host-context-changed'],
  ['layout changes', n => { n.layout.mode = 'HORIZONTAL'; }, 'host-context-changed'],
  ['style changes', n => { n.appearance.typography = { styleId: 'changed-style' }; }, 'host-context-changed'],
  ['relevant catalog changes', n => { n.variable.modeCatalog['8'.repeat(40)].collectionName = 'Changed'; }, 'host-context-changed'],
  ['required raw mode is missing', n => { delete n.resolvedModes['shared-collection']; }, 'host-context-variable-evidence-incomplete'],
  ['topology changes', n => { n.childIds.push('missing-node'); }, undefined],
  ['identity changes', n => { n.component.identity.componentKey = 'foreign'; }, undefined],
  ['required catalog disappears', n => { delete n.variable.modeCatalog['8'.repeat(40)]; }, 'host-context-variable-evidence-incomplete'],
  ['required mode disappears', n => { delete n.variable.modes['8'.repeat(40)]; }, 'host-context-variable-evidence-incomplete'],
  ['mode remains unknown', n => { n.unknownFacts.push('variable.modes.' + '8'.repeat(40)); }, 'host-context-variable-evidence-incomplete'],
  ['usage lookup fails', n => { n.hostVariableUsageV1.complete = false; }, 'host-context-variable-evidence-incomplete'],
  ['usage evidence missing', n => { delete n.hostVariableUsageV1; }, 'host-context-variable-evidence-incomplete'],
]) test('host guard preserves uncertainty: ' + name, async () => {
  const snapshot = await sample(), reference = snapshot.instanceContentReferences.attempts[0].reference;
  const node = reference.nodes.find(n => n.hostVariableUsageV1?.bindings['shared-token']); edit(node);
  core.materializeInstanceContentReferences(snapshot);
  assert(snapshot.instanceContentResults.some(r => r.status === 'unresolved'));
  if (reason) assert(snapshot.instanceContentResults.some(r => r.reason === reason));
});

test('the supplied mode context is still exact and cannot be replaced by a catalog default', async () => {
  const snapshot = await sample();
  snapshot.instanceContentReferences.attempts[0].reference.context.modes['shared-collection'] = 'dark';
  core.materializeInstanceContentReferences(snapshot);
  assert.equal(snapshot.instanceContentResults[0].reason, 'replacement-reference-incomplete');
});

test('unmarked historical stages retain their original gap; unsupported opt-ins never fall back', async () => {
  const historical = await sample(); delete historical.instanceContentReferences.hostContextVariableModesVersion;
  core.materializeInstanceContentReferences(historical);
  assert.equal(historical.instanceContentResults[0].reason, 'host-context-changed');
  const unknown = await sample(); unknown.instanceContentReferences.hostContextVariableModesVersion = 2;
  core.materializeInstanceContentReferences(unknown);
  assert.equal(unknown.instanceContentResults[0].reason, 'host-context-mode-version-unsupported');
});

test('binding collection capture includes mixed text/paint/effect aliases and records unavailable lookups', async () => {
  const node = { type: 'TEXT', boundVariables: { width: { type: 'VARIABLE_ALIAS', id: 'layout-token' } },
    effects: [{ boundVariables: { radius: { type: 'VARIABLE_ALIAS', id: 'effect-token' } } }],
    getStyledTextSegments: () => [{ fills: [{ boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'range-token' } } }] }] };
  const resolve = async id => id === 'effect-token' ? undefined : { collectionId: 'shared-collection', collectionKey: '8'.repeat(40), referencedVariableIds: [] };
  const usage = await core.captureHostVariableUsage(node, resolve);
  assert.equal(usage.complete, false); assert.deepEqual(Object.keys(usage.bindings), ['layout-token', 'range-token']);
});


test('an indirect alias collection remains relevant even when its resolved visual value agrees', async () => {
  const {result} = await runNativeOccurrenceCapture(invoke, {modeCatalogDrift:'remove',modePair:true,selectedIndex:0,aliasMode:true});
  const snapshot = result.snapshot;
  assert.equal(result.matchedBaselineNodes,9);
  const reference = snapshot.instanceContentReferences.attempts[0].reference;
  const node = reference.nodes.find(n => n.hostVariableUsageV1?.bindings['alias-token']);
  assert(node); assert.deepEqual(node.hostVariableUsageV1.bindings['shared-token'].referencedVariableIds,['alias-token']);
  node.variable.modes['7'.repeat(40)] = 'dark'; node.resolvedModes['indirect-collection'] = 'dark';
  core.materializeInstanceContentReferences(snapshot);
  assert.equal(snapshot.instanceContentResults[0].reason,'host-context-changed');
});

test('unresolved alias chains and cycles never prove complete collection usage', async () => {
  const node = {type:'FRAME',boundVariables:{width:{type:'VARIABLE_ALIAS',id:'a'}},resolvedVariableModes:{shared:'light'}};
  const resolve = async id => ({collectionId:'shared',collectionKey:'8'.repeat(40),referencedVariableIds:[id==='a'?'b':'a']});
  const cycle = await core.captureHostVariableUsage(node,resolve); assert.equal(cycle.complete,false);
  const missing = await core.captureHostVariableUsage(node,async id => id==='a'?resolve(id):undefined); assert.equal(missing.complete,false);
});


test('replay rejects a claimed complete usage graph with a cyclic alias', async () => {
  const snapshot = await sample(), reference = snapshot.instanceContentReferences.attempts[0].reference;
  const node = reference.nodes.find(n => n.hostVariableUsageV1?.bindings['shared-token']);
  node.hostVariableUsageV1.bindings['shared-token'].referencedVariableIds = ['shared-token'];
  core.materializeInstanceContentReferences(snapshot);
  assert.equal(snapshot.instanceContentResults[0].reason,'host-context-variable-evidence-incomplete');
});
