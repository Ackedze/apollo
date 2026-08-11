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
      setBoundVariableForPaint: (paint, field, boundVariable) => ({
        ...paint,
        boundVariables: {
          ...(paint.boundVariables || {}),
          [field]: {id: boundVariable.id},
        },
      }),
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

    const paintedNode = {
      id: 'painted-node',
      type: 'FRAME',
      fills: [{type: 'SOLID', color: {r: 1, g: 0, b: 0}}],
      strokes: [{type: 'SOLID', color: {r: 0, g: 0, b: 0}}],
      strokeWeight: 1,
    };
    await mutations.applyReferenceResetByDetails(paintedNode, [
      {
        property: 'fill',
        reference: {value: null},
      },
      {
        property: 'stroke',
        reference: {value: null},
      },
    ]);
    assert.deepEqual(
      paintedNode.fills,
      [],
      'A null fill baseline must remove the custom fill',
    );
    assert.deepEqual(
      paintedNode.strokes,
      [],
      'A null stroke baseline must remove the custom stroke',
    );
    assert.equal(
      paintedNode.strokeWeight,
      0,
      'Removing the baseline-less stroke must reset its weight',
    );

    const borderNode = {
      id: 'border-node',
      type: 'FRAME',
      fills: [{type: 'SOLID', color: {r: 1, g: 0, b: 0}}],
      strokes: [],
      strokeWeight: 0,
      strokeAlign: 'CENTER',
    };
    await mutations.applyReferencePaintSurfaceReset(borderNode, {
      id: 2,
      path: 'Root / Border',
      type: 'FRAME',
      fill: {color: '#FFFFFF'},
      stroke: {
        color: '#0F1937',
        weight: 1,
        align: 'INSIDE',
      },
    }, [
      {
        property: 'fill',
        reference: {value: null},
        resetSurface: 'paint',
      },
    ]);
    assert.deepEqual(
      borderNode.fills,
      [],
      'A Border surface reset must remove the forbidden fill',
    );
    assert.equal(
      borderNode.strokes.length,
      1,
      'A Border surface reset must restore the reference stroke',
    );
    assert.equal(borderNode.strokeWeight, 1);
    assert.equal(borderNode.strokeAlign, 'INSIDE');

    const amountPaintNode = {
      id: 'amount-paint-node',
      type: 'TEXT',
      fills: [{type: 'SOLID', color: {r: 1, g: 0, b: 0}}],
    };
    await mutations.applyReferenceResetByDetails(amountPaintNode, [
      {
        property: 'fill',
        reference: {
          value: 'text/primary',
          resourceType: 'token',
          resourceId: variable.id,
        },
      },
    ]);
    assert.equal(
      amountPaintNode.fills[0].boundVariables.color.id,
      variable.id,
      'Amount fill reset must restore the variable binding, not only its RGBA value',
    );

    const unresolvedTextStyleNode = {
      id: 'unresolved-text-style-node',
      type: 'TEXT',
      textStyleId: 'style-16-20',
    };
    await assert.rejects(
      mutations.applyReferenceResetByDetails(unresolvedTextStyleNode, [
        {
          property: 'styles.text',
          reference: {value: 'style-14-20'},
        },
      ]),
      /without a reference style resource/,
    );
    assert.equal(
      unresolvedTextStyleNode.textStyleId,
      'style-16-20',
      'An unresolved synthetic text-style finding must not detach the current style',
    );

    const amountLayoutNode = {
      id: 'amount-layout-node',
      type: 'FRAME',
      primaryAxisAlignItems: 'MIN',
      counterAxisAlignItems: 'MIN',
    };
    await mutations.applyReferenceResetByDetails(amountLayoutNode, [
      {
        property: 'layout.primaryAxisAlignItems',
        reference: {value: 'MAX'},
      },
      {
        property: 'layout.counterAxisAlignItems',
        reference: {value: 'MIN'},
      },
    ]);
    assert.equal(amountLayoutNode.primaryAxisAlignItems, 'MAX');
    assert.equal(amountLayoutNode.counterAxisAlignItems, 'MIN');

    const rejectedLayoutNode = {id: 'rejected-layout-node', type: 'FRAME'};
    Object.defineProperties(rejectedLayoutNode, {
      primaryAxisAlignItems: {
        configurable: true,
        get: () => 'MIN',
        set: () => {},
      },
      counterAxisAlignItems: {
        configurable: true,
        get: () => 'MIN',
        set: () => {},
      },
    });
    await assert.rejects(
      mutations.applyReferenceResetByDetails(rejectedLayoutNode, [
        {
          property: 'layout.primaryAxisAlignItems',
          reference: {value: 'MAX'},
        },
      ]),
      /Figma did not preserve primaryAxisAlignItems=MAX/,
      'A rejected Figma layout mutation must not be reported as successful',
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
