const test = require('node:test');
const assert = require('node:assert/strict');
const { loadContractPackages } = require('../dist/index.cjs');
const runtime = require('../../../dist/runtime.cjs');
const core = require('../../component-contract-core/dist/core.cjs');
const fixture = require('../../../tests/authoring-fixtures');
const clone = value => JSON.parse(JSON.stringify(value));
const identity = { coreVersion: require('../../component-contract-core/package.json').version,
  profileVersion: runtime.RUNTIME_VERSION, runtimeSha256: 'a'.repeat(64), buildInputsSha256: 'b'.repeat(64) };
const ports = { runtime, readZip: core.readZip, identity };
function archive(name, source, change) {
  const contract = clone(runtime.loadAuthoringSource(source).contract);
  const manual = clone(source.manual);
  if (change) change(manual, contract);
  return { name, bytes: core.createZip([core.textZipEntry('contract.manual.json', manual),
    core.textZipEntry('compiled/component-contract.v2.json', contract)]) };
}
function nestedArchives(change) {
  const f = fixture.nested();
  return [archive('host.zip', f.source, change), archive('child.zip', f.childSource)];
}

test('one inventory uses canonical Apollo compilation, representations and exact dependency pins', async () => {
  const archives = nestedArchives(), before = archives.map(a => Buffer.from(a.bytes));
  const result = await loadContractPackages(archives, ports);
  assert.equal(result.packages.length, 2);
  const host = result.lock.packages.find(p => p.componentId === 'test.host');
  const child = result.lock.packages.find(p => p.componentId === 'test.child');
  assert.equal(host.dependencies[0].compiledHash, child.compiledHash);
  assert.equal(host.dependencies[0].manualSourceHash, child.manualSourceHash);
  assert.ok(child.projectionEvidence.some(e => e.archive === 'host.zip'));
  assert.deepEqual(result.packages.find(p => p.componentId === 'test.host').representations, fixture.nested().source.manual.representations);
  archives.forEach((a, i) => assert.deepEqual(Buffer.from(a.bytes), before[i]));
  const repeat = await loadContractPackages(archives.reverse(), ports, result.lock);
  assert.equal(repeat.lockHash, result.lockHash);
  assert.deepEqual(repeat.lock, result.lock);
});

test('host without compiled is built from manual and generated anatomy by the shared compiler', async () => {
  const s = fixture.source(), key = s.manual.component.componentKey;
  const generated = { contracts: [{ id: s.manual.component.contractId, name: s.manual.component.family,
    componentKey: key, figma: { defaultVariantKey: key,
      structureSignature: [{ nodeId: 'synthetic:root', name: 'Test', type: 'COMPONENT', parentId: null }],
      variants: { variantKeys: [{ key, properties: {} }] } } }] };
  const input = { name: 'without-cache.zip', bytes: core.createZip([core.textZipEntry('contract.manual.json', s.manual), core.textZipEntry('evidence/contract.generated.json', generated)]) };
  const result = await loadContractPackages([input], ports);
  assert.equal(result.packages[0].contract.status, 'ready');
  assert.deepEqual(result.lock.packages[0].projectionEvidence, []);
  assert.equal(runtime.auditContractSnapshot(fixture.snapshot(), result.packages[0].contract).engine.evaluations[0].classification, 'compliant');
});

test('historical dependency exporter stamp is reproduced from the child manual/facts', async () => {
  const f = fixture.nested(), child = runtime.loadAuthoringSource(f.childSource).contract;
  child.package.sourceExportVersion = 'component-contract-editor@0.2.33';
  f.childSource.projectionStamp = { sourceExportVersion: child.package.sourceExportVersion, compiledHash: runtime.contractHash(child) };
  f.source.dependencies = [f.childSource];
  const pin = f.source.manual.componentDependencies[0]; pin.compiledHash = runtime.contractHash(child);
  const archives = [archive('host.zip', f.source), archive('child.zip', f.childSource)];
  const result = await loadContractPackages(archives, ports);
  assert.equal(result.lock.packages.find(p => p.componentId === 'test.child').sourceExportVersion, 'component-contract-editor@0.2.33');
  assert.equal(result.lock.packages.find(p => p.componentId === 'test.host').dependencies[0].compiledHash, runtime.contractHash(child));
});

test('embedded compiled dependency does not replace its authoring ZIP', async () => {
  await assert.rejects(loadContractPackages(nestedArchives().slice(0, 1), ports), { code: 'MISSING_DEPENDENCY' });
});

test('changed ZIP bytes reject an existing run lock', async () => {
  const inputs = nestedArchives(), result = await loadContractPackages(inputs, ports);
  inputs[0].bytes = new Uint8Array([...inputs[0].bytes, 0]);
  await assert.rejects(loadContractPackages(inputs, ports, result.lock), { code: 'STALE_ARCHIVE' });
});

test('runtime and lock schema changes reject an existing run', async () => {
  const inputs = nestedArchives(), result = await loadContractPackages(inputs, ports);
  const changed = Object.assign({}, ports, { identity: Object.assign({}, identity, { runtimeSha256: 'c'.repeat(64) }) });
  await assert.rejects(loadContractPackages(inputs, changed, result.lock), { code: 'STALE_LOCK' });
  await assert.rejects(loadContractPackages(inputs, ports, Object.assign({}, result.lock, { schemaVersion: 'future' })), { code: 'LOCK_SCHEMA' });
});

test('revision and compiled hash pins are checked independently', async () => {
  const revision = nestedArchives((manual, contract) => { manual.componentDependencies[0].revision++; contract.package.manualSourceHash = runtime.contractHash(manual); });
  await assert.rejects(loadContractPackages(revision, ports), { code: 'DEPENDENCY_PIN' });
  const inputs = nestedArchives((manual, contract) => {
    manual.componentDependencies[0].compiledHash = 'd'.repeat(64);
    contract.package.manualSourceHash = runtime.contractHash(manual);
  });
  await assert.rejects(loadContractPackages(inputs, ports), { code: 'SOURCE_COMPILE' });
});

test('conflicting component versions and compiled projections are rejected', async () => {
  const f = fixture.source();
  await assert.rejects(loadContractPackages([archive('a.zip', f), archive('b.zip', f)], ports), { code: 'COMPONENT_CONFLICT' });
  const inputs = nestedArchives();
  inputs[1] = archive('child.zip', fixture.nested().childSource, (_, c) => { c.rules[0].assert.expected = { literal: .5 }; });
  await assert.rejects(loadContractPackages(inputs, ports), { code: 'CACHE_CONFLICT' });
});

test('matching manual hash does not allow altered cached predicates', async () => {
  const input = archive('tampered.zip', fixture.source(), (_, c) => { c.rules[0].assert.expected = { literal: .5 }; });
  await assert.rejects(loadContractPackages([input], ports), { code: 'SOURCE_COMPILE' });
});

test('missing facts and unknown runtime feature cannot become accepted packages', async () => {
  const input = { name: 'manual-only.zip', bytes: core.createZip([core.textZipEntry('contract.manual.json', fixture.source().manual)]) };
  await assert.rejects(loadContractPackages([input], ports), { code: 'SOURCE_COMPILE' });
  const incompatible = archive('future.zip', fixture.source(), (_, c) => { c.runtimePolicy.futureVersion = 1; });
  await assert.rejects(loadContractPackages([incompatible], ports), { code: 'SOURCE_COMPILE' });
});

test('unsupported manual schema and invalid ZIP fail before execution', async () => {
  const input = archive('legacy.zip', fixture.source(), manual => { manual.schemaVersion = 'legacy'; });
  await assert.rejects(loadContractPackages([input], ports), { code: 'SOURCE_IMPORT' });
  await assert.rejects(loadContractPackages([{ name: 'broken.zip', bytes: new Uint8Array([1, 2, 3]) }], ports), { code: 'SOURCE_IMPORT' });
});

test('duplicate or unsafe archive entries fail without extracting files', async () => {
  const source = fixture.source();
  const inputs = [core.textZipEntry('../contract.manual.json', source.manual)];
  await assert.rejects(loadContractPackages([{ name: 'unsafe.zip', bytes: core.createZip(inputs) }], ports), { code: 'ENTRY_NAME' });
  inputs[0].name = 'contract.manual.json'; inputs.push(inputs[0]);
  await assert.rejects(loadContractPackages([{ name: 'duplicate.zip', bytes: core.createZip(inputs) }], ports), { code: 'ENTRY_NAME' });
});
