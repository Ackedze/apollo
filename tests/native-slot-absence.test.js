const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-slot-absence-'));
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../packages/component-contract-core/src/native-slot-targets.ts')],outfile:path.join(temp,'slot.cjs'),bundle:true,platform:'node',logLevel:'silent'});
const {materializeNativeSlotTargets:materialize}=require(path.join(temp,'slot.cjs'));test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
function fixture(){
 const root={id:'root',type:'INSTANCE',parentId:null,childIds:['owner'],variantAvailability:{status:'verified'},component:{},unknownFacts:[]};
 const owner={id:'owner',type:'INSTANCE',parentId:'root',childIds:[],semantic:{role:'owner'},component:{identity:{componentKey:'owner-key',componentSetKey:'owner-set',mainComponentId:'local-main'},properties:{Asset:'local-asset'},propertyTypes:{Asset:'INSTANCE_SWAP'}},baselineProvenance:{status:'matched',referencePath:'Owner'},appearance:{opacity:.5},baseline:{effective:{appearance:{opacity:1}}},unknownFacts:[]};
 const nodes=[{path:'',type:'ROOT'},{path:'Owner',type:'INSTANCE'}];
 const ref={componentKey:'host',componentSetKey:'host-set',complete:true,nodes,nodeProperties:{Owner:structuredClone(owner.component)}};
 const snapshot={source:{truncated:false},selection:['root'],context:{platform:'desktop'},nodes:[root,owner],variantReference:ref};
 const contract={package:{sourceExportVersion:'component-contract-editor@0.2.110'},runtimePolicy:{nativeSlotTargetsVersion:2},facts:{representations:[{id:'desktop',platform:'desktop',kind:'figma',status:'verified',locator:{componentKey:'host',componentSetKey:'host-set'}}],targets:[{id:'owner',semanticRole:'owner',resolution:'resolved',pathHint:'Host / Owner'},{id:'slot',semanticRole:'slot',resolution:'resolved',pathHint:'Host / Owner / Slot'}],variantEvidence:{variants:[{componentKey:'host',componentSetKey:'host-set',structureId:'shape'}],structures:{shape:nodes}}},customizationPolicy:[{targetId:'slot',status:'reviewed',permission:'allowed',controlPaths:[{kind:'slot-api',target:'slot',property:'Body#1:0',ownerTargetId:'owner'}]}]};
 return{snapshot,contract,owner,ref,comparison:{complete:true,boundaries:[],referencePaths:{'':'',Owner:'Owner'}},paths:new Map([['root',''],['owner','Owner']])};
}
function run(f){materialize(f.snapshot,f.contract,f.comparison,f.paths);return f.snapshot.nodes[0].variantAvailability.targets?.slot;}
test('independent legacy owner proves native SLOT absence without externalizing its contents',()=>{const f=fixture();assert.equal(run(f).present,false);assert.equal(f.owner.slotBoundaryV1,undefined);assert.equal(f.owner.appearance.opacity,.5);assert.equal(f.owner.baseline.effective.appearance.opacity,1);});
for(const [name,mutate]of[
 ['old profile',f=>f.contract.runtimePolicy.nativeSlotTargetsVersion=1],
 ['incomplete comparison',f=>f.comparison.complete=false],
 ['truncated capture',f=>f.snapshot.source.truncated=true],
 ['incomplete reference',f=>f.ref.complete=false],
 ['foreign owner',f=>f.owner.component.identity.componentKey='foreign'],
 ['local owner drift',f=>f.owner.component.identity.mainComponentId='other-main'],
 ['unknown owner',f=>f.owner.unknownFacts=['component.identity']],
 ['unknown properties',f=>f.owner.unknownFacts=['component.propertyTypes']],
 ['missing baseline',f=>f.owner.baselineProvenance.status='unresolved'],
 ['foreign boundary',f=>f.comparison.boundaries=[{referencePath:'Owner'}]],
 ['real slot in reference',f=>f.ref.nodes.push({path:'Owner / Slot',type:'SLOT'})],
 ['real SLOT port',f=>f.owner.component.propertyTypes.Body='SLOT'],
 ['real slot in actual',f=>f.snapshot.nodes.push({id:'slot',type:'SLOT',parentId:'owner'})],
])test(name+' cannot prove absence',()=>{const f=fixture();mutate(f);assert.equal(run(f),undefined);});
test('new SLOT absence envelope rejects a stale producer stamp',()=>{const f=fixture();f.contract.package.sourceExportVersion='component-contract-editor@0.2.70';assert.throws(()=>run(f),/NATIVE_SLOT_ABSENCE_UNSUPPORTED/);});
