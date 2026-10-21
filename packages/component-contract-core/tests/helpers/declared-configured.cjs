const {fixture: base, clone} = require('./declared-target.cjs');

// Invented components and independent host captures; no private catalog data.
function fixture(core, version = 3) {
  const f = base(core), root = f.snapshot.nodes[0];
  f.manual.metadata.declaredTargetIdentityVersion = version;
  root.component.properties = {Background: 'True'};
  root.component.propertyTypes = {Background: 'VARIANT'};
  const part = {id: 'part', parentId: root.id, childIds: [], name: 'Part', type: 'INSTANCE', order: 1,
    visible: true, unknownFacts: [], semantic: {role: 'part', path: 'Card / Part'},
    baseline: {effective: {component: {properties: {Color: 'Neutral', Presets: 'Image'}}}},
    component: {identity: {componentKey: 'part-neutral', componentSetKey: 'part-set', mainComponentId: 'part-neutral-main'},
      sourceIdentity: {version: 1, sourceNodeId: 'part-source', ownerComponentKey: 'synthetic-variant', ownerMainComponentId: 'synthetic-main'},
      properties: {Color: 'Neutral', Presets: 'Image'}, propertyTypes: {Color: 'VARIANT', Presets: 'VARIANT'},
      propertyReferences: [], propertyReferenceBindings: {}}};
  root.childIds.push(part.id); f.snapshot.nodes.push(part);
  f.snapshot.source.rootNodeId = 'actual-instance';
  f.snapshot.variantReference = core.captureVariantReference(clone(f.snapshot), 'synthetic-variant', 'synthetic-set');
  const shape = f.snapshot.variantReference.nodes, structureId = core.stableHash(shape);
  f.evidence.structures = {[structureId]: shape};
  f.evidence.variants[0] = {componentKey: 'synthetic-variant', componentSetKey: 'synthetic-set', structureId, properties: {Background: 'True'}};
  for (const t of f.manual.targets) for (const b of t.identityBindingsV1) {
    b.referenceHash = core.stableHash(f.snapshot.variantReference);
    if (version >= 2) b.portableReferenceHash = core.portableDeclaredTargetReferenceHash(f.snapshot.variantReference);
  }
  f.manual.targets.push({id: 'part.target', semanticRole: 'part', label: 'Part', lineage: [], resolution: 'resolved',
    pathHint: 'Card / Part', identityBindingsV1: [{representationId: 'desktop', componentKey: 'synthetic-variant', componentSetKey: 'synthetic-set',
      referenceHash: core.stableHash(f.snapshot.variantReference),
      ...(version >= 2 ? {portableReferenceHash: core.portableDeclaredTargetReferenceHash(f.snapshot.variantReference)} : {}),
      referencePath: 'Part', nodeType: 'INSTANCE', nativeSource: {sourceNodeId: 'part-source', ownerComponentKey: 'synthetic-variant', ownerMainComponentId: 'synthetic-main'}}]});
  f.manual.semanticApi = [{id: 'Preset', kind: 'variant', valueType: 'enum', domain: ['Image','Icon'], description: 'Synthetic preset',
    bindings: [{representationId: 'desktop', targetId: 'part.target', path: 'component.properties.Presets', transform: 'identity'}]}];
  f.manual.rules = [{...f.manual.rules[0], id: 'synthetic.color-locked', targetId: 'part.target', capability: 'component.configuration',
    constraints: [{type: 'propertyForbidden', fact: 'component.properties.Color'}],
    applicability: {...f.manual.rules[0].applicability, conditionSubject: 'component-root', variants: {Background: ['True']}}}];
  return {...f, part, compile: () => core.compileManualSource(f.manual, f.evidence)};
}

function switchVariant(f, core, property = 'Color', value = 'Accent') {
  const base = clone(f.snapshot); base.source.rootNodeId = 'pristine-library-host';
  f.part.component.properties[property] = value;
  f.part.component.identity = {componentKey: 'part-configured', componentSetKey: 'part-set', mainComponentId: 'part-configured-main'};
  const reference = clone(f.snapshot); reference.source.rootNodeId = 'independent-configured-host';
  f.snapshot.instanceContentReferences = {schemaVersion: 'apollo.instance-content-references.v4', base,
    attempts: [{boundaryNodeId: f.part.id, strategy: 'pristine-host-variant-properties', reference}]};
  return f;
}

function absentFixture(core) {
  const f = fixture(core), root = f.snapshot.nodes[0];
  root.childIds = root.childIds.filter(id => id !== f.part.id);
  f.snapshot.nodes = f.snapshot.nodes.filter(n => n.id !== f.part.id);
  root.component.properties.Background = 'False';
  root.component.identity = {componentKey: 'synthetic-no-background', componentSetKey: 'synthetic-set', mainComponentId: 'synthetic-no-background-main'};
  for (const n of f.snapshot.nodes) if (n.component.sourceIdentity) {
    n.component.sourceIdentity.ownerComponentKey = 'synthetic-no-background';
    n.component.sourceIdentity.ownerMainComponentId = 'synthetic-no-background-main';
  }
  f.snapshot.source.componentKey = 'synthetic-no-background';
  f.snapshot.variantReference = core.captureVariantReference(clone(f.snapshot), 'synthetic-no-background', 'synthetic-set');
  const ref = f.snapshot.variantReference, structureId = core.stableHash(ref.nodes);
  f.evidence.structures[structureId] = ref.nodes;
  f.evidence.variants.push({componentKey: ref.componentKey, componentSetKey: ref.componentSetKey, structureId, properties: {Background: 'False'}});
  for (const t of f.manual.targets.filter(t => t.id !== 'part.target')) {
    const b = clone(t.identityBindingsV1[0]);
    b.componentKey = ref.componentKey; b.referenceHash = core.stableHash(ref); b.portableReferenceHash = core.portableDeclaredTargetReferenceHash(ref);
    if (b.nativeSource) {b.nativeSource.ownerComponentKey = ref.componentKey; b.nativeSource.ownerMainComponentId = 'synthetic-no-background-main';}
    t.identityBindingsV1.push(b);
  }
  return f;
}

module.exports = {fixture, switchVariant, absentFixture, clone};
