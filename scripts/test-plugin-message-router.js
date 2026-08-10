const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-plugin-message-router-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/plugin/messageRouter.ts')],
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

function waitForAsyncHandlers() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function main() {
  const { routeApolloPluginMessage } = loadModule();
  const calls = [];
  let debugEnabled = false;
  const dependencies = {
    postMessage: (message) => calls.push(['postMessage', message]),
    notify: (message) => calls.push(['notify', message]),
    uiReady: () => calls.push(['uiReady']),
    scanSelection: (payload) => calls.push(['scanSelection', payload]),
    prepareCatalogChannel: async (payload) => {
      calls.push(['prepareCatalogChannel', payload]);
    },
    captureGenerationExample: async (payload) => {
      calls.push(['captureGenerationExample', payload]);
    },
    cancelScan: () => calls.push(['cancelScan']),
    sendAgentReport: async (requestId, userMessage) => {
      calls.push(['sendAgentReport', requestId, userMessage]);
    },
    cancelAgentReport: (requestId) => {
      calls.push(['cancelAgentReport', requestId]);
      return requestId !== 'stale-request';
    },
    resizeUi: (compact) => calls.push(['resizeUi', compact]),
    focusNode: async (nodeId) => calls.push(['focusNode', nodeId]),
    resetCustomizationGroup: async (payload) =>
      calls.push(['resetCustomizationGroup', payload]),
    applyThemizationAction: async (payload) =>
      calls.push(['applyThemizationAction', payload]),
    executeFindingAction: async (actionId) =>
      calls.push(['executeFindingAction', actionId]),
    setDebugAudit: (enabled) => {
      debugEnabled = enabled;
      calls.push(['setDebugAudit', enabled]);
      return debugEnabled;
    },
    getDebugAudit: () => debugEnabled,
    logError: (message, error) => calls.push(['logError', message, error]),
  };

  assert.equal(routeApolloPluginMessage({ type: 'unknown' }, dependencies), false);
  assert.equal(routeApolloPluginMessage({ type: 'ping' }, dependencies), true);
  assert.equal(routeApolloPluginMessage({ type: 'ui-ready' }, dependencies), true);
  routeApolloPluginMessage(
    { type: 'scan-selection', payload: { pickerLabel: 'Desktop' } },
    dependencies,
  );
  routeApolloPluginMessage(
    { type: 'prepare-catalog-channel', payload: { pickerLabel: 'iOS' } },
    dependencies,
  );
  routeApolloPluginMessage(
    { type: 'capture-generation-example', payload: { nodeId: '1:2' } },
    dependencies,
  );
  routeApolloPluginMessage({ type: 'cancel-scan' }, dependencies);
  routeApolloPluginMessage(
    {
      type: 'send-apollo-agent-report',
      payload: { requestId: 'request-1', userMessage: 'Проверь отчёт' },
    },
    dependencies,
  );
  routeApolloPluginMessage(
    {
      type: 'cancel-apollo-agent-report',
      payload: { requestId: 'request-1' },
    },
    dependencies,
  );
  routeApolloPluginMessage(
    {
      type: 'cancel-apollo-agent-report',
      payload: { requestId: 'stale-request' },
    },
    dependencies,
  );
  routeApolloPluginMessage(
    { type: 'set-ui-compact', payload: { compact: true } },
    dependencies,
  );
  routeApolloPluginMessage(
    { type: 'focus-node', payload: { id: '3:4' } },
    dependencies,
  );
  routeApolloPluginMessage(
    { type: 'reset-customization-group', payload: { nodeId: '5:6' } },
    dependencies,
  );
  routeApolloPluginMessage(
    { type: 'apply-themization-action', payload: { nodeId: '7:8' } },
    dependencies,
  );
  routeApolloPluginMessage(
    { type: 'execute-finding-action', payload: { actionId: 'action-1' } },
    dependencies,
  );
  routeApolloPluginMessage(
    { type: 'set-debug-audit', payload: { enabled: true } },
    dependencies,
  );
  routeApolloPluginMessage({ type: 'get-debug-audit' }, dependencies);
  await waitForAsyncHandlers();

  assert.deepEqual(calls[0], ['postMessage', { type: 'pong' }]);
  assert.ok(calls.some((call) => call[0] === 'uiReady'));
  assert.ok(calls.some((call) => call[0] === 'scanSelection'));
  assert.ok(
    calls.some(
      (call) =>
        call[0] === 'prepareCatalogChannel' &&
        call[1]?.pickerLabel === 'iOS',
    ),
  );
  assert.ok(calls.some((call) => call[0] === 'captureGenerationExample'));
  assert.ok(calls.some((call) => call[0] === 'cancelScan'));
  assert.ok(
    calls.some(
      (call) =>
        call[0] === 'sendAgentReport' &&
        call[1] === 'request-1' &&
        call[2] === 'Проверь отчёт',
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        call[0] === 'postMessage' &&
        call[1].type === 'apollo-agent-cancelled' &&
        call[1].payload.requestId === 'request-1',
    ),
  );
  assert.equal(
    calls.filter(
      (call) =>
        call[0] === 'postMessage' &&
        call[1].type === 'apollo-agent-cancelled',
    ).length,
    1,
    'A stale request must not cancel the active agent request',
  );
  assert.ok(calls.some((call) => call[0] === 'resizeUi' && call[1] === true));
  assert.ok(calls.some((call) => call[0] === 'focusNode' && call[1] === '3:4'));
  assert.ok(calls.some((call) => call[0] === 'resetCustomizationGroup'));
  assert.ok(calls.some((call) => call[0] === 'applyThemizationAction'));
  assert.ok(
    calls.some(
      (call) => call[0] === 'executeFindingAction' && call[1] === 'action-1',
    ),
  );
  assert.equal(debugEnabled, true);
  assert.equal(
    calls.filter(
      (call) =>
        call[0] === 'postMessage' && call[1].type === 'debug-audit-state',
    ).length,
    2,
  );

  const rejectedCalls = [];
  const rejectedDependencies = Object.assign({}, dependencies, {
    postMessage: (message) => rejectedCalls.push(['postMessage', message]),
    notify: (message) => rejectedCalls.push(['notify', message]),
    focusNode: async () => {
      throw new Error('focus failed');
    },
    sendAgentReport: async () => {
      throw new Error('agent failed');
    },
    logError: (message, error) =>
      rejectedCalls.push(['logError', message, error.message]),
  });
  routeApolloPluginMessage(
    { type: 'focus-node', payload: { id: 'missing' } },
    rejectedDependencies,
  );
  routeApolloPluginMessage(
    { type: 'send-apollo-agent-report', payload: { requestId: 'failed' } },
    rejectedDependencies,
  );
  await waitForAsyncHandlers();

  assert.ok(
    rejectedCalls.some(
      (call) => call[0] === 'notify' && call[1] === 'Не удалось перейти к слою.',
    ),
  );
  assert.ok(
    rejectedCalls.some(
      (call) =>
        call[0] === 'postMessage' &&
        call[1].type === 'apollo-agent-result' &&
        call[1].payload.error === 'agent failed',
    ),
  );

  console.log('Plugin message router regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
