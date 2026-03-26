const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const isWatch = process.argv.includes('--watch');

function loadEsbuild() {
  try {
    return require('esbuild');
  } catch (error) {
    if (!error || error.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
  }

  console.warn(
    '[Apollo] esbuild is missing. Running `npm install` in Apollo before build...',
  );
  installDependencies();
  return require('esbuild');
}

function installDependencies() {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath
    ? process.execPath
    : process.platform === 'win32'
      ? 'npm.cmd'
      : 'npm';
  const args = npmExecPath
    ? [npmExecPath, 'install', '--no-audit', '--no-fund']
    : ['install', '--no-audit', '--no-fund'];

  const result = spawnSync(command, args, {
    cwd: __dirname,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(
      `[Apollo] npm install failed with exit code ${result.status}`,
    );
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
