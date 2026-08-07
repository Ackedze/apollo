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
      componentKeys: ['test-key'],
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
    await registry.ensureExperimentalContractV2ForKeys(['test-key']);
    assert.equal(registry.hasExperimentalContractV2ForKey('test-key'), true);
    assert.equal(registry.getExperimentalContractV2ForKey('test-key').package.id, 'web.test');
    assert.deepEqual(registry.getExperimentalContractV2Diagnostics(), {
      indexedPackages: 1,
      indexedComponentKeys: 1,
      loadedPackages: 1,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  console.log('Experimental Contract v2 contour checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
