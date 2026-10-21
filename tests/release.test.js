const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const runtime = require("../dist/runtime.cjs");
const { nested } = require("./authoring-fixtures");
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function build(t, mutate) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'apollo-v4-release-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { host, source } = nested(); if (mutate) mutate(source);
  const input = path.join(dir, 'input.json'), output = path.join(dir, 'release');
  fs.writeFileSync(input, JSON.stringify(source));
  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/build-pilot-release.js"), input, output], { encoding: 'utf8' });
  return { host, result, output };
}
test('generic release builder pins the complete closure and independently indexes each component', t => {
  const f = build(t); assert.equal(f.result.status, 0, f.result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(f.output, 'manifest.json')));
  assert.equal(manifest.runtime.version, runtime.RUNTIME_VERSION); assert.equal(manifest.contracts.length, 2);
  const index = manifest.contracts.find(entry => entry.componentId === 'test.host');
  assert.equal(index.scope, 'component-with-dependencies');
  assert.deepEqual(index.dependencies, runtime.collectContractDependencies(f.host));
  assert.deepEqual(index.keys, ['host-key']);
  const child = manifest.contracts.find(entry => entry.componentId === 'test.child');
  assert.equal(child.contractHash, index.dependencies[0].compiledHash); assert.equal(child.scope, 'standalone-component');
  for (const entry of manifest.contracts) {
    const bytes = fs.readFileSync(path.join(f.output, entry.file));
    assert.equal(sha(bytes), entry.sha256);
    const authored = runtime.loadAuthoringSource(JSON.parse(bytes));
    assert.equal(authored.sourceHash, entry.sourceHash);
    assert.equal(runtime.contractHash(authored.contract), entry.contractHash);
    const cache = fs.readFileSync(path.join(f.output, entry.compiledCache.file));
    assert.equal(sha(cache), entry.compiledCache.sha256);
    assert.equal(runtime.contractHash(JSON.parse(cache)), entry.contractHash);
  }
  assert.equal(sha(fs.readFileSync(path.join(f.output, manifest.runtime.file))), manifest.runtime.sha256);
  const identity = Object.assign({}, manifest); delete identity.id; assert.equal(sha(JSON.stringify(identity)), manifest.id);
});
test('release with a corrupt dependency pin cannot write an index', t => {
  const f = build(t, source => { source.manual.componentDependencies[0].compiledHash = 'd'.repeat(64); });
  assert.notEqual(f.result.status, 0); assert.equal(fs.existsSync(path.join(f.output, 'manifest.json')), false);
});
test('release rejects overlapping host and child routing keys', t => {
  const f = build(t, source => { source.manual.component.componentKey = 'child-key'; });
  assert.notEqual(f.result.status, 0); assert.match(f.result.stderr, /Ambiguous contract routing key/);
});

const { assembleDeclaredRelease } = require("../scripts/build-pilot-release");
const { installRelease, rollbackAudit } = require("../scripts/install-pilot-release");
const service = require("../../../services/apollo-proxy/src/contracts/service");
const { source: singleSource } = require("./authoring-fixtures");
const releasePin = file => ({ path: file, sha256: sha(fs.readFileSync(file)), bytes: fs.statSync(file).size });
async function declaredFixture(t, sources) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'apollo-shared-release-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const inputs = sources.map((source, i) => { const file = path.join(dir, 'source-' + i + '.json'); fs.writeFileSync(file, JSON.stringify(source)); return releasePin(file); });
  const runtimeFile = path.resolve(__dirname, "../dist/runtime.cjs"), coreFile = path.resolve(__dirname, "../packages/component-contract-core/dist/core.cjs");
  const runtimePin = releasePin(runtimeFile), corePin = releasePin(coreFile), receiptFile = path.join(dir, 'synthetic-accepted-inputs.json');
  fs.writeFileSync(receiptFile, JSON.stringify({ status: 'ACCEPTED_SYNTHETIC_INPUTS', fixtureOnly: true, writesClosed: true, inputs: [...inputs, runtimePin, corePin] }));
  const acceptance = releasePin(receiptFile), config = { schemaVersion: 'apollo.declared-contract-release.v1', sources: inputs,
    sourceAcceptance: acceptance, runtime: { file: runtimePin, acceptedPin: runtimePin, acceptance, version: runtime.RUNTIME_VERSION }, core: { file: corePin, acceptedPin: corePin, acceptance } };
  return { dir, config, sources: inputs, output: path.join(dir, 'staging') };
}
test('declared release uses one accepted source list, full closure and flat hash files', async t => {
  const n = nested(), f = await declaredFixture(t, [n.source, n.childSource]);
  const passport = await assembleDeclaredRelease(f.config, f.output), loaded = service.readRelease(f.output);
  assert.equal(loaded.manifest.runtime.version, '0.4.1'); assert.equal(loaded.contracts.length, 2);
  assert.deepEqual(passport.generationProjection.normative, passport.normative); assert.equal(passport.Ready, false);
  for (const c of loaded.contracts) for (const artifact of [{ file: c.entry.file, sha256: c.entry.sha256 }, c.entry.compiledCache]) {
    assert.ok(artifact.file.includes('-' + artifact.sha256 + '.')); assert.equal(path.basename(artifact.file), artifact.file);
  }
  assert.deepEqual(loaded.contracts.find(c => c.entry.componentId === 'test.host').entry.dependencies, runtime.collectContractDependencies(n.host));
});
test('declared authoring preview keeps draft source and carries its mode through Proxy resolution and audit',async t=>{
 const source=singleSource();source.manual.rules[0].status='draft';const f=await declaredFixture(t,[source]);f.config.evaluationMode='authoring-preview';
 await assembleDeclaredRelease(f.config,f.output);const loaded=service.readRelease(f.output),item=loaded.contracts[0];
 assert.equal(item.contract.status,'draft');assert.equal(item.contract.rules[0].authority.status,'draft');assert.equal(item.entry.evaluationMode,'authoring-preview');
 const reply=service.resolveContracts({components:[{componentKey:'test-key'}]},f.output);assert.equal(reply.contracts[0].release.evaluationMode,'authoring-preview');assert.deepEqual(reply.contracts[0].source.manual,source.manual);
 const snapshot=require("./authoring-fixtures").snapshot();snapshot.nodes[0].appearance.opacity=.3;
 const packet=service.buildExplanationPacket({auditId:'a'.repeat(64),release:item.release,snapshot},f.output);assert.equal(packet.deterministicResult.engine.evaluations[0].classification,'violation');assert.equal(packet.deterministicResult.Ready,false);
 const manifest=JSON.parse(fs.readFileSync(path.join(f.output,'manifest.json')));delete manifest.contracts[0].evaluationMode;delete manifest.id;manifest.id=sha(JSON.stringify(manifest));fs.writeFileSync(path.join(f.output,'manifest.json'),JSON.stringify(manifest));
 assert.throws(()=>service.readRelease(f.output),/ready contract/);
});
test('draft source is rejected by a declared release without opt-in preview',async t=>{
 const source=singleSource();source.manual.rules[0].status='draft';const f=await declaredFixture(t,[source]);await assert.rejects(assembleDeclaredRelease(f.config,f.output),/ready contract/);assert.equal(fs.existsSync(path.join(f.output,'manifest.json')),false);
});
test('declared CLI uses only the pinned input list and refuses an existing staging directory', async t => {
  const n = nested(), f = await declaredFixture(t, [n.source, n.childSource]), input = path.join(f.dir, 'declared.json');
  fs.writeFileSync(input, JSON.stringify(f.config));
  const args = [path.resolve(__dirname, "../scripts/build-pilot-release.js"), '--inputs', input, f.output];
  const first = spawnSync(process.execPath, args, { encoding: 'utf8' }); assert.equal(first.status, 0, first.stderr);
  const old = fs.readFileSync(path.join(f.output, 'manifest.json'));
  const second = spawnSync(process.execPath, args, { encoding: 'utf8' }); assert.notEqual(second.status, 0);
  assert.deepEqual(fs.readFileSync(path.join(f.output, 'manifest.json')), old);
});
test('declared release refuses unaccepted, drifted and incomplete inputs before manifest', async t => {
  const n = nested();
  for (const change of [f => f.config.sources.pop(), f => f.config.sources[0].sha256 = '0'.repeat(64), f => f.config.runtime.version = '0.9.0',
    f => { const p = path.join(f.dir, 'unaccepted.json'); fs.writeFileSync(p, JSON.stringify({ writesClosed: false, inputs: f.config.sources })); f.config.sourceAcceptance = releasePin(p); },
    f => { const p = path.join(f.dir, 'closed-only.json'); fs.writeFileSync(p, JSON.stringify({ status: 'COMPLETED', writesClosed: true, inputs: f.config.sources })); f.config.sourceAcceptance = releasePin(p); },
    f => { f.config.sources.push(f.config.sources[0]); }]) {
    const f = await declaredFixture(t, [n.source, n.childSource]); change(f);
    await assert.rejects(assembleDeclaredRelease(f.config, f.output)); assert.equal(fs.existsSync(path.join(f.output, 'manifest.json')), false);
  }
});
test('0.4.1 loader enforces authoring identity, revision, closure and routing', async t => {
  const n = nested(), f = await declaredFixture(t, [n.source, n.childSource]); await assembleDeclaredRelease(f.config, f.output);
  const original = JSON.parse(fs.readFileSync(path.join(f.output, 'manifest.json')));
  for (const mutate of [m => m.contracts[0].revision++, m => m.contracts[0].sourceHash = '0'.repeat(64), m => m.sourceSchema = 'foreign',
    m => m.contracts.splice(m.contracts.findIndex(c => c.componentId === 'test.child'), 1), m => m.contracts[0].keys.push('foreign-key')]) {
    const m = structuredClone(original); mutate(m); delete m.id; m.id = sha(JSON.stringify(m)); fs.writeFileSync(path.join(f.output, 'manifest.json'), JSON.stringify(m));
    assert.throws(() => service.readRelease(f.output));
  }
  fs.writeFileSync(path.join(f.output, 'manifest.json'), JSON.stringify(original)); assert.equal(service.readRelease(f.output).contracts.length, 2);
});
async function installFixture(t) {
  const n = nested(), old = await declaredFixture(t, [n.childSource]), next = await declaredFixture(t, [n.source, n.childSource]);
  await assembleDeclaredRelease(old.config, old.output); await assembleDeclaredRelease(next.config, next.output);
  return { old, next, oldHash: sha(fs.readFileSync(path.join(old.output, 'manifest.json'))), oldId: service.readRelease(old.output).manifest.id };
}
test('atomic audit commit exposes old/new complete sets, stale retry and selectable manifest rollback', async t => {
  const f = await installFixture(t), oldResolve = service.resolveContracts({ components: [{ componentKey: 'child-key' }] }, f.old.output);
  const oldFiles = fs.readdirSync(f.old.output).map(file => [file, sha(fs.readFileSync(path.join(f.old.output, file)))]);
  let during; const installed = installRelease({ stagingRoot: f.next.output, activeRoot: f.old.output, expectedManifestHash: f.oldHash, updateClass: 'A' }, { beforeCommit() { during = service.readRelease(f.old.output); } });
  assert.equal(during.manifest.id, f.oldId); assert.equal(during.contracts.length, 1); assert.equal(service.readRelease(f.old.output).contracts.length, 2);
  assert.throws(() => service.resolveContracts({ components: [{ componentKey: 'child-key' }], releaseId: f.oldId }, f.old.output), e => e.status === 409);
  for (const [file, hash] of oldFiles.filter(([name]) => name !== 'manifest.json')) assert.equal(sha(fs.readFileSync(path.join(f.old.output, file))), hash);
  rollbackAudit({ activeRoot: f.old.output, expectedManifestHash: installed.manifestHash, previousManifestHash: f.oldHash });
  assert.deepEqual(service.resolveContracts({ components: [{ componentKey: 'child-key' }] }, f.old.output), oldResolve);
  assert.equal(installed.generationActivated, false);
});
test('atomic installer conflicts and interrupted preparation leave old manifest readable', async t => {
  const f = await installFixture(t), options = { stagingRoot: f.next.output, activeRoot: f.old.output, expectedManifestHash: f.oldHash, updateClass: 'A' };
  assert.throws(() => installRelease({ ...options, expectedManifestHash: '0'.repeat(64) }), e => e.code === 'RELEASE_WRITER_CONFLICT');
  fs.writeFileSync(path.join(f.old.output, '.install.lock'), 'foreign writer');
  assert.throws(() => installRelease(options), e => e.code === 'RELEASE_WRITER_BUSY'); fs.unlinkSync(path.join(f.old.output, '.install.lock'));
  assert.throws(() => installRelease(options, { beforeCommit() { throw Error('simulated interruption'); } }), /simulated interruption/);
  assert.equal(sha(fs.readFileSync(path.join(f.old.output, 'manifest.json'))), f.oldHash); assert.equal(service.readRelease(f.old.output).manifest.id, f.oldId);
  const child = spawnSync(process.execPath, ['-e', 'const i=require(process.argv[1]);i.installRelease(JSON.parse(process.argv[2]),{beforeCommit(){process.kill(process.pid,"SIGKILL")}});', path.resolve(__dirname, "../scripts/install-pilot-release.js"), JSON.stringify(options)], { encoding: 'utf8' });
  assert.equal(child.signal, 'SIGKILL', child.stderr); assert.equal(sha(fs.readFileSync(path.join(f.old.output, 'manifest.json'))), f.oldHash);
  assert.equal(service.readRelease(f.old.output).manifest.id, f.oldId); assert.equal(fs.existsSync(path.join(f.old.output, '.install.lock')), true);
  assert.throws(() => installRelease(options), e => e.code === 'RELEASE_WRITER_BUSY');
});
test('atomic installer rejects altered retained norms, runtime and corrupt artifacts', async t => {
  const f = await installFixture(t), options = { stagingRoot: f.next.output, activeRoot: f.old.output, expectedManifestHash: f.oldHash, updateClass: 'A' };
  assert.throws(() => installRelease({ ...options, updateClass: 'B' }), e => e.code === 'COORDINATED_ACTIVATION_REQUIRED');
  const changed = structuredClone(nested().childSource); changed.manual.metadata.revision = 2;
  const revision = await declaredFixture(t, [changed]); await assembleDeclaredRelease(revision.config, revision.output);
  assert.throws(() => installRelease({ ...options, stagingRoot: revision.output }), e => e.code === 'COORDINATED_CONTRACT_ACTIVATION_REQUIRED');
  const loaded = service.readRelease(f.next.output), artifact = path.join(f.next.output, loaded.contracts[0].entry.file); fs.appendFileSync(artifact, ' ');
  assert.throws(() => installRelease(options), /checksum mismatch/); assert.equal(sha(fs.readFileSync(path.join(f.old.output, 'manifest.json'))), f.oldHash);
});
