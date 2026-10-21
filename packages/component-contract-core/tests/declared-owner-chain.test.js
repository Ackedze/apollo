const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../dist/core.cjs');
const {fixture,clone}=require('./helpers/declared-target.cjs');
// Invented component identities only; equal nested variants occur twice under distinct native source occurrences.
function nested(version=3){
 const f=fixture(core),root=f.snapshot.nodes[0];
 const owner=(id,source)=>({...clone(root),id,parentId:'root',name:id,childIds:[id+'-value'],semantic:{role:'',path:'Card / '+id},component:{properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{},identity:{componentKey:'reused-owner',mainComponentId:'reused-main',componentSetKey:'reused-set'},sourceIdentity:{version:1,sourceNodeId:source,ownerComponentKey:'synthetic-variant',ownerMainComponentId:'synthetic-main'}}});
 const value=id=>({...clone(f.snapshot.nodes[2]),id:id+'-value',parentId:id,name:'value',semantic:{role:'',path:'Card / '+id+' / value'},component:{properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{},sourceIdentity:{version:1,sourceNodeId:'same-inner-source',ownerComponentKey:'reused-owner',ownerMainComponentId:'reused-main'}}});
 root.childIds=['top','bottom'];f.snapshot.nodes=[root,owner('top','top-source'),value('top'),owner('bottom','bottom-source'),value('bottom')];
 const ref=f.snapshot.variantReference=core.captureVariantReference(clone(f.snapshot),'synthetic-variant','synthetic-set');
 const structure=core.stableHash(ref.nodes);f.evidence.structures={[structure]:ref.nodes};f.evidence.variants[0].structureId=structure;
 f.manual.metadata.declaredTargetIdentityVersion=version;
 f.manual.targets[1].pathHint='Card / top / value';f.manual.targets.push({...clone(f.manual.targets[1]),id:'bottom.target',semanticRole:'bottom-value',pathHint:'Card / bottom / value'});
 for(const [t,p,type] of [[f.manual.targets[0],'','INSTANCE'],[f.manual.targets[1],'top / value','TEXT'],[f.manual.targets[2],'bottom / value','TEXT']])t.identityBindingsV1=[{representationId:'desktop',componentKey:'synthetic-variant',componentSetKey:'synthetic-set',referenceHash:core.stableHash(ref),referencePath:p,nodeType:type,...(version>=2?{portableReferenceHash:core.portableDeclaredTargetReferenceHash(ref)}:{}),...(p?{nativeSource:{sourceNodeId:'same-inner-source',ownerComponentKey:'reused-owner',ownerMainComponentId:'reused-main'}}:{})}];
 return{...f,compiled:core.compileManualSource(f.manual,f.evidence).contract};
}
const facts=(c,f)=>c.prepareValidationSnapshot(f.snapshot,f.compiled).declaredTargetIdentitiesV1.targets;
for(const version of [1,2,3])test('two equal owner variants resolve to distinct native occurrences v'+version,()=>{
 const f=nested(version);
 assert.deepEqual(facts(core,f).slice(1).map(t=>[t.status,t.nodeId]),[['resolved','top-value'],['resolved','bottom-value']]);
});
test('names and sibling order cannot select an owner occurrence',()=>{const f=nested();f.snapshot.nodes[1].name='renamed';f.snapshot.nodes[3].name='renamed';f.snapshot.nodes[0].childIds.reverse();assert.deepEqual(facts(core,f).slice(1).map(t=>t.nodeId),['top-value','bottom-value']);});
for(const [name,mutate] of [
 ['missing source',n=>delete n.component.sourceIdentity],
 ['foreign source',n=>n.component.sourceIdentity.sourceNodeId='foreign'],
 ['unknown source',n=>n.unknownFacts.push('component.sourceIdentity.sourceNodeId')],
 ['unknown owner identity',n=>n.unknownFacts.push('component.identity')],
 ['caller slot',n=>n.type='SLOT'],
])test('owner chain fails closed: '+name,()=>{const f=nested();mutate(f.snapshot.nodes[1]);assert.equal(facts(core,f)[1].status,'unknown');});
test('duplicate part within the same native owner stays ambiguous, including hidden',()=>{const f=nested(),n=clone(f.snapshot.nodes[2]);n.id='copy';n.name='different diagnostic name';n.visible=false;f.snapshot.nodes.push(n);f.snapshot.nodes[1].childIds.push('copy');assert.equal(facts(core,f)[1].status,'ambiguous');});
test('duplicate entire owner occurrence stays ambiguous',()=>{const f=nested(),o=clone(f.snapshot.nodes[1]),v=clone(f.snapshot.nodes[2]);o.id='copy-owner';o.name='different owner name';o.childIds=['copy-value'];v.id='copy-value';v.parentId=o.id;f.snapshot.nodes.push(o,v);f.snapshot.nodes[0].childIds.push(o.id);assert.equal(facts(core,f)[1].status,'ambiguous');});
test('stale independently pinned reference stays unknown',()=>{const f=nested();f.snapshot.variantReference.complete=false;assert(facts(core,f).every(t=>t.status==='unknown'));});
