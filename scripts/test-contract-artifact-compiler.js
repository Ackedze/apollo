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

  const composition = compileContractCompositionArtifact(
    {
      componentKey: 'web.test',
      allowedOverrides: [{ property: 'fill', scope: 'nested' }],
    },
    aliases,
  );
  assert.equal(composition.contract.componentKey, 'web.test');
  assert.deepEqual(composition.aliases, aliases);

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
