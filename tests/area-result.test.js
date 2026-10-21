const test = require('node:test'), assert = require('node:assert/strict');
const api = require("../dist/runtime.cjs"), fixtures = require("./authoring-fixtures");
function components() {
  const result = api.auditContractSnapshot(fixtures.snapshot(), api.loadAuthoringSource(fixtures.source()).contract);
  return [{ scopeId: 'one', name: 'One', result }, { scopeId: 'two', name: 'Two', result }];
}
test('area aggregation keeps classifications and original IDs with distinct occurrence and scope identities', () => {
  const items = components(), before = JSON.stringify(items);
  const result = api.aggregateAreaResult(items, [], { complete: true, components: [{}, {}] });
  assert.equal(result.coverage.executionComplete, true); assert.equal(result.engine.evaluations.length, 2);
  assert.equal(new Set(result.engine.evaluations.map(e => e.evaluationId)).size, 2);
  for (const [index, entry] of result.engine.evaluations.entries()) {
    assert.equal(entry.componentScopeId, items[index].scopeId);
    assert.equal(entry.componentEvaluationId, items[index].result.engine.evaluations[0].evaluationId);
    assert.equal(entry.classification, items[index].result.engine.evaluations[0].classification);
  }
  assert.equal(JSON.stringify(items), before);
});
test('missing contracts, incomplete components, scan limits and empty areas cannot report complete coverage', () => {
  const items = components(), selection = { complete: true, components: [{}, {}] };
  assert.equal(api.aggregateAreaResult(items, [{}], selection).coverage.executionComplete, false);
  assert.equal(api.aggregateAreaResult(items, [], Object.assign({}, selection, { complete: false })).coverage.executionComplete, false);
  assert.equal(api.aggregateAreaResult([], [], selection).coverage.executionComplete, false);
  items[0].result.coverage.executionComplete = false;
  assert.equal(api.aggregateAreaResult(items, [], selection).coverage.incompleteComponents, 2);
});
test('duplicate component scopes are rejected instead of conflating their evidence', () => {
  const items = components(); items[1].scopeId = items[0].scopeId;
  assert.throws(() => api.aggregateAreaResult(items, [], { complete: true, components: [] }), /Duplicate/);
});
