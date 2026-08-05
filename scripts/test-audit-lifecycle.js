const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-audit-lifecycle-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/services/auditLifecycle.ts')],
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
  const { AuditCancelledError, AuditLifecycle } = loadModule();
  const lifecycle = new AuditLifecycle();

  assert.equal(lifecycle.getState(), 'idle');
  assert.equal(lifecycle.tryBegin(), true);
  assert.equal(lifecycle.tryBegin(), false, 'parallel audit must be rejected');
  assert.equal(lifecycle.getState(), 'running');

  let rerunStarted = false;
  const queuedRerun = lifecycle.waitUntilIdle().then(() => {
    rerunStarted = true;
  });
  await Promise.resolve();
  assert.equal(rerunStarted, false);
  assert.equal(lifecycle.getWaitingCount(), 1);

  assert.equal(lifecycle.requestCancel(), true);
  assert.equal(lifecycle.requestCancel(), false);
  assert.equal(lifecycle.getState(), 'cancelling');
  assert.throws(
    () => lifecycle.throwIfCancelled(),
    (error) => error instanceof AuditCancelledError,
  );

  lifecycle.finish();
  await queuedRerun;
  assert.equal(rerunStarted, true);
  assert.equal(lifecycle.getState(), 'idle');
  assert.equal(lifecycle.getWaitingCount(), 0);
  assert.equal(lifecycle.requestCancel(), false);

  await lifecycle.waitUntilIdle();
  lifecycle.finish();
  assert.equal(lifecycle.tryBegin(), true);
  lifecycle.throwIfCancelled();
  lifecycle.finish();

  console.log('Audit lifecycle regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
