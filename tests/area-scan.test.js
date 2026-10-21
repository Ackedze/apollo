const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function loadScanner() {
  const reads = { exports: {} }, moduleBox = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../src/document-audit/reads.js"), 'utf8'), {module:reads, setTimeout, clearTimeout});
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../src/area-scan.ts"), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports: moduleBox.exports, module: moduleBox, require: () => reads.exports, Date, setTimeout, clearTimeout });
  return moduleBox.exports;
}
const { scanArea, AREA_NODE_LIMIT, AREA_COMPONENT_LIMIT } = loadScanner();
function area(count, type) {
  const page = { type: 'PAGE', id: 'page' }, root = { type: 'FRAME', id: 'area', visible: true, parent: page, children: [] };
  for (let i = 0; i < count; i++) root.children.push({ id: 'node-' + i, type, name: 'Node', parent: root, visible: true,
    x: 0, y: 0, width: 1, height: 1, getMainComponentAsync: async () => ({ key: 'test-key' }) });
  return root;
}
test('node traversal limit is explicit and does not scan beyond its bound', async () => {
  const result = await scanArea([area(AREA_NODE_LIMIT, 'RECTANGLE')], () => {});
  assert.equal(result.selection.complete, false); assert.equal(result.selection.issues[0], 'area-node-limit');
  assert.equal(result.selection.scannedNodes, AREA_NODE_LIMIT);
});
test('component limit preserves a partial identity inventory with explicit incomplete coverage', async () => {
  const result = await scanArea([area(AREA_COMPONENT_LIMIT + 1, 'INSTANCE')], () => {});
  assert.equal(result.selection.complete, false); assert.equal(result.selection.issues[0], 'area-component-limit');
  assert.equal(result.selection.components.length, AREA_COMPONENT_LIMIT);
});
test('a selected child of a hidden ancestor is skipped, even when the hidden ancestor is not selected', async () => {
  const root = area(1, 'INSTANCE'); root.visible = false;
  const result = await scanArea([root.children[0]], () => {});
  assert.equal(result.selection.scannedNodes, 0); assert.equal(result.selection.components.length, 0);
});

const settle = () => new Promise(resolve => setImmediate(resolve));
test('cold native sources may resolve after 1.2 seconds without losing any of 28 identities', async t => {
  t.mock.timers.enable({apis:['setTimeout', 'Date']});
  const {scanArea} = loadScanner(), root = area(28, 'INSTANCE');
  const source = new Promise(resolve => setTimeout(() => resolve({key:'native-key'}), 10811));
  root.children.forEach(node => { node.getMainComponentAsync = () => source; });
  const running = scanArea([root], () => {});
  await settle(); t.mock.timers.tick(10811); await settle();
  const result = await running;
  assert.equal(result.selection.complete, true);
  assert.equal(result.selection.components.filter(c => c.componentKey === 'native-key').length, 28);
});

test('one shared identity deadline bounds all waves and late native replies cannot fill expired facts', async t => {
  t.mock.timers.enable({apis:['setTimeout', 'Date']});
  const {scanArea, AREA_IDENTITY_BUDGET_MS} = loadScanner(), root = area(28, 'INSTANCE');
  let calls = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  root.children.forEach(node => { node.getMainComponentAsync = () => { calls++; return pending; }; });
  const running = scanArea([root], () => {});
  await settle(); t.mock.timers.tick(AREA_IDENTITY_BUDGET_MS); await settle();
  const result = await running;
  assert.equal(calls, 12, 'expired queued reads must not start more native work');
  assert.equal(result.selection.complete, false);
  assert.deepEqual(Array.from(result.selection.issues), ['area-identity-read-timeout']);
  assert.ok(result.selection.components.every(c => c.componentKey === '' && c.identityRead.code === 'AREA_IDENTITY_READ_TIMEOUT'));
  assert.equal(result.selection.components[0].identityRead.elapsedMs, AREA_IDENTITY_BUDGET_MS);
  assert.equal(result.selection.components[12].identityRead.timeoutMs, 0);
  const frozen = JSON.stringify(result.selection);
  release({key:'late-key'}); await settle();
  assert.equal(JSON.stringify(result.selection), frozen);
});

test('native identity errors and absent sources remain distinguishable per node', async () => {
  const root = area(2, 'INSTANCE');
  root.children[0].getMainComponentAsync = async () => { throw Error('source access denied'); };
  root.children[1].getMainComponentAsync = async () => null;
  const result = await scanArea([root], () => {});
  assert.equal(result.selection.components[0].identityRead.code, 'AREA_IDENTITY_READ_FAILED');
  assert.equal(result.selection.components[0].identityRead.error, 'source access denied');
  assert.equal(result.selection.components[1].identityRead.code, 'AREA_IDENTITY_UNAVAILABLE');
  assert.equal(result.selection.complete, false);
});

test('a context change during native identity loading still refuses the scan', async () => {
  const root = area(1, 'INSTANCE'); let current = true;
  root.children[0].getMainComponentAsync = async () => { current = false; return {key:'native-key'}; };
  await assert.rejects(scanArea([root], () => { if (!current) throw Error('context changed'); }), /context changed/);
});
