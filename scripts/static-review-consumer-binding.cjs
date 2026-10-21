// Detached, local-only byte binding. It never grants source or execution authority.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const VERSION = 'apollo.static-review-consumer-binding.v1-draft';
const VECTOR_VERSION = 'apollo.static-review-consumer-vector.v1-draft';
const SHA = /^[a-f0-9]{64}$/;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digest = value => sha(JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));
const closed = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const isPin = v => closed(v, ['path', 'sha256']) && typeof v.path === 'string' && path.isAbsolute(v.path)
  && path.normalize(v.path) === v.path && SHA.test(v.sha256);
const samePin = (a, b) => isPin(a) && isPin(b) && a.path === b.path && a.sha256 === b.sha256;
function bindingUnavailable(code = 'CONSUMER_BINDING_PIN_REQUIRED', status = 'unverified') {
  return { status, receiptHash: null, vectorHash: null, configHash: null, buildHash: null, checkedFiles: 0, diagnosticCode: code };
}
/** Producer v1 identities are nested; do not invent top-level generation/observation fields. */
function verifyV1Output(document, declared, manifest) {
  const keys=['schemaVersion','status','accepted','executionAllowed','apiExpressibility','targetSupport','inputHash','planHash','plan','contentHash','content','apiIntent','diagnostics','observation','generationSourceRead','generationPreflight','gaps'];
  if (!closed(document,keys) || document.schemaVersion !== 'apollo.code-connect.static-content.v1-draft'
    || document.status !== 'draft' || document.accepted !== false || document.executionAllowed !== false
    || document.plan?.schemaVersion !== 'apollo.code-connect.static-review-plan.v1-draft'
    || document.plan.executionAllowed !== false || document.plan.generationPlanHash !== null
    || document.observation?.accepted !== false || document.observation.executionAllowed !== false
    || document.observation.generationPlanHash !== null || document.generationPreflight?.executionAllowed !== false
    || !closed(document.targetSupport,['figma','frontend']) || document.targetSupport.figma !== 'not-supported' || document.targetSupport.frontend !== 'not-supported') fail('CONSUMER_BINDING_OUTPUT');
  const observation=Object.assign({},document.observation);delete observation.observationHash;
  const identities={inputHash:digest(document.plan.spec),planHash:digest(document.plan),contentHash:digest(document.content),observationHash:digest(observation)};
  for (const key of Object.keys(identities)) if (declared[key] !== identities[key]
    || (key === 'observationHash' ? document.observation[key] : document[key]) !== identities[key]) fail('CONSUMER_BINDING_OUTPUT');
  if (digest(document.plan.content) !== identities.contentHash || document.plan.contentHash !== identities.contentHash
    || document.observation.artifactDigest !== manifest.artifactDigest
    || ['inputHash','planHash','contentHash'].some(k => document.observation[k] !== identities[k])) fail('CONSUMER_BINDING_OUTPUT');
  return identities;
}

/** All options are independently supplied local context, never an imported document or HTTP body. */
function validateConsumerBinding(options) {
  if (!options.receiptPin) return { result: bindingUnavailable(), assertCurrent() {} };
  const trust = options.receiptPin;
  if (!isPin(trust)) fail('CONSUMER_BINDING_PIN_INVALID');
  const roots = [options.repositoryRoot, options.workspaceRoot, options.producerRoot, path.dirname(options.configPath), path.dirname(trust.path)]
    .concat(options.artifactRoots || []).map(p => fs.realpathSync(p));
  const bytesByPath = new Map(), realPaths = new Map();
  function file(p, historical = false) {
    if (!isPin(p)) fail('CONSUMER_BINDING_SCHEMA');
    let actualPath, bytes;
    try { actualPath = fs.realpathSync(p.path); bytes = fs.readFileSync(actualPath); }
    catch { fail('CONSUMER_BINDING_FILE_MISSING'); }
    if (!roots.some(root => actualPath === root || actualPath.startsWith(root + path.sep))) fail('CONSUMER_BINDING_PATH');
    if (sha(bytes) !== p.sha256) fail(historical ? 'CONSUMER_BINDING_ARCHIVE_STALE' : 'CONSUMER_BINDING_STALE');
    bytesByPath.set(p.path, bytes); realPaths.set(p.path, actualPath); return bytes;
  }
  function json(p, historical) { try { return JSON.parse(file(p, historical)); } catch (e) { if (e.code) throw e; fail('CONSUMER_BINDING_SCHEMA'); } }
  const r = json(trust);
  if (!closed(r, ['schemaVersion', 'status', 'accepted', 'executionAllowed', 'generationPlanHash', 'baselineVectorPin', 'producer', 'preselection', 'selection', 'final', 'closurePins', 'additions'])
    || r.schemaVersion !== VERSION || r.status !== 'draft' || r.accepted !== false || r.executionAllowed !== false || r.generationPlanHash !== null
    || !closed(r.producer, ['manifestPin', 'basisPin', 'artifactDigest', 'outputs'])
    || !closed(r.preselection, ['vectorPin', 'configArchivePin', 'configPath', 'configSha256'])
    || !closed(r.selection, ['configPin', 'manifestPin', 'reportPin'])
    || !closed(r.final, ['vectorPin', 'buildManifestPin', 'runtimePins'])
    || !SHA.test(r.producer.artifactDigest)) fail('CONSUMER_BINDING_SCHEMA');
  if (!samePin(r.producer.manifestPin, options.manifestPin) || !samePin(r.producer.basisPin, options.reportPin)
    || !samePin(r.selection.manifestPin, options.manifestPin) || !samePin(r.selection.reportPin, options.reportPin)
    || r.selection.configPin.path !== options.configPath || r.final.buildManifestPin.path !== options.buildManifestPath)
    fail('CONSUMER_BINDING_SELECTOR');
  function pins(rows) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 16384 || !rows.every(isPin)
      || new Set(rows.map(p => p.path)).size !== rows.length) fail('CONSUMER_BINDING_INVENTORY');
    return new Map(rows.map(p => [p.path, p]));
  }
  const baseline = json(r.baselineVectorPin), baselineFiles = pins(baseline.files.map(p => ({path:p.path,sha256:p.sha256})));
  function vector(p, phase) {
    const v = json(p);
    if (!closed(v, ['schemaVersion', 'phase', 'files', 'buildInputs']) || v.schemaVersion !== VECTOR_VERSION || v.phase !== phase) fail('CONSUMER_BINDING_SCHEMA');
    return { files: pins(v.files), buildInputs: pins(v.buildInputs) };
  }
  const v0 = vector(r.preselection.vectorPin, 'preselection'), v1 = vector(r.final.vectorPin, 'final');
  for (const p of baselineFiles.keys()) if (!v0.files.has(p)) fail('CONSUMER_BINDING_BASELINE_OMITTED');
  const a = json(r.producer.manifestPin), report = json(r.producer.basisPin);
  const payload = Object.assign({}, a); delete payload.artifactDigest;
  if (a.schemaVersion !== 'apollo.code-connect.static-producer.v1-draft' || a.version !== 1 || a.status !== 'draft'
    || a.accepted !== false || a.executionAllowed !== false || a.generationPlanHash !== null
    || a.outputVersion !== 'apollo.code-connect.static-content.v1-draft' || a.planVersion !== 'apollo.code-connect.static-review-plan.v1-draft' || a.generationWireSupport !== 'not-supported'
    || report.documentType !== 'next-03-code-connect-static-source-api-review-handoff' || report.version !== 1 || report.accepted !== false || report.executionAllowed !== false || report.generationPlanHash !== null || a.artifactDigest !== digest(payload)
    || a.artifactDigest !== r.producer.artifactDigest || !samePin(a.consumerVector, r.preselection.vectorPin)
    || report.producerManifest?.sha256 !== r.producer.manifestPin.sha256 || report.producerManifest?.artifactDigest !== a.artifactDigest)
    fail('CONSUMER_BINDING_PRODUCER');
  function relative(root, p) {
    if (!p || typeof p.path !== 'string' || path.isAbsolute(p.path) || p.path.includes('\\') || p.path.split('/').some(s => !s || s === '.' || s === '..')) fail('CONSUMER_BINDING_PATH');
    return { path: path.join(root, p.path), sha256: p.sha256 };
  }
  const required = new Map();
  function requirePin(p) { if (!isPin(p)) fail('CONSUMER_BINDING_SCHEMA'); const prior = required.get(p.path); if (prior && !samePin(prior, p)) fail('CONSUMER_BINDING_INVENTORY'); required.set(p.path, p); }
  for (const [root, rows] of [[options.producerRoot, a.producerFiles], [options.producerRoot, a.apiEvidenceFiles], [options.repositoryRoot, a.consumerFiles], [options.workspaceRoot, a.workspaceConsumerFiles], [options.repositoryRoot, a.buildInputs]]) {
    if (!Array.isArray(rows) || !rows.length) fail('CONSUMER_BINDING_INVENTORY');
    for (const p of rows) requirePin(relative(root, p));
  }
  if (!Array.isArray(a.requestPins)) fail('CONSUMER_BINDING_INVENTORY');
  for (const p of a.requestPins) requirePin(p);
  const registryPin = relative(options.producerRoot, a.frozen.registry), lockPin = relative(options.producerRoot, a.frozen.lock);
  requirePin(registryPin); requirePin(lockPin);
  const registry = json(registryPin), lock = json(lockPin);
  if (digest(lock.inputPackages) !== digest(a.frozen.inputPackages) || registry.registryDigest !== a.frozen.registryDigest
    || digest(registry.currentInputs) !== a.frozen.currentInputsDigest || digest(lock) !== a.frozen.lockDigest
    || registry.authoringBasis?.registryDigest !== a.frozen.basisRegistryDigest) fail('CONSUMER_BINDING_SOURCE');
  if (!Array.isArray(a.frozen.inputPackages) || !a.frozen.inputPackages.length) fail('CONSUMER_BINDING_SOURCE');
  for (const p of a.frozen.inputPackages) {
    requirePin(relative(options.workspaceRoot, { path: p.archivePath, sha256: p.archiveSha256 }));
    requirePin(relative(options.workspaceRoot, { path: p.manualPath, sha256: p.mainManualSha256 }));
  }
  const closure = pins(r.closurePins);
  if (closure.size !== required.size || Array.from(required).some(([p, pin]) => !samePin(closure.get(p), pin))) fail('CONSUMER_BINDING_CLOSURE_OMITTED');
  const c0Bytes = file(r.preselection.configArchivePin, true), c1Bytes = file(r.selection.configPin);
  if (r.preselection.configArchivePin.sha256 !== r.preselection.configSha256 || r.preselection.configPath !== options.configPath
    || r.preselection.configSha256 === r.selection.configPin.sha256) fail('CONSUMER_BINDING_CONFIG_DELTA');
  const c0 = JSON.parse(c0Bytes), c1 = JSON.parse(c1Bytes);
  const configValid = c => closed(c, ['schemaVersion', 'manifestPin', 'reportPin']) && c.schemaVersion === 'apollo.v4-static-review-local-config.v1-draft'
    && closed(c.manifestPin, ['path','sha256']) && closed(c.reportPin, ['path','sha256'])
    && isPin(relative(options.producerRoot,c.manifestPin)) && isPin(relative(options.producerRoot,c.reportPin));
  if (!configValid(c0) || !configValid(c1) || !samePin(relative(options.producerRoot, c1.manifestPin), r.producer.manifestPin)
    || !samePin(relative(options.producerRoot, c1.reportPin), r.producer.basisPin)) fail('CONSUMER_BINDING_SELECTOR');
  // The operator write may replace the four selector string values only, including exact whitespace.
  let expectedConfig = c0Bytes.toString('utf8');
  for (const key of ['manifestPin','reportPin']) for (const field of ['path','sha256']) {
    const before = JSON.stringify(c0[key][field]), after = JSON.stringify(c1[key][field]);
    if (before !== after) { if (expectedConfig.split(before).length !== 2) fail('CONSUMER_BINDING_CONFIG_DELTA'); expectedConfig = expectedConfig.replace(before, after); }
  }
  if (expectedConfig !== c1Bytes.toString('utf8')) fail('CONSUMER_BINDING_CONFIG_DELTA');
  const outputPins = [];
  if (!Array.isArray(r.producer.outputs) || r.producer.outputs.length !== report.outputs?.length || !r.producer.outputs.length) fail('CONSUMER_BINDING_OUTPUT');
  for (const o of r.producer.outputs) {
    if (!closed(o, ['path','sha256','inputHash','planHash','contentHash','observationHash']) || ![o.sha256,o.inputHash,o.planHash,o.contentHash,o.observationHash].every(h => SHA.test(h))) fail('CONSUMER_BINDING_OUTPUT');
    const p = {path:o.path,sha256:o.sha256}, declared = report.outputs.find(x => x.path === o.path);
    if (!declared || ['sha256','inputHash','planHash','contentHash','observationHash'].some(k => declared[k] !== o[k])) fail('CONSUMER_BINDING_OUTPUT');
    const document = json(p);
    verifyV1Output(document,o,a);
    outputPins.push(p);
  }
  pins(outputPins);
  const build = json(r.final.buildManifestPin);
  if (build.documentType !== 'apollo-v4-local-build-inputs' || !Array.isArray(build.inputs)) fail('CONSUMER_BINDING_BUILD');
  const buildPins = pins(build.inputs.map(p => relative(options.repositoryRoot, p)));
  if (buildPins.has(options.configPath)) fail('CONSUMER_BINDING_CYCLE');
  const producerBuildPins = pins(a.buildInputs.map(p => relative(options.repositoryRoot,p)));
  if (producerBuildPins.size !== buildPins.size || Array.from(buildPins).some(([p,pin]) => !samePin(producerBuildPins.get(p),pin))) fail('CONSUMER_BINDING_BUILD_OMITTED');
  const originalInputs = baseline.standardBuildInputs?.inputs || baseline.buildManifest?.inputs;
  if (!Array.isArray(originalInputs) || !originalInputs.length) fail('CONSUMER_BINDING_BUILD_OMITTED');
  for (const original of originalInputs) {
    if (!buildPins.has(path.join(options.repositoryRoot, original.path))) fail('CONSUMER_BINDING_BUILD_OMITTED');
  }
  for (const v of [v0, v1]) if (v.buildInputs.size !== buildPins.size || Array.from(buildPins).some(([p,pin]) => !samePin(v.buildInputs.get(p),pin))) fail('CONSUMER_BINDING_BUILD_OMITTED');
  const runtimePaths = [
    path.join(options.repositoryRoot, 'dist/runtime.cjs'), path.join(options.repositoryRoot, 'dist/code.js'),
    path.join(options.repositoryRoot, 'dist/ui.html'), path.join(options.repositoryRoot, 'scripts/static-producer-review-inputs.cjs'),
    path.join(options.repositoryRoot, 'packages/generation-core/dist/index.cjs'), path.join(path.dirname(options.configPath), 'static-review-service.js')
  ];
  const runtimes = pins(r.final.runtimePins);
  if (runtimes.size !== runtimePaths.length || runtimePaths.some(p => !runtimes.has(p))) fail('CONSUMER_BINDING_RUNTIME_OMITTED');
  const downstream = new Map();
  for (const [role, items] of [['producer',[r.producer.manifestPin]],['basis',[r.producer.basisPin]],['output',outputPins],['request',a.requestPins],['config-archive',[r.preselection.configArchivePin]],['preselection-vector',[r.preselection.vectorPin]]])
    for (const p of items) if (!v0.files.has(p.path)) downstream.set(p.path,{role,pin:p});
  if (!Array.isArray(r.additions) || r.additions.length !== downstream.size || new Set(r.additions.map(x => x?.pin?.path)).size !== r.additions.length) fail('CONSUMER_BINDING_ADDITION');
  for (const item of r.additions) if (!closed(item,['role','pin']) || item.role !== downstream.get(item.pin?.path)?.role || !samePin(item.pin, downstream.get(item.pin?.path)?.pin)) fail('CONSUMER_BINDING_ADDITION');
  if (v1.files.size !== v0.files.size + downstream.size) fail('CONSUMER_BINDING_VECTOR_OMITTED');
  const configBefore = v0.files.get(options.configPath);
  if (!configBefore || configBefore.sha256 !== r.preselection.configSha256 || !samePin(v1.files.get(options.configPath),r.selection.configPin)) fail('CONSUMER_BINDING_CONFIG_OMITTED');
  for (const [p,pin] of v0.files) if (p !== options.configPath && !samePin(v1.files.get(p),pin)) fail('CONSUMER_BINDING_UNAUTHORIZED_DELTA');
  for (const [p,item] of downstream) if (!samePin(v1.files.get(p),item.pin)) fail('CONSUMER_BINDING_VECTOR_OMITTED');
  for (const p of Array.from(required.values()).concat(Array.from(buildPins.values()),Array.from(runtimes.values()),[r.final.buildManifestPin])) {
    if (!samePin(v0.files.get(p.path),p) && !samePin(downstream.get(p.path)?.pin,p)) fail('CONSUMER_BINDING_VECTOR_OMITTED');
  }
  const forbidden = new Set([trust.path,r.final.vectorPin.path]);
  if (Array.from(v0.files.keys()).some(p => forbidden.has(p) || p === r.preselection.vectorPin.path || outputPins.some(o => o.path === p) || p === r.producer.manifestPin.path || p === r.producer.basisPin.path)
    || Array.from(v1.files.keys()).some(p => forbidden.has(p))) fail('CONSUMER_BINDING_CYCLE');
  for (const p of v1.files.values()) file(p);
  for (const [p,bytes] of bytesByPath) if (p !== trust.path && /\.(?:json|[cm]?js|ts|md|html|swift|sh)$/.test(p)
    && (bytes.includes(trust.sha256) || (v0.files.has(p) && bytes.includes(r.preselection.vectorPin.sha256)))) fail('CONSUMER_BINDING_CYCLE');
  function assertCurrent() {
    for (const [p,bytes] of bytesByPath) { let actual; try { if(fs.realpathSync(p)!==realPaths.get(p))fail('CONSUMER_BINDING_PATH');actual=fs.readFileSync(p); } catch (e) { if(e.code==='CONSUMER_BINDING_PATH')throw e;fail('CONSUMER_BINDING_FILE_MISSING'); }
      if (sha(actual) !== sha(bytes)) fail('CONSUMER_BINDING_READ_CHANGED'); }
  }
  assertCurrent();
  return { result: {status:'matches',receiptHash:trust.sha256,vectorHash:r.final.vectorPin.sha256,configHash:r.selection.configPin.sha256,buildHash:r.final.buildManifestPin.sha256,checkedFiles:v1.files.size,diagnosticCode:null},assertCurrent };
}
function loadConsumerBinding(options = {}) {
  try { return validateConsumerBinding(options); }
  catch (e) { if (/^CONSUMER_BINDING_[A-Z0-9_]{1,60}$/.test(e.code || '')) throw e; fail('CONSUMER_BINDING_SCHEMA'); }
}
module.exports = { VERSION, VECTOR_VERSION, loadConsumerBinding, bindingUnavailable, verifyV1Output };
