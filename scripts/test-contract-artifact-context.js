const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule(entryPoint) {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-contract-context-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, entryPoint)],
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

function main() {
  const { compactAgentContext, compactExamples, resolveAuditPresentation } =
    loadModule('../src/contracts/artifactContext.ts');
  const { compilePublicArtifact, getPublicArtifactDiagnostics } =
    loadModule('../src/contracts/publicArtifact.ts');

  const context = compactAgentContext(
    {
      componentKey: 'web-corp.background-plate',
      includedComponents: [
        { name: '[D] BackgroundPlateSlot', key: 'slot-key' },
        { name: '[M] BackgroundPlateSlot', key: 'mobile-slot-key' },
      ],
      generated: {
        auditInterpretation: { baselinePolicy: 'effective' },
      },
      manual: {
        summary: 'Surface component context',
        criticalBaselines: ['Width is Fill', 'Height is Hug'],
        agentInstructions: ['Use exact rules'],
      },
    },
    'fallback',
    {
      resetModel: {
        componentProperties: ['variant.*'],
        layerProperties: ['layout.*'],
        dependencyPolicy: 'Use effective baseline',
      },
      publicApi: { preferred: '[D] BackgroundPlateSlot' },
    },
  );
  assert.equal(
    context.componentKey,
    'fallback',
    'The canonical contract-index key must override a conflicting artifact key',
  );
  assert.equal(context.summary, 'Surface component context');
  assert.deepEqual(context.criticalBaselines, ['Width is Fill', 'Height is Hug']);
  assert.equal(context.auditInterpretation.baselinePolicy, 'effective');
  assert.deepEqual(context.overrideContext.resetModel.layerProperties, [
    'layout.*',
  ]);
  assert.deepEqual(context.includedComponents, [
    '[D] BackgroundPlateSlot',
    '[M] BackgroundPlateSlot',
  ]);

  const presentation = resolveAuditPresentation(
    {
      generated: {
        classification: [
          {
            match: { propertyPrefix: 'layout.' },
            scope: 'layer-property',
            groupTitle: 'Параметры слоя',
            priority: 20,
            resetAction: 'reset-layer-properties',
          },
          {
            match: { property: 'layout.sizing.horizontal' },
            displayName: 'Ширина',
            priority: 21,
          },
        ],
      },
    },
    'layout.sizing.horizontal',
  );
  assert.equal(presentation.displayName, 'Ширина');
  assert.equal(presentation.priority, 21);

  const examples = compactExamples({
    examples: [
      {
        exampleId: 'fill-width',
        title: 'Fill width',
        expectedAgent: { mustNotSay: ['Examples are rules'] },
      },
    ],
  });
  assert.equal(examples.length, 1);
  assert.deepEqual(examples[0].expectedAgent.mustNotSay, ['Examples are rules']);

  const ownedRules = {
    schemaVersion: 2,
    documentType: 'component-rules',
    metadata: {
      componentKey: 'web-corp.test',
      status: 'ready',
      ownershipSchema: 'apollo.artifact-ownership.v2',
    },
    generated: {
      rules: [{ ruleId: 'shared', severity: 'warning' }],
    },
    manual: {
      rules: [
        { ruleId: 'shared', severity: 'error' },
        { ruleId: 'expert', severity: 'info' },
      ],
    },
  };
  const publicRules = compilePublicArtifact(ownedRules);
  assert.deepEqual(publicRules.rules, [
    { ruleId: 'shared', severity: 'error' },
    { ruleId: 'expert', severity: 'info' },
  ]);
  assert.equal(publicRules.generated, undefined);
  assert.equal(publicRules.manual, undefined);
  assert.deepEqual(getPublicArtifactDiagnostics(ownedRules), {
    documentType: 'component-rules',
    storageSchema: 'ownership-v2',
    publicSchemaVersion: 1,
  });

  const ownedContext = compactAgentContext(
    {
      schemaVersion: 2,
      documentType: 'component-agent-context',
      metadata: {
        componentKey: 'web-corp.test',
        ownershipSchema: 'apollo.artifact-ownership.v2',
      },
      generated: {
        summary: { purpose: 'Generated summary' },
        components: [
          {
            name: '[D] Test',
            key: 'figma-test-key',
            description: 'Figma description',
            descriptionProvenance: 'figma',
          },
        ],
        auditInterpretation: {
          componentProperties: ['variant.*'],
        },
      },
      manual: {
        summary: 'Expert summary',
        agentInstructions: ['Preserve expert guidance'],
        componentSemantics: [
          {
            componentKey: 'figma-test-key',
            name: '[D] Test',
            purpose: 'Approved expert purpose',
            useWhen: ['Use in the approved scenario.'],
            doNotUseWhen: ['Do not use outside the approved scenario.'],
            relationship: 'Public root of the Test family.',
            status: 'approved',
            provenance: 'design-system-author',
          },
        ],
        auditInterpretation: {
          layerProperties: ['layout.*'],
        },
      },
      runtime: {
        semanticDescriptionCandidates: [
          {
            componentKey: 'figma-test-key',
            purpose: 'Unreviewed runtime candidate',
          },
        ],
      },
    },
    'web-corp.test',
  );
  assert.equal(ownedContext.summary, 'Expert summary');
  assert.deepEqual(ownedContext.includedComponents, ['[D] Test']);
  assert.deepEqual(ownedContext.agentInstructions, [
    'Preserve expert guidance',
  ]);
  assert.deepEqual(ownedContext.componentSemantics, [
    {
      componentKey: 'figma-test-key',
      name: '[D] Test',
      purpose: 'Approved expert purpose',
      useWhen: ['Use in the approved scenario.'],
      doNotUseWhen: ['Do not use outside the approved scenario.'],
      relationship: 'Public root of the Test family.',
      status: 'approved',
      provenance: 'design-system-author',
    },
  ]);
  assert.deepEqual(ownedContext.auditInterpretation, {
    componentProperties: ['variant.*'],
    layerProperties: ['layout.*'],
  });

  globalThis.__APOLLO_TEST_REMOTE_AGENT_CONTEXTS__ = [ownedContext];
  const { getComponentAgentContextsForHints } = loadModule(
    '../src/contracts/runtimeContractRegistry.ts',
  );
  const contextsForVariantKey = getComponentAgentContextsForHints([
    {
      figmaKey: 'title-view-variant-key',
      componentName: '🔒 [D] Test',
    },
  ]);
  assert.equal(contextsForVariantKey.length, 1);
  assert.deepEqual(
    contextsForVariantKey[0].componentSemantics,
    ownedContext.componentSemantics,
    'Canonical component names must retain semantics when a finding contains a variant key instead of the component-set key',
  );
  delete globalThis.__APOLLO_TEST_REMOTE_AGENT_CONTEXTS__;

  console.log('Contract artifact context regression checks passed');
}

main();
