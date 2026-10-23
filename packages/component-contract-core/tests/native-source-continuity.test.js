const test = require('node:test'), assert = require('node:assert/strict');
const core = require('../dist/core.cjs');
const { fixture: base, clone } = require('./helpers/asset-identity-lock.cjs');

// Invented native families and independent captures, never designer reports.
function fixture() {
  const manual = clone(base(core).manual);
  manual.component.componentKey = 'host-set';
  manual.representations[0].locator = { componentSetKey: 'host-set' };
  const target = (id, role, path) => ({ id, semanticRole: role, label: role, pathHint: path, lineage: [], resolution: 'resolved' });
  manual.targets = [target('root', 'root', 'Card'), target('part', 'part', 'Card / Part'),
    target('owner', 'owner', 'Card / Part / Old label'), target('text', 'value', 'Card / Part / Old label / Value')];
  manual.targets[2].nativeSourceContinuity = { version: 1, anchorTargetId: 'part', nodeType: 'INSTANCE', sources: [{ ownerComponentKey: 'part-large', sourceNodeId: 'large-owner-source' }] };
  manual.targets[3].nativeSourceContinuity = { version: 1, anchorTargetId: 'owner', nodeType: 'TEXT', sources: [{ ownerComponentKey: 'label-large', sourceNodeId: 'large-text-source' }] };
  manual.semanticApi = [{ id: 'uppercase', kind: 'variant', valueType: 'enum', domain: ['True', 'False'],
    bindings: [{ representationId: 'desktop', targetId: 'owner', path: 'component.properties.Uppercase', transform: 'identity' }] }];
  const rule = manual.rules[0];
  manual.rules = [
    { ...rule, id: 'synthetic.required', targetId: 'root', constraints: [{ type: 'quantity', targetRoles: ['value'], min: 1, max: 1, visibleOnly: true }] },
    { ...rule, id: 'synthetic.nonempty', targetId: 'text', capability: 'text.characters', constraints: [{ type: 'layoutConstraint', fact: 'textContentV1.characterCount', min: 1 }] },
    { ...rule, id: 'synthetic.case', targetId: 'root', capability: 'component.configuration', constraints: [{ type: 'propertyDomain', fact: 'semanticApi.uppercase', values: ['True'] }] },
    { ...rule, id: 'synthetic.size', targetId: 'part', capability: 'component.configuration', constraints: [{ type: 'propertyDomain', fact: 'component.properties.Size', values: ['S'] }] },
  ];
  const node = (id, parentId, name, type, key, family, ownerKey, sourceNodeId) => ({ id, parentId, name, type, childIds: [], order: 0,
    visible: true, unknownFacts: [], semantic: { path: parentId ? `Card / ${id === 'part' ? 'Part' : id === 'owner' ? 'Part / Old label' : 'Part / Old label / Value'}` : 'Card' },
    component: { properties: {}, propertyTypes: {}, propertyReferences: [], propertyReferenceBindings: {},
      ...(key ? { identity: { componentKey: key, componentSetKey: family, mainComponentId: key + '-main' } } : {}),
      ...(ownerKey ? { sourceIdentity: { version: 1, ownerComponentKey: ownerKey, ownerMainComponentId: ownerKey + '-main', sourceNodeId } } : {}) } });
  const root = node('root', null, 'Card', 'INSTANCE', 'host', 'host-set');
  const part = node('part', 'root', 'Part', 'INSTANCE', 'part-small', 'part-family', 'host', 'part-source');
  const owner = node('owner', 'part', 'Old label', 'INSTANCE', 'label-small', 'label-small-family', 'part-small', 'small-owner-source');
  const value = node('value', 'owner', 'Value', 'TEXT', undefined, undefined, 'label-small', 'small-text-source');
  root.childIds = ['part']; part.childIds = ['owner']; owner.childIds = ['value'];
  part.component.properties.Size = 'S'; part.component.propertyTypes.Size = 'VARIANT';
  owner.component.properties = { Label: 'Default', Uppercase: 'True' }; owner.component.propertyTypes = { Label: 'TEXT', Uppercase: 'VARIANT' };
  value.component.propertyReferenceBindings.characters = 'Label'; value.text = { characters: 'Default' };
  const snapshot = { schemaVersion: 'apollo.predicate-snapshot.v2', generatedAt: '2026-01-01T00:00:00Z', selection: ['root'], nodes: [root, part, owner, value],
    context: { platform: 'desktop', modes: {}, unknownFacts: [] }, source: { componentKey: 'host', componentSetKey: 'host-set', rootNodeId: 'actual-host',
      truncated: false, instanceIdentityVersion: 1, instanceSourceIdentityVersion: 1, occurrenceAddressVersion: 1, captureTopology: { version: 1, complete: true } } };
  snapshot.variantReference = clone(core.captureVariantReference(snapshot, 'host', 'host-set'));
  const shape = snapshot.variantReference.nodes, structureId = core.stableHash(shape);
  const evidence = { schemaVersion: 'apollo.variant-anatomy.v1', sourceHash: 'a'.repeat(64), structures: { [structureId]: shape },
    variants: [{ componentKey: 'host', componentSetKey: 'host-set', structureId, properties: {} }] };
  const original = clone(snapshot); original.source.rootNodeId = 'independent-base';
  part.component.identity = { componentKey: 'part-large', componentSetKey: 'part-family', mainComponentId: 'part-large-main' }; part.component.properties.Size = 'L';
  owner.name = 'Renamed label'; owner.semantic.path = 'Card / Part / Renamed label';
  owner.component.identity = { componentKey: 'label-large', componentSetKey: 'label-large-family', mainComponentId: 'label-large-main' };
  owner.component.sourceIdentity = { version: 1, ownerComponentKey: 'part-large', ownerMainComponentId: 'part-large-main', sourceNodeId: 'large-owner-source' };
  value.semantic.path = 'Card / Part / Renamed label / Value';
  value.component.sourceIdentity = { version: 1, ownerComponentKey: 'label-large', ownerMainComponentId: 'label-large-main', sourceNodeId: 'large-text-source' };
  const reference = clone(snapshot); reference.source.rootNodeId = 'independent-large-host';
  snapshot.instanceContentReferences = { schemaVersion: 'apollo.instance-content-references.v4', base: original,
    attempts: [{ boundaryNodeId: 'part', strategy: 'pristine-host-variant-properties', reference }] };
  return { manual, evidence, snapshot, part, owner, value };
}
function compile(f) { const b = core.buildExportBundle(f.manual, f.evidence); assert.equal(b.validation.valid, true, JSON.stringify(b.validation.issues)); return b.compiled; }
function audit(f) { return core.evaluateCompiledContract(f.snapshot, core.prepareAuthoringPreviewContract(compile(f))); }
const human = f => audit(f).evaluations.filter(e => e.classification === 'human-review');
test('declared native chain repairs renamed deep targets and preserves the actual Size violation', () => {
  const f = fixture(), c = compile(f), p = core.prepareValidationSnapshot(f.snapshot, c);
  assert.equal(p.nodes[2].semantic.role, 'owner'); assert.equal(p.nodes[3].semantic.role, 'value');
  assert.equal(human(f).length, 0);
  assert(audit(f).evaluations.some(e => e.ruleId.startsWith('synthetic.size') && e.classification === 'violation'));
  assert.equal(f.value.semantic.role, undefined);
});
for (const [name, mutate] of [
  ['missing reference', f => delete f.snapshot.instanceContentReferences],
  ['unsupported strategy', f => f.snapshot.instanceContentReferences.attempts[0].strategy = 'untrusted'],
  ['missing source', f => delete f.value.component.sourceIdentity],
  ['unknown source', f => f.value.unknownFacts.push('component.sourceIdentity.sourceNodeId')],
  ['foreign swap', f => Object.assign(f.owner.component.identity, { componentKey: 'foreign', componentSetKey: 'foreign-family', mainComponentId: 'foreign-main' })],
  ['SLOT boundary', f => f.owner.type = 'SLOT'],
  ['ambiguous occurrence', f => { const n = clone(f.value); n.id = 'duplicate'; f.snapshot.nodes.push(n); f.owner.childIds.push(n.id); }],
  ['unlisted source', f => f.manual.targets[3].nativeSourceContinuity.sources[0].sourceNodeId = 'unlisted'],
]) test('continuity remains UNKNOWN for ' + name, () => { const f = fixture(); mutate(f); assert(human(f).length > 0); });
for (const [name, mutate, expected] of [
  ['hidden', f => f.owner.visible = false, 'synthetic.required'],
  ['empty', f => f.value.text.characters = '', 'synthetic.nonempty'],
  ['wrong case', f => f.owner.component.properties.Uppercase = 'False', 'synthetic.case'],
]) test('continuity still detects ' + name + ' content', () => { const f = fixture(); mutate(f); assert(audit(f).evaluations.some(e => e.ruleId.startsWith(expected) && e.classification === 'violation')); });
test('legacy contract keeps UNKNOWN and malformed runtime envelope rejects missing opt-in', () => {
  const f = fixture(), c = compile(f); delete c.runtimePolicy.nativeSourceContinuityVersion;
  assert.throws(() => core.prepareValidationSnapshot(f.snapshot, c), { code: 'NATIVE_SOURCE_CONTINUITY_UNSUPPORTED' });
  f.manual.targets.forEach(t => delete t.nativeSourceContinuity); assert(human(f).length > 0);
});
for (const [name, mutate] of [
  ['empty addresses', f => f.manual.targets[3].nativeSourceContinuity.sources = []],
  ['duplicate addresses', f => f.manual.targets[3].nativeSourceContinuity.sources.push(clone(f.manual.targets[3].nativeSourceContinuity.sources[0]))],
  ['cycle', f => f.manual.targets[2].nativeSourceContinuity.anchorTargetId = 'text'],
  ['missing anchor', f => f.manual.targets[3].nativeSourceContinuity.anchorTargetId = 'missing'],
]) test('schema rejects ' + name, () => { const f = fixture(); mutate(f); assert.equal(core.buildExportBundle(f.manual, f.evidence).validation.valid, false); });
test('schema and runtime reject composition with a declared identity ledger', () => {
  const f = fixture(), c = compile(f); f.manual.metadata.declaredTargetIdentityVersion = 3;
  assert(core.validateManualSource(f.manual).some(i => i.code === 'TARGET_NATIVE_SOURCE_CONTINUITY'));
  c.runtimePolicy.declaredTargetIdentityVersion = 3;
  assert.throws(() => core.assertNativeSourceContinuityContract(c), { code: 'NATIVE_SOURCE_CONTINUITY_UNSUPPORTED' });
});
