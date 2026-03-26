const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const isWatch = process.argv.includes('--watch');

function loadEsbuild() {
  try {
    return require('esbuild');
  } catch (error) {
    if (!error || error.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
  }

  const legacyEsbuildEntry = path.join(
    __dirname,
    '..',
    'Nemesis-mvp',
    'node_modules',
    'esbuild',
  );

  try {
    const legacyRequire = createRequire(legacyEsbuildEntry);
    const legacyEsbuild = legacyRequire(legacyEsbuildEntry);
    console.warn('[Apollo] using esbuild from ../Nemesis-mvp/node_modules');
    return legacyEsbuild;
  } catch (error) {
    const message = [
      '[Apollo] esbuild is not available.',
      'Install dependencies in Apollo with `npm install`',
      'or keep ../Nemesis-mvp/node_modules available as a fallback.',
    ].join(' ');
    console.error(message);
    throw error;
  }
}

const esbuild = loadEsbuild();

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
