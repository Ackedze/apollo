const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadNetworkFetch() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-network-fetch-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/utils/networkFetch.ts')],
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
  const { appendCacheBustingQuery } = loadNetworkFetch();
  assert.equal(
    appendCacheBustingQuery(
      'https://raw.githubusercontent.com/Ackedze/design-system_ab/main/JSONS/catalog.json',
      'apolloCatalog',
      123,
    ),
    'https://raw.githubusercontent.com/Ackedze/design-system_ab/main/JSONS/catalog.json?apolloCatalog=123',
  );
  assert.equal(
    appendCacheBustingQuery(
      'https://raw.githubusercontent.com/Ackedze/desing-system_abm/main/JSONS/index.json?source=abm',
      'apolloCatalog',
      456,
    ),
    'https://raw.githubusercontent.com/Ackedze/desing-system_abm/main/JSONS/index.json?source=abm&apolloCatalog=456',
  );
  console.log('Apollo network cache-busting tests passed.');
}

main();
