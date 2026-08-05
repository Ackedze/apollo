const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-contract-index-resolver-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/contracts/contractIndexResolver.ts')],
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

function packageState(componentKey, overrides = {}) {
  const indexEntry = {
    componentKey,
    packageName: componentKey,
    packagePath: `contracts/${componentKey}`,
    coverage: 'required',
    figmaKeys: [`figma-${componentKey}`],
    sourceCatalogPath: `components/${componentKey}.json`,
    aliases: ['Shared alias'],
    artifacts: {
      rules: 'rules.json',
      composition: 'composition.json',
      examples: 'https://cdn.example.test/examples.json',
    },
    ...overrides,
  };
  return { indexEntry, aliases: [] };
}

function main() {
  const {
    buildContractPackageAliases,
    resolveContractPackageArtifactPaths,
    resolveContractPackageForHint,
  } = loadModule();
  const first = packageState('first');
  const second = packageState('second', {
    aliases: ['Shared alias', 'Second'],
  });
  first.aliases = buildContractPackageAliases(first.indexEntry);
  second.aliases = buildContractPackageAliases(second.indexEntry);

  assert.equal(
    resolveContractPackageForHint([first, second], {
      figmaKey: 'figma-second',
      componentName: 'first',
    }),
    second,
    'Figma key must take priority over aliases',
  );
  assert.equal(
    resolveContractPackageForHint([first, second], {
      sourceFile: 'COMPONENTS/FIRST.JSON',
      componentName: 'Second',
    }),
    first,
    'Source catalog path must take priority over aliases',
  );
  assert.equal(
    resolveContractPackageForHint([first, second], {
      displayName: ' second ',
    }),
    second,
  );
  assert.throws(
    () =>
      resolveContractPackageForHint([first, second], {
        componentName: 'Shared alias',
      }),
    /ambiguous contract package alias.*first, second/,
  );

  assert.deepEqual(resolveContractPackageArtifactPaths(first.indexEntry), {
    rules: 'contracts/first/rules.json',
    composition: 'contracts/first/composition.json',
    overrides: '',
    agentContext: '',
    auditMapping: '',
    examples: 'https://cdn.example.test/examples.json',
  });

  console.log('Contract index resolver regression checks passed');
}

main();
