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
    {
      componentKey: 'web-corp.background-plate',
      aliases: ['[D] BackgroundPlate'],
      rulesFile: {
        componentKey: 'web-corp.background-plate',
        rules: [
          {
            ruleId: 'component:web-corp.background-plate.border-stroke-align-is-fixed',
            severity: 'error',
            source: 'pattern-link',
            ruleKind: 'design-rule',
            severityScope: 'design',
            appliesTo: 'stroke.align|strokeAlign',
            checkType: 'deterministic',
            matchKind: 'exact_component_rule',
            conditions: {
              component: 'web-corp.background-plate',
              variant: { Type: 'Border' },
            },
            ruleText: 'Для Type=Border strokeAlign должен оставаться INSIDE.',
            remediation: 'Верните положение обводки в Inside.',
          },
          {
            ruleId:
              'component:web-corp.background-plate.slot-sizing-fill-width-hug-height',
            severity: 'error',
            source: 'pattern-link',
            ruleKind: 'design-rule',
            severityScope: 'design',
            appliesTo:
              'layout.sizing.horizontal|layout.sizing.vertical|layoutSizingHorizontal|layoutSizingVertical',
            checkType: 'deterministic',
            matchKind: 'exact_component_rule',
            target: {
              component: 'web-corp.background-plate',
              layers: ['[D] BackgroundPlateSlot / Slot'],
            },
            requiredValues: {
              'layout.sizing.horizontal': 'FILL',
              'layout.sizing.vertical': 'HUG',
            },
            ruleText: 'Slot должен использовать Fill по ширине и Hug по высоте.',
            remediation: 'Верните Slot ширину Fill и высоту Hug.',
          },
        ],
      },
    },
  ];
  globalThis.__APOLLO_TEST_REMOTE_AGENT_CONTEXTS__ = [
    {
      componentKey: 'web-corp.background-plate',
      summary: 'Surface component context',
      criticalBaselines: ['Slot width is Fill and height is Hug'],
      agentInstructions: ['Use exact component rules'],
      includedComponents: ['[D] BackgroundPlateSlot'],
      auditInterpretation: { baselinePolicy: 'effective' },
      overrideContext: null,
    },
    {
      componentKey: 'web-core.button',
      summary: 'Button component context',
      criticalBaselines: [],
      agentInstructions: [],
      includedComponents: ['[D] Button'],
      auditInterpretation: null,
      overrideContext: null,
    },
  ];
  globalThis.__APOLLO_TEST_REMOTE_AUDIT_PRESENTATIONS__ = [
    {
      componentKey: 'web-corp.background-plate',
      property: 'layout.sizing.horizontal',
      presentation: {
        scope: 'layer-property',
        groupTitle: 'Параметры слоя',
        displayName: 'Ширина',
        priority: 20,
        resetAction: 'reset-layer-properties',
        effectiveBaseline: 'composition-contract',
      },
    },
    {
      componentKey: 'web-core.button',
      property: 'styles.text',
      presentation: {
        scope: 'layer-property',
        groupTitle: 'Button layers',
        displayName: 'Button text style',
        priority: 30,
        resetAction: 'reset-layer-properties',
        effectiveBaseline: 'component-contract',
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
          actualNestedOwnerComponentKey: 'web-core.button',
          actualNestedOwnerPath:
            'View=xLarge, Skeleton=False / MainContent / Button group / [D] Button',
          actualNestedOwnerRelativePath: 'Text / Label',
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

  const strokeAlignCustomization = componentItem({
    id: '1:8',
    name: '[D] BackgroundPlate',
    componentKey: 'web-corp.background-plate',
    librarySource: 'Web _ Corp Components',
    librarySourceFile:
      'web/components/web-corp/Web _ Corp Components -- BackgroundPlate.json',
    reference: {
      key: 'web-corp.background-plate',
      names: ['[D] BackgroundPlate'],
      name: '[D] BackgroundPlate',
      displayName: '[D] BackgroundPlate',
      status: 'current',
      source: 'Web _ Corp Components',
      sourceFile:
        'web/components/web-corp/Web _ Corp Components -- BackgroundPlate.json',
    },
    diffs: [
      {
        message: 'Положение обводки: Inside → Center',
        nodePath: '[D] BackgroundPlate / Border',
        nodeName: 'Border',
        nodeId: '1:9',
        visible: true,
        diffKind: 'shape',
        details: {
          property: 'stroke.align',
          reference: { value: 'Inside' },
          actual: { value: 'Center' },
        },
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'host',
          actualNestedOwnerComponentKey: 'web-corp.background-plate',
          actualNestedOwnerPath: '[D] BackgroundPlate',
          actualNestedOwnerRelativePath: 'Border',
          nestedOwnerComponentKey: 'web-corp.background-plate',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: '[D] BackgroundPlate',
          nestedOwnerRelativePath: 'Border',
          actualVariantProperties: { Type: 'Border' },
          referenceVariantProperties: { Type: 'Border' },
        },
      },
    ],
  });

  const layoutSizingCustomization = componentItem({
    id: '1:10',
    name: '[D] BackgroundPlateSlot',
    componentKey: 'web-corp.background-plate',
    librarySource: 'Web _ Corp Components',
    librarySourceFile:
      'web/components/web-corp/Web _ Corp Components -- BackgroundPlate.json',
    reference: {
      key: 'web-corp.background-plate',
      names: ['[D] BackgroundPlateSlot'],
      name: '[D] BackgroundPlateSlot',
      displayName: '[D] BackgroundPlateSlot',
      status: 'current',
      source: 'Web _ Corp Components',
      sourceFile:
        'web/components/web-corp/Web _ Corp Components -- BackgroundPlate.json',
    },
    diffs: [
      {
        message: 'Ширина в auto-layout: Fill → Fixed',
        nodePath: '[D] BackgroundPlateSlot / Level=1 / Slot',
        nodeName: 'Slot',
        nodeId: '1:11',
        visible: true,
        diffKind: 'layout',
        details: {
          property: 'layout.sizing.horizontal',
          reference: { value: 'Fill' },
          actual: { value: 'Fixed' },
        },
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'host',
          actualNestedOwnerComponentKey: 'web-corp.background-plate',
          actualNestedOwnerPath: '[D] BackgroundPlateSlot',
          actualNestedOwnerRelativePath: 'Level=1 / Slot',
          nestedOwnerComponentKey: 'web-corp.background-plate',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: '[D] BackgroundPlateSlot',
          nestedOwnerRelativePath: 'Level=1 / Slot',
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
        strokeAlignCustomization,
        layoutSizingCustomization,
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
  assert.equal(report.summary.categoryCounts.customizations, 6);
  assert.equal(report.summary.problemOccurrenceCount, 5);
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
  const strokeAlignChange =
    report.categories.customizations.items[4].changes[0];
  assert.equal(strokeAlignChange.property, 'stroke.align');
  assert.equal(strokeAlignChange.reference.value, 'Inside');
  assert.equal(strokeAlignChange.actual.value, 'Center');
  assert.equal(strokeAlignChange.assessment.verdict, 'violation');
  assert.equal(
    strokeAlignChange.assessment.ruleId,
    'component:web-corp.background-plate.border-stroke-align-is-fixed',
  );
  const layoutSizingChange =
    report.categories.customizations.items[5].changes[0];
  assert.equal(layoutSizingChange.property, 'layout.sizing.horizontal');
  assert.equal(layoutSizingChange.reference.value, 'Fill');
  assert.equal(layoutSizingChange.actual.value, 'Fixed');
  assert.equal(layoutSizingChange.node.path, '[D] BackgroundPlateSlot / Level=1 / Slot');
  assert.equal(layoutSizingChange.assessment.verdict, 'violation');
  assert.equal(layoutSizingChange.presentation.groupTitle, 'Параметры слоя');
  assert.equal(layoutSizingChange.presentation.resetAction, 'reset-layer-properties');
  assert.equal(
    layoutSizingChange.assessment.ruleId,
    'component:web-corp.background-plate.slot-sizing-fill-width-hug-height',
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
  assert.equal(agentReport.categorySummaries.customizations.totalCount, 6);
  assert.equal(agentReport.categorySummaries.customizations.includedCount, 5);
  assert.equal(agentReport.findings.length, 5);
  assert.equal(agentReport.componentContexts.length, 2);
  const backgroundPlateContext = agentReport.componentContexts.find(
    (context) => context.componentKey === 'web-corp.background-plate',
  );
  assert.deepEqual(backgroundPlateContext.criticalBaselines, [
    'Slot width is Fill and height is Hug',
  ]);
  assert.equal(
    agentReport.componentContexts.some(
      (context) => context.componentKey === 'web-core.button',
    ),
    true,
    'Nested diff owners must contribute their agent context',
  );
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
  assert.equal(
    agentButtonChange.context.actualNestedOwnerComponentKey,
    'web-core.button',
  );
  assert.equal(agentButtonChange.presentation.groupTitle, 'Button layers');
  const agentTokenChange = agentReport.findings[2].changes[0];
  assert.equal(agentTokenChange.node.name, 'Minus');
  assert.equal(agentTokenChange.referenceValue, 'text/primary');
  assert.equal(agentTokenChange.actualValue, 'text/positive');
  assert.equal(
    agentTokenChange.referenceRawValue,
    'VariableID:53f842b1771349c5dca692351edfc422e8f081b5/3541:208',
  );
  assert.equal(agentTokenChange.referenceDisplayValue, 'text/primary');
  const agentStrokeAlignChange = agentReport.findings[3].changes[0];
  assert.equal(agentStrokeAlignChange.node.name, 'Border');
  assert.equal(agentStrokeAlignChange.property, 'stroke.align');
  assert.equal(agentStrokeAlignChange.referenceValue, 'Inside');
  assert.equal(agentStrokeAlignChange.actualValue, 'Center');
  assert.equal(
    agentStrokeAlignChange.assessment.ruleId,
    'component:web-corp.background-plate.border-stroke-align-is-fixed',
  );
  const agentLayoutSizingChange = agentReport.findings[4].changes[0];
  assert.equal(agentLayoutSizingChange.node.name, 'Slot');
  assert.equal(agentLayoutSizingChange.node.path, '[D] BackgroundPlateSlot / Level=1 / Slot');
  assert.equal(agentLayoutSizingChange.property, 'layout.sizing.horizontal');
  assert.equal(agentLayoutSizingChange.referenceValue, 'Fill');
  assert.equal(agentLayoutSizingChange.actualValue, 'Fixed');
  assert.equal(agentLayoutSizingChange.presentation.displayName, 'Ширина');
  assert.equal(
    agentLayoutSizingChange.assessment.ruleId,
    'component:web-corp.background-plate.slot-sizing-fill-width-hug-height',
  );

  console.log('Stats report regression checks passed');
}

main();
