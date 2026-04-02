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

function main() {
  const { computeChangesResults } = loadAuditViewBuilder();

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

  console.log('Audit view builder regression checks passed');
}

main();
