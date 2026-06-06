const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadReportModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-stats-report-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/stats/report.ts')],
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

function componentItem(overrides = {}) {
  return {
    id: '1:1',
    name: '[D] Tag',
    nodeType: 'INSTANCE',
    pageName: 'Page 1',
    pathSegments: [],
    fullPath: 'Frame / [D] Tag',
    relevance: 'current',
    librarySource: 'Web :: Core',
    librarySourceFile: 'web/core/Tag.json',
    isLocal: false,
    componentKey: 'tag-key',
    diffs: [],
    comparisonIssues: [],
    reference: {
      key: 'tag-family-key',
      names: ['[D] Tag'],
      name: '[D] Tag',
      displayName: '[D] Tag',
      status: 'current',
      source: 'Web :: Core',
      sourceFile: 'web/core/Tag.json',
    },
    ...overrides,
  };
}

function main() {
  const { buildApolloStatsReport } = loadReportModule();
  const customization = componentItem({
    diffs: [
      {
        message: 'Стиль текст: Paragraph/L → Paragraph/S',
        nodePath: 'Frame / [D] Tag / Label',
        nodeName: 'Label',
        nodeId: '1:2',
        visible: true,
        diffKind: 'text-style',
        details: {
          property: 'styles.text',
          reference: {
            value: 'Paragraph/L',
            resourceType: 'style',
            resourceId: 'S:style-large,1:1',
            displayName: 'Paragraph/L',
          },
          actual: {
            value: 'Paragraph/S',
            resourceType: 'style',
            resourceId: 'S:style-small,1:2',
            displayName: 'Paragraph/S',
          },
        },
        context: {
          actualComponentKey: 'tag-key',
          referenceComponentKey: 'tag-key',
          referenceOrigin: 'host',
          actualNestedOwnerComponentKey: null,
          actualNestedOwnerPath: null,
          actualNestedOwnerRelativePath: null,
          nestedOwnerComponentKey: null,
          nestedOwnerComponentRole: null,
          nestedOwnerPath: null,
          nestedOwnerRelativePath: null,
        },
      },
    ],
  });

  const report = buildApolloStatsReport({
    pluginVersion: '0.1.0',
    user: { id: 'user-id', name: 'User Name' },
    figma: {
      fileKey: 'file-key',
      fileName: 'Stats test',
      editorType: 'figma',
    },
    scan: {
      channel: 'Desktop',
      startedAt: new Date('2026-06-06T09:00:00.000Z'),
      finishedAt: new Date('2026-06-06T09:00:01.500Z'),
      selection: [],
      scannedComponents: 2,
    },
    views: {
      deprecatedComponents: [],
      deprecatedStyles: [],
      customStyles: [],
      updates: [],
      customizations: [customization],
      localComponents: [],
      detachedComponents: [],
      presets: [],
      technicalComponents: [],
      currentComponents: [componentItem()],
      wrongChannel: [],
      themization: [],
    },
    resolveStyleResource: (id, displayName) => ({
      type: 'style',
      name: displayName,
      key: id.slice(2).split(',')[0],
      id,
      library: 'Web Typography',
      sourceFile: 'Typography.json',
    }),
    resolveTokenResource: () => null,
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.user.slug, 'User-Name');
  assert.equal(report.summary.categoryCounts.currentComponents, 1);
  assert.equal(report.summary.problemOccurrenceCount, 1);
  const change = report.categories.customizations.items[0].changes[0];
  assert.equal(change.property, 'styles.text');
  assert.equal(change.reference.resource.key, 'style-large');
  assert.equal(change.reference.resource.library, 'Web Typography');
  assert.match(change.signature, /component:tag-key:text-style:styles\.text/);

  console.log('Stats report regression checks passed');
}

main();
