const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const isWatch = process.argv.includes('--watch');

const common = {
  entryPoints: {
    code: './src/code.ts',
  },
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  platform: 'browser',
  sourcemap: true,
  target: ['es2019'],
  loader: {
    '.json': 'json',
    '.ts': 'ts',
  },
};

async function buildOnce() {
  await esbuild.build(common);
  copyHtml();
  console.log('✅ Apollo build done');
}

function copyHtml() {
  const srcHtml = path.join(__dirname, 'src', 'ui.html');
  const distHtml = path.join(__dirname, 'dist', 'ui.html');
  fs.copyFileSync(srcHtml, distHtml);
}

if (isWatch) {
  (async () => {
    const ctx = await esbuild.context(common);
    await ctx.watch();
    copyHtml();
    console.log('👀 Apollo watching');
  })();
} else {
  buildOnce();
}
