const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-finding-action-registry-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/remediation/findingActionRegistry.ts'),
    ],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node18'],
    logLevel: 'silent',
  });
  try {
    return require(outfile);
  } finally {
    fs.rmSync(outfile, { force: true });
  }
}

function main() {
  const { FindingActionRegistry } = loadModule();
  const registry = new FindingActionRegistry();
  registry.reset();
  const action = {
    kind: 'swap-component',
    nodeId: '1:2',
    expectedComponentKey: 'source-key',
    targetComponentKey: 'target-key',
    targetName: '[D] Button',
    targetLibrary: 'Web :: Core',
    reason: 'wrong-channel',
  };
  const runtimeNode = { id: '1:2', type: 'INSTANCE' };
  const summary = registry.register(
    action,
    'Заменить',
    'wrongChannel',
    runtimeNode,
  );

  assert.equal(summary.kind, 'swap-component');
  assert.equal(summary.targetName, '[D] Button');
  assert.equal(summary.scope, 'wrongChannel');
  assert.deepEqual(registry.get(summary.id), action);
  assert.equal(registry.getRuntimeNode(summary.id), runtimeNode);
  assert.equal(registry.claim(summary.id), true);
  assert.equal(registry.claim(summary.id), false);
  registry.release(summary.id);
  assert.equal(registry.claim(summary.id), true);

  registry.reset();
  assert.equal(registry.get(summary.id), null);
  assert.equal(registry.getRuntimeNode(summary.id), null);

  console.log('Finding action registry regression checks passed');
}

main();
