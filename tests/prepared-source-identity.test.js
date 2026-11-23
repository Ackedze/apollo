const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const filename = path.join(__dirname, '../packages/component-contract-core/src/prepared-source-identity.ts');
const moduleRecord = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
  { module: moduleRecord, exports: moduleRecord.exports, Map, Set }, { filename });
const { capturePreparedSourceIdentities: capture } = moduleRecord.exports;
const plain = value => JSON.parse(JSON.stringify(Array.from(value)));
const master = () => ({ componentKey: 'root-key', rootNodeId: '100:1', nodes: [
  { sourceNodeId: '100:1', sourceParentId: 'external-set', sourceChildIds: ['100:2'], nodeType: 'COMPONENT' },
  { sourceNodeId: '100:2', sourceParentId: '100:1', sourceChildIds: ['100:3'], nodeType: 'FRAME' },
  { sourceNodeId: '100:3', sourceParentId: '100:2', sourceChildIds: ['I100:3;200:1'], nodeType: 'INSTANCE', componentKey: 'inner-key' },
  { sourceNodeId: 'I100:3;200:1', sourceParentId: '100:3', sourceChildIds: ['I100:3;200:2'], nodeType: 'FRAME' },
  { sourceNodeId: 'I100:3;200:2', sourceParentId: 'I100:3;200:1', sourceChildIds: [], nodeType: 'TEXT' },
] });
const actual = () => [
  { figmaNodeId: '900:1', type: 'INSTANCE', parentIndex: null, childIndexes: [1] },
  { figmaNodeId: 'I900:1;100:2', type: 'FRAME', parentIndex: 0, childIndexes: [2] },
  { figmaNodeId: 'I900:1;100:3', type: 'INSTANCE', parentIndex: 1, childIndexes: [3] },
  { figmaNodeId: 'I900:1;100:3;200:1', type: 'FRAME', parentIndex: 2, childIndexes: [4] },
  { figmaNodeId: 'I900:1;100:3;200:2', type: 'TEXT', parentIndex: 3, childIndexes: [] },
].map((entry, i) => Object.assign({ name: 'arbitrary rename ' + i, path: 'irrelevant', depth: 99,
  node: new Proxy({}, { get() { throw Error('Pure identity proof read a native node'); } }) }, entry));
const mains = () => new Map([['900:1', { id: 'local-main-root', key: 'root-key' }],
  ['I900:1;100:3', { id: 'local-main-inner', key: 'inner-key' }]]);

test('independent master proves renamed owned layers and nested owner-relative source IDs', () => {
  const result = capture(actual(), mains(), master(), true);
  assert.equal(result.size, 4);
  assert.deepEqual(plain(result).at(-1), ['I900:1;100:3;200:2', { version: 1, ownerComponentKey: 'inner-key', ownerMainComponentId: 'local-main-inner', sourceNodeId: '200:2' }]);
  assert.equal(result.get('I900:1;100:3').sourceNodeId, '100:3');
  assert.equal(result.get('I900:1;100:3').ownerComponentKey, 'root-key');
  assert.deepEqual(Array.from(capture(actual(), mains(), master()).keys()), ['I900:1;100:3']);
});

test('reordered capture rows preserve identity through explicit parent edges', () => {
  const entries = actual(), order = [4, 2, 0, 3, 1], index = new Map(order.map((old, now) => [old, now]));
  const reordered = order.map(i => Object.assign({}, entries[i], { parentIndex: entries[i].parentIndex === null ? null : index.get(entries[i].parentIndex), childIndexes: entries[i].childIndexes.map(n => index.get(n)) }));
  assert.deepEqual(plain(capture(reordered, mains(), master(), true)).sort(), plain(capture(entries, mains(), master(), true)).sort());
});

test('already inherited actual root namespace is stripped exactly once', () => {
  const entries = actual(), prefix = 'I700:1;900:1';
  entries.forEach(n => { n.figmaNodeId = n.figmaNodeId === '900:1' ? prefix : n.figmaNodeId.replace('I900:1;', prefix + ';'); });
  const identities = new Map([[prefix, { id: 'root-main', key: 'root-key' }], [prefix + ';100:3', { id: 'inner-main', key: 'inner-key' }]]);
  assert.equal(capture(entries, identities, master(), true).get(prefix + ';100:3;200:2').sourceNodeId, '200:2');
});

test('deep nested source INSTANCE owner already using I-prefix proves its own namespace', () => {
  const source = master(), entries = actual(), identities = mains();
  source.nodes[4].nodeType = entries[4].type = 'INSTANCE';
  source.nodes[4].componentKey = 'deep-key';
  source.nodes[4].sourceChildIds = ['I100:3;200:2;300:1'];
  source.nodes.push({ sourceNodeId: 'I100:3;200:2;300:1', sourceParentId: 'I100:3;200:2', sourceChildIds: [], nodeType: 'TEXT' });
  entries[4].childIndexes = [5];
  entries.push({ figmaNodeId: 'I900:1;100:3;200:2;300:1', type: 'TEXT', parentIndex: 4, childIndexes: [] });
  identities.set(entries[4].figmaNodeId, { id: 'consumer-deep-main', key: 'deep-key' });
  assert.deepEqual(plain(capture(entries, identities, source, true)).at(-1), [entries[5].figmaNodeId,
    { version: 1, ownerComponentKey: 'deep-key', ownerMainComponentId: 'consumer-deep-main', sourceNodeId: '300:1' }]);
});

test('foreign or unknown nested owner key cannot prove its descendants', () => {
  for (const key of ['foreign-key', undefined]) {
    const identities = mains(); identities.set('I900:1;100:3', { id: 'local-main-inner', key });
    const result = capture(actual(), identities, master(), true);
    assert.equal(result.has('I900:1;100:3;200:1'), false);
    assert.equal(result.has('I900:1;100:3;200:2'), false);
  }
  const source = master(); delete source.nodes[2].componentKey;
  assert.equal(capture(actual(), mains(), source, true).has('I900:1;100:3;200:2'), false);
});

test('root key and root types must be exact; file-local source/main IDs need not match', () => {
  const source = master(); source.componentKey = 'foreign-key'; assert.equal(capture(actual(), mains(), source, true).size, 0);
  const entries = actual(); entries[0].type = 'FRAME'; assert.equal(capture(entries, mains(), master(), true).size, 0);
  const other = master(); other.nodes[0].nodeType = 'INSTANCE'; assert.equal(capture(actual(), mains(), other, true).size, 0);
  const keys = mains(); keys.delete('900:1'); assert.equal(capture(actual(), keys, master(), true).size, 0);
});

test('matching leaf ID never bypasses wrong parent, type or foreign namespace', () => {
  for (const mutate of [
    entries => { entries[4].parentIndex = 2; entries[3].childIndexes = []; entries[2].childIndexes.push(4); },
    entries => { entries[4].type = 'RECTANGLE'; },
    entries => { entries[4].figmaNodeId = 'Iforeign;200:2'; },
  ]) {
    const entries = actual(); mutate(entries);
    assert.equal(capture(entries, mains(), master(), true).has(entries[4].figmaNodeId), false);
  }
});

test('unmatched actual children stay unproven without hiding proven siblings', () => {
  const entries = actual(); entries[3].childIndexes.push(5);
  entries.push({ figmaNodeId: 'I900:1;100:3;foreign', type: 'TEXT', parentIndex: 3, childIndexes: [] });
  const result = capture(entries, mains(), master(), true);
  assert.equal(result.has('I900:1;100:3;foreign'), false);
  assert.equal(result.has('I900:1;100:3;200:2'), true);
});

test('SLOT descendants cannot acquire source identity', () => {
  const source = master(), entries = actual(); source.nodes[3].nodeType = entries[3].type = 'SLOT';
  const result = capture(entries, mains(), source, true);
  assert.equal(result.has(entries[3].figmaNodeId), true);
  assert.equal(result.has(entries[4].figmaNodeId), false);
});

test('broken, duplicate, cyclic or unclosed prepared topology refuses all proof', () => {
  for (const mutate of [
    source => { source.nodes.push(Object.assign({}, source.nodes[4])); },
    source => { source.nodes[3].sourceChildIds.push('missing'); },
    source => { source.nodes[4].sourceParentId = 'missing'; },
    source => { source.nodes[1].sourceChildIds.push('100:1'); source.nodes[0].sourceParentId = '100:2'; },
    source => { source.nodes[0].sourceChildIds = []; },
    source => { delete source.nodes[3].sourceChildIds; },
  ]) { const source = master(); mutate(source); assert.equal(capture(actual(), mains(), source, true).size, 0); }
});

test('duplicate or cyclic actual topology refuses all proof', () => {
  const duplicate = actual(); duplicate[4].figmaNodeId = duplicate[3].figmaNodeId;
  assert.equal(capture(duplicate, mains(), master(), true).size, 0);
  const cyclic = actual(); cyclic[3].parentIndex = 4; cyclic[4].childIndexes = [3];
  assert.equal(capture(cyclic, mains(), master(), true).size, 0);
});

test('proof does not mutate prepared export, captured topology or main identity map', () => {
  const source = master(), entries = actual(), identities = mains();
  const sourceJSON = JSON.stringify(source), mainsJSON = JSON.stringify(Array.from(identities));
  source.nodes.forEach(n => { Object.freeze(n.sourceChildIds); Object.freeze(n); }); Object.freeze(source.nodes); Object.freeze(source);
  entries.forEach(n => { Object.freeze(n.childIndexes); Object.freeze(n); }); Object.freeze(entries);
  assert.equal(capture(entries, identities, source, true).size, 4);
  assert.equal(JSON.stringify(source), sourceJSON);
  assert.equal(JSON.stringify(Array.from(identities)), mainsJSON);
});
