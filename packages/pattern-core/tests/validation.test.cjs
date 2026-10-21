const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validatePattern, resolveDecisions, resolveTransition, patternJsonSchema } = require('../dist/index.cjs');
const { makePattern } = require('./synthetic.cjs');
const has = (result, code) => result.issues.some(issue => issue.code === code);
function rejection(name, mutate, code) {
  test(name, () => { const p = makePattern(); mutate(p); const result = validatePattern(p);
    assert.equal(result.valid, false); assert.ok(has(result, code), JSON.stringify(result.issues)); });
}
test('closed draft structure and all finite cases select the expected source-backed route', () => {
  const p = makePattern(); assert.equal(validatePattern(p).valid, true);
  for (const needsReview of [false, true]) for (const platform of ['desktop', 'mobileweb']) {
    const result = resolveDecisions(p, { needsReview, platform });
    assert.equal(result.status, 'selected'); assert.equal(result.selections[0].outcomeId, needsReview ? 'prompt' : 'complete');
  }
});
test('missing context remains unresolved; false is never treated as missing', () => {
  const result = resolveDecisions(makePattern(), { platform: 'desktop' });
  assert.equal(result.status, 'unresolved'); assert.deepEqual(result.missing, ['needsReview']); assert.deepEqual(result.selections, []);
});
test('unknown values, extra fields and wrong input types are rejected', () => {
  for (const context of [{ needsReview: 'false', platform: 'desktop' }, { needsReview: false, platform: 'unknown' },
    { needsReview: false, platform: 'desktop', guessed: true }, [], null])
    assert.equal(resolveDecisions(makePattern(), context).status, 'invalid');
});
rejection('schema version cannot be guessed', p => p.schemaVersion = 'apollo.pattern-contract.v2', 'STRUCTURE');
rejection('local validation cannot promote a draft', p => p.status = 'verified', 'STRUCTURE');
rejection('runtime props and executable component norms do not enter a pattern', p => p.componentProps = { arbitrary: true }, 'STRUCTURE');
rejection('invalid calendar dates fail', p => p.metadata.authoredAt = '2026-02-30', 'DATE');
rejection('boolean conditions cannot use string values', p => p.decisionTables[0].rows[0].when.needsReview.value = 'false', 'CONDITION_TYPE');
rejection('table columns cannot hide an implicit wildcard', p => delete p.decisionTables[0].rows[0].when.platform, 'TABLE_COLUMNS');
rejection('overlapping decisions fail even with distinct row identities', p => { const row = structuredClone(p.decisionTables[0].rows[0]); row.id = 'overlap'; p.decisionTables[0].rows.push(row); }, 'TABLE_OVERLAP');
rejection('uncovered context combinations fail', p => p.decisionTables[0].rows.pop(), 'TABLE_INCOMPLETE');
rejection('undeclared decision outcomes fail', p => p.decisionTables[0].rows[0].outcomeId = 'invented', 'OUTCOME_REFERENCE');
rejection('duplicate context IDs fail', p => p.context.fields.push(structuredClone(p.context.fields[0])), 'DUPLICATE_ID');
rejection('unbounded finite case growth fails explicitly', p => {
  p.context.fields[1].values = Array.from({ length: 32 }, (_, i) => 'platform' + i);
  for (let i = 0; i < 8; i++) p.context.fields.push({ id: 'input' + i, type: 'boolean', description: 'Synthetic input.' });
}, 'CONTEXT_LIMIT');
rejection('evidence must resolve to the declared source/rule', p => p.outcomes[0].evidence[0].ruleId = 'rule:synthetic.missing', 'EVIDENCE_REFERENCE');
rejection('source paths cannot escape a repository', p => p.sources[0].path = '../private.md', 'STRUCTURE');
rejection('composition parent cycles fail', p => p.compositions[0].roles[0].parentId = 'action', 'COMPOSITION_CYCLE');
rejection('UI role cannot silently substitute a semantic region', p => delete p.compositions[0].roles[1].binding, 'ROLE_BINDING');
rejection('impossible cardinality fails', p => p.compositions[0].roles[1].minimum = 2, 'CARDINALITY');
rejection('state references are closed', p => p.scenario.transitions[0].target.stateId = 'missing', 'STATE_REFERENCE');
rejection('a composition cannot activate in an invented state', p => p.compositions[0].activeStates = ['missing'], 'STATE_REFERENCE');
rejection('an outcome must be reachable under the context that selects it', p => p.scenario.transitions[1].when = { needsReview: { op: 'eq', value: false } }, 'OUTCOME_ENTRY_UNREACHABLE');
rejection('events cannot be invented by a transition', p => p.scenario.transitions[0].eventId = 'missing', 'EVENT_REFERENCE');
rejection('terminal states cannot silently restart a scenario', p => p.scenario.transitions[0].from = 'completed', 'TERMINAL_TRANSITION');
rejection('ambiguous event routes fail', p => { const t = structuredClone(p.scenario.transitions[0]); t.id = 'ambiguous'; p.scenario.transitions.push(t); }, 'TRANSITION_OVERLAP');
rejection('a nonblocking gap cannot carry unknown product behavior', p => p.gaps[1].blocking = false, 'GAP_REFERENCE');
rejection('failure gaps cannot prescribe invented retry effects', p => p.scenario.transitions[3].actions.push({ id: 'guessed-retry', evidence: p.outcomes[0].evidence }), 'TRANSITION_BASIS');
rejection('check routes must address a declared subject', p => p.constraints[0].subjectId = 'missing', 'CHECK_ROUTE');
test('declared event sequence resolves and unknown failure stops at a product question', () => {
  const p = makePattern(), context = { needsReview: true, platform: 'desktop' };
  const first = resolveTransition(p, context, { stateId: 'initial', eventId: 'start', outcomeId: 'prompt' });
  assert.equal(first.status, 'resolved'); assert.equal(first.stateId, 'reviewing');
  const final = resolveTransition(p, context, { stateId: first.stateId, eventId: 'confirm', outcomeId: 'prompt' });
  assert.equal(final.status, 'resolved'); assert.equal(final.stateId, 'completed');
  const failure = resolveTransition(p, context, { stateId: 'reviewing', eventId: 'failed', outcomeId: 'prompt' });
  assert.equal(failure.status, 'unresolved'); assert.equal(failure.gapId, 'product-gap'); assert.equal(failure.stateId, undefined); assert.equal(failure.actions, undefined);
});
test('an event without a route never invents navigation or stay behavior', () => {
  const result = resolveTransition(makePattern(), { needsReview: true, platform: 'desktop' }, { stateId: 'initial', eventId: 'confirm', outcomeId: 'prompt' });
  assert.equal(result.status, 'unresolved'); assert.ok(has(result, 'TRANSITION_UNDEFINED'));
});
test('transition cannot use an outcome that is not selected by current context', () => {
  assert.equal(resolveTransition(makePattern(), { needsReview: false, platform: 'desktop' }, { stateId: 'initial', eventId: 'start', outcomeId: 'prompt' }).status, 'invalid');
});
test('published JSON Schema is reproducible and preserves the closed draft vocabulary', () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, '../schemas/pattern-contract.v1-draft.schema.json'))), patternJsonSchema);
  assert.equal(patternJsonSchema.additionalProperties, false); assert.equal(patternJsonSchema.properties.status.const, 'draft');
  assert.equal(patternJsonSchema.properties.schemaVersion.const, 'apollo.pattern-contract.v1-draft');
  assert.equal(patternJsonSchema.properties.decisionTables.items.properties.hitPolicy.const, 'unique');
  assert.equal(patternJsonSchema.properties.scenario.properties.transitions.items.properties.basis.enum.includes('gap-route'), true);
});
