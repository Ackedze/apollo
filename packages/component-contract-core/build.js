const esbuild = require('esbuild');
const path = require('node:path');
const fs = require('node:fs');
async function build() {
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  await esbuild.build({
    absWorkingDir: __dirname,
    entryPoints: { core: 'src/index.ts', runtime: 'src/runtime.ts', predicate: 'predicate/index.js', capture: 'src/figma-capture.ts' },
    outdir: 'dist', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', target: ['node18'],
  });
  console.log('ComponentContract shared core ' + require('./package.json').version + ' built.');
}
build().catch((error) => { console.error(error.message); process.exitCode = 1; });
