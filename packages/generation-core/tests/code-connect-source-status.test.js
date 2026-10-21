const test = require('node:test');
const assert = require('node:assert/strict');
const { currentFixture } = require('./current-producer-fixtures.cjs');
const { hash } = require('./planning-fixtures.cjs');
const g = require('../dist/planning.cjs');

function splitFixture(sourceStatus = 'draft', compiledStatus = 'ready') {
  const f = currentFixture();
  const input = f.raw.currentInputs.packages[1];
  const mapping = f.raw.mappings[1];
  input.sourcePredicateStatus = sourceStatus;
  input.compiledStatus = compiledStatus;
  mapping.contract.sourcePredicateStatus = mapping.status.sourcePredicate = sourceStatus;
  mapping.contract.compiledStatus = compiledStatus;
  f.context.view.components[1].sourceStatus = sourceStatus;
  f.resign();
  return f;
}

const verify = f => g.verifyCodeConnectInputs(f.raw, f.lock, hash);
const normalize = f => g.normalizeCodeConnect(f.raw, f.lock, f.context.view, ['content', 'group'], hash);

test('current producer retains equal statuses and observes scoped compiled Ready with Source Draft', () => {
  for (const [sourceStatus, compiledStatus] of [['ready', 'ready'], ['draft', 'draft'], ['draft', 'ready']]) {
    const f = splitFixture(sourceStatus, compiledStatus);
    const before = JSON.stringify({ registry: f.raw, lock: f.lock });
    verify(f);
    assert.equal(JSON.stringify({ registry: f.raw, lock: f.lock }), before);
  }
});

test('Source Ready cannot conceal compiled Draft even with matching producer mapping and recomputed lock', () => {
  const f = splitFixture('ready', 'draft');
  assert.throws(() => verify(f), /PRODUCER_CODE_EVIDENCE_INVALID/);
});

test('scoped compiled Ready retains Source Draft and all unaccepted code/native assurances', () => {
  const f = splitFixture();
  const registry = normalize(f);
  const input = registry.source.producerInputs.currentInputs.packages[1];
  assert.equal(input.compiledStatus, 'ready');
  assert.equal(input.sourcePredicateStatus, 'draft');
  assert.equal(Object.isFrozen(input), true);
  assert.equal(registry.entries[1].assurance.codeRepresentation, 'draft');
  assert.equal(registry.entries[1].assurance.fullContractParity, 'not-confirmed');
  assert.equal(registry.entries[1].assurance.liveAcceptance, 'not-run');
  assert.equal(registry.entries[1].assurance.release, 'not-released');
  assert.equal(registry.entries[1].generationProfileId, undefined);
  assert.equal(registry.entries[1].figma.handlerId, '');
  f.context.registry = registry;
  f.context.code = g.codeObservationFromProducer(registry);
  const plan = g.createCompositionPlan(f.spec, f.context, hash);
  const result = g.preflightPlan(plan, f.context, hash);
  assert.equal(result.sourceReadiness, 'blocked');
  assert.equal(result.targets.figma, 'blocked');
  assert.equal(result.targets.frontend, 'blocked');
  assert.ok(result.diagnostics.some(d => d.code === 'SOURCE_NOT_READY'));
  assert.ok(result.diagnostics.some(d => d.code === 'CODE_PROFILE_UNACCEPTED'));
});

test('missing, unknown or malformed source/compiled statuses fail even with recomputed producer pins', () => {
  for (const field of ['sourcePredicateStatus', 'compiledStatus']) {
    for (const value of [undefined, null, '', 'Ready', 'accepted', true, 1, {}, []]) {
      const f = splitFixture();
      f.raw.currentInputs.packages[1][field] = value;
      if (value === undefined) delete f.raw.currentInputs.packages[1][field];
      f.resign();
      assert.throws(() => verify(f), /PRODUCER_CURRENT_INPUTS_INVALID|PRODUCER_CODE_EVIDENCE_INVALID/);
    }
  }
});

test('source promotion in the mapping or view cannot be borrowed from compiled Ready', () => {
  for (const mutate of [
    f => f.raw.mappings[1].status.sourcePredicate = 'ready',
    f => f.raw.mappings[1].contract.sourcePredicateStatus = 'ready',
    f => f.raw.mappings[1].contract.compiledStatus = 'draft',
  ]) {
    const f = splitFixture();
    mutate(f);
    f.resign();
    assert.throws(() => verify(f), /PRODUCER_CURRENT_MAPPING_INVALID/);
  }
  const f = splitFixture();
  f.context.view.components[1].sourceStatus = 'ready';
  assert.throws(() => normalize(f), /PRODUCER_VIEW_STALE/);
});

test('separate statuses preserve producer digest, dependency and code/live rejection', () => {
  const stale = splitFixture();
  stale.raw.currentInputs.packages[1].sourcePredicateStatus = 'ready';
  stale.raw.mappings[1].contract.sourcePredicateStatus = stale.raw.mappings[1].status.sourcePredicate = 'ready';
  assert.throws(() => verify(stale), /PRODUCER_DIGEST_MISMATCH/);
  for (const [mutate, code] of [
    [f => f.raw.currentInputs.packages[1].embeddedDependencies[0].sha256 = hash('wrong'), 'DEPENDENCY_PIN_INVALID'],
    [f => f.raw.currentInputs.packages[1].codeRepresentation.status = 'ready', 'PRODUCER_CODE_EVIDENCE_INVALID'],
    [f => f.raw.mappings[1].status.liveAcceptance = 'accepted', 'PRODUCER_CURRENT_MAPPING_INVALID'],
    [f => f.raw.mappings[1].status.release = 'released', 'PRODUCER_CURRENT_MAPPING_INVALID'],
  ]) {
    const f = splitFixture();
    mutate(f);
    f.resign();
    assert.throws(() => verify(f), new RegExp(code));
  }
});

test('source/compiled separation does not widen authority or registry version support', () => {
  for (const mutate of [
    f => f.raw.registryVersion = '1.2.0',
    f => f.raw.currentInputs.authorityVersions.editor = '0.2.92',
    f => f.raw.currentInputs.authorityVersions.core = '0.1.11',
    f => f.raw.currentInputs.authorityVersions.editor = null,
    f => f.raw.currentInputs.authorityVersions.future = '1.0.0',
  ]) {
    const f = splitFixture();
    mutate(f);
    f.resign();
    assert.throws(() => verify(f), /PRODUCER_SCHEMA|PRODUCER_CURRENT_INPUTS_INVALID/);
  }
});

const reviewedAuthority = {
  path: 'shared/design-system_ab/experiments/current-contract-packages/reports/producer-handoff.2026-10-09.json',
  sha256: 'c02b28ffe4c44e15487f7c60a0a1d0927941630d3ef99260804371c46f50a380',
};
function currentAuthorityFixture() {
  const f = splitFixture();
  f.raw.currentInputs.authorityVersions = { editor: '0.2.93', core: '0.1.12' };
  f.raw.currentInputs.authorities[0] = Object.assign({}, reviewedAuthority);
  f.resign();
  return f;
}

test('reviewed current-source authority permits the exact new pair without accepting Source Draft or code/native execution', () => {
  const f = currentAuthorityFixture();
  verify(f);
  const registry = normalize(f);
  assert.deepEqual(registry.source.producerInputs.currentInputs.authorityVersions, { editor: '0.2.93', core: '0.1.12' });
  assert.deepEqual(registry.source.producerInputs.currentInputs.authorities[0], reviewedAuthority);
  assert.equal(registry.source.producerInputs.currentInputs.packages[1].sourcePredicateStatus, 'draft');
  assert.equal(registry.source.producerInputs.currentInputs.packages[1].compiledStatus, 'ready');
  assert.equal(registry.entries[1].assurance.codeRepresentation, 'draft');
  assert.equal(registry.entries[1].assurance.liveAcceptance, 'not-run');
  assert.equal(registry.entries[1].generationProfileId, undefined);
  assert.equal(registry.entries[1].figma.handlerId, '');
  f.context.registry = registry;
  f.context.code = g.codeObservationFromProducer(registry);
  const plan = g.createCompositionPlan(f.spec, f.context, hash);
  const result = g.preflightPlan(plan, f.context, hash);
  assert.equal(result.sourceReadiness, 'blocked');
  assert.equal(result.targets.figma, 'blocked');
  assert.equal(result.targets.frontend, 'blocked');
  assert.ok(result.diagnostics.some(d => d.code === 'SOURCE_NOT_READY'));
  assert.ok(result.diagnostics.some(d => d.code === 'CODE_PROFILE_UNACCEPTED'));
});

test('new pair rejects missing, changed or malformed authority pins even after recomputing registry and lock', () => {
  for (const mutate of [
    f => f.raw.currentInputs.authorities.shift(),
    f => f.raw.currentInputs.authorities[0].path = 'synthetic/producer-handoff.2026-10-09.json',
    f => f.raw.currentInputs.authorities[0].sha256 = hash('unreviewed-handoff'),
    f => f.raw.currentInputs.authorities[0].sha256 = reviewedAuthority.sha256.toUpperCase(),
    f => f.raw.currentInputs.authorities[0].path = '../producer-handoff.2026-10-09.json',
    f => f.raw.currentInputs.authorities[0].extra = 'ignored',
    f => f.raw.currentInputs.authorities[0] = null,
    f => f.raw.currentInputs.authorities = null,
  ]) {
    const f = currentAuthorityFixture();
    mutate(f);
    f.resign();
    assert.throws(() => verify(f), /PRODUCER_CURRENT_INPUTS_INVALID/);
  }
});

test('reviewed authority never allows mixed, unknown or malformed toolchain versions', () => {
  for (const versions of [
    { editor: '0.2.93', core: '0.1.10' },
    { editor: '0.2.91', core: '0.1.12' },
    { editor: '0.2.94', core: '0.1.12' },
    { editor: '0.2.93', core: '0.1.13' },
    { editor: '0.2.93', core: '0.1.12', future: '1' },
    { editor: '0.2.93', core: null },
    { editor: 0.293, core: '0.1.12' },
    { editor: '0.2.93' },
    null,
    [],
  ]) {
    const f = currentAuthorityFixture();
    f.raw.currentInputs.authorityVersions = versions;
    f.resign();
    assert.throws(() => verify(f), /PRODUCER_CURRENT_INPUTS_INVALID/);
  }
});

test('reviewed new toolchain authority still rejects Source Ready with compiled Draft', () => {
  const f = currentAuthorityFixture();
  const input = f.raw.currentInputs.packages[1], mapping = f.raw.mappings[1];
  input.sourcePredicateStatus = mapping.contract.sourcePredicateStatus = mapping.status.sourcePredicate = 'ready';
  input.compiledStatus = mapping.contract.compiledStatus = 'draft';
  f.context.view.components[1].sourceStatus = 'ready';
  f.resign();
  assert.throws(() => verify(f), /PRODUCER_CODE_EVIDENCE_INVALID/);
});

const catalogAuthority = {
  path: 'arui-private/tools/code-connect/reports/current-catalog-producer-handoff.editor-0.2.94-core-0.1.13.2026-10-09.json',
  sha256: 'b271a238126649645111bdad22779fcfde67237c8a91b7deea2835a4e21869f8',
};
function catalogAuthorityFixture() {
  const f = splitFixture();
  f.raw.currentInputs.authorityVersions = { editor: '0.2.94', core: '0.1.13' };
  f.raw.currentInputs.authorities[0] = Object.assign({}, catalogAuthority);
  f.resign();
  return f;
}

test('reviewed catalog authority accepts exactly 0.2.94/0.1.13 and preserves Draft and execution blockers', () => {
  const f = catalogAuthorityFixture();
  const before = JSON.stringify({ registry: f.raw, lock: f.lock });
  verify(f);
  assert.equal(JSON.stringify({ registry: f.raw, lock: f.lock }), before);
  const registry = normalize(f);
  assert.deepEqual(registry.source.producerInputs.currentInputs.authorityVersions, { editor: '0.2.94', core: '0.1.13' });
  assert.deepEqual(registry.source.producerInputs.currentInputs.authorities[0], catalogAuthority);
  const input = registry.source.producerInputs.currentInputs.packages[1];
  assert.equal(input.sourcePredicateStatus, 'draft');
  assert.equal(input.compiledStatus, 'ready');
  assert.equal(registry.entries[1].assurance.codeRepresentation, 'draft');
  assert.equal(registry.entries[1].assurance.liveAcceptance, 'not-run');
  assert.equal(registry.entries[1].generationProfileId, undefined);
  assert.equal(registry.entries[1].figma.handlerId, '');
  f.context.registry = registry;
  f.context.code = g.codeObservationFromProducer(registry);
  const result = g.preflightPlan(g.createCompositionPlan(f.spec, f.context, hash), f.context, hash);
  assert.equal(result.sourceReadiness, 'blocked');
  assert.equal(result.targets.figma, 'blocked');
  assert.equal(result.targets.frontend, 'blocked');
  assert.ok(result.diagnostics.some(d => d.code === 'SOURCE_NOT_READY'));
  assert.ok(result.diagnostics.some(d => d.code === 'CODE_PROFILE_UNACCEPTED'));
});

test('catalog authority rejects missing, mixed or changed pins after recomputing registry and lock', () => {
  for (const mutate of [
    f => f.raw.currentInputs.authorities.shift(),
    f => f.raw.currentInputs.authorities[0] = Object.assign({}, reviewedAuthority),
    f => f.raw.currentInputs.authorities[0].path = 'synthetic/catalog-handoff.json',
    f => f.raw.currentInputs.authorities[0].sha256 = hash('unreviewed-catalog-handoff'),
    f => f.raw.currentInputs.authorities[0].extra = 'ignored',
    f => f.raw.currentInputs.authorities[0] = null,
    f => f.raw.currentInputs.authorities = null,
    f => f.raw.currentInputs.authorityVersions = { editor: '0.2.94', core: '0.1.12' },
    f => f.raw.currentInputs.authorityVersions = { editor: '0.2.93', core: '0.1.13' },
    f => f.raw.currentInputs.authorityVersions = { editor: '0.2.95', core: '0.1.13' },
    f => f.raw.currentInputs.authorityVersions = { editor: '0.2.94', core: '0.1.14' },
    f => f.raw.currentInputs.authorityVersions = { editor: '0.2.94', core: '0.1.13', future: '1' },
  ]) {
    const f = catalogAuthorityFixture();
    mutate(f);
    f.resign();
    assert.throws(() => verify(f), /PRODUCER_CURRENT_INPUTS_INVALID/);
  }
});

test('catalog authority cannot promote source, code or live acceptance', () => {
  for (const [mutate, code] of [
    [f => {
      const input = f.raw.currentInputs.packages[1], mapping = f.raw.mappings[1];
      input.sourcePredicateStatus = mapping.contract.sourcePredicateStatus = mapping.status.sourcePredicate = 'ready';
      input.compiledStatus = mapping.contract.compiledStatus = 'draft';
    }, 'PRODUCER_CODE_EVIDENCE_INVALID'],
    [f => f.raw.currentInputs.packages[1].codeRepresentation.status = 'ready', 'PRODUCER_CODE_EVIDENCE_INVALID'],
    [f => f.raw.mappings[1].status.liveAcceptance = 'accepted', 'PRODUCER_CURRENT_MAPPING_INVALID'],
  ]) {
    const f = catalogAuthorityFixture();
    mutate(f);
    f.resign();
    assert.throws(() => verify(f), new RegExp(code));
  }
});
