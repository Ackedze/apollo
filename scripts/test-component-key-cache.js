const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function bundleModule(entryPoint, name) {
  const outfile = path.join(
    os.tmpdir(),
    `${name}-${process.pid}-${Date.now()}.cjs`,
  );

  esbuild.buildSync({
    entryPoints: [entryPoint],
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
  const { resolveCachedComponentKey } = bundleModule(
    path.resolve(__dirname, '../src/utils/componentKeyCache.ts'),
    'apollo-component-key-cache',
  );

  const cache = new Map();
  let attempts = 0;

  const load = async () => {
    attempts += 1;
    return attempts === 1 ? null : 'bb57e1060e5018e12112976857237aa5771543c3';
  };

  const first = await resolveCachedComponentKey('node-1', cache, load);
  const second = await resolveCachedComponentKey('node-1', cache, load, {
    retryIfMissing: true,
  });
  const third = await resolveCachedComponentKey('node-1', cache, load);

  assert.equal(first, null, 'First miss must still return null');
  assert.equal(
    second,
    'bb57e1060e5018e12112976857237aa5771543c3',
    'Retry must refresh a previously cached null key',
  );
  assert.equal(
    third,
    'bb57e1060e5018e12112976857237aa5771543c3',
    'Resolved key must stay cached after a successful retry',
  );
  assert.equal(attempts, 2, 'Loader must not be called after successful caching');

  console.log('Component key cache regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
