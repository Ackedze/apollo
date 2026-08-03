const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadAuditViewBuilder() {
  const entryPoint = path.resolve(__dirname, '../src/services/auditViewBuilder.ts');
  const outfile = path.join(
    os.tmpdir(),
    `apollo-audit-view-builder-${process.pid}-${Date.now()}.cjs`,
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

function makeAuditItem(nodeType, name, diffs, visible = true) {
  return {
    id: `${nodeType}-${name}`,
    name,
    nodeType,
    relevance: 'current',
    isLocal: false,
    pageName: 'Page',
    pathSegments: [{ id: `${nodeType}-${name}`, label: name, nodeType, visible }],
    fullPath: name,
    librarySource: 'Web :: Corp Components',
    componentKey: `${nodeType}-${name}`,
    comparisonIssues: [],
    diffs,
  };
}

async function main() {
  const { computeChangesResults, describeCustomStyleReasons } =
    loadAuditViewBuilder();

  const componentItem = makeAuditItem('COMPONENT', '[D] BackgroundPlate', [
    {
      message: 'заливка: — → #FF0000',
      nodePath: '[D] BackgroundPlate / Position=Level 1 (outer)',
      nodeName: 'Position=Level 1 (outer)',
      visible: true,
    },
  ]);

  const instanceItem = makeAuditItem('INSTANCE', '[D] Card', [
    {
      message: 'заливка: neutral/100 → accent/secondary',
      nodePath: '[D] Card',
      nodeName: '[D] Card',
      visible: true,
    },
  ]);

  const frameItem = makeAuditItem('FRAME', 'Wrapper', [
    {
      message: 'заливка: — → #FF0000',
      nodePath: 'Wrapper',
      nodeName: 'Wrapper',
      visible: true,
    },
  ]);

  const results = computeChangesResults([componentItem, instanceItem, frameItem]);

  assert.equal(
    results.length,
    2,
    'Customization results must include component and instance nodes with meaningful diffs',
  );
  assert.deepEqual(
    results.map((item) => item.nodeType),
    ['COMPONENT', 'INSTANCE'],
    'FRAME nodes must stay excluded from customization results',
  );

  globalThis.figma = { mixed: Symbol('mixed') };
  const customStyleReasons = await describeCustomStyleReasons(
    {
      id: '1:custom-style',
      name: '[D] SpotlightBar',
      type: 'RECTANGLE',
      parent: null,
      fills: [
        {
          type: 'SOLID',
          visible: true,
          color: { r: 1, g: 1, b: 1 },
        },
      ],
      fillStyleId:
        'S:27ba925a81fd8c8a03755940253f21d1c9099141,317:32',
    },
    {
      tokenLabelMap: new Map(),
      isKnownStyleId: async () => false,
      resolveStyleMetadata: async () => null,
    },
  );
  assert.deepEqual(
    customStyleReasons,
    ['fill'],
    'An unresolved custom style must remain visible in the separate custom-styles audit',
  );

  console.log('Audit view builder regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
