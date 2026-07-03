const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadLibraryModule() {
  const entryPoint = path.resolve(__dirname, '../src/reference/library.ts');
  const outfile = path.join(
    os.tmpdir(),
    `apollo-variant-structure-paths-${process.pid}-${Date.now()}.cjs`,
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

function createNode(id, parentId, path) {
  return {
    id,
    parentId,
    path,
    type: 'FRAME',
    name: path.split(' / ').at(-1) ?? path,
    visible: true,
    layout: {
      direction: 'V',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      itemSpacing: 6,
    },
  };
}

function main() {
  const { resolveStructure } = loadLibraryModule();

  const component = {
    key: 'component-set-key',
    name: '[D] BodyCell :: Basic',
    structure: [
      createNode(1, null, 'Presets=Status, Skeleton=False'),
      createNode(2, 1, 'Presets=Status, Skeleton=False / Content'),
      createNode(3, 2, 'Presets=Status, Skeleton=False / Content / StatusPreset'),
    ],
    variants: [
      { key: 'status-key', name: 'Presets=Status, Skeleton=False' },
      { key: 'text-key', name: 'Presets=Text, Skeleton=False' },
    ],
    variantStructures: {
      'text-key': [
        {
          op: 'add',
          node: createNode(2, 1, 'Presets=Text, Skeleton=False / Graphics'),
        },
        {
          op: 'update',
          id: 2,
          value: {
            layout: {
              direction: 'V',
              padding: { top: 2, right: 0, bottom: 2, left: 0 },
              itemSpacing: 0,
            },
          },
        },
        {
          op: 'add',
          node: createNode(4, 2, 'Presets=Text, Skeleton=False / Content / Text 1'),
        },
      ],
    },
  };

  const textStructure = resolveStructure(component, 'text-key');

  assert.ok(textStructure, 'Variant structure must resolve');
  assert.equal(
    textStructure[0].path,
    'Presets=Text, Skeleton=False',
    'Resolved variant root path must match the variant name',
  );
  assert.ok(
    textStructure.every(
      (node) =>
        node.path === 'Presets=Text, Skeleton=False' ||
        node.path.startsWith('Presets=Text, Skeleton=False / '),
    ),
    'Resolved variant structure must not keep stale root paths from the base variant',
  );
  assert.ok(
    !textStructure.some((node) => node.path.startsWith('Presets=Status, Skeleton=False')),
    'Resolved variant structure must not contain Status-prefixed paths for the Text variant',
  );
  const content = textStructure.find(
    (node) => node.path === 'Presets=Text, Skeleton=False / Content',
  );
  assert.equal(
    content?.layout?.itemSpacing,
    0,
    'Variant update patches must keep targeting the base node when add patches reuse a base id',
  );

  console.log('Variant structure path regression checks passed');
}

main();
