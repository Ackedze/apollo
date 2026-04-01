const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadDiffModule() {
  const entryPoint = path.resolve(__dirname, '../src/structure/diff.ts');
  const outfile = path.join(
    os.tmpdir(),
    `apollo-item-spacing-diff-${process.pid}-${Date.now()}.cjs`,
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

function createLayoutNode({
  id,
  parentId,
  path,
  name,
  visible = true,
  itemSpacing = null,
  itemSpacingToken = null,
  componentInstance = null,
}) {
  return {
    id,
    parentId,
    nodeId: String(id),
    path,
    type: 'FRAME',
    name,
    visible,
    layout: {
      direction: 'H',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      itemSpacing,
      itemSpacingToken,
    },
    componentInstance,
    radius: 0,
  };
}

function main() {
  const { diffStructures } = loadDiffModule();

  const referenceCollapsed = [
    createLayoutNode({
      id: 1,
      parentId: null,
      path: 'Presets=Status, Skeleton=False',
      name: 'Presets=Status, Skeleton=False',
      itemSpacing: 0,
    }),
    createLayoutNode({
      id: 2,
      parentId: 1,
      path: 'Presets=Status, Skeleton=False / Content',
      name: 'Content',
      itemSpacing: 6,
      itemSpacingToken: 'gap-token',
    }),
    createLayoutNode({
      id: 3,
      parentId: 2,
      path: 'Presets=Status, Skeleton=False / Content / StatusPreset',
      name: 'StatusPreset',
      itemSpacing: 0,
    }),
    createLayoutNode({
      id: 4,
      parentId: 2,
      path: 'Presets=Status, Skeleton=False / Content / Addon',
      name: 'Addon',
      visible: false,
      itemSpacing: 0,
    }),
  ];

  const actualCollapsed = [
    createLayoutNode({
      id: 1,
      parentId: null,
      path: 'Presets=Status, Skeleton=False',
      name: 'Presets=Status, Skeleton=False',
      itemSpacing: 0,
    }),
    createLayoutNode({
      id: 2,
      parentId: 1,
      path: 'Presets=Status, Skeleton=False / Content',
      name: 'Content',
      itemSpacing: 0,
      itemSpacingToken: null,
    }),
    createLayoutNode({
      id: 3,
      parentId: 2,
      path: 'Presets=Status, Skeleton=False / Content / StatusPreset',
      name: 'StatusPreset',
      itemSpacing: 0,
    }),
  ];

  const collapsedResult = diffStructures(actualCollapsed, referenceCollapsed, {
    strict: true,
  });

  assert.equal(
    collapsedResult.diffs.length,
    0,
    'Collapsed auto-layout with one visible child must not report itemSpacing diffs',
  );
  assert.deepEqual(
    collapsedResult.issues,
    [],
    'Collapsed auto-layout with one visible child must not report missing itemSpacing token issues',
  );

  const referenceMeaningful = [
    createLayoutNode({
      id: 1,
      parentId: null,
      path: 'Container',
      name: 'Container',
      itemSpacing: 0,
    }),
    createLayoutNode({
      id: 2,
      parentId: 1,
      path: 'Container / Content',
      name: 'Content',
      itemSpacing: 6,
      itemSpacingToken: 'gap-token',
    }),
    createLayoutNode({
      id: 3,
      parentId: 2,
      path: 'Container / Content / Child A',
      name: 'Child A',
      itemSpacing: 0,
    }),
    createLayoutNode({
      id: 4,
      parentId: 2,
      path: 'Container / Content / Child B',
      name: 'Child B',
      itemSpacing: 0,
    }),
  ];

  const actualMeaningful = [
    createLayoutNode({
      id: 1,
      parentId: null,
      path: 'Container',
      name: 'Container',
      itemSpacing: 0,
    }),
    createLayoutNode({
      id: 2,
      parentId: 1,
      path: 'Container / Content',
      name: 'Content',
      itemSpacing: 0,
      itemSpacingToken: null,
    }),
    createLayoutNode({
      id: 3,
      parentId: 2,
      path: 'Container / Content / Child A',
      name: 'Child A',
      itemSpacing: 0,
    }),
    createLayoutNode({
      id: 4,
      parentId: 2,
      path: 'Container / Content / Child B',
      name: 'Child B',
      itemSpacing: 0,
    }),
  ];

  const meaningfulResult = diffStructures(actualMeaningful, referenceMeaningful, {
    strict: true,
  });

  assert.ok(
    meaningfulResult.diffs.some((diff) => diff.message === 'Отступ между элементами: 6 → 0'),
    'Visible multi-child auto-layout must still report real itemSpacing diffs',
  );
  assert.ok(
    meaningfulResult.issues.includes('Нет данных для token itemSpacing в снапшоте для «Container / Content»'),
    'Visible multi-child auto-layout must still report missing itemSpacing token issues',
  );

  const referenceTextPreset = [
    createLayoutNode({
      id: 1,
      parentId: null,
      path: 'Presets=Text, Skeleton=False',
      name: 'Presets=Text, Skeleton=False',
      itemSpacing: 14,
    }),
    createLayoutNode({
      id: 2,
      parentId: 1,
      path: 'Presets=Text, Skeleton=False / Content',
      name: 'Content',
      itemSpacing: 6,
      itemSpacingToken: 'gap-token',
    }),
    createLayoutNode({
      id: 3,
      parentId: 2,
      path: 'Presets=Text, Skeleton=False / Content / Text 1',
      name: 'Text 1',
      itemSpacing: 0,
      componentInstance: {
        componentKey: 'text-1',
        variantProperties: { Presets: 'Text', Accent: 'True' },
      },
    }),
    createLayoutNode({
      id: 4,
      parentId: 2,
      path: 'Presets=Text, Skeleton=False / Content / Text 2',
      name: 'Text 2',
      itemSpacing: 0,
      componentInstance: {
        componentKey: 'text-2',
        variantProperties: { Presets: 'Text', Accent: 'False' },
      },
    }),
  ];

  const actualSingleVisibleChild = [
    createLayoutNode({
      id: 1,
      parentId: null,
      path: 'Presets=Text, Skeleton=False',
      name: 'Presets=Text, Skeleton=False',
      itemSpacing: 14,
    }),
    createLayoutNode({
      id: 2,
      parentId: 1,
      path: 'Presets=Text, Skeleton=False / Content',
      name: 'Content',
      itemSpacing: 0,
      itemSpacingToken: null,
    }),
    createLayoutNode({
      id: 3,
      parentId: 2,
      path: 'Presets=Text, Skeleton=False / Content / Text 1',
      name: 'Text 1',
      itemSpacing: 0,
      componentInstance: {
        componentKey: 'text-1',
        variantProperties: { Presets: 'Text', Accent: 'True' },
      },
    }),
    createLayoutNode({
      id: 4,
      parentId: 2,
      path: 'Presets=Text, Skeleton=False / Content / Text 2',
      name: 'Text 2',
      visible: false,
      itemSpacing: 0,
      componentInstance: {
        componentKey: 'text-2',
        variantProperties: { Presets: 'Text', Accent: 'False' },
      },
    }),
  ];

  const singleVisibleChildResult = diffStructures(
    actualSingleVisibleChild,
    referenceTextPreset,
    { strict: true },
  );

  assert.equal(
    singleVisibleChildResult.diffs.length,
    0,
    'Item spacing must be ignored when the actual container has only one visible child',
  );
  assert.deepEqual(
    singleVisibleChildResult.issues,
    [],
    'Missing itemSpacing token must be ignored when the actual container has only one visible child',
  );

  const actualAmountMismatch = [
    createLayoutNode({
      id: 1,
      parentId: null,
      path: 'Presets=Text, Skeleton=False',
      name: 'Presets=Text, Skeleton=False',
      itemSpacing: 14,
    }),
    createLayoutNode({
      id: 2,
      parentId: 1,
      path: 'Presets=Text, Skeleton=False / Content',
      name: 'Content',
      itemSpacing: 0,
      itemSpacingToken: null,
    }),
    createLayoutNode({
      id: 3,
      parentId: 2,
      path: 'Presets=Text, Skeleton=False / Content / Text 1',
      name: 'Text 1',
      itemSpacing: 0,
      componentInstance: {
        componentKey: 'amount-1',
        variantProperties: { Presets: 'Amount', Accent: 'True' },
      },
    }),
    createLayoutNode({
      id: 4,
      parentId: 2,
      path: 'Presets=Text, Skeleton=False / Content / Text 2',
      name: 'Text 2',
      itemSpacing: 0,
      componentInstance: {
        componentKey: 'text-2',
        variantProperties: { Presets: 'Text', Accent: 'False' },
      },
    }),
  ];

  const amountMismatchResult = diffStructures(
    actualAmountMismatch,
    referenceTextPreset,
    { strict: true },
  );

  assert.ok(
    amountMismatchResult.diffs.some(
      (diff) => diff.message === 'Отступ между элементами: 6 → 0',
    ),
    'Amount/Account-like body cell variants must not be hidden by the generic Text itemSpacing suppression',
  );

  console.log('Item spacing diff regression checks passed');
}

main();
