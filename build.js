const fs = require('fs');
const path = require('path');
const isWatch = process.argv.includes('--watch');

function loadEsbuild() {
  try {
    return require('esbuild');
  } catch (error) {
    const isEsbuildMissing =
      error &&
      error.code === 'MODULE_NOT_FOUND' &&
      typeof error.message === 'string' &&
      error.message.includes("'esbuild'");

    if (!isEsbuildMissing) {
      throw error;
    }

    const workspaceRoot = path.resolve(__dirname, '..');
    throw new Error(
      `[Apollo] Missing "esbuild". Install shared dependencies once from ${workspaceRoot} with "npm install", or install them just for Apollo in ${__dirname}.`,
    );
  }
}

const esbuild = loadEsbuild();
const packageJson = require('./package.json');
const pluginVersion = packageJson.version;

const common = {
  entryPoints: {
    code: './src/code.ts',
    'ui-app': './src/ui-app/entry.tsx',
  },
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  platform: 'browser',
  sourcemap: isWatch ? 'inline' : false,
  target: ['es2019'],
  loader: {
    '.json': 'json',
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.module.css': 'local-css',
  },
  define: {
    __APOLLO_VERSION__: JSON.stringify(pluginVersion),
  },
};

async function buildOnce() {
  writeVersionMetadata();
  await esbuild.build(common);
  copyHtml();
  console.log(`✅ Apollo build done (${pluginVersion})`);
}

function writeVersionMetadata() {
  const distDir = path.join(__dirname, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(
    path.join(distDir, 'version.json'),
    `${JSON.stringify({ version: pluginVersion }, null, 2)}\n`,
  );
}

function copyHtml() {
  const srcHtml = path.join(__dirname, 'src', 'ui.html');
  const distHtml = path.join(__dirname, 'dist', 'ui.html');
  const uiBundlePath = path.join(__dirname, 'dist', 'ui-app.js');
  const uiCssPath = path.join(__dirname, 'dist', 'ui-app.css');
  let html = fs.readFileSync(srcHtml, 'utf8');

  if (fs.existsSync(uiCssPath)) {
    const uiCss = fs.readFileSync(uiCssPath, 'utf8');
    const placeholder = '<!-- ui-app-css -->';
    const inlineCssTag = `<style>\n${uiCss}\n</style>`;
    if (html.includes(placeholder)) {
      html = html.replace(placeholder, inlineCssTag);
    }
  }

  if (fs.existsSync(uiBundlePath)) {
    const uiBundle = fs
      .readFileSync(uiBundlePath, 'utf8')
      .replace(/<\/script/gi, '<\\/script');
    const placeholder = '<script src="./ui-app.js"></script>';
    const inlineBundleTag = `<script>\n${uiBundle}\n</script>`;
    if (html.includes(placeholder)) {
      html = html.split(placeholder).join(inlineBundleTag);
    }
  }

  fs.writeFileSync(distHtml, html);
}

if (isWatch) {
  (async () => {
    writeVersionMetadata();
    const ctx = await esbuild.context(common);
    await ctx.watch();
    copyHtml();
    console.log(`👀 Apollo watching (${pluginVersion})`);
  })();
} else {
  buildOnce();
}
