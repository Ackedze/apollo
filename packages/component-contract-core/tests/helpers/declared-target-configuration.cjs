// Synthetic native configuration only; no private reports, keys or catalogs.
const {fixture: base, clone} = require('./declared-target.cjs');
function fixture(core) {
  const f = base(core), root = f.snapshot.nodes[0], text = f.snapshot.nodes[2];
  f.manual.metadata.declaredTargetIdentityVersion = 3;
  f.manual.metadata.declaredTargetConfigurationVersion = 1;
  root.component.properties = {Label: 'Default', Show: true, Size: 'M', Slot: 'asset-main'};
  root.component.propertyTypes = {Label: 'TEXT', Show: 'BOOLEAN', Size: 'VARIANT', Slot: 'INSTANCE_SWAP'};
  text.text = {characters: 'Default', fontSize: 16};
  text.baseline = {effective: {text: {fontSize: 16}}};
  f.manual.rules[0].constraints[0].min = 0;
  f.manual.rules.push(Object.assign({}, f.manual.rules[0], {
    id: 'synthetic.font-size', targetId: 'title.target', capability: 'text.fontSize',
    constraints: [{type: 'propertyForbidden', fact: 'text.fontSize'}],
  }));
  f.snapshot.variantReference = clone(core.captureVariantReference(clone(f.snapshot), 'synthetic-variant', 'synthetic-set', Object.keys(root.component.properties)));
  for (const target of f.manual.targets) for (const binding of target.identityBindingsV1) {
    binding.referenceHash = core.stableHash(f.snapshot.variantReference);
    binding.portableReferenceHash = core.portableDeclaredTargetReferenceHash(f.snapshot.variantReference);
    binding.configurationReferenceHash = core.configurationDeclaredTargetReferenceHash(f.snapshot.variantReference);
  }
  return f;
}
function configure(f, label = 'Default', show = true) {
  const root = f.snapshot.nodes[0], ref = f.snapshot.variantReference;
  for (const properties of [root.component.properties, ref.properties, ref.nodeProperties[''].properties]) {
    properties.Label = label; properties.Show = show;
  }
  f.snapshot.nodes[1].visible = show;
  f.snapshot.nodes[2].text.characters = label;
}
module.exports = {fixture, configure, clone};
