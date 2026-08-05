const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-audit-target-collector-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/services/auditTargetCollector.ts')],
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

function createState() {
  return {
    relevanceBuckets: {
      technical: [],
      deprecated: [],
      update: [],
      current: [],
      unknown: [],
    },
    themizationEntries: [],
    wrongChannelEntries: [],
    localLibraryItems: [],
    presetItems: [],
    detachedEntries: [],
    customStyleEntries: [],
    deprecatedStyleEntries: [],
    totalItems: 0,
  };
}

function item(id, relevance, overrides = {}) {
  return {
    id,
    name: id,
    nodeType: 'INSTANCE',
    pageName: 'Page',
    pathSegments: [],
    fullPath: `Page/${id}`,
    relevance,
    librarySource: 'Library',
    isLocal: false,
    reference: { key: `${id}-key`, names: [id], status: 'current' },
    componentKey: `${id}-key`,
    diffs: [],
    ...overrides,
  };
}

function themeEntry(id) {
  return {
    id: `theme:${id}`,
    kind: 'corporateComponent',
    name: id,
    pageName: 'Page',
    path: `Page/${id}`,
    visible: true,
    nodeId: id,
    nodeType: 'INSTANCE',
    recommendation: 'Replace',
  };
}

function main() {
  const { aggregateAuditComponent } = loadModule();
  const state = createState();
  const currentWrongChannel = item('current-wrong', 'current');
  const updateWrongChannel = item('update-wrong', 'update');
  const forcedTechnical = item('technical', 'technical', {
    forcedCategory: 'technical',
  });
  const preset = item('preset', 'current');

  aggregateAuditComponent(state, currentWrongChannel, {
    wrongChannel: true,
    themizationEntry: null,
    preset: false,
  });
  aggregateAuditComponent(state, updateWrongChannel, {
    wrongChannel: true,
    themizationEntry: null,
    preset: false,
  });
  aggregateAuditComponent(state, forcedTechnical, {
    wrongChannel: true,
    themizationEntry: themeEntry('technical'),
    preset: true,
  });
  aggregateAuditComponent(state, preset, {
    wrongChannel: false,
    themizationEntry: themeEntry('preset'),
    preset: true,
  });

  assert.equal(state.totalItems, 4);
  assert.deepEqual(
    state.relevanceBuckets.current.map((entry) => entry.id),
    ['preset'],
    'Wrong-channel current components must not remain current',
  );
  assert.deepEqual(
    state.relevanceBuckets.update.map((entry) => entry.id),
    ['update-wrong'],
  );
  assert.deepEqual(
    state.relevanceBuckets.technical.map((entry) => entry.id),
    ['technical'],
  );
  assert.deepEqual(
    state.wrongChannelEntries.map((entry) => entry.id),
    ['current-wrong', 'update-wrong'],
    'Forced categories must not also enter wrong-channel results',
  );
  assert.deepEqual(state.themizationEntries.map((entry) => entry.name), ['preset']);
  assert.deepEqual(state.presetItems.map((entry) => entry.id), ['preset']);

  console.log('Audit target category aggregation regression checks passed');
}

main();
