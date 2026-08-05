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
  const variantNode = {
    id: 'variant',
    type: 'INSTANCE',
    setProperties: (properties) => calls.push(['setProperties', properties]),
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
    resolveReferenceNode: async (node, nodeId) => {
      calls.push(['resolveReferenceNode', node.id, nodeId]);
      return { ok: true, referenceNode };
    },
    rerunAudit: async (selection) =>
      calls.push(['rerunAudit', selection.map((node) => node.id)]),
    mutations: {
      applyReferenceResetByDetails: async (node, details) =>
        calls.push(['details', node.id, details]),
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
