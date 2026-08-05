const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-style-binding-action-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/actions/styleBindingAction.ts'),
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

const redPaint = {
  type: 'SOLID',
  color: { r: 1, g: 0, b: 0 },
  opacity: 1,
  blendMode: 'NORMAL',
  visible: true,
};
const redFingerprint = 'paint:solid:1:0:0:1:NORMAL';

function createHarness(options = {}) {
  const calls = [];
  const node = {
    id: '1:2',
    type: 'RECTANGLE',
    fills: options.nodePaints ?? [redPaint],
    fillStyleId: options.styleId ?? '',
    async setFillStyleIdAsync(styleId) {
      calls.push(['setFillStyleIdAsync', styleId]);
      this.fillStyleId = styleId;
    },
  };
  const style = {
    id: 'S:target,1:1',
    key: 'target-key',
    type: 'PAINT',
    paints: options.targetPaints ?? [redPaint],
  };
  globalThis.figma = {
    getNodeByIdAsync: async (nodeId) =>
      options.nodeLookupMissing
        ? null
        : nodeId === node.id
          ? node
          : null,
    importStyleByKeyAsync: async (key) => {
      calls.push(['importStyleByKeyAsync', key]);
      if (options.importError) {
        throw options.importError;
      }
      return style;
    },
  };
  return { calls, node };
}

function action(overrides = {}) {
  return {
    kind: 'bind-style',
    nodeId: '1:2',
    expectedStyleId: null,
    targetStyleKey: 'target-key',
    targetName: 'Colors/Red',
    targetLibrary: 'Web :: Core',
    styleField: 'fill',
    reason: 'exact-style-match',
    expectedFingerprint: redFingerprint,
    ...overrides,
  };
}

function createTypographyHarness(options = {}) {
  const calls = [];
  const node = {
    id: '1:3',
    type: 'TEXT',
    characters: 'Text',
    fontName: { family: 'Alfa Interface Sans', style: 'Regular' },
    fontSize: options.fontSize ?? 14,
    lineHeight: { unit: 'PIXELS', value: options.lineHeight ?? 20 },
    openTypeFeatures: options.openTypeFeatures ?? {},
    textStyleId: options.styleId ?? '',
    getRangeAllFontNames: () =>
      Object.freeze([
        Object.freeze({ family: 'Alfa Interface Sans', style: 'Regular' }),
      ]),
    getRangeTextStyleId: () => node.textStyleId,
    getStyledTextSegments: () => [
      {
        start: 0,
        end: 4,
        characters: 'Text',
        textCase: options.textCase ?? 'UPPER',
        textDecoration: options.textDecoration ?? 'UNDERLINE',
      },
    ],
    setRangeTextCase(start, end, value) {
      if (options.rangeTextCaseError) throw options.rangeTextCaseError;
      calls.push(['setRangeTextCase', start, end, value]);
    },
    setRangeTextDecoration(start, end, value) {
      if (options.rangeTextDecorationError) {
        throw options.rangeTextDecorationError;
      }
      calls.push(['setRangeTextDecoration', start, end, value]);
    },
    async setRangeTextStyleIdAsync(start, end, styleId) {
      if (options.rangeStyleError) throw options.rangeStyleError;
      calls.push(['setRangeTextStyleIdAsync', start, end, styleId]);
      if (!options.rangeStyleNoop) this.textStyleId = styleId;
    },
    async setTextStyleIdAsync(styleId) {
      if (options.nodeStyleError) throw options.nodeStyleError;
      calls.push(['setTextStyleIdAsync', styleId]);
      if (!options.nodeStyleNoop) this.textStyleId = styleId;
    },
  };
  const style = {
    id: 'S:typography,1:1',
    key: 'typography-key',
    name: 'Paragraph/14–20 Primary Small',
    type: 'TEXT',
    fontName: { family: 'Alfa Interface Sans', style: 'Regular' },
    fontSize: options.targetFontSize ?? 14,
    lineHeight: { unit: 'PIXELS', value: options.targetLineHeight ?? 20 },
    textCase: options.targetTextCase ?? (options.textCase ?? 'UPPER'),
    textDecoration:
      options.targetTextDecoration ?? (options.textDecoration ?? 'UNDERLINE'),
  };
  globalThis.figma = {
    mixed: Symbol('mixed'),
    getNodeByIdAsync: async () => node,
    importStyleByKeyAsync: async (key) => {
      calls.push(['importStyleByKeyAsync', key]);
      return style;
    },
    loadFontAsync: async (font) => {
      calls.push(['loadFontAsync', `${font.family}/${font.style}`]);
    },
  };
  Object.defineProperties(node, {
    textCase: {
      configurable: true,
      get: () => options.textCase ?? 'UPPER',
      set: (value) => calls.push(['textCase', value]),
    },
    textDecoration: {
      configurable: true,
      get: () => options.textDecoration ?? 'UNDERLINE',
      set: (value) => calls.push(['textDecoration', value]),
    },
  });
  return { calls, node };
}

async function main() {
  const { applyStyleBindingAction } = loadModule();

  const success = createHarness();
  const successResult = await applyStyleBindingAction(action());
  assert.equal(successResult.ok, true);
  assert.deepEqual(success.calls, [
    ['importStyleByKeyAsync', 'target-key'],
    ['setFillStyleIdAsync', 'S:target,1:1'],
  ]);

  const syntheticSublayer = createHarness({ nodeLookupMissing: true });
  const syntheticSublayerResult = await applyStyleBindingAction(
    action(),
    syntheticSublayer.node,
  );
  assert.equal(syntheticSublayerResult.ok, true);
  assert.deepEqual(syntheticSublayer.calls, [
    ['importStyleByKeyAsync', 'target-key'],
    ['setFillStyleIdAsync', 'S:target,1:1'],
  ]);

  const changedNode = createHarness({
    nodePaints: [
      { ...redPaint, color: { r: 0, g: 1, b: 0 } },
    ],
  });
  const changedNodeResult = await applyStyleBindingAction(action());
  assert.equal(changedNodeResult.ok, false);
  assert.match(changedNodeResult.message, /Значение стиля изменилось/);
  assert.deepEqual(changedNode.calls, []);

  const changedTarget = createHarness({
    targetPaints: [
      { ...redPaint, color: { r: 0, g: 0, b: 1 } },
    ],
  });
  const changedTargetResult = await applyStyleBindingAction(action());
  assert.equal(changedTargetResult.ok, false);
  assert.match(changedTargetResult.message, /Библиотечный стиль изменился/);
  assert.deepEqual(changedTarget.calls, [
    ['importStyleByKeyAsync', 'target-key'],
  ]);

  const changedBinding = createHarness({ styleId: 'S:other,1:2' });
  const changedBindingResult = await applyStyleBindingAction(action());
  assert.equal(changedBindingResult.ok, false);
  assert.match(changedBindingResult.message, /Стиль изменился/);
  assert.deepEqual(changedBinding.calls, []);

  const failedImport = createHarness({ importError: new Error('forbidden') });
  const failedImportResult = await applyStyleBindingAction(action());
  assert.equal(failedImportResult.ok, false);
  assert.match(failedImportResult.message, /Не удалось загрузить библиотечный стиль/);
  assert.deepEqual(failedImport.calls, [
    ['importStyleByKeyAsync', 'target-key'],
  ]);

  const typography = createTypographyHarness();
  const typographyResult = await applyStyleBindingAction({
    kind: 'bind-style',
    nodeId: typography.node.id,
    expectedStyleId: null,
    targetStyleKey: 'typography-key',
    targetName: 'Paragraph/14–20 Primary Small',
    targetLibrary: 'Web :: Typography',
    styleField: 'text',
    reason: 'exact-typography-match',
    expectedFingerprint: 'typography:14:regular:pixels:20:proportional',
  });
  assert.equal(typographyResult.ok, true);
  assert.deepEqual(typography.calls, [
    ['importStyleByKeyAsync', 'typography-key'],
    ['loadFontAsync', 'Alfa Interface Sans/Regular'],
    ['setTextStyleIdAsync', 'S:typography,1:1'],
  ]);

  const defaultPresentation = createTypographyHarness({
    textCase: 'ORIGINAL',
    textDecoration: 'NONE',
  });
  const defaultPresentationResult = await applyStyleBindingAction({
    kind: 'bind-style',
    nodeId: defaultPresentation.node.id,
    expectedStyleId: null,
    targetStyleKey: 'typography-key',
    targetName: 'Paragraph/14–20 Primary Small',
    targetLibrary: 'Web :: Typography',
    styleField: 'text',
    reason: 'exact-typography-match',
    expectedFingerprint: 'typography:14:regular:pixels:20:proportional',
  });
  assert.equal(defaultPresentationResult.ok, true);
  assert.deepEqual(defaultPresentation.calls, [
    ['importStyleByKeyAsync', 'typography-key'],
    ['loadFontAsync', 'Alfa Interface Sans/Regular'],
    ['setTextStyleIdAsync', 'S:typography,1:1'],
  ]);

  const fallbackTypography = createTypographyHarness({
    nodeStyleError: new Error('whole-node style unavailable'),
    rangeTextCaseError: new Error('range case unavailable'),
    rangeTextDecorationError: new Error('range decoration unavailable'),
  });
  const fallbackTypographyResult = await applyStyleBindingAction({
    kind: 'bind-style',
    nodeId: fallbackTypography.node.id,
    expectedStyleId: null,
    targetStyleKey: 'typography-key',
    targetName: 'Paragraph/14–20 Primary Small',
    targetLibrary: 'Web :: Typography',
    styleField: 'text',
    reason: 'exact-typography-match',
    expectedFingerprint: 'typography:14:regular:pixels:20:proportional',
  });
  assert.equal(fallbackTypographyResult.ok, true);
  assert.deepEqual(fallbackTypography.calls, [
    ['importStyleByKeyAsync', 'typography-key'],
    ['loadFontAsync', 'Alfa Interface Sans/Regular'],
    ['setRangeTextStyleIdAsync', 0, 4, 'S:typography,1:1'],
  ]);

  const noOpTypography = createTypographyHarness({ nodeStyleNoop: true });
  const noOpTypographyResult = await applyStyleBindingAction({
    kind: 'bind-style',
    nodeId: noOpTypography.node.id,
    expectedStyleId: null,
    targetStyleKey: 'typography-key',
    targetName: 'Paragraph/14–20 Primary Small',
    targetLibrary: 'Web :: Typography',
    styleField: 'text',
    reason: 'exact-typography-match',
    expectedFingerprint: 'typography:14:regular:pixels:20:proportional',
  });
  assert.equal(noOpTypographyResult.ok, true);
  assert.deepEqual(noOpTypography.calls, [
    ['importStyleByKeyAsync', 'typography-key'],
    ['loadFontAsync', 'Alfa Interface Sans/Regular'],
    ['setTextStyleIdAsync', 'S:typography,1:1'],
    ['setRangeTextStyleIdAsync', 0, 4, 'S:typography,1:1'],
  ]);

  const incompatibleCase = createTypographyHarness({
    textCase: 'UPPER',
    targetTextCase: 'ORIGINAL',
  });
  const incompatibleCaseResult = await applyStyleBindingAction({
    kind: 'bind-style',
    nodeId: incompatibleCase.node.id,
    expectedStyleId: null,
    targetStyleKey: 'typography-key',
    targetName: 'Paragraph/14–20 Primary Small',
    targetLibrary: 'Web :: Typography',
    styleField: 'text',
    reason: 'exact-typography-match',
    expectedFingerprint: 'typography:14:regular:pixels:20:proportional',
  });
  assert.equal(incompatibleCaseResult.ok, false);
  assert.match(incompatibleCaseResult.message, /другой регистр текста/);
  assert.deepEqual(incompatibleCase.calls, [
    ['importStyleByKeyAsync', 'typography-key'],
  ]);

  const decorationOverride = createTypographyHarness({
    textCase: 'ORIGINAL',
    textDecoration: 'UNDERLINE',
    targetTextCase: 'ORIGINAL',
    targetTextDecoration: 'NONE',
  });
  const decorationOverrideResult = await applyStyleBindingAction({
    kind: 'bind-style',
    nodeId: decorationOverride.node.id,
    expectedStyleId: null,
    targetStyleKey: 'typography-key',
    targetName: 'Paragraph/14–20 Primary Small',
    targetLibrary: 'Web :: Typography',
    styleField: 'text',
    reason: 'exact-typography-match',
    expectedFingerprint: 'typography:14:regular:pixels:20:proportional',
  });
  assert.equal(decorationOverrideResult.ok, true);
  assert.deepEqual(decorationOverride.calls, [
    ['importStyleByKeyAsync', 'typography-key'],
    ['loadFontAsync', 'Alfa Interface Sans/Regular'],
    ['setTextStyleIdAsync', 'S:typography,1:1'],
    ['setRangeTextDecoration', 0, 4, 'UNDERLINE'],
  ]);

  const changedTypography = createTypographyHarness({ fontSize: 16 });
  const changedTypographyResult = await applyStyleBindingAction({
    kind: 'bind-style',
    nodeId: changedTypography.node.id,
    expectedStyleId: null,
    targetStyleKey: 'typography-key',
    targetName: 'Paragraph/14–20 Primary Small',
    targetLibrary: 'Web :: Typography',
    styleField: 'text',
    reason: 'exact-typography-match',
    expectedFingerprint: 'typography:14:regular:pixels:20:proportional',
  });
  assert.equal(changedTypographyResult.ok, false);
  assert.match(changedTypographyResult.message, /Значение стиля изменилось/);
  assert.deepEqual(changedTypography.calls, []);

  delete globalThis.figma;
  console.log('Style binding action regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
