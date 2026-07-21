const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule(
  entry = '../src/examples/generationExampleCandidate.ts',
  name = 'generation-example',
) {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-${name}-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, entry),
    ],
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

function makeSnapshot() {
  return [
    {
      id: 1,
      nodeId: '1:1',
      parentId: null,
      path: 'Example',
      type: 'FRAME',
      name: 'Example',
      visible: true,
      radius: null,
      layout: {
        width: 1280,
        height: 720,
        sizing: { horizontal: 'FIXED', vertical: 'FIXED' },
      },
      variableModes: [
        {
          collectionId: 'collection:grid',
          resolvedModeId: 'mode:1280',
          explicitModeId: 'mode:1280',
          explicitOwnerNodeId: '1:1',
          explicitOwnerName: 'Example',
          explicitOwnerPath: 'Example',
        },
      ],
    },
    {
      id: 2,
      nodeId: '1:2',
      parentId: 1,
      path: 'Example / Header',
      type: 'FRAME',
      name: 'Header',
      visible: true,
      radius: null,
      layout: {
        itemSpacing: 24,
        itemSpacingToken: 'VariableID:spacing-24',
      },
      variableModes: [
        {
          collectionId: 'collection:grid',
          resolvedModeId: 'mode:1280',
          explicitModeId: 'mode:1280',
          explicitOwnerNodeId: '1:1',
          explicitOwnerName: 'Example',
          explicitOwnerPath: 'Example',
        },
      ],
    },
    {
      id: 3,
      nodeId: '1:3',
      parentId: 2,
      path: 'Example / Header / [D] TitleView',
      type: 'INSTANCE',
      name: '[D] TitleView',
      visible: true,
      radius: null,
      componentInstance: {
        componentKey: 'title-view-figma-key',
        variantProperties: { View: 'xLarge' },
      },
    },
    {
      id: 4,
      nodeId: '1:4',
      parentId: 3,
      path: 'Example / Header / [D] TitleView / Internal',
      type: 'FRAME',
      name: 'Internal',
      visible: true,
      radius: null,
    },
    {
      id: 5,
      nodeId: '1:5',
      parentId: 4,
      path: 'Example / Header / [D] TitleView / Internal / [D] Button',
      type: 'INSTANCE',
      name: '[D] Button',
      visible: true,
      radius: null,
      componentInstance: {
        componentKey: 'button-figma-key',
        variantProperties: { Size: '56' },
      },
    },
    {
      id: 6,
      nodeId: '1:6',
      parentId: 2,
      path: 'Example / Header / Product title',
      type: 'TEXT',
      name: 'Product title',
      visible: true,
      radius: null,
      text: { characters: 'Создать платёж' },
      styles: { text: { styleKey: 'text-style-key' } },
    },
  ];
}

function emptyCategory() {
  return { count: 0, items: [] };
}

function makeReport() {
  return {
    reportId: 'report-1',
    generatedAt: '2026-07-21T00:00:00.000Z',
    plugin: { name: 'Apollo', version: '0.1.61' },
    scan: {
      channel: 'Desktop',
      selection: [{ nodeId: '1:1' }],
    },
    summary: {
      problemOccurrenceCount: 1,
      categoryCounts: {
        deprecatedComponents: 0,
        deprecatedStyles: 0,
        customStyles: 0,
        updates: 0,
        customizations: 1,
        localComponents: 0,
        detachedComponents: 0,
        presets: 0,
        technicalComponents: 0,
        currentComponents: 2,
        wrongChannel: 0,
        themization: 0,
      },
    },
    categories: {
      deprecatedComponents: emptyCategory(),
      deprecatedStyles: emptyCategory(),
      customStyles: emptyCategory(),
      updates: emptyCategory(),
      customizations: {
        count: 1,
        items: [
          {
            comparisonIssues: [],
            changes: [
              { assessment: { verdict: 'allowed' } },
              { assessment: { verdict: 'expected' } },
            ],
          },
        ],
      },
      localComponents: emptyCategory(),
      detachedComponents: emptyCategory(),
      presets: emptyCategory(),
      technicalComponents: emptyCategory(),
      currentComponents: emptyCategory(),
      wrongChannel: emptyCategory(),
      themization: emptyCategory(),
    },
  };
}

function makeInput(includeTextContent, auditEvidence) {
  return {
    pluginVersion: '0.1.61',
    capturedAt: '2026-07-21T00:01:00.000Z',
    options: {
      exampleId: 'payments.create-form',
      exampleSetId: 'payments',
      breakpointLabel: '1280',
      title: 'Форма создания платежа',
      pageType: 'form',
      platform: 'desktop',
      exampleKind: 'golden',
      includeTextContent,
      sourceFigmaUrl: null,
    },
    source: {
      fileKey: 'file-key',
      fileName: 'AI Workshop',
      editorType: 'figma',
      pageName: 'Examples',
      rootNodeId: '1:1',
      rootNodeName: 'Example',
      figmaLink: 'https://www.figma.com/design/file-key?node-id=1-1',
    },
    snapshot: makeSnapshot(),
    auditEvidence,
    resolveComponent: (key) => ({
      referenceKind:
        key === 'title-view-figma-key'
          ? 'contract-package'
          : 'catalog-resource',
      packageKey: key === 'title-view-figma-key' ? 'web-corp.title-view' : null,
      name: key === 'title-view-figma-key' ? '[D] TitleView' : '[D] Button',
      library: 'Web _ Corp Components',
      sourceFile: key === 'title-view-figma-key' ? 'TitleView.json' : 'Button.json',
      platform: 'Desktop',
      role: 'Main',
    }),
    resolveVariable: (id) => ({
      name: id === 'VariableID:spacing-24' ? 'Spacing/24' : id,
      collectionName: 'Spacing',
    }),
    resolveVariableCollection: () => ({
      collectionName: 'Grid & Cols',
      modeNames: { 'mode:1280': '1280' },
    }),
  };
}

function main() {
  const {
    auditEvidenceMatchesCapture,
    buildGenerationExampleCandidate,
    createGenerationExampleAuditEvidence,
    getGenerationExampleCandidateFileName,
  } = loadModule();
  const {
    isFigmaSourceUrl,
    resolveGenerationExampleSourceIdentity,
  } = loadModule(
    '../src/examples/generationExampleSource.ts',
    'generation-example-source',
  );

  assert.equal(
    isFigmaSourceUrl('https://www.figma.com/design/file-key/Example'),
    true,
  );
  assert.deepEqual(
    resolveGenerationExampleSourceIdentity(
      '12:34',
      null,
      'https://www.figma.com/design/file-key/Example?node-id=1-2',
    ),
    {
      fileKey: 'file-key',
      figmaLink:
        'https://www.figma.com/design/file-key/Example?node-id=12-34',
    },
  );
  assert.deepEqual(
    resolveGenerationExampleSourceIdentity(
      '12:34',
      '',
      'https://www.figma.com/design/file-key/Example',
    ),
    {
      fileKey: 'file-key',
      figmaLink:
        'https://www.figma.com/design/file-key/Example?node-id=12-34',
    },
  );

  const evidence = createGenerationExampleAuditEvidence(makeReport());
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.allowedCount, 1);
  assert.equal(evidence.expectedCount, 1);
  assert.equal(evidence.problemOccurrenceCount, 1);
  assert.equal(evidence.categoryCounts.customizations, 1);
  assert.equal(
    auditEvidenceMatchesCapture(evidence, ['1:1'], 'desktop'),
    true,
  );
  assert.equal(
    auditEvidenceMatchesCapture(evidence, ['1:1'], 'mobile-web'),
    false,
  );

  const candidate = buildGenerationExampleCandidate(makeInput(false, evidence));
  assert.equal(
    candidate.schemaVersion,
    'apollo.generation-example-candidate.v2',
  );
  assert.equal(candidate.metadata.status, 'runtime-candidate');
  assert.equal(candidate.metadata.requiresManualReview, true);
  assert.equal(candidate.metadata.responsive.exampleSetId, 'payments');
  assert.equal(candidate.metadata.responsive.breakpointLabel, '1280');
  assert.equal(candidate.runtime.dimensions.viewport.height, 720);
  assert.equal(candidate.runtime.dimensions.semantics.rootHeightKind, 'viewport');
  assert.equal(candidate.runtime.validation.status, 'passed');
  assert.equal(candidate.runtime.capture.nodes.length, 4);
  assert.deepEqual(
    candidate.runtime.capture.nodes.map((node) => node.id),
    [1, 2, 3, 5],
  );
  assert.equal(candidate.runtime.capture.nodes[3].parentId, 3);
  assert.equal(
    candidate.runtime.capture.nodes[1].bindings.itemSpacing.name,
    'Spacing/24',
  );
  assert.equal(
    candidate.runtime.capture.resources.variableModeContexts[0].resolvedModeName,
    '1280',
  );
  assert.deepEqual(
    candidate.runtime.capture.nodes[0].variableModeContextIds,
    candidate.runtime.capture.nodes[1].variableModeContextIds,
  );
  assert.equal(
    candidate.runtime.capture.resources.variableModeContexts.length,
    1,
  );
  assert.deepEqual(candidate.runtime.capture.contentSamples, []);
  assert.equal(candidate.runtime.capture.resources.components.length, 2);
  assert.equal(
    candidate.runtime.capture.statistics.contractPackageCount,
    1,
  );
  assert.equal(
    candidate.runtime.capture.statistics.catalogResourceCount,
    1,
  );
  assert.equal(
    candidate.runtime.capture.statistics.unresolvedComponentCount,
    0,
  );
  assert.equal(
    candidate.runtime.warnings.some((warning) =>
      warning.includes('canonical package key'),
    ),
    false,
    'Catalog resources must not be reported as unresolved contract packages',
  );
  assert.equal(
    getGenerationExampleCandidateFileName('payments.create-form'),
    'payments.create-form.generation-example-candidate.json',
  );

  const withText = buildGenerationExampleCandidate(makeInput(true, null));
  assert.equal(withText.runtime.capture.contentSamples.length, 1);
  assert.equal(
    withText.runtime.capture.contentSamples[0].value,
    'Создать платёж',
  );
  assert.equal(withText.runtime.validation.status, 'not-run');

  const contentHeightInput = makeInput(false, null);
  contentHeightInput.snapshot[0].layout.sizing.vertical = 'HUG';
  contentHeightInput.snapshot[0].layout.height = 2200;
  const contentHeightCandidate = buildGenerationExampleCandidate(
    contentHeightInput,
  );
  assert.equal(contentHeightCandidate.runtime.dimensions.viewport.height, null);
  assert.equal(
    contentHeightCandidate.runtime.dimensions.semantics.rootHeightKind,
    'content',
  );

  const blockedReport = makeReport();
  blockedReport.categories.localComponents.count = 2;
  blockedReport.summary.problemOccurrenceCount = 3;
  blockedReport.summary.categoryCounts.localComponents = 2;
  const blockedEvidence = createGenerationExampleAuditEvidence(blockedReport);
  assert.equal(blockedEvidence.status, 'blocked');
  assert.equal(blockedEvidence.blockingOccurrenceCount, 2);
  assert.equal(blockedEvidence.categoryCounts.localComponents, 2);

  assert.throws(
    () =>
      buildGenerationExampleCandidate({
        ...makeInput(false, null),
        options: {
          ...makeInput(false, null).options,
          exampleId: 'Невалидный ID',
        },
      }),
    /ID примера/,
  );
  assert.throws(
    () =>
      buildGenerationExampleCandidate({
        ...makeInput(false, null),
        options: {
          ...makeInput(false, null).options,
          sourceFigmaUrl: 'https://example.com/not-figma',
        },
      }),
    /Ссылка на источник/,
  );

  console.log('Generation example candidate regression checks passed');
}

main();
