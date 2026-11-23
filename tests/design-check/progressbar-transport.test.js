const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const app = path.resolve(__dirname, '../..');
const bundle = esbuild.build({
  stdin: { contents: "export { mountDesignCheck, createDesignCheckController, tabDefinitions } from './src/design-check';", resolveDir: app },
  bundle: true, write: false, outfile: path.join(app, 'tests/progressbar-transport.bundle.js'),
  loader: { '.module.css': 'local-css' }, platform: 'browser', format: 'iife', globalName: 'PilotShell',
  // A test-only launcher exercises transport without reopening the disabled production category.
  plugins: [{ name: 'diagnostic-pattern-entry', setup(build) {
    build.onResolve({ filter: /^\.\/AuditOverview$/ }, () => ({ path: 'overview', namespace: 'diagnostic' }));
    build.onLoad({ filter: /.*/, namespace: 'diagnostic' }, () => ({ loader: 'tsx', resolveDir: app,
      contents: `import React from 'react';import {AuditOverview as Actual} from ${JSON.stringify(path.join(app,'src/design-check/AuditOverview.tsx'))};export function AuditOverview(props){return <><Actual {...props}/><button data-diagnostic-pattern-entry onClick={()=>props.onOpen({id:'patterns'})}>Диагностический транспортный сценарий</button></>;}` }));
  } }],
  define: { 'process.env.NODE_ENV': '"production"', __APOLLO_PROGRESSBAR_PILOT__: 'true',
    __APOLLO_PROGRESSBAR_PILOT_ENDPOINT__: '"http://localhost:3001/v1/analyze/codex/runs"' },
}).then(result => result.outputFiles.find(file => file.path.endsWith('.js')).text);
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

async function harness() {
  const dom = new JSDOM('<iframe id="wrapper"></iframe><iframe id="foreign"></iframe>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const outer = dom.window, parent = outer.document.querySelector('#wrapper').contentWindow;
  parent.document.body.innerHTML = '<iframe id="plugin"></iframe>';
  const ui = parent.document.querySelector('#plugin').contentWindow, requests = [], native = [];
  ui.document.body.innerHTML = '<div id="root"></div><iframe id="child"></iframe>';
  ui.fetch = async (url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: false, json: async () => ({ success: false, code: 'PROGRESSBAR_TEST_STOP' }) };
  };
  parent.postMessage = value => { if (value.pluginMessage?.type === 'progressbar-native-request') native.push(value.pluginMessage); };
  ui.eval((await bundle) + '\nwindow.PilotShell = PilotShell;');
  const controller = ui.PilotShell.createDesignCheckController({ tabs: ui.PilotShell.tabDefinitions });
  const view = ui.PilotShell.mountDesignCheck(ui.document.querySelector('#root'), controller);
  await tick();
  const productionEntry = ui.document.querySelector('[aria-label^="Паттерны:"]');
  assert.equal(productionEntry.disabled, true); productionEntry.click(); await tick();
  assert.equal(native.length, 0); assert.equal(ui.document.querySelector('.apollo-progressbar-start'), null);
  ui.document.querySelector('[data-diagnostic-pattern-entry]').click(); await tick();
  ui.document.querySelector('.apollo-progressbar-start').click(); await tick();
  assert.equal(native.length, 1);
  const reply = { type: 'progressbar-native-result', requestId: native[0].requestId, operation: 'capture',
    result: { schemaVersion: 'apollo.progressbar-capture.v1', captureId: 'synthetic-capture', complete: true, nodes: [{ id: 'synthetic-root', name: 'Area' }] } };
  return { outer, parent, ui, requests, reply,
    receive(source, message = reply) { ui.dispatchEvent(new ui.MessageEvent('message', { source, data: { pluginMessage: message } })); },
    close() { view.unmount(); controller.destroy(); outer.close(); } };
}

test('diagnostic-only Patterns transport accepts correlated native replies from immediate and outer Figma ancestors', async () => {
  for (const sender of ['parent', 'outer']) {
    const h = await harness();
    try {
      h.receive(h[sender]); await tick();
      assert.equal(h.requests.length, 1, sender + ' reply must reach source preparation without a native timeout');
      assert.equal(h.requests[0].report.phase, 'prepare');
      assert.equal(h.requests[0].report.capture.captureId, 'synthetic-capture');
      assert.match(h.ui.document.querySelector('[role="alert"]').textContent, /PROGRESSBAR_TEST_STOP/);
    } finally { h.close(); }
  }
});

test('diagnostic-only Patterns transport refuses null, sibling, child, self and uncorrelated replies before Proxy preparation', async () => {
  const h = await harness();
  try {
    for (const source of [null, h.outer.document.querySelector('#foreign').contentWindow, h.ui.document.querySelector('#child').contentWindow, h.ui]) {
      h.receive(source); await tick(); assert.equal(h.requests.length, 0);
    }
    h.receive(h.outer, Object.assign({}, h.reply, { requestId: 'unrelated-request' })); await tick();
    assert.equal(h.requests.length, 0);
    h.receive(h.parent); await tick(); assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].report.phase, 'prepare');
  } finally { h.close(); }
});

test('diagnostic-only Patterns transport forwards capture v2 context evidence intact to preparation', async () => {
  const h = await harness();
  try {
    h.reply.result.schemaVersion = 'apollo.progressbar-capture.v2';
    h.reply.result.contextEvidence = { schemaVersion: 'apollo.link-context-evidence.v1', nodes: [{ nodeId: 'synthetic-root', propertyReferences: { status: 'available', value: null } }] };
    h.receive(h.parent); await tick();
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.requests[0].report.capture.contextEvidence, h.reply.result.contextEvidence);
  } finally { h.close(); }
});
