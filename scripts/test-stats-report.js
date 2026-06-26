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
  const { buildApolloAgentReport, buildApolloStatsReport } = loadReportModule();
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
        assessment: {
          verdict: 'violation',
          source: 'catalog-host',
          reasonCode: 'differs-from-materialized-host-value',
          ruleId: null,
          message: 'Значение не соответствует структуре родительского компонента',
          remediation: null,
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
  const expectedCustomization = componentItem({
    id: '1:3',
    diffs: [
      {
        ...customization.diffs[0],
        assessment: {
          verdict: 'expected',
          source: 'catalog-host',
          reasonCode: 'matches-materialized-host-value',
          ruleId: null,
          message: 'Значение задано структурой родительского компонента',
          remediation: null,
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
      customizations: [customization, expectedCustomization],
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
  assert.equal(report.summary.categoryCounts.customizations, 2);
  assert.equal(report.summary.problemOccurrenceCount, 1);
  const change = report.categories.customizations.items[0].changes[0];
  assert.equal(change.node.id, '1:2');
  assert.equal(change.node.name, 'Label');
  assert.equal(change.node.path, 'Frame / [D] Tag / Label');
  assert.equal(change.property, 'styles.text');
  assert.equal(change.reference.resource.key, 'style-large');
  assert.equal(change.reference.resource.library, 'Web Typography');
  assert.equal(change.assessment.verdict, 'violation');
  assert.match(change.signature, /component:tag-key:text-style:styles\.text/);

  const agentReport = buildApolloAgentReport(report);
  assert.equal(agentReport.schemaVersion, 1);
  assert.equal(agentReport.reportKind, 'apollo-agent-report');
  assert.equal(agentReport.sourceReportId, report.reportId);
  assert.equal(
    agentReport.suggestedFileName,
    'User-Name_06-06-2026_12-00-01_agent.json',
  );
  assert.equal(agentReport.summary.omittedCurrentComponentCount, 1);
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('Variant/state changes'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('Do not invent usage rationale'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('assessment.ruleId is null'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('pattern name and link'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('raise severity only'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('anti-examples are not rules'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('match_kind=exact_rule'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('match_kind=no_rule'),
    ),
  );
  assert.equal(agentReport.categorySummaries.customizations.totalCount, 2);
  assert.equal(agentReport.categorySummaries.customizations.includedCount, 1);
  assert.equal(agentReport.findings.length, 1);
  assert.equal(agentReport.findings[0].category, 'customizations');
  assert.equal(agentReport.findings[0].changes.length, 1);
  assert.equal(agentReport.findings[0].changes[0].node.name, 'Label');
  assert.equal(agentReport.findings[0].changes[0].assessment.verdict, 'violation');

  console.log('Stats report regression checks passed');
}

main();
