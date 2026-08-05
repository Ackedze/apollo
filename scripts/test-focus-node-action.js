const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-focus-node-action-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/actions/focusNode.ts')],
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
  const { findContainingPage, focusNode } = loadModule();
  const documentNode = { id: '0:0', type: 'DOCUMENT', parent: null };
  const targetPage = { id: '1:1', type: 'PAGE', parent: documentNode, selection: [] };
  const frame = { id: '2:2', type: 'FRAME', parent: targetPage };
  const targetNode = { id: '3:3', type: 'INSTANCE', parent: frame };
  const currentPage = { id: '4:4', type: 'PAGE', parent: documentNode, selection: [] };
  const notifications = [];
  const pageChanges = [];
  const viewportTargets = [];

  globalThis.figma = {
    currentPage,
    getNodeByIdAsync: async (nodeId) =>
      nodeId === targetNode.id ? targetNode : null,
    notify: (message) => notifications.push(message),
    setCurrentPageAsync: async (page) => {
      pageChanges.push(page.id);
      globalThis.figma.currentPage = page;
    },
    viewport: {
      scrollAndZoomIntoView: (nodes) => viewportTargets.push(nodes.map((node) => node.id)),
    },
  };

  assert.equal(findContainingPage(targetNode), targetPage);
  await focusNode(targetNode.id);
  assert.deepEqual(pageChanges, [targetPage.id]);
  assert.deepEqual(targetPage.selection, [targetNode]);
  assert.deepEqual(viewportTargets, [[targetNode.id]]);
  assert.deepEqual(notifications, []);

  await focusNode('missing');
  assert.equal(notifications.at(-1), 'Не удалось найти слой для перехода');

  const orphanNode = { id: '5:5', type: 'INSTANCE', parent: null };
  globalThis.figma.getNodeByIdAsync = async () => orphanNode;
  await focusNode(orphanNode.id);
  assert.equal(
    notifications.at(-1),
    'Не удалось определить страницу для этого слоя',
  );

  delete globalThis.figma;
  console.log('Focus node action regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
