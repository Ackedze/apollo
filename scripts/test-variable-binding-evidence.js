const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule(entry, name) {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-${name}-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, entry)],
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

const GRID_COLLECTION_ID = 'VariableCollectionId:76532:102337';
const GRID_MARGIN_ID = 'VariableID:76532:102340';
const GUTTER_ID = 'VariableID:76532:102341';
const REMOTE_GUTTER_ID = 'VariableID:gutter-key/76532:102341';
const BACKGROUND_COLLECTION_ID = 'VariableCollectionId:background';

function variableMetadata(bindingId) {
  if (bindingId === GRID_MARGIN_ID) {
    return {
      variableKey: 'grid-margin-key',
      variableName: 'Grid/Grid Margin',
      collectionId: GRID_COLLECTION_ID,
      collectionName: '[D] Grid & Cols',
      modeNames: {
        '76532:0': '1600+',
        '76532:2': '1280',
        '76532:3': '1024',
      },
    };
  }
  if (bindingId === GUTTER_ID || bindingId === REMOTE_GUTTER_ID) {
    return {
      variableKey: 'gutter-key',
      variableName: 'Grid/Gutter',
      collectionId: GRID_COLLECTION_ID,
      collectionName: '[D] Grid & Cols',
      modeNames: {
        '76532:0': '1600+',
        '76532:3': '1024',
      },
    };
  }
  if (bindingId === 'VariableID:wrong-spacing') {
    return {
      variableKey: 'wrong-spacing-key',
      variableName: 'Grid/Wrong',
      collectionId: GRID_COLLECTION_ID,
      collectionName: '[D] Grid & Cols',
      modeNames: { '76532:2': '1280' },
    };
  }
  return null;
}

function modeContext(modeId = '76532:3') {
  return [
    {
      collectionId: GRID_COLLECTION_ID,
      resolvedModeId: modeId,
      explicitModeId: modeId,
      explicitOwnerNodeId: 'page-frame',
      explicitOwnerName: 'Page frame',
      explicitOwnerPath: 'Page / Page frame',
    },
  ];
}

function layoutNode({
  id,
  parentId = null,
  nodeId = String(id),
  path,
  name,
  type = 'FRAME',
  padding = { top: 0, right: 0, bottom: 0, left: 0 },
  paddingTokens = null,
  itemSpacing = 0,
  itemSpacingToken = null,
  componentKey = null,
  variableModes = undefined,
}) {
  return {
    id,
    parentId,
    nodeId,
    path,
    type,
    name,
    visible: true,
    opacity: 1,
    radius: 0,
    layout: {
      direction: 'V',
      padding,
      paddingTokens,
      itemSpacing,
      itemSpacingToken,
    },
    componentInstance: componentKey
      ? { componentKey, variantProperties: {} }
      : null,
    variableModes,
  };
}

function corporateStructures(actualMarginToken = GRID_MARGIN_ID) {
  const actual = [
    layoutNode({
      id: 1,
      nodeId: 'corporate-instance',
      path: '[D] CorporateContent',
      name: '[D] CorporateContent',
      type: 'INSTANCE',
      padding: { top: 40, right: 30, bottom: 64, left: 30 },
      paddingTokens: {
        top: null,
        right: actualMarginToken,
        bottom: null,
        left: actualMarginToken,
      },
      componentKey: 'corporate-content-key',
      variableModes: modeContext('76532:2'),
    }),
  ];
  const reference = [
    layoutNode({
      id: 1,
      path: '[D] CorporateContent',
      name: '[D] CorporateContent',
      type: 'COMPONENT',
      padding: { top: 40, right: 52, bottom: 64, left: 52 },
      paddingTokens: {
        top: null,
        right: GRID_MARGIN_ID,
        bottom: null,
        left: GRID_MARGIN_ID,
      },
      componentKey: null,
    }),
  ];
  return { actual, reference };
}

function sectionStructures(actualGutterToken = REMOTE_GUTTER_ID) {
  const actual = [
    layoutNode({
      id: 1,
      nodeId: 'section-instance',
      path: '[D] Section',
      name: '[D] Section',
      type: 'INSTANCE',
      itemSpacing: 16,
      itemSpacingToken: actualGutterToken,
      componentKey: 'section-key',
      variableModes: modeContext('76532:3'),
    }),
    layoutNode({ id: 2, parentId: 1, path: '[D] Section / Content', name: 'Content' }),
    layoutNode({ id: 3, parentId: 1, path: '[D] Section / Isle', name: 'Isle' }),
  ];
  const reference = [
    layoutNode({
      id: 1,
      path: '[D] Section',
      name: '[D] Section',
      type: 'COMPONENT',
      itemSpacing: 24,
      itemSpacingToken: GUTTER_ID,
    }),
    layoutNode({ id: 2, parentId: 1, path: '[D] Section / Content', name: 'Content' }),
    layoutNode({ id: 3, parentId: 1, path: '[D] Section / Isle', name: 'Isle' }),
  ];
  return { actual, reference };
}

function createStatsItem(diff) {
  return {
    id: 'corporate-instance',
    name: '[D] CorporateContent',
    nodeType: 'INSTANCE',
    pageName: 'Page',
    pathSegments: [],
    fullPath: 'Page / [D] CorporateContent',
    relevance: 'current',
    librarySource: 'Web _ Corp Components',
    librarySourceFile: 'CorporateContent.json',
    isLocal: false,
    componentKey: 'corporate-content-key',
    diffs: [diff],
    comparisonIssues: [],
    reference: {
      key: 'corporate-content-key',
      names: ['[D] CorporateContent'],
      name: '[D] CorporateContent',
      displayName: '[D] CorporateContent',
      status: 'current',
      source: 'Web _ Corp Components',
      sourceFile: 'CorporateContent.json',
    },
  };
}

function main() {
  const { diffStructures } = loadModule('../src/structure/diff.ts', 'binding-diff');

  const corporate = corporateStructures();
  const corporateResult = diffStructures(corporate.actual, corporate.reference, {
    resolveVariableMetadata: variableMetadata,
  });
  assert.equal(
    corporateResult.diffs.some((diff) =>
      diff.details?.property?.startsWith('layout.padding.'),
    ),
    false,
    'The same Grid Margin binding must suppress 52 -> 30 mode-driven padding diffs',
  );

  const section = sectionStructures();
  const sectionResult = diffStructures(section.actual, section.reference, {
    resolveVariableMetadata: variableMetadata,
  });
  assert.equal(
    sectionResult.diffs.some(
      (diff) => diff.details?.property === 'layout.itemSpacing',
    ),
    false,
    'Equivalent local/remote Gutter bindings must suppress 24 -> 16 mode-driven gap diffs',
  );

  const wrong = corporateStructures('VariableID:wrong-spacing');
  const wrongResult = diffStructures(wrong.actual, wrong.reference, {
    resolveVariableMetadata: variableMetadata,
  });
  const wrongDiff = wrongResult.diffs.find(
    (diff) => diff.details?.property === 'layout.padding.right',
  );
  assert.ok(wrongDiff, 'A wrong variable must remain visible as a padding diff');
  assert.equal(wrongDiff.details.bindingStatus, 'different-binding');
  assert.equal(wrongDiff.details.reference.binding.collectionName, '[D] Grid & Cols');
  assert.equal(wrongDiff.details.actual.binding.collectionName, '[D] Grid & Cols');
  assert.equal(wrongDiff.details.actual.binding.resolvedModeName, '1280');
  assert.equal(wrongDiff.details.actual.binding.modeSource, 'inherited');
  assert.equal(wrongDiff.details.actual.binding.modeOwnerName, 'Page frame');
  assert.equal(wrongDiff.details.reference.resourceType, 'token');
  assert.equal(wrongDiff.details.actual.resourceType, 'token');

  const unbound = corporateStructures(null);
  const unboundResult = diffStructures(unbound.actual, unbound.reference, {
    resolveVariableMetadata: variableMetadata,
  });
  const unboundDiff = unboundResult.diffs.find(
    (diff) => diff.details?.property === 'layout.padding.right',
  );
  assert.ok(unboundDiff, 'An unbound numeric value must remain visible');
  assert.equal(unboundDiff.details.bindingStatus, 'unbound');
  assert.equal(unboundDiff.details.actual.binding, null);
  assert.match(unboundDiff.message, /^Переменная padding right:/);

  const detachedSameValue = corporateStructures(null);
  detachedSameValue.actual[0].layout.padding.right = 52;
  detachedSameValue.actual[0].layout.padding.left = 52;
  const detachedSameValueResult = diffStructures(
    detachedSameValue.actual,
    detachedSameValue.reference,
    { resolveVariableMetadata: variableMetadata },
  );
  assert.ok(
    detachedSameValueResult.diffs.some(
      (diff) =>
        diff.details?.property === 'layout.padding.left' &&
        diff.details?.bindingStatus === 'unbound',
    ),
    'Detaching a variable must remain an error when the raw value still matches the reference',
  );

  const plainRadiusActual = [
    Object.assign({}, corporate.actual[0], {
      radius: 2,
      radiusToken: null,
      layout: null,
    }),
  ];
  const plainRadiusReference = [
    Object.assign({}, corporate.reference[0], {
      radius: 0,
      radiusToken: null,
      layout: null,
    }),
  ];
  const plainRadiusDiff = diffStructures(
    plainRadiusActual,
    plainRadiusReference,
    { resolveVariableMetadata: variableMetadata },
  ).diffs.find((diff) => diff.details?.property === 'radius');
  assert.ok(plainRadiusDiff);
  assert.equal(
    plainRadiusDiff.details.bindingStatus,
    null,
    'A property that is unbound in both actual and reference is a value diff, not a detached-variable error',
  );

  globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__ = [
    {
      componentKey: 'web-corp.corporate-content',
      aliases: ['[D] CorporateContent'],
      figmaKeys: ['corporate-content-key'],
      rulesFile: {
        componentKey: 'web-corp.corporate-content',
        rules: [
          {
            ruleId: 'component:web-corp.corporate-content.spacing-uses-grid-cols-mode',
            severity: 'error',
            source: 'pattern-link',
            appliesTo: 'layout.padding.*|variables.Grid & Cols',
            checkType: 'deterministic',
            matchKind: 'exact_component_rule',
            target: {
              components: ['[D] CorporateContent'],
              layer: 'root',
            },
            requiredConfiguration: {
              desktopCollection: '[D] Grid & Cols',
              manualPaddingAllowed: false,
            },
            ruleText: 'CorporateContent padding must use Grid & Cols.',
          },
          {
            ruleId: 'component:web-corp.corporate-content.page-background-modes-only',
            severity: 'error',
            source: 'pattern-link',
            appliesTo: 'variables.BackgroundPlate Color.mode',
            checkType: 'deterministic',
            matchKind: 'exact_component_rule',
            target: {
              components: ['[D] CorporateContent'],
            },
            requiredConfiguration: {
              allowedModes: ['base-bg-alt (grey)', 'base-bg (white)'],
              prohibitedModes: ['modal-bg-alt (grey)', 'modal-bg (white)'],
            },
            ruleText: 'CorporateContent must use a page background mode.',
          },
        ],
      },
    },
  ];
  globalThis.__APOLLO_TEST_COMPONENT_NAME_BY_KEY__ = {
    'corporate-content-key': '[D] CorporateContent',
  };

  const componentRules = loadModule(
    '../src/contracts/componentRules.ts',
    'binding-component-rules',
  );
  const assessedUnboundDiff =
    componentRules.applyVariableBindingAssessment(unboundDiff);
  assert.equal(assessedUnboundDiff.assessment.verdict, 'violation');
  assert.equal(
    assessedUnboundDiff.assessment.ruleId,
    'component:web-corp.corporate-content.spacing-uses-grid-cols-mode',
  );
  assert.equal(
    componentRules.hasVariableModeRules(
      'corporate-content-key',
      ['[D] CorporateContent'],
    ),
    true,
  );
  const prohibitedModeNode = layoutNode({
    id: 20,
    nodeId: 'corporate-mode-instance',
    path: '[D] CorporateContent',
    name: '[D] CorporateContent',
    type: 'INSTANCE',
    componentKey: 'corporate-content-key',
    variableModes: [
      {
        collectionId: BACKGROUND_COLLECTION_ID,
        resolvedModeId: 'background:modal',
        explicitModeId: 'background:modal',
        explicitOwnerNodeId: 'page-frame',
        explicitOwnerName: 'Page frame',
        explicitOwnerPath: 'Page / Page frame',
      },
    ],
  });
  const collectionMetadata = (collectionId) =>
    collectionId === BACKGROUND_COLLECTION_ID
      ? {
          collectionId,
          collectionName: 'BackgroundPlate Color',
          modeNames: {
            'background:base': 'base-bg (white)',
            'background:modal': 'modal-bg (white)',
          },
        }
      : null;
  const modeDiffs = componentRules.createVariableModeRuleDiffs(
    [prohibitedModeNode],
    [],
    collectionMetadata,
  );
  assert.equal(modeDiffs.length, 1);
  assert.equal(
    modeDiffs[0].details.property,
    'variables.BackgroundPlate Color.mode',
  );
  assert.equal(modeDiffs[0].details.actual.value, 'modal-bg (white)');
  assert.equal(modeDiffs[0].details.variableMode.modeSource, 'inherited');
  assert.equal(modeDiffs[0].details.variableMode.modeOwnerName, 'Page frame');

  const allowedModeNode = Object.assign({}, prohibitedModeNode, {
    variableModes: [
      Object.assign({}, prohibitedModeNode.variableModes[0], {
        resolvedModeId: 'background:base',
        explicitModeId: 'background:base',
      }),
    ],
  });
  assert.equal(
    componentRules.createVariableModeRuleDiffs(
      [allowedModeNode],
      [],
      collectionMetadata,
    ).length,
    0,
  );

  const { buildApolloAgentReport, buildApolloStatsReport } = loadModule(
    '../src/stats/report.ts',
    'binding-report',
  );
  const item = createStatsItem(unboundDiff);
  const modeItem = createStatsItem(modeDiffs[0]);
  const report = buildApolloStatsReport({
    pluginVersion: '0.1.50',
    user: { id: 'user', name: 'User' },
    figma: { fileKey: 'file', fileName: 'File', editorType: 'figma' },
    scan: {
      channel: 'Desktop',
      startedAt: new Date('2026-07-15T10:00:00.000Z'),
      finishedAt: new Date('2026-07-15T10:00:01.000Z'),
      selection: [],
      settings: { shellAuditEnabled: false },
      scannedComponents: 1,
    },
    views: {
      deprecatedComponents: [],
      deprecatedStyles: [],
      customStyles: [],
      updates: [],
      customizations: [item, modeItem],
      localComponents: [],
      detachedComponents: [],
      presets: [],
      technicalComponents: [],
      currentComponents: [],
      wrongChannel: [],
      themization: [],
    },
    resolveStyleResource: () => null,
    resolveTokenResource: (id, displayName) => ({
      type: 'token',
      name: displayName ?? id,
      key: variableMetadata(id)?.variableKey ?? id,
      id,
      library: variableMetadata(id)?.collectionName ?? null,
      sourceFile: 'Web _ Corp Components.json',
    }),
  });
  const statsChange = report.categories.customizations.items[0].changes[0];
  assert.equal(statsChange.bindingStatus, 'unbound');
  assert.equal(statsChange.reference.binding.name, 'Grid/Grid Margin');
  assert.equal(statsChange.reference.resource.library, '[D] Grid & Cols');
  assert.equal(statsChange.assessment.verdict, 'violation');
  assert.equal(
    statsChange.assessment.ruleId,
    'component:web-corp.corporate-content.spacing-uses-grid-cols-mode',
  );

  const agentReport = buildApolloAgentReport(report);
  const agentChange = agentReport.findings
    .flatMap((finding) => finding.changes ?? [])
    .find((change) => change.property === 'layout.padding.right');
  assert.ok(agentChange);
  assert.equal(agentChange.bindingStatus, 'unbound');
  assert.equal(agentChange.referenceBinding.collectionName, '[D] Grid & Cols');
  assert.equal(agentChange.actualBinding, null);
  const agentModeChange = agentReport.findings
    .flatMap((finding) => finding.changes ?? [])
    .find(
      (change) =>
        change.property === 'variables.BackgroundPlate Color.mode',
    );
  assert.ok(agentModeChange);
  assert.equal(agentModeChange.variableMode.resolvedModeName, 'modal-bg (white)');
  assert.equal(agentModeChange.variableMode.modeOwnerPath, 'Page / Page frame');
  assert.ok(
    agentReport.guidance.notes.some((note) =>
      note.includes('Never infer that a numeric'),
    ),
  );

  console.log('Variable binding evidence regression checks passed');
}

main();
