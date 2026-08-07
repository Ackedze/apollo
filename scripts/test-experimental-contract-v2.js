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

function testConditionalPaintStateAndReferenceRemediation() {
  const { evaluateExperimentalContractV2 } = loadModule(
    'src/contracts/experimentalContractV2Engine.ts',
    'contract-v2-paint-engine',
  );
  const contract = createContract();
  contract.package.id = 'web.test';
  contract.rules = [
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
  contract.rules[1].remediation = {
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
    resolveTokenLabel: (token) => token === 'base-bg/primary' ? 'Base/Background/Primary' : token,
  });
  assert.equal(result.diffs.length, 2);
  const paintDiff = result.diffs.find((diff) => diff.assessment.ruleId.endsWith('border-no-fill'));
  const relationDiff = result.diffs.find((diff) => diff.assessment.ruleId.endsWith('matching-type'));
  assert.equal(paintDiff.nodeName, 'Surface');
  assert.equal(paintDiff.details.actual.value, 'Base/Background/Primary');
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
  const result = evaluateExperimentalContractV2({
    contract,
    hostComponentKey: 'status-preset-key',
    hostComponentName: '[D] StatusPreset',
    hostVariantProperties: { Size: '24', Type: 'Approved' },
    actualStructure: structure,
    effectiveBaselineDiffs: [fillDiff, backgroundFillDiff],
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
    [fillDiff.message, backgroundFillDiff.message].sort(),
  );
  assert.equal(detectedSize.message, 'Size: 24 → 32');

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
  testConditionalPaintStateAndReferenceRemediation();
  testAllEqualFactAlternatives();
  testAllowedValuesPresentation();
  testEffectiveBaselineAndNestedSizeContract();
  console.log('Experimental Contract v2 contour checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
