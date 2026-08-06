const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule(entry) {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-assessment-${process.pid}-${Date.now()}-${path.basename(entry)}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, entry)],
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

function context() {
  return {
    actualComponentKey: null,
    referenceComponentKey: null,
    referenceOrigin: 'nested-component',
    actualNestedOwnerComponentKey: 'status',
    actualNestedOwnerPath: 'Host / Status',
    actualNestedOwnerRelativePath: 'Label',
    nestedOwnerComponentKey: 'status',
    nestedOwnerComponentRole: 'Part',
    nestedOwnerPath: 'Host / Status',
    nestedOwnerRelativePath: 'Label',
  };
}

function makeDiff() {
  return {
    nodePath: 'Host / Status / Label',
    nodeName: 'Label',
    message: 'заливка: status/info → text/primary',
    diffKind: 'paint',
    details: {
      property: 'fill',
      reference: { value: 'status/info' },
      actual: { value: 'text/primary' },
    },
    context: context(),
    suppressAsHostControlledNestedProperty: true,
  };
}

function main() {
  const {
    assessCustomizationDiffs,
    applyAssessmentPresentation,
    collapseVisualDiffsUnderVariantChanges,
    collapsePatternViolationDiffs,
    collapseConfiguredSemanticVariantDiffs,
    collapseSemanticVariantDiffs,
    createNestedContextEvidence,
    createPatternContextResolver,
    evaluatePatternRules,
    setPatternRulesConfig,
  } = loadModule(
    '../src/assessment/customizationAssessment.ts',
  );

  const sharedTokenKey = '8981b6bfc89935b939b249245e60158b88ca252e';
  const sharedTokenId = `VariableID:${sharedTokenKey}/3541:131`;
  const equivalentSelectedReference = assessCustomizationDiffs(
    [
      {
        ...makeDiff(),
        details: {
          property: 'fill',
          reference: {
            value: 'base-bg-alt/secondary',
            resourceType: 'token',
            resourceId: 'VariableID:previous-reference/1:1',
          },
          actual: {
            value: 'neutral-translucent/100',
            resourceType: 'token',
            resourceId: sharedTokenId,
            bindingId: sharedTokenId,
            binding: {
              id: sharedTokenId,
              key: sharedTokenKey,
              name: 'neutral-translucent/100',
              collectionId: 'VariableCollectionId:868:9636',
              collectionName: 'Interface Dynamic',
              resolvedModeId: null,
              resolvedModeName: null,
              explicitModeId: null,
              explicitModeName: null,
              modeSource: 'unknown',
              modeOwnerNodeId: null,
              modeOwnerName: null,
              modeOwnerPath: null,
            },
          },
          bindingStatus: 'different-binding',
        },
      },
    ],
    {
      hostDiffs: [],
      hostReference: [],
      nestedContextEvidence: {
        explains: () => true,
        selectedReference: () => ({
          value: 'neutral-translucent/100',
          resourceType: 'token',
          resourceId: sharedTokenId,
          bindingId: sharedTokenId,
          binding: {
            id: sharedTokenId,
            key: sharedTokenKey,
            name: 'neutral-translucent/100',
            collectionId: null,
            collectionName: 'Interface Dynamic',
            resolvedModeId: null,
            resolvedModeName: null,
            explicitModeId: null,
            explicitModeName: null,
            modeSource: 'unknown',
            modeOwnerNodeId: null,
            modeOwnerName: null,
            modeOwnerPath: null,
          },
        }),
        hasControllingVariantMismatch: () => false,
      },
    },
  );
  assert.equal(
    equivalentSelectedReference.length,
    0,
    'A selected nested reference with the same stable token key must remove the stale paint diff',
  );
  setPatternRulesConfig(
    JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, 'fixtures/pattern-rules-config.json'),
        'utf8',
      ),
    ),
  );
  globalThis.__APOLLO_TEST_REMOTE_COMPOSITION_CONTRACT_REGISTRY__ = [
    {
      componentKey: 'web-corp.background-plate',
      aliases: ['[D] BackgroundPlate'],
      contract: {
        schemaVersion: 1,
        contracts: [{
        id: 'background-plate.composition',
        match: {hostComponentNames: ['[D] BackgroundPlate']},
        select: {nestedComponentNames: ['[D] Style Level 1']},
        constraints: [
          {
            id: 'level-one-type',
            op: 'propertyDomain',
            property: 'Type',
            values: ['Primary', 'Secondary', 'Colored', 'Border'],
            message: 'Allowed Type',
          },
        ],
        subtreePropertyPolicies: [
          {
            id: 'surface-paint',
            variantProperty: 'Type',
            controlledProperties: ['fill', 'stroke'],
            allowedPropertiesByValue: {
              Primary: [],
              Secondary: [],
              Colored: ['fill'],
              Border: ['stroke'],
            },
            allowedMessage: 'Allowed surface paint',
            violationMessage: 'Forbidden surface paint',
          },
        ],
        }],
      },
    },
  ];
  const hostReference = [
    {
      id: 1,
      parentId: null,
      path: 'Host',
      type: 'COMPONENT',
      name: 'Host',
      visible: true,
      radius: 0,
    },
    {
      id: 2,
      parentId: 1,
      path: 'Host / Status / Label',
      type: 'TEXT',
      name: 'Label',
      visible: true,
      radius: 0,
    },
  ];

  const assessBackgroundPaint = (
    type,
    property,
    nestedExplains = false,
    initialAssessment = null,
  ) => {
    const label = property === 'fill' ? 'заливка' : 'обводка';
    const diff = {
      ...makeDiff(),
      nodeId: `background-${type}-${property}`,
      nodePath: '[D] BackgroundPlate / [D] Style Level 1 / Surface',
      nodeName: 'Surface',
      message: `${label}: neutral/100 → decorative/green`,
      details: {
        property,
        reference: {value: 'neutral/100'},
        actual: {value: 'decorative/green'},
      },
      ...(initialAssessment ? {assessment: initialAssessment} : {}),
    };
    return assessCustomizationDiffs([diff], {
      hostDiffs: [],
      hostReference: [],
      nestedContextEvidence: {
        explains: () => nestedExplains,
        selectedReference: () => null,
      },
      resolvePatternContext: () => ({
        hostComponentKey: null,
        hostComponentName: '[D] BackgroundPlate',
        nestedComponentKey: null,
        nestedComponentName: '[D] Style Level 1',
        occurrence: 1,
        nestedCount: 1,
        actualVariantProperties: {Type: type},
        expectedVariantProperties: {Type: 'Primary'},
        nestedNodeId: 'background-style',
      }),
    });
  };

  for (const [type, property] of [
    ['Colored', 'fill'],
    ['Border', 'stroke'],
  ]) {
    const allowedPaint = assessBackgroundPaint(type, property);
    assert.equal(allowedPaint[0].assessment.verdict, 'expected');
    assert.equal(allowedPaint[0].assessment.source, 'component-contract');
    assert.equal(allowedPaint[0].assessment.presentation, 'show-expected');
    assert.equal(
      applyAssessmentPresentation(allowedPaint).length,
      1,
      `${type} ${property} must stay visible with the Expected marker.`,
    );
  }

  for (const [type, property] of [
    ['Primary', 'fill'],
    ['Primary', 'stroke'],
    ['Secondary', 'fill'],
    ['Secondary', 'stroke'],
    ['Colored', 'stroke'],
    ['Border', 'fill'],
  ]) {
    const forbiddenPaint = assessBackgroundPaint(type, property);
    assert.equal(
      forbiddenPaint[0].assessment.verdict,
      'violation',
      `${type} ${property} must be a violation.`,
    );
  }

  const derivedSecondaryPaint = assessBackgroundPaint('Secondary', 'fill', true);
  assert.equal(derivedSecondaryPaint[0].assessment.verdict, 'expected');
  assert.equal(
    derivedSecondaryPaint[0].assessment.source,
    'catalog-host',
    'Paint explained by the selected variant must not be treated as a manual override.',
  );
  assert.equal(applyAssessmentPresentation(derivedSecondaryPaint).length, 0);

  const conflictingGeneratedRule = assessBackgroundPaint(
    'Colored',
    'fill',
    false,
    {
      verdict: 'violation',
      source: 'component-contract',
      reasonCode: 'component-contract-violation',
      ruleId: 'generated.background-plate.color-token-rule',
      message: 'Generic generated rule',
      remediation: null,
      presentation: 'show',
    },
  );
  assert.equal(conflictingGeneratedRule[0].assessment.verdict, 'expected');
  assert.equal(
    conflictingGeneratedRule[0].assessment.ruleId,
    'background-plate.composition.surface-paint',
    'A structured subtree policy must override a generic generated rule.',
  );

  const backgroundRoot = {
    id: 10,
    nodeId: 'background-root',
    parentId: null,
    path: 'Position=Level 1 (outer)',
    type: 'INSTANCE',
    name: '[D] BackgroundPlate',
    visible: true,
    radius: 0,
    componentInstance: {
      componentKey: 'background-variant',
      variantProperties: {Position: 'Level 1 (outer)'},
    },
  };
  const actualStyleLevel = {
    id: 11,
    nodeId: 'style-level-actual',
    parentId: 10,
    path: 'Position=Level 1 (outer) / [D] Style Level 1',
    type: 'INSTANCE',
    name: '[D] Style Level 1',
    visible: true,
    radius: 0,
    componentInstance: {
      componentKey: 'style-level-colored-variant',
      variantProperties: {Type: 'Colored'},
    },
  };
  const referenceStyleLevel = {
    ...actualStyleLevel,
    nodeId: null,
    componentInstance: {
      componentKey: 'style-level-family',
      variantProperties: {Type: 'Primary'},
    },
  };
  const realContextDiff = {
    ...makeDiff(),
    nodeId: 'style-level-actual',
    nodePath: actualStyleLevel.path,
    nodeName: '[D] Style Level 1',
    details: {
      property: 'fill',
      reference: {value: 'base-bg-alt/secondary'},
      actual: {value: 'status-muted/positive'},
    },
    context: {
      ...context(),
      actualNestedOwnerPath: backgroundRoot.path,
      nestedOwnerPath: referenceStyleLevel.path,
      actualNestedOwnerComponentKey: 'background-variant',
      nestedOwnerComponentKey: 'style-level-family',
    },
    assessment: {
      verdict: 'violation',
      source: 'component-contract',
      reasonCode: 'component-contract-violation',
      ruleId: 'generated.background-plate.color-token-rule',
      message: 'Generic generated rule',
      remediation: null,
    },
  };
  const realContextResolver = createPatternContextResolver({
    actualStructure: [backgroundRoot, actualStyleLevel],
    hostReference: [backgroundRoot, referenceStyleLevel],
    hostComponentKey: null,
    hostComponentName: '[D] BackgroundPlate',
    resolveComponent: (key) =>
      key === 'style-level-colored-variant'
        ? {key: 'style-level-family', displayName: '[D] Style Level 1'}
        : {key, displayName: '[D] BackgroundPlate'},
  });
  const resolvedRealContext = realContextResolver(realContextDiff);
  assert.equal(resolvedRealContext.nestedComponentName, '[D] Style Level 1');
  assert.equal(resolvedRealContext.actualVariantProperties.Type, 'Colored');
  const assessedRealContext = assessCustomizationDiffs([realContextDiff], {
    hostDiffs: [],
    hostReference: [backgroundRoot, referenceStyleLevel],
    nestedContextEvidence: {
      explains: () => false,
      selectedReference: () => null,
    },
    resolvePatternContext: realContextResolver,
  });
  assert.equal(assessedRealContext[0].assessment.verdict, 'expected');
  assert.equal(
    assessedRealContext[0].assessment.ruleId,
    'background-plate.composition.surface-paint',
  );

  const expected = assessCustomizationDiffs([makeDiff()], {
    hostDiffs: [],
    hostReference,
  });
  assert.equal(expected[0].assessment.verdict, 'expected');
  assert.equal(expected[0].assessment.source, 'catalog-host');
  assert.equal(
    applyAssessmentPresentation(expected).length,
    0,
    'Expected catalog-host diffs must be hidden from the customization list',
  );
  assert.equal(
    applyAssessmentPresentation([
      {
        ...makeDiff(),
        diffKind: 'other',
        details: {
          property: 'variant.View',
          reference: { value: 'Secondary' },
          actual: { value: 'Accent' },
        },
        assessment: {
          verdict: 'expected',
          source: 'catalog-host',
          reasonCode: 'matches-selected-nested-context',
          ruleId: null,
          message: 'Variant state change is primary evidence',
          remediation: null,
          presentation: 'show',
        },
      },
    ]).length,
    1,
    'Variant state diffs must stay visible even when derived values are expected',
  );
  const nestedExplainedVariant = assessCustomizationDiffs(
    [
      {
        ...makeDiff(),
        diffKind: 'other',
        details: {
          property: 'variant.View',
          reference: { value: 'Secondary' },
          actual: { value: 'Accent' },
        },
      },
    ],
    {
      hostDiffs: [],
      hostReference,
      nestedContextEvidence: {
        explains: () => true,
      },
    },
  );
  assert.equal(
    nestedExplainedVariant[0].assessment.verdict,
    'expected',
    'Nested variant state changes confirmed by the selected ancestor structure must be Expected',
  );

  const violation = assessCustomizationDiffs([makeDiff()], {
    hostDiffs: [makeDiff()],
    hostReference,
  });
  assert.equal(violation[0].assessment.verdict, 'violation');
  assert.equal(
    applyAssessmentPresentation(violation).length,
    1,
    'Violations must remain visible in the customization list',
  );

  const variantAndVisualDiffs = collapseVisualDiffsUnderVariantChanges(
    [
      {
        ...makeDiff(),
        nodeId: 'button',
        nodePath: 'Host / Button',
        nodeName: '[D] Button',
        diffKind: 'other',
        details: {
          property: 'variant.View',
          reference: { value: 'Secondary' },
          actual: { value: 'Accent' },
        },
      },
      {
        ...makeDiff(),
        nodeId: 'button-label',
        nodePath: 'Host / Button / Label',
        nodeName: 'Label',
        diffKind: 'paint',
        details: {
          property: 'fill',
          reference: { value: 'text/primary' },
          actual: { value: 'Button/Desktop/Colors/Accent/text' },
        },
      },
    ],
    [
      {
        id: 10,
        nodeId: 'host',
        parentId: null,
        path: 'Host',
        type: 'INSTANCE',
        name: 'Host',
        visible: true,
        radius: 0,
      },
      {
        id: 11,
        nodeId: 'button',
        parentId: 10,
        path: 'Host / Button',
        type: 'INSTANCE',
        name: '[D] Button',
        visible: true,
        radius: 0,
      },
      {
        id: 12,
        nodeId: 'button-label',
        parentId: 11,
        path: 'Host / Button / Label',
        type: 'TEXT',
        name: 'Label',
        visible: true,
        radius: 0,
      },
    ],
  );
  assert.deepEqual(
    variantAndVisualDiffs.map((diff) => diff.details.property),
    ['variant.View'],
    'Visual diffs inside an instance with a variant state change must collapse into the variant diff',
  );

  const variantWithManualVisualDiff = collapseVisualDiffsUnderVariantChanges(
    [
      {
        ...makeDiff(),
        nodeId: 'button',
        nodePath: 'Host / Button',
        nodeName: '[D] Button',
        diffKind: 'other',
        details: {
          property: 'variant.View',
          reference: { value: 'Secondary' },
          actual: { value: 'Accent' },
        },
        assessment: {
          verdict: 'unknown',
          source: 'standalone-reference',
          reasonCode: 'no-contextual-expectation',
          ruleId: null,
          message: 'Контекстное правило не найдено',
          remediation: null,
          presentation: 'show',
        },
      },
      {
        ...makeDiff(),
        nodeId: 'button-label',
        nodePath: 'Host / Button / Label',
        nodeName: 'Label',
        diffKind: 'paint',
        details: {
          property: 'fill',
          reference: { value: 'Button/Desktop/Colors/Accent/text' },
          actual: { value: 'text/warning' },
        },
        assessment: {
          verdict: 'unknown',
          source: 'standalone-reference',
          reasonCode: 'no-contextual-expectation',
          ruleId: null,
          message: 'Контекстное правило не найдено',
          remediation: null,
          presentation: 'show',
        },
      },
    ],
    [
      {
        id: 10,
        nodeId: 'host',
        parentId: null,
        path: 'Host',
        type: 'INSTANCE',
        name: 'Host',
        visible: true,
        radius: 0,
      },
      {
        id: 11,
        nodeId: 'button',
        parentId: 10,
        path: 'Host / Button',
        type: 'INSTANCE',
        name: '[D] Button',
        visible: true,
        radius: 0,
      },
      {
        id: 12,
        nodeId: 'button-label',
        parentId: 11,
        path: 'Host / Button / Label',
        type: 'TEXT',
        name: 'Label',
        visible: true,
        radius: 0,
      },
    ],
  );
  assert.deepEqual(
    variantWithManualVisualDiff.map((diff) => diff.details.property),
    ['variant.View', 'fill'],
    'Manual visual overrides inside a changed variant must remain visible',
  );

  const actualNested = [
    {
      id: 1,
      nodeId: '1:root',
      parentId: null,
      path: 'TagGroup',
      type: 'INSTANCE',
      name: 'TagGroup',
      visible: true,
      radius: 0,
      componentInstance: { componentKey: 'tag-group' },
    },
    {
      id: 2,
      nodeId: '1:tag',
      parentId: 1,
      path: 'TagGroup / Tag',
      type: 'INSTANCE',
      name: '[D] Tag',
      visible: true,
      radius: 999,
      layout: {
        padding: { top: 0, right: 12, bottom: 0, left: 12 },
      },
      componentInstance: {
        componentKey: 'tag-size-40',
        variantProperties: { Size: '40', Shape: 'Rounded' },
      },
    },
    {
      id: 3,
      nodeId: '1:tag-label',
      parentId: 2,
      path: 'TagGroup / Tag / Label',
      type: 'TEXT',
      name: 'Label',
      visible: true,
      radius: 0,
      styles: { text: { styleKey: 'S:small-style,actual-node' } },
    },
  ];
  const selectedTagReference = [
    {
      id: 10,
      parentId: null,
      path: 'Size=40, Shape=Rounded',
      type: 'COMPONENT',
      name: '[D] Tag',
      visible: true,
      radius: 999,
      layout: {
        padding: { top: 0, right: 12, bottom: 0, left: 12 },
      },
    },
    {
      id: 11,
      parentId: 10,
      path: 'Size=40, Shape=Rounded / Label',
      type: 'TEXT',
      name: 'Label',
      visible: true,
      radius: 0,
      styles: { text: { styleKey: 'S:small-style,reference-node' } },
      fill: { token: 'Button/Desktop/Colors/Accent/text' },
    },
  ];
  const nestedEvidence = createNestedContextEvidence(
    actualNested,
    (instance) =>
      instance.componentInstance?.componentKey === 'tag-size-40'
        ? selectedTagReference
        : null,
  );
  const nestedExpectedDiff = {
    ...makeDiff(),
    nodeId: '1:tag',
    nodePath: 'TagGroup / Tag',
    diffKind: 'layout',
    details: {
      property: 'layout.padding.right',
      reference: { value: 20 },
      actual: { value: 12 },
    },
  };
  assert.equal(
    nestedEvidence.explains(nestedExpectedDiff),
    true,
    'Selected nested variant must explain its own catalog values',
  );

  const statusPresetActual = [
    {
      id: 19,
      nodeId: '1:title-view',
      parentId: null,
      path: 'TitleView',
      type: 'INSTANCE',
      name: 'TitleView',
      visible: true,
      componentInstance: {
        componentKey: 'title-view',
        variantProperties: { View: 'xLarge' },
      },
    },
    {
      id: 20,
      nodeId: '1:status-preset',
      parentId: 19,
      path: 'TitleView / StatusPreset',
      type: 'INSTANCE',
      name: 'StatusPreset',
      visible: true,
      componentInstance: {
        componentKey: 'status-preset-action-20',
        variantProperties: {
          Type: 'Action',
          Style: 'Contrast',
          Size: '20',
        },
      },
    },
    {
      id: 21,
      nodeId: '1:status',
      parentId: 20,
      path: 'TitleView / StatusPreset / Status',
      type: 'INSTANCE',
      name: 'Status',
      visible: true,
      componentInstance: {
        componentKey: 'status-size-20',
        variantProperties: {
          LeftAddon: 'False',
          RightAddon: 'False',
          Shape: 'Rounded',
          Size: '20',
        },
      },
    },
  ];
  const selectedStatusPresetReference = [
    {
      id: 30,
      parentId: null,
      path: 'Type=Action, Style=Contrast, Size=20',
      type: 'COMPONENT',
      name: 'Type=Action, Style=Contrast, Size=20',
      visible: true,
    },
    {
      id: 31,
      parentId: 30,
      path: 'Type=Action, Style=Contrast, Size=20 / Status',
      type: 'INSTANCE',
      name: 'Status',
      visible: true,
      componentInstance: {
        variantProperties: {
          LeftAddon: 'False',
          RightAddon: 'False',
          Shape: 'Rounded',
          Size: '20',
        },
      },
    },
  ];
  const statusSizeDiff = {
    ...makeDiff(),
    nodeId: '1:status',
    nodePath: 'TitleView / StatusPreset / Status',
    diffKind: 'other',
    details: {
      property: 'variant.Size',
      reference: { value: '24' },
      actual: { value: '20' },
    },
  };
  const statusPresetEvidence = createNestedContextEvidence(
    statusPresetActual,
    (instance) =>
      instance.componentInstance?.componentKey === 'status-preset-action-20'
        ? selectedStatusPresetReference
        : null,
    [statusSizeDiff],
  );
  assert.equal(
    statusPresetEvidence.explains(statusSizeDiff),
    true,
    'Selected StatusPreset variant must explain the derived nested Status size',
  );
  const assessedDerivedStatusSize = assessCustomizationDiffs(
    [statusSizeDiff],
    {
      hostDiffs: [],
      hostReference: [],
      nestedContextEvidence: statusPresetEvidence,
    },
  )[0];
  assert.equal(
    assessedDerivedStatusSize.assessment.verdict,
    'expected',
    'A nested variant value selected by StatusPreset must be Expected',
  );

  const statusPresetSizeDiff = {
    ...statusSizeDiff,
    nodeId: '1:status-preset',
    nodePath: 'TitleView / StatusPreset',
    assessment: {
      verdict: 'violation',
      source: 'component-contract',
      reasonCode: 'contextual-variant-violation',
      ruleId: 'title-view.status-size-24',
      message: 'StatusPreset must use Size=24',
      remediation: null,
      presentation: 'show',
    },
  };
  const collapsedStatusDiffs = collapseVisualDiffsUnderVariantChanges(
    [statusPresetSizeDiff, assessedDerivedStatusSize],
    statusPresetActual,
  );
  assert.deepEqual(
    collapsedStatusDiffs,
    [statusPresetSizeDiff],
    'A derived Status size must collapse under the matching StatusPreset size change',
  );

  const manuallyChangedStatusActual = statusPresetActual.map((node) =>
    node.nodeId === '1:status'
      ? {
          ...node,
          componentInstance: {
            ...node.componentInstance,
            componentKey: 'status-size-32',
            variantProperties: {
              ...node.componentInstance.variantProperties,
              Size: '32',
            },
          },
        }
      : node,
  );
  const manualStatusSizeDiff = {
    ...statusSizeDiff,
    details: {
      property: 'variant.Size',
      reference: { value: '24' },
      actual: { value: '32' },
    },
  };
  const manualStatusEvidence = createNestedContextEvidence(
    manuallyChangedStatusActual,
    (instance) => {
      if (instance.componentInstance?.componentKey === 'status-preset-action-20') {
        return selectedStatusPresetReference;
      }
      if (instance.componentInstance?.componentKey === 'status-size-32') {
        return [
          {
            id: 40,
            parentId: null,
            path: 'Size=32',
            type: 'COMPONENT',
            name: 'Size=32',
            visible: true,
            componentInstance: {
              variantProperties: {Size: '32'},
            },
          },
        ];
      }
      return null;
    },
    [manualStatusSizeDiff],
  );
  const assessedManualStatusSize = assessCustomizationDiffs(
    [manualStatusSizeDiff],
    {
      hostDiffs: [],
      hostReference: [],
      nestedContextEvidence: manualStatusEvidence,
    },
  )[0];
  assert.equal(
    assessedManualStatusSize.assessment.verdict,
    'violation',
    'A nested Status variant that differs from the selected StatusPreset structure must be a violation',
  );
  assert.equal(
    assessedManualStatusSize.details.reference.value,
    '20',
    'The violation baseline must come from the selected StatusPreset structure',
  );

  const independentlySelectedChildActual = statusPresetActual.map((node) => {
    if (node.nodeId === '1:status-preset') {
      return {
        ...node,
        componentInstance: {
          componentKey: 'container-static',
          variantProperties: {Type: 'Static'},
        },
      };
    }
    if (node.nodeId === '1:status') {
      return {
        ...node,
        componentInstance: {
          componentKey: 'content-table',
          variantProperties: {Type: 'TableContent'},
        },
      };
    }
    return node;
  });
  const independentChildDiff = {
    ...statusSizeDiff,
    details: {
      property: 'variant.Type',
      reference: {value: 'Custom'},
      actual: {value: 'TableContent'},
    },
  };
  const independentlySelectedChildEvidence = createNestedContextEvidence(
    independentlySelectedChildActual,
    (instance) => {
      if (instance.componentInstance?.componentKey === 'container-static') {
        return [
          {
            id: 50,
            parentId: null,
            path: 'Type=Static',
            type: 'COMPONENT',
            name: 'Type=Static',
            visible: true,
            componentInstance: {variantProperties: {Type: 'Static'}},
          },
          {
            id: 51,
            parentId: 50,
            path: 'Type=Static / Status',
            type: 'INSTANCE',
            name: 'Status',
            visible: true,
            componentInstance: {variantProperties: {Type: 'Custom'}},
          },
        ];
      }
      if (instance.componentInstance?.componentKey === 'content-table') {
        return [
          {
            id: 60,
            parentId: null,
            path: 'Type=TableContent',
            type: 'COMPONENT',
            name: 'Type=TableContent',
            visible: true,
            componentInstance: {variantProperties: {Type: 'TableContent'}},
          },
        ];
      }
      return null;
    },
    [independentChildDiff],
  );
  assert.equal(
    independentlySelectedChildEvidence.hasControllingVariantMismatch(
      independentChildDiff,
    ),
    false,
    'A parent with a different semantic Type domain must not control the nested Type value',
  );
  assert.equal(
    assessCustomizationDiffs([independentChildDiff], {
      hostDiffs: [],
      hostReference: [],
      nestedContextEvidence: independentlySelectedChildEvidence,
    })[0].assessment.verdict,
    'expected',
    'A public variant selected on an independent nested component must remain Expected',
  );
  assert.equal(
    nestedEvidence.explains({
      ...makeDiff(),
      nodeId: '1:tag-label',
      nodePath: 'TagGroup / Tag / Label',
      diffKind: 'text-style',
      details: {
        property: 'styles.text',
        reference: { value: 'Paragraph/L' },
        actual: {
          value: 'Paragraph/S',
          resourceType: 'style',
          resourceId: 'S:small-style,actual-node',
        },
      },
    }),
    true,
    'Equivalent style keys with different node-id suffixes must be contextual matches',
  );
  assert.equal(
    nestedEvidence.explains({
      ...makeDiff(),
      nodeId: '1:tag-label',
      nodePath: 'TagGroup / Tag / Label',
      diffKind: 'paint',
      details: {
        property: 'fill',
        reference: { value: 'Button/Desktop/Colors/Primary/text' },
        actual: {
          value: 'Button/Desktop/Colors/Accent/text',
          resourceType: 'style',
          resourceId: 'theme-token-key',
          displayName: 'Button/Desktop/Colors/Accent/text',
        },
      },
    }),
    true,
    'Selected nested variant paint must match by resolved token label when resource ids differ',
  );
  const manualPaintAfterVariantSwitch = assessCustomizationDiffs(
    [
      {
        ...makeDiff(),
        nodeId: '1:tag-label',
        nodePath: 'TagGroup / Tag / Label',
        diffKind: 'paint',
        details: {
          property: 'fill',
          reference: { value: 'Button/Desktop/Colors/Primary/text' },
          actual: {
            value: 'text/tertiary',
            resourceType: 'token',
            resourceId: 'text/tertiary',
            displayName: 'text/tertiary',
          },
        },
      },
    ],
    {
      hostDiffs: [],
      hostReference,
      nestedContextEvidence: nestedEvidence,
    },
  );
  assert.equal(manualPaintAfterVariantSwitch[0].assessment.verdict, 'unknown');
  assert.equal(
    manualPaintAfterVariantSwitch[0].details.reference.value,
    'Button/Desktop/Colors/Accent/text',
    'Manual paint override after variant switch must use selected variant as reference',
  );
  assert.equal(
    manualPaintAfterVariantSwitch[0].message,
    'заливка: Button/Desktop/Colors/Accent/text → text/tertiary',
  );
  const variableTokenEvidence = createNestedContextEvidence(
    actualNested,
    (instance) =>
      instance.componentInstance?.componentKey === 'tag-size-40'
        ? [
            selectedTagReference[0],
            {
              ...selectedTagReference[1],
              fill: {
                token:
                  'VariableID:2d3423db5972143518c6f4be83e8bc842d3a9078/2011:155',
              },
            },
          ]
        : null,
    [],
    (componentKey) => componentKey,
    {
      resolveTokenLabel: (token) =>
        token.startsWith('VariableID:')
          ? 'Button/Desktop/Colors/Accent/text'
          : token,
      isPaintToken: () => true,
    },
  );
  const manualPaintWithVariableReference = assessCustomizationDiffs(
    [
      {
        ...makeDiff(),
        nodeId: '1:tag-label',
        nodePath: 'TagGroup / Tag / Label',
        diffKind: 'paint',
        details: {
          property: 'fill',
          reference: { value: 'Button/Desktop/Colors/Primary/text' },
          actual: {
            value: 'text/positive',
            resourceType: 'token',
            resourceId: 'text/positive',
            displayName: 'text/positive',
          },
        },
      },
    ],
    {
      hostDiffs: [],
      hostReference,
      nestedContextEvidence: variableTokenEvidence,
    },
  );
  assert.equal(
    manualPaintWithVariableReference[0].details.reference.value,
    'Button/Desktop/Colors/Accent/text',
    'VariableID selected references must render as resolved token labels',
  );
  assert.equal(
    manualPaintWithVariableReference[0].details.reference.resourceId,
    'VariableID:2d3423db5972143518c6f4be83e8bc842d3a9078/2011:155',
  );
  const styledTextEvidence = createNestedContextEvidence(
    actualNested,
    (instance) =>
      instance.componentInstance?.componentKey === 'tag-size-40'
        ? selectedTagReference
        : null,
    [],
    (componentKey) => componentKey,
    {
      resolveStyleLabel: (styleKey) =>
        styleKey.startsWith('S:small-style') ? 'Action/11-16 Secondary Small' : styleKey,
    },
  );
  const manualTextStyleWithResolvedReference = assessCustomizationDiffs(
    [
      {
        ...makeDiff(),
        nodeId: '1:tag-label',
        nodePath: 'TagGroup / Tag / Label',
        diffKind: 'text-style',
        details: {
          property: 'styles.text',
          reference: { value: 'Paragraph/L' },
          actual: {
            value: 'Action/11-16 Secondary Small',
            resourceType: 'style',
            resourceId: 'S:manual-style',
            displayName: 'Action/11-16 Secondary Small',
          },
        },
      },
    ],
    {
      hostDiffs: [],
      hostReference,
      nestedContextEvidence: styledTextEvidence,
    },
  );
  assert.equal(
    manualTextStyleWithResolvedReference[0].details.reference.value,
    'Action/11-16 Secondary Small',
    'Selected text style references must render as resolved style labels',
  );
  assert.equal(
    manualTextStyleWithResolvedReference[0].details.reference.resourceId,
    'S:small-style,reference-node',
  );

  const mismatchingEvidence = createNestedContextEvidence(
    actualNested,
    () => [
      {
        ...selectedTagReference[0],
        layout: {
          padding: { top: 0, right: 20, bottom: 0, left: 20 },
        },
      },
    ],
  );
  assert.equal(
    mismatchingEvidence.explains(nestedExpectedDiff),
    false,
    'Manual values that differ from the selected nested variant must not become Expected',
  );

  const renamedNestedActual = [
    {
      id: 20,
      nodeId: '2:host',
      parentId: null,
      path: 'Host',
      type: 'INSTANCE',
      name: 'Host',
      visible: true,
      radius: 0,
      componentInstance: { componentKey: 'host' },
    },
    {
      id: 21,
      nodeId: '2:button',
      parentId: 20,
      path: 'Host / PickerButton',
      type: 'INSTANCE',
      name: 'PickerButton',
      visible: true,
      radius: 0,
      componentInstance: { componentKey: 'icon-button-primary' },
    },
    {
      id: 22,
      nodeId: '2:icon',
      parentId: 21,
      path: 'Host / PickerButton / 🔩 Icon',
      type: 'INSTANCE',
      name: '🔩 Icon',
      visible: true,
      radius: 0,
      componentInstance: { componentKey: 'icon-16-variant' },
    },
    {
      id: 23,
      nodeId: '2:paint',
      parentId: 22,
      path: 'Host / PickerButton / 🔩 Icon / PaintMe',
      type: 'VECTOR',
      name: 'PaintMe',
      visible: true,
      radius: 0,
      fill: { token: 'text/primary' },
    },
  ];
  const renamedReference = [
    {
      id: 30,
      parentId: null,
      path: 'IconButton',
      type: 'COMPONENT',
      name: '[D] IconButton',
      visible: true,
      radius: 0,
    },
    {
      id: 31,
      parentId: 30,
      path: 'IconButton / Icon',
      type: 'INSTANCE',
      name: 'Icon',
      visible: true,
      radius: 0,
      componentInstance: { componentKey: 'icon-family' },
    },
    {
      id: 32,
      parentId: 31,
      path: 'IconButton / Icon / PaintMe',
      type: 'VECTOR',
      name: 'PaintMe',
      visible: true,
      radius: 0,
      fill: { token: 'text/primary' },
    },
  ];
  const renamedDiff = {
    ...makeDiff(),
    nodeId: '2:paint',
    nodePath: 'Host / PickerButton / 🔩 Icon / PaintMe',
    details: {
      property: 'fill',
      reference: { value: 'status/info' },
      actual: { value: 'text/primary' },
    },
  };
  const renamedEvidence = createNestedContextEvidence(
    renamedNestedActual,
    (instance) =>
      instance.nodeId === '2:button' ? renamedReference : null,
    [renamedDiff],
    (key) =>
      key === 'icon-16-variant' || key === 'icon-family'
        ? 'icon-family'
        : key,
  );
  assert.equal(
    renamedEvidence.explains(renamedDiff),
    true,
    'Renamed nested layers with the same component family must align contextually',
  );

  const firstAccent = evaluatePatternRules({
    hostComponentKey: 'buttons-group',
    hostComponentName: '[D] ButtonsGroup',
    nestedComponentKey: 'button',
    nestedComponentName: '[D] Button',
    occurrence: 1,
    nestedCount: 4,
    actualVariantProperties: { View: 'Accent' },
    expectedVariantProperties: { View: 'Primary' },
    nestedNodeId: '1:button',
  });
  assert.equal(firstAccent.verdict, 'violation');
  assert.equal(firstAccent.ruleId, 'buttons-group.first-button-primary');
  assert.deepEqual(firstAccent.remediation.properties, { View: 'Primary' });

  const lastSingleIcon = evaluatePatternRules({
    hostComponentKey: 'buttons-group',
    hostComponentName: '[D] ButtonsGroup',
    nestedComponentKey: 'button',
    nestedComponentName: '[D] Button',
    occurrence: 4,
    nestedCount: 4,
    actualVariantProperties: { View: 'Secondary', SingleIcon: 'True' },
    expectedVariantProperties: { View: 'Secondary', SingleIcon: 'False' },
    nestedNodeId: '1:last-button',
  });
  assert.equal(lastSingleIcon.verdict, 'allowed');
  assert.equal(lastSingleIcon.ruleId, 'buttons-group.fourth-button-single-icon');

  const thirdSingleIcon = evaluatePatternRules({
    hostComponentKey: 'buttons-group',
    hostComponentName: '[D] ButtonsGroup',
    nestedComponentKey: 'button',
    nestedComponentName: '[D] Button',
    occurrence: 3,
    nestedCount: 4,
    actualVariantProperties: { View: 'Secondary', SingleIcon: 'True' },
    expectedVariantProperties: { View: 'Secondary', SingleIcon: 'False' },
    nestedNodeId: '1:third-button',
  });
  assert.equal(thirdSingleIcon.verdict, 'violation');
  assert.equal(thirdSingleIcon.ruleId, 'buttons-group.single-icon-position');

  const tagVariantDecision = evaluatePatternRules({
    hostComponentKey: 'tag-group',
    hostComponentName: '[D] TagGroup',
    nestedComponentKey: 'tag',
    nestedComponentName: '[D] Tag',
    occurrence: 1,
    nestedCount: 4,
    actualVariantProperties: { Size: '40', Shape: 'Rounded' },
    expectedVariantProperties: { Size: '56', Shape: 'Rectangular' },
    nestedNodeId: '1:tag',
  });
  assert.equal(tagVariantDecision.verdict, 'allowed');
  assert.equal(tagVariantDecision.presentation, 'suppress-derived');
  assert.equal(
    applyAssessmentPresentation([
      {
        ...makeDiff(),
        assessment: {
          verdict: 'allowed',
          source: 'pattern-rule',
          reasonCode: 'pattern-allowed',
          ruleId: tagVariantDecision.ruleId,
          message: tagVariantDecision.message,
          presentation: tagVariantDecision.presentation,
          remediation: null,
        },
      },
    ]).length,
    0,
    'Derived TagGroup variant diffs must not be rendered as customizations',
  );

  const backgroundDecision = evaluatePatternRules({
    hostComponentKey: 'c49f08db71ab44ea64f0880730220de1d93ac263',
    hostComponentName: '[D][Promo] BackgroundPlate',
    nestedComponentKey: '2b46e94cdecdab7d4cb977055c0405b2f6204127',
    nestedComponentName: '[D][Promo] Style Level 1',
    occurrence: 1,
    nestedCount: 1,
    actualVariantProperties: { Type: 'Secondary' },
    expectedVariantProperties: { Type: 'Primary' },
    nestedNodeId: '3:style',
  });
  assert.equal(backgroundDecision.verdict, 'allowed');
  assert.equal(backgroundDecision.presentation, 'semantic-variant');
  const collapsedBackground = collapseSemanticVariantDiffs(
    [
      {
        ...makeDiff(),
        nodeId: '3:style',
        nodeName: '[D][Promo] Style Level 1',
        assessment: {
          verdict: 'allowed',
          source: 'pattern-rule',
          reasonCode: 'pattern-allowed',
          ruleId: backgroundDecision.ruleId,
          message: backgroundDecision.message,
          presentation: backgroundDecision.presentation,
          semanticVariantChanges: backgroundDecision.variantChanges,
          remediation: null,
        },
      },
    ],
    [
      {
        id: 40,
        nodeId: '3:style',
        parentId: null,
        path: 'BackgroundPlate / Style Level 1',
        type: 'INSTANCE',
        name: '[D][Promo] Style Level 1',
        visible: true,
        radius: 0,
        componentInstance: {
          componentKey: 'style-secondary',
          variantProperties: { Type: 'Secondary' },
        },
      },
    ],
  );
  assert.equal(collapsedBackground.length, 1);
  assert.equal(collapsedBackground[0].message, 'type: primary → secondary');
  assert.equal(collapsedBackground[0].assessment.verdict, 'allowed');
  assert.equal(collapsedBackground[0].assessment.presentation, 'show');

  const directBackground = collapseConfiguredSemanticVariantDiffs(
    [
      {
        ...makeDiff(),
        nodeId: '4:style',
        nodePath: 'BackgroundPlate / Style Level 1',
        assessment: {
          verdict: 'expected',
          source: 'catalog-host',
          reasonCode: 'matches-selected-nested-context',
          ruleId: null,
          message: 'Contextual fill',
          remediation: null,
          presentation: 'show',
        },
      },
    ],
    {
      actualStructure: [
        {
          id: 50,
          nodeId: '4:style',
          parentId: null,
          path: 'BackgroundPlate / Style Level 1',
          type: 'INSTANCE',
          name: '[D][Promo] Style Level 1',
          visible: true,
          radius: 0,
          componentInstance: {
            componentKey: 'style-secondary-variant',
            variantProperties: { Type: 'Secondary' },
          },
        },
      ],
      hostReference: [
        {
          id: 60,
          parentId: null,
          path: 'BackgroundPlate / Style Level 1',
          type: 'INSTANCE',
          name: '[D][Promo] Style Level 1',
          visible: true,
          radius: 0,
          componentInstance: {
            componentKey: '2b46e94cdecdab7d4cb977055c0405b2f6204127',
            variantProperties: { Type: 'Primary' },
          },
        },
      ],
      hostComponentKey: 'c49f08db71ab44ea64f0880730220de1d93ac263',
      resolveFamilyKey: (key) =>
        key === 'style-secondary-variant'
          ? '2b46e94cdecdab7d4cb977055c0405b2f6204127'
          : key,
    },
  );
  assert.equal(directBackground.length, 1);
  assert.equal(directBackground[0].message, 'type: primary → secondary');
  assert.equal(directBackground[0].assessment.ruleId, 'background-plate.level-one-type');

  const collapsed = collapsePatternViolationDiffs(
    [
      {
        ...makeDiff(),
        nodeId: '1:button',
        assessment: {
          verdict: 'expected',
          source: 'catalog-host',
          reasonCode: 'matches-selected-nested-context',
          ruleId: null,
          message: 'Expected button paint',
          remediation: null,
        },
      },
      {
        ...makeDiff(),
        nodeId: '1:label',
        assessment: {
          verdict: 'violation',
          source: 'pattern-rule',
          reasonCode: 'pattern-violation',
          ruleId: 'buttons-group.first-button-primary',
          message: 'Первая кнопка должна иметь View=Primary',
          remediation: {
            kind: 'set-variant-properties',
            nodeId: '1:button',
            properties: { View: 'Primary' },
          },
        },
      },
    ],
    [
      {
        id: 1,
        nodeId: '1:button',
        parentId: null,
        path: 'ButtonsGroup / Button',
        type: 'INSTANCE',
        name: '[D] Button',
        visible: true,
        radius: 0,
        componentInstance: {
          componentKey: 'button-accent',
          variantProperties: { View: 'Accent' },
        },
      },
      {
        id: 2,
        nodeId: '1:label',
        parentId: 1,
        path: 'ButtonsGroup / Button / Label',
        type: 'TEXT',
        name: 'Label',
        visible: true,
        radius: 0,
      },
    ],
  );
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].nodeName, '[D] Button');
  assert.equal(collapsed[0].message, 'view: primary → accent');
  assert.equal(collapsed[0].details.property, 'variant.View');

  delete globalThis.__APOLLO_TEST_REMOTE_COMPOSITION_CONTRACT_REGISTRY__;
  console.log('Customization assessment regression checks passed');
}

main();
