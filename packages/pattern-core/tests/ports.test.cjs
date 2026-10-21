const test = require('node:test');
const assert = require('node:assert/strict');
const { verifySources, sourceReceiptMatches, prepareRequirements, checkAvailability, contractHash } = require('../dist/index.cjs');
const { makePattern, mappedPattern, makeAvailability, makeBinding, readSynthetic, sourceBytes, sha } = require('./synthetic.cjs');
const has = (result, code) => result.issues.some(issue => issue.code === code);
function request() { const b = makeBinding(); return { entryId: b.entryId, registrySha256: b.registrySha256, lock: b.lock, semanticRole: 'review.action', platform: 'desktop', target: 'frontend', requiredInputs: ['label'], requiredSlots: ['body'] }; }
test('source bytes, commit and exact IDs produce a receipt bound to the pattern', () => {
  const p = makePattern(), result = verifySources(p, readSynthetic);
  assert.equal(result.status, 'passed'); assert.equal(sourceReceiptMatches(p, result.receipt), true);
  p.revision++; assert.equal(sourceReceiptMatches(p, result.receipt), false);
});
test('source drift, unreadable sources and repository pin drift fail', () => {
  const p = makePattern();
  for (const [read, code] of [
    [ref => ({ bytes: Buffer.concat([sourceBytes, Buffer.from('drift')]), commit: ref.commit }), 'SOURCE_HASH'],
    [() => { throw Error('unavailable'); }, 'SOURCE_UNAVAILABLE'],
    [() => ({ bytes: sourceBytes, commit: '3'.repeat(40) }), 'SOURCE_COMMIT'],
  ]) { const result = verifySources(p, read); assert.equal(result.status, 'failed'); assert.ok(has(result, code)); assert.equal(result.receipt, undefined); }
});
test('a rule prefix is not proof of the exact source RuleID', () => {
  const p = makePattern(), bytes = Buffer.from(sourceBytes.toString().replace('review-choice', 'review-choice-extra'));
  p.sources[0].sha256 = sha(bytes);
  const result = verifySources(p, ref => ({ bytes, commit: ref.commit })); assert.ok(has(result, 'SOURCE_RULE_ID'));
});
test('the exact pattern identity must be present in the pinned source', () => {
  const p = makePattern(), bytes = Buffer.from(sourceBytes.toString().replace('ptrn:synthetic.review', 'ptrn:synthetic.other'));
  p.sources[0].sha256 = sha(bytes);
  assert.ok(has(verifySources(p, ref => ({ bytes, commit: ref.commit })), 'SOURCE_PATTERN_ID'));
});
test('example fences do not establish a normative rule or pattern identity', () => {
  const p = makePattern(), bytes = Buffer.from('```text\n' + sourceBytes.toString() + '```\n');
  p.sources[0].sha256 = sha(bytes);
  const result = verifySources(p, ref => ({ bytes, commit: ref.commit }));
  assert.ok(has(result, 'SOURCE_PATTERN_ID')); assert.ok(has(result, 'SOURCE_RULE_ID'));
});
test('shorter fences and indented example IDs cannot prove source declarations', () => {
  for (const text of ['````text\n```\n' + sourceBytes.toString() + '````\n', sourceBytes.toString().split('\n').map(line => '    ' + line).join('\n')]) {
    const p = makePattern(), bytes = Buffer.from(text); p.sources[0].sha256 = sha(bytes);
    const result = verifySources(p, ref => ({ bytes, commit: ref.commit }));
    assert.ok(has(result, 'SOURCE_PATTERN_ID')); assert.ok(has(result, 'SOURCE_RULE_ID'));
  }
});
test('corrupt, stale and missing source receipts are not accepted', () => {
  const p = makePattern(), receipt = verifySources(p, readSynthetic).receipt;
  assert.equal(sourceReceiptMatches(p, undefined), false);
  assert.equal(sourceReceiptMatches(p, { ...receipt, receiptSha256: '0'.repeat(64) }), false);
  assert.equal(sourceReceiptMatches(p, { ...receipt, sources: [] }), false);
});
test('confirmed synthetic arui-private mapping passes both explicitly supported targets', () => {
  for (const target of ['figma', 'frontend']) assert.equal(checkAvailability({ ...request(), target }, () => makeAvailability()).status, 'passed');
});
for (const [name, mutate, code] of [
  ['another UI library', e => e.code.package = '@alfalab/core-components', 'REGISTRY_EVIDENCE'],
  ['unconfirmed mapping', e => e.status = 'draft', 'REGISTRY_EVIDENCE'],
  ['stale registry hash', e => e.registrySha256 = 'd'.repeat(64), 'STALE_REGISTRY'],
  ['different entry identity', e => e.entryId = 'different', 'STALE_REGISTRY'],
  ['stale contract revision', e => e.lock.revision++, 'STALE_COMPONENT_LOCK'],
  ['stale contract hash', e => e.lock.contractSha256 = 'e'.repeat(64), 'STALE_COMPONENT_LOCK'],
  ['different representation', e => e.lock.representationId = 'different', 'STALE_COMPONENT_LOCK'],
  ['unsupported platform', e => e.platforms = ['mobileweb'], 'PLATFORM_UNAVAILABLE'],
  ['unsupported target', e => e.targets = ['figma'], 'TARGET_UNAVAILABLE'],
  ['unsupported semantic role', e => e.semanticRoles = ['different.role'], 'ROLE_UNAVAILABLE'],
  ['unsupported property', e => e.inputs = [], 'INPUT_UNAVAILABLE'],
  ['unsupported slot', e => e.slots = [], 'SLOT_UNAVAILABLE'],
  ['missing source file evidence', e => e.code.files = [], 'REGISTRY_EVIDENCE'],
  ['missing independent acceptance states', e => delete e.readiness, 'REGISTRY_EVIDENCE'],
]) test('availability rejects ' + name, () => { const e = makeAvailability(); mutate(e); const result = checkAvailability(request(), () => e); assert.equal(result.status, 'failed'); assert.ok(has(result, code)); });
test('missing export, failed resolver and absent registry have distinct outcomes', () => {
  assert.ok(has(checkAvailability(request(), () => null), 'EXPORT_UNAVAILABLE'));
  assert.ok(has(checkAvailability(request(), () => { throw Error('failure'); }), 'REGISTRY_UNAVAILABLE'));
  assert.equal(checkAvailability(request()).status, 'unresolved');
});
test('Apollo semantic requirements preserve provenance while remaining non-executable drafts', () => {
  const p = mappedPattern(), sourceReceipt = verifySources(p, readSynthetic).receipt;
  const result = prepareRequirements(p, { needsReview: true, platform: 'desktop' }, { platform: 'desktop', target: 'frontend', sourceReceipt, availability: () => makeAvailability() });
  assert.equal(result.status, 'draft'); const r = result.requirements;
  assert.equal(r.consumer, 'apollo-v4'); assert.equal(r.sourceVerification, 'passed'); assert.equal(r.availability.status, 'passed');
  assert.equal(r.executionAllowed, false); assert.equal(r.patternLock.contractSha256, contractHash(p));
  assert.equal(r.outcomes[0].entryStateId, 'reviewing'); assert.equal(r.decisions[0].rowId, 'review');
  assert.equal(r.compositions[0].roles[1].semanticRole, 'review.action');
  assert.equal(r.availability.evidence[0].readiness.fullContractParity, 'not-confirmed');
  assert.equal(r.availability.evidence[0].readiness.liveAcceptance, 'not-run');
  assert.equal(r.availability.evidence[0].readiness.contractCoverage, 'not-verified');
});
test('unresolved roles stay unresolved without fabricated exports', () => {
  const result = prepareRequirements(makePattern(), { needsReview: true, platform: 'desktop' }, { platform: 'desktop', target: 'figma' });
  assert.equal(result.requirements.availability.status, 'unresolved'); assert.equal(result.requirements.sourceVerification, 'unverified'); assert.equal(result.requirements.executionAllowed, false);
  assert.equal(result.requirements.availability.evidence.length, 0);
});
test('a route with no UI roles does not inherit availability failures from inactive compositions', () => {
  const result = prepareRequirements(makePattern(), { needsReview: false, platform: 'desktop' }, { platform: 'desktop', target: 'frontend' });
  assert.equal(result.requirements.compositions.length, 0); assert.equal(result.requirements.availability.status, 'passed'); assert.equal(has(result, 'ROLE_UNRESOLVED'), false);
});
test('plan preparation rejects missing context and contradictory platform', () => {
  const missing = prepareRequirements(makePattern(), { platform: 'desktop' }, { platform: 'desktop', target: 'figma' });
  assert.equal(missing.status, 'unresolved'); assert.deepEqual(missing.missing, ['needsReview']);
  assert.equal(prepareRequirements(makePattern(), { needsReview: true, platform: 'desktop' }, { platform: 'mobileweb', target: 'figma' }).status, 'invalid');
});
test('failed preflight is carried to the consumer and never allows execution', () => {
  const result = prepareRequirements(mappedPattern(), { needsReview: true, platform: 'desktop' }, { platform: 'desktop', target: 'frontend', availability: () => null });
  assert.equal(result.requirements.availability.status, 'failed'); assert.ok(has(result, 'EXPORT_UNAVAILABLE')); assert.equal(result.requirements.executionAllowed, false);
});
