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
