const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadDeprecatedStyleAudit() {
  const entryPoint = path.resolve(
    __dirname,
    '../src/services/deprecatedStyleAudit.ts',
  );
  const outfile = path.join(
    os.tmpdir(),
    `apollo-deprecated-style-audit-${process.pid}-${Date.now()}.cjs`,
  );

  esbuild.buildSync({
    entryPoints: [entryPoint],
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

function makePage(name) {
  return {
    id: `page-${name}`,
    type: 'PAGE',
    name,
    visible: true,
    parent: { id: 'doc', type: 'DOCUMENT', name: 'Document' },
  };
}

function makeNode({
  id,
  name,
  type = 'RECTANGLE',
  page,
  fillStyleId = '',
  strokeStyleId = '',
  getStyledTextSegments,
}) {
  return {
    id,
    name,
    type,
    visible: true,
    parent: page,
    fillStyleId,
    strokeStyleId,
    getStyledTextSegments,
  };
}

async function main() {
  global.figma = {
    mixed: Symbol('mixed'),
    currentPage: { name: 'Fallback Page' },
  };

  const { collectDeprecatedStyleUsages } = loadDeprecatedStyleAudit();
  const page = makePage('Audit Page');

  const entries = await collectDeprecatedStyleUsages(
    makeNode({
      id: '1',
      name: 'Card',
      page,
      fillStyleId: 'S:deprecated-fill,1:1',
      strokeStyleId: 'S:deprecated-stroke,1:2',
    }),
    {
      resolveStyleMetadata: async (styleId) => {
        if (styleId === 'S:deprecated-fill,1:1') {
          return {
            key: 'deprecated-fill',
            label: 'light/text/primary',
            sourceFile: 'styles/020 _ Colors BlueTint Light.json',
            isDeprecated: true,
          };
        }

        if (styleId === 'S:deprecated-stroke,1:2') {
          return {
            key: 'deprecated-stroke',
            label: 'light/border/primary',
            sourceFile: 'styles/022 _ Colors BlueTint Static.json',
            isDeprecated: true,
          };
        }

        return null;
      },
    },
  );

  assert.equal(entries.length, 2, 'Direct deprecated fill and stroke must be reported');
  assert.deepEqual(
    entries.map((entry) => [entry.reason, entry.styleLabel, entry.sourceFile]),
    [
      ['fill', 'light/text/primary', 'styles/020 _ Colors BlueTint Light.json'],
      ['stroke', 'light/border/primary', 'styles/022 _ Colors BlueTint Static.json'],
    ],
  );

  const textEntries = await collectDeprecatedStyleUsages(
    makeNode({
      id: '2',
      name: 'Ellipsis',
      type: 'TEXT',
      page,
      fillStyleId: global.figma.mixed,
      getStyledTextSegments: () => ([
        {
          start: 0,
          end: 3,
          characters: '...',
          fillStyleId: 'S:deprecated-fill,1:1',
        },
        {
          start: 3,
          end: 6,
          characters: '...',
          fillStyleId: 'S:deprecated-fill,1:1',
        },
        {
          start: 6,
          end: 9,
          characters: 'abc',
          fillStyleId: 'S:allowed-fill,1:3',
        },
      ]),
    }),
    {
      resolveStyleMetadata: async (styleId) => {
        if (styleId === 'S:deprecated-fill,1:1') {
          return {
            key: 'deprecated-fill',
            label: 'static/text/primary',
            sourceFile: 'styles/022 _ Colors BlueTint Static.json',
            isDeprecated: true,
          };
        }

        if (styleId === 'S:allowed-fill,1:3') {
          return {
            key: 'allowed-fill',
            label: 'light/bg/primary',
            sourceFile: 'styles/030 _ Safe Colors.json',
            isDeprecated: false,
          };
        }

        return null;
      },
    },
  );

  assert.deepEqual(
    textEntries.map((entry) => [entry.reason, entry.styleLabel, entry.sourceFile]),
    [['fill', 'static/text/primary', 'styles/022 _ Colors BlueTint Static.json']],
    'Deprecated styled text fill must be reported once',
  );

  console.log('Deprecated style audit regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
