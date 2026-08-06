const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-contract-artifact-compiler-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/contracts/contractArtifactCompiler.ts')],
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

function main() {
  const {
    compileContractAgentContextArtifact,
    compileContractCompositionArtifact,
    compileContractExamplesArtifact,
    compileContractGeneratedApiArtifact,
    compileContractRulesArtifact,
  } = loadModule();
  const entry = {
    componentKey: 'web.test',
    packageName: 'Test',
    packagePath: 'contracts/Test',
    coverage: 'required',
    figmaKeys: ['figma-test'],
    artifacts: {},
  };
  const aliases = ['Test', '[D] Test'];

  const rules = compileContractRulesArtifact(
    { rules: [{ ruleId: 'test.rule', property: 'variant.View' }] },
    entry,
    aliases,
  );
  assert.equal(rules.componentKey, 'web.test');
  assert.deepEqual(rules.figmaKeys, ['figma-test']);
  assert.equal(rules.rulesFile.rules[0].ruleId, 'test.rule');
  assert.equal(compileContractRulesArtifact({ rules: [] }, entry, aliases), null);

  const api = compileContractGeneratedApiArtifact(
    {
      schemaVersion: 'apollo.ds-contracts.v1',
      contracts: [{
        id: 'test.desktop',
        name: '[D] Test',
        normalizedName: 'test',
        componentKey: 'test-set-key',
        status: 'active',
        role: 'main',
        platform: 'desktop',
        figma: {
          variants: {
            properties: {View: ['Primary', 'Secondary']},
            allowedCombinations: [{View: 'Primary'}, {View: 'Secondary'}],
            variantKeys: [
              {key: 'test-primary', name: 'View=Primary', properties: {View: 'Primary'}},
              {key: 'test-secondary', name: 'View=Secondary', properties: {View: 'Secondary'}},
            ],
          },
        },
      }],
    },
    entry,
    aliases,
  );
  assert.equal(api.packageComponentKey, 'web.test');
  assert.equal(api.contracts[0].componentKey, 'test-set-key');
  assert.deepEqual(api.contracts[0].figma.variants.properties.View, [
    'Primary',
    'Secondary',
  ]);

  const composition = compileContractCompositionArtifact(
    {
      componentKey: 'web.test',
      allowedOverrides: [{ property: 'fill', scope: 'nested' }],
      contracts: [{
        id: 'test.composition',
        match: {hostComponentNames: ['[D] Test']},
        select: {nestedComponentNames: ['[D] Child'], visibility: 'visible'},
        constraints: [{
          id: 'view',
          op: 'propertyDomain',
          property: 'View',
          values: ['Primary'],
          message: 'Use Primary',
        }],
      }],
    },
    aliases,
  );
  assert.equal(composition.contract.componentKey, 'web.test');
  assert.deepEqual(composition.aliases, aliases);
  assert.equal(composition.contract.contracts[0].id, 'test.composition');

  const context = compileContractAgentContextArtifact(
    {
      summary: 'Test context',
      agentInstructions: ['Use the contract'],
    },
    'web.test',
    {
      resetModel: { componentProperties: ['variant.*'] },
    },
  );
  assert.equal(context.componentKey, 'web.test');
  assert.equal(context.summary, 'Test context');
  assert.deepEqual(context.overrideContext.resetModel.componentProperties, [
    'variant.*',
  ]);

  const examples = compileContractExamplesArtifact({
    examples: [{ exampleId: 'one', title: 'Example' }],
  });
  assert.equal(examples.length, 1);
  assert.equal(examples[0].exampleId, 'one');

  console.log('Contract artifact compiler regression checks passed');
}

main();
