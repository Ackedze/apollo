const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-surface-context-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/assessment/surfaceContext.ts')],
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

function solid(r, g, b, tokenId) {
  const paint = {
    type: 'SOLID',
    visible: true,
    opacity: 1,
    color: { r, g, b },
  };
  if (tokenId) {
    paint.boundVariables = { color: { id: tokenId } };
  }
  return paint;
}

function main() {
  const { resolveSurfaceContext } = loadModule();
  const tokenNames = {
    'white-token': 'static_monochrome-white/100',
    'gray-token': 'base-bg-alt (grey)',
  };
  const resolveTokenLabel = (tokenId) => tokenNames[tokenId] ?? null;

  const whiteSurface = {
    id: 'surface-white',
    name: 'White surface',
    type: 'FRAME',
    fills: [solid(1, 1, 1, 'white-token')],
    parent: { type: 'PAGE' },
  };
  const titleView = {
    id: 'title-view',
    name: '[D] TitleView',
    type: 'INSTANCE',
    fills: [],
    parent: whiteSurface,
  };
  assert.deepEqual(resolveSurfaceContext(titleView, resolveTokenLabel), {
    kind: 'white',
    source: 'ancestor-fill-token',
    nodeId: 'surface-white',
    nodeName: 'White surface',
    tokenId: 'white-token',
    tokenName: 'static_monochrome-white/100',
    color: '#FFFFFF',
  });

  const graySurface = {
    id: 'surface-gray',
    name: 'Gray surface',
    type: 'FRAME',
    fills: [solid(1, 1, 1, 'gray-token')],
    parent: whiteSurface,
  };
  const nestedTitleView = Object.assign({}, titleView, { parent: graySurface });
  assert.equal(
    resolveSurfaceContext(nestedTitleView, resolveTokenLabel).kind,
    'gray',
    'The nearest resolvable surface token must win over a farther white surface',
  );

  const translucentSurface = {
    id: 'surface-translucent',
    name: 'Translucent overlay',
    type: 'FRAME',
    fills: [Object.assign(solid(0, 0, 0), { opacity: 0.5 })],
    parent: whiteSurface,
  };
  assert.equal(
    resolveSurfaceContext(
      Object.assign({}, titleView, { parent: translucentSurface }),
      resolveTokenLabel,
    ).kind,
    'white',
    'A translucent fill is not sufficient surface evidence; resolution must continue to the next ancestor',
  );

  assert.equal(
    resolveSurfaceContext(
      {
        id: 'raw-white',
        name: 'Raw white surface',
        type: 'FRAME',
        fills: [solid(1, 1, 1)],
        parent: { type: 'PAGE' },
      },
      resolveTokenLabel,
    ).kind,
    'white',
  );
  assert.equal(
    resolveSurfaceContext(
      {
        id: 'raw-gray',
        name: 'Raw gray surface',
        type: 'FRAME',
        fills: [solid(0.95, 0.95, 0.95)],
        parent: { type: 'PAGE' },
      },
      resolveTokenLabel,
    ).kind,
    'gray',
  );
  assert.equal(
    resolveSurfaceContext(
      {
        id: 'transparent',
        name: 'No surface',
        type: 'FRAME',
        fills: [],
        parent: { type: 'PAGE' },
      },
      resolveTokenLabel,
    ).kind,
    'unknown',
  );

  console.log('Surface context regression checks passed');
}

main();
