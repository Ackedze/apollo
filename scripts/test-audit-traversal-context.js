const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-audit-traversal-context-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/services/auditTraversalContext.ts'),
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

async function main() {
  const { createAuditTraversalContext } = loadModule();
  let importCalls = 0;
  const customStyleOptions = {
    tokenLabelMap: new Map(),
    isKnownStyleId: async () => false,
    resolveStyleMetadata: async () => null,
  };
  const deprecatedStyleOptions = {
    resolveStyleMetadata: async () => null,
  };
  const createContext = () =>
    createAuditTraversalContext({
      importComponentByKey: async (key) => {
        importCalls += 1;
        return { id: `latest:${key}`, key, remote: true };
      },
      customStyleOptions,
      deprecatedStyleOptions,
    });

  const first = createContext();
  const second = createContext();

  first.componentKeyCache.set('node:1', 'component:1');
  first.sceneNodeById.set('node:1', { id: 'node:1' });
  first.referenceStructureCache.set('component:1', []);
  first.localComponentContextCache.set('node:1', true);
  first.checkedComponentNodes.add('node:1');
  first.evaluatedContractV2Nodes.add('node:1');

  assert.equal(second.componentKeyCache.size, 0);
  assert.equal(second.sceneNodeById.size, 0);
  assert.equal(second.referenceStructureCache.size, 0);
  assert.equal(second.localComponentContextCache.size, 0);
  assert.equal(second.checkedComponentNodes.size, 0);
  assert.equal(second.evaluatedContractV2Nodes.size, 0);
  assert.equal(first.customStyleOptions, customStyleOptions);
  assert.equal(first.deprecatedStyleOptions, deprecatedStyleOptions);

  const instance = {
    getMainComponentAsync: async () => ({
      id: 'current:component:1',
      key: 'component:1',
      remote: true,
    }),
  };
  await first.libraryComponentFreshnessChecker.check(instance);
  await first.libraryComponentFreshnessChecker.check(instance);
  assert.equal(importCalls, 1, 'one traversal must share the freshness cache');

  await second.libraryComponentFreshnessChecker.check(instance);
  assert.equal(importCalls, 2, 'separate audits must not share freshness state');

  console.log('Audit traversal context regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
