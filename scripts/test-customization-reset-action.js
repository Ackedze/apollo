const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-customization-reset-action-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/actions/customizationResetAction.ts'),
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

function createHarness() {
  const calls = [];
  const rootNode = { id: 'root', type: 'INSTANCE' };
  const targetNode = { id: 'target', type: 'FRAME' };
  const componentSet = {
    type: 'COMPONENT_SET',
    children: [
      { type: 'COMPONENT', variantProperties: { View: 'Primary' } },
      { type: 'COMPONENT', variantProperties: { View: 'Secondary' } },
    ],
  };
  const variantNode = {
    id: 'variant',
    type: 'INSTANCE',
    variantProperties: { View: 'Secondary' },
    setProperties(properties) {
      Object.assign(this.variantProperties, properties);
      calls.push(['setProperties', properties]);
    },
    async getMainComponentAsync() {
      return { parent: componentSet };
    },
  };
  const nodes = new Map([
    [rootNode.id, rootNode],
    [targetNode.id, targetNode],
    [variantNode.id, variantNode],
  ]);
  const referenceNode = { id: 1, path: 'Root / Target', type: 'FRAME' };
  const dependencies = {
    ensureReferencesLoaded: async () => calls.push(['ensureReferencesLoaded']),
    getSceneNodeById: async (nodeId) => nodes.get(nodeId) ?? null,
    resolveReferenceNode: async (node, nodeId, options) => {
      calls.push(['resolveReferenceNode', node.id, nodeId, options]);
      return { ok: true, referenceNode };
    },
    rerunAudit: async (selection) =>
      calls.push(['rerunAudit', selection.map((node) => node.id)]),
    mutations: {
      applyReferenceResetByDetails: async (node, details) =>
        calls.push(['details', node.id, details]),
      applyReferencePaintSurfaceReset: async (node, reference, details) =>
        calls.push(['paintSurface', node.id, reference.path, details]),
      applyReferenceResetByMessages: async (node, reference, messages) =>
        calls.push(['messages', node.id, reference.path, messages]),
    },
    notify: (message) => calls.push(['notify', message]),
    log: (message, payload) => calls.push(['log', message, payload]),
  };
  return { calls, dependencies, referenceNode };
}

async function main() {
  const { createCustomizationResetAction } = loadModule();

  const invalid = createHarness();
  await createCustomizationResetAction(invalid.dependencies)({});
  assert.deepEqual(invalid.calls, [
    ['notify', 'Недостаточно данных для сброса изменений.'],
  ]);

  const structuralComposition = createHarness();
  await createCustomizationResetAction(structuralComposition.dependencies)({
    rootId: 'root',
    nodeId: 'target',
    details: [
      {
        property: 'composition.count',
        reference: { value: '2-4' },
      },
    ],
  });
  assert.deepEqual(structuralComposition.calls, [
    ['notify', 'Для нарушения состава автоматический сброс недоступен.'],
  ]);

  const remediation = createHarness();
  await createCustomizationResetAction(remediation.dependencies)({
    rootId: 'root',
    nodeId: 'target',
    remediations: [
      {
        kind: 'set-variant-properties',
        nodeId: 'variant',
        properties: { View: 'Primary' },
      },
    ],
  });
  assert.ok(
    remediation.calls.some(
      (call) =>
        call[0] === 'setProperties' && call[1].View === 'Primary',
    ),
  );
  assert.ok(
    remediation.calls.some(
      (call) => call[0] === 'rerunAudit' && call[1][0] === 'root',
    ),
  );
  assert.equal(
    remediation.calls.some((call) => call[0] === 'resolveReferenceNode'),
    false,
  );

  const invalidVariantRemediation = createHarness();
  await createCustomizationResetAction(invalidVariantRemediation.dependencies)({
    rootId: 'root',
    nodeId: 'target',
    remediations: [
      {
        kind: 'set-variant-properties',
        nodeId: 'variant',
        properties: { View: 'Primary или Secondary' },
      },
    ],
  });
  assert.equal(
    invalidVariantRemediation.calls.some((call) => call[0] === 'setProperties'),
    false,
    'A display label that is not a real variant value must never reach Figma setProperties.',
  );
  assert.ok(
    invalidVariantRemediation.calls.some(
      (call) =>
        call[0] === 'notify' &&
        call[1] ===
          'Не удалось подобрать существующий вариант компонента для восстановления параметров.',
    ),
  );

  const detailsOnly = createHarness();
  const detail = {
    property: 'opacity',
    reference: { value: 1, resourceType: 'color' },
  };
  await createCustomizationResetAction(detailsOnly.dependencies)({
    rootId: 'root',
    nodeId: 'target',
    details: [detail],
  });
  assert.ok(
    detailsOnly.calls.some(
      (call) => call[0] === 'details' && call[1] === 'target',
    ),
  );
  assert.ok(
    detailsOnly.calls.some(
      (call) => call[0] === 'rerunAudit' && call[1][0] === 'target',
    ),
  );
  assert.equal(
    detailsOnly.calls.some((call) => call[0] === 'resolveReferenceNode'),
    false,
  );

  const compositeAlignment = createHarness();
  const alignmentDetails = [
    {
      property: 'layout.primaryAxisAlignItems',
      reference: { value: 'MIN' },
    },
    {
      property: 'layout.counterAxisAlignItems',
      reference: { value: 'MAX' },
    },
  ];
  await createCustomizationResetAction(compositeAlignment.dependencies)({
    rootId: 'root',
    nodeId: 'target',
    details: alignmentDetails,
  });
  assert.ok(
    compositeAlignment.calls.some(
      (call) =>
        call[0] === 'details' &&
        call[1] === 'target' &&
        call[2].length === 2 &&
        call[2][0].property === 'layout.primaryAxisAlignItems' &&
        call[2][1].property === 'layout.counterAxisAlignItems',
    ),
    'A semantic alignment reset must keep both atomic axis mutations',
  );

  const paintSurface = createHarness();
  await createCustomizationResetAction(paintSurface.dependencies)({
    rootId: 'root',
    nodeId: 'target',
    details: [
      {
        property: 'fill',
        reference: { value: null },
        resetSurface: 'paint',
      },
    ],
  });
  assert.ok(
    paintSurface.calls.some(
      (call) =>
        call[0] === 'resolveReferenceNode' &&
        call[1] === 'root' &&
        call[2] === 'target' &&
        call[3].preferSelectedComponentVariant === true,
    ),
  );
  assert.ok(
    paintSurface.calls.some(
      (call) =>
        call[0] === 'paintSurface' &&
        call[1] === 'target' &&
        call[2] === paintSurface.referenceNode.path &&
        call[3][0].reference.value === null,
    ),
  );
  assert.equal(
    paintSurface.calls.some((call) => call[0] === 'details'),
    false,
  );

  const messages = createHarness();
  await createCustomizationResetAction(messages.dependencies)({
    rootId: 'root',
    nodeId: 'target',
    messages: ['Паддинг top: 8 → 12'],
  });
  assert.ok(
    messages.calls.some(
      (call) =>
        call[0] === 'messages' &&
        call[1] === 'target' &&
        call[2] === messages.referenceNode.path,
    ),
  );
  assert.ok(
    messages.calls.some(
      (call) => call[0] === 'rerunAudit' && call[1][0] === 'root',
    ),
  );

  console.log('Customization reset action regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
