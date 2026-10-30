const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../packages/component-contract-core/dist/core.cjs');
const {fixture,clone}=require('../packages/component-contract-core/tests/helpers/declared-target-configuration.cjs');
function reference(){return fixture(core).snapshot.variantReference;}
test('portable swap pin preserves hidden values while replacing only independently resolved local IDs',()=>{
 const a=reference(),b=clone(a),ak={'asset-main':'a'.repeat(40)},bk={'other-file-id':'a'.repeat(40)};b.properties.Slot=b.nodeProperties[''].properties.Slot='other-file-id';
 assert.notEqual(core.configurationDeclaredTargetReferenceHash(a),core.configurationDeclaredTargetReferenceHash(b));
 assert.equal(core.portableSwapDeclaredTargetReferenceHash(a,ak),core.portableSwapDeclaredTargetReferenceHash(b,bk));
 bk['other-file-id']='b'.repeat(40);
 assert.notEqual(core.portableSwapDeclaredTargetReferenceHash(a,ak),core.portableSwapDeclaredTargetReferenceHash(b,bk));
 delete bk['other-file-id'];assert.equal(core.portableSwapDeclaredTargetReferenceHash(b,bk),undefined);
});
test('portable swap is opt-in, old envelopes are unchanged, missing proof stays UNKNOWN',()=>{
 const f=fixture(core),before=f.compile().contract;f.manual.metadata.portableSwapIdentityVersion=1;
 f.snapshot.source.swapComponentKeys={'asset-main':'a'.repeat(40)};
 for(const t of f.manual.targets)for(const b of t.identityBindingsV1)b.portableSwapReferenceHash=core.portableSwapDeclaredTargetReferenceHash(f.snapshot.variantReference,f.snapshot.source.swapComponentKeys);
 const c=f.compile().contract;assert.equal(c.package.sourceExportVersion,'component-contract-editor@0.2.109');
 assert.doesNotThrow(()=>core.assertDeclaredTargetContract(c));
 const s=clone(f.snapshot);delete s.source.swapComponentKeys;
 assert(core.evaluateCompiledContract(s,c).evaluations.every(e=>e.classification==='human-review'));
 assert.equal(before.package.sourceExportVersion,'component-contract-editor@0.2.99');
 const forged=clone(c);delete forged.runtimePolicy.portableSwapIdentityVersion;assert.throws(()=>core.assertDeclaredTargetContract(forged));
});
test('native lookup resolves hidden swap IDs once, bounds concurrency and refuses missing or wrong native identities',async()=>{
 const {captureSwapComponentKeys}=require('../packages/component-contract-core/dist/capture.cjs');
 const r=reference();r.nodeProperties.hidden={properties:{One:'hidden',Two:'missing',Three:'wrong'},propertyTypes:{One:'INSTANCE_SWAP',Two:'INSTANCE_SWAP',Three:'INSTANCE_SWAP'}};
 let active=0,max=0;const seen=[];
 const keys=await captureSwapComponentKeys(r,async id=>{seen.push(id);active++;max=Math.max(active,max);await new Promise(resolve=>setTimeout(resolve,2));active--;return id==='missing'?null:{id:id==='wrong'?'foreign':id,type:'COMPONENT',key:'a'.repeat(40)};});
 assert.equal(keys.hidden,'a'.repeat(40));assert.equal(keys.missing,undefined);assert.equal(keys.wrong,undefined);assert.equal(seen.filter(id=>id==='hidden').length,1);assert(max<=6);
 assert.equal(core.portableSwapDeclaredTargetReferenceHash(r,keys),undefined);
});
function importedOwner(){
 const f=fixture(core),owner=f.snapshot.nodes[1],text=f.snapshot.nodes[2];
 f.manual.metadata.instanceMainComponentAliasesVersion=1;owner.type='INSTANCE';
 owner.component.identity={componentKey:'nested-key',componentSetKey:'nested-set',mainComponentId:'actual-local-main'};
 text.component.sourceIdentity={version:1,sourceNodeId:'text-source',ownerComponentKey:'nested-key',ownerMainComponentId:'actual-local-main'};
 const reference=clone(f.snapshot);reference.nodes[1].component.identity.mainComponentId='independent-local-main';reference.nodes[2].component.sourceIdentity.ownerMainComponentId='independent-local-main';
 f.snapshot.variantReference=core.captureVariantReference(reference,'synthetic-variant','synthetic-set',Object.keys(reference.nodes[0].component.properties));
 const shape=f.snapshot.variantReference.nodes,id=core.stableHash(shape);f.evidence.structures[id]=shape;f.evidence.variants[0].structureId=id;
 for(const t of f.manual.targets)for(const b of t.identityBindingsV1){b.referenceHash=core.stableHash(f.snapshot.variantReference);b.portableReferenceHash=core.portableDeclaredTargetReferenceHash(f.snapshot.variantReference);b.configurationReferenceHash=core.configurationDeclaredTargetReferenceHash(f.snapshot.variantReference);}
 Object.assign(f.manual.targets[1].identityBindingsV1[0].nativeSource,{ownerComponentKey:'nested-key',ownerMainComponentId:'independent-local-main'});
 return f;
}
test('same published nearest owner can have different independently proven local main IDs',()=>{
 const f=importedOwner();assert.equal(core.evaluateCompiledContract(f.snapshot,f.compile().contract).evaluations[0].classification,'compliant');
});
for(const [name,edit]of[
 ['foreign canonical owner',f=>f.snapshot.nodes[1].component.identity.componentKey='foreign'],
 ['forged local owner relation',f=>f.snapshot.nodes[2].component.sourceIdentity.ownerMainComponentId='forged'],
 ['unknown owner',f=>f.snapshot.nodes[1].unknownFacts=['component.identity.mainComponentId']],
 ['different source occurrence',f=>f.snapshot.nodes[2].component.sourceIdentity.sourceNodeId='foreign'],
 ['no explicit alias policy',f=>delete f.manual.metadata.instanceMainComponentAliasesVersion],
])test(name+' cannot reuse portable owner proof',()=>{const f=importedOwner();edit(f);assert.equal(core.evaluateCompiledContract(f.snapshot,f.compile().contract).evaluations[0].classification,'human-review');});
