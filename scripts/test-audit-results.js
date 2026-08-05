const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-audit-results-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/services/auditResults.ts')],
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

function auditItem(overrides = {}) {
  return {
    id: '1:1',
    name: '[D] Button',
    nodeType: 'INSTANCE',
    pageName: 'Page',
    fullPath: 'Page/[D] Button',
    pathSegments: [],
    relevance: 'current',
    librarySource: 'Web :: Core',
    librarySourceFile: 'components.json',
    componentKey: 'button-key',
    isLocal: false,
    reference: null,
    comparisonIssues: [],
    diffs: [],
    ...overrides,
  };
}

async function main() {
  const { buildAuditResultViews, prepareAuditReport } = loadModule();
  const current = auditItem();
  const update = auditItem({
    id: '1:2',
    relevance: 'update',
    updateReasons: ['library-update-available'],
  });
  const local = auditItem({
    id: '1:3',
    name: 'Local component',
    relevance: 'unknown',
    componentKey: null,
    isLocal: true,
  });
  const ignoredLocal = auditItem({
    id: '1:4',
    name: '❌template',
    relevance: 'unknown',
    componentKey: null,
    isLocal: true,
  });
  const checkState = {
    relevanceBuckets: {
      technical: [],
      deprecated: [],
      update: [update],
      current: [current],
      unknown: [],
    },
    themizationEntries: [],
    wrongChannelEntries: [],
    localLibraryItems: [local, ignoredLocal],
    presetItems: [],
    detachedEntries: [],
    customStyleEntries: [],
    deprecatedStyleEntries: [],
    totalItems: 3,
  };

  const views = buildAuditResultViews(checkState);
  assert.deepEqual(views.visibleViews.local.map((item) => item.id), ['1:3']);
  assert.equal(views.visibleViews.relevance.current[0], current);
  assert.equal(views.statsViews.updates[0], update);
  assert.equal(views.statsViews.currentComponents[0], current);

  let componentKeyReads = 0;
  const { report, agentReport } = await prepareAuditReport({
    pluginVersion: 'test',
    user: { id: 'user-1', name: 'Test User' },
    figma: {
      fileKey: 'file-1',
      fileName: 'Audit fixture',
      editorType: 'figma',
    },
    scan: {
      channel: 'Desktop',
      startedAt: new Date('2026-08-04T09:00:00.000Z'),
      finishedAt: new Date('2026-08-04T09:00:01.000Z'),
      shellAuditEnabled: false,
    },
    selection: [
      { id: 'selection:1', name: 'Frame', type: 'FRAME' },
      { id: 'selection:2', name: 'Button', type: 'INSTANCE' },
    ],
    checkState,
    views,
    resolveNodePath: (node) => `Page/${node.name}`,
    resolveComponentKey: async () => {
      componentKeyReads += 1;
      return 'selection-component-key';
    },
    resolveStyleResource: () => null,
    resolveTokenResource: () => null,
  });

  assert.equal(componentKeyReads, 1);
  assert.equal(report.summary.scannedComponents, 3);
  assert.equal(report.scan.selection[0].componentKey, null);
  assert.equal(
    report.scan.selection[1].componentKey,
    'selection-component-key',
  );
  assert.equal(report.categories.localComponents.count, 1);
  assert.equal(report.categories.updates.count, 1);
  assert.equal(agentReport.reportId, `${report.reportId}:agent`);

  console.log('Audit result orchestration regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
