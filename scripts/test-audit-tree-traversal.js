const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-audit-tree-traversal-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/services/auditTreeTraversal.ts'),
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
  const { traverseAuditTree } = loadModule();
  const tree = [
    {
      id: 'root',
      visible: true,
      children: [
        { id: 'first', visible: true, children: [] },
        {
          id: 'excluded',
          visible: true,
          children: [{ id: 'excluded-child', visible: true, children: [] }],
        },
        {
          id: 'hidden',
          visible: false,
          children: [{ id: 'hidden-child', visible: true, children: [] }],
        },
        { id: 'last', visible: true, children: [] },
      ],
    },
  ];
  const visited = [];
  let cancellationChecks = 0;

  await traverseAuditTree(tree, {
    isVisible: (node) => node.visible,
    getChildren: (node) => node.children,
    throwIfCancelled: () => {
      cancellationChecks += 1;
    },
    visit: async (node) => {
      visited.push(node.id);
      return node.id === 'excluded' ? { skipChildren: true } : undefined;
    },
  });

  assert.deepEqual(visited, ['root', 'first', 'excluded', 'last']);
  assert.ok(cancellationChecks >= visited.length);

  let cancelled = false;
  await assert.rejects(
    traverseAuditTree(tree, {
      isVisible: () => true,
      getChildren: (node) => node.children,
      throwIfCancelled: () => {
        if (cancelled) throw new Error('cancelled');
      },
      visit: async (node) => {
        cancelled = node.id === 'first';
      },
    }),
    /cancelled/,
  );

  console.log('Audit tree traversal regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
