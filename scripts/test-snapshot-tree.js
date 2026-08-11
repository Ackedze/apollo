const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadSnapshotModule() {
  const entryPoint = path.resolve(__dirname, '../src/structure/snapshot.ts');
  const outfile = path.join(
    os.tmpdir(),
    `apollo-snapshot-tree-${process.pid}-${Date.now()}.cjs`,
  );

  esbuild.buildSync({
    entryPoints: [entryPoint],
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

function createFrame(id, name, children = [], modes = {}) {
  const frame = {
    id,
    type: 'FRAME',
    name,
    visible: true,
    opacity: 1,
    layoutMode: 'VERTICAL',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    itemSpacing: 8,
    boundVariables: {},
    explicitVariableModes: modes.explicit ?? {},
    resolvedVariableModes: modes.resolved ?? {},
    parent: modes.parent ?? null,
    children,
  };
  for (const child of children) {
    child.parent = frame;
  }
  return frame;
}

function createInstance(id, name) {
  return {
    id,
    type: 'INSTANCE',
    name,
    visible: true,
    opacity: 1,
    boundVariables: {},
    variantProperties: { View: 'Wide' },
    componentProperties: {
      'Presets#101:202': { type: 'VARIANT', value: 'Amount' },
      'Compact#101:203': { type: 'BOOLEAN', value: false },
      'Capacity#101:204': { type: 'TEXT', value: 4 },
      'Swap#101:205': { type: 'INSTANCE_SWAP', value: { id: 'ignored' } },
    },
    getMainComponentAsync: async () => ({ key: 'body-cell-wide-key' }),
    parent: null,
  };
}

async function main() {
  global.figma = { mixed: Symbol('mixed') };

  const { snapshotNode, snapshotTree } = loadSnapshotModule();

  const collectionId = 'VariableCollectionId:grid';
  const child = createFrame('child-node-id', 'Child', [], {
    resolved: { [collectionId]: 'mode-1024' },
  });
  const root = createFrame('root-node-id', 'Root', [child], {
    explicit: { [collectionId]: 'mode-1024' },
    resolved: { [collectionId]: 'mode-1024' },
  });
  const gradient = createFrame('gradient-node-id', 'Gradient');
  gradient.fills = [
    {
      type: 'GRADIENT_LINEAR',
      visible: true,
      opacity: 1,
      gradientStops: [],
    },
  ];
  root.children.push(gradient);
  gradient.parent = root;

  const result = await snapshotTree(root, new Set());

  assert.equal(result.length, 3, 'Snapshot tree must contain root and both children');
  assert.equal(result[0].id, 1, 'Root snapshot node must have a generated numeric id');
  assert.equal(result[0].parentId, null, 'Root snapshot node must not have a parent id');
  assert.equal(result[0].nodeId, 'root-node-id', 'Root snapshot node must preserve the Figma node id');
  assert.equal(result[0].visible, true, 'Root snapshot node must preserve effective visibility');
  assert.equal(result[1].id, 2, 'Child snapshot node must have a generated numeric id');
  assert.equal(result[1].parentId, 1, 'Child snapshot node must point to the generated parent id');
  assert.equal(result[1].nodeId, 'child-node-id', 'Child snapshot node must preserve the Figma node id');
  assert.equal(result[1].visible, true, 'Child snapshot node must preserve effective visibility');
  assert.deepEqual(result[1].variableModes, [
    {
      collectionId,
      resolvedModeId: 'mode-1024',
      explicitModeId: 'mode-1024',
      explicitOwnerNodeId: 'root-node-id',
      explicitOwnerName: 'Root',
      explicitOwnerPath: 'Root',
    },
  ]);
  assert.deepEqual(
    result[2].fill,
    {color: 'paint:GRADIENT_LINEAR', token: null},
    'Visible non-solid fills must remain observable for deterministic no-fill rules',
  );

  const instanceSnapshot = await snapshotNode(
    createInstance('instance-node-id', '[D] BodyCell :: Wide'),
    '',
  );
  assert.deepEqual(
    instanceSnapshot.componentInstance,
    {
      componentKey: 'body-cell-wide-key',
      variantProperties: { View: 'Wide' },
      componentProperties: {
        Presets: 'Amount',
        Compact: 'false',
        Capacity: '4',
      },
    },
    'Snapshot must preserve exposed component properties used by Contract v2 conditions',
  );

  console.log('Snapshot tree regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
