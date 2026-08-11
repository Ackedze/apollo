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

function testConditionalButtonStackSequence() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-button-stack-sequence-engine',
  );
  const contract = createContract();
  const buttonSelector = {
    scope: 'descendants',
    where: {
      componentName: { op: 'equals', value: '[M] Button' },
      visible: { op: 'equals', value: true },
    },
  };
  contract.rules = [rule('button-stack-horizontal-order', buttonSelector, {
    op: 'sequenceEquals',
    fact: 'target.variant.View',
    values: ['Secondary', 'Primary'],
  })];
  contract.rules[0].select.host = {
    scope: 'selection-root',
    where: {
      componentName: { op: 'equals', value: '🔒 [M] ButtonStack' },
    },
  };
  contract.rules[0].when = {
    op: 'all',
    clauses: { hostVariant: { Presets: 'Group Horizontal' } },
  };
  contract.rules[0].remediation = {
    kind: 'set-variant-properties',
    target: '$failingTarget',
    properties: { View: '$expectedValue' },
  };

  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-variant-key',
    hostComponentName: '🔒 [M] ButtonStack',
    hostVariantProperties: { Presets: 'Group Horizontal' },
    actualStructure: [
      node(1, '🔒 [M] ButtonStack', 'test-variant-key', {
        Presets: 'Group Horizontal',
      }),
      node(2, '[M] Button', 'button-key-1', {
        Presets: 'Primary',
        View: 'Primary',
      }),
      node(3, '[M] Button', 'button-key-2', {
        Presets: 'Primary',
        View: 'Secondary',
      }),
    ],
  });

  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].message, 'View: Secondary → Primary');
  assert.deepEqual(result.diffs[0].assessment.remediation, {
    kind: 'set-variant-properties',
    nodeId: 'node:2',
    properties: { View: 'Secondary' },
  });

  const otherPreset = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-variant-key',
    hostComponentName: '🔒 [M] ButtonStack',
    hostVariantProperties: { Presets: 'Primary' },
    actualStructure: [
      node(1, '🔒 [M] ButtonStack', 'test-variant-key', { Presets: 'Primary' }),
      node(2, '[M] Button', 'button-key-1', {
        Presets: 'Group Horizontal',
        View: 'Primary',
      }),
      node(3, '[M] Button', 'button-key-2', {
        Presets: 'Group Horizontal',
        View: 'Secondary',
      }),
    ],
  });
  assert.equal(otherPreset.diffs.length, 0);
}

function testConditionalButtonStackCountSkipsOtherPresets() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-button-stack-count-condition-engine',
  );
  const contract = createContract();
  const buttonSelector = {
    scope: 'descendants',
    where: {
      componentName: { op: 'equals', value: '[M] Button' },
      visible: { op: 'equals', value: true },
    },
  };
  const primary = rule('button-stack-primary-count', buttonSelector, {
    op: 'countBetween',
    min: 1,
    max: 1,
  });
  primary.when = {
    op: 'all',
    clauses: { hostVariant: { Presets: 'Primary' } },
  };
  const secondary = rule('button-stack-secondary-count', buttonSelector, {
    op: 'countBetween',
    min: 1,
    max: 1,
  });
  secondary.when = {
    op: 'all',
    clauses: { hostVariant: { Presets: 'Secondary' } },
  };
  contract.rules = [primary, secondary];
  for (const contractRule of contract.rules) contractRule.select.host = {
    scope: 'selection-root',
    where: {
      componentName: { op: 'equals', value: '🔒 [M] ButtonStack' },
    },
  };

  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-variant-key',
    hostComponentName: '🔒 [M] ButtonStack',
    hostVariantProperties: { Presets: 'Primary', Background: 'False' },
    actualStructure: [
      node(1, '🔒 [M] ButtonStack', 'test-variant-key', {
        Presets: 'Primary',
        Background: 'False',
      }),
      node(2, '[M] Button', 'button-key', { View: 'Primary' }),
    ],
  });

  assert.equal(result.diffs.length, 0);
  assert.equal(result.diagnostics.passed, 2);
  assert.equal(result.diagnostics.unknown, 0);
}

function testButtonStackRootLayoutContract() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-button-stack-layout-engine',
  );
  const contract = createContract();
  const baselineRule = rule('button-stack-root-baseline', { scope: 'selection-root' }, {
    op: 'matchesEffectiveBaseline',
    properties: ['layout.padding.*'],
  });
  const exactRule = rule('button-stack-root-layout', { scope: 'selection-root' }, {
    op: 'propertiesEqual',
    values: {
      'layout.sizing.horizontal': 'FIXED',
      'layout.sizing.vertical': 'HUG',
      'layout.direction': 'V',
      'layout.itemSpacing': 12,
      'padding.top': 16,
      'padding.right': 20,
      'padding.bottom': 16,
      'padding.left': 20,
    },
  });
  contract.rules = [baselineRule, exactRule];
  for (const contractRule of contract.rules) contractRule.select.host = {
    scope: 'selection-root',
    where: {
      componentName: { op: 'equals', value: '🔒 [M] ButtonStack' },
    },
  };

  const host = node(1, '🔒 [M] ButtonStack', 'test-variant-key', {
    Presets: 'Primary',
  });
  host.layout = {
    direction: 'V',
    itemSpacing: 12,
    sizing: { horizontal: 'FIXED', vertical: 'HUG' },
    padding: { top: 16, right: 12, bottom: 16, left: 20 },
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-variant-key',
    hostComponentName: '🔒 [M] ButtonStack',
    hostVariantProperties: { Presets: 'Primary' },
    actualStructure: [host],
    effectiveBaselineDiffs: [{
      message: 'Паддинг right: 20 → 12',
      nodePath: host.path,
      nodeName: host.name,
      nodeId: host.nodeId,
      visible: true,
      context: {
        actualComponentKey: 'test-variant-key',
        referenceComponentKey: 'test-variant-key',
        referenceOrigin: 'host',
        actualNestedOwnerComponentKey: null,
        actualNestedOwnerPath: null,
        actualNestedOwnerRelativePath: null,
        nestedOwnerComponentKey: null,
        nestedOwnerComponentRole: null,
        nestedOwnerPath: null,
        nestedOwnerRelativePath: null,
      },
      diffKind: 'layout',
      details: {
        property: 'layout.padding.right',
        reference: { value: 20 },
        actual: { value: 12 },
      },
    }],
  });

  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].assessment.ruleId, 'rule-ir:test.button-stack-root-layout');
  assert.equal(result.diffs[0].details.property, 'padding.right');
  assert.equal(result.diffs[0].message, 'padding.right: 20 → 12');
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
  const actualStructure = [
    node(1, '[D] Test', 'test-key', {}),
    node(5, 'Operation', 'operation-wrapper-key', {}),
    { ...node(2, 'Operation', 'operation-key', {}), fill: { token: 'VariableID:text-primary' } },
    { ...node(3, 'Major', 'major-key', {}), fill: { token: 'VariableID:text-primary' } },
    { ...node(4, 'Minor', 'minor-key', {}), fill: { color: '#FF0000' } },
  ];
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-key',
    hostComponentName: '[D] Test',
    actualStructure,
    resolveTokenLabel: (token) =>
      token === 'VariableID:text-primary' ? 'text/primary' : token,
  });
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].nodeName, 'Minor');
  assert.equal(result.diffs[0].details.reference.value, 'text/primary');
  assert.equal(result.diffs[0].details.actual.value, '#FF0000');
  assert.equal(result.diffs[0].message, 'заливка: text/primary → #FF0000');
  assert.equal(result.diffs[0].details.property, 'fill');
  assert.equal(result.diffs[0].diffKind, 'paint');
  assert.equal(result.diffs[0].details.reference.resourceType, 'token');
  assert.equal(result.diffs[0].details.reference.resourceId, 'VariableID:text-primary');

  contract.rules[0].assert.strategy = { strategy: 'all-visible-targets-equal' };
  actualStructure[4].visible = false;
  const hiddenMismatch = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'test-key',
    hostComponentName: '[D] Test',
    actualStructure,
  });
  assert.equal(hiddenMismatch.diffs.length, 0);
}

function testAllEqualTypographyUsesEffectiveBaseline() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-all-equal-typography-engine',
  );
  const selector = {
    scope: 'descendants',
    where: {
      semanticRoleOrLayerName: {
        op: 'oneOf',
        values: ['Major', 'Minor', 'Currency'],
      },
    },
  };
  const baselineRule = rule('amount-typography-baseline', selector, {
    op: 'matchesEffectiveBaseline',
    properties: ['styles.text'],
  });
  const sharedStyleRule = rule('parts-share-text-style', selector, {
    op: 'allEqual',
    fact: 'style.text',
  });
  const contract = createContract();
  contract.rules = [baselineRule, sharedStyleRule];

  const structure = [
    node(1, 'AmountParagraph', 'amount-key', { Style: 'Paragraph 14/20' }),
    node(2, 'Major', '', {}),
    node(3, 'Minor', '', {}),
    node(4, 'Currency', '', {}),
  ];
  for (const part of structure.slice(1)) {
    part.type = 'TEXT';
    part.componentInstance = null;
    part.styles = {
      text: {
        styleKey: part.name === 'Major' ? 'style-16-20' : 'style-14-20',
      },
    };
  }
  const typographyDiff = {
    message: 'Стиль текст: Paragraph/14–20 Primary Small → Paragraph/16–20 Component Primary',
    nodePath: structure[1].path,
    nodeName: structure[1].name,
    nodeId: structure[1].nodeId,
    visible: true,
    context: { referenceOrigin: 'nested-component' },
    diffKind: 'style',
    details: {
      property: 'styles.text',
      reference: {
        value: 'Paragraph/14–20 Primary Small',
        resourceType: 'style',
        resourceId: 'style-14-20',
      },
      actual: {
        value: 'Paragraph/16–20 Component Primary',
        resourceType: 'style',
        resourceId: 'style-16-20',
      },
    },
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'amount-key',
    hostComponentName: '[D] Test',
    actualStructure: structure,
    effectiveBaselineDiffs: [typographyDiff],
  });
  assert.equal(result.diffs.length, 1, 'The relational rule must reuse the baseline finding');
  assert.equal(result.diffs[0].nodeName, 'Major');
  assert.equal(result.diffs[0].details.reference.value, 'Paragraph/14–20 Primary Small');
  assert.equal(result.diffs[0].details.actual.value, 'Paragraph/16–20 Component Primary');
  assert.equal(result.diffs[0].details.reference.resourceId, 'style-14-20');

  contract.rules = [sharedStyleRule];
  const relationalOnly = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'amount-key',
    hostComponentName: '[D] Test',
    actualStructure: structure,
    effectiveBaselineDiffs: [typographyDiff],
  });
  assert.equal(relationalOnly.diffs.length, 1);
  assert.equal(relationalOnly.diffs[0].nodeName, 'Major');
  assert.equal(relationalOnly.diffs[0].details.reference.resourceId, 'style-14-20');

  const withoutBaseline = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'amount-key',
    hostComponentName: '[D] Test',
    actualStructure: structure,
  });
  assert.equal(withoutBaseline.diffs.length, 0, 'Traversal order must never define a text-style baseline');
  assert.equal(withoutBaseline.diagnostics.unknown, 1);
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
  const statusFillSelector = {
    scope: 'descendants',
    where: {
      semanticRoleOrLayerName: {
        op: 'oneOf',
        values: ['Status', 'Label', '🔩 Label'],
      },
    },
  };
  contract.rules = [
    rule('fill-follows-effective-baseline', statusFillSelector, {
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
    context: {
      ...fillDiff.context,
      referenceOrigin: 'host',
      actualNestedOwnerComponentKey: 'label-key',
      nestedOwnerComponentKey: 'status-key',
      directHostVariantOverride: true,
    },
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
  const cleanStandaloneLabelOverride = {
    ...fillDiff,
    message: 'заливка: text/info → decorative-text/green',
    details: {
      property: 'fill',
      reference: { value: 'text/info' },
      actual: { value: 'decorative-text/green' },
    },
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'status-preset-key',
    hostComponentName: '[D] StatusPreset',
    hostVariantProperties: { Size: '24', Type: 'Approved' },
    actualStructure: structure,
    effectiveBaselineDiffs: [
      backgroundFillDiff,
      cleanStandaloneLabelOverride,
    ],
    hostVariantBaselineDiffs: [
      backgroundFillDiff,
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
  assert.equal(
    result.diffs.some((diff) => diff.message === cleanStandaloneLabelOverride.message),
    false,
    'A host-variant rule must ignore clean standalone-only Label overrides',
  );

  const unconfirmedCrossOwnerResult = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'status-preset-key',
    hostComponentName: '[D] StatusPreset',
    hostVariantProperties: { Size: '24', Type: 'Approved' },
    actualStructure: structure,
    effectiveBaselineDiffs: [],
    hostVariantBaselineDiffs: [
      {
        ...hostVariantLabelFillDiff,
        context: {
          ...hostVariantLabelFillDiff.context,
          directHostVariantOverride: false,
        },
      },
    ],
  });
  assert.equal(
    unconfirmedCrossOwnerResult.diffs.some((diff) =>
      diff.assessment.ruleId.endsWith('fill-follows-effective-baseline'),
    ),
    false,
    'A cross-owner host baseline must stay suppressed without direct Figma override evidence.',
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

function testEffectiveBaselineRemediationIsAtomic() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-atomic-remediation-engine',
  );
  const contract = createContract();
  const targetSelector = {
    scope: 'descendants',
    where: {
      semanticRoleOrLayerName: {
        op: 'oneOf',
        values: ['[D] IconButton', '[D] IconButton_Inverted'],
      },
    },
  };
  const baselineRule = rule('action-control-baseline', targetSelector, {
    op: 'matchesEffectiveBaseline',
    properties: ['component.identity', 'variant.*'],
  });
  baselineRule.select.host = { scope: 'selection-root' };
  baselineRule.remediation = {
    kind: 'set-variant-properties',
    target: '$failingTarget',
    properties: {
      Presets: '$targets[0].variant.Presets',
      Size: '$targets[0].variant.Size',
      TransparentBg: '$targets[0].variant.TransparentBg',
      View: '$targets[0].variant.View',
    },
  };
  contract.rules = [baselineRule];
  const structure = [
    node(1, '[D] BodyActionCell :: Wide', 'action-cell-key', {}),
    node(2, '[D] IconButton', 'icon-button-key', {
      Size: '32',
      View: 'Tertiary',
      TransparentBg: 'False',
    }),
  ];
  const baseDiff = {
    nodePath: structure[1].path,
    nodeName: structure[1].name,
    nodeId: structure[1].nodeId,
    visible: true,
    context: {
      actualComponentKey: 'icon-button-key',
      referenceComponentKey: 'icon-button-key',
      referenceOrigin: 'host',
    },
    diffKind: 'other',
  };
  const sizeDiff = {
    ...baseDiff,
    message: 'Size: 24 → 32',
    details: {
      property: 'variant.Size',
      reference: { value: '24' },
      actual: { value: '32' },
    },
  };
  const sizeResult = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'action-cell-key',
    hostComponentName: '[D] BodyActionCell :: Wide',
    actualStructure: structure,
    effectiveBaselineDiffs: [sizeDiff],
  });
  assert.deepEqual(sizeResult.diffs[0].assessment.remediation, {
    kind: 'set-variant-properties',
    nodeId: structure[1].nodeId,
    properties: { Size: '24' },
  });

  const identityDiff = {
    ...baseDiff,
    message: 'Компонент: [D] IconButton → [D] IconButton_Inverted',
    details: {
      property: 'component.identity',
      reference: {
        value: '[D] IconButton',
        resourceType: 'component',
        resourceId: 'icon-button-24-primary',
      },
      actual: {
        value: '[D] IconButton_Inverted',
        resourceType: 'component',
        resourceId: 'icon-button-inverted-24-primary',
      },
    },
  };
  const identityResult = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'action-cell-key',
    hostComponentName: '[D] BodyActionCell :: Wide',
    actualStructure: structure,
    effectiveBaselineDiffs: [identityDiff],
  });
  assert.equal(identityResult.diffs[0].assessment.remediation, null);
  assert.equal(
    identityResult.diffs[0].details.reference.resourceId,
    'icon-button-24-primary',
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

function testEffectiveBaselineIgnoresDescendantsFromReplacedNestedOwner() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-replaced-owner-engine',
  );
  const contract = createContract();
  const graphicsSelector = {
    scope: 'descendants',
    where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['Graphics'] } },
  };
  contract.rules = [rule('graphics-baseline', graphicsSelector, {
    op: 'matchesEffectiveBaseline',
    properties: ['fill', 'layout.*'],
  })];
  contract.rules[0].select.host = { scope: 'selection-root' };

  const structure = [
    node(1, '[D] BodyCell :: Basic', 'body-cell-key', {}),
    node(2, 'Graphics', 'graphics-slot-key', { Presets: 'CardImage' }),
    node(3, 'Image Container', null, {}),
  ];
  structure[1].path = '[D] BodyCell :: Basic / Graphics';
  structure[2].path = '[D] BodyCell :: Basic / Graphics / CardImage / Image Container';
  const derivedAssetPaint = {
    message: 'заливка: — → paint:IMAGE,paint:IMAGE',
    nodePath: structure[2].path,
    nodeName: structure[2].name,
    nodeId: structure[2].nodeId,
    visible: true,
    context: {
      actualComponentKey: null,
      referenceComponentKey: null,
      referenceOrigin: 'nested-component',
      actualNestedOwnerComponentKey: 'replacement-card-image-key',
      actualNestedOwnerPath: '[D] BodyCell :: Basic / Graphics / CardImage',
      actualNestedOwnerRelativePath: 'Image Container',
      nestedOwnerComponentKey: 'graphics-slot-key',
      nestedOwnerComponentRole: 'Main',
      nestedOwnerPath: structure[1].path,
      nestedOwnerRelativePath: 'CardImage / Image Container',
    },
    diffKind: 'paint',
    details: {
      property: 'fill',
      reference: { value: null },
      actual: { value: 'paint:IMAGE,paint:IMAGE' },
    },
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-cell-key',
    hostComponentName: '[D] BodyCell :: Basic',
    actualStructure: structure,
    effectiveBaselineDiffs: [derivedAssetPaint],
  });
  assert.equal(
    result.diffs.length,
    0,
    'A supported nested asset replacement must not leak descendant paint diffs from the previous owner baseline',
  );
}

function testEffectiveBaselineKeepsDescendantsFromAnotherVariantInSameFamily() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-same-family-owner-engine',
  );
  const contract = createContract();
  contract.rules = [rule('amount-baseline', {
    scope: 'descendants',
    where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['Major'] } },
  }, {
    op: 'matchesEffectiveBaseline',
    properties: ['layout.*', 'fill'],
  })];
  contract.rules[0].select.host = { scope: 'selection-root' };
  const structure = [
    node(1, '[D] BodyCell :: Basic', 'body-cell-key', {}),
    node(2, 'Major', null, {}),
  ];
  const diff = {
    message: 'заливка: text/primary → text/positive',
    nodePath: structure[1].path,
    nodeName: structure[1].name,
    nodeId: structure[1].nodeId,
    visible: true,
    context: {
      referenceOrigin: 'nested-component',
      actualNestedOwnerComponentKey: 'text-amount-variant-key',
      nestedOwnerComponentKey: 'text-default-variant-key',
    },
    diffKind: 'paint',
    details: {
      property: 'fill',
      reference: { value: 'text/primary' },
      actual: { value: 'text/positive' },
    },
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-cell-key',
    hostComponentName: '[D] BodyCell :: Basic',
    actualStructure: structure,
    effectiveBaselineDiffs: [diff],
    hostVariantBaselineDiffs: [diff],
    resolveComponentFamilyKey: (key) =>
      key.startsWith('text-') ? 'text-family-key' : key,
  });
  assert.equal(result.diffs.length, 1);

  const expectedParentOverride = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-cell-key',
    hostComponentName: '[D] BodyCell :: Basic',
    actualStructure: structure,
    effectiveBaselineDiffs: [diff],
    hostVariantBaselineDiffs: [],
    resolveComponentFamilyKey: (key) =>
      key.startsWith('text-') ? 'text-family-key' : key,
  });
  assert.equal(expectedParentOverride.diffs.length, 0);
}

function testNestedStandaloneBaselineDefersToExactHostProperty() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-nested-host-property-baseline-engine',
  );
  const contract = createContract();
  contract.rules = [rule('nested-layout-baseline', {
    scope: 'self-and-descendants',
  }, {
    op: 'matchesEffectiveBaseline',
    properties: ['layout.*'],
  })];
  contract.rules[0].select.host = { scope: 'selection-root' };
  const structure = [node(1, 'PaymentMaskedNumber', 'payment-variant-key', {})];
  const standalonePadding = {
    message: 'Паддинг top: 0 → 2',
    nodePath: structure[0].path,
    nodeName: structure[0].name,
    nodeId: structure[0].nodeId,
    visible: true,
    context: {
      actualComponentKey: 'payment-variant-key',
      referenceOrigin: 'nested-component',
      nestedOwnerComponentKey: 'payment-family-key',
      nestedOwnerRelativePath: '',
    },
    diffKind: 'layout',
    details: {
      property: 'layout.padding.top',
      reference: { value: 0 },
      actual: { value: 2 },
    },
  };
  const allowedHostOverride = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'payment-variant-key',
    hostComponentName: 'PaymentMaskedNumber',
    actualStructure: structure,
    effectiveBaselineDiffs: [standalonePadding],
    hostVariantBaselineDiffs: [],
    resolveComponentFamilyKey: (key) =>
      key.startsWith('payment-') ? 'payment-family-key' : key,
  });
  assert.equal(
    allowedHostOverride.diffs.length,
    0,
    'A clean host baseline must suppress a standalone-only nested layout difference',
  );

  const hostTypography = Object.assign({}, standalonePadding, {
    message: 'Стиль текст: Paragraph/14–20 → Headline/22–26',
    details: {
      property: 'styles.text',
      reference: { value: 'Paragraph/14–20' },
      actual: { value: 'Headline/22–26' },
    },
  });
  const standaloneTypography = Object.assign({}, hostTypography, {
    message: 'Типографика: SF Pro Text → Alfa Interface Sans',
    details: {
      property: 'styles.text',
      reference: { value: 'SF Pro Text' },
      actual: { value: 'Alfa Interface Sans' },
    },
  });
  contract.rules[0].assert.properties = ['styles.text'];
  const expectedHostTypography = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'payment-variant-key',
    hostComponentName: 'PaymentMaskedNumber',
    actualStructure: structure,
    effectiveBaselineDiffs: [standaloneTypography],
    hostVariantBaselineDiffs: [],
    resolveComponentFamilyKey: (key) =>
      key.startsWith('payment-') ? 'payment-family-key' : key,
  });
  assert.equal(
    expectedHostTypography.diffs.length,
    0,
    'An exact text-style rule must keep an intentional host typography override clean.',
  );
  const customized = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'payment-variant-key',
    hostComponentName: 'PaymentMaskedNumber',
    actualStructure: structure,
    effectiveBaselineDiffs: [standaloneTypography],
    hostVariantBaselineDiffs: [hostTypography],
    resolveComponentFamilyKey: (key) =>
      key.startsWith('payment-') ? 'payment-family-key' : key,
  });
  assert.equal(customized.diffs.length, 1);
  assert.equal(
    customized.diffs[0].message,
    hostTypography.message,
    'An exact host diff must provide the user-facing baseline for a nested violation',
  );
}

function testRootLayoutEvidenceSurvivesAssessmentCollapse() {
  const {
    evaluateExperimentalContractV2,
    mergeContractBaselineEvidence,
  } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-baseline-evidence',
  );
  const rootPadding = {
    message: 'Паддинг top: 24 → 20',
    nodePath: '[D] BodyCell :: Basic',
    nodeName: '[D] BodyCell :: Basic',
    nodeId: 'root-node',
    visible: true,
    context: { referenceOrigin: 'host' },
    diffKind: 'layout',
    details: {
      property: 'layout.padding.top',
      reference: { value: 24 },
      actual: { value: 20 },
    },
  };
  const nestedPadding = {
    ...rootPadding,
    nodeId: 'nested-node',
    nodePath: '[D] BodyCell :: Basic / Content',
  };
  assert.deepEqual(
    mergeContractBaselineEvidence([], [rootPadding, nestedPadding], 'root-node'),
    [rootPadding],
  );

  const contract = createContract();
  contract.rules = [rule('body-cell-layout-baseline', {
    scope: 'self-and-descendants',
    where: {
      semanticRoleOrLayerName: {
        op: 'oneOf',
        values: ['[D] BodyCell :: Basic'],
      },
    },
  }, {
    op: 'matchesEffectiveBaseline',
    properties: ['layout.*'],
  })];
  contract.rules[0].select.host = { scope: 'selection-root' };
  const root = node(1, 'Presets=Text, Skeleton=False', 'body-cell-key', {});
  root.nodeId = 'root-node';
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-cell-key',
    hostComponentName: '[D] BodyCell :: Basic',
    actualStructure: [root],
    effectiveBaselineDiffs: [rootPadding],
  });
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].details.property, 'layout.padding.top');
}

function testAmountPresetTopRightAlignment() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-amount-alignment',
  );
  const contract = createContract();
  contract.rules = [rule('amount-top-right', {
    scope: 'descendants',
    where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['Text 1'] } },
  }, {
    op: 'propertiesEqual',
    values: {
      primaryAxisAlignItems: 'MAX',
      counterAxisAlignItems: 'MIN',
    },
  })];
  contract.rules[0].select.host = { scope: 'selection-root' };
  contract.rules[0].when = {
    op: 'all',
    clauses: { variant: { Presets: 'Amount' } },
  };
  const structure = [
    node(1, '[D] BodyCell :: Basic', 'body-cell-key', { Presets: 'Text' }),
    node(2, 'Text 1', 'text-amount-key', { Presets: 'Amount' }),
  ];
  structure[1].layout = {
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-cell-key',
    hostComponentName: '[D] BodyCell :: Basic',
    actualStructure: structure,
  });
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].assessment.evidence.expected, 'MAX');
  assert.equal(result.diffs[0].assessment.evidence.actual, 'MIN');
  assert.equal(result.diffs[0].details.property, 'layout.primaryAxisAlignItems');
}

function testWideTableAmountPresetTopRightAlignment() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-wide-table-amount-alignment',
  );
  const contract = createContract();
  contract.rules = [rule('wide-amount-top-right', {
    scope: 'descendants',
    where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['Text'] } },
  }, {
    op: 'propertiesEqual',
    values: {
      primaryAxisAlignItems: 'MIN',
      counterAxisAlignItems: 'MAX',
    },
  })];
  contract.rules[0].select.host = { scope: 'selection-root' };
  contract.rules[0].when = {
    op: 'all',
    clauses: { variant: { Presets: 'Amount' } },
  };
  const structure = [
    node(1, '[D] BodyCell :: Wide', 'body-cell-wide-key', {}),
    node(2, 'Text', 'wide-text-key', { Presets: 'Amount' }),
  ];
  structure[1].layout = {
    direction: 'V',
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-cell-wide-key',
    hostComponentName: '[D] BodyCell :: Wide',
    actualStructure: structure,
  });
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].details.property, 'layout.counterAxisAlignItems');

  structure[1].layout.primaryAxisAlignItems = 'MAX';
  structure[1].layout.counterAxisAlignItems = 'MIN';
  const diagonalMisalignment = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-cell-wide-key',
    hostComponentName: '[D] BodyCell :: Wide',
    actualStructure: structure,
  });
  assert.equal(
    diagonalMisalignment.diffs.length,
    1,
    'A two-axis alignment violation must remain one semantic finding.',
  );
  assert.equal(diagonalMisalignment.diffs[0].details.property, 'layout.alignment');
  assert.equal(diagonalMisalignment.diffs[0].details.reference.value, 'сверху справа');
  assert.equal(diagonalMisalignment.diffs[0].details.actual.value, 'снизу слева');
  assert.deepEqual(
    diagonalMisalignment.diffs[0].details.atomicChanges.map((detail) => detail.property),
    ['layout.primaryAxisAlignItems', 'layout.counterAxisAlignItems'],
  );

  structure[1].componentInstance.variantProperties.Presets = 'Text';
  const regularText = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-cell-wide-key',
    hostComponentName: '[D] BodyCell :: Wide',
    actualStructure: structure,
  });
  assert.equal(
    regularText.diffs.length,
    0,
    'Regular Wide table text keeps designer-controlled alignment',
  );

  structure[1].componentInstance.variantProperties = {};
  structure[1].componentInstance.componentProperties = {
    Presets: 'Amount',
  };
  const exposedComponentProperty = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-cell-wide-key',
    hostComponentName: '[D] BodyCell :: Wide',
    actualStructure: structure,
  });
  assert.equal(
    exposedComponentProperty.diffs.length,
    1,
    'Contract conditions must read exposed component properties, not only variant properties.',
  );

  const splitOwnerAndLayout = [
    node(1, '[D] BodyCell :: Wide', 'body-cell-wide-key', {}),
    node(2, 'Text', 'wide-text-key', { Presets: 'Amount' }),
    node(3, 'Text', null, {}),
  ];
  splitOwnerAndLayout[2].parentId = 2;
  splitOwnerAndLayout[2].path = `${splitOwnerAndLayout[1].path} / Text`;
  splitOwnerAndLayout[2].type = 'FRAME';
  splitOwnerAndLayout[2].componentInstance = null;
  splitOwnerAndLayout[2].layout = {
    direction: 'V',
    primaryAxisAlignItems: 'MAX',
    counterAxisAlignItems: 'MAX',
  };
  const descendantLayout = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-cell-wide-key',
    hostComponentName: '[D] BodyCell :: Wide',
    actualStructure: splitOwnerAndLayout,
  });
  assert.equal(
    descendantLayout.diffs.length,
    1,
    'A component-property condition must retain selected descendants owned by the matching instance.',
  );
  assert.equal(
    descendantLayout.diffs[0].nodeId,
    splitOwnerAndLayout[2].nodeId,
  );
  assert.equal(
    descendantLayout.diffs[0].details.property,
    'layout.primaryAxisAlignItems',
  );
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

function testBaselineRuleDoesNotClaimNestedComponentEvidence() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-baseline-scope-boundary-engine',
  );
  const contract = createContract();
  const rootRule = rule('root-baseline', { scope: 'selection-root' }, {
    op: 'matchesEffectiveBaseline',
    properties: ['styles.text'],
  });
  rootRule.select.host = { scope: 'selection-root' };
  contract.rules = [rootRule];
  const structure = [
    node(1, '[D] CorporateContent', 'corporate-content-key', {}),
    node(2, 'Label', '', {}),
  ];
  structure[1].type = 'TEXT';
  structure[1].componentInstance = null;
  structure[1].path = `${structure[0].path} / [D] Body / Nested component / Label`;
  const nestedTextDiff = {
    message: 'Стиль текст: expected -> actual',
    nodePath: structure[1].path,
    nodeName: structure[1].name,
    nodeId: structure[1].nodeId,
    visible: true,
    context: { referenceOrigin: 'host' },
    diffKind: 'style',
    details: {
      property: 'styles.text',
      reference: { value: 'expected' },
      actual: { value: 'actual' },
    },
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'corporate-content-key',
    hostComponentName: '[D] CorporateContent',
    actualStructure: structure,
    effectiveBaselineDiffs: [nestedTextDiff],
  });
  assert.equal(
    result.diffs.length,
    0,
    'A host-only baseline selector must not claim a nested node diff by path prefix.',
  );
}

function testNestedScopeUsesCanonicalComponentApiName() {
  const { evaluateExperimentalContractV2Tree } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-canonical-nested-name-engine',
  );
  const parentContract = createContract();
  parentContract.package = {
    id: 'web-corp.corporate-content',
    family: 'CorporateContent',
    library: 'Corp',
  };

  const titleContract = createContract();
  titleContract.package = {
    id: 'web-corp.title-view',
    family: 'TitleView',
    library: 'Corp',
  };
  titleContract.facts.componentApi = [{
    id: 'title-view.desktop',
    name: '[D] TitleView',
    componentKey: 'title-key',
    componentKeys: ['title-key', 'title-variant-key'],
    publicApi: { properties: {}, allowedCombinations: [] },
  }];
  titleContract.rules = [rule('title-allowed-views', {
    scope: 'descendants',
    where: {
      componentName: { op: 'oneOf', values: ['[D] Button'] },
      visible: { op: 'equals', value: true },
    },
  }, {
    op: 'allMatch',
    predicate: {
      op: 'oneOf',
      fact: 'target.variant.View',
      values: ['Primary', 'Secondary'],
    },
  })];
  titleContract.rules[0].select.host = {
    scope: 'selection-root',
    where: {
      componentName: { op: 'oneOf', values: ['[D] TitleView'] },
    },
  };

  const structure = [
    node(1, '[D] CorporateContent / History', 'parent-key', {}),
    node(2, '[D] TitleView / History', 'title-variant-key', {}),
    node(3, '[D] Button', 'button-key', { View: 'Accent' }),
  ];
  structure[1].parentId = 1;
  structure[2].parentId = 2;
  structure[1].path = `${structure[0].path} / [D] TitleView / History`;
  structure[2].path = `${structure[1].path} / [D] Button`;
  const contracts = new Map([
    ['parent-key', parentContract],
    ['title-key', titleContract],
    ['title-variant-key', titleContract],
  ]);
  const result = evaluateExperimentalContractV2Tree({
    hostComponentKey: 'parent-key',
    hostComponentName: '[D] CorporateContent',
    actualStructure: structure,
    resolveContract: (key) => contracts.get(key) ?? null,
  });
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].assessment.ruleId, 'rule-ir:test.title-allowed-views');
  assert.equal(result.diffs[0].details.actual.value, 'Accent');
}

function testNestedScopeUsesDirectSelectedVariantBaseline() {
  const { evaluateExperimentalContractV2Tree } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-nested-host-variant-baseline-engine',
  );
  const parentContract = createContract();
  parentContract.package = {
    id: 'web-corp.table-wide',
    family: 'Table Wide',
    library: 'Corp',
  };

  const statusContract = createContract();
  statusContract.package = {
    id: 'web-corp.status-property',
    family: 'Status & Property',
    library: 'Corp',
  };
  const fillRule = rule('status-label-fill', {
    scope: 'self-and-descendants',
    where: {
      semanticRoleOrLayerName: { op: 'oneOf', values: ['Label'] },
    },
  }, {
    op: 'matchesEffectiveBaseline',
    properties: ['fill'],
    baselineSource: 'host-variant',
  });
  fillRule.select.host = { scope: 'selection-root' };
  statusContract.rules = [fillRule];

  const structure = [
    node(1, '[D] BodyCell :: Wide', 'table-key', {}),
    node(2, 'StatusPreset', 'status-key', { Type: 'Approved' }),
    node(3, 'Status', 'core-status-key', { Size: '20' }),
    node(4, 'Label', '', {}),
  ];
  structure[1].parentId = 1;
  structure[2].parentId = 2;
  structure[3].parentId = 3;
  structure[1].path = `${structure[0].path} / Text / StatusPreset`;
  structure[2].path = `${structure[1].path} / Status`;
  structure[3].path = `${structure[2].path} / Label`;
  structure[3].type = 'TEXT';
  structure[3].componentInstance = null;
  const labelFillDiff = {
    message: 'заливка: decorative-text/red → decorative-text/blue',
    nodePath: structure[3].path,
    nodeName: structure[3].name,
    nodeId: structure[3].nodeId,
    visible: true,
    context: { referenceOrigin: 'host' },
    diffKind: 'paint',
    details: {
      property: 'fill',
      reference: { value: 'decorative-text/red' },
      actual: { value: 'decorative-text/blue' },
    },
  };
  const expandedCoreStatusDiff = {
    ...labelFillDiff,
    message: 'заливка: text/info → decorative-text/blue',
    details: {
      property: 'fill',
      reference: { value: 'text/info' },
      actual: { value: 'decorative-text/blue' },
    },
  };
  const contracts = new Map([
    ['table-key', parentContract],
    ['status-key', statusContract],
  ]);
  const result = evaluateExperimentalContractV2Tree({
    hostComponentKey: 'table-key',
    hostComponentName: '[D] BodyCell :: Wide',
    actualStructure: structure,
    rawBaselineDiffs: [expandedCoreStatusDiff],
    hostVariantBaselineDiffs: [expandedCoreStatusDiff],
    nestedScopeHostVariantBaselineDiffs: new Map([[2, [labelFillDiff]]]),
    completedNestedScopeNodeIds: new Set([2]),
    resolveContract: (key) => contracts.get(key) ?? null,
  });
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].message, labelFillDiff.message);
  assert.equal(
    result.diffs[0].assessment.ruleId,
    'rule-ir:test.status-label-fill',
  );

  const incomplete = evaluateExperimentalContractV2Tree({
    hostComponentKey: 'table-key',
    hostComponentName: '[D] BodyCell :: Wide',
    actualStructure: structure,
    completedNestedScopeNodeIds: new Set(),
    resolveContract: (key) => contracts.get(key) ?? null,
  });
  assert.deepEqual(
    incomplete.scopes.map((scope) => scope.packageId),
    ['web-corp.table-wide'],
    'A nested baseline scope without its own reference must wait for standalone evaluation.',
  );
  assert.deepEqual(
    incomplete.coveredNodeIds,
    [structure[0].nodeId],
    'An incomplete nested scope must not suppress its later standalone audit.',
  );
}

function testNestedContractScopesAreEvaluatedIndependently() {
  const { evaluateExperimentalContractV2Tree } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-nested-scopes-engine',
  );
  const tableContract = createContract();
  tableContract.package = { id: 'web-corp.table-wide', family: 'Table Wide', library: 'Corp' };

  const paymentContract = createContract();
  paymentContract.package = {
    id: 'web-corp.payment-masked-number',
    family: 'PaymentMaskedNumber',
    library: 'Corp',
  };
  paymentContract.rules = [rule('payment-major-typography', {
    scope: 'self-and-descendants',
    where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['Major'] } },
  }, {
    op: 'matchesEffectiveBaseline',
    properties: ['styles.text'],
  })];
  paymentContract.rules[0].select.host = { scope: 'selection-root' };

  const amountContract = createContract();
  amountContract.package = { id: 'web-core.amount', family: 'Amount', library: 'Core' };
  const amountOpacityRule = rule('amount-opacity', {
    scope: 'self-and-descendants',
    where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['Minor', 'Currency'] } },
  }, {
    op: 'propertiesEqual',
    values: { opacity: 1 },
  });
  const amountOpacityPropertyRule = rule('amount-opacity-property', {
    scope: 'self-and-descendants',
    where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['Minor', 'Currency'] } },
  }, {
    op: 'propertiesEqual',
    values: { Opacity: 'False' },
  });
  amountOpacityRule.select.host = { scope: 'selection-root' };
  amountOpacityPropertyRule.select.host = { scope: 'selection-root' };
  amountOpacityPropertyRule.remediation = {
    kind: 'set-variant-properties',
    target: '$failingTarget',
    properties: { Opacity: 'False' },
  };
  const amountBaselineRule = rule('amount-effective-baseline', {
    scope: 'self-and-descendants',
  }, {
    op: 'matchesEffectiveBaseline',
    properties: ['layout.itemSpacing', 'styles.text'],
  });
  amountBaselineRule.select.host = { scope: 'selection-root' };
  amountContract.rules = [
    amountBaselineRule,
    amountOpacityRule,
    amountOpacityPropertyRule,
  ];

  const structure = [
    node(1, '[D] BodyCell :: Wide', 'table-key', {}),
    node(2, 'Text', 'table-text-key', { Presets: 'Account' }),
    node(3, 'PaymentMaskedNumber', 'payment-key', {}),
    node(4, 'Major', 'payment-major-key', {}),
    node(5, 'Amount', 'amount-key', {}),
    node(6, '🔩 Minor', 'amount-minor-key', { Opacity: 'True' }),
    node(7, 'Currency', 'amount-currency-key', { Opacity: 'True' }),
  ];
  structure[1].parentId = 1;
  structure[2].parentId = 2;
  structure[3].parentId = 3;
  structure[4].parentId = 1;
  structure[5].parentId = 5;
  structure[6].parentId = 5;
  structure[1].path = `${structure[0].path} / Text`;
  structure[2].path = `${structure[1].path} / PaymentMaskedNumber`;
  structure[3].path = `${structure[2].path} / Major`;
  structure[4].path = `${structure[0].path} / Amount`;
  structure[5].path = `${structure[4].path} / Minor`;
  structure[6].path = `${structure[4].path} / Currency`;
  structure[5].opacity = 0.6;
  structure[6].opacity = 0.6;
  structure[4].layout = { itemSpacing: 12 };
  structure[5].styles = { text: { styleKey: 'custom-style' } };
  const minorLeaf = node(8, 'Minor', '', {});
  minorLeaf.type = 'TEXT';
  minorLeaf.componentInstance = null;
  minorLeaf.parentId = 6;
  minorLeaf.path = `${structure[5].path} / Minor`;
  structure.push(minorLeaf);

  const contracts = new Map([
    ['table-key', tableContract],
    ['table-text-key', tableContract],
    ['payment-key', paymentContract],
    ['payment-major-key', paymentContract],
    ['amount-key', amountContract],
    ['amount-minor-key', amountContract],
    ['amount-currency-key', amountContract],
  ]);
  const typographyDiff = {
    message: 'Стиль текст: expected → custom',
    nodePath: structure[3].path,
    nodeName: structure[3].name,
    nodeId: structure[3].nodeId,
    visible: true,
    context: { referenceOrigin: 'nested-component' },
    diffKind: 'style',
    details: {
      property: 'textStyle',
      reference: { value: 'expected' },
      actual: { value: 'custom' },
    },
  };
  const amountSpacingDiff = {
    ...typographyDiff,
    message: 'Отступ между элементами: 0 → 12',
    nodePath: structure[4].path,
    nodeName: structure[4].name,
    nodeId: structure[4].nodeId,
    diffKind: 'layout',
    details: {
      property: 'layout.itemSpacing',
      reference: { value: 0 },
      actual: { value: 12 },
    },
  };
  const amountTypographyDiff = {
    ...typographyDiff,
    message: 'Стиль текст: Paragraph/14–20 → Paragraph/16–20',
    nodePath: structure[5].path,
    nodeName: structure[5].name,
    nodeId: structure[5].nodeId,
    details: {
      property: 'styles.text',
      reference: { value: 'Paragraph/14–20' },
      actual: { value: 'Paragraph/16–20' },
    },
  };
  const wrongParentTypographyDiff = {
    ...amountTypographyDiff,
    message: 'Типографика: SF Pro Text Bold → Alfa Interface Sans Regular',
    details: {
      property: 'styles.text',
      reference: { value: 'SF Pro Text Bold' },
      actual: { value: 'Alfa Interface Sans Regular' },
    },
  };
  const result = evaluateExperimentalContractV2Tree({
    hostComponentKey: 'table-key',
    hostComponentName: '[D] BodyCell :: Wide',
    actualStructure: structure,
    effectiveBaselineDiffs: [],
    rawBaselineDiffs: [typographyDiff, wrongParentTypographyDiff],
    nestedScopeBaselineDiffs: new Map([
      [5, [amountSpacingDiff, amountTypographyDiff]],
    ]),
    resolveContract: (key) => contracts.get(key) ?? null,
  });

  assert.deepEqual(
    result.scopes.map((scope) => scope.packageId),
    ['web-corp.table-wide', 'web-corp.payment-masked-number', 'web-core.amount'],
  );
  assert.deepEqual(
    result.coveredNodeIds,
    structure.slice(0, 7).map((entry) => entry.nodeId),
    'Evaluated and same-package nested component nodes must be marked as covered.',
  );
  assert.equal(result.diffs.length, 5);
  assert.equal(result.diffs.filter((diff) => diff.details.property === 'variant.Opacity').length, 2);
  assert.equal(
    result.diffs.filter((diff) => diff.details.property === 'opacity').length,
    0,
    'A property switch must suppress its derived physical opacity diff',
  );
  assert.equal(result.diffs.filter((diff) => diff.details.property === 'textStyle').length, 1);
  assert.equal(
    result.diffs.some((diff) => diff.message === amountSpacingDiff.message),
    true,
  );
  assert.equal(
    result.diffs.some((diff) => diff.message === amountTypographyDiff.message),
    true,
  );
  assert.equal(
    result.diffs.some((diff) => diff.message === wrongParentTypographyDiff.message),
    false,
    'A nested scope must use its direct component baseline instead of a parent-host baseline for the same layer.',
  );
  const minorPropertyDiff = result.diffs.find(
    (diff) => diff.nodeName === '🔩 Minor' && diff.details.property === 'variant.Opacity',
  );
  assert.ok(minorPropertyDiff, 'Technical prefixes must not hide the Minor instance');
  assert.deepEqual(minorPropertyDiff.assessment.remediation, {
    kind: 'set-variant-properties',
    nodeId: structure[5].nodeId,
    properties: { Opacity: 'False' },
  });

  structure[5].componentInstance.variantProperties.Opacity = 'False';
  structure[6].componentInstance.variantProperties.Opacity = 'False';
  structure[6].opacity = 1;
  const directOpacity = evaluateExperimentalContractV2Tree({
    hostComponentKey: 'table-key',
    hostComponentName: '[D] BodyCell :: Wide',
    actualStructure: structure,
    effectiveBaselineDiffs: [],
    resolveContract: (key) => contracts.get(key) ?? null,
  });
  assert.equal(directOpacity.diffs.length, 1);
  assert.equal(directOpacity.diffs[0].details.property, 'opacity');
}

function testHostContractOwnsNestedPackageScope() {
  const { evaluateExperimentalContractV2Tree } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-owned-nested-scope-engine',
  );
  const hostContract = createContract();
  hostContract.package = {
    id: 'web-corp.amount-styles',
    family: 'AmountStyles',
    library: 'Corp',
  };
  hostContract.facts.contractOwnership = {
    nestedPackages: [{ packageId: 'web-core.amount', mode: 'host-contract' }],
  };
  hostContract.rules = [rule('host-amount-typography', {
    scope: 'self-and-descendants',
    where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['Major'] } },
  }, {
    op: 'matchesEffectiveBaseline',
    properties: ['styles.text'],
  })];
  hostContract.rules[0].select.host = { scope: 'selection-root' };

  const nestedContract = createContract();
  nestedContract.package = { id: 'web-core.amount', family: 'Amount', library: 'Core' };
  nestedContract.rules = [rule('core-amount-typography', {
    scope: 'self-and-descendants',
    where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['Major'] } },
  }, {
    op: 'matchesEffectiveBaseline',
    properties: ['styles.text'],
  })];
  nestedContract.rules[0].select.host = { scope: 'selection-root' };

  const structure = [
    node(1, 'AmountParagraph', 'amount-styles-key', { Style: 'Paragraph 14/20' }),
    node(2, 'Amount', 'amount-key', {}),
    node(3, 'Major', '', {}),
  ];
  structure[1].parentId = 1;
  structure[2].parentId = 2;
  structure[1].path = `${structure[0].path} / Amount`;
  structure[2].path = `${structure[1].path} / Major`;
  structure[2].type = 'TEXT';
  structure[2].componentInstance = null;
  const typographyDiff = {
    message: 'Стиль текст: preset → custom',
    nodePath: structure[2].path,
    nodeName: structure[2].name,
    nodeId: structure[2].nodeId,
    visible: true,
    context: { referenceOrigin: 'nested-component' },
    diffKind: 'style',
    details: {
      property: 'textStyle',
      reference: { value: 'preset' },
      actual: { value: 'custom' },
    },
  };
  const contracts = new Map([
    ['amount-styles-key', hostContract],
    ['amount-key', nestedContract],
  ]);
  const owned = evaluateExperimentalContractV2Tree({
    hostComponentKey: 'amount-styles-key',
    hostComponentName: 'AmountParagraph',
    actualStructure: structure,
    effectiveBaselineDiffs: [typographyDiff],
    resolveContract: (key) => contracts.get(key) ?? null,
  });
  assert.deepEqual(owned.scopes.map((scope) => scope.packageId), ['web-corp.amount-styles']);
  assert.deepEqual(
    owned.coveredNodeIds,
    [structure[0].nodeId, structure[1].nodeId],
    'A host-owned nested package must be marked as covered without a second evaluation.',
  );
  assert.equal(owned.diffs.length, 1);
  assert.equal(owned.diffs[0].assessment.ruleId, 'rule-ir:test.host-amount-typography');

  const standalone = [
    node(1, 'Amount', 'amount-key', {}),
    node(2, 'Major', '', {}),
  ];
  standalone[1].parentId = 1;
  standalone[1].path = `${standalone[0].path} / Major`;
  standalone[1].type = 'TEXT';
  standalone[1].componentInstance = null;
  const standaloneDiff = Object.assign({}, typographyDiff, {
    nodePath: standalone[1].path,
    nodeId: standalone[1].nodeId,
  });
  const direct = evaluateExperimentalContractV2Tree({
    hostComponentKey: 'amount-key',
    hostComponentName: 'Amount',
    actualStructure: standalone,
    effectiveBaselineDiffs: [standaloneDiff],
    resolveContract: (key) => contracts.get(key) ?? null,
  });
  assert.deepEqual(direct.scopes.map((scope) => scope.packageId), ['web-core.amount']);
  assert.equal(direct.diffs.length, 1);
  assert.equal(direct.diffs[0].assessment.ruleId, 'rule-ir:test.core-amount-typography');
}

function testRawOnlyComponentApiIsIgnored() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-raw-component-api-engine',
  );
  const contract = createContract();
  contract.facts.componentApi = [{
    id: 'amount.universal',
    name: 'Amount',
    componentKey: 'amount-key',
    componentKeys: ['amount-key'],
    platform: 'universal',
    status: 'active',
    publicApi: {
      properties: { raw: ['Amount'] },
      allowedCombinations: [{ raw: 'Amount' }],
    },
    evidence: { source: 'fixture', anatomyCount: 1, structureNodeCount: 1 },
  }];
  const apiRule = rule('component-api', { scope: 'self-and-descendants' }, {
    op: 'componentApiValid',
  });
  apiRule.select.host = { scope: 'selection-root' };
  contract.rules = [apiRule];
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'amount-key',
    hostComponentName: 'Amount',
    actualStructure: [node(1, 'Amount', 'amount-key', {})],
  });
  assert.equal(result.diffs.length, 0);
  assert.equal(result.diagnostics.passed, 1);
}

function testComponentApiIgnoresExposedNonVariantProperties() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-exposed-properties-api-engine',
  );
  const contract = createContract();
  contract.facts.componentApi = [{
    id: 'body-cell-wide.desktop',
    name: '[D] BodyCell :: Wide',
    componentKey: 'body-cell-wide-key',
    componentKeys: ['body-cell-wide-key'],
    platform: 'desktop',
    status: 'active',
    publicApi: {
      properties: { Presets: ['Text', 'Amount'] },
      allowedCombinations: [{ Presets: 'Text' }, { Presets: 'Amount' }],
    },
    evidence: { source: 'fixture', anatomyCount: 1, structureNodeCount: 1 },
  }];
  const apiRule = rule('component-api', { scope: 'self-and-descendants' }, {
    op: 'componentApiValid',
  });
  apiRule.select.host = { scope: 'selection-root' };
  contract.rules = [apiRule];
  const root = node(1, '[D] BodyCell :: Wide', 'body-cell-wide-key', {
    Presets: 'Amount',
  });
  root.componentInstance.componentProperties = {
    Addon: 'false',
    '✎ Major': '40802 810 0 0000 000',
  };
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'body-cell-wide-key',
    hostComponentName: '[D] BodyCell :: Wide',
    hostVariantProperties: { Presets: 'Amount' },
    actualStructure: [root],
  });
  assert.equal(
    result.diffs.length,
    0,
    'Boolean, text and instance-swap exposed properties must not be validated as variant API',
  );
  assert.equal(result.diagnostics.passed, 1);
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

function testCardImageVariantAndSilverLineContracts() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-engine',
  );
  const contract = createContract();
  contract.package = { id: 'web-corp.card-image', family: 'CardImage', library: 'Web _ Corp Components' };
  contract.rules = [
    {
      id: 'rule-ir:test.card-image-xs-active',
      severity: 'error',
      enforcement: 'enforced',
      select: {
        host: { scope: 'selection-root', where: { componentName: { op: 'equals', value: 'CardImage' } } },
        targets: {
          scope: 'self-and-descendants',
          from: '$host',
          where: { semanticRoleOrLayerName: { op: 'oneOf', values: ['CardImage'] } },
        },
      },
      when: { op: 'all', clauses: { variant: { Size: '24x16' } } },
      assert: { op: 'propertiesEqual', values: { State: 'Active' } },
      verdict: { pass: 'expected', fail: 'violation', unknown: 'unknown' },
      evidence: ['variant.properties'],
      remediation: {
        kind: 'set-variant-properties',
        target: '$failingTarget',
        properties: { State: 'Active' },
      },
      presentation: { message: 'CardImage XS использует State=Active', group: 'variant.State' },
      capabilities: { selectors: [], facts: [], operators: ['propertiesEqual'], remediations: [] },
    },
    {
      id: 'rule-ir:test.card-image-silver-line-medium',
      severity: 'error',
      enforcement: 'enforced',
      select: {
        host: { scope: 'selection-root', where: { componentName: { op: 'equals', value: 'CardImage' } } },
        targets: {
          scope: 'descendants',
          from: '$host',
          where: {
            componentName: { op: 'oneOf', values: ['SilverLine', '🔩 SilverLine'] },
            visible: { op: 'equals', value: true },
          },
        },
      },
      when: { op: 'all', clauses: { hostVariant: { Size: ['68x42', '44x28'] } } },
      assert: {
        op: 'allMatch',
        predicate: { op: 'oneOf', fact: 'target.variant.Type', values: ['simple'] },
      },
      verdict: { pass: 'expected', fail: 'violation', unknown: 'unknown' },
      evidence: ['variant.properties'],
      remediation: {
        kind: 'set-variant-properties',
        target: '$failingTarget',
        properties: { Type: 'simple' },
      },
      presentation: { message: 'CardImage M/S использует SilverLine Type=simple', group: 'variant.Type' },
      capabilities: { selectors: [], facts: [], operators: ['allMatch'], remediations: [] },
    },
  ];

  const xsResult = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'card-image-key',
    hostComponentName: 'CardImage',
    hostVariantProperties: { Size: '24x16', State: 'Locked', Stack: 'false' },
    actualStructure: [node(1, 'CardImage', 'card-image-key', {})],
  });
  assert.equal(xsResult.diffs.length, 1);
  assert.equal(xsResult.diffs[0].details.property, 'State');
  assert.deepEqual(xsResult.diffs[0].assessment.remediation.properties, { State: 'Active' });

  const silverLineResult = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'card-image-key',
    hostComponentName: 'CardImage',
    hostVariantProperties: { Size: '68x42', State: 'Active', Stack: 'false' },
    actualStructure: [
      node(1, 'CardImage', 'card-image-key', {}),
      node(2, 'SilverLine', 'silver-line-key', { Type: 'complex' }),
    ],
  });
  assert.equal(silverLineResult.diffs.length, 1);
  assert.equal(silverLineResult.diffs[0].details.property, 'variant.Type');
  assert.deepEqual(silverLineResult.diffs[0].assessment.remediation.properties, { Type: 'simple' });
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
  testConditionalButtonStackSequence();
  testConditionalButtonStackCountSkipsOtherPresets();
  testButtonStackRootLayoutContract();
  testTableBasicVisibleDataCellCount();
  testConditionalPaintStateAndReferenceRemediation();
  testAllEqualFactAlternatives();
  testAllEqualTypographyUsesEffectiveBaseline();
  testAllowedValuesPresentation();
  testEffectiveBaselineAndNestedSizeContract();
  testEffectiveBaselineRemediationIsAtomic();
  testCompositePropertyDedupeAndVariantArrays();
  testEffectiveBaselineIgnoresDescendantsFromReplacedNestedOwner();
  testEffectiveBaselineKeepsDescendantsFromAnotherVariantInSameFamily();
  testNestedStandaloneBaselineDefersToExactHostProperty();
  testRootLayoutEvidenceSurvivesAssessmentCollapse();
  testAmountPresetTopRightAlignment();
  testWideTableAmountPresetTopRightAlignment();
  testHostVariantBaselineRespectsTargetSubtree();
  testBaselineRuleDoesNotClaimNestedComponentEvidence();
  testNestedScopeUsesCanonicalComponentApiName();
  testNestedScopeUsesDirectSelectedVariantBaseline();
  testNestedContractScopesAreEvaluatedIndependently();
  testHostContractOwnsNestedPackageScope();
  testRawOnlyComponentApiIsIgnored();
  testComponentApiIgnoresExposedNonVariantProperties();
  testBenefitsUniformPropertiesReportIndependentOutliers();
  testCardImageVariantAndSilverLineContracts();
  console.log('Experimental Contract v2 contour checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
