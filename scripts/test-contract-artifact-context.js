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

  console.log('Contract artifact context regression checks passed');
}

main();
