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
    excludeLibraryUpdatesFromCurrent,
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

  console.log('Library update result reconciliation checks passed');
}

main();
