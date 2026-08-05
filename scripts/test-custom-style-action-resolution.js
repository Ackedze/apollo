const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-custom-style-action-resolution-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/remediation/findingActionResolver.ts'),
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

function emptyCheckState(customStyleEntries, currentItems = []) {
  return {
    relevanceBuckets: {
      technical: [],
      deprecated: [],
      update: [],
      current: currentItems,
      unknown: [],
    },
    themizationEntries: [],
    wrongChannelEntries: [],
    localLibraryItems: [],
    presetItems: [],
    detachedEntries: [],
    customStyleEntries,
    deprecatedStyleEntries: [],
    totalItems: 0,
  };
}

async function main() {
  const { attachFindingActions } = loadModule();
  const { FindingActionRegistry } = loadRegistry();
  const paints = [
    {
      type: 'SOLID',
      color: { r: 1, g: 0, b: 0 },
      opacity: 1,
      blendMode: 'NORMAL',
      visible: true,
    },
  ];
  const node = {
    id: '1:2',
    type: 'RECTANGLE',
    fills: paints,
    fillStyleId: '',
  };
  const entry = {
    id: node.id,
    name: 'Raw red fill',
    nodeType: node.type,
    pageName: 'Page',
    path: 'Page / Raw red fill',
    visible: true,
    reason: 'fill',
    resource: {
      type: 'raw-value',
      name: 'Raw fill',
      key: null,
      library: null,
    },
  };
  const registry = new FindingActionRegistry();
  registry.reset();
  const dependencies = {
    getNodeById: async (nodeId) => (nodeId === node.id ? node : null),
    getPaintStyleFingerprint: () => 'paint:red',
    getNodePaintFingerprint: () => 'paint:red',
    getNodeTypographyFingerprint: () => null,
    findColorTokenValueCandidates: () => [],
    findExactTypographyStyleMatches: () => [],
    findExactPaintStyleMatches: () => [{
      key: 'library-red',
      label: 'Colors/Red',
      library: 'Web :: Core',
    }],
  };

  const checkState = emptyCheckState([entry]);
  await attachFindingActions(checkState, 'Desktop', registry, dependencies);
  assert.equal(entry.actions.length, 1);
  assert.equal(entry.actions[0].label, 'Привязать');
  assert.equal(entry.actions[0].targetName, 'Colors/Red');
  assert.deepEqual(registry.get(entry.actions[0].id), {
    kind: 'bind-style',
    nodeId: node.id,
    expectedStyleId: null,
    targetStyleKey: 'library-red',
    targetName: 'Colors/Red',
    targetLibrary: 'Web :: Core',
    styleField: 'fill',
    reason: 'exact-style-match',
    expectedFingerprint: 'paint:red',
  });

  const multipleEntry = { ...entry, actions: undefined };
  await attachFindingActions(
    emptyCheckState([multipleEntry]),
    'Desktop',
    registry,
    {
      ...dependencies,
      findExactPaintStyleMatches: () => [
        {
          key: 'library-red-light',
          label: 'light/text/primary',
          library: 'Colors Light',
        },
        {
          key: 'library-red-static',
          label: 'static/text-dark/primary',
          library: 'Colors Static',
        },
      ],
    },
  );
  assert.equal(multipleEntry.actions.length, 2);
  assert.deepEqual(
    multipleEntry.actions.map((action) => ({
      targetName: action.targetName,
      targetLibrary: action.targetLibrary,
    })),
    [
      {
        targetName: 'light/text/primary',
        targetLibrary: 'Colors Light',
      },
      {
        targetName: 'static/text-dark/primary',
        targetLibrary: 'Colors Static',
      },
    ],
  );

  const noMatchEntry = { ...entry, actions: undefined };
  await attachFindingActions(
    emptyCheckState([noMatchEntry]),
    'Desktop',
    registry,
    { ...dependencies, findExactPaintStyleMatches: () => [] },
  );
  assert.equal(noMatchEntry.actions, undefined);

  const textNode = {
    id: '1:3',
    type: 'TEXT',
    textStyleId: '',
  };
  const typographyEntry = {
    id: textNode.id,
    name: 'Subtitle',
    nodeType: textNode.type,
    pageName: 'Page',
    path: 'Page / Subtitle',
    visible: true,
    reason: 'typography',
    resource: {
      type: 'raw-value',
      name: '14 px · Regular',
      key: null,
      library: null,
    },
  };
  await attachFindingActions(
    emptyCheckState([typographyEntry]),
    'Desktop',
    registry,
    {
      ...dependencies,
      getNodeById: async (nodeId) =>
        nodeId === textNode.id ? textNode : null,
      getNodeTypographyFingerprint: () =>
        'typography:14:regular:pixels:20:proportional',
      findExactTypographyStyleMatches: () => [
        {
          key: 'paragraph-primary-small',
          label: 'Paragraph/14–20 Primary Small',
          library: 'Web :: Typography',
          fontSize: 14,
          fontStyle: 'Regular',
          lineHeight: 'pixels:20',
          numbersStyle: 'proportional',
        },
      ],
    },
  );
  assert.equal(typographyEntry.actions.length, 1);
  assert.deepEqual(registry.get(typographyEntry.actions[0].id), {
    kind: 'bind-style',
    nodeId: textNode.id,
    expectedStyleId: null,
    targetStyleKey: 'paragraph-primary-small',
    targetName: 'Paragraph/14–20 Primary Small',
    targetLibrary: 'Web :: Typography',
    styleField: 'text',
    reason: 'exact-typography-match',
    expectedFingerprint: 'typography:14:regular:pixels:20:proportional',
  });

  const tokenEntryFromReference = { ...entry, actions: undefined };
  const referenceItem = {
    diffs: [
      {
        nodeId: node.id,
        diffKind: 'paint',
        details: {
          property: 'fill',
          bindingStatus: 'unbound',
          reference: {
            displayName: 'text/primary',
            binding: {
              key: 'variable-primary',
              name: 'text/primary',
              collectionName: 'Interface Dynamic',
            },
          },
          actual: { binding: null },
        },
      },
    ],
  };
  await attachFindingActions(
    emptyCheckState([tokenEntryFromReference], [referenceItem]),
    'Desktop',
    registry,
    { ...dependencies, findExactPaintStyleMatches: () => [] },
  );
  assert.equal(tokenEntryFromReference.actions.length, 1);
  assert.equal(tokenEntryFromReference.actions[0].targetName, 'text/primary');
  assert.equal(
    tokenEntryFromReference.actions[0].targetLibrary,
    'Interface Dynamic',
  );
  assert.deepEqual(registry.get(tokenEntryFromReference.actions[0].id), {
    kind: 'bind-variable',
    nodeId: node.id,
    expectedStyleId: null,
    targetVariableKey: 'variable-primary',
    targetName: 'text/primary',
    targetLibrary: 'Interface Dynamic',
    styleField: 'fill',
    expectedFingerprint: 'paint:red',
  });

  const catalogTokenEntry = { ...entry, actions: undefined };
  await attachFindingActions(
    emptyCheckState([catalogTokenEntry]),
    'Desktop',
    registry,
    {
      ...dependencies,
      findColorTokenValueCandidates: () => [
        {
          key: 'token-red-primary',
          name: 'text/primary',
          library: '002 _ Interface Static Colors',
          sourceFile: '002 _ Interface Static Colors.json',
          collectionName: 'Interface Static',
          matchedModeIds: ['942:1'],
        },
        {
          key: 'token-red-accent',
          name: 'accent/primary',
          library: 'Web _ Themization',
          sourceFile: 'Web _ Themization.json',
          collectionName: 'Theme',
          matchedModeIds: ['1:1'],
        },
      ],
    },
  );
  assert.equal(catalogTokenEntry.actions.length, 2);
  assert.deepEqual(
    catalogTokenEntry.actions.map((action) => ({
      kind: action.kind,
      targetName: action.targetName,
      targetLibrary: action.targetLibrary,
    })),
    [
      {
        kind: 'bind-variable',
        targetName: 'text/primary',
        targetLibrary: 'Interface Static',
      },
      {
        kind: 'bind-variable',
        targetName: 'accent/primary',
        targetLibrary: 'Theme',
      },
    ],
  );

  const alreadyBoundTokenEntry = {
    ...entry,
    actions: undefined,
    resource: { ...entry.resource, type: 'token' },
  };
  await attachFindingActions(
    emptyCheckState([alreadyBoundTokenEntry]),
    'Desktop',
    registry,
    dependencies,
  );
  assert.equal(alreadyBoundTokenEntry.actions, undefined);

  console.log('Custom style action resolution regression checks passed');
}

function loadRegistry() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-custom-style-action-registry-${process.pid}-${Date.now()}.cjs`,
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
