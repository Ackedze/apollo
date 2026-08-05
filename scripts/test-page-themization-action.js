const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-page-themization-action-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/actions/pageThemizationAction.ts'),
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
  const { applyPageThemeMode } = loadModule();
  const documentNode = { id: '0:0', type: 'DOCUMENT', parent: null };
  const collection = {
    id: 'VariableCollectionId:theme',
    name: 'Theme',
    modes: [
      { modeId: 'mode-base', name: 'Base' },
      { modeId: 'mode-corp', name: 'Corp' },
    ],
  };
  const page = {
    id: '1:1',
    type: 'PAGE',
    parent: documentNode,
    explicitVariableModes: {},
    setExplicitVariableModeForCollection(targetCollection, modeId) {
      this.explicitVariableModes[targetCollection.id] = modeId;
    },
  };
  const targetNode = { id: '2:2', type: 'FRAME', parent: page };

  globalThis.figma = {
    getNodeByIdAsync: async (nodeId) =>
      nodeId === targetNode.id ? targetNode : null,
    variables: {
      getVariableCollectionByIdAsync: async (collectionId) =>
        collectionId === collection.id ? collection : null,
    },
  };

  const result = await applyPageThemeMode({
    nodeId: targetNode.id,
    themeCollectionId: collection.id,
    targetModeId: 'mode-corp',
  });
  assert.equal(result.ok, true);
  assert.equal(page.explicitVariableModes[collection.id], 'mode-corp');
  assert.equal(result.focusNode, targetNode);

  const invalidModeResult = await applyPageThemeMode({
    nodeId: targetNode.id,
    themeCollectionId: collection.id,
    targetModeId: 'mode-unknown',
  });
  assert.deepEqual(invalidModeResult, {
    ok: false,
    message: 'Mode Corp не найден в коллекции Theme.',
  });

  const missingNodeResult = await applyPageThemeMode({
    nodeId: 'missing',
    themeCollectionId: collection.id,
    targetModeId: 'mode-corp',
  });
  assert.deepEqual(missingNodeResult, {
    ok: false,
    message: 'Не удалось найти узел для смены темизации.',
  });

  delete globalThis.figma;
  console.log('Page themization action regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
