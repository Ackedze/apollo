const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-library-update-results-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/services/libraryUpdateResults.ts'),
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

function item(id, componentKey, options = {}) {
  return {
    id,
    componentKey,
    focusNodeId: options.focusNodeId ?? null,
    sourceOwnerOccurrenceIds: options.sourceOwnerOccurrenceIds ?? [],
    localComponentOwner: options.localComponentOwner ?? null,
    libraryFreshness: options.libraryFreshness ?? null,
  };
}

function main() {
  const {
    assertLibraryUpdateCategoriesExclusive,
    excludeLibraryUpdatesFromCurrent,
    findLibraryUpdateCurrentOverlaps,
    reconcileLibraryUpdateResults,
    resolveLibraryUpdateFocusNodeId,
  } = loadModule();

  const renderedCell = item('I11281:68684;14:67165', 'cell-key', {
    libraryFreshness: { reason: 'instance-sublayer' },
  });
  const unrelatedCell = item('I999:1;14:67165', 'cell-key', {
    libraryFreshness: { reason: 'instance-sublayer' },
  });
  const sameOwnerDifferentSource = item('I11281:68684;88:100', 'cell-key', {
    libraryFreshness: { reason: 'instance-sublayer' },
  });
  const currentSameKey = item('I999:1;88:100', 'cell-key', {
    libraryFreshness: { reason: 'instance-sublayer' },
  });
  const sourceUpdate = item('11281:68608', 'cell-key', {
    focusNodeId: '11281:68684',
    localComponentOwner: { id: 'owner-source' },
    libraryFreshness: {
      currentComponentId: 'old-component',
      latestComponentId: 'new-component',
    },
  });

  const duplicateSourceUpdate = item('11281:68609', 'cell-key', {
    focusNodeId: '11281:68684',
    localComponentOwner: { id: 'owner-source' },
    libraryFreshness: {
      currentComponentId: 'old-component',
      latestComponentId: 'new-component',
    },
  });
  const renderedItems = [renderedCell, sameOwnerDifferentSource, unrelatedCell];
  const usedFocusNodeIds = new Set();
  const firstFocusId = resolveLibraryUpdateFocusNodeId(
    sourceUpdate,
    renderedItems,
    usedFocusNodeIds,
  );
  usedFocusNodeIds.add(firstFocusId);
  const secondFocusId = resolveLibraryUpdateFocusNodeId(
    duplicateSourceUpdate,
    renderedItems,
    usedFocusNodeIds,
  );
  assert.equal(firstFocusId, renderedCell.id);
  assert.equal(secondFocusId, sameOwnerDifferentSource.id);
  assert.equal(
    resolveLibraryUpdateFocusNodeId(
      item('source-without-rendered-match', 'another-key', {
        focusNodeId: '11281:68684',
        localComponentOwner: { id: 'owner-source' },
      }),
      [renderedCell],
    ),
    '11281:68684',
  );

  const independentCurrent = item('independent-current', 'cell-key', {
    libraryFreshness: { reason: 'remote-component-current' },
  });
  const exactDuplicate = item('source-update-id', 'other-key');
  const directUpdate = item('direct-update', 'direct-key');
  const directKeySublayer = item('I20:30;40:50', 'direct-key', {
    libraryFreshness: { reason: 'instance-sublayer' },
  });
  const reconciled = excludeLibraryUpdatesFromCurrent(
    [
      renderedCell,
      sameOwnerDifferentSource,
      unrelatedCell,
      currentSameKey,
      independentCurrent,
      exactDuplicate,
      directKeySublayer,
    ],
    [
      sourceUpdate,
      item('source-update-id', 'other-key', {
        localComponentOwner: { id: 'owner-source' },
      }),
      directUpdate,
    ],
  );

  assert.deepEqual(
    reconciled.map((entry) => entry.id),
    [
      'I999:1;14:67165',
      'I999:1;88:100',
      'independent-current',
      'I20:30;40:50',
    ],
    'Only owner-scoped source-update sublayers and exact update ids leave current',
  );

  assert.throws(
    () => assertLibraryUpdateCategoriesExclusive([renderedCell], [sourceUpdate]),
    /update\/current invariant failed/,
  );
  assert.equal(
    findLibraryUpdateCurrentOverlaps(reconciled, [sourceUpdate]).length,
    0,
  );

  const fixture = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, 'fixtures/library-update-parity.json'),
      'utf8',
    ),
  );
  const baselineCurrent = Array.from({ length: 24 }, (_value, index) =>
    item(`baseline-current-${index + 1}`, `baseline-key-${index + 1}`, {
      libraryFreshness: { reason: 'remote-component-current' },
    }),
  );
  const detachedUpdates = fixture.dependencies.map((dependency) =>
    item(dependency.detachedId, dependency.key, {
      libraryFreshness: {
        reason: 'remote-component-update-available',
        currentComponentId: dependency.currentComponentId,
        latestComponentId: dependency.latestComponentId,
      },
    }),
  );
  const detachedResult = reconcileLibraryUpdateResults(
    baselineCurrent,
    detachedUpdates,
    [],
  );

  const renderedDependencies = fixture.dependencies.map((dependency) =>
    item(dependency.renderedId, dependency.key, {
      libraryFreshness: { reason: 'instance-sublayer' },
    }),
  );
  const sourceUpdates = fixture.dependencies.map((dependency) =>
    item(dependency.sourceId, dependency.key, {
      focusNodeId: fixture.ownerOccurrenceId,
      sourceOwnerOccurrenceIds: [fixture.ownerOccurrenceId],
      localComponentOwner: { id: fixture.ownerSourceId },
      libraryFreshness: {
        reason: 'remote-component-update-available',
        currentComponentId: dependency.currentComponentId,
        latestComponentId: dependency.latestComponentId,
      },
    }),
  );
  const instanceResult = reconcileLibraryUpdateResults(
    baselineCurrent.concat(renderedDependencies),
    [],
    sourceUpdates,
  );

  const versionSignatures = (entries) =>
    entries.map((entry) =>
      [
        entry.componentKey,
        entry.libraryFreshness.currentComponentId,
        entry.libraryFreshness.latestComponentId,
      ].join(':'),
    );
  assert.equal(detachedResult.updateItems.length, 8);
  assert.equal(instanceResult.updateItems.length, 8);
  assert.equal(detachedResult.currentItems.length, 24);
  assert.equal(instanceResult.currentItems.length, 24);
  assert.deepEqual(
    versionSignatures(instanceResult.updateItems),
    versionSignatures(detachedResult.updateItems),
    'Detached and local-instance scans must expose the same update occurrences',
  );
  assert.equal(
    new Set(instanceResult.updateItems.map((entry) => entry.focusNodeId)).size,
    8,
    'Every source update occurrence must focus a distinct rendered instance',
  );
  assert.equal(
    findLibraryUpdateCurrentOverlaps(
      instanceResult.currentItems,
      instanceResult.updateItems,
    ).length,
    0,
  );

  console.log('Library update result reconciliation checks passed');
}

main();
