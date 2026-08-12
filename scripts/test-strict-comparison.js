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

  const missingReferenceRadius = diffStructures(
    [node('FRAME', { radius: 4 })],
    [node('FRAME')],
    { strict: true },
  );
  assert.deepEqual(
    missingReferenceRadius.diffs,
    [],
    'A radius omitted by the reference catalog must not be reported as a customization',
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

  const samePublishedFillStyle = diffStructures(
    [
      node('INSTANCE', {
        styles: {
          fill: {
            styleKey:
              'S:27ba925a81fd8c8a03755940253f21d1c9099141,317:32',
          },
        },
      }),
    ],
    [
      node('COMPONENT', {
        styles: {
          fill: {
            styleKey:
              'S:27ba925a81fd8c8a03755940253f21d1c9099141,3:5352',
          },
        },
      }),
    ],
    {
      strict: true,
      resolveStyleLabel: (styleId) => styleId,
    },
  );
  assert.equal(
    samePublishedFillStyle.diffs.some(
      (entry) => entry.details?.property === 'styles.fill',
    ),
    false,
    'The same published style key with different document-local suffixes must not create a customization',
  );

  const changedPublishedFillStyle = diffStructures(
    [
      node('INSTANCE', {
        styles: { fill: { styleKey: 'S:actual-style-key,317:32' } },
      }),
    ],
    [
      node('COMPONENT', {
        styles: { fill: { styleKey: 'S:reference-style-key,3:5352' } },
      }),
    ],
    {
      strict: true,
      resolveStyleLabel: (styleId) => styleId,
    },
  );
  assert.equal(
    changedPublishedFillStyle.diffs.some(
      (entry) => entry.details?.property === 'styles.fill',
    ),
    true,
    'Different published style keys must remain visible as customizations',
  );

  const unchangedRawTypography = diffStructures(
    [
      node('TEXT', {
        text: {
          characters: 'STATUS',
          fontName: 'Alfa Interface Sans Bold',
          fontSize: 11,
          lineHeight: 16,
          letterSpacing: 0,
          paragraphSpacing: 0,
          case: 'UPPER',
        },
      }),
    ],
    [
      node('TEXT', {
        text: {
          characters: 'STATUS',
          fontName: 'Alfa Interface Sans Bold',
          fontSize: 11,
          lineHeight: 16,
          letterSpacing: 0,
          paragraphSpacing: 0,
          case: 'UPPER',
        },
      }),
    ],
  );
  assert.deepEqual(
    unchangedRawTypography.diffs,
    [],
    'Unchanged component-owned raw typography must remain clean',
  );

  const changedRawTypography = diffStructures(
    [
      node('TEXT', {
        text: {
          characters: 'STATUS',
          fontName: 'Alfa Interface Sans Medium',
          fontSize: 12,
          lineHeight: 16,
          case: 'ORIGINAL',
        },
      }),
    ],
    [
      node('TEXT', {
        text: {
          characters: 'STATUS',
          fontName: 'Alfa Interface Sans Bold',
          fontSize: 11,
          lineHeight: 16,
          case: 'UPPER',
        },
      }),
    ],
  );
  assert.equal(
    changedRawTypography.diffs.some(
      (entry) => entry.details?.property === 'styles.text',
    ),
    true,
    'Raw font changes must become a component baseline typography diff',
  );
  assert.equal(
    changedRawTypography.diffs.some(
      (entry) => entry.details?.property === 'text.case',
    ),
    true,
    'Raw text case changes must become a component baseline case diff',
  );

  const changedTextAlignment = diffStructures(
    [
      node('TEXT', {
        text: { characters: 'Title', alignHorizontal: 'LEFT' },
      }),
    ],
    [
      node('TEXT', {
        text: { characters: 'Title', alignHorizontal: 'CENTER' },
      }),
    ],
  );
  assert.equal(
    changedTextAlignment.diffs.some(
      (entry) => entry.details?.property === 'text.align.horizontal',
    ),
    true,
    'Horizontal text alignment changes must become component baseline evidence',
  );

  console.log('Strict comparison regression checks passed');
}

main();
