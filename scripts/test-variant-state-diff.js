const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadDiffModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-variant-state-diff-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/structure/diff.ts')],
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

function node(overrides) {
  return {
    id: 1,
    parentId: null,
    path: 'Host',
    type: 'INSTANCE',
    name: 'Host',
    visible: true,
    radius: 0,
    componentInstance: { componentKey: 'host' },
    ...overrides,
  };
}

function main() {
  const { diffExplicitNestedVariantStates, diffStructures } = loadDiffModule();

  const actual = [
    node({
      id: 1,
      nodeId: '1:host',
      path: 'ButtonsGroup',
      name: '[D] ButtonsGroup',
      componentInstance: { componentKey: 'buttons-group' },
    }),
    node({
      id: 2,
      nodeId: '1:button',
      parentId: 1,
      path: 'ButtonsGroup / [D] Button@@2',
      name: '[D] Button',
      componentInstance: {
        componentKey: 'button-secondary-icon',
        variantProperties: {
          View: 'Secondary',
          SingleIcon: 'True',
        },
      },
    }),
  ];

  const reference = [
    node({
      id: 10,
      path: 'ButtonsGroup',
      name: '[D] ButtonsGroup',
      componentInstance: { componentKey: 'buttons-group' },
    }),
    node({
      id: 11,
      parentId: 10,
      path: 'ButtonsGroup / [D] Button@@2',
      name: '[D] Button',
      componentInstance: {
        componentKey: 'button-secondary',
        variantProperties: {
          View: 'Secondary',
          SingleIcon: 'False',
        },
      },
    }),
  ];

  const { diffs } = diffStructures(actual, reference);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].nodeId, '1:button');
  assert.equal(diffs[0].nodeName, '[D] Button');
  assert.equal(diffs[0].message, 'singleIcon: false → true');
  assert.equal(diffs[0].details.property, 'variant.SingleIcon');
  assert.equal(diffs[0].details.reference.value, 'False');
  assert.equal(diffs[0].details.actual.value, 'True');

  const duplicateButtonsActual = [
    node({
      id: 301,
      nodeId: 'dup:host',
      path: 'Size=56, Overflow=false',
      name: '[D] ButtonsGroup',
      componentInstance: { componentKey: 'buttons-group' },
    }),
    ...[1, 2, 3, 4].map((index) =>
      node({
        id: 301 + index,
        nodeId: `dup:button:${index}`,
        parentId: 301,
        path: 'Size=56, Overflow=false / [D] Button',
        name: '[D] Button',
        componentInstance: {
          componentKey: index === 3 ? 'button-secondary-icon' : 'button-secondary',
          variantProperties: {
            View: index === 1 ? 'Primary' : 'Secondary',
            SingleIcon: index === 3 ? 'True' : 'False',
          },
        },
      }),
    ),
  ];
  const duplicateButtonsReference = [
    node({
      id: 401,
      path: 'Size=56, Overflow=false',
      name: '[D] ButtonsGroup',
      componentInstance: { componentKey: 'buttons-group' },
    }),
    ...[1, 2, 3, 4].map((index) =>
      node({
        id: 401 + index,
        parentId: 401,
        path: 'Size=56, Overflow=false / [D] Button',
        name: '[D] Button',
        componentInstance: {
          componentKey: 'button-secondary',
          variantProperties: {
            View: index === 1 ? 'Primary' : 'Secondary',
            SingleIcon: 'False',
          },
        },
      }),
    ),
  ];
  const duplicateButtonDiffs = diffExplicitNestedVariantStates(
    duplicateButtonsActual,
    duplicateButtonsReference,
  );
  assert.deepEqual(
    duplicateButtonDiffs.map((diff) => `${diff.nodeId}:${diff.message}`),
    ['dup:button:3:singleIcon: false → true'],
    'Explicit nested variant state diff must preserve the third duplicate Button occurrence',
  );
  assert.equal(
    duplicateButtonDiffs[0].nodePath,
    'Size=56, Overflow=false / [D] Button@@3',
  );
  assert.equal(duplicateButtonDiffs[0].details.property, 'variant.SingleIcon');

  const mixedCaseActual = [
    node({
      id: 101,
      nodeId: 'case:host',
      path: 'ButtonsGroup',
      name: '[D] ButtonsGroup',
      componentInstance: { componentKey: 'buttons-group' },
    }),
    node({
      id: 102,
      nodeId: 'case:button',
      parentId: 101,
      path: 'ButtonsGroup / [D] Button@@2',
      name: '[D] Button',
      componentInstance: {
        componentKey: 'button-secondary-icon',
        variantProperties: {
          view: 'Secondary',
          singleIcon: 'True',
        },
      },
    }),
  ];
  const mixedCaseDiffs = diffStructures(mixedCaseActual, reference).diffs;
  assert.deepEqual(
    mixedCaseDiffs.map((diff) => diff.message),
    ['singleIcon: false → true'],
    'Variant property comparison must match reference and actual keys case-insensitively',
  );
  assert.equal(mixedCaseDiffs[0].details.property, 'variant.SingleIcon');
  assert.equal(mixedCaseDiffs[0].details.reference.value, 'False');
  assert.equal(mixedCaseDiffs[0].details.actual.value, 'True');

  const promoActual = [
    node({
      id: 201,
      nodeId: 'promo:card',
      path: 'Size=Large, Image=Top, ImageCrop=True',
      name: '[D] PromoCard',
      componentInstance: {
        componentKey: 'promo-card',
        variantProperties: {
          image: 'top',
          imageCrop: 'true',
          size: 'large',
        },
      },
    }),
  ];
  const promoReference = [
    node({
      id: 202,
      path: 'Size=Large, Image=Top, ImageCrop=True',
      type: 'COMPONENT',
      name: 'Size=Large, Image=Top, ImageCrop=True',
      componentInstance: null,
    }),
  ];
  assert.deepEqual(
    diffStructures(promoActual, promoReference).diffs,
    [],
    'Reference COMPONENT variant names must be treated as expected variant state',
  );

  const unanchoredPromoActual = [
    node({
      id: 203,
      nodeId: 'promo:button-group',
      path: 'PromoCard / [D] ButtonGroup',
      name: '[D] ButtonGroup',
      componentInstance: {
        componentKey: 'button-group',
        variantProperties: {
          axis: 'horizontal',
          primaryButton: 'true',
          secondaryButton: 'false',
        },
      },
    }),
  ];
  const unanchoredPromoReference = [
    node({
      id: 204,
      path: 'PromoCard / [D] ButtonGroup',
      name: '[D] ButtonGroup',
      componentInstance: {
        componentKey: 'button-group',
      },
    }),
  ];
  assert.deepEqual(
    diffStructures(unanchoredPromoActual, unanchoredPromoReference).diffs,
    [],
    'Unanchored unknown variant properties should not be reported as customizations',
  );

  const unanchoredReference = [
    node({
      id: 20,
      path: 'ButtonsGroup',
      name: '[D] ButtonsGroup',
      componentInstance: { componentKey: 'buttons-group' },
    }),
    node({
      id: 21,
      parentId: 20,
      path: 'ButtonsGroup / [D] Button@@3',
      name: '[D] Button',
      componentInstance: {
        componentKey: 'button-secondary',
      },
    }),
  ];
  const unanchoredActual = [
    node({
      id: 30,
      nodeId: '2:host',
      path: 'ButtonsGroup',
      name: '[D] ButtonsGroup',
      componentInstance: { componentKey: 'buttons-group' },
    }),
    node({
      id: 31,
      nodeId: '2:button',
      parentId: 30,
      path: 'ButtonsGroup / [D] Button@@3',
      name: '[D] Button',
      componentInstance: {
        componentKey: 'button-secondary-icon',
        variantProperties: {
          DisabledState: 'False',
          Shape: 'Rectangular',
          SingleIcon: 'True',
          Size: '56',
          View: 'Secondary',
        },
      },
    }),
  ];
  const baselineRestoredReference = unanchoredReference.map((item) =>
    item.path === 'ButtonsGroup / [D] Button@@3'
      ? {
          ...item,
          componentInstance: {
            ...item.componentInstance,
            variantProperties: {
              DisabledState: 'False',
              Shape: 'Rectangular',
              SingleIcon: 'False',
              Size: '56',
              View: 'Secondary',
            },
          },
        }
      : item,
  );
  const unanchored = diffStructures(
    unanchoredActual,
    baselineRestoredReference,
  ).diffs;
  assert.deepEqual(
    unanchored.map((diff) => diff.details.property),
    ['variant.SingleIcon'],
    'Default variant states should be suppressed, but changed SingleIcon=True must stay visible',
  );
  assert.equal(unanchored[0].message, 'singleIcon: false → true');
  assert.equal(unanchored[0].details.reference.value, 'False');
  assert.equal(unanchored[0].details.actual.value, 'True');

  console.log('Variant state diff regression checks passed');
}

main();
