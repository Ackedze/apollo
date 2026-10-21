// Invented host, two public ports and foreign assets; no private captures.
const {fixture: base, clone} = require('./declared-target-configuration.cjs');
function fixture(core, version = 2) {
  const f = base(core), root = f.snapshot.nodes[0];
  f.manual.metadata.declaredTargetConfigurationVersion = version;
  root.component.properties.Slot = 'original-main';
  root.component.properties.RightSlot = 'original-main';
  root.component.propertyTypes.RightSlot = 'INSTANCE_SWAP';
  root.layout = {itemSpacing: 8}; root.baseline = {effective: {layout: {itemSpacing: 8}}};
  for (const side of ['left', 'right']) {
    const port = side === 'left' ? 'Slot' : 'RightSlot';
    const icon = {id: side, parentId: 'root', childIds: [], order: root.childIds.length,
      name: 'Original ' + side, type: 'INSTANCE', visible: true, unknownFacts: [],
      semantic: {path: 'Card / Original ' + side}, bounds: {width: 24, height: 24},
      component: {properties: {Size: '24'}, propertyTypes: {Size: 'VARIANT'}, propertyReferences: [],
        identity: {componentKey: 'original-key', componentSetKey: 'original-set', mainComponentId: 'original-main'},
        propertyReferenceBindings: {mainComponent: port}, sourceIdentity: {version: 1,
          sourceNodeId: side + '-source', ownerComponentKey: 'synthetic-variant', ownerMainComponentId: 'synthetic-main'}}};
    root.childIds.push(icon.id); f.snapshot.nodes.push(icon);
    const target = {id: side, semanticRole: side, label: side, lineage: [], resolution: 'resolved', pathHint: icon.semantic.path,
      identityBindingsV1: [{representationId: 'desktop', componentKey: 'synthetic-variant', componentSetKey: 'synthetic-set',
        referenceHash: 'a'.repeat(64), referencePath: icon.name, nodeType: 'INSTANCE',
        nativeSource: {sourceNodeId: side + '-source', ownerComponentKey: 'synthetic-variant', ownerMainComponentId: 'synthetic-main'}}]};
    f.manual.targets.push(target);
    f.manual.rules.push(Object.assign({}, f.manual.rules[0], {id: 'synthetic.' + side + '-swap', targetId: side,
      capability: 'component.swap', permission: 'allowed', constraints: [],
      controlPaths: [{kind: 'slot-api', target: side, property: port, contentOwnership: 'external', exclusive: true}],
      execution: {route: 'policy-only'}}));
    f.manual.rules.push(Object.assign({}, f.manual.rules[0], {id: 'synthetic.' + side + '-height', targetId: side,
      capability: 'bounds.height', constraints: [{type: 'propertyDomain', fact: 'bounds.height', values: [24]}]}));
  }
  f.manual.rules.push(Object.assign({}, f.manual.rules[0], {id: 'synthetic.host-gap', capability: 'layout.itemSpacing',
    constraints: [{type: 'propertyForbidden', fact: 'layout.itemSpacing'}]}));
  f.snapshot.variantReference = clone(core.captureVariantReference(clone(f.snapshot), 'synthetic-variant', 'synthetic-set', Object.keys(root.component.properties)));
  const shape = f.snapshot.variantReference.nodes, structureId = core.stableHash(shape);
  f.evidence.structures = {[structureId]: shape}; f.evidence.variants[0].structureId = structureId;
  for (const target of f.manual.targets) for (const b of target.identityBindingsV1) {
    b.referenceHash = core.stableHash(f.snapshot.variantReference);
    b.portableReferenceHash = core.portableDeclaredTargetReferenceHash(f.snapshot.variantReference);
    b.configurationReferenceHash = version === 2
      ? core.publicSwapDeclaredTargetReferenceHash(f.snapshot.variantReference, {targets: f.manual.targets, policies: f.manual.rules, representations: f.manual.representations})
      : core.configurationDeclaredTargetReferenceHash(f.snapshot.variantReference);
  }
  return f;
}
function swap(f, side, asset = 'foreign') {
  const icon = f.snapshot.nodes.find(n => n.id === side), port = icon.component.propertyReferenceBindings.mainComponent;
  icon.name = asset + ' ' + side; icon.semantic.path = 'Card / ' + icon.name;
  icon.component.identity = {componentKey: asset + '-key', componentSetKey: asset + '-set', mainComponentId: asset + '-main'};
  icon.component.properties = {Shape: 'new', Size: '24'}; icon.component.propertyTypes = {Shape: 'VARIANT', Size: 'VARIANT'};
  f.snapshot.nodes[0].component.properties[port] = asset + '-main';
  f.snapshot.variantReference = clone(f.snapshot.variantReference);
  const old = f.snapshot.variantReference.nodes.find(n => f.snapshot.variantReference.nodeProperties[n.path]?.sourceIdentity?.sourceNodeId === side + '-source').path;
  const value = f.snapshot.variantReference.nodeProperties[old];
  delete f.snapshot.variantReference.nodeProperties[old];
  Object.assign(value, {identity: clone(icon.component.identity), properties: clone(icon.component.properties), propertyTypes: clone(icon.component.propertyTypes), diagnosticName: icon.name});
  f.snapshot.variantReference.nodeProperties[icon.name] = value;
  f.snapshot.variantReference.nodes.find(n => n.path === old).path = icon.name;
  f.snapshot.variantReference.nodes.sort((a,b) => a.path.localeCompare(b.path) || a.type.localeCompare(b.type));
  f.snapshot.variantReference.properties[port] = asset + '-main';
  f.snapshot.variantReference.nodeProperties[''].properties[port] = asset + '-main';
}
module.exports = {fixture, swap, clone};
