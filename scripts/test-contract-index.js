const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-contract-index-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/contracts/contractIndex.ts')],
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

function packageEntry(overrides = {}) {
  return {
    componentKey: 'web.test',
    packageName: 'Test',
    packagePath: 'web/Test',
    coverage: 'required',
    figmaKeys: ['figma-test'],
    sourceCatalogPath: 'web/Test.json',
    aliases: ['[D] Test'],
    artifacts: {
      generatedContract: 'contract.generated.json',
      rules: 'rules.json',
      composition: 'composition-contract.json',
    },
    ...overrides,
  };
}

function index(packages) {
  return {
    schemaVersion: 2,
    documentType: 'component-contract-index',
    baseUrl: 'https://example.test/JSONS/',
    coverage: { defaultPolicy: 'none' },
    packages,
  };
}

function main() {
  const { validateRemoteContractIndex } = loadModule();
  const validated = validateRemoteContractIndex(index([packageEntry()]));
  assert.equal(validated.coverage.defaultPolicy, 'none');
  assert.equal(validated.packages[0].coverage, 'required');

  assert.throws(
    () => validateRemoteContractIndex({ ...index([]), schemaVersion: 1 }),
    /schemaVersion 2/,
  );
  assert.throws(
    () =>
      validateRemoteContractIndex(
        index([packageEntry(), packageEntry({ componentKey: 'web.other' })]),
      ),
    /duplicate Figma key/,
  );
  assert.throws(
    () =>
      validateRemoteContractIndex(
        index([packageEntry({ artifacts: { rules: 'rules.json' } })]),
      ),
    /requires generatedContract, rules and composition artifacts/,
  );
  assert.doesNotThrow(() =>
    validateRemoteContractIndex(
      index([
        packageEntry(),
        packageEntry({
          componentKey: 'web.optional',
          packagePath: 'web/Optional',
          coverage: 'optional',
          figmaKeys: ['figma-optional'],
          sourceCatalogPath: 'web/Optional.json',
          artifacts: {},
        }),
        packageEntry({
          componentKey: 'web.none',
          packagePath: 'web/None',
          coverage: 'none',
          figmaKeys: ['figma-none'],
          sourceCatalogPath: 'web/None.json',
          artifacts: {},
        }),
      ]),
    ),
  );

  console.log('Contract index validation regression checks passed');
}

main();
