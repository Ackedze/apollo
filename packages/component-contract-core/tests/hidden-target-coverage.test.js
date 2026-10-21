const test = require('node:test'), assert = require('node:assert/strict'), core = require('../dist/core.cjs');
const {fixture:baseFixture, configure, clone} = require('./helpers/declared-target-configuration.cjs');
const options = {hiddenTargetCoverageVersion:1};
function fixture() {
  const f = baseFixture(core); Object.assign(f.snapshot.source.captureTopology, {limitReached:false,issues:[]}); return f;
}
function run(f, opt = options) {
  const compiled = f.compile(), engine = core.evaluateCompiledContract(f.snapshot, compiled.contract);
  return {engine, report:core.buildEditorValidationReport(engine, compiled, f.manual, f.snapshot, opt)};
}
test('proven hidden native child is inapplicable in the new report; raw and legacy reports stay unchanged', () => {
  const f = fixture(); configure(f, 'Default', false); const before = clone(f.snapshot);
  const old = run(f), current = run(f);
  // Passing no options retains the historical report API.
  const legacy = core.buildEditorValidationReport(old.engine, f.compile(), f.manual, f.snapshot);
  assert.equal(legacy.scenarioCoverage.notExecuted, 1);
  assert.equal(current.report.scenarioCoverage.notExecuted, 0);
  assert.equal(current.report.scenarioCoverage.complete, true);
  assert.equal(current.report.scenarioCoverage.hiddenTargetCoverageVersion, 1);
  assert.equal(current.report.evaluations.find(e => e.ruleId === 'synthetic.font-size.1.1').origin, 'editor-hidden-target-scope');
  assert.deepEqual(current.engine, old.engine); assert.deepEqual(f.snapshot, before);
});
test('hidden to visible restores font checking; font negative and RESET remain effective', () => {
  const f = fixture(); configure(f, 'Default', false);
  assert.equal(run(f).report.scenarioCoverage.notExecuted, 0);
  configure(f, 'Default', true); f.snapshot.nodes[2].text.fontSize = 18;
  assert.equal(run(f).report.evaluations.find(e => e.ruleId === 'synthetic.font-size.1.1').classification, 'violation');
  f.snapshot.nodes[2].text.fontSize = 16;
  assert(run(f).report.evaluations.every(e => e.classification === 'compliant'));
});
test('required quantity still violates when the independently resolved title is hidden', () => {
  const f = fixture(); f.manual.rules[0].constraints[0].min = 1; configure(f, 'Default', false);
  const {engine, report} = run(f);
  assert.equal(engine.evaluations.find(e => e.ruleId === 'synthetic.title-required.1.1').classification, 'violation');
  assert.equal(report.evaluations.find(e => e.ruleId === 'synthetic.title-required.1.1').classification, 'violation');
  assert.equal(report.scenarioCoverage.notExecuted, 0);
});
for (const [name, mutate] of [
  ['missing reference', f => {delete f.snapshot.variantReference;}],
  ['stale reference', f => {f.snapshot.variantReference.definedProperties.push('invented');}],
  ['foreign owner', f => {f.snapshot.nodes[2].component.sourceIdentity.ownerComponentKey = 'foreign';}],
  ['missing child', f => {f.snapshot.nodes.pop(); f.snapshot.nodes[1].childIds = [];}],
  ['unknown visibility', f => {delete f.snapshot.nodes[1].visible;}],
  ['truncated capture', f => {f.snapshot.source.truncated = true;}],
  ['incomplete topology', f => {f.snapshot.source.captureTopology.complete = false;}],
  ['duplicate native match', f => {const n = clone(f.snapshot.nodes[2]); n.id = 'copy'; f.snapshot.nodes.push(n); f.snapshot.nodes[1].childIds.push('copy');}],
  ['forged ledger', f => {delete f.snapshot.variantReference; f.snapshot.declaredTargetIdentitiesV1 = {targets:[{targetId:'title.target',status:'resolved',present:true,effectiveVisible:false,nodeId:'text'}]};}],
]) test('hidden coverage cannot excuse ' + name, () => {
  const f = fixture(); configure(f, 'Default', false); mutate(f);
  const {report} = run(f);
  assert.equal(report.scenarioCoverage.complete, false);
  assert(!report.evaluations.some(e => e.origin === 'editor-hidden-target-scope'));
});
test('a differing or missing hidden visibility baseline remains an uncovered check', () => {
  for (const baseline of [true, undefined]) {
    const f = fixture(); configure(f, 'Default', false); f.snapshot.nodes[2].visible = false;
    f.manual.rules[1].capability = 'visibility'; f.manual.rules[1].constraints = [{type:'propertyForbidden',fact:'visible'}];
    if (baseline !== undefined) f.snapshot.nodes[2].baseline.effective.visible = baseline;
    assert.equal(run(f).report.scenarioCoverage.notExecuted, 1);
  }
});
test('known matching hidden visibility baseline is excluded without declaring compliance', () => {
  const f = fixture(); configure(f, 'Default', false); f.snapshot.nodes[2].visible = false;
  f.snapshot.nodes[2].baseline.effective.visible = false;
  f.manual.rules[1].capability = 'visibility'; f.manual.rules[1].constraints = [{type:'propertyForbidden',fact:'visible'}];
  const {report} = run(f);
  assert.equal(report.scenarioCoverage.notExecuted, 0);
  assert.equal(report.evaluations.find(e => e.ruleId === 'synthetic.font-size.1.1').classification, 'not-applicable');
});
test('a hidden anchor cannot exclude an entire descendant scope', () => {
  const f = fixture(); configure(f, 'Default', false); f.manual.rules[1].targetScope = 'self-and-descendants';
  assert.equal(run(f).report.scenarioCoverage.notExecuted, 1);
});
test('unsupported diagnostic version retains historical gaps', () => {
  const f = fixture(); configure(f, 'Default', false);
  assert.equal(run(f, {hiddenTargetCoverageVersion:2}).report.scenarioCoverage.notExecuted, 1);
});
