const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule(entryPoint, label) {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-${label}-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, entryPoint)],
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

function sizingNode({
  id,
  parentId = null,
  path: nodePath,
  name,
  horizontal = 'FILL',
  vertical = 'HUG',
  width = 120,
  height = 40,
  type = 'FRAME',
  componentInstance = null,
}) {
  return {
    id,
    parentId,
    nodeId: String(id),
    path: nodePath,
    type,
    name,
    visible: true,
    opacity: 1,
    radius: null,
    layout: {
      width,
      height,
      sizing: { horizontal, vertical },
      itemSpacing: 12,
    },
    componentInstance,
  };
}

function main() {
  const { diffStructures } = loadModule(
    '../src/structure/diff.ts',
    'layout-sizing-diff',
  );
  const { setNodeLayoutSizing } = loadModule(
    '../src/structure/layoutSizing.ts',
    'layout-sizing-reset',
  );

  const reference = [
    sizingNode({ id: 1, path: 'Slot', name: 'Slot' }),
  ];
  const changed = [
    sizingNode({
      id: 1,
      path: 'Slot',
      name: 'Slot',
      horizontal: 'FIXED',
      vertical: 'FILL',
    }),
  ];
  const diffs = diffStructures(changed, reference).diffs;
  const horizontal = diffs.find(
    (diff) => diff.details?.property === 'layout.sizing.horizontal',
  );
  const vertical = diffs.find(
    (diff) => diff.details?.property === 'layout.sizing.vertical',
  );
  assert.ok(horizontal, 'FILL -> FIXED must produce a horizontal sizing diff');
  assert.ok(vertical, 'HUG -> FILL must produce a vertical sizing diff');
  assert.equal(horizontal.message, 'Ширина в auto-layout: Fill → Fixed');
  assert.equal(vertical.message, 'Высота в auto-layout: Hug → Fill');
  assert.equal(horizontal.diffKind, 'layout');
  assert.equal(
    diffStructures(reference, reference).diffs.some((diff) =>
      diff.details?.property.startsWith('layout.sizing.'),
    ),
    false,
    'Unchanged sizing must not produce a diff',
  );

  const resized = [
    sizingNode({ id: 1, path: 'Slot', name: 'Slot', width: 144 }),
  ];
  const widthDiff = diffStructures(resized, reference).diffs.find(
    (diff) => diff.details?.property === 'layout.width',
  );
  assert.ok(widthDiff, 'A changed fixed width must produce contract evidence');
  assert.equal(widthDiff.details.reference.value, 120);
  assert.equal(widthDiff.details.actual.value, 144);
  assert.equal(widthDiff.contractEvidenceOnly, true);
  assert.equal(
    diffStructures(reference, reference).diffs.some(
      (diff) => diff.details?.property === 'layout.width',
    ),
    false,
    'An unchanged numeric width must not produce contract evidence',
  );

  globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__ = [
    {
      componentKey: 'web-corp.background-plate',
      aliases: ['[D] BackgroundPlateSlot'],
      figmaKeys: ['figma-background-plate-slot-key'],
      rulesFile: {
        componentKey: 'web-corp.background-plate',
        rules: [
          {
            ruleId:
              'component:web-corp.background-plate.slot-sizing-fill-width-hug-height',
            severity: 'error',
            ruleKind: 'design-rule',
            severityScope: 'design',
            source: 'pattern-link',
            appliesTo:
              'layout.sizing.horizontal|layout.sizing.vertical|layoutSizingHorizontal|layoutSizingVertical',
            checkType: 'deterministic',
            matchKind: 'exact_component_rule',
            target: {
              component: 'web-corp.background-plate',
              layers: ['[D] BackgroundPlateSlot / Slot'],
            },
            requiredValues: {
              'layout.sizing.horizontal': 'FILL',
              'layout.sizing.vertical': 'HUG',
              layoutSizingHorizontal: 'FILL',
              layoutSizingVertical: 'HUG',
            },
            ruleText: 'Slot must use Fill width and Hug height.',
          },
        ],
      },
    },
  ];

  const {
    applyRequiredComponentSizingAssessment,
    createRequiredComponentSizingDiffs,
    findComponentContractViolationForDiff,
    hasRequiredComponentSizingRules,
  } = loadModule('../src/contracts/componentRules.ts', 'layout-sizing-rules');
  assert.equal(
    hasRequiredComponentSizingRules('figma-background-plate-slot-key'),
    true,
    'Required sizing rules must force structural audit without instance.overrides',
  );
  assert.equal(
    hasRequiredComponentSizingRules('unrelated-component-key'),
    false,
  );
  const root = sizingNode({
    id: 10,
    path: 'Type=Primary, Skeleton=False',
    name: '[D] BackgroundPlateSlot / Payments in progress',
    type: 'INSTANCE',
    componentInstance: {
      componentKey: 'figma-background-plate-slot-key',
      variantProperties: { Level: '1' },
    },
  });
  const slot = sizingNode({
    id: 11,
    parentId: 10,
    path: 'Type=Primary, Skeleton=False / Slot',
    name: 'Slot',
    horizontal: 'FIXED',
    vertical: 'FILL',
  });
  const ruleDiffs = createRequiredComponentSizingDiffs([root, slot]);
  assert.equal(ruleDiffs.length, 2);
  assert.deepEqual(
    ruleDiffs.map((diff) => diff.details.property).sort(),
    ['layout.sizing.horizontal', 'layout.sizing.vertical'],
  );
  for (const diff of ruleDiffs) {
    assert.equal(
      diff.context.actualNestedOwnerComponentKey,
      'figma-background-plate-slot-key',
    );
    assert.equal(
      diff.context.actualNestedOwnerPath,
      'Type=Primary, Skeleton=False',
    );
    assert.equal(diff.context.actualNestedOwnerRelativePath, 'Slot');
    assert.deepEqual(diff.context.actualVariantProperties, { Level: '1' });
    assert.equal(diff.assessment.source, 'component-contract');
    assert.equal(
      findComponentContractViolationForDiff(diff)?.ruleId,
      'component:web-corp.background-plate.slot-sizing-fill-width-hug-height',
    );
  }

  const nestedCatalogDiff = diffStructures(
    [root, slot],
    [
      root,
      sizingNode({
        id: 11,
        parentId: 10,
        path: 'Type=Primary, Skeleton=False / Slot',
        name: 'Slot',
      }),
    ],
  ).diffs.find(
    (diff) => diff.details?.property === 'layout.sizing.horizontal',
  );
  assert.ok(nestedCatalogDiff);
  assert.equal(
    applyRequiredComponentSizingAssessment(nestedCatalogDiff).assessment?.ruleId,
    'component:web-corp.background-plate.slot-sizing-fill-width-hug-height',
    'Catalog-backed sizing diffs must retain the deterministic rule assessment',
  );

  const resetTarget = {
    layoutSizingHorizontal: 'FIXED',
    layoutSizingVertical: 'FILL',
    itemSpacing: 12,
    paddingLeft: 24,
  };
  assert.equal(setNodeLayoutSizing(resetTarget, 'horizontal', 'Fill'), true);
  assert.equal(resetTarget.layoutSizingHorizontal, 'FILL');
  assert.equal(resetTarget.layoutSizingVertical, 'FILL');
  assert.equal(resetTarget.itemSpacing, 12);
  assert.equal(resetTarget.paddingLeft, 24);
  assert.equal(setNodeLayoutSizing(resetTarget, 'vertical', 'Hug'), true);
  assert.equal(resetTarget.layoutSizingHorizontal, 'FILL');
  assert.equal(resetTarget.layoutSizingVertical, 'HUG');

  delete globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__;
  console.log('Layout sizing diff regression checks passed');
}

main();
