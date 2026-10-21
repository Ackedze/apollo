const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Each run starts a fresh Node/esbuild process and writes no dist files.
const probe = `
const fs = require('node:fs'), crypto = require('node:crypto'), path = require('node:path');
const esbuild = require('esbuild');
const { runtimeBuildOptions } = require('./build');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
esbuild.build(runtimeBuildOptions(false)).then(result => {
  const bytes = result.outputFiles.find(file => file.path.endsWith('runtime.cjs')).contents;
  const code = Buffer.from(bytes).toString('utf8');
  const pins = Object.keys(result.metafile.inputs).sort().map(input => ({path: input, hash: sha(fs.readFileSync(input))}));
  const scoped = pins.filter(pin => pin.path.includes('component-contract-core/src/') && ['runtime.ts', 'component-dependencies.ts', 'representation-evidence.ts', 'member-collections.ts', 'compiler.ts', 'importer.ts'].includes(path.basename(pin.path)));
  const strict = scoped.map(pin => ({path: pin.path, confirmed: code.includes(JSON.stringify(pin.path) + '() {\\n    "use strict";')}));
  console.log(JSON.stringify({digest: sha(bytes), inputDigest: sha(JSON.stringify(pins)), strict}));
}).catch(error => { console.error(error); process.exitCode = 1; });
`;

test('cold runtime builds are byte-identical and preserve canonical TS strict mode across alias/relative imports', () => {
  const results = [0, 1].map(() => {
    const run = spawnSync(process.execPath, ['-e', probe], {cwd: path.resolve(__dirname, ".."), encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.strict.length, 6);
    for (const file of result.strict) assert.equal(file.confirmed, true, file.path);
    return result;
  });
  assert.deepEqual(results[0], results[1]);
});
