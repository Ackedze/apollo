const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-variable-collection-id-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/utils/variableCollectionId.ts'),
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

function main() {
  const {
    extractVariableCollectionKey,
    getVariableCollectionLookupKeys,
  } = loadModule();
  const publishedKey = '5f96960a28ff79ed2672bea2cea5205b948d333f';
  const remoteId = `VariableCollectionId:${publishedKey}/137517:65`;
  assert.equal(extractVariableCollectionKey(remoteId), publishedKey);
  assert.deepEqual(getVariableCollectionLookupKeys(remoteId), [
    remoteId,
    publishedKey,
  ]);
  assert.equal(
    extractVariableCollectionKey('VariableCollectionId:76532:102337'),
    '76532:102337',
  );
  assert.deepEqual(getVariableCollectionLookupKeys(null), []);
  console.log('Variable collection id regression checks passed');
}

main();
