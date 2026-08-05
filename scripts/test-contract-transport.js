const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-contract-transport-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/contracts/contractTransport.ts')],
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
  const {
    fetchRemoteContractArtifactPayload,
    fetchRemoteContractIndexPayload,
    resolveRemoteContractArtifactUrl,
  } = loadModule();
  assert.equal(
    resolveRemoteContractArtifactUrl(
      'contracts/Test/rules file.json',
      'https://example.test/JSONS/',
    ),
    'https://example.test/JSONS/contracts/Test/rules%20file.json',
  );
  assert.equal(
    resolveRemoteContractArtifactUrl(
      'https://cdn.example.test/rules.json',
      'https://example.test/JSONS/',
    ),
    'https://cdn.example.test/rules.json',
  );

  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ request: requests.length }),
    };
  };
  try {
    assert.deepEqual(
      await fetchRemoteContractIndexPayload(
        'https://example.test/index.json',
        42,
      ),
      { request: 1 },
    );
    assert.deepEqual(
      await fetchRemoteContractArtifactPayload('rules.json', {
        baseUrl: 'https://example.test/contracts/',
        cacheBust: 43,
      }),
      { request: 2 },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(
    requests[0],
    'https://example.test/index.json?apolloContractIndex=42',
  );
  assert.equal(
    requests[1],
    'https://example.test/contracts/rules.json?apolloContractArtifact=43',
  );

  console.log('Contract transport regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
