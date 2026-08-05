const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-style-fingerprint-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/services/styleMetadata.ts')],
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

function main() {
  const {
    __test_fingerprintCatalogPaintStyle,
    __test_fingerprintNodePaints,
  } = loadModule();
  const catalogFingerprint = __test_fingerprintCatalogPaintStyle({
    type: 'paint',
    value: {
      kind: 'paint',
      data: {
        paints: [
          {
            type: 'solid',
            color: '#030306 / rgba(3, 3, 6, 1.00)',
            opacity: 0.88,
          },
        ],
      },
    },
  });
  const nodeFingerprint = __test_fingerprintNodePaints([
    {
      type: 'SOLID',
      color: { r: 3 / 255, g: 3 / 255, b: 6 / 255 },
      opacity: 0.88,
      blendMode: 'NORMAL',
      visible: true,
    },
  ]);
  assert.equal(catalogFingerprint, nodeFingerprint);
  assert.equal(
    __test_fingerprintNodePaints([
      {
        type: 'IMAGE',
        scaleMode: 'FILL',
        imageHash: null,
        visible: true,
      },
    ]),
    null,
  );

  console.log('Style fingerprint regression checks passed');
}

main();
