const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadFreshnessModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-library-freshness-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/services/libraryComponentFreshness.ts'),
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

function instance(mainComponent) {
  return {
    async getMainComponentAsync() {
      return mainComponent;
    },
  };
}

async function main() {
  const {
    createLibraryComponentFreshnessChecker,
    getLibraryComponentFreshnessScope,
  } = loadFreshnessModule();
  const importCalls = [];
  const checker = createLibraryComponentFreshnessChecker(async (key) => {
    importCalls.push(key);
    if (key === 'failed-key') throw new Error('no access');
    if (key === 'mismatch-key') {
      return { id: 'latest-mismatch', key: 'another-key', remote: true };
    }
    return { id: `latest-${key}`, key, remote: true };
  });

  const current = await checker.check(
    instance({ id: 'latest-current-key', key: 'current-key', remote: true }),
  );
  assert.equal(current.status, 'current');
  assert.equal(current.reason, 'remote-component-current');

  const stale = await checker.check(
    instance({ id: 'stale-id', key: 'stale-key', remote: true }),
  );
  assert.equal(stale.status, 'update-available');
  assert.equal(stale.currentComponentId, 'stale-id');
  assert.equal(stale.latestComponentId, 'latest-stale-key');

  const secondStale = await checker.check(
    instance({ id: 'another-stale-id', key: 'stale-key', remote: true }),
  );
  assert.equal(secondStale.status, 'update-available');
  assert.equal(
    importCalls.filter((key) => key === 'stale-key').length,
    1,
    'Latest components must be imported once per key during an audit',
  );

  const local = await checker.check(
    instance({ id: 'local-id', key: 'local-key', remote: false }),
  );
  assert.equal(local.status, 'not-applicable');
  assert.equal(importCalls.includes('local-key'), false);

  let sublayerMainComponentReads = 0;
  const sublayer = await checker.check(
    {
      async getMainComponentAsync() {
        sublayerMainComponentReads += 1;
        return { id: 'nested-id', key: 'nested-key', remote: true };
      },
    },
    'instance-sublayer',
  );
  assert.equal(sublayer.status, 'not-applicable');
  assert.equal(sublayer.reason, 'instance-sublayer');
  assert.equal(sublayerMainComponentReads, 0);
  assert.equal(importCalls.includes('nested-key'), false);

  const instanceAncestor = { type: 'INSTANCE', parent: null };
  const frameAncestor = { type: 'FRAME', parent: instanceAncestor };
  assert.equal(
    getLibraryComponentFreshnessScope({ parent: frameAncestor }),
    'instance-sublayer',
  );
  assert.equal(
    getLibraryComponentFreshnessScope({
      parent: { type: 'FRAME', parent: { type: 'PAGE', parent: null } },
    }),
    'independent-instance',
  );

  const missing = await checker.check(instance(null));
  assert.equal(missing.status, 'unknown');
  assert.equal(missing.reason, 'main-component-unavailable');

  const failed = await checker.check(
    instance({ id: 'failed-id', key: 'failed-key', remote: true }),
  );
  assert.equal(failed.status, 'unknown');
  assert.equal(failed.reason, 'component-import-failed');

  const mismatch = await checker.check(
    instance({ id: 'mismatch-id', key: 'mismatch-key', remote: true }),
  );
  assert.equal(mismatch.status, 'unknown');
  assert.equal(mismatch.reason, 'component-key-mismatch');
  assert.deepEqual(checker.getStats(), {
    checks: 8,
    importCacheHits: 1,
    importCacheMisses: 4,
  });

  console.log('Library component freshness regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
