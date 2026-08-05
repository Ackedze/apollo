const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-runtime-contract-registry-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/contracts/runtimeContractRegistry.ts')],
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

async function main() {
  const registry = loadModule();
  const indexPayload = (componentKey, figmaKey) => ({
    schemaVersion: 2,
    documentType: 'component-contract-index',
    baseUrl: 'https://example.test/contracts/',
    coverage: { defaultPolicy: 'none' },
    packages: [
      {
        componentKey,
        packageName: componentKey,
        packagePath: componentKey,
        coverage: 'none',
        aliases: [],
        figmaKeys: [figmaKey],
        sourceCatalogPath: `components/${componentKey}.json`,
        artifacts: {},
      },
    ],
  });
  const payloads = new Map([
    [
      'https://example.test/index.json',
      {
        schemaVersion: 2,
        documentType: 'component-contract-index',
        baseUrl: 'https://example.test/contracts/',
        coverage: { defaultPolicy: 'none' },
        packages: [
          {
            componentKey: 'web.test',
            packageName: 'Test',
            packagePath: 'Test',
            coverage: 'required',
            aliases: ['[D] Test'],
            figmaKeys: ['figma-test'],
            sourceCatalogPath: 'components/Test.json',
            artifacts: {
              rules: 'rules.json',
              composition: 'composition.json',
              agentContext: 'agent.json',
              examples: 'examples.json',
            },
          },
        ],
      },
    ],
    [
      'https://example.test/contracts/Test/rules.json',
      { rules: [{ ruleId: 'test.rule', property: 'variant.View' }] },
    ],
    [
      'https://example.test/contracts/Test/composition.json',
      { componentKey: 'web.test', allowedOverrides: [] },
    ],
    [
      'https://example.test/contracts/Test/agent.json',
      { summary: 'Runtime context' },
    ],
    [
      'https://example.test/contracts/Test/examples.json',
      { examples: [{ exampleId: 'one', title: 'Runtime example' }] },
    ],
    [
      'https://example.test/slow-index.json',
      indexPayload('stale.package', 'figma-stale'),
    ],
    [
      'https://example.test/current-index.json',
      indexPayload('current.package', 'figma-current'),
    ],
  ]);
  const originalFetch = globalThis.fetch;
  let releaseSlowIndex = null;
  const responseFor = (payload) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(payload),
  });
  globalThis.fetch = async (url) => {
    const key = String(url).split('?')[0];
    const payload = payloads.get(key);
    if (!payload) {
      return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
    }
    if (key === 'https://example.test/slow-index.json') {
      return new Promise((resolve) => {
        releaseSlowIndex = () => resolve(responseFor(payload));
      });
    }
    return responseFor(payload);
  };
  try {
    registry.configureRemoteContractIndexSource(
      'https://example.test/index.json',
      'https://fallback.test/',
    );
    const hint = { figmaKey: 'figma-test' };
    await registry.ensureContractArtifactsForHints([hint]);
    assert.equal(registry.getRemoteComponentRuleRegistry().length, 1);
    assert.equal(registry.getRemoteCompositionContractRegistry().length, 1);
    assert.equal(registry.getRemoteComponentAgentContexts()[0].summary, 'Runtime context');
    assert.equal(registry.getContractPackageKeyForHint(hint), 'web.test');

    await registry.ensureContractExamplesForHints([hint]);
    assert.equal(
      registry.getComponentExamplesForKeys(['figma-test'])[0].examples[0].title,
      'Runtime example',
    );

    registry.configureRemoteContractIndexSource(
      'https://example.test/slow-index.json',
      'https://example.test/contracts/',
    );
    const staleLoad = registry.ensureContractPackageIndexLoaded();
    assert.equal(typeof releaseSlowIndex, 'function');
    registry.configureRemoteContractIndexSource(
      'https://example.test/current-index.json',
      'https://example.test/contracts/',
    );
    await registry.ensureContractPackageIndexLoaded();
    releaseSlowIndex();
    await staleLoad;
    assert.equal(
      registry.getContractPackageKeyForHint({ figmaKey: 'figma-current' }),
      'current.package',
    );
    assert.equal(
      registry.getContractPackageKeyForHint({ figmaKey: 'figma-stale' }),
      null,
      'A stale index request must not overwrite a reconfigured source',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('Runtime contract registry integration checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
