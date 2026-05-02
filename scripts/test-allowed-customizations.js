const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadAllowedCustomizationModule() {
  const entryPoint = path.resolve(
    __dirname,
    '../src/filters/allowedCustomizationRules.ts',
  );
  const outfile = path.join(
    os.tmpdir(),
    `apollo-allowed-customizations-${process.pid}-${Date.now()}.cjs`,
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

function makeDiff(nodeName, message) {
  return {
    nodeName,
    nodePath: `Component / ${nodeName}`,
    message,
    context: {
      actualComponentKey: null,
      referenceComponentKey: null,
      referenceOrigin: 'host',
      nestedOwnerComponentKey: null,
      nestedOwnerComponentRole: null,
      nestedOwnerPath: null,
      nestedOwnerRelativePath: null,
    },
  };
}

function main() {
  const {
    applyAllowedCustomizationRules,
    __test_normalizeRuleName,
    __test_resolveRuleComponentName,
  } = loadAllowedCustomizationModule();

  assert.equal(
    __test_resolveRuleComponentName({
      displayName: '🔩 Content',
      role: 'Part',
      variantOf: 'IconView',
    }),
    'IconView',
    'Part components must resolve to their owning family name for nested allowlist rules',
  );

  assert.equal(
    __test_normalizeRuleName('web/components/web-core/core/Web _ Core -- IconView.json'),
    'iconview',
    'Catalog source paths must normalize to component names for nested allowlist matching',
  );

  const progressBarDiffs = applyAllowedCustomizationRules(
    [
      makeDiff('Fill', 'Паддинг right: 10 → 0'),
      makeDiff('Fill', 'заливка: accent/primary → decorative/green'),
    ],
    {
      libraryName: 'Web :: Core ProgressBars',
      componentName: 'ProgressBar',
      referenceComponentName: 'ProgressBar',
    },
  );

  assert.equal(
    progressBarDiffs.length,
    0,
    'Allowlisted ProgressBar Fill diffs must be suppressed from problem results',
  );

  const iconsDiffs = applyAllowedCustomizationRules(
    [
      makeDiff('icon', 'заливка: #747474 → text/info'),
      makeDiff('icon', 'заливка: #747474 → #123456'),
    ],
    {
      libraryName: 'Icons',
      componentName: 'bulb',
      referenceComponentName: 'bulb',
    },
  );

  assert.equal(
    iconsDiffs.length,
    1,
    'Only tokenized icon recolor must be allowlisted for Icons',
  );
  assert.equal(
    iconsDiffs[0].message,
    'заливка: #747474 → #123456',
    'Raw manual fill must remain visible as customization',
  );

  const unrelatedDiffs = applyAllowedCustomizationRules(
    [makeDiff('Fill', 'Паддинг right: 10 → auto')],
    {
      libraryName: 'Web :: Core ProgressBars',
      componentName: 'ProgressBar',
      referenceComponentName: 'ProgressBar',
    },
  );

  assert.equal(
    unrelatedDiffs.length,
    1,
    'Non-numeric ProgressBar Fill padding override must stay visible',
  );

  const genericProgressBarDiffs = applyAllowedCustomizationRules(
    [
      {
        ...makeDiff('Size=8px', 'Паддинг right: 0 → 20'),
        nodePath: 'Size=8px',
      },
      {
        ...makeDiff('Size=8px', 'Паддинг left: 0 → 12'),
        nodePath: 'Size=8px',
      },
      makeDiff('Fill', 'Паддинг right: 10 → 42'),
      makeDiff('Fill', 'заливка: accent/primary → decorative-muted-alt/green'),
    ],
    {
      libraryName: 'Web :: Core ProgressBars',
      componentName: 'ProgressBar',
      referenceComponentName: 'ProgressBar',
    },
  );

  assert.equal(
    genericProgressBarDiffs.length,
    0,
    'ProgressBar allowlist must accept root left/right padding and tokenized Fill overrides',
  );

  const titleViewButtonDiffs = applyAllowedCustomizationRules(
    [
      {
        ...makeDiff('PaintMe', 'заливка: status/info → Button/Desktop/Colors/Primary/text'),
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: 'button-component',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: '[D] TitleView / [D] Button',
          nestedOwnerRelativePath: 'PaintMe',
        },
      },
    ],
    {
      libraryName: 'Web :: Corp Components',
      componentName: '[D] TitleView',
      referenceComponentName: '[D] TitleView',
    },
  );

  assert.equal(
    titleViewButtonDiffs.length,
    0,
    'TitleView must allow tokenized nested Button icon recolors',
  );

  const directButtonPaintMeDiffs = applyAllowedCustomizationRules(
    [
      {
        ...makeDiff(
          'PaintMe',
          'заливка: Button/Desktop/Colors/Primary/text → decorative/green',
        ),
        nodePath:
          'View=Primary, Size=32, Shape=Rectangular, SingleIcon=False, DisabledState=False / LeftAddon / LeftAddon / Fixer / PaintMe',
      },
    ],
    {
      libraryName: 'Web :: Core',
      componentName: '[D] Button',
      referenceComponentName: '[D] Button',
    },
  );

  assert.equal(
    directButtonPaintMeDiffs.length,
    1,
    'Manual Button PaintMe recolor must remain visible as customization',
  );

  const linkDiffs = applyAllowedCustomizationRules(
    [
      makeDiff('Link', 'Отступ между элементами: 4 → 6'),
      makeDiff(
        'Label',
        'Стиль текст: Paragraph/14–20 Primary Small → Action/14–20 Primary Small',
      ),
      makeDiff('Label', 'заливка: text/info → text/positive'),
      makeDiff('PaintMe', 'заливка: text/info → text/warning'),
      makeDiff('Underline', 'обводка: decorative/purple → text/info'),
      makeDiff('Underline', 'обводка: decorative/purple → #123456'),
    ],
    {
      libraryName: 'Web :: Core',
      componentName: 'Link',
      referenceComponentName: 'Link',
    },
  );

  assert.equal(
    linkDiffs.length,
    1,
    'Link must allow tokenized fill/stroke overrides but keep raw colors visible',
  );
  assert.equal(
    linkDiffs[0].message,
    'обводка: decorative/purple → #123456',
    'Raw underline stroke color must still be treated as customization',
  );

  const nestedLinkDiffs = applyAllowedCustomizationRules(
    [
      {
        ...makeDiff('Link', 'Отступ между элементами: 4 → 6'),
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: 'link-component',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: 'Host / Link',
          nestedOwnerRelativePath: '',
        },
      },
      {
        ...makeDiff(
          'Label',
          'Стиль текст: Paragraph/14–20 Primary Small → Action/14–20 Primary Small',
        ),
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: 'link-component',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: 'Host / Link',
          nestedOwnerRelativePath: 'Content / Label',
        },
      },
      {
        ...makeDiff('Underline', 'обводка: decorative/purple → text/info'),
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: 'link-component',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: 'Host / Link',
          nestedOwnerRelativePath: 'Content / Underline / Underline',
        },
      },
    ],
    {
      libraryName: 'Web :: Corp Components',
      componentName: 'showMore',
      referenceComponentName: 'showMore',
    },
  );

  assert.equal(
    nestedLinkDiffs.length,
    0,
    'Nested Link overrides must be allowed even when the host component is not Link',
  );

  const iconViewDiffs = applyAllowedCustomizationRules(
    [
      makeDiff('PaintMe', 'заливка: text/primary → text/positive'),
      makeDiff('BgColor', 'заливка: neutral/100 → decorative/green'),
      makeDiff('PaintMe', 'заливка: text/primary → #123456'),
    ],
    {
      libraryName: 'Web :: Core',
      componentName: 'IconView',
      referenceComponentName: 'IconView',
    },
  );

  assert.equal(
    iconViewDiffs.length,
    1,
    'IconView must allow tokenized PaintMe/BgColor recolors but keep raw colors visible',
  );
  assert.equal(
    iconViewDiffs[0].message,
    'заливка: text/primary → #123456',
    'IconView raw PaintMe color must still be treated as customization',
  );

  const nestedIconViewDiffs = applyAllowedCustomizationRules(
    [
      {
        ...makeDiff('PaintMe', 'заливка: text/primary → text/secondary'),
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          actualNestedOwnerComponentKey: 'icon-view-component',
          actualNestedOwnerPath: '[D] Button / LeftAddon / IconView',
          actualNestedOwnerRelativePath: 'Content / ShapeContent / Content / Fixer / PaintMe',
          nestedOwnerComponentKey: 'button-addon-component',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: '[D] Button / LeftAddon / LeftAddon',
          nestedOwnerRelativePath: 'Fixer / PaintMe',
        },
      },
      {
        ...makeDiff('BgColor', 'заливка: neutral/100 → decorative/green'),
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          actualNestedOwnerComponentKey: 'icon-view-component',
          actualNestedOwnerPath: '[D] Button / LeftAddon / IconView',
          actualNestedOwnerRelativePath: 'Content / ShapeContent / BgColor',
          nestedOwnerComponentKey: 'button-addon-component',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: '[D] Button / LeftAddon / LeftAddon',
          nestedOwnerRelativePath: 'BgColor',
        },
      },
    ],
    {
      libraryName: 'Web :: Core',
      componentName: '[D] Button',
      referenceComponentName: '[D] Button',
    },
  );

  assert.equal(
    nestedIconViewDiffs.length,
    0,
    'Swapped nested IconView inside Button must allow tokenized PaintMe/BgColor recolors',
  );

  const bodyCellTextDiffs = applyAllowedCustomizationRules(
    [
      {
        ...makeDiff('Minus', 'Стиль текст: Paragraph/16–20 Component Primary → Accent/16–20 Brand'),
        nodePath:
          '[D] BodyRow :: Basic / Cells / [D] BodyCell :: Basic / Content / Text 1 / Operation / Minus',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: null,
          nestedOwnerComponentRole: 'Part',
          nestedOwnerPath: '[D] BodyCell :: Basic / Content / Text 1',
          nestedOwnerRelativePath: 'Operation / Minus',
        },
      },
      {
        ...makeDiff('Major', 'заливка: text/primary → text/tertiary'),
        nodePath:
          '[D] BodyRow :: Basic / Cells / [D] BodyCell :: Basic / Content / Text 1 / Amount / Major',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: null,
          nestedOwnerComponentRole: 'Part',
          nestedOwnerPath: '[D] BodyCell :: Basic / Content / Text 1',
          nestedOwnerRelativePath: 'Amount / Major',
        },
      },
    ],
    {
      libraryName: 'Web :: Corp Components',
      componentName: '[D] BodyRow :: Basic',
      referenceComponentName: '[D] BodyRow :: Basic',
    },
  );

  assert.equal(
    bodyCellTextDiffs.length,
    0,
    'BodyCell must allow tokenized nested Text fill and typography overrides',
  );

  const directBodyCellTextDiffs = applyAllowedCustomizationRules(
    [
      {
        ...makeDiff('Content', 'Отступ между элементами: 6 → 0'),
        nodePath: 'Presets=Text, Skeleton=False / Content',
      },
      {
        ...makeDiff(
          'Minus',
          'Стиль текст: Paragraph/16–20 Component Primary → Paragraph/14–20 Primary Small',
        ),
        nodePath: 'Presets=Text, Skeleton=False / Content / Text 1 / Operation / Minus',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: null,
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: 'Presets=Text, Skeleton=False / Content / Text 1',
          nestedOwnerRelativePath: 'Operation / Minus',
        },
      },
      {
        ...makeDiff('Currency', 'заливка: text/primary → text/positive'),
        nodePath: 'Presets=Text, Skeleton=False / Content / Text 1 / Amount / Currency',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: null,
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: 'Presets=Text, Skeleton=False / Content / Text 1',
          nestedOwnerRelativePath: 'Amount / Currency',
        },
      },
    ],
    {
      libraryName: 'Web :: Corp Components',
      componentName: '[D] BodyCell :: Basic',
      referenceComponentName: '[D] BodyCell :: Basic',
    },
  );

  assert.equal(
    directBodyCellTextDiffs.length,
    0,
    'Direct BodyCell audit must allow known text overrides and Content spacing override',
  );

  const bodyCellStatusDiffs = applyAllowedCustomizationRules(
    [
      {
        ...makeDiff('Status', 'заливка: status-muted-alt/info → decorative-muted-alt/green'),
        nodePath:
          '[D] BodyRow :: Basic / Cells / [D] BodyCell :: Basic / Content / Status / Status',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: 'status-component',
          nestedOwnerComponentRole: 'Part',
          nestedOwnerPath: '[D] BodyCell :: Basic / Content / Status',
          nestedOwnerRelativePath: 'Status',
        },
      },
      {
        ...makeDiff('Label', 'заливка: text/info → decorative-text/green'),
        nodePath:
          '[D] BodyRow :: Basic / Cells / [D] BodyCell :: Basic / Content / Status / Label',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: 'status-component',
          nestedOwnerComponentRole: 'Part',
          nestedOwnerPath: '[D] BodyCell :: Basic / Content / Status',
          nestedOwnerRelativePath: 'Label',
        },
      },
    ],
    {
      libraryName: 'Web :: Corp Components',
      componentName: '[D] BodyRow :: Basic',
      referenceComponentName: '[D] BodyRow :: Basic',
    },
  );

  assert.equal(
    bodyCellStatusDiffs.length,
    0,
    'BodyCell must allow tokenized nested Status fill overrides',
  );

  const directBodyCellStatusDiffs = applyAllowedCustomizationRules(
    [
      {
        ...makeDiff('Status', 'заливка: status-muted-alt/info → decorative-muted-alt/green'),
        nodePath: 'Presets=Status, Skeleton=False / Content / StatusPreset / Status',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: 'status-component',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: 'Presets=Status, Skeleton=False / Content / StatusPreset / Status',
          nestedOwnerRelativePath: '',
        },
      },
      {
        ...makeDiff('Label', 'заливка: text/info → decorative-text/green'),
        nodePath: 'Presets=Status, Skeleton=False / Content / StatusPreset / Status / 🔩 Label / Label',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: 'status-component',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: 'Presets=Status, Skeleton=False / Content / StatusPreset / Status',
          nestedOwnerRelativePath: '🔩 Label / Label',
        },
      },
    ],
    {
      libraryName: 'Web :: Corp Components',
      componentName: '[D] BodyCell :: Basic',
      referenceComponentName: '[D] BodyCell :: Basic',
    },
  );

  assert.equal(
    directBodyCellStatusDiffs.length,
    0,
    'Direct BodyCell audit must allow tokenized Status recolors',
  );

  const directStatusDiffs = applyAllowedCustomizationRules(
    [
      {
        ...makeDiff('Status', 'заливка: status-muted-alt/info → decorative-muted-alt/green'),
        nodePath: 'Size=20, Shape=Rounded, LeftAddon=False',
      },
      {
        ...makeDiff('Label', 'заливка: text/info → decorative-text/green'),
        nodePath: 'Size=20, Shape=Rounded, LeftAddon=False / Label / Label',
      },
    ],
    {
      libraryName: 'Web :: Core',
      componentName: 'Status',
      referenceComponentName: 'Status',
    },
  );

  assert.equal(
    directStatusDiffs.length,
    0,
    'Direct Status audit must allow tokenized fill overrides for any internal layer',
  );

  const directAmountDiffs = applyAllowedCustomizationRules(
    [
      makeDiff('Major', 'заливка: text/primary → text/tertiary'),
      makeDiff('Minor', 'заливка: text/primary → text/secondary'),
      makeDiff('Currency', 'заливка: text/primary → text/positive'),
      makeDiff('Currency', 'заливка: text/primary → #123456'),
    ],
    {
      libraryName: 'Web :: Core',
      componentName: 'Amount',
      referenceComponentName: 'Amount',
    },
  );

  assert.equal(
    directAmountDiffs.length,
    1,
    'Direct Amount audit must allow tokenized text recolors and keep raw colors visible',
  );
  assert.equal(
    directAmountDiffs[0].message,
    'заливка: text/primary → #123456',
    'Amount raw fill color must remain visible',
  );

  const nestedAmountDiffs = applyAllowedCustomizationRules(
    [
      {
        ...makeDiff('Major', 'заливка: text/primary → text/warning'),
        nodePath: 'Host / Amount / Major',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: 'amount-component',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: 'Host / Amount',
          nestedOwnerRelativePath: 'Major',
        },
      },
    ],
    {
      libraryName: 'Web :: Corp Components',
      componentName: 'Host',
      referenceComponentName: 'Host',
    },
  );

  assert.equal(
    nestedAmountDiffs.length,
    0,
    'Nested Amount audit must allow tokenized text recolors even in non-core hosts',
  );

  const nestedStatusBadgeDiffs = applyAllowedCustomizationRules(
    [
      {
        ...makeDiff('PaintMe', 'заливка: status/info → text/primary'),
        nodePath: 'Host / Addon / StatusBadge / PaintMe',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: 'status-badge-component',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: 'Host / Addon / StatusBadge',
          nestedOwnerRelativePath: '🔩 Content / Fixer / PaintMe',
        },
      },
    ],
    {
      libraryName: 'Web :: Corp Components',
      componentName: 'Host',
      referenceComponentName: 'Host',
    },
  );

  assert.equal(
    nestedStatusBadgeDiffs.length,
    0,
    'Nested StatusBadge PaintMe recolor must be allowed in host Addon contexts',
  );

  for (const { componentName, libraryName } of [
    { componentName: '[D] FilterTag', libraryName: 'Web :: Core' },
    { componentName: '[D] Tag', libraryName: 'Web :: Core' },
    { componentName: '[D] IconButton', libraryName: 'Web :: Core' },
    { componentName: 'ActionButton', libraryName: 'Web :: Core' },
    { componentName: '[D] CompactTag', libraryName: 'Web :: Corp Components' },
  ]) {
    const hostControlledPaintMeDiffs = applyAllowedCustomizationRules(
      [makeDiff('PaintMe', 'заливка: text/info → text/primary')],
      {
        libraryName,
        componentName,
        referenceComponentName: componentName,
      },
    );

    assert.equal(
      hostControlledPaintMeDiffs.length,
      1,
      `${componentName} PaintMe recolor must remain visible as host-controlled customization`,
    );
  }

  const paymentMaskedDiffs = applyAllowedCustomizationRules(
    [
      makeDiff('✎ Major', 'заливка: text/primary → text/secondary'),
      makeDiff('✎ Minor', 'заливка: text/primary → text/tertiary'),
      makeDiff('✎ Minor', 'заливка: text/primary → #123456'),
    ],
    {
      libraryName: 'Web :: Corp Components',
      componentName: 'PaymentMaskedNumber',
      referenceComponentName: 'PaymentMaskedNumber',
    },
  );

  assert.equal(
    paymentMaskedDiffs.length,
    1,
    'PaymentMaskedNumber must allow tokenized text recolors and keep raw colors visible',
  );
  assert.equal(
    paymentMaskedDiffs[0].message,
    'заливка: text/primary → #123456',
    'PaymentMaskedNumber raw fill color must remain visible',
  );

  console.log('Allowed customization regression checks passed');
}

main();
