const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const outfile = path.join(
  os.tmpdir(),
  `apollo-custom-typography-detection-${process.pid}-${Date.now()}.cjs`,
);
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/services/auditViewBuilder.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node18'],
  logLevel: 'silent',
});
const {
  __test_setAuditPolicyConfig,
  describeCustomStyleReasons,
} = require(outfile);
fs.rmSync(outfile, { force: true });

const mixed = Symbol('mixed');
globalThis.figma = { mixed };

function createTextNode(overrides = {}) {
  const segment = {
    characters: 'Text',
    start: 0,
    end: 4,
    fontName: { family: 'Alfa Interface Sans', style: 'Regular' },
    fontWeight: 400,
    fontSize: 16,
    lineHeight: { unit: 'PIXELS', value: 24 },
    letterSpacing: { unit: 'PIXELS', value: 0 },
    openTypeFeatures: {},
    boundVariables: {},
    textStyleId: '',
  };
  return Object.assign(
    {
      id: '1:2',
      type: 'TEXT',
      name: 'Label',
      fills: [],
      fontName: segment.fontName,
      fontSize: segment.fontSize,
      lineHeight: segment.lineHeight,
      openTypeFeatures: segment.openTypeFeatures,
      textStyleId: '',
      getStyledTextSegments: () => [segment],
    },
    overrides,
  );
}

const options = {
  tokenLabelMap: new Map(),
  isKnownStyleId: async () => false,
  resolveStyleMetadata: async () => null,
};

async function main() {
  __test_setAuditPolicyConfig({
    schemaVersion: 1,
    rawTypography: {
      rules: [
        {
          id: 'web-core.status-label-uppercase',
          componentKeys: [
            '349af184bee87341370ef007d5e8189c51bd31ff',
            'a0c6e37a61cd5c5f5db767a5dfef09a9b6d2ece7',
          ],
          nodeName: 'Label',
          ancestorPath: ['Status', '🔩 Label'],
          reasonCode: 'variant-owned-text-case',
        },
      ],
    },
  });
  const reasons = await describeCustomStyleReasons(createTextNode(), options);
  assert.deepEqual(reasons, ['typography']);

  const knownStyleReasons = await describeCustomStyleReasons(
    createTextNode({ textStyleId: 'S:known-style' }),
    Object.assign({}, options, { isKnownStyleId: async () => true }),
  );
  assert.deepEqual(knownStyleReasons, []);

  const knownRangeStyleReasons = await describeCustomStyleReasons(
    createTextNode({
      textStyleId: '',
      getStyledTextSegments: () => [
        Object.assign({}, createTextNode().getStyledTextSegments()[0], {
          textStyleId: 'S:known-range-style',
        }),
      ],
    }),
    Object.assign({}, options, {
      isKnownStyleId: async (styleId) => styleId === 'S:known-range-style',
    }),
  );
  assert.deepEqual(knownRangeStyleReasons, []);

  const statusBoundary = {
    id: '2:1',
    type: 'INSTANCE',
    name: 'Status',
    parent: null,
    getMainComponentAsync: async () => ({
      key: '349af184bee87341370ef007d5e8189c51bd31ff',
    }),
  };
  const statusTypographyReasons = await describeCustomStyleReasons(
    createTextNode({ id: '2:2', parent: statusBoundary }),
    options,
  );
  assert.deepEqual(statusTypographyReasons, []);

  const statusLabelBoundary = {
    id: '2:3',
    type: 'INSTANCE',
    name: '🔩 Label',
    parent: null,
    getMainComponentAsync: async () => ({
      key: 'a0c6e37a61cd5c5f5db767a5dfef09a9b6d2ece7',
    }),
  };
  const statusLabelTypographyReasons = await describeCustomStyleReasons(
    createTextNode({ id: '2:4', parent: statusLabelBoundary }),
    options,
  );
  assert.deepEqual(statusLabelTypographyReasons, []);

  const collapsedStatusBoundary = {
    id: '2:5',
    type: 'FRAME',
    name: 'Status',
    parent: null,
  };
  const collapsedLabelBoundary = {
    id: '2:6',
    type: 'FRAME',
    name: '🔩 Label',
    parent: collapsedStatusBoundary,
  };
  const collapsedStatusTypographyReasons = await describeCustomStyleReasons(
    createTextNode({ id: '2:7', parent: collapsedLabelBoundary }),
    options,
  );
  assert.deepEqual(collapsedStatusTypographyReasons, []);

  const coincidentalStatusNameReasons = await describeCustomStyleReasons(
    createTextNode({
      id: '3:2',
      parent: { id: '3:1', type: 'FRAME', name: 'Status', parent: null },
    }),
    options,
  );
  assert.deepEqual(coincidentalStatusNameReasons, ['typography']);

  const coincidentalLabelBoundaryReasons = await describeCustomStyleReasons(
    createTextNode({
      id: '3:4',
      parent: {
        id: '3:3',
        type: 'FRAME',
        name: '🔩 Label',
        parent: null,
      },
    }),
    options,
  );
  assert.deepEqual(coincidentalLabelBoundaryReasons, ['typography']);

  const uniformlyMixedReasons = await describeCustomStyleReasons(
    createTextNode({
      fontName: mixed,
      fontSize: mixed,
      lineHeight: mixed,
      openTypeFeatures: mixed,
      getStyledTextSegments: () => [
        createTextNode().getStyledTextSegments()[0],
      ],
    }),
    options,
  );
  assert.deepEqual(uniformlyMixedReasons, ['typography']);

  const richTextReasons = await describeCustomStyleReasons(
    createTextNode({
      fontName: mixed,
      fontSize: mixed,
      lineHeight: mixed,
      openTypeFeatures: mixed,
      getStyledTextSegments: () => [
        createTextNode().getStyledTextSegments()[0],
        Object.assign({}, createTextNode().getStyledTextSegments()[0], {
          start: 4,
          end: 8,
          fontSize: 14,
        }),
      ],
    }),
    options,
  );
  assert.deepEqual(richTextReasons, []);

  delete globalThis.figma;
  console.log('Custom typography detection regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
