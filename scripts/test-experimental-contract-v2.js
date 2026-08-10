const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule(relativePath, label) {
  const outfile = path.join(os.tmpdir(), `apollo-${label}-${process.pid}-${Date.now()}.cjs`);
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '..', relativePath)],
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

async function testRegistry() {
  const registry = loadModule('src/contracts/experimentalContractV2Registry.ts', 'contract-v2-registry');
  const index = {
    schemaVersion: 'apollo.component-contract-index.v2-experimental',
    documentType: 'component-contract-index',
    status: 'experimental',
    runtimePolicy: {
      defaultEnabled: false,
      unsupportedRule: 'skip-with-diagnostics',
      unknownEvaluation: 'never-violation',
    },
    baseUrl: 'https://example.test/v2/',
    packages: [{
      id: 'web.test',
      family: 'Test',
      library: 'Test library',
      contractPath: 'Test/contract.json',
      componentKeys: ['test-key', 'test-variant-key'],
      aliases: ['[D] Test'],
      coverage: {
        executableDeterministicSourceRules: 1,
        deterministicSourceRules: 2,
        unsupported: 1,
      },
    }],
  };
  const contract = createContract();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const clean = String(url).split('?')[0];
    const payload = clean.endsWith('/index.json') ? index : contract;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(payload),
    };
  };
  try {
    registry.configureExperimentalContractV2Source(
      'https://example.test/index.json',
      'https://example.test/v2/',
    );
    await registry.ensureExperimentalContractV2ForKeys(['test-variant-key']);
    assert.equal(registry.hasExperimentalContractV2ForKey('test-key'), true);
    assert.equal(registry.hasExperimentalContractV2ForKey('test-variant-key'), true);
    assert.equal(registry.getExperimentalContractV2ForKey('test-variant-key').package.id, 'web.test');
    assert.equal(registry.getExperimentalContractV2ForKey('test-key').package.id, 'web.test');
    assert.deepEqual(registry.getExperimentalContractV2Diagnostics(), {
      indexedPackages: 1,
      indexedComponentKeys: 2,
      loadedPackages: 1,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function testRelationalAndPositionOperators() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-relational-engine',
  );
  const contract = createContract();
  const buttonSelector = {
    scope: 'descendants',
    where: {
      componentName: { op: 'equals', value: '[D] Button' },
      visible: { op: 'equals', value: true },
    },
  };
  contract.rules = [
    rule('uniform-size', buttonSelector, {
      op: 'allMatch',
      predicate: {
        op: 'equalsFact',
        fact: 'target.variant.Size',
        expectedFact: 'host.variant.Size',
      },
    }),
    rule('single-icon-position', buttonSelector, {
      op: 'valuePosition',
      fact: 'target.variant.SingleIcon',
      value: 'True',
      positions: ['last'],
      maxCount: 1,
    }),
  ];
  contract.rules[1].remediation = {
    kind: 'set-variant-properties',
    target: '$failingTarget',
    properties: { SingleIcon: 'False' },
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-variant-key',
    hostComponentName: '[D] Test',
    hostVariantProperties: { Size: '56' },
    actualStructure: [
      node(1, '[D] Test', 'test-variant-key', { Size: '56' }),
      node(2, '[D] Button', 'button-key-1', { Size: '56', SingleIcon: 'False' }),
      node(3, '[D] Button', 'button-key-2', { Size: '40', SingleIcon: 'True' }),
      node(4, '[D] Button', 'button-key-3', { Size: '56', SingleIcon: 'True' }),
    ],
  });
  assert.equal(result.diffs.length, 2);
  assert.deepEqual(
    result.diffs.map((diff) => diff.assessment.ruleId).sort(),
    ['rule-ir:test.single-icon-position', 'rule-ir:test.uniform-size'],
  );
  const sizeDiff = result.diffs.find((diff) =>
    diff.assessment.ruleId.endsWith('uniform-size'),
  );
  const singleIconDiff = result.diffs.find((diff) =>
    diff.assessment.ruleId.endsWith('single-icon-position'),
  );
  assert.equal(sizeDiff.message, 'Size: 56 → 40');
  assert.equal(sizeDiff.details.property, 'variant.Size');
  assert.equal(sizeDiff.assessment.message, 'uniform-size');
  assert.equal(singleIconDiff.message, 'SingleIcon: не более 1 → найдено 2');
  assert.equal(singleIconDiff.details.property, 'variant.SingleIcon');
  assert.equal(singleIconDiff.assessment.message, 'single-icon-position');
  assert.deepEqual(singleIconDiff.assessment.remediation, {
    kind: 'set-variant-properties',
    nodeId: 'node:4',
    properties: { SingleIcon: 'False' },
  });
  assert.equal(result.diagnostics.violations, 2);
  assert.equal(result.diagnostics.unknown, 0);
}

function testTableBasicVisibleDataCellCount() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-table-basic-engine',
  );
  const contract = createContract();
  const dataCellSelector = {
    scope: 'descendants',
    where: {
      componentKey: {
        op: 'oneOf',
        values: ['body-cell-basic-key', 'body-cell-basic-variant-key'],
      },
      visible: { op: 'equals', value: true },
    },
  };
  contract.rules = [rule('visible-data-cell-count', dataCellSelector, {
    op: 'countBetween',
    min: 2,
    max: 5,
  })];
  contract.rules[0].select.host = {
    scope: 'selection-root',
    where: {
      componentKey: { op: 'oneOf', values: ['body-row-basic-key'] },
    },
  };

  const valid = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-row-basic-key',
    hostComponentName: '[D] BodyRow :: Basic',
    actualStructure: [
      node(1, '[D] BodyRow :: Basic', 'body-row-basic-key', {}),
      node(2, '[D] BodyControlCell :: Basic', 'control-cell-key', {}),
      node(3, 'Renamed data cell 0', 'body-cell-basic-key', {}),
      node(4, 'Renamed data cell 1', 'body-cell-basic-variant-key', {}),
      node(5, '[D] BodyActionCell :: Basic', 'action-cell-key', {}),
    ],
  });
  assert.equal(valid.diffs.length, 0, 'Control and action cells must not count as data cells');

  const tooFew = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-row-basic-key',
    hostComponentName: '[D] BodyRow :: Basic',
    actualStructure: [
      Object.assign(node(1, '[D] BodyRow :: Basic', 'body-row-basic-key', {}), {
        type: 'FRAME',
        componentInstance: null,
      }),
      node(2, '[D] BodyControlCell :: Basic', 'control-cell-key', {}),
      node(3, 'Renamed data cell', 'body-cell-basic-variant-key', {}),
    ],
    evaluationScope: 'detached-structural',
  });
  assert.equal(tooFew.diffs.length, 1, 'A control cell plus one data cell is still invalid');
  assert.equal(tooFew.diffs[0].details.reference.value, '2-5');
  assert.equal(tooFew.diffs[0].details.actual.value, 1);

  const packageWideRule = rule('package-wide-rule-without-detached-provenance', {
    scope: 'self-and-descendants',
  }, {
    op: 'countBetween',
    min: 0,
    max: 0,
  });
  packageWideRule.select.host = 'host.test';
  contract.rules.push(packageWideRule);

  const invalid = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-row-basic-key',
    hostComponentName: '[D] BodyRow :: Basic',
    actualStructure: [
      Object.assign(node(1, '[D] BodyRow :: Basic', 'body-row-basic-key', {}), {
        type: 'FRAME',
        componentInstance: null,
      }),
      ...Array.from({ length: 6 }, (_, index) =>
        node(index + 2, `Renamed data cell ${index}`, 'body-cell-basic-key', {})),
    ],
    evaluationScope: 'detached-structural',
  });
  assert.equal(invalid.diffs.length, 1);
  assert.equal(
    invalid.diffs[0].assessment.ruleId,
    'rule-ir:test.visible-data-cell-count',
    'Detached evaluation must skip package-wide rules without an explicit host key',
  );
  assert.equal(invalid.diffs[0].details.reference.value, '2-5');
  assert.equal(invalid.diffs[0].details.actual.value, 6);
}

function testConditionalPaintStateAndReferenceRemediation() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-paint-engine',
  );
  const contract = createContract();
  contract.package.id = 'web.test';
  contract.rules = [
    rule('surface-baseline', { scope: 'self-and-descendants' }, {
      op: 'matchesEffectiveBaseline',
      properties: ['fill'],
    }),
    {
      ...rule('border-no-fill', { scope: 'self-and-descendants' }, {
        op: 'paintStateEquals',
        state: { fill: 'none-or-not-visible' },
      }),
      when: {
        op: 'all',
        clauses: { component: 'web.test', variant: { Type: 'Border' } },
      },
    },
    rule('matching-type', {
      scope: 'descendants',
      where: { componentName: { op: 'oneOf', values: ['StatusPreset', 'TitleStatus'] } },
    }, {
      op: 'allEqual',
      fact: 'target.variant.Type',
    }),
  ];
  contract.rules[1].presentation.group = 'fill';
  contract.rules[2].remediation = {
    kind: 'set-variant-properties',
    target: '$failingTarget',
    properties: { Type: '$targets[0].variant.Type', Unsafe: '$unknown.value' },
  };
  const structure = [
    node(1, '[D] Test', 'test-key', {}),
    { ...node(2, 'Surface', 'surface-key', { Type: 'Border' }), fill: { token: 'base-bg/primary' } },
    node(3, 'StatusPreset', 'status-key', { Type: 'Approved' }),
    node(4, 'TitleStatus', 'title-status-key', { Type: 'Error' }),
  ];
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-key',
    hostComponentName: '[D] Test',
    actualStructure: structure,
    effectiveBaselineDiffs: [{
      message: 'заливка: — → Base/Background/Primary',
      nodePath: structure[1].path,
      nodeName: structure[1].name,
      nodeId: structure[1].nodeId,
      visible: true,
      context: {
        actualComponentKey: 'surface-key',
        referenceComponentKey: 'surface-key',
        referenceOrigin: 'host',
        actualNestedOwnerComponentKey: null,
        actualNestedOwnerPath: null,
        actualNestedOwnerRelativePath: null,
        nestedOwnerComponentKey: null,
        nestedOwnerComponentRole: null,
        nestedOwnerPath: null,
        nestedOwnerRelativePath: null,
      },
      diffKind: 'paint',
      details: {
        property: 'fill',
        reference: { value: null },
        actual: { value: 'Base/Background/Primary' },
      },
    }],
    resolveTokenLabel: (token) => token === 'base-bg/primary' ? 'Base/Background/Primary' : token,
  });
  assert.equal(result.diffs.length, 2);
  const paintDiff = result.diffs.find((diff) => diff.assessment.ruleId.endsWith('border-no-fill'));
  const relationDiff = result.diffs.find((diff) => diff.assessment.ruleId.endsWith('matching-type'));
  assert.equal(paintDiff.nodeName, 'Surface');
  assert.equal(paintDiff.details.actual.value, 'Base/Background/Primary');
  assert.equal(
    result.diffs.some((diff) => diff.assessment.ruleId.endsWith('surface-baseline')),
    false,
    'An exact paint-state rule must replace the generic effective-baseline violation for the same property',
  );
  assert.deepEqual(relationDiff.assessment.remediation, {
    kind: 'set-variant-properties',
    nodeId: 'node:4',
    properties: { Type: 'Approved' },
  });

  structure[1] = { ...node(2, 'Surface', 'surface-key', { Type: 'Border' }), fill: null };
  const clean = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-key',
    hostComponentName: '[D] Test',
    actualStructure: structure,
  });
  assert.equal(clean.diffs.some((diff) => diff.assessment.ruleId.endsWith('border-no-fill')), false);
}

function testAllEqualFactAlternatives() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-fact-alternatives-engine',
  );
  const contract = createContract();
  contract.rules = [rule('shared-color', {
    scope: 'descendants',
    where: {
      semanticRoleOrLayerName: { op: 'oneOf', values: ['Operation', 'Major', 'Minor'] },
    },
  }, {
    op: 'allEqual',
    facts: ['fill', 'fills'],
  })];
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-key',
    hostComponentName: '[D] Test',
    actualStructure: [
      node(1, '[D] Test', 'test-key', {}),
      node(5, 'Operation', 'operation-wrapper-key', {}),
      { ...node(2, 'Operation', 'operation-key', {}), fill: { token: 'text/primary' } },
      { ...node(3, 'Major', 'major-key', {}), fill: { token: 'text/primary' } },
      { ...node(4, 'Minor', 'minor-key', {}), fill: { color: '#FF0000' } },
    ],
  });
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].nodeName, 'Minor');
  assert.equal(result.diffs[0].details.reference.value, 'text/primary');
  assert.equal(result.diffs[0].details.actual.value, '#FF0000');
}

function testAllowedValuesPresentation() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-allowed-values-engine',
  );
  const contract = createContract();
  contract.rules = [rule('allowed-view', {
    scope: 'descendants',
    where: { componentName: { op: 'equals', value: '[D] Button' } },
  }, {
    op: 'allMatch',
    predicate: {
      op: 'oneOf',
      fact: 'target.variant.View',
      values: ['Primary', 'Secondary'],
    },
  })];
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-key',
    hostComponentName: '[D] Test',
    actualStructure: [
      node(1, '[D] Test', 'test-key', {}),
      node(2, '[D] Button', 'button-key', { View: 'Accent' }),
    ],
  });
  assert.equal(result.diffs[0].message, 'View: Primary или Secondary → Accent');
}

function testEffectiveBaselineAndNestedSizeContract() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-effective-baseline-engine',
  );
  const contract = createContract();
  contract.package = {
    id: 'web-corp.status-property',
    family: 'Status & Property',
    library: 'Web _ Corp Components',
  };
  const statusSelector = {
    scope: 'descendants',
    where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['Status'] } },
  };
  contract.rules = [
    rule('fill-follows-effective-baseline', statusSelector, {
      op: 'matchesEffectiveBaseline',
      properties: ['fill'],
    }),
    rule('nested-status-size-matches-preset', statusSelector, {
      op: 'allMatch',
      predicate: {
        op: 'equalsFact',
        fact: 'target.variant.Size',
        expectedFact: 'host.variant.Size',
      },
    }),
  ];
  contract.rules.forEach((entry) => {
    entry.select.host = { scope: 'selection-root' };
  });
  contract.rules[0].when = {
    op: 'all',
    clauses: {
      except: { component: 'PropertyPreset', variant: { Color: 'Custom' } },
    },
  };
  contract.rules[0].assert.baselineSource = 'host-variant';
  const structure = [
    node(1, '[D] StatusPreset', 'status-preset-key', { Size: '24', Type: 'Approved' }),
    node(2, 'Status', 'status-key', { Size: '32', Shape: 'Rounded' }),
    node(3, 'Label', 'label-key', {}),
  ];
  structure[1].path = '[D] StatusPreset / Status';
  structure[2].path = '[D] StatusPreset / Status / Label';
  const fillDiff = {
    message: 'заливка: text/primary → status/info',
    nodePath: structure[2].path,
    nodeName: 'Label',
    nodeId: structure[2].nodeId,
    visible: true,
    context: {
      actualComponentKey: 'label-key',
      referenceComponentKey: 'label-key',
      referenceOrigin: 'nested-component',
      actualNestedOwnerComponentKey: 'status-key',
      actualNestedOwnerPath: structure[1].path,
      actualNestedOwnerRelativePath: 'Status',
      nestedOwnerComponentKey: 'status-key',
      nestedOwnerComponentRole: 'Part',
      nestedOwnerPath: structure[1].path,
      nestedOwnerRelativePath: 'Status',
    },
    diffKind: 'paint',
    details: {
      property: 'fill',
      reference: { value: 'text/primary' },
      actual: { value: 'status/info' },
    },
    assessment: {
      verdict: 'expected',
      source: 'component-context',
      reasonCode: 'nested-component-variant-change',
      ruleId: null,
      message: 'Legacy assessment considered the nested change expected',
    },
  };
  const backgroundFillDiff = {
    ...fillDiff,
    message: 'заливка: status-muted/info → status/info',
    nodePath: structure[1].path,
    nodeName: 'Status',
    nodeId: structure[1].nodeId,
    details: {
      property: 'fill',
      reference: { value: 'status-muted/info' },
      actual: { value: 'status/info' },
    },
  };
  const hostVariantLabelFillDiff = {
    ...fillDiff,
    message: 'заливка: decorative-text/green → text/info',
    details: {
      property: 'fill',
      reference: { value: 'decorative-text/green' },
      actual: { value: 'text/info' },
    },
  };
  const hostVariantDerivedPaddingDiff = {
    ...fillDiff,
    message: 'Паддинг top: 4 → 6',
    nodePath: structure[1].path,
    nodeName: 'Status',
    nodeId: structure[1].nodeId,
    diffKind: 'layout',
    details: {
      property: 'layout.padding.top',
      reference: { value: 4 },
      actual: { value: 6 },
    },
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'status-preset-key',
    hostComponentName: '[D] StatusPreset',
    hostVariantProperties: { Size: '24', Type: 'Approved' },
    actualStructure: structure,
    effectiveBaselineDiffs: [backgroundFillDiff],
    hostVariantBaselineDiffs: [
      hostVariantLabelFillDiff,
      hostVariantDerivedPaddingDiff,
    ],
  });
  assert.equal(result.diffs.length, 3);
  const detectedFills = result.diffs.filter((diff) =>
    diff.assessment.ruleId.endsWith('fill-follows-effective-baseline'),
  );
  const detectedSize = result.diffs.find((diff) =>
    diff.assessment.ruleId.endsWith('nested-status-size-matches-preset'),
  );
  assert.equal(detectedFills.length, 2);
  assert.deepEqual(
    detectedFills.map((diff) => diff.message).sort(),
    [
      backgroundFillDiff.message,
      hostVariantLabelFillDiff.message,
    ].sort(),
  );
  assert.equal(detectedSize.message, 'Size: 24 → 32');
  assert.equal(
    result.diffs.some((diff) =>
      diff.details.property === 'layout.padding.top',
    ),
    false,
    'Host-variant baseline must not expose layout derived from a nested variant switch',
  );

  const uppercaseDiff = {
    ...fillDiff,
    message: 'uppercase: False → True',
    nodePath: structure[2].path,
    nodeName: 'Label',
    nodeId: structure[2].nodeId,
    diffKind: 'other',
    details: {
      property: 'variant.Uppercase',
      reference: { value: 'False' },
      actual: { value: 'True' },
    },
  };
  contract.rules.unshift(rule('case-is-fixed-by-platform', statusSelector, {
    op: 'matchesEffectiveBaseline',
    properties: ['variant.Uppercase', 'text.case', 'styles.text'],
  }));
  contract.rules[0].select.host = { scope: 'selection-root' };
  const uppercaseResult = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'status-preset-key',
    hostComponentName: '[D] StatusPreset',
    hostVariantProperties: { Size: '24', Type: 'Approved' },
    actualStructure: structure,
    effectiveBaselineDiffs: [uppercaseDiff],
  });
  assert.equal(uppercaseResult.diffs.length, 2);
  assert.equal(
    uppercaseResult.diffs.some((diff) =>
      diff.assessment.ruleId.endsWith('case-is-fixed-by-platform') &&
      diff.details.property === 'variant.Uppercase' &&
      diff.assessment.verdict === 'violation',
    ),
    true,
  );

  const customProperty = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'property-preset-key',
    hostComponentName: '[D] PropertyPreset',
    hostVariantProperties: { Size: '24', Color: 'Custom' },
    actualStructure: structure,
    effectiveBaselineDiffs: [fillDiff],
  });
  assert.equal(
    customProperty.diffs.some((diff) =>
      diff.assessment.ruleId.endsWith('fill-follows-effective-baseline'),
    ),
    false,
  );
}

function testCompositePropertyDedupeAndVariantArrays() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-composite-property-engine',
  );
  const contract = createContract();
  const surfaceSelector = {
    scope: 'descendants',
    where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['Surface'] } },
  };
  const baselineRule = rule('surface-baseline', surfaceSelector, {
    op: 'matchesEffectiveBaseline',
    properties: ['fill', 'styles.fill'],
  });
  baselineRule.when = {
    op: 'all',
    clauses: { variant: { Type: ['Primary', 'Secondary'] } },
  };
  baselineRule.presentation.group = 'fill|styles.fill';
  const exactRule = rule('surface-no-fill', surfaceSelector, {
    op: 'paintStateEquals',
    state: { fill: 'none-or-not-visible' },
  });
  exactRule.presentation.group = 'fill|styles.fill';
  contract.rules = [baselineRule, exactRule];

  const structure = [
    node(1, '[D] Test', 'test-key', { Type: 'Secondary' }),
    Object.assign(node(2, 'Surface', 'surface-key', {}), {
      fill: { token: 'base-bg-alt' },
    }),
  ];
  const fillDiff = {
    message: 'заливка: — → base-bg-alt/secondary',
    nodePath: structure[1].path,
    nodeName: structure[1].name,
    nodeId: structure[1].nodeId,
    visible: true,
    context: { referenceOrigin: 'host' },
    diffKind: 'paint',
    details: {
      property: 'fill',
      reference: { value: null },
      actual: { value: 'base-bg-alt/secondary' },
    },
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-key',
    hostComponentName: '[D] Test',
    hostVariantProperties: { Type: 'Secondary' },
    actualStructure: structure,
    effectiveBaselineDiffs: [fillDiff],
  });
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].assessment.ruleId, 'rule-ir:test.surface-no-fill');
}

function testHostVariantBaselineRespectsTargetSubtree() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-host-baseline-target-engine',
  );
  const contract = createContract();
  const paintRule = rule('selected-paint', {
    scope: 'descendants',
    where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['PaintMe'] } },
  }, {
    op: 'matchesEffectiveBaseline',
    properties: ['fill'],
    baselineSource: 'host-variant',
  });
  contract.rules = [paintRule];
  const structure = [
    node(1, '[D] Test', 'test-key', {}),
    node(2, '[D] Button', 'button-key', {}),
    node(3, 'PaintMe', 'paint-key', {}),
  ];
  structure[1].path = '[D] Test / [D] Button';
  structure[2].path = '[D] Test / [D] Button / PaintMe';
  const buttonFillDiff = {
    message: 'заливка: primary → accent',
    nodePath: structure[1].path,
    nodeName: structure[1].name,
    nodeId: structure[1].nodeId,
    visible: true,
    context: { referenceOrigin: 'host' },
    diffKind: 'paint',
    details: {
      property: 'fill',
      reference: { value: 'primary' },
      actual: { value: 'accent' },
    },
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-key',
    hostComponentName: '[D] Test',
    actualStructure: structure,
    hostVariantBaselineDiffs: [buttonFillDiff],
  });
  assert.equal(
    result.diffs.length,
    0,
    'An ancestor diff must not be attributed to a selected descendant target',
  );
}

function testBenefitsUniformPropertiesReportIndependentOutliers() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-benefits-uniform-properties-engine',
  );
  const contract = createContract();
  const cardSelector = {
    scope: 'self-and-descendants',
    from: '$host',
    where: {
      semanticRoleOrLayerName: {
        op: 'oneOf',
        values: ['[D] BenefitCard', '[M] BenefitCard', 'BenefitCard'],
      },
    },
    occurrence: 'all',
    orderBy: 'document',
  };
  const contentSelector = {
    scope: 'descendants',
    where: {
      componentName: { op: 'equals', value: 'Content' },
      visible: { op: 'equals', value: true },
    },
  };
  const sizingRule = rule('benefits-sizing', { scope: 'selection-root' }, {
    op: 'propertiesEqual',
    values: { layoutSizingHorizontal: 'FILL' },
  });
  const graphicPositionRule = rule('benefits-graphic-position', cardSelector, {
    op: 'allEqual',
    fact: 'variant.GraphicPosition',
  });
  const titleRule = rule('benefits-title', contentSelector, {
    op: 'allEqual',
    fact: 'variant.Title',
  });
  sizingRule.presentation.group = 'layoutSizingHorizontal';
  graphicPositionRule.presentation.group = 'variant.GraphicPosition';
  titleRule.presentation.group = 'variant.Title';
  graphicPositionRule.when = { op: 'evidenceComplete' };
  contract.rules = [sizingRule, graphicPositionRule, titleRule];

  const structure = [
    Object.assign(node(1, '[D] Test', 'benefits-key', {}), {
      layout: { sizing: { horizontal: 'FIXED', vertical: 'HUG' } },
    }),
    node(2, '[D] BenefitCard', 'benefit-card-key', { GraphicPosition: 'Right' }),
    node(3, '[D] BenefitCard', 'benefit-card-key', { GraphicPosition: 'Left' }),
    node(4, '[D] BenefitCard', 'benefit-card-key', { GraphicPosition: 'Right' }),
    node(5, '[D] BenefitCard', 'benefit-card-key', { GraphicPosition: 'Right' }),
    node(6, 'Content', 'content-key', { Title: 'Secondary' }),
    node(7, 'Content', 'content-key', { Title: 'Primary' }),
    node(8, 'Content', 'content-key', { Title: 'Secondary' }),
    node(9, 'Content', 'content-key', { Title: 'Secondary' }),
  ];
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'benefits-key',
    hostComponentName: '[D] Test',
    actualStructure: structure,
  });

  assert.equal(result.diffs.length, 3);
  const graphicPosition = result.diffs.find((diff) =>
    diff.assessment.ruleId.endsWith('benefits-graphic-position'),
  );
  const title = result.diffs.find((diff) =>
    diff.assessment.ruleId.endsWith('benefits-title'),
  );
  const sizing = result.diffs.find((diff) =>
    diff.assessment.ruleId.endsWith('benefits-sizing'),
  );
  assert.equal(graphicPosition.nodeId, 'node:3');
  assert.equal(graphicPosition.message, 'GraphicPosition: Right → Left');
  assert.equal(title.nodeId, 'node:7');
  assert.equal(title.message, 'Title: Secondary → Primary');
  assert.equal(sizing.nodeId, 'node:1');
}

function rule(id, targets, assertion) {
  return {
    id: `rule-ir:test.${id}`,
    severity: 'error',
    enforcement: 'enforced',
    select: {
      host: {
        scope: 'selection-root',
        where: { componentName: { op: 'equals', value: '[D] Test' } },
      },
      targets,
    },
    when: { op: 'evidenceComplete' },
    assert: assertion,
    verdict: { pass: 'expected', fail: 'violation', unknown: 'unknown' },
    evidence: [],
    remediation: null,
    presentation: { message: id, group: 'component.composition' },
    capabilities: { selectors: [], facts: [], operators: [assertion.op], remediations: [] },
  };
}

function testEvaluator() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-engine',
  );
  const contract = createContract();
  contract.rules = [
    {
      id: 'rule-ir:test.primary-position',
      severity: 'error',
      enforcement: 'enforced',
      select: {
        host: {
          scope: 'selection-root',
          where: { componentName: { op: 'equals', value: '[D] Test' } },
        },
        targets: {
          scope: 'descendants',
          from: '$host',
          where: {
            componentName: { op: 'equals', value: '[D] Button' },
            visible: { op: 'equals', value: true },
          },
        },
      },
      when: { op: 'evidenceComplete' },
      assert: {
        op: 'valuePosition',
        fact: 'target.variant.View',
        value: 'Primary',
        positions: ['first'],
        maxCount: 1,
      },
      verdict: { pass: 'expected', fail: 'violation', unknown: 'unknown' },
      evidence: ['target.variant.View'],
      remediation: null,
      presentation: { message: 'Primary должна быть первой', group: 'variant.View' },
      capabilities: {
        selectors: ['selection-root', 'descendant'],
        facts: ['variant.properties'],
        operators: ['valuePosition'],
        remediations: [],
      },
    },
    {
      id: 'rule-ir:test.unsupported',
      severity: 'error',
      enforcement: 'enforced',
      select: { host: 'host.test', targets: 'tree.test' },
      when: { op: 'evidenceComplete' },
      assert: { op: 'futureOperator' },
      verdict: { pass: 'expected', fail: 'violation', unknown: 'unknown' },
      evidence: [],
      remediation: null,
      presentation: { message: 'Must never become a violation' },
      capabilities: {
        selectors: [], facts: [], operators: ['futureOperator'], remediations: [],
      },
    },
  ];
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-key',
    hostComponentName: '[D] Test',
    hostVariantProperties: {},
    actualStructure: [
      node(1, '[D] Test', 'test-key', {}),
      node(2, '[D] Button', 'button-key', { View: 'Secondary' }),
      node(3, '[D] Button', 'button-key', { View: 'Primary' }),
    ],
  });
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].assessment.ruleId, 'rule-ir:test.primary-position');
  assert.equal(result.diagnostics.violations, 1);
  assert.equal(result.diagnostics.unknown, 1);
  assert.deepEqual(result.diagnostics.unsupportedRuleIds, ['rule-ir:test.unsupported']);
}

function createContract() {
  return {
    schemaVersion: 'apollo.component-contract.v2-experimental',
    documentType: 'component-contract',
    status: 'experimental',
    package: { id: 'web.test', family: 'Test', library: 'Test library' },
    capabilities: {
      selectors: [], facts: [], operators: [], remediations: [],
      unknownCapabilityPolicy: 'unsupported-fail-closed',
      missingEvidencePolicy: 'unknown-never-violation',
    },
    facts: {
      componentApi: [],
      selectors: {
        'host.test': { scope: 'selection-root' },
        'tree.test': { scope: 'self-and-descendants', from: 'host.test' },
      },
    },
    rules: [],
    nonExecutableRules: [{}],
    coverage: { summary: {} },
  };
}

function node(id, name, componentKey, variantProperties) {
  return {
    id,
    nodeId: `node:${id}`,
    parentId: id === 1 ? null : 1,
    path: id === 1 ? name : `[D] Test / ${name}`,
    type: 'INSTANCE',
    name,
    visible: true,
    radius: null,
    componentInstance: { componentKey, variantProperties },
  };
}

async function main() {
  await testRegistry();
  testEvaluator();
  testRelationalAndPositionOperators();
  testTableBasicVisibleDataCellCount();
  testConditionalPaintStateAndReferenceRemediation();
  testAllEqualFactAlternatives();
  testAllowedValuesPresentation();
  testEffectiveBaselineAndNestedSizeContract();
  testCompositePropertyDedupeAndVariantArrays();
  testHostVariantBaselineRespectsTargetSubtree();
  testBenefitsUniformPropertiesReportIndependentOutliers();
  console.log('Experimental Contract v2 contour checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
