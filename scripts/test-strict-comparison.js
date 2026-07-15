const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadDiffModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-strict-comparison-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/structure/diff.ts')],
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

function node(type, overrides = {}) {
  return {
    id: 1,
    parentId: null,
    path: 'Root',
    type,
    name: 'Root',
    visible: true,
    radius: null,
    ...overrides,
  };
}

function main() {
  const { diffStructures } = loadDiffModule();

  const instanceRoot = diffStructures(
    [node('INSTANCE')],
    [
      node('COMPONENT', {
        radius: 0,
        fill: { color: 'rgba(255,255,255,1)', token: 'color/background/primary' },
        layout: {
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      }),
    ],
    { strict: true },
  );
  assert.deepEqual(
    instanceRoot.issues,
    [],
    'Unavailable instance-root paint/padding and effective zero radius must not create strict snapshot warnings',
  );

  const missingRadius = diffStructures(
    [node('FRAME')],
    [node('FRAME', { radius: 8 })],
    { strict: true },
  );
  assert.equal(
    missingRadius.issues.some((issue) => issue.includes('Нет данных для скруглений')),
    true,
    'A meaningful non-zero reference radius must still require snapshot data',
  );

  const missingFill = diffStructures(
    [node('FRAME')],
    [node('FRAME', { fill: { color: 'rgba(255,255,255,1)' } })],
    { strict: true },
  );
  assert.equal(
    missingFill.issues.some((issue) => issue.includes('Нет данных для заливка')),
    true,
    'Missing paint on a regular geometry node must remain a strict comparison issue',
  );

  const changedInstanceFill = diffStructures(
    [node('INSTANCE', { fill: { color: 'rgba(0,0,0,1)' } })],
    [node('COMPONENT', { fill: { color: 'rgba(255,255,255,1)' } })],
    { strict: true },
  );
  assert.equal(
    changedInstanceFill.diffs.some((entry) => entry.details?.property === 'fill'),
    true,
    'An available overridden instance-root fill must still be reported as a customization',
  );

  console.log('Strict comparison regression checks passed');
}

main();
