const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadLibrary() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-reference-miss-dedup-${process.pid}-${Date.now()}.cjs`,
  );

  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/reference/library.ts')],
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

function main() {
  const { rememberMissingIndexKeys } = loadLibrary();
  const knownKeys = new Set();

  assert.deepEqual(
    rememberMissingIndexKeys(['missing-a', 'missing-b', 'missing-a'], knownKeys),
    ['missing-a', 'missing-b'],
    'A batch must report every missing key only once',
  );
  assert.deepEqual(
    rememberMissingIndexKeys(['missing-b', 'missing-c'], knownKeys),
    ['missing-c'],
    'Later lookups must only report previously unseen keys',
  );
  assert.deepEqual([...knownKeys], ['missing-a', 'missing-b', 'missing-c']);

  console.log('Reference miss dedup regression checks passed');
}

main();
