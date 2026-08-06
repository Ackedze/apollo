const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadHarness() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-release-snapshot-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, 'fixtures/release-snapshot-harness.ts'),
    ],
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

function loadSnapshot() {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, 'fixtures/release-snapshot.json'),
      'utf8',
    ),
  );
}

function response(payload) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(payload),
  };
}

async function main() {
  const snapshot = loadSnapshot();
  const runtime = loadHarness();
  assert.equal(snapshot.snapshotVersion, 1);
  const requestedFiles = new Set();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const requestUrl = String(url).split('?')[0];
    const relativePath =
      requestUrl === snapshot.bootstrapUrl
        ? snapshot.rootFile
        : requestUrl === `${snapshot.secondaryBaseUrl}referenceSourcesMVP.json`
          ? 'abm-referenceSourcesMVP.json'
        : requestUrl.startsWith(snapshot.releaseBaseUrl)
          ? decodeURIComponent(requestUrl.slice(snapshot.releaseBaseUrl.length))
          : requestUrl.startsWith(snapshot.secondaryBaseUrl)
            ? decodeURIComponent(requestUrl.slice(snapshot.secondaryBaseUrl.length))
          : null;
    if (!relativePath || !(relativePath in snapshot.files)) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '',
      };
    }
    requestedFiles.add(relativePath);
    return response(snapshot.files[relativePath]);
  };

  try {
    await runtime.ensureReferenceCatalogsLoaded();
    assert.equal(runtime.areReferenceCatalogsReady(), true);
    assert.equal(runtime.getTokenCatalogs().length, 1);
    assert.equal(runtime.getStyleCatalogs().length, 1);
    await runtime.ensureReferenceCatalogsForKeys(['figma-test']);
    const component = runtime.findComponent('figma-test');
    assert.equal(component.displayName, '[D] Test');
    assert.equal(component.sourceFile, 'components/Test.json');

    const hint = {
      figmaKey: 'figma-test',
      componentName: '[D] Test',
      sourceFile: component.sourceFile,
    };
    await runtime.ensureContractArtifactsForHints([hint]);
    assert.equal(runtime.getContractPackageKeyForHint(hint), 'web.test');
    assert.equal(runtime.getRemoteComponentApiRegistry().length, 1);
    assert.equal(
      runtime.getComponentApiContractByFigmaKey('figma-test').id,
      'test.desktop',
    );
    assert.equal(runtime.getRemoteComponentRuleRegistry().length, 1);
    assert.equal(runtime.getRemoteCompositionContractRegistry().length, 1);
    assert.equal(
      runtime.getRemoteComponentAgentContexts()[0].summary,
      'Release fixture component',
    );

    await runtime.ensureContractExamplesForHints([hint]);
    assert.equal(
      runtime.getComponentExamplesForKeys(['figma-test'])[0].examples[0]
        .exampleId,
      'primary-view',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(
    Array.from(requestedFiles).sort(),
    Object.keys(snapshot.files).sort(),
    'Every file in the release snapshot must be reachable from the bootstrap manifest',
  );

  console.log('Release snapshot integration checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
