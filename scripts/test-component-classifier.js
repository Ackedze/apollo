const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-component-classifier-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/services/componentClassifier.ts')],
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

function dependencies(overrides = {}) {
  return {
    getComponentKeyCached: async () => null,
    buildNodeSegments: (node) => [
      { id: node.id, label: node.name, nodeType: node.type, visible: true },
    ],
    getReferenceStructureCached: () => null,
    isInsideLocalComponentContext: async () => false,
    resolveTokenLabel: (token) => token,
    isPaintToken: () => true,
    resolveVariableMetadata: () => null,
    resolveVariableCollectionMetadata: () => null,
    normalizeRelevanceStatus: () => 'unknown',
    reportMissingReference: () => {},
    debugDiffPipeline: () => {},
    throwIfCancelled: () => {},
    ...overrides,
  };
}

async function main() {
  const {
    collectExperimentalContractV2StructureKeys,
    classifyComponentNode,
    createExperimentalContractV2NestedBaselineEvidence,
    createExperimentalContractV2NestedBaselineDiffs,
    filterUndocumentedNestedVisualDiffs,
    filterDirectNestedHostVariantDiffs,
    isNativeLocalComponent,
    markNestedContractBaselineDiff,
    preloadExperimentalContractV2Structure,
    resolveHostReferenceForContractDiff,
    shouldMaterializeComponentDiff,
    shouldRunComponentDiff,
  } = loadModule();
  const iconHost = {
    id: 1,
    parentId: null,
    nodeId: 'message',
    path: '[D] CorporateSystemMessage',
    type: 'INSTANCE',
    name: '[D] CorporateSystemMessage',
    visible: true,
    componentInstance: {
      componentKey: 'message-key',
      directOverrides: [
        { nodeId: 'paint-me', fields: ['fills'] },
      ],
    },
  };
  const nestedDiff = (nodeId, nodeName, property) => ({
    message: `${property} changed`,
    nodeId,
    nodeName,
    nodePath: `${iconHost.path} / IconView / ${nodeName}`,
    visible: true,
    context: {
      actualComponentKey: 'icon-view-key',
      referenceComponentKey: 'icon-view-key',
      referenceOrigin: 'nested-component',
      actualNestedOwnerComponentKey: 'icon-view-key',
      actualNestedOwnerPath: `${iconHost.path} / IconView`,
      actualNestedOwnerRelativePath: nodeName,
      nestedOwnerComponentKey: 'icon-view-key',
      nestedOwnerComponentRole: 'Main',
      nestedOwnerPath: `${iconHost.path} / IconView`,
      nestedOwnerRelativePath: nodeName,
    },
    diffKind: 'shape',
    details: {
      property,
      reference: { value: property === 'radius' ? 0 : 'baseline' },
      actual: { value: property === 'radius' ? 6 : 'custom' },
    },
  });
  assert.deepEqual(
    filterUndocumentedNestedVisualDiffs(iconHost, [
      nestedDiff('shape', 'Shape', 'radius'),
      nestedDiff('paint-me', 'PaintMe', 'fill'),
    ]).map((diff) => diff.nodeName),
    ['PaintMe'],
    'Nested visual noise without native override evidence must be suppressed while direct paint overrides remain visible.',
  );
  const materializedStructure = [
    {
      id: 1,
      parentId: null,
      nodeId: 'body-cell',
      path: '[D] BodyCell :: Wide',
      type: 'INSTANCE',
      name: '[D] BodyCell :: Wide',
      visible: true,
      componentInstance: { componentKey: 'table-wide-key' },
    },
    {
      id: 2,
      parentId: 1,
      nodeId: 'amount',
      path: '[D] BodyCell :: Wide / Amount',
      type: 'INSTANCE',
      name: 'Amount',
      visible: true,
      componentInstance: { componentKey: 'amount-key' },
    },
    {
      id: 3,
      parentId: 2,
      nodeId: 'amount-major',
      path: '[D] BodyCell :: Wide / Amount / Major',
      type: 'INSTANCE',
      name: 'Major',
      visible: true,
      componentInstance: { componentKey: 'amount-key' },
    },
  ];
  assert.deepEqual(
    Array.from(collectExperimentalContractV2StructureKeys(materializedStructure)),
    ['table-wide-key', 'amount-key'],
    'Materialized subtree preload must include nested component contracts once and in traversal order.',
  );
  let preloadedKeys = [];
  await preloadExperimentalContractV2Structure(
    materializedStructure,
    async (keys) => {
      preloadedKeys = Array.from(keys);
    },
  );
  assert.deepEqual(
    preloadedKeys,
    ['table-wide-key', 'amount-key'],
    'Nested Contract v2 packages must load before tree evaluation on a cold cache.',
  );
  const sparseReference = [
    {
      id: 10,
      parentId: null,
      path: '[D] BodyCell :: Wide',
      type: 'INSTANCE',
      name: '[D] BodyCell :: Wide',
      visible: true,
    },
  ];
  const materializedReference = sparseReference.concat([
    {
      id: 11,
      parentId: 10,
      path: '[D] BodyCell :: Wide / Text / Amount',
      type: 'FRAME',
      name: 'Amount',
      visible: true,
      layout: { itemSpacing: 0 },
      referenceOrigin: 'nested-component',
    },
    {
      id: 12,
      parentId: 11,
      path: '[D] BodyCell :: Wide / Text / Amount / Minor',
      type: 'TEXT',
      name: 'Minor',
      visible: true,
      styles: { text: { styleKey: 'paragraph-14-20' } },
      referenceOrigin: 'nested-component',
    },
  ]);
  assert.equal(
    resolveHostReferenceForContractDiff(
      sparseReference,
      materializedReference,
      materializedStructure,
    ).length,
    materializedReference.length,
    'Contract host evidence must use the expanded nested reference instead of the sparse host catalog.',
  );
  const packageByKey = {
    'table-wide-key': 'web-corp.table-wide',
    'amount-key': 'web-core.amount',
  };
  const referenceAmount = [
    {
      id: 10,
      parentId: null,
      nodeId: 'reference-amount',
      path: 'Amount',
      type: 'INSTANCE',
      name: 'Amount',
      visible: true,
      componentInstance: { componentKey: 'amount-key' },
    },
    {
      id: 11,
      parentId: 10,
      nodeId: 'reference-major',
      path: 'Amount / Major',
      type: 'TEXT',
      name: 'Major',
      visible: true,
    },
  ];
  let nestedCompareCalls = 0;
  const nestedBaselines = createExperimentalContractV2NestedBaselineDiffs(
    materializedStructure,
    {
      resolveContract: (key) => packageByKey[key]
        ? { package: { id: packageByKey[key] } }
        : null,
      resolveReference: (instance) =>
        instance.componentInstance?.componentKey === 'amount-key'
          ? referenceAmount
          : null,
      expandReference: (reference) => reference,
      compare: (actual, reference) => {
        nestedCompareCalls += 1;
        assert.equal(actual[0].path, reference[0].path);
        return [
          { nodePath: actual[0].path, nodeId: actual[0].nodeId, message: 'gap' },
          { nodePath: actual[1].path, nodeId: actual[1].nodeId, message: 'text' },
          { nodePath: actual[1].path, nodeId: actual[1].nodeId, message: 'opacity' },
        ];
      },
    },
  );
  assert.equal(
    nestedCompareCalls,
    1,
    'A nested package must be compared once; internal nodes from the same package are not independent scopes.',
  );
  assert.deepEqual(
    nestedBaselines.get(2)?.map((diff) => diff.message),
    ['gap', 'text', 'opacity'],
    'A parent audit must preserve every direct nested-component baseline difference in its own scope.',
  );

  const nestedEvidence = createExperimentalContractV2NestedBaselineEvidence(
    materializedStructure,
    {
      resolveContract: (key) => packageByKey[key]
        ? { package: { id: packageByKey[key] } }
        : null,
      resolveReference: (instance) =>
        instance.componentInstance?.componentKey === 'amount-key'
          ? referenceAmount
          : null,
      expandReference: (reference) => reference.map((entry) =>
        Object.assign({}, entry, { baselineKind: 'effective' }),
      ),
      compare: (_actual, reference) => [{
        nodePath: reference[0].path,
        nodeId: reference[0].nodeId,
        message: reference[0].baselineKind ?? 'host-variant',
      }],
    },
  );
  assert.deepEqual(
    nestedEvidence.hostVariantDiffs.get(2)?.map((diff) => diff.message),
    ['host-variant'],
    'Nested scopes must retain the selected component variant before nested references are expanded.',
  );
  assert.deepEqual(
    nestedEvidence.effectiveDiffs.get(2)?.map((diff) => diff.message),
    ['effective'],
    'Nested scopes must also retain the expanded effective component baseline.',
  );

  const nestedDirectPaintStructure = materializedStructure.map((entry) =>
    entry.id === 2
      ? Object.assign({}, entry, {
          componentInstance: Object.assign({}, entry.componentInstance, {
            directOverrides: [{ nodeId: 'amount-major', fields: ['fills'] }],
          }),
        })
      : entry,
  );
  const nestedDirectPaintEvidence = createExperimentalContractV2NestedBaselineEvidence(
    nestedDirectPaintStructure,
    {
      resolveContract: (key) => packageByKey[key]
        ? { package: { id: packageByKey[key] } }
        : null,
      resolveReference: (instance) =>
        instance.componentInstance?.componentKey === 'amount-key'
          ? referenceAmount
          : null,
      expandReference: (reference) => reference,
      compareHostVariant: () => [{
        nodePath: 'Amount / Major',
        nodeId: 'amount-major',
        message: 'selected-variant-label-fill',
        context: { referenceOrigin: 'nested-component' },
        diffKind: 'paint',
        details: {
          property: 'fill',
          reference: { value: 'decorative-text/green' },
          actual: { value: 'text/secondary' },
        },
      }],
      compare: () => [{
        nodePath: 'Amount / Major',
        nodeId: 'amount-major',
        message: 'expanded-standalone-label-fill',
        context: { referenceOrigin: 'nested-component' },
        diffKind: 'paint',
        details: {
          property: 'fill',
          reference: { value: 'text/info' },
          actual: { value: 'text/secondary' },
        },
      }],
    },
  );
  assert.deepEqual(
    nestedDirectPaintEvidence.effectiveDiffs.get(2)?.map((diff) => diff.message),
    ['selected-variant-label-fill'],
    'A direct deep override must keep the exact selected-variant baseline instead of the expanded standalone baseline for the same node/property.',
  );
  const inheritedDeepOverrideStructure = nestedDirectPaintStructure.map((entry) =>
    entry.id === 1
      ? Object.assign({}, entry, {
          componentInstance: Object.assign({}, entry.componentInstance, {
            directOverrides: [{ nodeId: 'amount-major', fields: ['fills'] }],
          }),
        })
      : entry.id === 2
        ? Object.assign({}, entry, {
            componentInstance: Object.assign({}, entry.componentInstance, {
              directOverrides: undefined,
            }),
          })
        : entry,
  );
  const inheritedDeepOverrideEvidence =
    createExperimentalContractV2NestedBaselineEvidence(
      inheritedDeepOverrideStructure,
      {
        resolveContract: (key) => packageByKey[key]
          ? { package: { id: packageByKey[key] } }
          : null,
        resolveReference: (instance) =>
          instance.componentInstance?.componentKey === 'amount-key'
            ? referenceAmount
            : null,
        expandReference: (reference) => reference,
        compareHostVariant: () => [{
          nodePath: 'Amount / Major',
          nodeId: 'amount-major',
          message: 'inherited-selected-variant-label-fill',
          context: { referenceOrigin: 'nested-component' },
          diffKind: 'paint',
          details: {
            property: 'fill',
            reference: { value: 'static_text_inverted/primary' },
            actual: { value: 'text/secondary' },
          },
        }],
        compare: () => [{
          nodePath: 'Amount / Major',
          nodeId: 'amount-major',
          message: 'expanded-label-fill',
          context: { referenceOrigin: 'nested-component' },
          diffKind: 'paint',
          details: {
            property: 'fill',
            reference: { value: 'text/info' },
            actual: { value: 'text/secondary' },
          },
        }],
      },
    );
  assert.deepEqual(
    inheritedDeepOverrideEvidence.effectiveDiffs.get(2)?.map((diff) => diff.message),
    ['inherited-selected-variant-label-fill'],
    'A nested contract scope must inherit matching deep override records from its outer component instance.',
  );
  assert.equal(
    inheritedDeepOverrideEvidence.hostVariantDiffs.get(2)?.[0]
      .context.directHostVariantOverride,
    true,
    'Inherited override evidence must remain marked when the tree evaluator filters the nested scope again.',
  );
  assert.deepEqual(
    Array.from(nestedEvidence.completedScopeNodeIds),
    [2],
    'A nested scope becomes complete only after its own reference is resolved and compared.',
  );

  const nestedComponentSwapEvidence = createExperimentalContractV2NestedBaselineEvidence(
    materializedStructure,
    {
      resolveContract: (key) => packageByKey[key]
        ? { package: { id: packageByKey[key] } }
        : null,
      resolveReference: (instance) =>
        instance.componentInstance?.componentKey === 'amount-key'
          ? referenceAmount
          : null,
      expandReference: (reference) => reference,
      compare: () => [],
      compareComponentStates: (_actual, _reference, existingDiffs) => [{
        nodePath: 'BodyCell / Amount / icon',
        nodeId: 'amount-icon',
        message: `identity:${existingDiffs.length}`,
        context: { referenceOrigin: 'nested-component' },
        details: {
          property: 'component.identity',
          reference: { value: 'close' },
          actual: { value: 'power-button-circle' },
        },
      }],
    },
  );
  assert.deepEqual(
    nestedComponentSwapEvidence.effectiveDiffs.get(2)?.map((diff) => diff.message),
    ['identity:0'],
    'Nested scope evidence must include a descendant component swap alongside visual diffs.',
  );
  assert.deepEqual(
    nestedComponentSwapEvidence.hostVariantDiffs.get(2)?.map((diff) => diff.message),
    ['identity:0'],
    'Direct host evidence must retain descendant component identity changes.',
  );

  const exposedSwapScope = Object.assign({}, materializedStructure[1], {
    componentInstance: {
      componentKey: 'amount-key',
      directOverrides: [{
        nodeId: 'state-instance',
        fields: ['componentProperties'],
      }],
    },
  });
  const exposedSwapDiffs = filterDirectNestedHostVariantDiffs(
    exposedSwapScope,
    [{
      nodePath: 'Amount / State / power-button-compact',
      nodeId: 'state-instance;swapped-icon',
      message: 'Компонент: power-button-circle → power-button-compact',
      context: { referenceOrigin: 'nested-component' },
      details: {
        property: 'component.identity',
        reference: { value: 'power-button-circle' },
        actual: { value: 'power-button-compact' },
      },
    }, {
      nodePath: 'Amount / State / power-button-compact / icon',
      nodeId: 'state-instance;swapped-icon;icon',
      message: 'заливка: neutral/700 → neutral/0',
      context: { referenceOrigin: 'nested-component' },
      details: {
        property: 'fill',
        reference: { value: 'neutral/700' },
        actual: { value: 'neutral/0' },
      },
    }],
  );
  assert.deepEqual(
    exposedSwapDiffs.map((diff) => diff.details.property),
    ['component.identity'],
    'An exposed instance-swap override must follow the owning ancestor to the replaced child identity only.',
  );

  const nestedLabelActual = [
    {
      id: 40,
      parentId: null,
      nodeId: 'body-cell-status',
      path: 'BodyCell',
      type: 'INSTANCE',
      name: 'BodyCell',
      visible: true,
      componentInstance: { componentKey: 'body-cell-key' },
    },
    {
      id: 41,
      parentId: 40,
      nodeId: 'status-preset',
      path: 'BodyCell / StatusPreset',
      type: 'INSTANCE',
      name: 'StatusPreset',
      visible: true,
      componentInstance: { componentKey: 'status-preset-key' },
    },
    {
      id: 42,
      parentId: 41,
      nodeId: 'status',
      path: 'BodyCell / StatusPreset / Status',
      type: 'INSTANCE',
      name: 'Status',
      visible: true,
      componentInstance: { componentKey: 'status-key' },
    },
    {
      id: 43,
      parentId: 42,
      nodeId: 'label-instance',
      path: 'BodyCell / StatusPreset / Status / Label',
      type: 'INSTANCE',
      name: 'Label',
      visible: true,
      componentInstance: { componentKey: 'label-key' },
    },
    {
      id: 44,
      parentId: 43,
      nodeId: 'label-text',
      path: 'BodyCell / StatusPreset / Status / Label / Label',
      type: 'TEXT',
      name: 'Label',
      visible: true,
      fill: { token: 'decorative-text/blue' },
    },
  ];
  const nestedLabelReference = [
    {
      id: 50,
      parentId: null,
      path: 'StatusPreset',
      type: 'COMPONENT',
      name: 'Type=Error / Risk, Style=Muted, Size=20',
      visible: true,
    },
    {
      id: 51,
      parentId: 50,
      path: 'StatusPreset / Status',
      type: 'INSTANCE',
      name: 'Status',
      visible: true,
      componentInstance: { componentKey: 'status-key' },
    },
    {
      id: 52,
      parentId: 51,
      path: 'StatusPreset / Status / 🔩 Label',
      type: 'INSTANCE',
      name: '🔩 Label',
      visible: true,
      componentInstance: { componentKey: 'label-key' },
    },
    {
      id: 53,
      parentId: 52,
      path: 'StatusPreset / Status / 🔩 Label / Label',
      type: 'TEXT',
      name: 'Label',
      visible: true,
      fill: { token: 'decorative-text/red' },
    },
  ];
  let comparedNestedLabelPath = null;
  createExperimentalContractV2NestedBaselineEvidence(nestedLabelActual, {
    resolveContract: (key) =>
      key === 'status-preset-key'
        ? { package: { id: 'web-core.status-preset' } }
        : null,
    resolveReference: (instance) =>
      instance.componentInstance?.componentKey === 'status-preset-key'
        ? nestedLabelReference
        : null,
    expandReference: (reference) => reference,
    compare: () => [],
    compareHostVariant: (actual, reference) => {
      const actualLabel = actual.find((node) => node.nodeId === 'label-text');
      const referenceLabel = reference.find((node) => node.id === 53);
      assert.ok(actualLabel);
      assert.ok(referenceLabel);
      comparedNestedLabelPath = referenceLabel.path;
      assert.equal(
        referenceLabel.path,
        actualLabel.path,
        'A nested Label instance name must not prevent its TEXT descendant from reaching the host-variant comparison.',
      );
      assert.equal(
        referenceLabel.referenceOwnerRelativePath,
        'Status / Label / Label',
        'Aligned nested descendants must keep an owner-relative path usable by Contract v2.',
      );
      return [];
    },
  });
  assert.equal(
    comparedNestedLabelPath,
    'StatusPreset / Status / Label / Label',
    'Nested contract evidence must align intermediate instance display names before comparing paint.',
  );

  const paymentStructure = [
    {
      id: 20,
      parentId: null,
      nodeId: 'body-cell-account',
      path: 'Presets=Account',
      type: 'INSTANCE',
      name: '[D] BodyCell :: Wide',
      visible: true,
      componentInstance: { componentKey: 'table-wide-key' },
    },
    {
      id: 21,
      parentId: 20,
      nodeId: 'payment',
      path: 'Presets=Account / PaymentMaskedNumber',
      type: 'INSTANCE',
      name: 'PaymentMaskedNumber',
      visible: true,
      layout: { padding: { top: 2, right: 0, bottom: 2, left: 2 } },
      componentInstance: { componentKey: 'payment-key' },
    },
    {
      id: 22,
      parentId: 21,
      nodeId: 'payment-major',
      path: 'Presets=Account / PaymentMaskedNumber / Major',
      type: 'TEXT',
      name: 'Major',
      visible: true,
      styles: { text: { styleKey: 'custom-major-style' } },
    },
  ];
  const standalonePaymentReference = [
    {
      ...paymentStructure[1],
      id: 30,
      parentId: null,
      path: 'PaymentMaskedNumber',
      layout: { padding: { top: 0, right: 0, bottom: 0, left: 0 } },
    },
    {
      ...paymentStructure[2],
      id: 31,
      parentId: 30,
      path: 'PaymentMaskedNumber / Major',
      styles: { text: { styleKey: 'expected-major-style' } },
    },
  ];
  const paymentBaselines = createExperimentalContractV2NestedBaselineDiffs(
    paymentStructure,
    {
      resolveContract: (key) => packageByKey[key]
        ? { package: { id: packageByKey[key] } }
        : key === 'payment-key'
          ? { package: { id: 'web-corp.payment-masked-number' } }
          : null,
      resolveReference: (instance) =>
        instance.componentInstance?.componentKey === 'payment-key'
          ? standalonePaymentReference
          : null,
      expandReference: (reference) => reference,
      compare: (actual, reference) => {
        assert.equal(reference[0].referenceOrigin, 'nested-component');
        assert.equal(reference[0].referenceOwnerComponentKey, 'payment-key');
        assert.equal(reference[0].referenceOwnerRelativePath, '');
        assert.equal(reference[1].referenceOwnerRelativePath, 'Major');
        assert.equal(
          reference[0].layout.padding.top,
          0,
          'Nested contract evidence must retain the standalone component baseline.',
        );
        assert.equal(reference[1].styles.text.styleKey, 'expected-major-style');
        assert.equal(actual[1].styles.text.styleKey, 'custom-major-style');
        return [{
          nodePath: actual[1].path,
          nodeId: actual[1].nodeId,
          message: 'payment-major-typography',
        }];
      },
    },
  );
  assert.deepEqual(
    paymentBaselines.get(21)?.map((diff) => diff.message),
    ['payment-major-typography'],
    'A materialized host scope must suppress allowed host padding while preserving nested typography violations.',
  );
  const paymentTypographyEvidence = {
    message: 'Стиль текст: Paragraph/14–20 → Headline/22–26',
    nodePath: 'PaymentMaskedNumber / Major / ✎ Major',
    nodeName: '✎ Major',
    nodeId: 'payment-major-text',
    visible: true,
    diffKind: 'text-style',
    context: {
      actualComponentKey: null,
      referenceComponentKey: null,
      referenceOrigin: 'nested-component',
      actualNestedOwnerComponentKey: 'major-variant-key',
      actualNestedOwnerPath: 'PaymentMaskedNumber / Major',
      actualNestedOwnerRelativePath: '✎ Major',
      nestedOwnerComponentKey: 'major-variant-key',
      nestedOwnerComponentRole: null,
      nestedOwnerPath: 'PaymentMaskedNumber / Major',
      nestedOwnerRelativePath: '✎ Major',
      actualVariantProperties: { 'Mask Number': 'False' },
      referenceVariantProperties: { 'Mask Number': 'False' },
    },
    details: {
      property: 'styles.text',
      reference: { value: 'Paragraph/14–20' },
      actual: { value: 'Headline/22–26' },
    },
  };
  assert.equal(
    markNestedContractBaselineDiff(paymentTypographyEvidence),
    paymentTypographyEvidence,
    'Contract v2 must preserve nested text-style evidence until it can compare it with the full host baseline.',
  );
  const statusScopeWithDirectFillOverride = {
    id: 30,
    parentId: 1,
    nodeId: 'status-preset',
    path: 'BodyCell / Text / StatusPreset',
    type: 'INSTANCE',
    name: 'StatusPreset',
    visible: true,
    componentInstance: {
      componentKey: 'status-preset-key',
      directOverrides: [{ nodeId: 'status-label', fields: ['fills'] }],
    },
  };
  const statusLabelFillEvidence = {
    message: 'заливка: decorative-text/red → decorative-text/blue',
    nodePath: `${statusScopeWithDirectFillOverride.path} / Status / Label / Label`,
    nodeName: 'Label',
    nodeId: 'status-label',
    visible: true,
    diffKind: 'paint',
    context: { referenceOrigin: 'nested-component' },
    details: {
      property: 'fill',
      reference: { value: 'decorative-text/red' },
      actual: { value: 'decorative-text/blue' },
    },
  };
  const directStatusLabelDiffs = filterDirectNestedHostVariantDiffs(
    statusScopeWithDirectFillOverride,
    [statusLabelFillEvidence, paymentTypographyEvidence],
  );
  assert.equal(
    directStatusLabelDiffs.length,
    1,
    'A nested host-variant baseline must keep only diffs backed by direct overrides of that instance.',
  );
  assert.equal(
    directStatusLabelDiffs[0].context.directHostVariantOverride,
    true,
    'Direct override evidence must be explicit so Contract v2 can safely cross a nested instance boundary.',
  );
  const iconScopeWithDirectSwap = Object.assign({}, statusScopeWithDirectFillOverride, {
    componentInstance: {
      componentKey: 'status-preset-key',
      directOverrides: [{ nodeId: 'status-icon', fields: ['mainComponent'] }],
    },
  });
  const iconSwapEvidence = Object.assign({}, statusLabelFillEvidence, {
    nodeId: 'status-icon',
    nodeName: 'icon',
    message: 'Компонент: close → power-button-circle',
    details: {
      property: 'component.identity',
      reference: { value: 'close' },
      actual: { value: 'power-button-circle' },
    },
  });
  const directIconSwapDiffs = filterDirectNestedHostVariantDiffs(
    iconScopeWithDirectSwap,
    [iconSwapEvidence],
  );
  assert.equal(
    directIconSwapDiffs.length,
    1,
    'A mainComponent override must confirm a direct nested instance swap.',
  );
  assert.equal(
    shouldMaterializeComponentDiff({
      hasReferenceStructure: true,
      alreadyMaterialized: true,
      requiresExperimentalContractV2Audit: true,
      contractV2ScopeCovered: false,
    }),
    true,
    'A parent snapshot must not suppress a nested component whose Contract v2 scope was not evaluated.',
  );
  assert.equal(
    shouldMaterializeComponentDiff({
      hasReferenceStructure: true,
      alreadyMaterialized: true,
      requiresExperimentalContractV2Audit: true,
      contractV2ScopeCovered: true,
    }),
    false,
    'A nested Contract v2 scope already evaluated by its parent must not run twice.',
  );
  assert.equal(
    shouldRunComponentDiff({
      forcedCategory: false,
      needsDiff: true,
      instanceHasOverrides: false,
      requiresSizingRuleAudit: false,
      requiresNumericConstraintAudit: false,
      requiresVariableModeRuleAudit: false,
      requiresCompositionContractAudit: true,
      isInheritedFromLocalComponentContext: false,
    }),
    true,
    'A matching composition contract must trigger deep audit without Figma overrides.',
  );
  let freshnessChecks = 0;
  const page = { id: 'page:1', name: 'Page', type: 'PAGE', parent: null };
  const node = {
    id: 'instance:1',
    name: 'Local component',
    type: 'INSTANCE',
    parent: page,
    overrides: [],
  };
  const traversalContext = {
    componentKeyCache: new Map(),
    referenceStructureCache: new Map(),
    localComponentContextCache: new Map(),
    checkedComponentNodes: new Set(),
    evaluatedContractV2Nodes: new Set(),
    libraryComponentFreshnessChecker: {
      check: async () => {
        freshnessChecks += 1;
        throw new Error('freshness must not run without a component key');
      },
      getStats: () => ({
        checks: freshnessChecks,
        importCacheHits: 0,
        importCacheMisses: 0,
      }),
    },
    customStyleOptions: {},
    deprecatedStyleOptions: {},
  };

  const item = await classifyComponentNode(
    node,
    null,
    traversalContext,
    dependencies(),
  );
  assert.equal(item.relevance, 'unknown');
  assert.equal(item.isLocal, false);
  assert.equal(item.componentKey, null);
  assert.equal(item.pageName, 'Page');
  assert.equal(freshnessChecks, 0);

  assert.equal(
    isNativeLocalComponent(null),
    false,
    'A remote component missing from catalogs must not be reported as local.',
  );
  assert.equal(
    isNativeLocalComponent({ id: 'component:local', remote: false }),
    true,
    'A native local component definition must remain local without a catalog entry.',
  );
  assert.equal(
    isNativeLocalComponent({ id: 'component:remote', remote: true }),
    false,
    'A native remote component definition must never be reported as local.',
  );

  await assert.rejects(
    classifyComponentNode(
      node,
      null,
      traversalContext,
      dependencies({
        throwIfCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ),
    /cancelled/,
  );

  console.log('Component classifier boundary regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
