const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadPromisePool() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-promise-pool-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/utils/promisePool.ts')],
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
  const { forEachWithConcurrency } = loadPromisePool();
  const items = Array.from({ length: 24 }, (_, index) => index);
  const completed = [];
  let active = 0;
  let maxActive = 0;

  await forEachWithConcurrency(items, 4, async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    completed.push(item);
    active -= 1;
  });

  assert.equal(maxActive, 4);
  assert.deepEqual(completed.slice().sort((left, right) => left - right), items);
  console.log('Promise pool regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
