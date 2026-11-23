const test = require('node:test'), assert = require('node:assert/strict'), core = require('../dist/core.cjs');
const {fixture: base, swap, clone} = require('./helpers/declared-public-swap.cjs');
const {configure} = require('./helpers/declared-target-configuration.cjs');
const shape = f => ({targets:f.manual.targets,policies:f.manual.rules,representations:f.manual.representations});
function fixture(portable = true) {
  const f=base(core), root=f.snapshot.nodes[0];
  Object.assign(root.component.properties,{SpareLeft:'inactive-main',LaterLeft:'later-main'});
  Object.assign(root.component.propertyTypes,{SpareLeft:'INSTANCE_SWAP',LaterLeft:'INSTANCE_SWAP'});
  const policy=f.manual.rules.find(r=>r.id==='synthetic.left-swap');
  for(const property of ['SpareLeft','LaterLeft']) policy.controlPaths.push({kind:'slot-api',target:'left',property,contentOwnership:'external',exclusive:true});
  f.snapshot.variantReference=clone(core.captureVariantReference(clone(f.snapshot),'synthetic-variant','synthetic-set',Object.keys(root.component.properties)));
  repin(f,portable);
  return f;
}
function repin(f,portable=true) {
  const ref=f.snapshot.variantReference;
  for(const t of f.manual.targets)for(const b of t.identityBindingsV1){
    b.referenceHash=core.stableHash(ref);b.portableReferenceHash=core.portableDeclaredTargetReferenceHash(ref);
    b.configurationReferenceHash=portable?core.inactivePublicSwapDeclaredTargetReferenceHash(ref,shape(f)):core.publicSwapDeclaredTargetReferenceHash(ref,shape(f));
  }
}
function drop(f,port) {
  const root=f.snapshot.nodes[0],ref=f.snapshot.variantReference;
  for(const owner of [root.component,ref,ref.nodeProperties['']]) {
    delete owner.properties[port];delete owner.propertyTypes[port];
    if(owner.definedProperties)owner.definedProperties=owner.definedProperties.filter(p=>p!==port);
  }
}
function remap(f,port,value) {
  for(const owner of [f.snapshot.nodes[0].component,f.snapshot.variantReference,f.snapshot.variantReference.nodeProperties['']])owner.properties[port]=value;
}
const prepared=f=>core.prepareValidationSnapshot(f.snapshot,f.compile().contract);
const run=f=>core.evaluateCompiledContract(f.snapshot,f.compile().contract).evaluations;
const resolved=f=>assert(prepared(f).declaredTargetIdentitiesV1.targets.every(t=>t.status==='resolved'));

test('inactive public swap hash has a distinct pin domain',()=>{
  const f=fixture();assert.notEqual(f.manual.targets[0].identityBindingsV1[0].configurationReferenceHash,core.publicSwapDeclaredTargetReferenceHash(f.snapshot.variantReference,shape(f)));
});
for(const [name,mutate]of [
  ['same file',()=>{}],
  ['different inactive local IDs',f=>remap(f,'SpareLeft','other-file-main')],
  ['older API without an unused declared swap port',f=>drop(f,'LaterLeft')],
  ['both differences and allowed public configuration',f=>{remap(f,'SpareLeft','other-file-main');drop(f,'LaterLeft');configure(f,'Configured text',false);swap(f,'left');swap(f,'right');}],
])test('inactive swap pin resolves all targets: '+name,()=>{
  const f=fixture();mutate(f);resolved(f);assert(run(f).every(e=>['compliant','not-applicable'].includes(e.classification)));
});
for(const [name,mutate,rule]of [
  ['host gap',f=>{f.snapshot.nodes[0].layout.itemSpacing=12;},'synthetic.host-gap.1.1'],
  ['font size',f=>{f.snapshot.nodes[2].text.fontSize=18;},'synthetic.font-size.1.1'],
  ['slot height',f=>{f.snapshot.nodes.find(n=>n.id==='right').bounds.height=32;},'synthetic.right-height.1.1'],
])test('old API preserves violation and RESET: '+name,()=>{
  const f=fixture();drop(f,'LaterLeft');remap(f,'SpareLeft','other-file-main');swap(f,'right');
  const reset=clone(f.snapshot);mutate(f);resolved(f);assert(run(f).some(e=>e.ruleId===rule&&e.classification==='violation'));
  f.snapshot=reset;resolved(f);assert(run(f).every(e=>['compliant','not-applicable'].includes(e.classification)));
});
for(const [name,mutate]of [
  ['undeclared API addition',f=>{for(const r of [f.snapshot.variantReference,f.snapshot.variantReference.nodeProperties['']]){r.properties.Foreign='new';r.propertyTypes.Foreign='TEXT';r.definedProperties.push('Foreign');}}],
  ['active port removed',f=>drop(f,'Slot')],
  ['required Label removed',f=>drop(f,'Label')],
  ['asymmetric property values',f=>{f.snapshot.variantReference.properties.SpareLeft='other-file-main';}],
  ['asymmetric property types',f=>{f.snapshot.variantReference.propertyTypes.SpareLeft='TEXT';}],
  ['missing declaration on one root map',f=>{f.snapshot.variantReference.definedProperties=f.snapshot.variantReference.definedProperties.filter(p=>p!=='SpareLeft');}],
  ['port changed into TEXT',f=>{for(const r of [f.snapshot.variantReference,f.snapshot.variantReference.nodeProperties['']])r.propertyTypes.SpareLeft='TEXT';}],
  ['root reference list consumes port',f=>{f.snapshot.variantReference.propertyReferences.push('SpareLeft');}],
  ['hidden nested reference consumes port',f=>{f.snapshot.nodes[2].visible=false;f.snapshot.variantReference.nodeProperties['Title / value'].propertyReferences.push('SpareLeft');}],
  ['unknown reference owner',f=>{delete f.snapshot.variantReference.nodeProperties['Original left'].sourceIdentity;}],
  ['wrong policy target',f=>{f.manual.rules.find(r=>r.id==='synthetic.left-swap').controlPaths.forEach(c=>c.target='right');}],
  ['external ownership removed',f=>{f.manual.rules.find(r=>r.id==='synthetic.left-swap').controlPaths.forEach(c=>delete c.contentOwnership);}],
  ['port becomes referenced',f=>{f.snapshot.variantReference.nodeProperties['Title / value'].propertyReferenceBindings.characters='SpareLeft';}],
  ['duplicate definition',f=>{for(const r of [f.snapshot.variantReference,f.snapshot.variantReference.nodeProperties['']])r.definedProperties.push('SpareLeft');}],
  ['foreign reference source',f=>{f.snapshot.variantReference.nodeProperties.Title.sourceIdentity.sourceNodeId='foreign';}],
  ['foreign actual source',f=>{f.snapshot.nodes[2].component.sourceIdentity.sourceNodeId='foreign';}],
  ['missing reference',f=>{delete f.snapshot.variantReference;}],
  ['incomplete topology',f=>{f.snapshot.source.captureTopology.complete=false;}],
  ['permission removed',f=>{f.manual.rules.find(r=>r.id==='synthetic.left-swap').permission='forbidden';}],
])test('inactive swap compatibility fails closed: '+name,()=>{
  const f=fixture();mutate(f);assert(prepared(f).declaredTargetIdentitiesV1.targets.some(t=>t.status!=='resolved'));
  assert(run(f).some(e=>e.classification==='human-review'));
});
test('legacy v2 pins retain old API and local-value guards',()=>{
  const f=fixture(false);resolved(f);remap(f,'SpareLeft','other-file-main');
  assert(prepared(f).declaredTargetIdentitiesV1.targets.every(t=>t.reason==='reference-pin-stale'));
  const other=fixture(false);drop(other,'LaterLeft');
  assert(prepared(other).declaredTargetIdentitiesV1.targets.every(t=>t.reason==='reference-pin-stale'));
});
