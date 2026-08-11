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
  const {
    collectExperimentalContractV2StructureKeys,
    classifyComponentNode,
    createExperimentalContractV2NestedBaselineDiffs,
    isNativeLocalComponent,
    preloadExperimentalContractV2Structure,
    resolveHostReferenceForContractDiff,
    shouldRunComponentDiff,
  } = loadModule();
  const materializedStructure = [
    {
      id: 1,
      parentId: null,
      nodeId: 'body-cell',
      path: '[D] BodyCell :: Wide',
      type: 'INSTANCE',
      name: '[D] BodyCell :: Wide',
      visible: true,
      componentInstance: { componentKey: 'table-wide-key' },
    },
    {
      id: 2,
      parentId: 1,
      nodeId: 'amount',
      path: '[D] BodyCell :: Wide / Amount',
      type: 'INSTANCE',
      name: 'Amount',
      visible: true,
      componentInstance: { componentKey: 'amount-key' },
    },
    {
      id: 3,
      parentId: 2,
      nodeId: 'amount-major',
      path: '[D] BodyCell :: Wide / Amount / Major',
      type: 'INSTANCE',
      name: 'Major',
      visible: true,
      componentInstance: { componentKey: 'amount-key' },
    },
  ];
  assert.deepEqual(
    Array.from(collectExperimentalContractV2StructureKeys(materializedStructure)),
    ['table-wide-key', 'amount-key'],
    'Materialized subtree preload must include nested component contracts once and in traversal order.',
  );
  let preloadedKeys = [];
  await preloadExperimentalContractV2Structure(
    materializedStructure,
    async (keys) => {
      preloadedKeys = Array.from(keys);
    },
  );
  assert.deepEqual(
    preloadedKeys,
    ['table-wide-key', 'amount-key'],
    'Nested Contract v2 packages must load before tree evaluation on a cold cache.',
  );
  const sparseReference = [
    {
      id: 10,
      parentId: null,
      path: '[D] BodyCell :: Wide',
      type: 'INSTANCE',
      name: '[D] BodyCell :: Wide',
      visible: true,
    },
  ];
  const materializedReference = sparseReference.concat([
    {
      id: 11,
      parentId: 10,
      path: '[D] BodyCell :: Wide / Text / Amount',
      type: 'FRAME',
      name: 'Amount',
      visible: true,
      layout: { itemSpacing: 0 },
      referenceOrigin: 'nested-component',
    },
    {
      id: 12,
      parentId: 11,
      path: '[D] BodyCell :: Wide / Text / Amount / Minor',
      type: 'TEXT',
      name: 'Minor',
      visible: true,
      styles: { text: { styleKey: 'paragraph-14-20' } },
      referenceOrigin: 'nested-component',
    },
  ]);
  assert.equal(
    resolveHostReferenceForContractDiff(
      sparseReference,
      materializedReference,
      materializedStructure,
    ).length,
    materializedReference.length,
    'Contract host evidence must use the expanded nested reference instead of the sparse host catalog.',
  );
  const packageByKey = {
    'table-wide-key': 'web-corp.table-wide',
    'amount-key': 'web-core.amount',
  };
  const referenceAmount = [
    {
      id: 10,
      parentId: null,
      nodeId: 'reference-amount',
      path: 'Amount',
      type: 'INSTANCE',
      name: 'Amount',
      visible: true,
      componentInstance: { componentKey: 'amount-key' },
    },
    {
      id: 11,
      parentId: 10,
      nodeId: 'reference-major',
      path: 'Amount / Major',
      type: 'TEXT',
      name: 'Major',
      visible: true,
    },
  ];
  let nestedCompareCalls = 0;
  const nestedBaselines = createExperimentalContractV2NestedBaselineDiffs(
    materializedStructure,
    {
      resolveContract: (key) => packageByKey[key]
        ? { package: { id: packageByKey[key] } }
        : null,
      resolveReference: (instance) =>
        instance.componentInstance?.componentKey === 'amount-key'
          ? referenceAmount
          : null,
      expandReference: (reference) => reference,
      compare: (actual, reference) => {
        nestedCompareCalls += 1;
        assert.equal(actual[0].path, reference[0].path);
        return [
          { nodePath: actual[0].path, nodeId: actual[0].nodeId, message: 'gap' },
          { nodePath: actual[1].path, nodeId: actual[1].nodeId, message: 'text' },
          { nodePath: actual[1].path, nodeId: actual[1].nodeId, message: 'opacity' },
        ];
      },
    },
  );
  assert.equal(
    nestedCompareCalls,
    1,
    'A nested package must be compared once; internal nodes from the same package are not independent scopes.',
  );
  assert.deepEqual(
    nestedBaselines.get(2)?.map((diff) => diff.message),
    ['gap', 'text', 'opacity'],
    'A parent audit must preserve every direct nested-component baseline difference in its own scope.',
  );

  const paymentStructure = [
    {
      id: 20,
      parentId: null,
      nodeId: 'body-cell-account',
      path: 'Presets=Account',
      type: 'INSTANCE',
      name: '[D] BodyCell :: Wide',
      visible: true,
      componentInstance: { componentKey: 'table-wide-key' },
    },
    {
      id: 21,
      parentId: 20,
      nodeId: 'payment',
      path: 'Presets=Account / PaymentMaskedNumber',
      type: 'INSTANCE',
      name: 'PaymentMaskedNumber',
      visible: true,
      layout: { padding: { top: 2, right: 0, bottom: 2, left: 2 } },
      componentInstance: { componentKey: 'payment-key' },
    },
    {
      id: 22,
      parentId: 21,
      nodeId: 'payment-major',
      path: 'Presets=Account / PaymentMaskedNumber / Major',
      type: 'TEXT',
      name: 'Major',
      visible: true,
      styles: { text: { styleKey: 'custom-major-style' } },
    },
  ];
  const standalonePaymentReference = [
    {
      ...paymentStructure[1],
      id: 30,
      parentId: null,
      path: 'PaymentMaskedNumber',
      layout: { padding: { top: 0, right: 0, bottom: 0, left: 0 } },
    },
    {
      ...paymentStructure[2],
      id: 31,
      parentId: 30,
      path: 'PaymentMaskedNumber / Major',
      styles: { text: { styleKey: 'expected-major-style' } },
    },
  ];
  const paymentBaselines = createExperimentalContractV2NestedBaselineDiffs(
    paymentStructure,
    {
      resolveContract: (key) => packageByKey[key]
        ? { package: { id: packageByKey[key] } }
        : key === 'payment-key'
          ? { package: { id: 'web-corp.payment-masked-number' } }
          : null,
      resolveReference: (instance) =>
        instance.componentInstance?.componentKey === 'payment-key'
          ? standalonePaymentReference
          : null,
      expandReference: (reference) => reference,
      compare: (actual, reference) => {
        assert.equal(reference[0].referenceOrigin, 'nested-component');
        assert.equal(reference[0].referenceOwnerComponentKey, 'payment-key');
        assert.equal(reference[0].referenceOwnerRelativePath, '');
        assert.equal(reference[1].referenceOwnerRelativePath, 'Major');
        assert.equal(
          reference[0].layout.padding.top,
          0,
          'Nested contract evidence must retain the standalone component baseline.',
        );
        assert.equal(reference[1].styles.text.styleKey, 'expected-major-style');
        assert.equal(actual[1].styles.text.styleKey, 'custom-major-style');
        return [{
          nodePath: actual[1].path,
          nodeId: actual[1].nodeId,
          message: 'payment-major-typography',
        }];
      },
    },
  );
  assert.deepEqual(
    paymentBaselines.get(21)?.map((diff) => diff.message),
    ['payment-major-typography'],
    'A materialized host scope must suppress allowed host padding while preserving nested typography violations.',
  );
  assert.equal(
    shouldRunComponentDiff({
      forcedCategory: false,
      needsDiff: true,
      instanceHasOverrides: false,
      requiresSizingRuleAudit: false,
      requiresNumericConstraintAudit: false,
      requiresVariableModeRuleAudit: false,
      requiresCompositionContractAudit: true,
      isInheritedFromLocalComponentContext: false,
    }),
    true,
    'A matching composition contract must trigger deep audit without Figma overrides.',
  );
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
  assert.equal(item.isLocal, false);
  assert.equal(item.componentKey, null);
  assert.equal(item.pageName, 'Page');
  assert.equal(freshnessChecks, 0);

  assert.equal(
    isNativeLocalComponent(null),
    false,
    'A remote component missing from catalogs must not be reported as local.',
  );
  assert.equal(
    isNativeLocalComponent({ id: 'component:local', remote: false }),
    true,
    'A native local component definition must remain local without a catalog entry.',
  );
  assert.equal(
    isNativeLocalComponent({ id: 'component:remote', remote: true }),
    false,
    'A native remote component definition must never be reported as local.',
  );

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
