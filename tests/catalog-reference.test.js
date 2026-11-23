const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), crypto = require('node:crypto');
const cache = new Map(), runtime = { figma: null };
function sourceModule(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Map, Set, console, get figma() { return runtime.figma; }, require: name => {
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name), full = fs.existsSync(target) ? target : fs.existsSync(target + '.ts') ? target + '.ts' : target + '.js';
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

test('a source-owned BOOLEAN visibility binding configures hidden content without copying observed layout', () => {
  const f = fixture(), root = f.response.structure[0].nativeAuditFactsV1.facts.component;
  root.properties.Show = true; root.propertyTypes.Show = 'BOOLEAN'; root.definedProperties.push('Show');
  const child = f.response.structure[1].nativeAuditFactsV1.facts;
  child.component.propertyReferences = ['Show']; child.component.propertyReferenceBindings = { visible: 'Show' };
  f.expected.selection.config = { Show: false }; f.response.selection = plain(f.expected.selection); sign(f.response);
  const before = JSON.stringify(f.response), result = remap(build(f.response, f.contract, f.expected), []);
  assert.equal(result.snapshot.nodes[1].visible, false);
  assert.equal(result.snapshot.nodes[0].component.properties.Show, false);
  assert.equal(result.snapshot.nodes[1].bounds.width, 100);
  assert.ok(result.snapshot.nodes[1].unknownFacts.includes('bounds'));
  assert.ok(result.snapshot.nodes[0].unknownFacts.includes('bounds'));
  assert.equal(JSON.stringify(f.response), before);
  const foreign = build(f.response, f.contract, f.expected);
  foreign.snapshot.nodes[1].component.sourceIdentity.ownerComponentKey = C;
  assert.throws(() => remap(foreign, []), /CATALOG_CONFIGURATION_UNSUPPORTED/);
  for (const mutate of [
    g => { g.response.structure[1].nativeAuditFactsV1.facts.component.propertyReferenceBindings.characters = 'Show'; },
    g => { g.response.structure[1].nativeAuditFactsV1.unavailable.push('visible'); },
    g => { g.response.structure[1].nativeAuditFactsV1.facts.visible = false; },
    g => { g.expected.selection.config.Show = 'false'; g.response.selection = plain(g.expected.selection); },
    g => { g.response.structure[1].nativeAuditFactsV1.facts.component.propertyReferenceBindings = {}; },
    g => { g.response.structure[1].nativeAuditFactsV1.facts.component.propertyReferences = []; },
    g => { g.response.structure[0].nativeAuditFactsV1.facts.component.definedProperties.push('Show'); },
  ]) {
    const g = plain(f); mutate(g); sign(g.response);
    assert.throws(() => remap(build(g.response, g.contract, g.expected), []), /CATALOG_CONFIGURATION_UNSUPPORTED/);
  }
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

test('unused typed API properties may change only with complete wiring evidence, including hidden nodes', () => {
  const make = () => {
    const f = fixture(), c = f.response.structure[0].nativeAuditFactsV1.facts.component;
    c.properties.Holding = true; c.propertyTypes.Holding = 'BOOLEAN'; c.definedProperties.push('Holding');
    f.expected.selection.config = { Holding: false }; f.response.selection = plain(f.expected.selection); sign(f.response);
    return f;
  };
  const f = make(), prepared = build(f.response, f.contract, f.expected), before = JSON.stringify(prepared);
  assert.equal(remap(prepared, []).snapshot.nodes[0].component.properties.Holding, false);
  assert.equal(JSON.stringify(prepared), before);
  for (const mutate of [
    f => { const n = f.response.structure[1].nativeAuditFactsV1.facts; n.visible = false; n.component.propertyReferences.push('Holding'); },
    f => { f.response.structure[1].nativeAuditFactsV1.facts.component.propertyReferenceBindings.visible = 'Holding'; },
    f => { f.expected.selection.config.Holding = 'False'; f.response.selection = plain(f.expected.selection); },
    f => { f.response.structure[0].nativeAuditFactsV1.facts.component.propertyTypes.Holding = 'VARIANT'; },
    f => { f.response.structure[0].nativeAuditFactsV1.facts.component.definedProperties.push('Holding'); },
  ]) { const g = make(); mutate(g); sign(g.response); assert.throws(() => remap(build(g.response, g.contract, g.expected), []), /CATALOG_CONFIGURATION_UNSUPPORTED/); }
});

function fontModeFixture() {
  const f = fixture(), root = f.response.structure[0].nativeAuditFactsV1, child = f.response.structure[1].nativeAuditFactsV1;
  const font = { id: 'font-col', key: E, name: 'Font', defaultModeId: 'old', modes: [{ modeId: 'old', name: 'Original' }, { modeId: 'sf', name: 'System' }] };
  const tracking = { id: 'tracking-col', key: '2'.repeat(40), name: 'Tracking', defaultModeId: 'fixed', modes: [{ modeId: 'fixed', name: 'Fixed' }] };
  root.resources.collections = { 'font-col': font, 'tracking-col': tracking };
  root.resources.variables = {
    family: { id: 'family', key: C, variableCollectionId: font.id, resolvedType: 'STRING', valuesByMode: { old: 'Fixture', sf: 'System' } },
    tracking: { id: 'tracking', key: D, variableCollectionId: font.id, resolvedType: 'FLOAT', valuesByMode: { old: 0, sf: { type: 'VARIABLE_ALIAS', id: 'sf-tracking' } } },
    'sf-tracking': { id: 'sf-tracking', key: '3'.repeat(40), variableCollectionId: tracking.id, resolvedType: 'FLOAT', valuesByMode: { fixed: -0.32 } },
  };
  for (const n of [root, child]) n.facts.resolvedModes = { 'font-col': 'old', 'tracking-col': 'fixed' };
  child.facts.text.letterSpacing = { unit: 'PIXELS', value: 0 };
  child.facts.variable.bindings = { fontFamily: { tokenIds: ['family'] }, letterSpacing: { tokenIds: ['tracking'] } };
  child.facts.hostVariableUsageV1.bindings = {
    family: { collectionId: font.id, collectionKey: font.key, referencedVariableIds: [] },
    tracking: { collectionId: font.id, collectionKey: font.key, referencedVariableIds: [] },
  };
  f.response.provenance.source.fontPairs = [{ family: 'System', style: 'Regular' }];
  f.expected.selection.modes = { 'consumer-font': 'consumer-sf', 'consumer-tracking': 'consumer-fixed' };
  f.response.selection = plain(f.expected.selection);
  f.witnesses = [
    { kind: 'collection', sourceId: font.id, sourceKey: font.key, consumerId: 'consumer-font', consumerKey: font.key,
      consumerModes: [{ modeId: 'consumer-old', name: 'Original' }, { modeId: 'consumer-sf', name: 'System' }] },
    { kind: 'collection', sourceId: tracking.id, sourceKey: tracking.key, consumerId: 'consumer-tracking', consumerKey: tracking.key,
      consumerModes: [{ modeId: 'consumer-fixed', name: 'Fixed' }] },
  ];
  sign(f.response); return f;
}

test('mode projection follows pinned alias values, preserves explicit child modes and marks font geometry unknown', () => {
  const f = fontModeFixture(), prepared = build(f.response, f.contract, f.expected), before = JSON.stringify(prepared);
  const result = remap(prepared, f.witnesses), root = result.snapshot.nodes[0], child = result.snapshot.nodes[1];
  assert.equal(child.text.fontName.family, 'System'); assert.equal(child.text.fontName.style, 'Regular');
  assert.equal(child.text.letterSpacing.value, -0.32);
  assert.equal(child.resolvedModes['consumer-font'], 'consumer-sf');
  assert(child.unknownFacts.includes('bounds')); assert(root.unknownFacts.includes('bounds'));
  const usage = Object.values(child.hostVariableUsageV1.bindings);
  assert.equal(usage.length, 3); assert(usage.some(b => b.collectionId === 'consumer-tracking'));
  assert.equal(JSON.stringify(prepared), before);
  const g = fontModeFixture(); g.response.structure[1].nativeAuditFactsV1.facts.explicitModes['font-col'] = 'old'; sign(g.response);
  const explicit = remap(build(g.response, g.contract, g.expected), g.witnesses).snapshot.nodes[1];
  assert.equal(explicit.text.fontName.family, 'Fixture'); assert.equal(explicit.text.letterSpacing.value, 0);
  assert.equal(explicit.resolvedModes['consumer-font'], 'consumer-old'); assert(!explicit.unknownFacts.includes('bounds'));
});

test('mode projection refuses missing aliases, cycles, unproved font pairs and changed unsupported visual fields', () => {
  for (const [mutate, code] of [
    [f => { delete f.response.structure[0].nativeAuditFactsV1.resources.variables['sf-tracking']; }, 'CATALOG_VARIABLE_VALUE_UNAVAILABLE'],
    [f => { f.response.structure[0].nativeAuditFactsV1.resources.variables['sf-tracking'].valuesByMode.fixed = { type: 'VARIABLE_ALIAS', id: 'tracking' }; }, 'CATALOG_VARIABLE_ALIAS_CYCLE'],
    [f => { f.response.structure[0].nativeAuditFactsV1.resources.variables['sf-tracking'].valuesByMode.fixed = 'wrong'; }, 'CATALOG_VARIABLE_TYPE_MISMATCH'],
    [f => { f.response.provenance.source.fontPairs = []; }, 'CATALOG_MODE_BINDING_UNSUPPORTED'],
    [f => { const n = f.response.structure[1].nativeAuditFactsV1.facts; n.variable.bindings.opacity = n.variable.bindings.letterSpacing; delete n.variable.bindings.letterSpacing; }, 'CATALOG_MODE_BINDING_UNSUPPORTED'],
    [f => { f.response.structure[1].nativeAuditFactsV1.facts.hostVariableUsageV1.complete = false; }, 'CATALOG_MODE_SOURCE_UNPROVEN'],
  ]) {
    const f = fontModeFixture(); mutate(f); sign(f.response);
    assert.throws(() => remap(build(f.response, f.contract, f.expected), f.witnesses), error => error.code === code);
  }
});

test('native key witnesses for an unused collection alias do not claim its mode table for another local ID', () => {
  const f = fontModeFixture(), root = f.response.structure[0].nativeAuditFactsV1;
  root.resources.collections['font-alias'] = { id: 'font-alias', key: E, name: 'Font',
    defaultModeId: 'old', modes: [{ modeId: 'old', name: 'Original' }] };
  const aliasWitness = Object.assign({}, f.witnesses[0], { sourceId: 'font-alias' });
  f.witnesses.push(aliasWitness); sign(f.response);
  const prepared = build(f.response, f.contract, f.expected), result = remap(prepared, f.witnesses);
  for (const node of result.snapshot.nodes) {
    assert.equal(node.variable.modes[E], 'consumer-sf');
    assert.equal(node.variable.modeCatalog[E].collectionId, 'consumer-font');
    assert.deepEqual(plain(node.variable.modeCatalog[E].modes).map(m => m.modeId), ['consumer-old', 'consumer-sf']);
  }
  const ambiguous = fontModeFixture(), source = ambiguous.response.structure[0].nativeAuditFactsV1;
  source.resources.collections['font-alias'] = plain(root.resources.collections['font-alias']);
  ambiguous.response.structure[1].nativeAuditFactsV1.facts.resolvedModes['font-alias'] = 'old';
  ambiguous.witnesses.push(aliasWitness); sign(ambiguous.response);
  assert.throws(() => remap(build(ambiguous.response, ambiguous.contract, ambiguous.expected), ambiguous.witnesses),
    error => error.code === 'CATALOG_MODE_CONFIGURATION_UNSUPPORTED');
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

test('real catalogue collector preserves independent facts when a style read fails, without scene writes', async () => {
  const f=fixture();f.contract.package.componentId='core.web.button';f.response.contract.componentId='core.web.button';
  f.contract.runtimePolicy.instanceMainComponentAliasesVersion=1;f.response.structure[1].nativeAuditFactsV1.facts.text.fontSize=16;
  sign(f.response);
  let writes=0, styleReads=0;
  const denied=()=>{writes++;throw Error('NO_SCENE_WRITES');};
  const main={id:'consumer-main',key:A,type:'COMPONENT',remote:true,parent:{type:'COMPONENT_SET',key:B,componentPropertyDefinitions:{View:{},Label:{}}},createInstance:denied};
  const node=(id,type)=>({id,type,name:type,visible:true,children:[],opacity:1,width:100,height:32,x:0,y:0,
    componentPropertyReferences:{},resolvedVariableModes:{},explicitVariableModes:{},boundVariables:{},fills:[],strokes:[],effects:[]});
  const root=node('20:1','INSTANCE'), label=node('I20:1;10:2','TEXT');
  label.name='Label';label.characters='Button';label.textStyleId='unread-style';label.fontName={family:'Fixture',style:'Regular'};label.fontSize=18;
  root.children=[label];label.parent=root;root.parent={id:'page',type:'PAGE'};
  root.componentProperties={View:{type:'VARIANT',value:'primary'},Label:{type:'TEXT',value:'Button'}};
  root.getMainComponentAsync=async()=>main;
  runtime.figma={mixed:Symbol('mixed'),fileKey:'consumer-file',root:{name:'Consumer'},currentPage:root.parent,
    variables:{getVariableCollectionByIdAsync:async()=>null,getVariableByIdAsync:async()=>null},
    getStyleByIdAsync:async()=>{styleReads++;throw Error('unavailable-style');},getNodeByIdAsync:async id=>id===main.id?main:null,
    createPage:denied,importComponentByKeyAsync:denied,importComponentSetByKeyAsync:denied};
  const {captureCatalogAudit}=sourceModule(path.join(__dirname,'../src/audit-catalog.ts'));
  const capture=await captureCatalogAudit(root,f.contract,H,async selection=>{f.response.selection=plain(selection);return sign(f.response);},{guard(){},read:work=>work()});
  assert.equal(writes,0);assert(styleReads>0);
  assert.equal(capture.snapshot.nodes[1].text.fontSize,18);
  const engine=sourceModule(path.join(__dirname,'../packages/component-contract-core/predicate/index.js')),text=capture.snapshot.nodes[1];
  const compare=fact=>engine.evaluateExpression({predicate:'equals',actual:{fact},expected:{fact:'baseline.effective.'+fact},missingPolicy:'unknown'},text,capture.snapshot);
  assert.equal(compare('text.fontSize').truth,'false');
  assert.equal(compare('appearance.typography.styleId').truth,'unknown');
  assert.equal(capture.snapshot.nodes[1].component.sourceIdentity.sourceNodeId,'10:2');
  assert(capture.warnings.some(w=>w.includes('CATALOG_RESOURCE_READ_FAILED')));
  assert.equal(capture.snapshot.variantReference.complete,true);
  const missing=await captureCatalogAudit(root,f.contract,H,async()=>{throw Object.assign(Error('unavailable'),{code:'CATALOG_REFERENCE_UNAVAILABLE'});},{guard(){},read:work=>work()});
  assert.equal(writes,0);assert.equal(missing.snapshot.nodes[1].text.fontSize,18);
  assert.equal(missing.snapshot.variantReference,undefined);
  assert.deepEqual(plain(missing.snapshot.nodes[0].baseline),{effective:{}});
  const incomplete=engine.evaluateExpression({predicate:'equals',actual:{fact:'layout.mode'},expected:{fact:'baseline.effective.layout.mode'},missingPolicy:'unknown'},missing.snapshot.nodes[0],missing.snapshot);
  assert.equal(incomplete.truth,'unknown');
  const independent=engine.evaluateExpression({predicate:'equals',actual:{fact:'text.fontSize'},expected:{literal:16},missingPolicy:'unknown'},missing.snapshot.nodes[1],missing.snapshot);
  assert.equal(independent.truth,'false');
});

test('one missing native branch preserves independently proven baseline differences',()=>{
 const f=fixture();const n=plain(f.response.structure[1]);n.id=2;n.name='Other';
 n.nativeAuditFactsV1.sourceNodeId='10:3';n.nativeAuditFactsV1.facts.text.characters='Other';
 n.nativeAuditFactsV1.facts.component.propertyReferences=[];n.nativeAuditFactsV1.facts.component.propertyReferenceBindings={};
 f.response.structure[0].nativeAuditFactsV1.sourceChildIds.push('10:3');f.response.structure.push(n);sign(f.response);
 const ref=build(f.response,f.contract,f.expected).snapshot,actual=plain(ref);
 actual.nodes[1].component.sourceIdentity.sourceNodeId='foreign';actual.nodes[2].appearance.opacity=.4;
 const out=materializeCatalogBaseline(actual,ref).snapshot;
 assert.equal(out.nodes[1].baselineProvenance.status,'unresolved');
 assert.equal(out.nodes[2].baselineProvenance.status,'matched');
 assert.equal(out.nodes[2].baseline.effective.appearance.opacity,1);
 assert.equal(out.nodes[2].appearance.opacity,.4);
});

function modeAliasFixture(){
 const f=fontModeFixture(),native=f.response.structure[0].nativeAuditFactsV1;
 const alias=plain(native.resources.collections['font-col']);alias.id='font-col-alias';
 alias.defaultModeId='alias-old';alias.modes=[{modeId:'alias-old',name:'Original'},{modeId:'alias-sf',name:'System'}];
 native.resources.collections[alias.id]=alias;native.facts.resolvedModes[alias.id]='alias-old';
 f.witnesses.push(Object.assign({},f.witnesses[0],{sourceId:alias.id}));sign(f.response);return f;
}
test('one native collection mode projects all independently keyed source aliases',()=>{
 const f=modeAliasFixture(),prepared=build(f.response,f.contract,f.expected),before=JSON.stringify(prepared);
 const result=remap(prepared,f.witnesses),root=result.snapshot.nodes[0],child=result.snapshot.nodes[1];
 assert.equal(root.resolvedModes['consumer-font'],'consumer-sf');
 assert.equal(child.resolvedModes['consumer-font'],'consumer-sf');
 assert.equal(child.text.fontName.family,'System');
 assert.equal(child.text.letterSpacing.value,-.32);
 assert.equal(JSON.stringify(prepared),before);
});
test('collection aliases cannot hide conflicting consumer domains or missing source modes',()=>{
 const f=modeAliasFixture();f.witnesses[2].consumerModes=[{modeId:'consumer-sf',name:'Original'}];
 assert.throws(()=>remap(build(f.response,f.contract,f.expected),f.witnesses),/CATALOG_MODE_IDENTITY_AMBIGUOUS/);
 const g=modeAliasFixture();g.response.structure[0].nativeAuditFactsV1.resources.collections['font-col-alias'].modes.pop();sign(g.response);
 assert.throws(()=>remap(build(g.response,g.contract,g.expected),g.witnesses),/CATALOG_MODE_CONFIGURATION_UNSUPPORTED/);
 const h=modeAliasFixture();h.response.structure[1].nativeAuditFactsV1.facts.explicitModes['font-col-alias']='alias-old';sign(h.response);
 const uncertain=remap(build(h.response,h.contract,h.expected),h.witnesses).snapshot;
 assert(uncertain.nodes[1].unknownFacts.includes('appearance'));
 assert(uncertain.nodes[1].unknownFacts.includes('resolvedModes'));
 assert(!uncertain.nodes[0].unknownFacts.includes('appearance'));
 assert.equal(uncertain.nodes[0].resolvedModes['consumer-font'],'consumer-sf');
});

test('unsupported COLOR rendering is field-local UNKNOWN while independent mode facts survive',()=>{
 const f=fontModeFixture(),raw=f.response.structure[0].nativeAuditFactsV1;
 raw.resources.variables.color={id:'color',key:'4'.repeat(40),variableCollectionId:'font-col',resolvedType:'COLOR',valuesByMode:{old:{r:1,g:0,b:0,a:1},sf:{r:0,g:1,b:0,a:1}}};
 const child=f.response.structure[1].nativeAuditFactsV1.facts;child.variable.bindings.fills={tokenIds:['color']};
 child.appearance.fill=[{type:'SOLID',color:{r:255,g:0,b:0},tokenId:'color'}];sign(f.response);
 const base=remap(build(f.response,f.contract,f.expected),f.witnesses).snapshot;
 assert.equal(base.nodes[1].text.fontName.family,'System');
 assert(base.nodes[1].unknownFacts.includes('appearance.fill'));
 const actual=plain(base);actual.nodes[1].unknownFacts=[];
 const result=materializeCatalogBaseline(actual,base).snapshot;
 assert(result.nodes[1].unknownFacts.includes('baseline.effective.appearance.fill'));
 const invalid=fontModeFixture();invalid.response.structure[0].nativeAuditFactsV1.resources.variables.color=plain(raw.resources.variables.color);
 invalid.response.structure[0].nativeAuditFactsV1.resources.variables.color.valuesByMode.sf={r:2,g:0,b:0,a:1};
 invalid.response.structure[1].nativeAuditFactsV1.facts.variable.bindings.fills={tokenIds:['color']};sign(invalid.response);
 assert.throws(()=>remap(build(invalid.response,invalid.contract,invalid.expected),invalid.witnesses),/CATALOG_VARIABLE_TYPE_MISMATCH/);
});

function rawFixture() {
 const f=fixture();baselineRule(f,'text.fontSize');
 f.response.provenance.assembler='apollo-v3.resolveStructure';
 f.response.componentFamilies={[A]:B,[B]:B};
 f.response.structure=[
  {id:1,parentId:null,name:'View=primary',path:'View=primary',type:'COMPONENT',visible:true,layout:{padding:{top:0,right:0,bottom:0,left:0},itemSpacing:4},opacity:1,radius:8},
  {id:2,parentId:1,name:'Label',path:'View=primary / Label',type:'TEXT',visible:true,layout:{width:40,height:20},radius:0,text:{characters:'Label',fontName:'Fixture Regular',fontSize:16,lineHeight:20,letterSpacing:0},styles:{text:{styleKey:'S:'+C+',1:2'}}},
 ];
 f.contract.facts.variantEvidence.variants[0].properties={View:'primary'};
 f.contract.facts.semanticApi=[];
 sign(f.response);return f;
}
const rawModule=sourceModule(path.join(__dirname,'../packages/component-contract-core/src/raw-catalog-reference.ts'));
test('raw references pin the original compiled source and do not infer optional absence without owner proof',()=>{
  const f=rawFixture(),stable=sourceModule(path.join(__dirname,'../packages/component-contract-core/src/stable.ts'));
  f.contract.facts.targets.push({id:'absent',semanticRole:'absent',pathHint:'Button / Absent',resolution:'resolved'});
  const p=build(f.response,f.contract,f.expected),a=rawActual(p);
  assert.equal(p.snapshot.source.rawCatalogue.compiledContractHash,stable.stableHash(f.contract));
  rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
  assert.equal(a.declaredTargetIdentitiesV1.targets.find(t=>t.targetId==='absent').status,'unknown');
});
function rawActual(prepared) {
 const s=plain(prepared.snapshot);delete s.source.rawCatalogue;
 s.source.rootNodeId='observed';s.source.instanceIdentityVersion=1;
 s.nodes[0].component.identity={componentKey:A,componentSetKey:B,mainComponentId:'observed-main'};
 return s;
}

function nestedRawFixture() {
 const f=rawFixture();
 Object.assign(f.response.componentFamilies,{[C]:D,[E]:D});
 f.response.structure.push({id:3,parentId:1,name:'Part',path:'View=primary / Part',type:'INSTANCE',visible:true,
  componentInstance:{componentKey:C,variantProperties:{Type:'Old'}}},
  {id:4,parentId:3,name:'Caption',path:'View=primary / Part / Caption',type:'TEXT',visible:true,text:{fontSize:12}});
 f.expected.selection.hostContext={nestedComponentKeys:[E]};f.response.selection=plain(f.expected.selection);
 f.response.provenance.familyCatalogs=[{file:'nested.json',sha256:H}];
 f.response.nestedReferences=[C,E].map(k=>({componentKey:k,componentSetKey:D,component:{key:D},variant:{key:k,name:'Type='+(k===C?'Old':'New')},
  catalog:{file:'nested.json',sha256:H},structure:[
   {id:1,parentId:null,name:'Type=source',path:'Type=source',type:'COMPONENT',visible:true},
   {id:2,parentId:1,name:'Caption',path:'Type=source / Caption',type:'TEXT',visible:true,text:{fontSize:k===C?12:18}},
  ]}));
 sign(f.response);return f;
}
test('raw nested variant uses its exact pinned facts and preserves independently proved enclosing overrides',()=>{
 for(const [wrapper,expected] of [[12,18],[14,14]]) {
  const f=nestedRawFixture();f.response.structure[3].text.fontSize=wrapper;sign(f.response);
  const p=build(f.response,f.contract,f.expected),a=rawActual(p);
  a.nodes[2].component.identity={componentKey:E,componentSetKey:D};a.nodes[3].text.fontSize=22;
  rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
  assert.equal(a.nodes[3].baseline.effective.text.fontSize,expected);
  assert.equal(a.nodes[3].baselineProvenance.basis,'pinned-raw-nested-variant');
  assert.equal(a.nodes[3].text.fontSize,22);
 }
});
test('direct raw owner proof cannot consume a nested-variant source even when captured actuals agree',()=>{
  const f=nestedRawFixture(),p=build(f.response,f.contract,f.expected),a=rawActual(p);
  a.nodes[2].component.identity={componentKey:E,componentSetKey:D};
  for(const n of a.nodes)n.resolvedModes={};a.context.unknownFacts=[];
  Object.assign(a.source,{occurrenceAddressVersion:1,fileKey:'synthetic',pageId:'page',representationId:'desktop',
    catalogueNodeIds:Object.fromEntries(a.nodes.map(n=>[n.id,'host:'+n.id])),catalogReference:{referenceHash:f.response.referenceHash,releaseId:H}});
  a.rawCatalogueReference={base:p.snapshot};
  const part=a.nodes[2],child=plain(a),childContract=plain(f.contract);
  childContract.facts.representations[0].locator={componentSetKey:D};
  const childBase=plain(p.snapshot.nodes[0].rawNestedReferencesV1.find(s=>s.source.componentKey===E));
  const stable=sourceModule(path.join(__dirname,'../packages/component-contract-core/src/stable.ts'));
  childBase.source.rawCatalogue.compiledContractHash=stable.stableHash(childContract);
  child.selection=[part.id];child.nodes=child.nodes.slice(2);child.nodes[0].parentId=null;
  Object.assign(child.source,{componentKey:E,componentSetKey:D,rootNodeId:a.source.catalogueNodeIds[part.id]});child.rawCatalogueReference={base:childBase};
  assert.equal(rawModule.rawCatalogCorrespondence(a,p.snapshot,f.contract).matches.get(part.id).kind,'pinned-raw-nested-variant');
  a.componentDependencyCaptures=[{nodeId:part.id,snapshot:child,nodeMap:Object.fromEntries(child.nodes.map(n=>[n.id,n.id]))}];
  const dependencies=sourceModule(path.join(__dirname,'../packages/component-contract-core/src/component-dependencies.ts'));
  assert.equal(dependencies.validatedDirectRawOwnerCapture(a,part.id,f.contract,childContract).ownerBaseline,undefined);
});
test('nested raw identity, source pins and full request identity reject wrong or stale references',()=>{
 for(const mutate of [f=>f.response.nestedReferences[1].variant.key=C,
  f=>f.response.nestedReferences[1].catalog.sha256='2'.repeat(64),
  f=>f.response.nestedReferences.push(plain(f.response.nestedReferences[1]))]) {
  const f=nestedRawFixture();mutate(f);sign(f.response);assert.throws(()=>build(f.response,f.contract,f.expected),/CATALOG_NESTED/);
 }
 const stale=nestedRawFixture();stale.expected.selection.hostContext.nestedComponentKeys=[C];
 assert.throws(()=>build(stale.response,stale.contract,stale.expected),/CATALOG_REQUEST_MISMATCH/);
 const oldProxy=nestedRawFixture();delete oldProxy.response.nestedReferences;sign(oldProxy.response);
 assert.throws(()=>build(oldProxy.response,oldProxy.contract,oldProxy.expected),/CATALOG_NESTED_REFERENCES_UNAVAILABLE/);
 for(const context of [{width:1200},{nestedComponentKeys:[E],extra:true},{nestedComponentKeys:[E,E]},
  {nestedComponentKeys:['bad']},{nestedComponentKeys:null}]) {
  const f=nestedRawFixture();f.expected.selection.hostContext=context;f.response.selection=plain(f.expected.selection);sign(f.response);
  assert.throws(()=>build(f.response,f.contract,f.expected),/CATALOG_HOST_CONTEXT_UNSUPPORTED/);
 }
 const native=fixture();native.expected.selection.hostContext={nestedComponentKeys:[C]};native.response.selection=plain(native.expected.selection);sign(native.response);
 assert.throws(()=>build(native.response,native.contract,native.expected),/CATALOG_HOST_CONTEXT_UNSUPPORTED/);
});
test('exact nested global key tolerates absent optional set metadata but refuses contradicted identity',()=>{
 const f=nestedRawFixture();delete f.expected.selection.hostContext;delete f.response.selection.hostContext;delete f.response.nestedReferences;
 delete f.response.componentFamilies[C];delete f.response.componentFamilies[E];sign(f.response);
 const p=build(f.response,f.contract,f.expected);
 for(const [actualKey,set,matched] of [[C,D,true],[E,D,false]]) {
  const a=rawActual(p);a.nodes[2].component.identity={componentKey:actualKey,componentSetKey:set};
  assert.equal(rawModule.rawCatalogCorrespondence(a,p.snapshot,f.contract).matches.has(a.nodes[2].id),matched);
 }
 p.snapshot.nodes[2].component.identity.componentSetKey=D;
 const a=rawActual(p);a.nodes[2].component.identity.componentSetKey=B;
 assert.equal(rawModule.rawCatalogCorrespondence(a,p.snapshot,f.contract).matches.has(a.nodes[2].id),false);
 delete p.snapshot.nodes[2].component.identity.componentSetKey;
 p.snapshot.source.rawCatalogue.familyIssues=[{code:'CATALOG_COMPONENT_FAMILY_AMBIGUOUS',componentKey:C}];
 a.nodes[2].component.identity.componentSetKey=D;
 assert.equal(rawModule.rawCatalogCorrespondence(a,p.snapshot,f.contract).matches.has(a.nodes[2].id),false,'explicit catalog family conflict is not optional missing metadata');
});
test('known uniform raw stroke compares equal to equal sides and detects every changed side',()=>{
 const {evaluateExpression}=sourceModule(path.join(__dirname,'../packages/component-contract-core/predicate/index.js'));
 for(const [actual,truth] of [[1,'true'],[2,'false'],[{top:1,right:1,bottom:1,left:1},'true'],
  ...['top','right','bottom','left'].map(side=>[Object.assign({top:1,right:1,bottom:1,left:1},{[side]:2}),'false'])]) {
  const f=rawFixture();f.response.structure[0].strokeWeight=1;sign(f.response);
  const p=build(f.response,f.contract,f.expected),a=rawActual(p);a.nodes[0].appearance.strokeWeight=actual;
  rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
  assert(!a.nodes[0].unknownFacts.includes('baseline.effective.appearance.strokeWeight'));
  const result=evaluateExpression({predicate:'matches-effective-baseline',actual:{fact:'appearance.strokeWeight'},
   expected:{fact:'baseline.effective.appearance.strokeWeight'}},a.nodes[0],a);
  assert.equal(result.truth,truth,JSON.stringify(actual));assert.equal(p.snapshot.nodes[0].appearance.strokeWeight,1,'source remains immutable');
 }
});
test('missing/null or source-proven inherited stroke ambiguity stays unknown independently of actual representation',()=>{
 const {evaluateExpression}=sourceModule(path.join(__dirname,'../packages/component-contract-core/predicate/index.js'));
 for(const source of ['missing','null','inherited'])for(const actual of [2,{top:1,right:1,bottom:1,left:2}]) {
  const f=rawFixture();
  if(source==='null')f.response.structure[0].strokeWeight=null;
  if(source==='inherited')Object.assign(f.response.structure[0],{strokeWeight:1,catalogStrokeWeightUncertainty:{
   reason:'inherited-scalar-may-have-lost-undefined-clear',baseVariantKey:C,selectedVariantKey:A}});
  sign(f.response);const p=build(f.response,f.contract,f.expected),a=rawActual(p);a.nodes[0].appearance.strokeWeight=actual;
  rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
  assert(a.nodes[0].unknownFacts.includes('baseline.effective.appearance.strokeWeight'));
  assert.equal(evaluateExpression({predicate:'matches-effective-baseline',actual:{fact:'appearance.strokeWeight'},
   expected:{fact:'baseline.effective.appearance.strokeWeight'}},a.nodes[0],a).truth,'unknown');
 }
});
test('raw nested request keeps all129+ valid keys and still returns the known exact variant',()=>{
 for(const count of [129,256]) {
  const f=nestedRawFixture();f.expected.selection.hostContext.nestedComponentKeys=[E,...Array.from({length:count-1},(_,i)=>i.toString(16).padStart(40,'0'))];
  f.response.selection=plain(f.expected.selection);sign(f.response);
  const p=build(f.response,f.contract,f.expected);
  assert.equal(p.configuration.hostContext.nestedComponentKeys.length,count);
  assert(p.snapshot.nodes[0].rawNestedReferencesV1.some(s=>s.source.componentKey===E));
 }
});
test('declared native continuity requires matched raw lineage and the exact captured owner address',()=>{
 for(const address of ['Iowner;20:1','Iowner;20:9',undefined]) {
  const f=nestedRawFixture();delete f.expected.selection.hostContext;delete f.response.selection.hostContext;delete f.response.nestedReferences;
  f.contract.runtimePolicy.nativeSourceContinuityVersion=1;
  f.contract.facts.targets.push({id:'service',semanticRole:'service',resolution:'resolved',pathHint:'Button / SERVICE',
   nativeSourceContinuity:{version:1,anchorTargetId:'root',nodeType:'INSTANCE',sources:[{ownerComponentKey:A,sourceNodeId:'20:1'}]}});
  sign(f.response);const p=build(f.response,f.contract,f.expected),a=rawActual(p);
  a.source.catalogueNodeIds={'raw:3':address};rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
  assert.equal(a.declaredTargetIdentitiesV1.targets.find(t=>t.targetId==='service').status,address==='Iowner;20:1'?'resolved':'unknown');
 }
});
test('raw continuity visibility preserves visible, hidden and uncertain captured ancestry',()=>{
 for(const state of ['visible','hidden','unknown','missing-visible','missing-parent','cycle']) {
  const f=nestedRawFixture();f.contract.runtimePolicy.nativeSourceContinuityVersion=1;
  f.contract.facts.targets.push({id:'service',semanticRole:'service',resolution:'resolved',pathHint:'Button / SERVICE',
   nativeSourceContinuity:{version:1,anchorTargetId:'root',nodeType:'INSTANCE',sources:[{ownerComponentKey:A,sourceNodeId:'20:1'}]}});
  sign(f.response);const p=build(f.response,f.contract,f.expected),a=rawActual(p);
  a.source.catalogueNodeIds={'raw:3':'Iowner;20:1'};
  if(state==='hidden')a.nodes[0].visible=false;
  if(state==='unknown')a.nodes[0].unknownFacts.push('visible');
  if(state==='missing-visible')delete a.nodes[0].visible;
  if(state==='missing-parent')a.nodes[2].parentId='missing';
  if(state==='cycle')a.nodes[0].parentId='raw:3';
  rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
  const fact=a.declaredTargetIdentitiesV1.targets.find(t=>t.targetId==='service');
  assert.equal(fact.effectiveVisible,state==='visible'?true:state==='hidden'?false:undefined,state);
  assert.equal(a.nodes[0].semanticTargets.service?.visibilityKnown,['visible','hidden'].includes(state)?true:undefined,state);
 }
});
test('raw applicability uses source capabilities without guessing layout, strokes or flow',()=>{
 const f=rawFixture();f.contract.capabilities.facts=['paddingApplicable','axisAlignmentApplicable','gapApplicable','strokePresent']
  .map(k=>'baseline.effective.propertyActivityV1.'+k);
 f.response.structure.push({id:3,parentId:1,name:'Caption',type:'TEXT',visible:true});sign(f.response);
 f.response.structure.push({id:4,parentId:1,name:'Pane',type:'FRAME',visible:true,layout:{padding:{top:0,right:0,bottom:0,left:0}}});sign(f.response);
 const p=build(f.response,f.contract,f.expected),root=p.snapshot.nodes[0],label=p.snapshot.nodes[1];
 assert.deepEqual(plain(label.propertyActivityV1),{gapApplicable:false,paddingApplicable:false,axisAlignmentApplicable:false});
 assert.equal(root.propertyActivityV1.paddingApplicable,undefined,'REST CLI padding does not prove auto-layout');
 assert.equal(p.snapshot.nodes[3].propertyActivityV1.paddingApplicable,undefined,'FRAME padding without known mode remains unknown');
 assert.deepEqual(plain(root.layout.padding),{top:0,right:0,bottom:0,left:0},'recorded values remain available');
 for(const fact of ['axisAlignmentApplicable','gapApplicable','strokePresent']) {
  assert.equal(root.propertyActivityV1[fact],undefined,fact);
  assert(root.unknownFacts.includes('propertyActivityV1.'+fact));
 }
 assert.equal(root.layout.mode,undefined);assert.equal(root.appearance.stroke,undefined);
 delete f.response.structure[0].layout.padding;sign(f.response);
 assert.equal(build(f.response,f.contract,f.expected).snapshot.nodes[0].propertyActivityV1.paddingApplicable,undefined);
 f.response.structure[0].layout.direction='H';f.response.structure[0].strokes=[];sign(f.response);
 const explicit=build(f.response,f.contract,f.expected).snapshot.nodes[0];
 assert.equal(explicit.propertyActivityV1.paddingApplicable,true,'explicit source flow mode proves padding applicability');
 assert.equal(explicit.propertyActivityV1.axisAlignmentApplicable,true);
 assert.equal(explicit.propertyActivityV1.gapApplicable,undefined,'unknown child positioning is not a flow proof');
 assert.equal(explicit.propertyActivityV1.strokePresent,false,'explicit empty array is different from omitted strokes');
});
test('raw line-height references require the exact pinned restored text target',()=>{
 const {materializeLineHeightReferences}=sourceModule(path.join(__dirname,'../packages/component-contract-core/src/line-height-reference.ts'));
 for(const state of ['known','percent','wrong-manual','wrong-reference','wrong-source','wrong-node','ambiguous','missing','unknown-font','zero','unit']) {
  const f=rawFixture();f.contract.capabilities.facts=['lineHeightReferenceV1.caption'];
  f.contract.facts.targets.push({id:'caption',semanticRole:'caption',resolution:'resolved',pathHint:'Button / Label'});
  if(state==='missing')delete f.response.structure[1].text.lineHeight;
  sign(f.response);const p=build(f.response,f.contract,f.expected),a=rawActual(p);a.rawCatalogueReference={base:p.snapshot};
  rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
  const label=a.nodes[1],ledger=a.declaredTargetIdentitiesV1;
  if(state==='percent'||state==='unknown-font')label.baseline.effective.text.lineHeight={unit:'PERCENT',value:150};
  if(state==='unknown-font')label.unknownFacts.push('baseline.effective.text.fontSize');
  if(state==='zero')label.baseline.effective.text.lineHeight.value=0;
  if(state==='unit')label.baseline.effective.text.lineHeight.unit='UNSUPPORTED';
  if(state==='wrong-manual')ledger.manualSourceHash='9'.repeat(64);
  if(state==='wrong-reference')ledger.referenceHash='9'.repeat(64);
  if(state==='wrong-source')a.nodes[0].component.identity.componentKey=E;
  if(state==='wrong-node')ledger.targets.find(t=>t.targetId==='caption').nodeId=a.nodes[0].id;
  if(state==='ambiguous')a.nodes.push(Object.assign(plain(label),{id:'other-text'}));
  materializeLineHeightReferences(a,f.contract);
  assert.equal(a.nodes[0].lineHeightReferenceV1.caption,state==='known'?20:state==='percent'?24:undefined,state);
 }
 const f=rawFixture(),p=build(f.response,f.contract,f.expected),native=rawActual(p);
 f.contract.capabilities.facts=['lineHeightReferenceV1.caption'];
 f.contract.facts.targets.push({id:'caption',semanticRole:'caption',resolution:'resolved',pathHint:'Button / Label'});
 native.nodes[0].variantAvailability={status:'verified'};native.nodes[1].semantic.role='caption';
 native.nodes[1].baseline={effective:{text:{lineHeight:{unit:'PIXELS',value:20}}}};
 native.nodes[1].baselineProvenance={status:'matched'};
 materializeLineHeightReferences(native,f.contract);
 assert.equal(native.nodes[0].lineHeightReferenceV1.caption,20,'existing native path is preserved');
 native.nodes[0].variantAvailability.status='unknown';materializeLineHeightReferences(native,f.contract);
 assert.equal(native.nodes[0].lineHeightReferenceV1.caption,undefined,'unproved nonraw target remains unknown');
});
test('raw hidden dependency targets become inactive only with current exact owner proof',()=>{
 const dependencies=sourceModule(path.join(__dirname,'../packages/component-contract-core/src/component-dependencies.ts'));
 const {materializeDependencyFacts}=sourceModule(path.join(__dirname,'../packages/component-contract-core/src/dependency-facts.ts'));
 const {stableHash}=sourceModule(path.join(__dirname,'../packages/component-contract-core/src/stable.ts'));
 for(const state of ['off','visible','unknown-visible','unknown-ancestor','missing','ambiguous','wrong-key','wrong-manual','wrong-reference','wrong-path','wrong-ledger-node','truncated','wrong-platform','wrong-representation','bad-pin','bad-binding','issue','scoped','direct-child']) {
  const f=nestedRawFixture();
  f.contract.package.snapshotProfile='dependency-facts-v5';
  f.contract.facts.targets.push({id:'addon',semanticRole:'addon',resolution:'resolved',pathHint:'Button / Part'});
  const child={schemaVersion:'apollo.component-contract.v2.1-experimental',documentType:'component-contract',package:{componentId:'fixture.child',manualRevision:1,manualSourceHash:H},
   rules:[],nonExecutableRules:[],customizationPolicy:[],capabilities:{facts:[]},facts:{component:{},targets:[],representations:[],semanticApi:[],generation:{profiles:[]}},runtimePolicy:{engine:'apollo-predicate-engine',unknownPolicy:'fail-closed'}};
  const binding={id:'child',targetRole:'addon',relativePath:'',ownerComponentSetKeys:[D],activeVariant:{property:'Type',values:['Spinner']},childPath:'Spinner'};
  if(state==='scoped'){binding.kind='fixed-nested-scoped';binding.representationIds=['desktop'];}
  if(state==='direct-child')binding.kind='direct-child';
  if(state==='bad-binding')binding.childPath='.. / Other';
  const dependency={id:'child',componentId:'fixture.child',revision:1,manualSourceHash:H,compiledHash:stableHash(child),contract:child,bindings:[binding]};
  if(state==='issue')dependency.issue='dependency-pin-mismatch';
  if(state==='bad-pin')dependency.compiledHash='9'.repeat(64);
  f.contract.componentDependencies=[dependency];
  f.contract.facts.dependencyBindings=[{id:'nested',targetRole:'addon',relativePath:'',portNames:[],contractDependencyId:'child'},
   {id:'asset',targetRole:'addon',relativePath:'',portNames:[]}];
  sign(f.response);const p=build(f.response,f.contract,f.expected),a=rawActual(p);a.rawCatalogueReference={base:p.snapshot};
  a.source.representationId='desktop';a.context.platform='desktop';
  const part=a.nodes.find(n=>n.id==='raw:3');part.visible=state==='visible';
  a.nodes[0].component.properties.Addon=false;a.nodes[0].component.propertyTypes.Addon='BOOLEAN';
  part.component.propertyReferences=['Addon'];part.component.propertyReferenceBindings={visible:'Addon'};
  rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
  if(state==='unknown-visible')part.unknownFacts.push('visible');
  if(state==='unknown-ancestor')a.nodes[0].unknownFacts.push('visible');
  if(state==='missing')a.declaredTargetIdentitiesV1.targets=a.declaredTargetIdentitiesV1.targets.filter(t=>t.targetId!=='addon');
  if(state==='ambiguous')a.declaredTargetIdentitiesV1.targets.push(plain(a.declaredTargetIdentitiesV1.targets.find(t=>t.targetId==='addon')));
  if(state==='wrong-key')a.nodes[0].component.identity.componentKey=E;
  if(state==='wrong-manual')a.declaredTargetIdentitiesV1.manualSourceHash='9'.repeat(64);
  if(state==='wrong-reference')a.declaredTargetIdentitiesV1.referenceHash='9'.repeat(64);
  if(state==='wrong-path')a.declaredTargetIdentitiesV1.targets.find(t=>t.targetId==='addon').referencePath='Other';
  if(state==='wrong-ledger-node')a.declaredTargetIdentitiesV1.targets.find(t=>t.targetId==='addon').nodeId=a.nodes[0].id;
  if(state==='truncated')a.source.truncated=true;
  if(state==='wrong-platform')a.context.platform='mobile-web';
  if(state==='wrong-representation')a.source.representationId='other';
  const result=dependencies.resolveFixedNestedBinding(a,dependency,binding,false,f.contract);
  assert.equal(result.status,state==='off'?'inactive':'unknown',state);
  materializeDependencyFacts(a,f.contract);
  assert.equal(a.nodes[0].dependencies.nested.applicable,state==='off'?false:undefined,state);
  if(!['scoped','direct-child','issue','bad-pin','bad-binding'].includes(state))assert.equal(a.nodes[0].dependencies.asset.applicable,state==='off'?false:undefined,state);
 }
});
test('raw closed member collections retain typed assertions and refuse unproved structure',()=>{
 const {materializeMemberCollections}=sourceModule(path.join(__dirname,'../packages/component-contract-core/src/member-collections.ts'));
 for(const state of ['known','known-hidden','wrong-property','wrong-property-hidden','extra-with-violation','non-member','missing-non-member','foreign-non-member','source-ambiguous','property-unknown','missing','extra','foreign','wrong-manual','wrong-reference','wrong-platform','wrong-key','wrong-ledger','unknown-graph','truncated','unknown-visibility']) {
  const f=nestedRawFixture();f.response.structure=f.response.structure.filter(n=>n.id!==2);
  f.response.structure.find(n=>n.id===3).componentInstance.variantProperties.Type='primary';
  f.response.nestedReferences.find(r=>r.componentKey===C).variant.name='Type=primary';
  f.contract.runtimePolicy.memberCollectionsVersion=1;
  f.contract.facts.targets.push({id:'member',semanticRole:'member',resolution:'resolved',pathHint:'Button / Part'});
  f.contract.facts.memberCollections=[{id:'domain',collection:{version:1,ownerTargetRole:'root',memberTargetRoles:['member'],representationIds:['desktop'],visibleOnly:true,assertion:{kind:'propertyDomain',property:'Type',propertyType:'VARIANT',values:['primary']}}},
   {id:'mapping',collection:{version:1,ownerTargetRole:'root',memberTargetRoles:['member'],representationIds:['desktop'],visibleOnly:false,assertion:{kind:'propertyMapping',property:'Type',propertyType:'VARIANT',hostProperty:'View',hostPropertyType:'VARIANT'}}},
   {id:'outside',collection:{version:1,ownerTargetRole:'root',memberTargetRoles:['member'],representationIds:['mobile'],visibleOnly:false,assertion:{kind:'count',min:1,max:1}}}];
  if(['known-hidden','wrong-property-hidden'].includes(state))f.contract.facts.memberCollections[0].collection.visibleOnly=false;
  if(state.includes('non-member')) {
   f.response.structure.push({id:5,parentId:1,name:'Divider',type:'FRAME',visible:true});
   for(const entry of f.contract.facts.memberCollections)entry.collection.nonMemberReferenceTypes=['FRAME'];
  }
  if(state==='source-ambiguous')f.response.structure.push(Object.assign(plain(f.response.structure.find(n=>n.id===3)),{id:5}));
  sign(f.response);const p=build(f.response,f.contract,f.expected),a=rawActual(p);a.rawCatalogueReference={base:p.snapshot};a.source.representationId='desktop';a.context.platform='desktop';a.source.occurrenceAddressVersion=1;
  const part=a.nodes.find(n=>n.id==='raw:3');
  if(['wrong-property','wrong-property-hidden','extra-with-violation'].includes(state)){part.component.identity.componentKey=E;part.component.properties.Type='New';}
  if(['known-hidden','wrong-property-hidden'].includes(state))part.visible=false;
  if(state==='missing-non-member'){a.nodes=a.nodes.filter(n=>n.id!=='raw:5');a.nodes[0].childIds=a.nodes[0].childIds.filter(id=>id!=='raw:5');}
  if(state==='foreign-non-member')a.nodes.find(n=>n.id==='raw:5').type='RECTANGLE';
  if(state==='property-unknown')delete part.component.propertyTypes.Type;
  if(state==='extra-with-violation'){a.nodes.push({id:'extra-frame',parentId:a.nodes[0].id,childIds:[],name:'Extra',type:'FRAME',visible:true,unknownFacts:[]});a.nodes[0].childIds.push('extra-frame');}
  if(state==='missing'){a.nodes=a.nodes.filter(n=>!['raw:3','raw:4'].includes(n.id));a.nodes[0].childIds=[];}
  if(state==='extra'){a.nodes.push(Object.assign(plain(part),{id:'extra',childIds:[]}));a.nodes[0].childIds.push('extra');}
  if(state==='foreign')part.component.identity={componentKey:H.slice(0,40),componentSetKey:H.slice(0,40)};
  rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
  if(state==='wrong-manual')a.declaredTargetIdentitiesV1.manualSourceHash='9'.repeat(64);
  if(state==='wrong-reference')a.declaredTargetIdentitiesV1.referenceHash='9'.repeat(64);
  if(state==='wrong-platform')a.context.platform='mobile-web';
  if(state==='wrong-key')a.nodes[0].component.identity.componentKey=E;
  if(state==='unknown-graph')a.nodes[0].unknownFacts.push('childIds');
  if(state==='wrong-ledger')a.declaredTargetIdentitiesV1.targets.find(t=>t.targetId==='member').nodeId='wrong';
  if(state==='truncated')a.source.truncated=true;
  if(state==='unknown-visibility')part.unknownFacts.push('visible');
  materializeMemberCollections(a,f.contract);const facts=a.nodes[0].memberCollectionsV1;
  if(['known','known-hidden','non-member'].includes(state))for(const id of ['domain','mapping']){assert.deepEqual(plain(facts[id].missing),[]);assert.deepEqual(plain(facts[id].violations),[]);}
  else if(['wrong-property','wrong-property-hidden','extra-with-violation'].includes(state))for(const id of ['domain','mapping'])assert.equal(facts[id].violations.length,1,id);
  else assert(facts.domain.missing.length||facts.domain.violations?.length,state+' must not pass');
  if(['known','wrong-property'].includes(state))assert.equal(facts.outside.active,false);
  if(['wrong-manual','wrong-reference','wrong-platform','truncated'].includes(state))assert.notEqual(facts.outside.active,false,state+' cannot authorize representation inactivity');
 }
});
test('raw collection first and last use actual child order across allowed non-member siblings',()=>{
 const {materializeMemberCollections}=sourceModule(path.join(__dirname,'../packages/component-contract-core/src/member-collections.ts'));
 for(const position of ['first','last'])for(const reversed of [false,true])for(const divider of [false,true]) {
  const f=nestedRawFixture();f.response.structure=f.response.structure.filter(n=>n.id!==2);
  f.response.structure.push({id:5,parentId:1,name:'Other',type:'INSTANCE',visible:true,componentInstance:{componentKey:E,variantProperties:{Type:'New'}}},
   {id:6,parentId:5,name:'Caption',type:'TEXT',visible:true,text:{fontSize:18}});
  if(divider)f.response.structure.push({id:7,parentId:1,name:'Divider',type:'FRAME',visible:true});
  f.contract.runtimePolicy.memberCollectionsVersion=1;
  f.contract.facts.targets.push({id:'one',semanticRole:'one',resolution:'resolved',pathHint:'Button / Part'},
   {id:'two',semanticRole:'two',resolution:'resolved',pathHint:'Button / Other'});
  f.contract.facts.memberCollections=[{id:'edge',collection:{version:1,ownerTargetRole:'root',memberTargetRoles:['one','two'],
   representationIds:['desktop'],visibleOnly:false,filter:{property:'Type',propertyType:'VARIANT',values:['Old']},assertion:{kind:'position',position},
   ...(divider?{nonMemberReferenceTypes:['FRAME']}:{})}}];
  sign(f.response);const p=build(f.response,f.contract,f.expected),a=rawActual(p);a.rawCatalogueReference={base:p.snapshot};
  a.source.representationId='desktop';a.context.platform='desktop';
  a.nodes[0].childIds=[reversed?'raw:5':'raw:3',...(divider?['raw:7']:[]),reversed?'raw:3':'raw:5'];
  rawModule.materializeRawCatalog(a,p.snapshot,f.contract);materializeMemberCollections(a,f.contract);
  const fact=a.nodes[0].memberCollectionsV1.edge;
  assert.deepEqual(plain(fact.missing),[]);
  assert.deepEqual(plain(fact.memberNodeIds),reversed?['raw:5','raw:3']:['raw:3','raw:5']);
  const correct=position==='first'?!reversed:reversed;
  assert.equal(fact.violations.length,correct?0:1,[position,reversed,divider].join('/'));
  assert.equal(fact.edgeNodeId,correct?'raw:3':'raw:5');
 }
});
test('ordinary raw Athena fields build without a native block and preserve style/typography facts',()=>{
 const f=rawFixture(),before=JSON.stringify(f.response),p=build(f.response,f.contract,f.expected);
 assert.equal(p.snapshot.nodes[1].text.fontSize,16);
 assert.equal(p.snapshot.nodes[1].text.lineHeight.value,20);
 assert.equal(p.snapshot.nodes[1].appearance.typography.styleId,'S:'+C+',1:2');
 assert.equal(p.preparedSourceTopology.nodes.length,0);
 assert.equal(p.snapshot.nodes[1].appearance.radius,undefined,'REST text radius default is not a native radius fact');
 assert(p.snapshot.nodes[1].unknownFacts.includes('component.propertyReferences'));
 assert.equal(JSON.stringify(f.response),before);
});
test('raw style remap uses published key proof across different document-local style IDs',()=>{
 const f=rawFixture(),p=build(f.response,f.contract,f.expected);
 const requirement=p.resourceRequirements.find(r=>r.kind==='style');assert(requirement);
 const q=remap(p,[{kind:'style',sourceId:requirement.sourceId,sourceKey:C,consumerId:'S:'+C+',99:1',consumerKey:C}]);
 assert.equal(q.snapshot.nodes[1].appearance.typography.styleId,'S:'+C+',99:1');
 assert.throws(()=>remap(p,[{kind:'style',sourceId:requirement.sourceId,sourceKey:C,consumerId:'bad',consumerKey:D}]),/CATALOG_RESOURCE_WITNESS_MISMATCH/);
});
test('V3 normalized paint patches override stale raw paint aliases without inventing mode-dependent values',()=>{
 const f=rawFixture(),r=f.response.structure[0];
 r.fills=[{type:'SOLID',color:{r:255,g:0,b:0},tokenKey:'VariableID:'+D+'/1:2'}];
 r.fill={token:'VariableID:'+E+'/1:3',color:'rgba(0,255,0,1)'};r.opacityToken='VariableID:'+D+'/1:2';sign(f.response);
 const p=build(f.response,f.contract,f.expected),n=p.snapshot.nodes[0];
 assert.deepEqual(plain(n.appearance.fill[0].color),{r:0,g:255,b:0});
 assert.equal(n.variable.bindings.fills.tokenIds[0],r.fill.token);
 assert(n.unknownFacts.includes('appearance.fill'));assert(n.unknownFacts.includes('appearance.opacity'));
 assert(p.resourceRequirements.some(r=>r.sourceKey===E));
 assert(!p.resourceRequirements.some(r=>r.sourceKey===D));
});
test('raw effect parameters do not masquerade as a different basic effect in the captured fact schema',()=>{
 const f=rawFixture();f.response.structure[0].effects=[{type:'BACKGROUND_BLUR',radius:80}];sign(f.response);
 const p=build(f.response,f.contract,f.expected);
 assert.deepEqual(plain(p.snapshot.nodes[0].appearance.effects),[{type:'BACKGROUND_BLUR',visible:true}]);
 assert.equal(p.snapshot.nodes[0].appearance.effectDetailsV1,undefined);
});
test('raw effect style singleton arrays retain published identity and resource remap without inventing details',()=>{
 for(const shape of ['array','legacy-object']) {
  const f=rawFixture(),sourceId='S:'+D+',10:20',consumerId='S:'+D+',90:91';
  f.contract.capabilities.facts=['baseline.effective.appearance.effectStyleId','baseline.effective.appearance.effectDetailsV1'];
  f.response.structure[0].styles={effects:shape==='array'?[{styleKey:sourceId}]:{styleKey:sourceId}};
  f.response.structure[0].effects=[{type:'BACKGROUND_BLUR',radius:80}];sign(f.response);
  const prepared=build(f.response,f.contract,f.expected);
  assert.equal(prepared.snapshot.nodes[0].appearance.effectStyleId,sourceId,shape);
  assert(prepared.resourceRequirements.some(r=>r.kind==='style'&&r.sourceId===sourceId&&r.sourceKey===D));
  const textWitness={kind:'style',sourceId:'S:'+C+',1:2',sourceKey:C,consumerId:'S:'+C+',1:2',consumerKey:C};
  const mapped=remap(prepared,[{kind:'style',sourceId,sourceKey:D,consumerId,consumerKey:D},textWitness]);
  assert.equal(mapped.snapshot.nodes[0].appearance.effectStyleId,consumerId);
  assert.equal(mapped.snapshot.nodes[1].appearance.typography.styleId,'S:'+C+',1:2','other style kinds are preserved');
  assert.equal(mapped.snapshot.nodes[0].appearance.effectDetailsV1,undefined);
  assert(mapped.snapshot.nodes[0].unknownFacts.includes('appearance.effectDetailsV1'));
  assert.deepEqual(plain(mapped.snapshot.nodes[0].appearance.effects),[{type:'BACKGROUND_BLUR',visible:true}]);
  assert(remap(prepared,[textWitness]).snapshot.nodes[0].appearance.effectStyleId.startsWith('catalog-source:style:'),'unresolved native identity stays independent');
  assert.throws(()=>remap(prepared,[{kind:'style',sourceId,sourceKey:D,consumerId,consumerKey:E}]),/CATALOG_RESOURCE_WITNESS_MISMATCH/);
 }
});
test('raw effect style arrays reject ambiguous and unpublished identities without guessing a baseline',()=>{
 const valid={styleKey:'S:'+D+',10:20'};
 for(const effects of [[],[valid,valid],[valid,{styleKey:'S:'+E+',1:2'}],[{}],[{styleKey:'S:local'}],
  [{styleKey:'VariableID:'+D+'/1:2'}],[{styleKey:'S:'+D+'/1:2'}],[null]]) {
  const f=rawFixture();f.contract.capabilities.facts=['baseline.effective.appearance.effectStyleId'];
  f.response.structure[0].styles={effects};sign(f.response);const p=build(f.response,f.contract,f.expected);
  assert.equal(p.snapshot.nodes[0].appearance.effectStyleId,undefined);
  assert(p.snapshot.nodes[0].unknownFacts.includes('appearance.effectStyleId'));
  assert(!p.resourceRequirements.some(r=>r.sourceKey===D||r.sourceKey===E));
 }
});
test('raw baseline is independent of a changed actual font size; unknown layout does not erase typography',()=>{
 const f=rawFixture(),p=build(f.response,f.contract,f.expected),a=rawActual(p);
 a.nodes[1].text.fontSize=18;a.nodes[1].baseline={effective:plain(a.nodes[1])};
 rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
 assert.equal(a.nodes[1].baseline.effective.text.fontSize,16);
 assert.equal(a.nodes[1].text.fontSize,18);
 assert(a.nodes[1].unknownFacts.includes('baseline.effective.text.fontSize')===false);
});
for(const mutation of ['duplicate','wrong-parent','foreign-root','unknown-identity','incomplete-topology'])test('raw correspondence rejects '+mutation,()=>{
 const f=rawFixture(),p=build(f.response,f.contract,f.expected),a=rawActual(p);
 if(mutation==='duplicate'){const n=plain(a.nodes[1]);n.id='duplicate';a.nodes.push(n);a.nodes[0].childIds.push(n.id);}
 if(mutation==='wrong-parent')a.nodes[1].parentId='foreign';
 if(mutation==='foreign-root')a.nodes[0].component.identity.componentKey=D;
 if(mutation==='unknown-identity')a.nodes[0].unknownFacts.push('component.identity.componentKey');
 if(mutation==='incomplete-topology')a.source.captureTopology.complete=false;
 rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
 assert.equal(a.nodes[1].baselineProvenance.status,'unresolved');
 assert.deepEqual(plain(a.nodes[1].baseline.effective),{});
});
test('raw proof never grants an explicitly required native source continuity target',()=>{
 const f=rawFixture();f.contract.facts.targets[0].nativeSourceContinuity={version:1};
 const p=build(f.response,f.contract,f.expected),a=rawActual(p);
 rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
 assert.equal(a.declaredTargetIdentitiesV1.targets[0].status,'unknown');
 assert.equal(a.declaredTargetIdentitiesV1.basis,'pinned-raw-catalogue');
});
test('raw reference rejects absent contract variant, malformed parent graph and malformed family identity',()=>{
 for(const change of [f=>f.contract.facts.variantEvidence.variants=[],f=>f.response.structure[1].parentId=999,f=>f.response.componentFamilies[A]='same name']){
  const f=rawFixture();change(f);sign(f.response);assert.throws(()=>build(f.response,f.contract,f.expected),/CATALOG_/);
 }
});

test('raw real collector reads existing nodes without imports, scene writes or native source blocks',async()=>{
 const f=rawFixture();f.contract.package.componentId=f.response.contract.componentId='core.web.button';sign(f.response);
 f.contract.customizationPolicy=[];
 let writes=0;
 const denied=()=>{writes++;throw Error('NO_SCENE_WRITES');};
 const main={id:'library-main',key:A,type:'COMPONENT',remote:true,parent:{type:'COMPONENT_SET',key:B,componentPropertyDefinitions:{View:{}}},createInstance:denied};
 const node=(id,type,name)=>({id,type,name,visible:true,children:[],opacity:1,width:100,height:32,x:0,y:0,
  componentPropertyReferences:{},resolvedVariableModes:{},explicitVariableModes:{},boundVariables:{},fills:[],strokes:[],effects:[]});
 const root=node('20:1','INSTANCE','Button'),label=node('I20:1;10:2','TEXT','Label');
 Object.assign(label,{characters:'Button',textStyleId:'unread-style',fontName:{family:'Fixture',style:'Regular'},fontSize:18});
 root.children=[label];label.parent=root;root.parent={id:'page',type:'PAGE'};
 root.componentProperties={View:{type:'VARIANT',value:'primary'}};root.getMainComponentAsync=async()=>main;
 runtime.figma={mixed:Symbol('mixed'),fileKey:'consumer-file',root:{name:'Consumer'},currentPage:root.parent,
  variables:{getVariableCollectionByIdAsync:async()=>null,getVariableByIdAsync:async()=>null},
  getStyleByIdAsync:async()=>{throw Error('unavailable-style');},getNodeByIdAsync:async()=>null,
  createPage:denied,importComponentByKeyAsync:denied,importComponentSetByKeyAsync:denied};
 const {captureCatalogAudit}=sourceModule(path.join(__dirname,'../src/audit-catalog.ts'));
 const capture=await captureCatalogAudit(root,f.contract,H,async selection=>{f.response.selection=plain(selection);return sign(f.response);},{guard(){},read:work=>work()});
 assert.equal(writes,0);
 assert.equal(capture.snapshot.source.catalogueNodeIds[capture.snapshot.nodes[1].id],label.id);
 assert.equal(capture.snapshot.nodes[1].text.fontSize,18);
 assert.equal(capture.snapshot.nodes[1].baseline.effective.text.fontSize,16);
 assert.equal(capture.snapshot.variantReference,undefined);
 assert(capture.snapshot.rawCatalogueReference.base.source.rawCatalogue);
 const engine=sourceModule(path.join(__dirname,'../packages/component-contract-core/predicate/index.js'));
 const compare=fact=>engine.evaluateExpression({predicate:'equals',actual:{fact},expected:{fact:'baseline.effective.'+fact},missingPolicy:'unknown'},capture.snapshot.nodes[1],capture.snapshot);
 assert.equal(compare('text.fontSize').truth,'false');
 assert.equal(compare('appearance.typography.styleId').truth,'unknown');
});

test('a failed raw correspondence clears previously resolved targets and dependency exemptions',()=>{
 const f=rawFixture(),p=build(f.response,f.contract,f.expected),a=rawActual(p);
 rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
 assert.equal(a.declaredTargetIdentitiesV1.targets[0].status,'resolved');
 a.nodes[0].component.identity.componentKey=D;
 a.rawCatalogueInactiveDependencies=['stale'];a.nodes[0].nativeTargetPropertiesV1={stale:{properties:{Type:'Accent'}}};
 rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
 assert.equal(a.declaredTargetIdentitiesV1.targets[0].status,'unknown');
 assert.equal(a.nodes[0].nativeTargetPropertiesV1,undefined);
 assert.equal(a.rawCatalogueInactiveDependencies,undefined);
 assert.deepEqual(plain(a.nodes[1].baseline.effective),{});
});

function rawNestedFixture(){
 const f=rawFixture();Object.assign(f.response.componentFamilies,{[C]:D,[E]:D});
 f.response.structure.push({id:3,parentId:1,name:'Part',type:'INSTANCE',visible:true,componentInstance:{componentKey:C,variantProperties:{Type:'Primary'}}},
  {id:4,parentId:3,name:'Caption',type:'TEXT',visible:true,text:{fontSize:12}});
 f.contract.facts.targets.push({id:'part',semanticRole:'part',pathHint:'Button / Part',resolution:'resolved'});
 sign(f.response);const prepared=build(f.response,f.contract,f.expected);return {f,prepared,actual:rawActual(prepared)};
}
test('changed variant usage is read on the same proven family without borrowing old descendant baselines',()=>{
 const {f,prepared,actual:a}=rawNestedFixture();
 const part=a.nodes.find(n=>n.name==='Part'),caption=a.nodes.find(n=>n.name==='Caption');
 part.component.identity.componentKey=E;part.component.properties.Type='Accent';caption.text.fontSize=30;
 rawModule.materializeRawCatalog(a,prepared.snapshot,f.contract);
 const ledger=a.declaredTargetIdentitiesV1.targets.find(t=>t.targetId==='part');assert.equal(ledger.status,'resolved');
 const usage=Object.values(a.nodes[0].nativeTargetPropertiesV1).find(p=>p.properties.Type);
 assert.equal(usage.properties.Type,'Accent');
 assert.deepEqual(plain(part.baseline.effective),{});assert.deepEqual(plain(caption.baseline.effective),{});
 assert.equal(a.nodes[1].baseline.effective.text.fontSize,16);
});
test('unrelated or duplicate nested instances cannot take another target while other baselines survive',()=>{
 for(const mode of ['foreign-family','duplicate','unknown-key']){
  const {f,prepared,actual:a}=rawNestedFixture(),part=a.nodes.find(n=>n.name==='Part');
  a.source.occurrenceAddressVersion=1;
  if(mode==='foreign-family')part.component.identity.componentSetKey=A;
  if(mode==='unknown-key')part.unknownFacts.push('component.identity.componentKey');
  if(mode==='duplicate'){const n=plain(part);n.id='duplicate';n.childIds=[];a.nodes.push(n);a.nodes[0].childIds.push(n.id);}
  rawModule.materializeRawCatalog(a,prepared.snapshot,f.contract);
  assert.equal(a.declaredTargetIdentitiesV1.targets.find(t=>t.targetId==='part').status,'unknown',mode);
  assert.equal(a.nodes[1].baseline.effective.text.fontSize,16,mode);
 }
});

test('observed Figma source address identifies duplicate-family usage only, never an ordinal visual baseline',()=>{
 const {f}=rawNestedFixture();f.response.structure.push({id:5,parentId:1,name:'Part',type:'INSTANCE',visible:true,
  componentInstance:{componentKey:C,variantProperties:{Type:'Primary'}}});
 const target=f.contract.facts.targets[1],referencePath='@source:100%3A2';
 target.pathHint='Button / '+referencePath;
 target.identityBindingsV1=[{componentKey:A,representationId:'desktop',referencePath,nativeSource:{sourceNodeId:'100:2',ownerComponentKey:A}}];
 sign(f.response);const p=build(f.response,f.contract,f.expected),a=rawActual(p);
 a.source.occurrenceAddressVersion=1;a.source.catalogueNodeIds={'raw:3':'I20:1;100:2','raw:5':'I20:1;100:3'};
 a.nodes.find(n=>n.id==='raw:3').component.properties.Type='Accent';
 rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
 assert.equal(a.declaredTargetIdentitiesV1.targets[1].nodeId,'raw:3');
 assert(Object.values(a.nodes[0].nativeTargetPropertiesV1).some(p=>p.properties.Type==='Accent'));
 assert.deepEqual(plain(a.nodes.find(n=>n.id==='raw:3').baseline.effective),{});
 a.source.catalogueNodeIds['raw:5']='I20:1;100:2';
 rawModule.materializeRawCatalog(a,p.snapshot,f.contract);
 assert.equal(a.declaredTargetIdentitiesV1.targets[1].status,'unknown');
 assert.equal(a.nodes[1].baseline.effective.text.fontSize,16);
});

function consensusFixture(change=()=>{}) {
 const f=rawFixture();f.contract.capabilities.facts=['baseline.effective.layout.padding.top'];
 f.contract.facts.generation={profiles:[]};f.contract.customizationPolicy=[];f.contract.rules=[];
 Object.assign(f.response.componentFamilies,{[C]:D});
 f.response.structure=f.response.structure.slice(0,1);
 for(const id of [10,20])f.response.structure.push(
  {id,parentId:1,name:'Repeated',type:'INSTANCE',visible:true,layout:{padding:{top:4,right:8,bottom:4,left:8}},componentInstance:{componentKey:C,variantProperties:{View:'Primary'}}},
  {id:id+1,parentId:id,name:'Text',type:'FRAME',visible:true,layout:{padding:{top:0,right:4,bottom:0,left:4}}},
  {id:id+2,parentId:id+1,name:'Label',type:'TEXT',visible:true,text:{fontSize:16}});
 change(f);sign(f.response);const p=build(f.response,f.contract,f.expected),a=rawActual(p);
 Object.assign(a.source,{occurrenceAddressVersion:1,catalogueNodeIds:{[a.selection[0]]:'observed'},catalogReference:{referenceHash:f.response.referenceHash}});
 a.nodes.find(n=>n.id==='raw:20').visible=false;
 return {f,p,a,run:()=>{rawModule.materializeRawCatalog(a,p.snapshot,f.contract);return a.nodes.find(n=>n.id==='raw:10');}};
}
function bundledSource(file){
 const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'..',file)],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
 const m={exports:{}};new Function('require','module','exports',code)(require,m,m.exports);return m.exports;
}
const sourcePredicate=bundledSource('packages/component-contract-core/predicate/index.js');
function consensusEvaluation(a,id,fact,when){
 return sourcePredicate.evaluateRules({snapshot:Object.assign({},a,{selection:[id]}),rules:[{schemaVersion:'apollo.rule-ir.v1',ruleId:'fixture.consensus',revision:1,
  source:{path:'fixture',checksum:H,anchor:'fixture'},authority:{status:'active'},effect:'require',scope:{},select:{from:'selection-root',traverse:'self'},
  when,assert:{predicate:'equals',actual:{fact},expected:{fact:'baseline.effective.'+fact},missingPolicy:'unknown'},severity:'error',unknownPolicy:'human-review'}]}).evaluations[0];
}
test('raw ambiguity refines only common scalar facts and still detects an actual edit',()=>{
 const t=consensusFixture(),node=t.run();
 assert.equal(node.baselineProvenance.status,'partial');assert.equal(node.baselineProvenance.referencePath,undefined);
 assert.equal(node.baselineProvenance.candidates.length,2);assert(node.unknownFacts.includes('baseline.effective'));
 assert.equal(consensusEvaluation(t.a,node.id,'layout.padding.top').classification,'compliant');
 node.layout.padding.top=99;assert.equal(consensusEvaluation(t.a,node.id,'layout.padding.top').classification,'violation');
 assert.equal(consensusEvaluation(t.a,node.id,'layout.padding').classification,'human-review');
 assert.equal(consensusEvaluation(t.a,node.id,'appearance.opacity').classification,'human-review');
 assert.equal(t.a.nodes.find(n=>n.id==='raw:11').baseline.effective.layout.padding.top,0);
 assert.equal(t.a.nodes.find(n=>n.id==='raw:12').baseline.effective.propertyActivityV1.paddingApplicable,false);
 assert.equal(consensusEvaluation(t.a,'raw:12','propertyActivityV1.paddingApplicable',
  {predicate:'equals',actual:{fact:'baseline.effective.propertyActivityV1.paddingApplicable'},expected:{literal:true}}).classification,'not-applicable');
 const again=plain(t.a);rawModule.materializeRawCatalog(t.a,t.p.snapshot,t.f.contract);assert.deepEqual(plain(t.a),again);
});
test('different, omitted, unknown or token-bound source padding does not become a scalar proof',()=>{
 for(const change of [f=>f.response.structure[4].layout.padding.top=9,f=>delete f.response.structure[4].layout.padding.top,
  f=>f.response.structure[4].layout.paddingTokens={top:'unresolved-variable-id'}]){
  const t=consensusFixture(change),n=t.run();assert(!n.knownFacts?.includes('baseline.effective.layout.padding.top'));
  assert.equal(consensusEvaluation(t.a,n.id,'layout.padding.top').classification,'human-review');
 }
 const t=consensusFixture();t.p.snapshot.nodes.find(n=>n.id==='raw:20').unknownFacts.push('layout.padding');
 assert(!t.run().knownFacts?.includes('baseline.effective.layout.padding.top'));
});
test('raw consensus refuses source/model/representation/platform/topology/domain drift',()=>{
 const cases=[
  t=>t.p.snapshot.source.rawCatalogue.manualSourceHash='f'.repeat(64),t=>delete t.p.snapshot.source.rawCatalogue.contractModelHash,
  t=>t.f.contract.runtimePolicy.changed=true,t=>t.f.contract.customizationPolicy.push({id:'changed'}),
  t=>t.f.contract.facts.targets.push({id:'changed'}),t=>t.f.contract.componentDependencies=[{id:'changed',bindings:[]}],
  t=>t.a.source.catalogReference.referenceHash='f'.repeat(64),t=>t.a.source.rootNodeId='foreign',
  t=>t.a.source.representationId='foreign',t=>t.a.context.platform='ios',t=>t.a.context.unknownFacts.push('platform'),
  t=>t.f.contract.facts.representations.push(plain(t.f.contract.facts.representations[0])),
  t=>t.a.source.captureTopology.complete=false,t=>t.a.source.captureTopology.limitReached=true,t=>t.a.source.captureTopology.issues.push('partial'),
  t=>t.a.nodes.find(n=>n.id==='raw:10').unknownFacts.push('component.identity'),
  t=>t.a.nodes.find(n=>n.id==='raw:20').component.identity.componentKey=E,
  t=>t.a.nodes.find(n=>n.id==='raw:20').component.identity.componentSetKey=E,
  t=>t.p.snapshot.source.rawCatalogue.familyIssues.push({componentKey:C,reason:'ambiguous'}),
  t=>t.a.nodes.find(n=>n.id==='raw:20').type='SLOT',
  t=>{const n=plain(t.a.nodes.find(n=>n.id==='raw:20'));n.id='extra';t.a.nodes.push(n);t.a.nodes[0].childIds.push(n.id);},
 ];
 for(const change of cases){const t=consensusFixture();change(t);assert.equal(t.run().knownFacts,undefined);}
});
test('hidden inclusion and order independence do not cross nested INSTANCE/SLOT bodies',()=>{
 const t=consensusFixture();t.p.snapshot.nodes.reverse();t.a.nodes.reverse();t.run();
 assert.equal(t.a.nodes.find(n=>n.id==='raw:10').baseline.effective.layout.padding.top,4);
 for(const type of ['INSTANCE','SLOT']){
  const x=consensusFixture();for(const tree of [x.a,x.p.snapshot])for(const id of ['raw:11','raw:21'])tree.nodes.find(n=>n.id===id).type=type;
  x.run();assert.equal(x.a.nodes.find(n=>n.id==='raw:12').knownFacts,undefined);
 }
 const x=consensusFixture(),extra=plain(x.a.nodes.find(n=>n.id==='raw:12'));extra.id='unread';extra.name='unread';extra.unknownFacts.push('name');
 x.a.nodes.push(extra);x.a.nodes.find(n=>n.id===extra.parentId).childIds.push(extra.id);x.run();
 assert.equal(x.a.nodes.find(n=>n.id==='raw:12').knownFacts,undefined);
});
test('core strips imported scalar proofs in every nested capture and rederives only current evidence',()=>{
 const t=consensusFixture();t.a.rawCatalogueReference={base:t.p.snapshot};
 const node=t.a.nodes.find(n=>n.id==='raw:10');node.baseline={effective:{appearance:{opacity:1}}};node.knownFacts=['baseline.effective.appearance.opacity'];
 const nested=plain(t.a);t.a.componentDependencyCaptures=[{nodeId:'unused',snapshot:nested}];
 const runtime=bundledSource('packages/component-contract-core/src/runtime.ts');
 const prepared=runtime.prepareValidationSnapshot(t.a,t.f.contract);
 assert(!prepared.nodes.find(n=>n.id===node.id).knownFacts.includes('baseline.effective.appearance.opacity'));
 assert.equal(prepared.componentDependencyCaptures[0].snapshot.nodes.find(n=>n.id===node.id).knownFacts,undefined);
 assert.equal(node.knownFacts[0],'baseline.effective.appearance.opacity');
});
test('partial source facts retain the explicit Draft authority boundary',()=>{
 const t=consensusFixture();t.a.rawCatalogueReference={base:t.p.snapshot};
 t.f.contract.rules=[{schemaVersion:'apollo.rule-ir.v1',ruleId:'fixture.draft',revision:1,source:{path:'fixture',checksum:H,anchor:'fixture'},
  authority:{status:'draft'},effect:'require',scope:{},select:{from:'selection-root',traverse:'self'},
  assert:{predicate:'equals',actual:{literal:1},expected:{literal:1}},severity:'error',unknownPolicy:'human-review'}];
 const runtime=bundledSource('packages/component-contract-core/src/runtime.ts');
 assert.equal(runtime.evaluateCompiledContract(t.a,t.f.contract).evaluations[0].classification,'not-evaluable');
 const preview=runtime.prepareAuthoringPreviewContract(t.f.contract);
 assert.equal(runtime.evaluateCompiledContract(t.a,preview).evaluations[0].classification,'compliant');
 assert.equal(runtime.prepareValidationSnapshot(t.a,preview).nodes.find(n=>n.id==='raw:10').baselineProvenance.status,'partial');
});
test('imported scalar proofs are cleared by snapshot membership for malformed and nested nodes only',()=>{
 const runtime=bundledSource('packages/component-contract-core/src/runtime.ts');
 for(const kind of ['valid','numeric-id','missing-type']){
  const t=consensusFixture(),n=t.a.nodes.find(n=>n.id==='raw:10');
  n.baseline={effective:{appearance:{opacity:1}}};n.knownFacts=['baseline.effective.appearance.opacity'];
  n.unknownFacts.push('baseline.effective');n.appearance.opacity=1;
  if(kind==='numeric-id'){
   for(const node of t.a.nodes){if(node.parentId===n.id)node.parentId=77;node.childIds=node.childIds.map(id=>id===n.id?77:id);}n.id=77;
  }
  if(kind==='missing-type')delete n.type;
  const property={id:'ordinary-property',type:'TEXT',knownFacts:'keep this component property'};
  t.a.nodes[0].component.properties.knownFacts=plain(property);
  const nested=plain(t.a);t.a.componentDependencyCaptures=[{nodeId:'unused',snapshot:nested}];
  t.a.nodes[0].rawNestedReferencesV1=[plain(nested)];
  const prepared=runtime.prepareValidationSnapshot(t.a,t.f.contract);
  for(const capture of [prepared,prepared.componentDependencyCaptures[0].snapshot,prepared.nodes[0].rawNestedReferencesV1[0]]){
   assert.equal(capture.nodes.find(node=>node.id===n.id).knownFacts,undefined,kind);
   assert.equal(consensusEvaluation(capture,n.id,'appearance.opacity').classification,'human-review',kind);
   assert.deepEqual(plain(capture.nodes[0].component.properties.knownFacts),property);
  }
  assert.equal(n.knownFacts.length,1);
 }
});
