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

function createFrame(id, name, children = []) {
  return {
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
    children,
  };
}

async function main() {
  global.figma = { mixed: Symbol('mixed') };

  const { snapshotTree } = loadSnapshotModule();

  const child = createFrame('child-node-id', 'Child');
  const root = createFrame('root-node-id', 'Root', [child]);

  const result = await snapshotTree(root, new Set());

  assert.equal(result.length, 2, 'Snapshot tree must contain root and child');
  assert.equal(result[0].id, 1, 'Root snapshot node must have a generated numeric id');
  assert.equal(result[0].parentId, null, 'Root snapshot node must not have a parent id');
  assert.equal(result[0].nodeId, 'root-node-id', 'Root snapshot node must preserve the Figma node id');
  assert.equal(result[0].visible, true, 'Root snapshot node must preserve effective visibility');
  assert.equal(result[1].id, 2, 'Child snapshot node must have a generated numeric id');
  assert.equal(result[1].parentId, 1, 'Child snapshot node must point to the generated parent id');
  assert.equal(result[1].nodeId, 'child-node-id', 'Child snapshot node must preserve the Figma node id');
  assert.equal(result[1].visible, true, 'Child snapshot node must preserve effective visibility');

  console.log('Snapshot tree regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
