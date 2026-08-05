const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-component-classifier-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/services/componentClassifier.ts')],
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

function dependencies(overrides = {}) {
  return {
    getComponentKeyCached: async () => null,
    buildNodeSegments: (node) => [
      { id: node.id, label: node.name, nodeType: node.type, visible: true },
    ],
    getReferenceStructureCached: () => null,
    isInsideLocalComponentContext: async () => false,
    resolveTokenLabel: (token) => token,
    isPaintToken: () => true,
    resolveVariableMetadata: () => null,
    resolveVariableCollectionMetadata: () => null,
    normalizeRelevanceStatus: () => 'unknown',
    reportMissingReference: () => {},
    debugDiffPipeline: () => {},
    throwIfCancelled: () => {},
    ...overrides,
  };
}

async function main() {
  const { classifyComponentNode } = loadModule();
  let freshnessChecks = 0;
  const page = { id: 'page:1', name: 'Page', type: 'PAGE', parent: null };
  const node = {
    id: 'instance:1',
    name: 'Local component',
    type: 'INSTANCE',
    parent: page,
    overrides: [],
  };
  const traversalContext = {
    componentKeyCache: new Map(),
    referenceStructureCache: new Map(),
    localComponentContextCache: new Map(),
    checkedComponentNodes: new Set(),
    libraryComponentFreshnessChecker: {
      check: async () => {
        freshnessChecks += 1;
        throw new Error('freshness must not run without a component key');
      },
      getStats: () => ({
        checks: freshnessChecks,
        importCacheHits: 0,
        importCacheMisses: 0,
      }),
    },
    customStyleOptions: {},
    deprecatedStyleOptions: {},
  };

  const item = await classifyComponentNode(
    node,
    null,
    traversalContext,
    dependencies(),
  );
  assert.equal(item.relevance, 'unknown');
  assert.equal(item.isLocal, true);
  assert.equal(item.componentKey, null);
  assert.equal(item.pageName, 'Page');
  assert.equal(freshnessChecks, 0);

  await assert.rejects(
    classifyComponentNode(
      node,
      null,
      traversalContext,
      dependencies({
        throwIfCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ),
    /cancelled/,
  );

  console.log('Component classifier boundary regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
