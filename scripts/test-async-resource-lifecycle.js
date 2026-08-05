const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-async-resource-lifecycle-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/services/asyncResourceLifecycle.ts')],
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function main() {
  const { AsyncResourceLifecycle } = loadModule();
  const lifecycle = new AsyncResourceLifecycle();
  const first = deferred();
  let loadCount = 0;
  const commits = [];
  const load = () => {
    loadCount += 1;
    return first.promise;
  };
  const firstEnsure = lifecycle.ensure(load, (value) => commits.push(value));
  const duplicateEnsure = lifecycle.ensure(load, (value) => commits.push(value));
  assert.equal(loadCount, 1, 'Concurrent ensure calls must share one loader');
  assert.equal(lifecycle.getSnapshot().status, 'loading');
  first.resolve('first');
  await Promise.all([firstEnsure, duplicateEnsure]);
  assert.deepEqual(commits, ['first']);
  assert.equal(lifecycle.getSnapshot().status, 'ready');
  await lifecycle.ensure(load);
  assert.equal(loadCount, 1, 'Ready resources must not reload');

  const stale = deferred();
  const current = deferred();
  lifecycle.reset();
  const staleEnsure = lifecycle.ensure(
    () => stale.promise,
    (value) => commits.push(value),
  );
  lifecycle.reset();
  const currentEnsure = lifecycle.ensure(
    () => current.promise,
    (value) => commits.push(value),
  );
  stale.resolve('stale');
  await staleEnsure;
  assert.deepEqual(
    commits,
    ['first'],
    'A reset generation must reject stale commits',
  );
  current.resolve('current');
  await currentEnsure;
  assert.deepEqual(commits, ['first', 'current']);

  const failClosed = new AsyncResourceLifecycle();
  let failedLoads = 0;
  await assert.rejects(
    failClosed.ensure(async () => {
      failedLoads += 1;
      throw new Error('unavailable');
    }),
    /unavailable/,
  );
  assert.equal(failClosed.getSnapshot().status, 'failed');
  await failClosed.ensure(async () => {
    failedLoads += 1;
  });
  assert.equal(failedLoads, 1, 'Failed resources stay closed until reset');

  const retrying = new AsyncResourceLifecycle({ retryFailed: true });
  let retryLoads = 0;
  await assert.rejects(
    retrying.ensure(async () => {
      retryLoads += 1;
      throw new Error('temporary');
    }),
    /temporary/,
  );
  await retrying.ensure(async () => {
    retryLoads += 1;
  });
  assert.equal(retryLoads, 2);
  assert.equal(retrying.getSnapshot().status, 'ready');

  console.log('Async resource lifecycle regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
