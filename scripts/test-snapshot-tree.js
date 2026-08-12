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
    overrides: [
      { id: 'nested-label-id', overriddenFields: ['fills'] },
    ],
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
  root.clipsContent = true;
  root.effects = [];
  root.width = 1200;
  root.boundVariables.width = { id: 'VariableID:grid-width' };
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
  assert.equal(
    result[0].clipsContent,
    true,
    'Snapshot must preserve clipsContent for Contract v2 propertiesEqual rules',
  );
  assert.deepEqual(
    result[0].effects,
    [],
    'Snapshot must preserve an explicitly empty effects list as a comparable baseline',
  );
  assert.equal(
    result[0].layout.widthToken,
    'VariableID:grid-width',
    'Snapshot must preserve the width variable binding for configuration policies',
  );
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
    {color: 'paint:GRADIENT_LINEAR', token: null, paintTypes: ['GRADIENT_LINEAR']},
    'Visible non-solid fills must remain observable for deterministic no-fill rules',
  );

  const hiddenChild = createFrame('hidden-child-node-id', 'Hidden child');
  hiddenChild.visible = false;
  const hiddenGrandchild = createFrame(
    'hidden-grandchild-node-id',
    'Hidden grandchild',
  );
  hiddenChild.children.push(hiddenGrandchild);
  hiddenGrandchild.parent = hiddenChild;
  root.children.push(hiddenChild);
  hiddenChild.parent = root;

  const visibleOnlyResult = await snapshotTree(root, new Set());
  assert.equal(
    visibleOnlyResult.some((entry) => entry.nodeId === 'hidden-child-node-id'),
    false,
    'Default snapshots must continue to omit hidden branches',
  );
  const structuralResult = await snapshotTree(root, new Set(), {
    includeHidden: true,
  });
  const hiddenChildSnapshot = structuralResult.find(
    (entry) => entry.nodeId === 'hidden-child-node-id',
  );
  const hiddenGrandchildSnapshot = structuralResult.find(
    (entry) => entry.nodeId === 'hidden-grandchild-node-id',
  );
  assert.equal(
    hiddenChildSnapshot?.visible,
    false,
    'Structural snapshots must retain a hidden composition node',
  );
  assert.equal(
    hiddenGrandchildSnapshot?.visible,
    false,
    'Descendants of a hidden composition node must retain effective visibility=false',
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
      directOverrides: [
        { nodeId: 'nested-label-id', fields: ['fills'] },
      ],
    },
    'Snapshot must preserve exposed component properties used by Contract v2 conditions',
  );

  console.log('Snapshot tree regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
