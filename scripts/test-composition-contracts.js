const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule(entryPath) {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-composition-contracts-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, entryPath)],
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
    fs.rmSync(outfile, {force: true});
  }
}

function node(id, overrides = {}) {
  return {
    id,
    nodeId: `node-${id}`,
    parentId: id === 1 ? null : 1,
    path: id === 1 ? '[D] ButtonsGroup' : '[D] ButtonsGroup / [D] Button',
    type: 'INSTANCE',
    name: id === 1 ? '[D] ButtonsGroup' : '[D] Button',
    visible: true,
    radius: null,
    componentInstance: {
      componentKey: id === 1 ? 'buttons-group-key' : 'button-key',
      variantProperties: id === 1 ? {Size: '56'} : {},
    },
    ...overrides,
  };
}

function structure(values) {
  return [
    node(1),
    ...values.map((value, index) =>
      node(index + 2, {
        visible: value.visible !== false,
        componentInstance: {
          componentKey: 'button-key',
          variantProperties: {
            View: value.View,
            SingleIcon: value.SingleIcon ?? 'False',
            ...(value.Size ? {Size: value.Size} : {}),
          },
        },
      }),
    ),
  ];
}

function reference(count) {
  return structure(
    Array.from({length: count}, (_, index) => ({
      View: index === 0 ? 'Primary' : 'Secondary',
      SingleIcon: 'False',
    })),
  );
}

function main() {
  const {validateCompositionContractsConfig} = loadModule(
    '../src/contracts/compositionContracts.ts',
  );
  const {compileContractCompositionArtifact} = loadModule(
    '../src/contracts/contractArtifactCompiler.ts',
  );
  const {
    applyCompositionContracts,
    hasMatchingCompositionContract,
  } = loadModule(
      '../src/contracts/compositionContractEngine.ts',
    );
  const {collapseSemanticVariantDiffs} = loadModule(
    '../src/assessment/customizationAssessment.ts',
  );
  const fixturePath = path.resolve(
    __dirname,
    'fixtures/composition-contracts.json',
  );
  const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const buttonGroupComposition = compileContractCompositionArtifact(
    fixtures.buttonGroup,
    ['ButtonGroup [D]', '[D] ButtonsGroup', '[M] ButtonsGroup'],
  );
  assert.ok(buttonGroupComposition);
  const config = buttonGroupComposition.contract;
  assert.equal(validateCompositionContractsConfig(config).contracts.length, 1);
  const titleViewComposition = compileContractCompositionArtifact(
    fixtures.titleView,
    ['TitleView', '[D] TitleView', '[M] TitleView'],
  );
  assert.ok(titleViewComposition);
  assert.equal(titleViewComposition.contract.contracts.length, 5);
  const backgroundPlateComposition = compileContractCompositionArtifact(
    fixtures.backgroundPlate,
    [
      'BackgroundPlate',
      '[D] BackgroundPlate',
      '[D][Promo] BackgroundPlate',
      '[M] BackgroundPlate',
      '[M][Promo] BackgroundPlate',
    ],
  );
  assert.ok(backgroundPlateComposition);
  assert.equal(backgroundPlateComposition.contract.contracts.length, 1);
  globalThis.__APOLLO_TEST_REMOTE_COMPOSITION_CONTRACT_REGISTRY__ = [
    buttonGroupComposition,
    titleViewComposition,
    backgroundPlateComposition,
  ];
  assert.equal(hasMatchingCompositionContract({
    hostComponentKey: null,
    hostComponentName: '[D] ButtonsGroup',
  }), true);
  assert.equal(hasMatchingCompositionContract({
    hostComponentKey: null,
    hostComponentName: '[D] OtherGroup',
  }), false);
  assert.equal(hasMatchingCompositionContract({
    hostComponentKey: '2c7332d281570f4d5af6d334f8df378d24a1f235',
    hostComponentName: '[D] BackgroundPlate',
  }), true);
  assert.equal(hasMatchingCompositionContract({
    hostComponentKey: 'fbc4ff889c9fe2db128bc76471f512271d4cc229',
    hostComponentName: '[D] TitleView',
  }), true);

  const audit = (
    actual,
    expectedCount = actual.length - 1,
    hostName = '[D] ButtonsGroup',
    hostReference = reference(expectedCount),
  ) =>
    applyCompositionContracts([], {
      actualStructure: actual,
      hostReference,
      hostComponentKey: 'buttons-group-key',
      hostComponentName: hostName,
      resolveComponent: (key) =>
        key === 'button-key'
          ? {key: 'button-key', displayName: '[D] Button'}
          : {key, displayName: hostName},
    });

  const noPrimary = audit(structure([
    {View: 'Secondary'},
    {View: 'Secondary'},
  ]));
  assert.equal(noPrimary.decisionCount, 1);
  assert.equal(noPrimary.diffs[0].assessment.verdict, 'expected');
  assert.equal(noPrimary.diffs[0].assessment.constraintId, 'allowed-views');

  const oneButton = audit(structure([{View: 'Secondary'}]));
  const oneButtonCount = oneButton.diffs.find(
    (diff) => diff.assessment?.constraintId === 'button-count',
  );
  assert.equal(oneButtonCount.details.property, 'composition.count');
  assert.equal(oneButtonCount.assessment.verdict, 'violation');

  const fiveButtons = audit(structure(Array.from({length: 5}, () => ({View: 'Secondary'}))));
  assert.ok(
    fiveButtons.diffs.some((diff) => diff.assessment?.constraintId === 'button-count'),
  );

  const invalidView = audit(structure([
    {View: 'Accent'},
    {View: 'Secondary'},
  ]));
  const invalidViewDiff = invalidView.diffs.find(
    (diff) => diff.assessment?.constraintId === 'allowed-views',
  );
  assert.equal(invalidViewDiff.assessment.verdict, 'violation');
  assert.equal(invalidViewDiff.assessment.remediation, null);

  const mismatchedSize = audit(structure([
    {View: 'Primary', Size: '56'},
    {View: 'Secondary', Size: '48'},
  ]));
  const sizeDiff = mismatchedSize.diffs.find(
    (diff) => diff.nodeId === 'node-3' && diff.details?.property === 'variant.Size',
  );
  assert.equal(sizeDiff.assessment.constraintId, 'uniform-size');
  assert.equal(sizeDiff.assessment.verdict, 'violation');
  assert.equal(sizeDiff.details.reference.value, '56');
  assert.equal(sizeDiff.details.actual.value, '48');
  assert.deepEqual(sizeDiff.assessment.remediation.properties, {Size: '56'});

  const missingSizeEvidence = audit(structure([
    {View: 'Primary'},
    {View: 'Secondary'},
  ]));
  assert.equal(
    missingSizeEvidence.diffs.some(
      (diff) => diff.assessment?.constraintId === 'uniform-size',
    ),
    false,
  );

  const misplacedPrimary = audit(structure([
    {View: 'Secondary'},
    {View: 'Primary'},
  ]));
  const primaryDiff = misplacedPrimary.diffs.find(
    (diff) => diff.nodeId === 'node-3' && diff.details?.property === 'variant.View',
  );
  assert.equal(primaryDiff.assessment.constraintId, 'primary-position');
  assert.equal(primaryDiff.details.reference.value, 'Secondary');
  assert.deepEqual(primaryDiff.assessment.remediation.properties, {View: 'Secondary'});

  const collidingReference = structure([
    {View: 'Primary'},
    {View: 'Primary'},
  ]);
  const misplacedPrimaryWithCollidingReference = audit(
    structure([
      {View: 'Secondary'},
      {View: 'Primary'},
    ]),
    2,
    '[D] ButtonsGroup',
    collidingReference,
  );
  const collidingPrimaryDiff = misplacedPrimaryWithCollidingReference.diffs.find(
    (diff) => diff.nodeId === 'node-3' && diff.details?.property === 'variant.View',
  );
  assert.equal(collidingPrimaryDiff.assessment.constraintId, 'primary-position');
  assert.equal(collidingPrimaryDiff.assessment.verdict, 'violation');
  assert.equal(collidingPrimaryDiff.details.reference.value, 'Secondary');
  assert.equal(collidingPrimaryDiff.details.actual.value, 'Primary');
  const collapsedCollision = collapseSemanticVariantDiffs(
    misplacedPrimaryWithCollidingReference.diffs,
    structure([
      {View: 'Secondary'},
      {View: 'Primary'},
    ]),
  );
  const visiblePrimaryViolation = collapsedCollision.find(
    (diff) => diff.nodeId === 'node-3' && diff.details?.property === 'variant.View',
  );
  assert.equal(visiblePrimaryViolation.assessment.constraintId, 'primary-position');
  assert.equal(visiblePrimaryViolation.message, 'view: secondary → primary');

  const allowedIcon = audit(structure([
    {View: 'Primary'},
    {View: 'Secondary'},
    {View: 'Secondary', SingleIcon: 'True'},
  ]));
  const allowedIconDiff = allowedIcon.diffs.find(
    (diff) => diff.details?.property === 'variant.SingleIcon',
  );
  assert.equal(allowedIconDiff.assessment.verdict, 'expected');
  assert.equal(allowedIconDiff.assessment.constraintId, 'single-icon-position');

  const misplacedIcon = audit(structure([
    {View: 'Primary', SingleIcon: 'True'},
    {View: 'Secondary'},
    {View: 'Secondary'},
  ]));
  const misplacedIconDiff = misplacedIcon.diffs.find(
    (diff) => diff.nodeId === 'node-2' && diff.details?.property === 'variant.SingleIcon',
  );
  assert.equal(misplacedIconDiff.assessment.verdict, 'violation');
  assert.deepEqual(misplacedIconDiff.assessment.remediation.properties, {
    SingleIcon: 'False',
  });

  const duplicateIcon = audit(structure([
    {View: 'Primary', SingleIcon: 'True'},
    {View: 'Secondary'},
    {View: 'Secondary', SingleIcon: 'True'},
  ]));
  const duplicateIconDiffs = duplicateIcon.diffs.filter(
    (diff) => diff.assessment?.constraintId === 'single-icon-position',
  );
  assert.equal(duplicateIconDiffs.length, 2);
  assert.equal(
    duplicateIconDiffs.find((diff) => diff.nodeId === 'node-2').assessment.verdict,
    'violation',
  );
  assert.equal(
    duplicateIconDiffs.find((diff) => diff.nodeId === 'node-4').assessment.verdict,
    'expected',
  );

  const hiddenFifth = audit(structure([
    {View: 'Primary'},
    {View: 'Secondary'},
    {View: 'Secondary'},
    {View: 'Secondary'},
    {View: 'Secondary', visible: false},
  ]), 5);
  assert.ok(
    !hiddenFifth.diffs.some((diff) => diff.assessment?.constraintId === 'button-count'),
  );

  const unrelated = audit(
    structure([{View: 'Accent'}, {View: 'Primary'}]),
    2,
    '[D] OtherGroup',
  );
  assert.equal(unrelated.matchedContractIds.length, 0);
  assert.equal(unrelated.diffs.length, 0);

  const backgroundHostKey = '2c7332d281570f4d5af6d334f8df378d24a1f235';
  const backgroundStyleKey = 'adb65a62cde9ebedc5d0d41d2d77cd63e71e0745';
  const backgroundStructure = (type) => [
    node(1, {
      name: '[D] BackgroundPlate',
      path: 'Position=Level 1 (outer)',
      componentInstance: {
        componentKey: backgroundHostKey,
        variantProperties: {Position: 'Level 1 (outer)'},
      },
    }),
    node(2, {
      name: '[D] Style Level 1',
      path: 'Position=Level 1 (outer) / [D] Style Level 1',
      componentInstance: {
        componentKey: backgroundStyleKey,
        variantProperties: {Type: type},
      },
    }),
  ];
  const auditBackground = (type) => applyCompositionContracts([], {
    actualStructure: backgroundStructure(type),
    hostReference: backgroundStructure('Primary'),
    hostComponentKey: backgroundHostKey,
    hostComponentName: '[D] BackgroundPlate',
    resolveComponent: (key) => ({
      key,
      displayName:
        key === backgroundStyleKey
          ? '[D] Style Level 1'
          : '[D] BackgroundPlate',
    }),
  });

  const secondaryBackground = auditBackground('Secondary');
  assert.deepEqual(secondaryBackground.matchedContractIds, [
    'background-plate.composition',
  ]);
  assert.equal(secondaryBackground.diffs.length, 1);
  assert.equal(secondaryBackground.diffs[0].assessment.verdict, 'expected');
  assert.equal(
    secondaryBackground.diffs[0].assessment.constraintId,
    'level-one-type',
  );
  assert.equal(secondaryBackground.diffs[0].details.reference.value, 'Primary');
  assert.equal(secondaryBackground.diffs[0].details.actual.value, 'Secondary');

  const manualBackgroundPaint = applyCompositionContracts([
    {
      message: 'заливка: neutral/100 → decorative/green',
      nodePath: 'Position=Level 1 (outer) / [D] Style Level 1 / Surface',
      nodeName: 'Surface',
      nodeId: 'surface-node',
      visible: true,
      diffKind: 'paint',
      context: {
        actualComponentKey: null,
        referenceComponentKey: null,
        referenceOrigin: 'host',
        actualNestedOwnerComponentKey: backgroundStyleKey,
        actualNestedOwnerPath:
          'Position=Level 1 (outer) / [D] Style Level 1',
        actualNestedOwnerRelativePath: 'Surface',
        nestedOwnerComponentKey: backgroundStyleKey,
        nestedOwnerComponentRole: null,
        nestedOwnerPath: 'Position=Level 1 (outer) / [D] Style Level 1',
        nestedOwnerRelativePath: 'Surface',
      },
      details: {
        property: 'fill',
        reference: {value: 'neutral/100'},
        actual: {value: 'decorative/green'},
      },
    },
  ], {
    actualStructure: backgroundStructure('Secondary'),
    hostReference: backgroundStructure('Primary'),
    hostComponentKey: backgroundHostKey,
    hostComponentName: '[D] BackgroundPlate',
    resolveComponent: (key) => ({
      key,
      displayName:
        key === backgroundStyleKey
          ? '[D] Style Level 1'
          : '[D] BackgroundPlate',
    }),
  });
  assert.equal(
    manualBackgroundPaint.diffs.find((diff) => diff.nodeId === 'surface-node')
      .assessment,
    undefined,
    'A valid Type switch must not mark independent subtree paint as Expected.',
  );
  assert.ok(
    manualBackgroundPaint.diffs.some(
      (diff) => diff.details?.property === 'variant.Type',
    ),
  );

  const invalidBackground = auditBackground('Unsupported');
  assert.equal(invalidBackground.diffs.length, 1);
  assert.equal(invalidBackground.diffs[0].assessment.verdict, 'violation');
  assert.equal(invalidBackground.diffs[0].assessment.remediation, null);

  const desktopTitleViewKey = 'fbc4ff889c9fe2db128bc76471f512271d4cc229';
  const titleViewStructure = (size, buttons = [
    {View: 'Primary', SingleIcon: 'False', Size: '56'},
    {View: 'Secondary', SingleIcon: 'False', Size: '56'},
  ], titleStatusType = null) => [
    node(1, {
      name: '[D] TitleView',
      path: 'View=xLarge, Skeleton=False',
      componentInstance: {
        componentKey: desktopTitleViewKey,
        variantProperties: {View: 'xLarge', Skeleton: 'False'},
      },
    }),
    node(2, {
      name: 'StatusPreset',
      path: 'View=xLarge, Skeleton=False / MainContent / Status / StatusPreset',
      componentInstance: {
        componentKey: 'status-preset-variant-key',
        variantProperties: {Size: size, Style: 'Contrast', Type: 'Approved'},
      },
    }),
    ...buttons.map((button, index) => node(index + 3, {
      name: '[D] Button',
      path: 'View=xLarge, Skeleton=False / MainContent / Button group / [D] Button',
      componentInstance: {
        componentKey: 'title-view-button-key',
        variantProperties: button,
      },
    })),
    ...(titleStatusType ? [node(buttons.length + 3, {
      name: '[D] TitleStatus',
      path: 'View=xLarge, Skeleton=False / MainContent / [D] TitleStatus',
      componentInstance: {
        componentKey: 'title-status-key',
        variantProperties: {Type: titleStatusType},
      },
    })] : []),
  ];
  const auditTitleView = (size, buttons, referenceButtons) => applyCompositionContracts([], {
    actualStructure: titleViewStructure(size, buttons),
    hostReference: titleViewStructure('24', referenceButtons),
    hostComponentKey: desktopTitleViewKey,
    hostComponentName: '[D] TitleView',
    resolveComponent: (key) => ({
      key,
      displayName:
        key === 'status-preset-variant-key'
            ? '🔒 [D] StatusPreset'
            : key === 'title-view-button-key'
              ? '[D] Button'
              : key === 'title-status-key'
                ? '[D] TitleStatus'
              : '[D] TitleView',
    }),
  });

  const validTitleView = auditTitleView('24');
  assert.deepEqual(validTitleView.matchedContractIds, [
    'title-view.status.composition',
    'title-view.status-type-relation.composition',
    'title-view.button-group.composition',
    'title-view.desktop-button-size.composition',
  ]);
  assert.equal(validTitleView.diffs.length, 0);

  const invalidTitleView = auditTitleView('20');
  assert.equal(invalidTitleView.diffs.length, 1);
  assert.equal(invalidTitleView.diffs[0].assessment.verdict, 'violation');
  assert.equal(invalidTitleView.diffs[0].assessment.constraintId, 'status-size');
  assert.equal(invalidTitleView.diffs[0].details.reference.value, '24');
  assert.equal(invalidTitleView.diffs[0].details.actual.value, '20');
  assert.deepEqual(invalidTitleView.diffs[0].assessment.remediation.properties, {
    Size: '24',
  });

  const titleViewMisplacedPrimary = auditTitleView(
    '24',
    [
      {View: 'Secondary', SingleIcon: 'False', Size: '56'},
      {View: 'Primary', SingleIcon: 'False', Size: '56'},
    ],
    [
      {View: 'Primary', SingleIcon: 'False', Size: '56'},
      {View: 'Secondary', SingleIcon: 'False', Size: '56'},
    ],
  );
  const titleViewPrimaryViolation = titleViewMisplacedPrimary.diffs.find(
    (diff) =>
      diff.nodeId === 'node-4' &&
      diff.assessment?.constraintId === 'primary-position',
  );
  assert.ok(titleViewPrimaryViolation);
  assert.equal(titleViewPrimaryViolation.assessment.verdict, 'violation');
  assert.equal(
    titleViewPrimaryViolation.assessment.contractId,
    'title-view.button-group.composition',
  );
  assert.deepEqual(titleViewPrimaryViolation.assessment.remediation.properties, {
    View: 'Secondary',
  });

  const titleStatusMismatch = applyCompositionContracts([], {
    actualStructure: titleViewStructure('24', undefined, 'Action'),
    hostReference: titleViewStructure('24', undefined, 'Approved'),
    hostComponentKey: desktopTitleViewKey,
    hostComponentName: '[D] TitleView',
    resolveComponent: (key) => ({
      key,
      displayName:
        key === 'status-preset-variant-key'
          ? '🔒 [D] StatusPreset'
          : key === 'title-status-key'
            ? '[D] TitleStatus'
            : key === 'title-view-button-key'
              ? '[D] Button'
              : '[D] TitleView',
    }),
  });
  const titleStatusTypeViolation = titleStatusMismatch.diffs.find(
    (diff) =>
      diff.nodeName === '[D] TitleStatus' &&
      diff.assessment?.constraintId === 'matching-status-type',
  );
  assert.ok(titleStatusTypeViolation);
  assert.equal(titleStatusTypeViolation.assessment.verdict, 'violation');
  assert.equal(titleStatusTypeViolation.details.reference.value, 'Approved');
  assert.equal(titleStatusTypeViolation.details.actual.value, 'Action');
  assert.deepEqual(titleStatusTypeViolation.assessment.remediation.properties, {
    Type: 'Approved',
  });

  assert.throws(
    () => validateCompositionContractsConfig({schemaVersion: 2, contracts: []}),
    /Unsupported composition contracts schemaVersion/,
  );
  assert.throws(
    () => validateCompositionContractsConfig({
      schemaVersion: 1,
      contracts: [{...config.contracts[0], constraints: [
        {...config.contracts[0].constraints[0], op: 'unknown'},
      ]}],
    }),
    /op is unsupported/,
  );
  assert.throws(
    () => validateCompositionContractsConfig({
      schemaVersion: 1,
      contracts: [{
        ...backgroundPlateComposition.contract.contracts[0],
        subtreePropertyPolicies: [{
          ...backgroundPlateComposition.contract.contracts[0]
            .subtreePropertyPolicies[0],
          allowedPropertiesByValue: {Colored: ['radius']},
        }],
      }],
    }),
    /contains an uncontrolled property/,
  );
  delete globalThis.__APOLLO_TEST_REMOTE_COMPOSITION_CONTRACT_REGISTRY__;

  console.log('Composition contract regression checks passed');
}

main();
