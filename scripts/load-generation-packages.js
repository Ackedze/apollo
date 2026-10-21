// Local G02 entry point. No Figma writes, release publication or prompt request.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadContractPackages } = require("../packages/generation-core/dist/index.cjs");
const { readZip } = require("../packages/component-contract-core/dist/core.cjs");
const runtimeFile = path.resolve(__dirname, "../dist/runtime.cjs");
const runtime = require(runtimeFile);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const repository = path.resolve(__dirname, "..");
const { readContractCatalog } = require("./contract-catalog.cjs");

async function main() {
  const args = process.argv.slice(2);
  if (!args[0] || args.length > 3) throw new Error('Usage: generation:packages -- <ZIP directory> [output lock.json] [expected lock.json]');
  const directory = path.resolve(args[0]);
  const buildFile = path.resolve(__dirname, "../dist/build-inputs.json");
  const buildBytes = fs.readFileSync(buildFile), build = JSON.parse(buildBytes);
  const coreVersion = JSON.parse(fs.readFileSync(path.join(repository, "./packages/component-contract-core/package.json"))).version;
  if (build.runtimeVersion !== coreVersion || build.profileVersion !== runtime.RUNTIME_VERSION || !Array.isArray(build.inputs) || !build.inputs.length) throw new Error('Apollo runtime build identity is stale. Run v4:validate.');
  for (const input of build.inputs) {
    const absolute = path.resolve(repository, input.path), relative = path.relative(repository, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative) || sha(fs.readFileSync(absolute)) !== input.sha256) throw new Error('Apollo runtime source differs from its build. Run v4:validate.');
  }
  // Read a complete in-memory snapshot. Recheck the files before publishing a
  // lock so an actively edited catalog cannot produce a mixed run identity.
  const catalog = readContractCatalog(directory), archives = catalog.archives;
  const expected = args[2] ? JSON.parse(fs.readFileSync(path.resolve(args[2]))) : undefined;
  const result = await loadContractPackages(archives, { runtime, readZip,
    identity: { coreVersion, profileVersion: runtime.RUNTIME_VERSION, runtimeSha256: sha(fs.readFileSync(runtimeFile)), buildInputsSha256: sha(buildBytes) } }, expected);
  catalog.assertCurrent();
  const output = args[1] ? path.resolve(args[1]) : undefined;
  if (output) {
    if (path.relative(directory, output) === '' || !path.relative(directory, output).startsWith('..') && !path.isAbsolute(path.relative(directory, output))) throw new Error('Write the derived lock outside the source catalog.');
    fs.writeFileSync(output, JSON.stringify(result.lock, null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify({ schemaVersion: result.lock.schemaVersion, lockHash: result.lockHash,
    packages: result.lock.packages.map(entry => ({ componentId: entry.componentId, revision: entry.revision, dependencies: entry.dependencies.length })), output: output || null }, null, 2));
}
main().catch(error => { console.error(error.code || 'GENERATION_PACKAGE_LOAD', error.message); process.exitCode = 1; });
