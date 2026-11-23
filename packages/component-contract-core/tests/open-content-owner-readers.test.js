const test=require('node:test'),assert=require('node:assert/strict');
const core=require(process.env.APOLLO_CONTRACT_CORE||'../dist/core.cjs');
const {clone}=require('./helpers/declared-target.cjs');
const fixture=require('./helpers/open-content.cjs')(core);
const run=f=>core.evaluateCompiledContract(f.snapshot,f.contract).evaluations;
const bad=e=>e.filter(x=>['violation','human-review'].includes(x.classification));
test('native SLOT through a neutral FRAME proves ownership without comparing payload',()=>{
 const f=fixture(),s=f.snapshot,payload={id:'payload',parentId:f.slot.id,name:'Anything',type:'FRAME',visible:true,childIds:[],appearance:{opacity:.3},semantic:{role:'payload',path:'Card / Neutral / Port / Anything'},component:{properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{}},unknownFacts:[]};
 f.slot.childIds.push(payload.id);s.nodes.push(payload);
 assert.equal(bad(run(f)).length,0,JSON.stringify(bad(run(f))));
 const p=core.prepareValidationSnapshot(s,f.contract);assert.equal(p.nodes.find(n=>n.id===f.slot.id).ruleScopeV1.local,true);assert.equal(p.nodes.find(n=>n.id==='payload').ruleScopeV1.local,false);
 f.slot.appearance.opacity=.5;assert(run(f).some(e=>e.classification==='violation'&&e.subjectNodeId===f.slot.id));
});
test('typed public swap is outside the parent baseline while its container is checked',()=>{
 const f=fixture(true);Object.assign(f.slot.component.identity,{componentKey:'other-asset',componentSetKey:'other-set',mainComponentId:'other-main'});
 f.slot.name='Different arbitrary name';f.root.component.properties[f.property]='other-main';f.slot.appearance.opacity=.3;
 assert.equal(bad(run(f)).length,0,JSON.stringify(bad(run(f))));f.root.appearance.opacity=.4;assert(run(f).some(e=>e.classification==='violation'&&e.subjectNodeId===f.root.id));
});
for(const [name,edit]of[
 ['wrong native property',f=>f.slot.component.propertyReferenceBindings.slotContentId='Foreign#1:0'],
 ['wrong owner identity',f=>f.root.component.identity.componentKey='foreign'],
 ['unknown owner identity',f=>f.root.unknownFacts.push('component.identity')],
 ['unknown intermediate ancestry',f=>f.snapshot.nodes.find(n=>n.id==='wrapper').unknownFacts.push('parentId')],
 ['foreign INSTANCE boundary',f=>{f.snapshot.nodes.find(n=>n.id==='wrapper').type='INSTANCE';}],
 ['missing independent reference',f=>delete f.snapshot.variantReference],
 ['truncated actual',f=>f.snapshot.source.truncated=true],
])test(name+' cannot externalize a subtree',()=>{const f=fixture();edit(f);assert(run(f).some(e=>e.classification==='human-review'));});
test('swapped main ID must agree with the typed owner value',()=>{const f=fixture(true);f.slot.component.identity.mainComponentId='foreign-main';assert(run(f).some(e=>e.classification==='human-review'));});
test('repeated materialization preserves evidence and classifications',()=>{const f=fixture(),before=clone(f.snapshot),a=core.prepareValidationSnapshot(f.snapshot,f.contract);assert.deepEqual(core.prepareValidationSnapshot(a,f.contract),a);assert.deepEqual(f.snapshot,before);assert.deepEqual(run(f),run(f));});

test('selected text style uses the proven enclosing reference, never actual style as expected',()=>{
 const f=require('./helpers/declared-target.cjs').fixture(core),c=f.compile().contract,s=f.snapshot;
 const comparison={type:'bindingConsistency',bindingKind:'text-style',bindingReference:'selected-variant',targetRoles:['title']};
 c.runtimePolicy.textBindingIdentityFactsVersion=1;c.facts.textBindingComparisons=[comparison];
 c.facts.variantEvidence.textBindings=[{componentKey:'synthetic-variant',componentSetKey:'synthetic-set',styleKeysByPath:{'Title / value':'a'.repeat(40)}}];
 s.nodes[0].variantAvailability={status:'verified'};s.nodes[2].semantic.role='title';
 s.nodes[2].appearance={typography:{styleId:'S:'+ 'b'.repeat(40)}};
 const inherited={text:{effective:{appearance:{typography:{styleId:'S:'+'b'.repeat(40)}}},provenance:{status:'matched'},unknownFacts:[]}};
 const expected=()=>Object.values(s.nodes[0].selectedTextBindingV1);
 core.materializeTextBindingIdentities(s,c,inherited);assert.deepEqual(expected(),[['b'.repeat(40)]]);
 s.nodes[2].appearance.typography.styleId='S:'+'c'.repeat(40);
 core.materializeTextBindingIdentities(s,c,inherited);assert.deepEqual(expected(),[['b'.repeat(40)]]);
 inherited.text.provenance.status='unknown';core.materializeTextBindingIdentities(s,c,inherited);assert.deepEqual(expected(),[]);
 inherited.text.provenance.status='matched';inherited.text.unknownFacts=['baseline.effective.appearance.typography'];
 core.materializeTextBindingIdentities(s,c,inherited);assert.deepEqual(expected(),[]);
});

test('a configured enclosing glyph is compared with that reference; mutation and missing proof remain detectable',()=>{
 const f=require('./helpers/asset-identity-lock.cjs').fixture(core);
 f.manual.rules[0].constraints[0].dependency.field='catalog';f.manual.rules[0].constraints[0].dependency.baselinePolicy='allow-unchanged';f.manual.rules[0].constraints[0].values=['allowed'];
 const c=f.compile().contract,s=f.snapshot;for(const n of s.nodes)n.visibility={effective:true};
 for(let i=1;i<=4;i++){const n=s.nodes.find(n=>n.id==='button-'+i);n.semantic.role='button-'+i;n.visibility={effective:true};}
 s.nodes[0].variantAvailability={status:'verified',targets:Object.fromEntries([1,2,3,4].map(i=>['button-'+i,{present:true}]))};
 const icon=s.nodes.find(n=>n.id==='icon-4'),owner=s.nodes.find(n=>n.id==='addon-4');
 icon.component.identity.componentKey='configured-glyph';icon.component.identity.mainComponentId='configured-main';
 owner.component.properties['Icon-24#1:1']='configured-main';
 const baselines=Object.fromEntries([icon,owner].map(n=>[n.id,{effective:{component:clone(n.component)},provenance:{status:'matched'},unknownFacts:[]}]));
 const binding=c.facts.dependencyBindings.find(b=>b.targetRole==='button-4').id;
 const changed=()=>[s.nodes[0].dependencies[binding].changed];
 core.materializeDependencyFacts(s,c,baselines);assert.deepEqual(changed(),[false],JSON.stringify(s.nodes[0].dependencies[binding]));
 icon.component.identity.componentKey='foreign-glyph';icon.component.identity.mainComponentId='foreign-main';owner.component.properties['Icon-24#1:1']='foreign-main';
 core.materializeDependencyFacts(s,c,baselines);assert.deepEqual(changed(),[true]);
 baselines['icon-4'].provenance.status='unknown';core.materializeDependencyFacts(s,c,baselines);assert.deepEqual(changed(),[undefined]);
});
