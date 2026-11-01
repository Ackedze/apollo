const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const core=require('../packages/component-contract-core/dist/core.cjs');
const fixture=require('../packages/component-contract-core/tests/helpers/open-content.cjs')(core);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-open-content-'));
require('esbuild').buildSync({entryPoints:[path.resolve(__dirname,'../src/area-ownership.ts')],outfile:path.join(temp,'area.cjs'),bundle:true,platform:'node',format:'cjs',target:['node18']});
const {collectPermittedExternalParts,collectContractOwnedParts,emptyOwnedTextScope}=require(path.join(temp,'area.cjs'));
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));

function textScope(){const f=fixture();f.contract.customizationPolicy.find(p=>p.id==='synthetic.owned-opacity').capability='text.typography';return f;}
test('a fully proven empty owned text scope is distinct from an unverified selector',()=>{
 const f=textScope(),before=JSON.stringify(f.snapshot);
 assert(emptyOwnedTextScope(f.snapshot,f.contract,'synthetic.owned-opacity'));
 assert.equal(JSON.stringify(f.snapshot),before);
});
for(const [name,edit] of [
 ['missing reference',f=>delete f.snapshot.variantReference],
 ['incomplete reference',f=>f.snapshot.variantReference.complete=false],
 ['truncated capture',f=>f.snapshot.source.truncated=true],
 ['unknown ancestry',f=>f.snapshot.nodes[1].unknownFacts.push('parentId')],
 ['undeclared external boundary',f=>f.contract.customizationPolicy[0].controlPaths=[]],
 ['owned text in the reference',f=>f.snapshot.variantReference.nodes.push({path:'Owned label',type:'TEXT'})],
 ['unrelated property rule',f=>f.contract.customizationPolicy.find(p=>p.id==='synthetic.owned-opacity').capability='appearance.opacity'],
])test(name+' cannot exempt recursive text coverage',()=>{const f=textScope();edit(f);assert.equal(emptyOwnedTextScope(f.snapshot,f.contract,'synthetic.owned-opacity'),undefined);});

test('allowed swap payload is boundary-only and never an internal component part',()=>{
 const f=fixture(true),before=JSON.stringify(f.snapshot),parts=collectPermittedExternalParts(f.snapshot,f.contract);
 assert.equal(parts.length,1);assert.equal(parts[0].snapshotNodeId,f.slot.id);
 assert.equal(parts[0].validationScope,'boundary-only');assert.equal(parts[0].payloadValidation,'unverified');
 assert.deepEqual(collectContractOwnedParts(f.snapshot,f.contract),[]);assert.equal(JSON.stringify(f.snapshot),before);
});
for(const [name,edit] of [
 ['missing native property',f=>f.slot.component.propertyReferenceBindings={}],
 ['unknown identity',f=>f.root.unknownFacts.push('component.identity')],
 ['unresolved applicability',f=>f.contract.customizationPolicy[0].applicability.scopeStatus='unresolved'],
 ['conditional permission',f=>f.contract.customizationPolicy[0].applicability.context={product:'unknown'}],
 ['forged cached proof',f=>{f.slot.slotBoundaryV1={contentOwnership:'external',evidence:'native-instance-swap-reference'};f.slot.component.propertyReferenceBindings={};}],
])test(name+' does not claim a permitted external boundary',()=>{const f=fixture(true);edit(f);assert.deepEqual(collectPermittedExternalParts(f.snapshot,f.contract),[]);});
