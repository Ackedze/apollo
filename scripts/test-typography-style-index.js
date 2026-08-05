const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const outfile = path.join(
  os.tmpdir(),
  `apollo-typography-style-index-${process.pid}-${Date.now()}.cjs`,
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
const moduleUnderTest = require(outfile);
fs.rmSync(outfile, { force: true });

const mixed = Symbol('mixed');
globalThis.figma = { mixed };

const catalogFingerprint =
  moduleUnderTest.__test_fingerprintCatalogTypographyStyle({
    type: 'text',
    value: {
      kind: 'text',
      data: {
        fontName: 'Alfa Interface Sans Regular',
        fontSize: 14,
        lineHeight: '20.00',
      },
    },
    group: 'Paragraph',
    name: '14–20 Primary Small',
  });
assert.equal(
  catalogFingerprint,
  'typography:14:regular:pixels:20:proportional',
);

assert.equal(
  moduleUnderTest.getNodeTypographyFingerprint({
    fontName: { family: 'Alfa Interface Sans', style: 'Regular' },
    fontSize: 14,
    lineHeight: { unit: 'PIXELS', value: 20 },
    openTypeFeatures: {},
  }),
  catalogFingerprint,
);

assert.equal(
  moduleUnderTest.getNodeTypographyFingerprint({
    fontName: mixed,
    fontSize: mixed,
    lineHeight: mixed,
    openTypeFeatures: mixed,
    getStyledTextSegments: () => [
      {
        fontName: { family: 'Alfa Interface Sans', style: 'Semi Bold' },
        fontSize: 16,
        lineHeight: { unit: 'PIXELS', value: 24 },
        openTypeFeatures: {},
      },
      {
        fontName: { family: 'SF Pro Text', style: 'Semibold' },
        fontSize: 16,
        lineHeight: { unit: 'PIXELS', value: 24 },
        openTypeFeatures: {},
      },
    ],
  }),
  'typography:16:semibold:pixels:24:proportional',
);

assert.equal(
  moduleUnderTest.getNodeTypographyFingerprint({
    fontName: mixed,
    fontSize: mixed,
    lineHeight: mixed,
    openTypeFeatures: mixed,
    getStyledTextSegments: () => [
      {
        fontName: { family: 'Alfa Interface Sans', style: 'Regular' },
        fontSize: 14,
        lineHeight: { unit: 'PIXELS', value: 20 },
        openTypeFeatures: {},
      },
      {
        fontName: { family: 'Alfa Interface Sans', style: 'Bold' },
        fontSize: 14,
        lineHeight: { unit: 'PIXELS', value: 20 },
        openTypeFeatures: {},
      },
    ],
  }),
  null,
);

assert.equal(
  moduleUnderTest.__test_fingerprintCatalogTypographyStyle({
    type: 'text',
    group: 'Mono',
    name: '14–20 Primary Small monospaceNumbers={true}',
    value: {
      kind: 'text',
      data: {
        fontName: 'Alfa Interface Sans Regular',
        fontSize: 14,
        lineHeight: '20.00',
      },
    },
  }),
  'typography:14:regular:pixels:20:tabular',
);

assert.equal(
  moduleUnderTest.getNodeTypographyFingerprint({
    fontName: { family: 'Alfa Interface Sans', style: 'Regular' },
    fontSize: 14,
    lineHeight: { unit: 'PIXELS', value: 20 },
    openTypeFeatures: { TNUM: true },
  }),
  'typography:14:regular:pixels:20:tabular',
);

assert.notEqual(
  moduleUnderTest.getNodeTypographyFingerprint({
    fontName: { family: 'Alfa Interface Sans', style: 'Regular' },
    fontSize: 14,
    lineHeight: { unit: 'PIXELS', value: 18 },
    openTypeFeatures: {},
  }),
  catalogFingerprint,
);

delete globalThis.figma;
console.log('Typography style index regression checks passed');
