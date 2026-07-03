const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadContractAwareDiffs() {
  const entryPoint = path.resolve(__dirname, '../src/contracts/contractAwareDiffs.ts');
  const outfile = path.join(
    os.tmpdir(),
    `apollo-contract-aware-diffs-${process.pid}-${Date.now()}.cjs`,
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

function makeNode(id, pathName, name, overrides) {
  return Object.assign(
    {
      id,
      parentId: id === 1 ? null : 1,
      path: pathName,
      type: 'FRAME',
      name,
      visible: true,
      radius: null,
    },
    overrides || {},
  );
}

function makeDiff(nodePath, property, referenceValue, actualValue) {
  return {
    message: `${property}: ${referenceValue} → ${actualValue}`,
    nodePath,
    nodeName: nodePath.split(' / ').pop(),
    context: {
      actualComponentKey: null,
      referenceComponentKey: null,
      referenceOrigin: 'nested-component',
      actualNestedOwnerComponentKey: null,
      actualNestedOwnerPath: null,
      actualNestedOwnerRelativePath: null,
      nestedOwnerComponentKey: null,
      nestedOwnerComponentRole: null,
      nestedOwnerPath: null,
      nestedOwnerRelativePath: null,
    },
    details: {
      property,
      reference: { value: referenceValue },
      actual: { value: actualValue },
    },
  };
}

function main() {
  const { applyContractAwareDiffs } = loadContractAwareDiffs();
  const coreTabsContract = {
    componentKey: 'web-core-navigation.tabs',
    component: {
      name: 'Tabs',
      library: 'Web :: Core Navigation',
    },
    standaloneBaselines: [
      {
        targetPathPattern: 'TabsPrimary / Items',
        property: 'layout.itemSpacing',
        expectedValue: 24,
      },
      {
        targetPathPattern: 'TabsPrimary / Items / TabPrimary',
        property: 'layout.itemSpacing',
        expectedValue: 12,
      },
      {
        targetPathPattern: 'TabsPrimary / Items / TabPrimary / Content / Label',
        property: 'styles.text',
        expectedValue: 'Paragraph/18–24 Primary Large',
      },
    ],
  };
  globalThis.__APOLLO_TEST_REMOTE_COMPOSITION_CONTRACT_REGISTRY__ = [
    {
      aliases: ['TabsView', '[D] TabsView'],
      contract: {
        componentKey: 'web-corp.tabs-view',
        component: {
          name: 'TabsView',
          library: 'Web _ Corp Components',
        },
        allowedOverrides: [
          {
            targetPathPattern: 'TabsPrimary / Items',
            property: 'layout.itemSpacing',
            expectedOverride: 32,
            reason: 'TabsView управляет spacing между primary tab items.',
          },
          {
            targetPathPattern: 'TabsPrimary / Items / TabPrimary',
            property: 'layout.itemSpacing',
            expectedOverride: 16,
            reason: 'TabsView управляет spacing внутри каждого primary tab item.',
          },
          {
            targetPathPattern: 'TabsPrimary / Items / TabPrimary / Content / Label',
            property: 'styles.text',
            expectedOverride: 'Action/18–24 Primary Large',
            reason: 'TabsView применяет action typography к nested primary tab labels.',
          },
        ],
      },
      companionContracts: [coreTabsContract],
    },
    {
      aliases: ['Tabs'],
      contract: coreTabsContract,
    },
    {
      aliases: ['TitleView', '[D] TitleView'],
      contract: {
        componentKey: 'web-corp.title-view',
        component: {
          name: 'TitleView',
          library: 'Web _ Corp Components',
        },
      },
    },
    {
      aliases: ['ButtonGroup [D]', '[D] ButtonsGroup'],
      contract: {
        componentKey: 'web-corp.buttons-group',
        component: {
          name: 'ButtonGroup [D]',
          library: 'Web _ Corp Components',
        },
      },
    },
    {
      aliases: ['BackgroundPlate', '[D] BackgroundPlate'],
      contract: {
        componentKey: 'web-corp.background-plate',
        component: {
          name: 'BackgroundPlate',
          library: 'Web _ Corp Components',
        },
      },
    },
  ];

  const hostReference = [
    makeNode(1, 'Skeleton=False', 'Skeleton=False'),
    makeNode(2, 'Skeleton=False / TabsPrimary / Items', 'Items', {
      layout: { itemSpacing: 32 },
    }),
    makeNode(
      3,
      'Skeleton=False / TabsPrimary / Items / TabPrimary / Content / Label',
      'Label',
      {
        styles: { text: { styleKey: 'style-action-18-24-primary-large' } },
      },
    ),
  ];

  const actualStructure = [
    makeNode(1, 'Skeleton=False', 'Skeleton=False'),
    makeNode(2, 'Skeleton=False / TabsPrimary / Items', 'Items', {
      layout: { itemSpacing: 32 },
    }),
    makeNode(
      3,
      'Skeleton=False / TabsPrimary / Items / TabPrimary / Content / Label',
      'Label',
      {
        styles: { text: { styleKey: 'style-action-18-24-primary-large' } },
      },
    ),
  ];

  const suppressed = applyContractAwareDiffs(
    [
      makeDiff(
        'Skeleton=False / TabsPrimary / Items',
        'layout.itemSpacing',
        24,
        32,
      ),
    ],
    {
      enabled: true,
      hostComponentKey: 'tabs-view-key',
      hostComponentName: '[D] TabsView',
      actualStructure,
      hostReference,
      resolveStyleLabel: () => null,
    },
  );

  assert.equal(suppressed.diffs.length, 0);
  assert.equal(suppressed.suppressedCount, 1);

  const rebased = applyContractAwareDiffs(
    [
      makeDiff(
        'Skeleton=False / TabsPrimary / Items',
        'layout.itemSpacing',
        24,
        40,
      ),
    ],
    {
      enabled: true,
      hostComponentKey: 'tabs-view-key',
      hostComponentName: '[D] TabsView',
      actualStructure,
      hostReference,
      resolveStyleLabel: () => null,
    },
  );

  assert.equal(rebased.diffs.length, 1);
  assert.equal(rebased.rebasedCount, 1);
  assert.equal(rebased.diffs[0].details.reference.value, 32);
  assert.equal(rebased.diffs[0].message, 'Отступ между элементами: 32 → 40');

  const styleSuppressed = applyContractAwareDiffs(
    [
      makeDiff(
        'Skeleton=False / TabsPrimary / Items / TabPrimary / Content / Label',
        'styles.text',
        'Paragraph/18–24 Primary Large',
        'Action/18–24 Primary Large',
      ),
    ],
    {
      enabled: true,
      hostComponentKey: 'tabs-view-key',
      hostComponentName: '[D] TabsView',
      actualStructure,
      hostReference,
      resolveStyleLabel: (styleKey) =>
        styleKey === 'style-action-18-24-primary-large'
          ? 'Action/18–24 Primary Large'
          : null,
    },
  );

  assert.equal(styleSuppressed.diffs.length, 0);
  assert.equal(styleSuppressed.suppressedCount, 1);

  const shortTabsViewDiffsSuppressed = applyContractAwareDiffs(
    [
      makeDiff('TabPrimary', 'layout.itemSpacing', 12, 16),
      makeDiff(
        'Label',
        'styles.text',
        'Paragraph/18–24 Primary Large',
        'Action/18–24 Primary Large',
      ),
    ],
    {
      enabled: true,
      hostComponentKey: 'tabs-view-key',
      hostComponentName: '[D] TabsView',
      actualStructure,
      hostReference,
      resolveStyleLabel: () => null,
    },
  );

  assert.equal(
    shortTabsViewDiffsSuppressed.diffs.length,
    0,
    'TabsView must suppress short-path Core Tabs baseline diffs when actual equals host effective baseline',
  );
  assert.equal(shortTabsViewDiffsSuppressed.suppressedCount, 2);
  assert.deepEqual(shortTabsViewDiffsSuppressed.matchedContractKeys, [
    'web-corp.tabs-view',
    'web-core-navigation.tabs',
  ]);

  const shortTabsViewDiffRebased = applyContractAwareDiffs(
    [makeDiff('TabPrimary', 'layout.itemSpacing', 12, 20)],
    {
      enabled: true,
      hostComponentKey: 'tabs-view-key',
      hostComponentName: '[D] TabsView',
      actualStructure,
      hostReference,
      resolveStyleLabel: () => null,
    },
  );

  assert.equal(shortTabsViewDiffRebased.diffs.length, 1);
  assert.equal(shortTabsViewDiffRebased.diffs[0].details.reference.value, 16);
  assert.equal(
    shortTabsViewDiffRebased.diffs[0].message,
    'Отступ между элементами: 16 → 20',
  );

  const titleViewReference = [
    makeNode(1, 'View=xLarge, Skeleton=False', 'View=xLarge, Skeleton=False'),
    makeNode(
      2,
      'View=xLarge, Skeleton=False / MainContent / Button group / [D] Button',
      '[D] Button',
      {
        type: 'INSTANCE',
        componentInstance: {
          variantProperties: {
            View: 'Secondary',
          },
        },
      },
    ),
  ];
  const titleViewActual = [
    makeNode(1, 'View=xLarge, Skeleton=False', 'View=xLarge, Skeleton=False'),
    makeNode(
      2,
      'View=xLarge, Skeleton=False / MainContent / Button group / [D] Button',
      '[D] Button',
      {
        type: 'INSTANCE',
        componentInstance: {
          variantProperties: {
            View: 'Secondary',
          },
        },
      },
    ),
  ];
  const titleViewSuppressed = applyContractAwareDiffs(
    [
      makeDiff(
        'View=xLarge, Skeleton=False / MainContent / Button group / [D] Button',
        'variant.View',
        'Primary',
        'Secondary',
      ),
    ],
    {
      enabled: true,
      hostComponentKey: 'title-view-key',
      hostComponentName: '[D] TitleView',
      actualStructure: titleViewActual,
      hostReference: titleViewReference,
      resolveStyleLabel: () => null,
    },
  );

  assert.equal(titleViewSuppressed.diffs.length, 0);
  assert.deepEqual(titleViewSuppressed.matchedContractKeys, ['web-corp.title-view']);

  const titleViewRebased = applyContractAwareDiffs(
    [
      makeDiff(
        'View=xLarge, Skeleton=False / MainContent / Button group / [D] Button',
        'variant.View',
        'Primary',
        'Accent',
      ),
    ],
    {
      enabled: true,
      hostComponentKey: 'title-view-key',
      hostComponentName: '[D] TitleView',
      actualStructure: titleViewActual,
      hostReference: titleViewReference,
      resolveStyleLabel: () => null,
    },
  );

  assert.equal(titleViewRebased.diffs.length, 1);
  assert.equal(titleViewRebased.diffs[0].details.reference.value, 'Secondary');
  assert.equal(titleViewRebased.diffs[0].message, 'view: Secondary → Accent');

  const buttonsGroupReference = [
    makeNode(1, 'Size=56, Overflow=false', 'Size=56, Overflow=false'),
    makeNode(2, 'Size=56, Overflow=false / [D] Button', '[D] Button', {
      type: 'INSTANCE',
      componentInstance: {
        variantProperties: {
          SingleIcon: 'True',
        },
      },
    }),
  ];
  const buttonsGroupSuppressed = applyContractAwareDiffs(
    [
      makeDiff(
        'Size=56, Overflow=false / [D] Button',
        'variant.SingleIcon',
        'False',
        'True',
      ),
    ],
    {
      enabled: true,
      hostComponentKey: 'buttons-group-key',
      hostComponentName: '[D] ButtonsGroup',
      actualStructure: buttonsGroupReference,
      hostReference: buttonsGroupReference,
      resolveStyleLabel: () => null,
    },
  );

  assert.equal(buttonsGroupSuppressed.diffs.length, 0);
  assert.deepEqual(buttonsGroupSuppressed.matchedContractKeys, [
    'web-corp.buttons-group',
  ]);

  const backgroundPlateReference = [
    makeNode(1, 'Position=Level 1 (outer)', 'Position=Level 1 (outer)', {
      type: 'INSTANCE',
      componentInstance: {
        variantProperties: {
          Position: 'Level 2 (inner)',
        },
      },
    }),
  ];
  const backgroundPlateSuppressed = applyContractAwareDiffs(
    [
      makeDiff(
        'Position=Level 1 (outer)',
        'variant.Position',
        'Level 1 (outer)',
        'Level 2 (inner)',
      ),
    ],
    {
      enabled: true,
      hostComponentKey: 'background-plate-key',
      hostComponentName: '[D] BackgroundPlate',
      actualStructure: backgroundPlateReference,
      hostReference: backgroundPlateReference,
      resolveStyleLabel: () => null,
    },
  );

  assert.equal(backgroundPlateSuppressed.diffs.length, 0);
  assert.deepEqual(backgroundPlateSuppressed.matchedContractKeys, [
    'web-corp.background-plate',
  ]);

  console.log('Contract-aware diff regression checks passed');
}

main();
