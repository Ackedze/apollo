const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), crypto = require('node:crypto');
const cache = new Map(), runtime = { figma: null };
function sourceModule(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Map, Set, console, get figma() { return runtime.figma; }, require: name => {
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name), full = fs.existsSync(target) ? target : target + '.ts';
    return full.endsWith('.ts') ? sourceModule(full) : require(full);
  } }, { filename });
  return module.exports;
}
const { buildCatalogReference: build, applyCatalogResourceRemap: remap, materializeCatalogBaseline } = sourceModule(path.join(__dirname, '../packages/component-contract-core/src/catalog-reference.ts'));
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), D = 'd'.repeat(40), E = 'e'.repeat(40), H = '1'.repeat(64);
const plain = value => JSON.parse(JSON.stringify(value));
function sign(response) { delete response.referenceHash; response.referenceHash = crypto.createHash('sha256').update(JSON.stringify(response)).digest('hex'); return response; }
function fixture() {
  const facts = (identity, text = {}) => ({ layout: { mode: 'HORIZONTAL', sizingHorizontal: 'HUG', sizingVertical: 'HUG' },
    appearance: { fill: [], stroke: [], opacity: 1, radius: 0, effects: [] }, text,
    component: Object.assign({ propertyReferences: [], propertyReferenceBindings: {} }, identity ? { identity } : {}),
    variable: { bindings: {}, modes: {}, modeCatalog: {} }, hostVariableUsageV1: { version: 1, complete: true, bindings: {} },
    visible: true, bounds: { width: 100, height: 32 }, resolvedModes: {}, explicitModes: {}, propertyActivityV1: { gapApplicable: false } });
  const rootFacts = facts({ mainComponentId: '10:1', componentKey: A, componentSetKey: B });
  Object.assign(rootFacts.component, { configurationValuesKind: 'source-defaults', properties: { View: 'primary', Label: 'Button' }, propertyTypes: { View: 'VARIANT', Label: 'TEXT' }, definedProperties: ['View', 'Label'] });
  const textFacts = facts(null, { characters: 'Button', fontName: { family: 'Fixture', style: 'Regular' }, textAlignHorizontal: 'LEFT' });
  textFacts.component.propertyReferences = ['Label']; textFacts.component.propertyReferenceBindings = { characters: 'Label' };
  const node = (id, parentId, name, type, nativeId, parentNativeId, children, facts) => ({ id, parentId, path: parentId === null ? name : 'Button / ' + name, name, type,
    nativeAuditFactsV1: { schemaVersion: 'athena.native-audit-facts.v1', sourceNodeId: nativeId, sourceParentId: parentNativeId, sourceChildIds: children, nodeType: type,
      facts, resources: { styles: {}, variables: {}, collections: {} }, unavailable: [], complete: true } });
  const expected = { releaseId: H, selection: { contractId: 'fixture.button', componentId: 'fixture.button', revision: 1, representationId: 'desktop', componentKey: A, variantKey: A } };
  const response = sign({ success: true, schemaVersion: 'apollo.catalog-reference.v1', releaseId: H,
    contract: { id: 'fixture.button', componentId: 'fixture.button', revision: 1, manualSourceHash: H }, runtime: { profileVersion: '0.4.1' },
    selection: plain(expected.selection), component: { key: B }, variant: { key: A, properties: { View: 'primary' } },
    structure: [node(0, null, 'Button', 'COMPONENT', '10:1', 'set', ['10:2'], rootFacts), node(1, 0, 'Label', 'TEXT', '10:2', '10:1', [], textFacts)],
    dependencies: [], provenance: { catalog: { file: 'catalog.json', sha256: H }, contract: { file: 'contract.json', sha256: H }, source: { fileKey: 'fixture-file', fileName: 'Fixture library', pageId: 'page' } },
    completeness: { structure: 'assembled', facts: 'partial', nativeCorrespondence: 'unproven', issues: [] } });
  const contract = { package: { id: 'fixture.button', componentId: 'fixture.button', manualSourceHash: H, manualRevision: 1, sourceGeneratedAt: '2026-11-03T00:00:00.000Z' },
    facts: { representations: [{ id: 'desktop', kind: 'figma', status: 'draft', platform: 'desktop', locator: { componentKey: B } }], targets: [] },
    customizationPolicy: [], rules: [], capabilities: { facts: [] }, runtimePolicy: {} };
  return { response, contract, expected };
}
function resources(f) {
  const n = f.response.structure[1].nativeAuditFactsV1;
  n.resources.styles['S:source'] = { id: 'S:source', key: C, type: 'TEXT' };
  n.facts.appearance.typography = { styleId: 'S:source' };
  n.facts.textStyleEvidenceV1 = { version: 1, keysById: { 'S:source': C }, segments: [{ start: 0, end: 6, styleId: 'S:source' }] };
  n.resources.variables.var = { id: 'var', key: D, variableCollectionId: 'col', resolvedType: 'COLOR' };
  n.resources.collections.col = { id: 'col', key: E, modes: [{ modeId: 'source-mode', name: 'Corp' }], defaultModeId: 'source-mode' };
  n.facts.appearance.fill = [{ type: 'SOLID', visible: true, opacity: 1, tokenId: 'var', color: { r: 1, g: 2, b: 3 } }];
  n.facts.variable.bindings.fills = { required: true, tokenIds: ['var'] };
  n.facts.resolvedModes.col = 'source-mode'; n.facts.explicitModes.col = 'source-mode';
  n.facts.variable.modes[E] = 'source-mode'; n.facts.variable.modeCatalog[E] = { collectionId: 'col', collectionName: 'Fixture', modes: [{ modeId: 'source-mode', name: 'Corp' }], defaultModeId: 'source-mode' };
  sign(f.response);
}
function baselineRule(f, fact = 'appearance.opacity') {
  const shape = [{ path: '', type: 'ROOT' }, { path: 'Label', type: 'TEXT' }];
  f.contract.facts.variantEvidence = { schemaVersion: 'apollo.variant-anatomy.v1', structures: { fixture: shape }, variants: [{ componentKey: A, componentSetKey: B, structureId: 'fixture', properties: { View: 'primary' } }] };
  f.contract.facts.targets = [{ id: 'root', semanticRole: 'root', pathHint: 'Button', resolution: 'resolved' }];
  f.contract.customizationPolicy = [{ id: 'policy', targetId: 'root', targetScope: 'self-and-descendants' }];
  f.contract.rules = [{ ruleId: 'baseline', source: { anchor: 'policy' }, expected: { fact: 'baseline.effective.' + fact } }];
}

test('source defaults build independently without Figma; locator.componentKey may identify a Component Set', () => {
  const f = fixture(), before = JSON.stringify(f.response), result = build(f.response, f.contract, f.expected);
  assert.equal(result.snapshot.nodes[0].type, 'INSTANCE');
  assert.equal(result.preparedSourceTopology.nodes[0].nodeType, 'COMPONENT');
  assert.equal(result.variantReference.componentSetKey, B);
  assert.equal(result.variantReference.complete, true);
  assert.equal(result.preparedSourceTopology.componentKey, A);
  assert.equal(JSON.stringify(f.response), before);
});

test('reference byte hash, request, contract revision/hash and representation identity are checked', () => {
  const mutations = [
    f => { f.response.structure[0].name = 'tampered'; },
    f => { f.expected.releaseId = '2'.repeat(64); },
    f => { f.contract.package.manualSourceHash = '2'.repeat(64); },
    f => { f.contract.package.manualRevision = 2; },
    f => { f.contract.facts.representations[0].locator.componentKey = C; },
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); assert.throws(() => build(f.response, f.contract, f.expected), /CATALOG_/); }
});

test('old presentation catalogs, incomplete trees and native/source type mismatches never become complete facts', () => {
  for (const mutate of [
    f => { delete f.response.structure[0].nativeAuditFactsV1; },
    f => { f.response.structure[1].nativeAuditFactsV1.sourceParentId = 'foreign'; },
    f => { f.response.structure[0].nativeAuditFactsV1.sourceChildIds.push('missing'); },
    f => { f.response.structure[1].nativeAuditFactsV1.nodeType = 'RECTANGLE'; },
    f => { f.response.structure.push(plain(f.response.structure[1])); },
  ]) { const f = fixture(); mutate(f); sign(f.response); assert.throws(() => build(f.response, f.contract, f.expected), /CATALOG_/); }
});

test('source default config is checked after resource adaptation; unsupported config cannot configure a fake reference', () => {
  const f = fixture(); f.expected.selection.config = { Label: 'Overridden' }; f.response.selection = plain(f.expected.selection); sign(f.response);
  assert.throws(() => remap(build(f.response, f.contract, f.expected), []), /CATALOG_CONFIGURATION_UNSUPPORTED/);
  const g = fixture(); g.expected.selection.config = { Label: 'Button', View: 'primary' }; g.response.selection = plain(g.expected.selection); sign(g.response);
  assert.equal(remap(build(g.response, g.contract, g.expected), []).snapshot.nodes[0].text.characters, undefined);
});

test('resource overlaps map only by exact independent key witness; source visual values never change', () => {
  const f = fixture(); resources(f);
  const prepared = build(f.response, f.contract, f.expected), result = remap(prepared, [
    { kind: 'style', sourceId: 'S:source', sourceKey: C, consumerId: 'S:consumer', consumerKey: C },
    { kind: 'variable', sourceId: 'var', sourceKey: D, consumerId: 'consumer-var', consumerKey: D },
    { kind: 'collection', sourceId: 'col', sourceKey: E, consumerId: 'consumer-col', consumerKey: E, consumerModes: [{ modeId: 'consumer-mode', name: 'Corp' }] },
  ]);
  const n = result.snapshot.nodes[1];
  assert.equal(n.appearance.typography.styleId, 'S:consumer'); assert.equal(n.textStyleEvidenceV1.keysById['S:consumer'], C);
  assert.equal(n.appearance.fill[0].tokenId, 'consumer-var'); assert.deepEqual(plain(n.appearance.fill[0].color), { r: 1, g: 2, b: 3 });
  assert.equal(n.resolvedModes['consumer-col'], 'consumer-mode'); assert.equal(n.variable.modes[E], 'consumer-mode');
  assert.equal(n.variable.modeCatalog[E].defaultModeId, 'consumer-mode'); assert.equal(n.variable.modeCatalog[E].modes[0].modeId, 'consumer-mode');
  assert.equal(prepared.snapshot.nodes[1].appearance.typography.styleId, 'S:source');
});

test('missing actual style/token keeps a noncolliding independent expectation instead of blocking detach detection', () => {
  const f = fixture(); resources(f); const result = remap(build(f.response, f.contract, f.expected), []), n = result.snapshot.nodes[1];
  assert.match(n.appearance.typography.styleId, /^catalog-source:style:/);
  assert.equal(n.textStyleEvidenceV1.keysById[n.appearance.typography.styleId], C);
  assert.match(n.appearance.fill[0].tokenId, /^catalog-source:variable:/);
});

test('foreign/ambiguous/unrequested witnesses and nonunique collection modes are refused', () => {
  const f = fixture(); resources(f); const prepared = build(f.response, f.contract, f.expected);
  const style = { kind: 'style', sourceId: 'S:source', sourceKey: C, consumerId: 'S:consumer', consumerKey: C };
  for (const witnesses of [
    [Object.assign({}, style, { consumerKey: D })], [style, style],
    [Object.assign({}, style, { consumerId: 'catalog-source:spoof' })],
    [Object.assign({}, style, { sourceId: 'foreign' })],
    [{ kind: 'collection', sourceId: 'col', sourceKey: E, consumerId: 'consumer-col', consumerKey: E, consumerModes: [{ modeId: '1', name: 'Corp' }, { modeId: '2', name: 'Corp' }] }],
  ]) assert.throws(() => remap(prepared, witnesses), /CATALOG_/);
});

test('unused optional export diagnostics do not claim full parity or block a known profile', () => {
  const f = fixture(); f.response.structure[1].nativeAuditFactsV1.complete = false;
  f.response.structure[1].nativeAuditFactsV1.unavailable = ['text.unused-optional']; sign(f.response);
  const result = build(f.response, f.contract, f.expected);
  assert.deepEqual(plain(result.snapshot.nodes[1].unknownFacts), ['text.unused-optional']);
  assert.equal(result.snapshot.source.captureTopology.complete, true);
});

test('source uncertainty reaches the matched baseline for the existing engine to evaluate', () => {
  for (const unavailable of ['appearance', 'appearance.opacity', 'appearance.opacity.child', 'native.opacity']) {
    const f = fixture(); baselineRule(f); f.response.structure[1].nativeAuditFactsV1.unavailable.push(unavailable); sign(f.response);
    const reference = build(f.response, f.contract, f.expected).snapshot, actual = plain(reference);
    actual.nodes.forEach(node=>{node.unknownFacts=[];});
    const materialized = materializeCatalogBaseline(actual, reference);
    assert(materialized.snapshot.nodes[1].unknownFacts.includes('baseline.effective.'+unavailable));
    if(unavailable==='native.opacity')assert(materialized.snapshot.nodes[1].unknownFacts.includes('baseline.effective.appearance.opacity'));
  }
  for (const value of [null, undefined]) {
    const f = fixture(); baselineRule(f); f.response.structure[1].nativeAuditFactsV1.facts.appearance.opacity = value; sign(f.response);
    const reference = build(f.response, f.contract, f.expected).snapshot;
    assert.equal(reference.nodes[1].appearance.opacity,value);
  }
  const unused = fixture(); baselineRule(unused); unused.response.structure[1].nativeAuditFactsV1.unavailable.push('native.clipsContent'); sign(unused.response);
  assert.doesNotThrow(() => build(unused.response, unused.contract, unused.expected));
});

test('resource mode correspondence requires unique real mode IDs and names', () => {
  for (const modes of [undefined, [{ name: 'Corp' }], [{ modeId: '1' }], [{ modeId: '1', name: 'Corp' }, { modeId: '1', name: 'Other' }]]) {
    const f = fixture(); resources(f);
    assert.throws(() => remap(build(f.response, f.contract, f.expected), [{ kind: 'collection', sourceId: 'col', sourceKey: E, consumerId: 'consumer-col', consumerKey: E, consumerModes: modes }]), /CATALOG_MODE_IDENTITY_AMBIGUOUS/);
  }
  const f = fixture(); resources(f);
  const result = remap(build(f.response, f.contract, f.expected), [{ kind: 'collection', sourceId: 'col', sourceKey: E, consumerId: 'consumer-col', consumerKey: E, consumerModes: [{ modeId: 'source-mode', name: 'Foreign mode' }] }]);
  assert.match(result.snapshot.nodes[1].resolvedModes['consumer-col'], /^catalog-source:mode:/);
  assert.match(result.snapshot.nodes[1].variable.modes[E], /^catalog-source:mode:/);
});

test('prepared-source collectNodes and collectAnatomy read remote instances without creating pristine references', async () => {
  let writes = 0, reads = 0;
  const main = { id: '100:1', key: A, remote: true, createInstance() { writes++; throw Error('NO_SCENE_WRITES'); } };
  const node = (id, type) => ({ id, type, name: type, visible: true, children: [], opacity: 1, width: 100, height: 32, x: 0, y: 0,
    componentPropertyReferences: {}, resolvedVariableModes: {}, boundVariables: {} });
  const root = node('10:1', 'INSTANCE'), child = node('I10:1;100:2', 'FRAME');
  root.children = [child]; root.componentProperties = {}; root.getMainComponentAsync = async () => main;
  root.parent = { id: 'page', type: 'PAGE' }; child.parent = root;
  runtime.figma = { mixed: Symbol('mixed'), fileKey: 'consumer-file', root: { name: 'Consumer' }, currentPage: root.parent,
    variables: { getVariableCollectionByIdAsync: async () => null, getVariableByIdAsync: async () => null }, getStyleByIdAsync: async () => null,
    createPage() { writes++; throw Error('NO_SCENE_WRITES'); } };
  const source = { componentKey: A, rootNodeId: '100:1', nodes: [
    { sourceNodeId: '100:1', sourceParentId: 'set', sourceChildIds: ['100:2'], nodeType: 'COMPONENT' },
    { sourceNodeId: '100:2', sourceParentId: '100:1', sourceChildIds: [], nodeType: 'FRAME' },
  ] };
  const control = { preparedSourceTopology: source, guard() {}, async read(work) { reads++; return work(); } };
  const capture = sourceModule(path.join(__dirname, '../packages/component-contract-core/src/figma-capture.ts'));
  const full = await capture.collectNodes(root, 'desktop', {}, undefined, control);
  const anatomy = await capture.collectAnatomy(root, 'desktop', {}, undefined, control);
  assert.equal(writes, 0); assert(reads > 0);
  assert.equal(full.snapshot.nodes[1].component.sourceIdentity.sourceNodeId, '100:2');
  assert.equal(anatomy.anatomy[1].properties.component.sourceIdentity.ownerComponentKey, A);
  assert.equal(full.snapshot.source.captureTopology.complete, true);
  // Same default consumer path remains enabled when the optional port is omitted.
  await capture.collectNodes(root, 'desktop', {});
  assert.equal(writes, 1);
});
