'use strict';

const OPERATIONS = [
  'renderedTree', 'resolveLocalDefinition', 'classifyComponent', 'libraryFreshness',
  'resolveFlattenedSource', 'customStyles', 'deprecatedStyles', 'localDependencies',
  'treeCheckpoint', 'treeCheckpointGuard', 'treeYield', 'treeVisibility', 'treeVisit',
  'treeChildren', 'treeEdgeGuard', 'visitNodeRegistration', 'visitFreshnessScope',
  'visitLocalDefinitionRegistration', 'visitGuard', 'visitComponentGrouping',
  'visitDetached', 'visitStyleGrouping', 'componentProgress',
  'figmaImportComponentByKeyAsync', 'figmaGetMainComponentAsync', 'figmaGetNodeByIdAsync',
  'figmaGetStyleByIdAsync', 'figmaGetVariableByIdAsync',
];
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const isTime = value => Number.isFinite(value) && value >= 0;
const rounded = value => Math.round(value * 1000) / 1000;

/** @template T @param {string} _operation @param {() => T} call */
function untimed(_operation, call) {
  return call();
}

function createComponentTimings(now = () => typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()) {
  let startedAt = null;
  let finishedAt = null;
  const calls = new Map();
  function begin(operation) {
    if (startedAt === null || finishedAt !== null) return null;
    const stats = calls.get(operation) ?? { count: 0, completed: 0, failed: 0, totalMs: 0, maxMs: 0 };
    calls.set(operation, stats);
    stats.count++;
    const started = now();
    return failed => {
      const duration = Math.max(0, now() - started);
      if (failed) stats.failed++;
      stats.completed++;
      stats.totalMs += duration;
      stats.maxMs = Math.max(stats.maxMs, duration);
    };
  }
  return {
    start() { startedAt ??= now(); },
    finish() { finishedAt = now(); },
    /** @template T @param {string} operation @param {() => Promise<T>} call */
    async measure(operation, call) {
      const end = begin(operation);
      if (!end) return call();
      let failed = false;
      try {
        return await call();
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        end(failed);
      }
    },
    /** @template T @param {string} operation @param {() => T} call */
    measureSync(operation, call) {
      const end = begin(operation);
      if (!end) return call();
      let failed = false;
      try {
        return call();
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        end(failed);
      }
    },
    snapshot() {
      if (startedAt === null) return null;
      return {
        elapsedMs: rounded(Math.max(0, (finishedAt ?? now()) - startedAt)),
        finished: finishedAt !== null,
        calls: Object.fromEntries(Array.from(calls, ([operation, stats]) => [
          operation, Object.assign({}, stats, { totalMs: rounded(stats.totalMs), maxMs: rounded(stats.maxMs) }),
        ])),
      };
    },
  };
}

function readComponentTimings(value) {
  if (!value || !isTime(value.elapsedMs) || typeof value.finished !== 'boolean' || !value.calls) return null;
  const calls = {};
  for (const operation of OPERATIONS) {
    const stats = value.calls[operation];
    if (!stats || !isCount(stats.count) || !isCount(stats.completed) || !isCount(stats.failed) ||
        stats.failed > stats.completed || stats.completed > stats.count ||
        !isTime(stats.totalMs) || !isTime(stats.maxMs) || stats.maxMs > stats.totalMs) continue;
    calls[operation] = { count: stats.count, completed: stats.completed, failed: stats.failed, totalMs: stats.totalMs, maxMs: stats.maxMs };
  }
  return { elapsedMs: value.elapsedMs, finished: value.finished, calls };
}

module.exports = { createComponentTimings, readComponentTimings, untimed };
