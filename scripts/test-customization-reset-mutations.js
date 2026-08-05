const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-customization-reset-mutations-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(
        __dirname,
        '../src/actions/customizationResetMutations.ts',
      ),
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
  const { createCustomizationResetMutations } = loadModule();
  const staleBindingNode = {
    id: 'I1:2;3:4',
    type: 'FRAME',
    removed: false,
    setBoundVariable() {
      throw new Error('The node with id "I1:2;3:4" does not exist');
    },
  };
  const targetNode = {
    id: staleBindingNode.id,
    type: 'FRAME',
    removed: false,
    layoutMode: 'HORIZONTAL',
    paddingTop: 0,
  };
  const variable = {
    id: 'VariableID:padding-12',
    key: 'padding-12',
    resolvedType: 'FLOAT',
    valuesByMode: {},
  };
  globalThis.figma = {
    variables: {
      getVariableByIdAsync: async () => variable,
      importVariableByKeyAsync: async () => variable,
      setBoundVariableForPaint: (paint) => paint,
    },
    importStyleByKeyAsync: async () => null,
  };

  const mutations = createCustomizationResetMutations({
    resolveVariableMetadata: () => null,
    getSceneNodeById: async () => staleBindingNode,
  });
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    await mutations.applyReferenceResetByMessages(
      targetNode,
      {
        id: 1,
        path: 'Root / Cell',
        type: 'FRAME',
        layout: {
          mode: 'HORIZONTAL',
          padding: { top: 12, right: 0, bottom: 0, left: 0 },
          paddingTokens: { top: variable.id },
        },
      },
      ['Token padding top: 8 → 12'],
    );
  } finally {
    console.warn = originalWarn;
    delete globalThis.figma;
  }

  assert.equal(targetNode.paddingTop, 12);
  assert.ok(
    warnings.some(
      (args) => args[0] === '[Apollo] skip variable binding for stale node',
    ),
    'Removed instance sublayers must be handled without propagating a Figma mutation error',
  );

  console.log('Customization reset mutation regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
