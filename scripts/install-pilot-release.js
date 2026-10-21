'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { readRelease } = require("../../../services/apollo-proxy/src/contracts/service");
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(Error(code), { code }); };
function syncDirectory(root) { const fd = fs.openSync(root, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function immutableFile(root, name, bytes) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) fail('RELEASE_ARTIFACT_PATH');
  const file = path.join(root, name);
  if (fs.existsSync(file)) {
    if (fs.lstatSync(file).isSymbolicLink() || !fs.lstatSync(file).isFile() || sha(fs.readFileSync(file)) !== sha(bytes)) fail('RELEASE_IMMUTABLE_CONFLICT');
    return;
  }
  const temp = path.join(root, '.artifact-' + crypto.randomUUID() + '.tmp');
  const fd = fs.openSync(temp, 'wx'); try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try {
    // Publish the complete bytes without replacing an existing content-addressed file.
    fs.linkSync(temp, file); syncDirectory(root);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function commitManifest(root, expectedManifestHash, bytes, beforeCommit) {
  const manifestFile = path.join(root, 'manifest.json');
  if (fs.lstatSync(manifestFile).isSymbolicLink()) fail('RELEASE_MANIFEST_SYMLINK');
  const previous = fs.readFileSync(manifestFile);
  if (sha(previous) !== expectedManifestHash) fail('RELEASE_WRITER_CONFLICT');
  immutableFile(root, 'manifest-' + sha(previous) + '.json', previous);
  const temp = path.join(root, '.manifest-' + crypto.randomUUID() + '.tmp');
  const fd = fs.openSync(temp, 'wx'); try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try {
    if (beforeCommit) beforeCommit();
    if (sha(fs.readFileSync(manifestFile)) !== expectedManifestHash) fail('RELEASE_WRITER_CONFLICT');
    fs.renameSync(temp, manifestFile); syncDirectory(root);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return { previousManifestHash: sha(previous), manifestHash: sha(bytes), previousManifestFile: 'manifest-' + sha(previous) + '.json' };
}
function withWriter(root, action) {
  root = fs.realpathSync(root);
  const lock = path.join(root, '.install.lock'), token = crypto.randomUUID();
  let fd; try { fd = fs.openSync(lock, 'wx'); } catch (e) { if (e.code === 'EEXIST') fail('RELEASE_WRITER_BUSY'); throw e; }
  try {
    fs.writeFileSync(fd, JSON.stringify({ token, pid: process.pid })); fs.fsyncSync(fd); syncDirectory(root);
    return action(root);
  } finally { fs.closeSync(fd); if (fs.readFileSync(lock, 'utf8') === JSON.stringify({ token, pid: process.pid })) fs.unlinkSync(lock); syncDirectory(root); }
}
function installRelease({ stagingRoot, activeRoot, expectedManifestHash, updateClass }, hooks = {}) {
  if (updateClass !== 'A') fail('COORDINATED_ACTIVATION_REQUIRED');
  if (!/^[a-f0-9]{64}$/.test(expectedManifestHash || '')) fail('RELEASE_EXPECTED_MANIFEST_REQUIRED');
  if (path.resolve(stagingRoot) !== fs.realpathSync(stagingRoot) || path.resolve(activeRoot) !== fs.realpathSync(activeRoot)) fail('RELEASE_ROOT_ALIAS');
  stagingRoot = fs.realpathSync(stagingRoot);
  const candidate = readRelease(stagingRoot), manifestBytes = fs.readFileSync(path.join(stagingRoot, 'manifest.json'));
  if (JSON.parse(manifestBytes).id !== candidate.manifest.id) fail('RELEASE_STAGING_CHANGED');
  const files = [[candidate.manifest.runtime.file, candidate.manifest.runtime.sha256], ...candidate.contracts.flatMap(c => [[c.entry.file, c.entry.sha256], [c.entry.compiledCache.file, c.entry.compiledCache.sha256]])];
  const artifacts = files.map(([file, hash]) => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(file) || !file.includes('-' + hash + '.')) fail('RELEASE_HASH_FILENAME_REQUIRED');
    const full = path.join(stagingRoot, file); if (fs.realpathSync(full) !== full) fail('RELEASE_ARTIFACT_SYMLINK');
    const bytes = fs.readFileSync(full); if (sha(bytes) !== hash) fail('RELEASE_STAGING_CHANGED'); return { file, bytes };
  });
  return withWriter(activeRoot, root => {
    if (root === stagingRoot) fail('RELEASE_ACTIVE_STAGING_SAME');
    const current = readRelease(root);
    if (current.manifest.runtime.sha256 !== candidate.manifest.runtime.sha256 || current.manifest.runtime.version !== candidate.manifest.runtime.version) fail('COORDINATED_RUNTIME_ACTIVATION_REQUIRED');
    for (const previous of current.contracts) {
      const retained = candidate.contracts.find(c => c.entry.componentId === previous.entry.componentId);
      if (!retained || JSON.stringify(retained.entry) !== JSON.stringify(previous.entry)) fail('COORDINATED_CONTRACT_ACTIVATION_REQUIRED');
    }
    if (sha(fs.readFileSync(path.join(root, 'manifest.json'))) !== expectedManifestHash) fail('RELEASE_WRITER_CONFLICT');
    for (const artifact of artifacts) immutableFile(root, artifact.file, artifact.bytes);
    syncDirectory(root);
    const receipt = commitManifest(root, expectedManifestHash, manifestBytes, hooks.beforeCommit);
    if (readRelease(root).manifest.id !== candidate.manifest.id) fail('RELEASE_COMMIT_READBACK_FAILED');
    return { ...receipt, releaseId: candidate.manifest.id, updateClass: 'A', atomicScope: 'audit manifest only', generationActivated: false };
  });
}
function rollbackAudit({ activeRoot, expectedManifestHash, previousManifestHash }, hooks = {}) {
  if (!/^[a-f0-9]{64}$/.test(previousManifestHash || '') || !/^[a-f0-9]{64}$/.test(expectedManifestHash || '')) fail('RELEASE_EXPECTED_MANIFEST_REQUIRED');
  if (path.resolve(activeRoot) !== fs.realpathSync(activeRoot)) fail('RELEASE_ROOT_ALIAS');
  return withWriter(activeRoot, root => {
    const file = path.join(root, 'manifest-' + previousManifestHash + '.json');
    if (fs.realpathSync(file) !== file) fail('RELEASE_ARTIFACT_SYMLINK');
    const bytes = fs.readFileSync(file); if (sha(bytes) !== previousManifestHash) fail('RELEASE_ROLLBACK_CHECKSUM');
    // Validate the saved set without switching the active manifest or aliasing the root.
    const saved = readRelease(root, path.basename(file)).manifest, current = readRelease(root);
    if (saved.runtime.sha256 !== current.manifest.runtime.sha256 || saved.runtime.version !== current.manifest.runtime.version) fail('COORDINATED_RUNTIME_ACTIVATION_REQUIRED');
    for (const [name, hash] of [[saved.runtime.file, saved.runtime.sha256], ...saved.contracts.flatMap(c => [[c.file, c.sha256], [c.compiledCache.file, c.compiledCache.sha256]])]) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) fail('RELEASE_ARTIFACT_PATH');
      const full = path.join(root, name); if (fs.realpathSync(full) !== full || sha(fs.readFileSync(full)) !== hash) fail('RELEASE_ROLLBACK_CHECKSUM');
    }
    const result = commitManifest(root, expectedManifestHash, bytes, hooks.beforeCommit); readRelease(root);
    return { ...result, releaseId: saved.id, atomicScope: 'audit manifest only', generationActivated: false };
  });
}
if (require.main === module) {
  try {
    const [command, a, b, c] = process.argv.slice(2);
    const result = command === 'install' ? installRelease({ stagingRoot: path.resolve(a), activeRoot: path.resolve(b), expectedManifestHash: c, updateClass: 'A' })
      : command === 'rollback' ? rollbackAudit({ activeRoot: path.resolve(a), expectedManifestHash: b, previousManifestHash: c }) : fail('INSTALL_OR_ROLLBACK_REQUIRED');
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.code || error.message); process.exitCode = 1; }
}
module.exports = { installRelease, rollbackAudit };
