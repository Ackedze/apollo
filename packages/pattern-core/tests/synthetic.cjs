// All component names, policy text, IDs, commits and mapping pins here are synthetic.
const { createHash } = require('node:crypto');
const sourceBytes = Buffer.from('# Synthetic policy\n- patternId: ptrn:synthetic.review\n- ruleId: rule:synthetic.review-choice\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const h = letter => letter.repeat(64);
const evidence = [{ sourceId: 'synthetic-source', ruleId: 'rule:synthetic.review-choice' }];
function makePattern() {
  return structuredClone({
    schemaVersion: 'apollo.pattern-contract.v1-draft', documentType: 'pattern-contract',
    patternId: 'ptrn:synthetic.review', revision: 1, status: 'draft',
    metadata: { title: 'Synthetic authoring example', owner: 'Example owner', authoredAt: '2026-10-05', frameworkVersion: '0.1.0-draft.1' },
    outcome: { userGoal: 'Review a synthetic choice.', successCriteria: ['Complete the selected route.'] },
    sources: [{ id: 'synthetic-source', repository: 'synthetic', path: 'patterns/synthetic.md',
      commit: '1'.repeat(40), sha256: sha(sourceBytes), patternId: 'ptrn:synthetic.review', ruleIds: ['rule:synthetic.review-choice'] }],
    context: { fields: [{ id: 'needsReview', type: 'boolean', description: 'Explicit synthetic input.' },
      { id: 'platform', type: 'enum', values: ['desktop', 'mobileweb'], description: 'Synthetic platform.' }] },
    decisionTables: [{ id: 'review-table', inputs: ['needsReview', 'platform'], hitPolicy: 'unique', coverage: 'complete', rows: [
      { id: 'no-review', when: { needsReview: { op: 'eq', value: false }, platform: { op: 'any' } }, outcomeId: 'complete', evidence },
      { id: 'review', when: { needsReview: { op: 'eq', value: true }, platform: { op: 'any' } }, outcomeId: 'prompt', evidence },
    ] }],
    outcomes: [{ id: 'complete', description: 'Complete.', compositionIds: [], entryStateId: 'completed', evidence },
      { id: 'prompt', description: 'Review.', compositionIds: ['prompt-composition'], entryStateId: 'reviewing', evidence }],
    compositions: [{ id: 'prompt-composition', activeStates: ['reviewing'], roles: [
      { id: 'root', semanticRole: 'review.region', parentId: null, order: 0, kind: 'region', minimum: 1, maximum: 1, evidence },
      { id: 'action', semanticRole: 'review.action', parentId: 'root', order: 0, kind: 'ui-component', minimum: 1, maximum: 1,
        binding: { kind: 'unresolved', gapId: 'mapping-gap' }, evidence },
    ] }],
    scenario: {
      states: [{ id: 'initial', kind: 'initial', description: 'Start.' }, { id: 'reviewing', kind: 'active', description: 'Review.' }, { id: 'completed', kind: 'terminal', description: 'Done.' }],
      events: [{ id: 'start', origin: 'user', description: 'Start.' }, { id: 'confirm', origin: 'user', description: 'Confirm.' }, { id: 'failed', origin: 'product', description: 'Unknown result.' }],
      transitions: [
        { id: 'skip-review', from: 'initial', eventId: 'start', outcomeIds: ['complete'], when: {}, basis: 'source-formalization', target: { stateId: 'completed' }, actions: [], evidence },
        { id: 'begin-review', from: 'initial', eventId: 'start', outcomeIds: ['prompt'], when: {}, basis: 'source-formalization', target: { stateId: 'reviewing' }, actions: [], evidence },
        { id: 'confirm-review', from: 'reviewing', eventId: 'confirm', outcomeIds: ['prompt'], when: {}, basis: 'source-formalization', target: { stateId: 'completed' }, actions: [{ id: 'complete-review', evidence }], evidence },
        { id: 'unknown-result', from: 'reviewing', eventId: 'failed', outcomeIds: ['prompt'], when: {}, basis: 'gap-route', target: { gapId: 'product-gap' }, actions: [], evidence },
      ],
    },
    constraints: [{ id: 'choice-check', statement: 'Select exactly one synthetic route.', ownership: 'pattern-context', route: 'decision-table', subjectId: 'review-table', evidence }],
    gaps: [{ id: 'mapping-gap', area: 'availability', blocking: true, question: 'Which mapping is confirmed?', owner: 'Example owner' },
      { id: 'product-gap', area: 'product', blocking: true, question: 'What happens on failure?', owner: 'Example owner' }],
  });
}
function makeBinding() {
  return { kind: 'registry', entryId: 'synthetic-review-export', registrySha256: h('a'),
    lock: { contractId: 'synthetic.review-action', revision: 1, contractSha256: h('b'), representationId: 'synthetic.review-action.desktop' },
    requiredInputs: ['label'], requiredSlots: ['body'] };
}
function mappedPattern() { const p = makePattern(); p.compositions[0].roles[1].binding = makeBinding(); return p; }
function makeAvailability() {
  const binding = makeBinding();
  return { entryId: binding.entryId, status: 'confirmed', registrySha256: binding.registrySha256,
    code: { package: 'arui-private', version: '0.0.0-synthetic', commit: '2'.repeat(40),
      subpath: 'arui-private/synthetic-review-fixture', exportName: 'SyntheticReviewFixture',
      files: [{ path: 'src/synthetic-review-fixture/index.ts', sha256: h('c') }] },
    lock: binding.lock, platforms: ['desktop'], targets: ['figma', 'frontend'], semanticRoles: ['review.action'], inputs: ['label'], slots: ['body'],
    readiness: { apiMapping: 'confirmed-source-api', contractCoverage: 'not-verified', fullContractParity: 'not-confirmed',
      codeRepresentation: 'proposed-for-authoring', builtPackage: 'not-built-in-checkout', liveAcceptance: 'not-run', release: 'not-released' } };
}
const readSynthetic = ref => ({ bytes: sourceBytes, commit: ref.commit });
module.exports = { makePattern, makeAvailability, makeBinding, mappedPattern, sourceBytes, readSynthetic, sha };
