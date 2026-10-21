const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');
(async () => {
  const expectedZod = require('./package.json').dependencies.zod;
  if (require('zod/package.json').version !== expectedZod) throw Error('Installed Zod differs from the pinned pattern-core dependency.');
  await esbuild.build({ absWorkingDir: __dirname, entryPoints: ['src/index.ts'],
    outfile: path.join(__dirname, 'dist/index.cjs'), bundle: true,
    platform: 'node', format: 'cjs', target: ['node22'] });
  const { patternJsonSchema } = require('./dist/index.cjs');
  fs.writeFileSync(path.join(__dirname, 'schemas/pattern-contract.v1-draft.schema.json'),
    JSON.stringify(patternJsonSchema, null, 2) + '\n');
  console.log('pattern-core built; draft JSON Schema regenerated.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
