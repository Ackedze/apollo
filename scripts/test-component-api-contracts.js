const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-component-api-contracts-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/contracts/componentApiContracts.ts')],
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
    fs.rmSync(outfile, {force: true});
  }
}

function node(componentKey, variantProperties) {
  return {
    id: 1,
    nodeId: 'instance:1',
    parentId: null,
    path: '[D] Test',
    type: 'INSTANCE',
    name: '[D] Test',
    visible: true,
    radius: 0,
    componentInstance: {componentKey, variantProperties},
  };
}

function main() {
  const {
    compileGeneratedComponentApiArtifact,
    createComponentApiVariantDiffs,
  } = loadModule();
  const payload = {
    schemaVersion: 'apollo.ds-contracts.v1',
    contracts: [{
      id: 'test.desktop',
      name: '[D] Test',
      normalizedName: 'test',
      componentKey: 'test-set',
      status: 'active',
      role: 'main',
      platform: 'desktop',
      figma: {
        variants: {
          properties: {
            View: ['Primary', 'Secondary'],
            Size: ['M', 'L'],
          },
          allowedCombinations: [
            {View: 'Primary', Size: 'M'},
            {View: 'Secondary', Size: 'L'},
          ],
          variantKeys: [
            {
              key: 'test-primary-m',
              name: 'View=Primary, Size=M',
              properties: {View: 'Primary', Size: 'M'},
            },
            {
              key: 'test-secondary-l',
              name: 'View=Secondary, Size=L',
              properties: {View: 'Secondary', Size: 'L'},
            },
          ],
        },
      },
    }],
  };
  const registryEntry = compileGeneratedComponentApiArtifact(
    payload,
    'web.test',
    'Test',
    ['[D] Test'],
    ['test-set', 'test-primary-m', 'test-secondary-l'],
  );
  const contract = registryEntry.contracts[0];
  const resolve = (key) =>
    contract.componentKey === key ||
    contract.figma.variants.variantKeys.some((variant) => variant.key === key)
      ? contract
      : null;

  assert.deepEqual(
    createComponentApiVariantDiffs([
      node('test-primary-m', {View: 'Primary', Size: 'M'}),
    ], resolve),
    [],
    'A published variant combination must satisfy the Component API',
  );

  const invalidValue = createComponentApiVariantDiffs([
    node('test-primary-m', {View: 'Accent', Size: 'M'}),
  ], resolve);
  assert.equal(invalidValue.length, 2);
  assert.equal(
    invalidValue[0].assessment.reasonCode,
    'component-api-invalid-variant-value',
  );
  assert.equal(invalidValue[0].assessment.verdict, 'violation');

  const invalidCombination = createComponentApiVariantDiffs([
    node('test-primary-m', {View: 'Primary', Size: 'L'}),
  ], resolve);
  assert.equal(invalidCombination.length, 1);
  assert.equal(
    invalidCombination[0].assessment.reasonCode,
    'component-api-invalid-variant-combination',
  );
  assert.equal(invalidCombination[0].assessment.contractId, 'test.desktop');

  assert.throws(
    () => compileGeneratedComponentApiArtifact(
      Object.assign({}, payload, {schemaVersion: 'unknown'}),
      'web.test',
      'Test',
      [],
      [],
    ),
    /schemaVersion apollo\.ds-contracts\.v1 or supported/,
  );

  const legacyEntry = compileGeneratedComponentApiArtifact({
    schemaVersion: 1,
    documentType: 'component-contract-generated',
    components: [{
      key: 'legacy-set',
      name: '[D] Legacy',
      normalizedName: 'legacy',
      status: 'active',
      role: 'main',
      platform: 'desktop',
      variants: {
        properties: {View: ['Primary']},
        allowedCombinations: [{
          key: 'legacy-primary',
          name: 'View=Primary',
          properties: {View: 'Primary'},
        }],
      },
    }],
  }, 'web.legacy', 'Legacy', [], ['legacy-set', 'legacy-primary']);
  assert.equal(legacyEntry.contracts[0].id, 'legacy.desktop');
  assert.equal(
    legacyEntry.contracts[0].figma.variants.variantKeys[0].key,
    'legacy-primary',
  );

  const contractsRoot = path.resolve(
    __dirname,
    '../../../shared/design-system_ab/JSONS',
  );
  const indexPath = path.join(
    contractsRoot,
    'apollo/indexes/componentContractIndex.json',
  );
  if (fs.existsSync(indexPath)) {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    let compiledPackages = 0;
    let compiledContracts = 0;
    for (const packageEntry of index.packages) {
      const artifactPath = path.join(
        contractsRoot,
        packageEntry.packagePath,
        packageEntry.artifacts.generatedContract,
      );
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const compiled = compileGeneratedComponentApiArtifact(
        artifact,
        packageEntry.componentKey,
        packageEntry.packageName,
        packageEntry.aliases ?? [],
        packageEntry.figmaKeys,
      );
      compiledPackages += 1;
      compiledContracts += compiled.contracts.length;
    }
    assert.ok(index.packages.length > 0);
    assert.equal(compiledPackages, index.packages.length);
    assert.ok(compiledContracts > index.packages.length);
  }

  console.log('Component API contract regression checks passed');
}

main();
