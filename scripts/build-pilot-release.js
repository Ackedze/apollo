const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const pin = file => { const bytes = fs.readFileSync(file); return { path: path.resolve(file), sha256: sha(bytes), bytes: bytes.length }; };
function readPinned(input) {
  if (!input || !path.isAbsolute(input.path) || !/^[a-f0-9]{64}$/.test(input.sha256) || !Number.isSafeInteger(input.bytes)) throw Error('Invalid declared input pin');
  const bytes = fs.readFileSync(input.path);
  if (sha(bytes) !== input.sha256 || bytes.length !== input.bytes) throw Error('Declared input changed: ' + input.path);
  return bytes;
}
function acceptedInputs(receiptPin, inputs) {
  const receipt = JSON.parse(readPinned(receiptPin));
  if (receipt.writesClosed !== true || !/^ACCEPTED_/.test(receipt.status || '') || !Array.isArray(receipt.inputs)) throw Error('Closed accepted source inputs are required');
  for (const input of inputs) if (!receipt.inputs.some(p => p.path === input.path && p.sha256 === input.sha256 && p.bytes === input.bytes)) throw Error('Input is outside accepted source set: ' + input.path);
}
async function readSource(file, runtime, core) {
  const bytes = fs.readFileSync(file);
  if (/\.zip$/i.test(file)) {
    if (bytes.length > 64 * 1024 * 1024) throw Error('Release archive limit');
    const entries = await core.readZip(bytes);
    if (entries.length > 200 || entries.reduce((n, e) => n + e.data.length, 0) > 128 * 1024 * 1024) throw Error('Release archive entries limit');
    return runtime.sourceFromFiles(entries.filter(e => /\.json$/i.test(e.name)).map(e => ({ name: e.name, text: new TextDecoder('utf-8', { fatal: true }).decode(e.data) })));
  }
  const data = JSON.parse(bytes);
  if (data.schemaVersion === runtime.SOURCE_SCHEMA) return data;
  if (data.documentType !== 'component-contract-manual') throw Error('Release input must be the principal manual or an authoring package.');
  const directory = path.dirname(file), files = [{ name: 'contract.manual.json', text: JSON.stringify(data) }];
  const src = path.join(directory, 'src');
  if (fs.existsSync(src)) {
    for (const name of fs.readdirSync(src).filter(name => name.endsWith('.json')).sort()) files.push({ name: 'source/' + name, text: fs.readFileSync(path.join(src, name), 'utf8') });
  } else {
    const archive = path.join(directory, 'editor', data.component.family + '.editor-input.zip');
    if (!fs.existsSync(archive)) throw Error('Bound source facts are missing next to the principal manual. Supply an authoring source package.');
    for (const entry of await core.readZip(fs.readFileSync(archive))) {
      if (/\.json$/i.test(entry.name) && !/(^|\/)contract\.manual\.json$|component-contract\.v2\.json$/.test(entry.name)) files.push({ name: entry.name, text: new TextDecoder('utf-8', { fatal: true }).decode(entry.data) });
    }
  }
  const cache = path.join(directory, 'compiled/component-contract.v2.json');
  if (fs.existsSync(cache)) files.push({ name: 'compiled/component-contract.v2.json', text: fs.readFileSync(cache, 'utf8') });
  return runtime.sourceFromFiles(files);
}
async function assemble({ sources, runtimeFile, runtime, core, destination, declared = false, evaluationMode, verify = () => {} }) {
  const inputs = [];
  for (const file of sources) {
    // Declared mode cannot discover unpinned sibling files. Use a ZIP or a complete authoring-source JSON.
    if (declared && !/\.zip$/i.test(file) && JSON.parse(fs.readFileSync(file)).schemaVersion !== runtime.SOURCE_SCHEMA) throw Error('Declared principal manual requires a complete pinned authoring package');
    inputs.push(await readSource(file, runtime, core));
  }
  const known = new Map();
  for (const source of inputs) {
    const id = source.manual.component.componentId;
    if (known.has(id)) throw Error('Duplicate declared component: ' + id);
    known.set(id, source);
  }
  function link(source, ancestors = new Set()) {
    const id = source.manual.component.componentId;
    if (ancestors.has(id) || ancestors.size > 4) throw Error('Invalid authoring dependency chain');
    const next = new Set(ancestors); next.add(id);
    const embedded = new Map((source.dependencies || []).map(child => [child.manual.component.componentId, child]));
    source.dependencies = Array.from(new Set((source.manual.componentDependencies || []).map(p => p.componentId))).map(componentId => {
      const child = known.get(componentId) || (!declared && embedded.get(componentId));
      if (!child) throw Error('Missing declared authoring dependency ' + componentId);
      return link(child, next);
    });
    return source;
  }
  const packages = new Map(), components = new Map();
  function add(source) {
    const loaded = runtime.loadAuthoringSource(source, evaluationMode ? { evaluationMode } : {}), contract = loaded.contract, id = contract.package.id;
    if (!/^[a-z][a-z0-9.-]*$/.test(id)) throw Error('Release package id must be path-safe');
    if (packages.has(id)) {
      if (packages.get(id).sourceHash !== loaded.sourceHash) throw Error('Conflicting dependency source: ' + id);
      return;
    }
    if (components.has(contract.package.componentId)) throw Error('Conflicting component identity: ' + contract.package.componentId);
    components.set(contract.package.componentId, id);
    packages.set(id, { source, sourceHash: loaded.sourceHash, contract, hash: runtime.contractHash(contract),
      bytes: Buffer.from(JSON.stringify(source) + '\n'), cacheBytes: Buffer.from(JSON.stringify(contract) + '\n') });
    for (const child of source.dependencies) add(child);
  }
  for (const source of inputs) add(link(source));
  const artifacts = Array.from(packages.values()).sort((a, b) => a.contract.package.id.localeCompare(b.contract.package.id));
  const entries = artifacts.map(a => {
    const contract = a.contract, dependencies = runtime.collectContractDependencies(contract);
    const entry = { id: contract.package.id, componentId: contract.package.componentId,
      revision: contract.package.manualRevision || contract.rules[0]?.revision,
      family: contract.package.family || contract.facts.component.family,
      file: contract.package.id + '-' + sha(a.bytes) + '.source.json', sha256: sha(a.bytes), sourceHash: a.sourceHash,
      compiledCache: { file: contract.package.id + '-' + sha(a.cacheBytes) + '.contract.json', sha256: sha(a.cacheBytes) },
      contractHash: a.hash, manualSourceHash: contract.package.manualSourceHash, generatedFactsHash: contract.package.generatedFactsHash,
      keys: Array.from(runtime.collectContractKeys(contract)).sort(), scope: dependencies.length ? 'component-with-dependencies' : 'standalone-component', dependencies, published: false };
    if (contract.status === 'draft' && evaluationMode === 'authoring-preview') entry.evaluationMode = evaluationMode;
    return entry;
  });
  const routing = new Set();
  for (const entry of entries) for (const key of entry.keys) { if (routing.has(key)) throw Error('Ambiguous contract routing key in ' + entry.id); routing.add(key); }
  const bundle = fs.readFileSync(runtimeFile);
  const manifest = { schemaVersion: 'apollo.contract-release.v1-experimental', channel: 'local-pilot', published: false,
    sourceSchema: runtime.SOURCE_SCHEMA, runtime: { file: 'runtime-' + sha(bundle) + '.cjs', sha256: sha(bundle), version: runtime.RUNTIME_VERSION }, contracts: entries };
  manifest.id = sha(JSON.stringify(manifest));
  verify();
  if (fs.existsSync(destination)) throw Error('Staging destination must be new');
  fs.mkdirSync(destination, { recursive: true });
  entries.forEach((entry, i) => {
    fs.writeFileSync(path.join(destination, entry.file), artifacts[i].bytes, { flag: 'wx' });
    fs.writeFileSync(path.join(destination, entry.compiledCache.file), artifacts[i].cacheBytes, { flag: 'wx' });
  });
  fs.writeFileSync(path.join(destination, manifest.runtime.file), bundle, { flag: 'wx' });
  verify();
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return { manifest, artifacts, sources, routingKeys: routing.size };
}
async function assembleDeclaredRelease(config, destination) {
  if (config?.schemaVersion !== 'apollo.declared-contract-release.v1' || !Array.isArray(config.sources) || !config.sources.length || config.sources.length > 32) throw Error('Invalid declared release source list');
  if (config.evaluationMode !== undefined && config.evaluationMode !== 'authoring-preview') throw Error('Unsupported declared evaluation mode');
  const all = [config.runtime.file, config.core.file, ...config.sources];
  const verify = () => { all.forEach(readPinned); readPinned(config.runtime.acceptance); readPinned(config.core.acceptance); readPinned(config.sourceAcceptance); };
  verify();
  if (config.runtime.file.sha256 !== config.runtime.acceptedPin?.sha256 || config.runtime.file.bytes !== config.runtime.acceptedPin?.bytes) throw Error('Runtime materialization differs from accepted bytes');
  acceptedInputs(config.runtime.acceptance, [config.runtime.acceptedPin]);
  if (config.core.file.sha256 !== config.core.acceptedPin?.sha256 || config.core.file.bytes !== config.core.acceptedPin?.bytes) throw Error('Core materialization differs from accepted bytes');
  acceptedInputs(config.core.acceptance, [config.core.acceptedPin]);
  acceptedInputs(config.sourceAcceptance, config.sources);
  for (const input of [config.runtime.file, config.core.file]) delete require.cache[require.resolve(input.path)];
  const runtime = require(config.runtime.file.path), core = require(config.core.file.path);
  if (runtime.RUNTIME_VERSION !== config.runtime.version || !['0.3.0', '0.4.0', '0.4.1'].includes(runtime.RUNTIME_VERSION)) throw Error('Unsupported accepted runtime profile');
  const result = await assemble({ sources: config.sources.map(p => p.path), runtimeFile: config.runtime.file.path, runtime, core, destination, declared: true, evaluationMode: config.evaluationMode, verify });
  const normative = result.artifacts.map(a => ({ componentId: a.contract.package.componentId, contractId: a.contract.package.id,
    platforms: a.source.manual.component.platforms, revision: a.source.manual.metadata.revision,
    manualSourceHash: a.contract.package.manualSourceHash, factsHash: runtime.contractHash(a.contract.facts),
    generatedFactsHash: a.contract.package.generatedFactsHash, sourceHash: a.sourceHash, compiledHash: a.hash,
    dependencies: runtime.collectContractDependencies(a.contract), coverage: a.contract.coverage, runtimePolicy: a.contract.runtimePolicy }));
  const passport = { schemaVersion: 'apollo.shared-contract-release-passport.v1', sourceInputs: config.sources,
    acceptedRuntime: config.runtime, sourceAcceptance: config.sourceAcceptance, auditManifest: pin(path.join(destination, 'manifest.json')),
    normative, generationProjection: { format: 'existing ZIP/source references', inputs: config.sources, normative,
      mappingsExpanded: false, actualReaderAcceptance: 'PENDING_GENERATION', selectableRollback: 'PENDING_GENERATION' },
    installed: false, Ready: false };
  fs.writeFileSync(path.join(destination, 'passport.json'), JSON.stringify(passport, null, 2) + '\n', { flag: 'wx' });
  verify(); return passport;
}
async function main() {
  const args = process.argv.slice(2), root = path.resolve(__dirname, "..");
  if (args[0] === '--inputs') {
    if (args.length !== 3) throw Error('Usage: build-pilot-release --inputs <accepted-input-list.json> <new staging directory>');
    const passport = await assembleDeclaredRelease(JSON.parse(fs.readFileSync(path.resolve(args[1]))), path.resolve(args[2]));
    console.log('Declared unpublished staging: ' + passport.normative.length + ' components.'); return;
  }
  const ds = path.resolve(root, '../../shared/design-system_ab/experiments');
  const sources = args[0] === '--spinner' ? [path.join(ds, 'web-core/core/Spinner/contract.manual.json')]
    : args[0] ? [path.resolve(args[0])] : ['web-core/core/Spinner', 'web-core/core/Button', 'web-corp/CorporateContent/authoring', 'web-core/core/Amount/authoring', 'web-corp/AmountStyles/authoring'].map(dir => path.join(ds, dir, 'contract.manual.json'));
  const runtimeFile = path.join(root, 'dist/runtime.cjs');
  const result = await assemble({ sources, runtimeFile, runtime: require(runtimeFile), core: require("../packages/component-contract-core/dist/core.cjs"), destination: path.resolve(args[1] || path.join(root, 'dist/pilot-release')) });
  console.log('Local unpublished staging: ' + result.manifest.id + '.');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { assembleDeclaredRelease, readSource };
