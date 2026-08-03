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
  globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__ = [
    {
      componentKey: 'web-core.button',
      aliases: ['[D] Button'],
      rulesFile: {
        componentKey: 'web-core.button',
        rules: [
          {
            ruleId: 'component:web-core.button.label-text-style-locked',
            severity: 'error',
            source: 'component-contract',
            ruleKind: 'design-rule',
            severityScope: 'design',
            appliesTo: 'styles.text',
            checkType: 'deterministic',
            matchKind: 'exact_component_rule',
            target: {
              component: '[D] Button',
              layers: ['Label', 'Hint'],
            },
            ruleText:
              'Не меняй вручную text styles на Button Label или Hint. Text style определяется состоянием Button component и должен совпадать с effective component baseline.',
            remediation:
              'Сбрось layer text style к effective Button baseline.',
          },
        ],
      },
    },
  ];
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
  const buttonTextStyleCustomization = componentItem({
    id: '1:4',
    name: '[D] TitleView',
    componentKey: 'title-view-key',
    librarySource: 'Web _ Corp Components',
    librarySourceFile: 'web/components/web-corp/Web _ Corp Components -- TitleView.json',
    reference: {
      key: 'title-view-family-key',
      names: ['[D] TitleView'],
      name: '[D] TitleView',
      displayName: '[D] TitleView',
      status: 'current',
      source: 'Web _ Corp Components',
      sourceFile: 'web/components/web-corp/Web _ Corp Components -- TitleView.json',
    },
    diffs: [
      {
        message:
          'Стиль текст: Action/16–20 Component Primary → Action/18–24 Primary Large',
        nodePath:
          'View=xLarge, Skeleton=False / MainContent / Button group / [D] Button / Text / Label',
        nodeName: 'Label',
        nodeId: '1:5',
        visible: true,
        diffKind: 'text-style',
        details: {
          property: 'styles.text',
          reference: {
            value: 'Action/16–20 Component Primary',
            resourceType: 'style',
            resourceId: 'S:button-label-primary,1:1',
            displayName: 'Action/16–20 Component Primary',
          },
          actual: {
            value: 'Action/18–24 Primary Large',
            resourceType: 'style',
            resourceId: 'S:button-label-large,1:2',
            displayName: 'Action/18–24 Primary Large',
          },
        },
        assessment: {
          verdict: 'unknown',
          source: 'standalone-reference',
          reasonCode: 'no-contextual-expectation',
          ruleId: null,
          message: 'Контекстное правило не найдено',
          remediation: null,
        },
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
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
  const tokenCustomization = componentItem({
    id: '1:6',
    name: 'Operation',
    componentKey: 'operation-key',
    librarySource: 'Web _ Corp Components',
    librarySourceFile:
      'web/components/web-corp/Web _ Corp Components -- AmountStyles.json',
    reference: {
      key: 'operation-family-key',
      names: ['Operation'],
      name: 'Operation',
      displayName: 'Operation',
      status: 'current',
      source: 'Web _ Corp Components',
      sourceFile:
        'web/components/web-corp/Web _ Corp Components -- AmountStyles.json',
    },
    diffs: [
      {
        message:
          'fill: VariableID:53f842b1771349c5dca692351edfc422e8f081b5/3541:208 → text/positive',
        nodePath: 'Negative=False / Minus',
        nodeName: 'Minus',
        nodeId: '1:7',
        visible: true,
        diffKind: 'paint',
        details: {
          property: 'fill',
          reference: {
            value:
              'VariableID:53f842b1771349c5dca692351edfc422e8f081b5/3541:208',
            resourceType: 'token',
            resourceId:
              'VariableID:53f842b1771349c5dca692351edfc422e8f081b5/3541:208',
            displayName:
              'VariableID:53f842b1771349c5dca692351edfc422e8f081b5/3541:208',
          },
          actual: {
            value: 'text/positive',
            resourceType: 'token',
            resourceId:
              'VariableID:9d66b0fa6d4773da3b8edeb4136d3d309f676af9/3541:209',
            displayName: 'text/positive',
          },
        },
        assessment: {
          verdict: 'unknown',
          source: 'standalone-reference',
          reasonCode: 'no-contextual-expectation',
          ruleId: null,
          message: 'Контекстное правило не найдено',
          remediation: null,
        },
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
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
      startedAt: new Date(2026, 5, 6, 12, 0, 0, 0),
      finishedAt: new Date(2026, 5, 6, 12, 0, 1, 500),
      selection: [],
      settings: {
        shellAuditEnabled: false,
      },
      scannedComponents: 2,
    },
    views: {
      deprecatedComponents: [],
      deprecatedStyles: [],
      customStyles: [],
      updates: [],
      customizations: [
        customization,
        expectedCustomization,
        buttonTextStyleCustomization,
        tokenCustomization,
      ],
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
    resolveTokenResource: (id, displayName) => {
      const key = String(id).replace(/^VariableID:/, '').split('/')[0];
      return {
        type: 'token',
        name:
          key === '53f842b1771349c5dca692351edfc422e8f081b5'
            ? 'text/primary'
            : displayName,
        key,
        id,
        library: 'Interface Dynamic',
        sourceFile: '001 :: Interface Dynamic Colors',
      };
    },
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.scan.settings.shellAuditEnabled, false);
  assert.equal(report.user.slug, 'User-Name');
  assert.equal(report.summary.categoryCounts.currentComponents, 1);
  assert.equal(report.summary.categoryCounts.customizations, 4);
  assert.equal(report.summary.problemOccurrenceCount, 3);
  const change = report.categories.customizations.items[0].changes[0];
  assert.equal(change.node.id, '1:2');
  assert.equal(change.node.name, 'Label');
  assert.equal(change.node.path, 'Frame / [D] Tag / Label');
  assert.equal(change.property, 'styles.text');
  assert.equal(change.reference.resource.key, 'style-large');
  assert.equal(change.reference.resource.library, 'Web Typography');
  assert.equal(change.assessment.verdict, 'violation');
  assert.match(change.signature, /component:tag-key:text-style:styles\.text/);
  const buttonTextStyleChange =
    report.categories.customizations.items[2].changes[0];
  assert.equal(
    buttonTextStyleChange.assessment.ruleId,
    'component:web-core.button.label-text-style-locked',
  );
  assert.equal(buttonTextStyleChange.assessment.source, 'component-contract');
  assert.equal(buttonTextStyleChange.assessment.verdict, 'violation');
  assert.equal(buttonTextStyleChange.componentRules.length, 1);
  assert.equal(
    buttonTextStyleChange.componentRules[0].matchKind,
    'exact_component_rule',
  );

  const agentReport = buildApolloAgentReport(report);
  assert.equal(agentReport.schemaVersion, 1);
  assert.equal(agentReport.reportKind, 'apollo-agent-report');
  assert.equal(agentReport.scan.settings.shellAuditEnabled, false);
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
      note.includes('component state labels, not user-facing copy'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('variant.Type=Processing'),
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
      note.includes('exact_component_rule'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('severity=info'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('info-level'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('component rule explains classification'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('match_kind=no_rule'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('presets category is informational'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('Do not recommend replacing preset components'),
    ),
  );
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('Raw technical ids are preserved separately'),
    ),
  );
  assert.equal(agentReport.categorySummaries.customizations.totalCount, 4);
  assert.equal(agentReport.categorySummaries.customizations.includedCount, 3);
  assert.equal(agentReport.findings.length, 3);
  assert.equal(agentReport.findings[0].category, 'customizations');
  assert.equal(agentReport.findings[0].changes.length, 1);
  assert.equal(agentReport.findings[0].changes[0].node.name, 'Label');
  assert.equal(agentReport.findings[0].changes[0].assessment.verdict, 'violation');
  const agentButtonChange = agentReport.findings[1].changes[0];
  assert.equal(agentButtonChange.node.name, 'Label');
  assert.equal(
    agentButtonChange.assessment.ruleId,
    'component:web-core.button.label-text-style-locked',
  );
  assert.equal(agentButtonChange.componentRules.length, 1);
  assert.equal(agentButtonChange.componentRules[0].ruleKind, 'design-rule');
  const agentTokenChange = agentReport.findings[2].changes[0];
  assert.equal(agentTokenChange.node.name, 'Minus');
  assert.equal(agentTokenChange.referenceValue, 'text/primary');
  assert.equal(agentTokenChange.actualValue, 'text/positive');
  assert.equal(
    agentTokenChange.referenceRawValue,
    'VariableID:53f842b1771349c5dca692351edfc422e8f081b5/3541:208',
  );
  assert.equal(agentTokenChange.referenceDisplayValue, 'text/primary');

  console.log('Stats report regression checks passed');
}

main();
