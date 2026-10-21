const test=require('node:test'),assert=require('node:assert/strict'),core=require('../dist/core.cjs');
const {fixture,clone}=require('./helpers/declared-target.cjs');
const target=(prepared)=>prepared.declaredTargetIdentitiesV1.targets.find(t=>t.semanticRole==='title');
const run=f=>core.evaluateCompiledContract(f.snapshot,f.compile().contract);
const classification=f=>run(f).evaluations[0].classification;
const prepare=f=>core.prepareValidationSnapshot(f.snapshot,f.compile().contract);

test('exact typed native title wins over a diagnostic FRAME and query uses membership',()=>{
 const f=fixture(core),original=clone(f.snapshot),c=f.compile();assert.equal(c.contract.status,'ready',JSON.stringify(c.issues));
 assert.equal(classification(f),'compliant');const p=prepare(f);assert.equal(target(p).nodeId,'text');assert.equal(p.nodes[1].semantic.role,'');
 assert.equal(core.matchesTargetRole(p.nodes[1],'title',c.contract),false);assert.equal(core.matchesTargetRole(p.nodes[2],'title',c.contract),true);
 assert(JSON.stringify(c.contract.rules).includes('declaredTargetMembershipV1.'));assert.deepEqual(f.snapshot,original);
 assert.deepEqual(core.prepareValidationSnapshot(p,c.contract),p);
});
test('hidden native TEXT while FRAME remains visible produces the quantity violation',()=>{const f=fixture(core);f.snapshot.nodes[2].visible=false;assert.equal(classification(f),'violation');const t=target(prepare(f));assert.equal(t.present,true);assert.equal(t.effectiveVisible,false);});
test('hidden remains present while existing presence assertion requires a visible target',()=>{const f=fixture(core);f.manual.rules[0].targetId='title.target';f.manual.rules[0].constraints=[{type:'presence',expected:true}];f.snapshot.nodes[2].visible=false;assert.equal(target(prepare(f)).present,true);assert.equal(classification(f),'violation');});
test('unsupported visibleOnly source contours retain their existing compile gate',()=>{const f=fixture(core);delete f.manual.rules[0].constraints[0].targetRoles;f.manual.rules[0].constraints[0].targetRole='title';assert(f.compile().issues.some(i=>i.code==='CONSTRAINT_VISIBLE_ONLY'));assert.equal(f.compile().contract.rules.length,0);});
test('hidden ancestor yields known false on a complete chain',()=>{const f=fixture(core);f.snapshot.nodes[1].visible=false;assert.equal(target(prepare(f)).effectiveVisible,false);assert.equal(classification(f),'violation');});
test('unknown visibility stays human-review instead of empty-query compliance',()=>{const f=fixture(core);delete f.snapshot.nodes[1].visible;assert.equal(target(prepare(f)).effectiveVisible,undefined);assert.equal(classification(f),'human-review');});
test('known hidden ancestor plus unknown child yields false only with complete topology',()=>{const f=fixture(core);f.snapshot.nodes[1].visible=false;delete f.snapshot.nodes[2].visible;assert.equal(target(prepare(f)).effectiveVisible,false);});
for(const [name,mutate] of [
 ['missing reference',s=>{delete s.variantReference;}],['stale reference',s=>{s.variantReference.definedProperties=['changed'];}],
 ['foreign source',s=>{s.source.componentKey='foreign';}],['wrong variant',s=>{s.variantReference.componentKey='foreign';}],
 ['native type mismatch',s=>{s.nodes[2].type='FRAME';}],['missing parent',s=>{s.nodes[2].parentId='missing';}],
 ['truncated',s=>{s.source.truncated=true;}],['incomplete topology',s=>{s.source.captureTopology.complete=false;}],
 ['cycle',s=>{s.nodes[1].parentId='text';s.nodes[2].childIds=['frame'];s.nodes[0].childIds=[];}],
 ['duplicate IDs',s=>{s.nodes[2].id='frame';}],['missing native source',s=>{delete s.nodes[2].component.sourceIdentity;}],
 ['foreign native owner',s=>{s.nodes[2].component.sourceIdentity.ownerComponentKey='foreign';}],
 ['partial reference',s=>{s.variantReference.complete=false;}],['unknown native type',s=>{s.nodes[2].unknownFacts=['type'];}],
 ['unsupported topology node type',s=>{s.nodes[1].type='INVENTED';}],
])test('uncertain scope fails closed: '+name,()=>{const f=fixture(core);mutate(f.snapshot);assert.equal(target(prepare(f)).status,'unknown');assert.equal(classification(f),'human-review');});
test('a real duplicate native match remains ambiguous, even hidden',()=>{const f=fixture(core),n=clone(f.snapshot.nodes[2]);Object.assign(n,{id:'copy',name:'other-name',visible:false});f.snapshot.nodes.push(n);f.snapshot.nodes[1].childIds.push('copy');assert.equal(target(prepare(f)).status,'ambiguous');assert.equal(classification(f),'human-review');});
test('forged imported ledger/membership/present flags cannot fill missing reference',()=>{const f=fixture(core);f.snapshot.declaredTargetIdentitiesV1={targets:[{status:'resolved',nodeId:'frame'}]};for(const n of f.snapshot.nodes){n.declaredTargetMembershipV1={[core.declaredTargetMembershipKey('title.target')]:true};n.semanticTargets={title:{resolved:true,visibilityKnown:true,present:true}};}delete f.snapshot.variantReference;assert.equal(classification(f),'human-review');assert.equal(target(prepare(f)).status,'unknown');});
test('absent actual target is unresolved, never proved optional absence',()=>{const f=fixture(core);f.snapshot.nodes.pop();f.snapshot.nodes[1].childIds=[];assert.equal(target(prepare(f)).present,undefined);assert.equal(classification(f),'human-review');});
for(const [name,edit] of [
 ['unsupported',f=>{f.manual.metadata.declaredTargetIdentityVersion=4;}],['missing opt-in',f=>{delete f.manual.metadata.declaredTargetIdentityVersion;}],
 ['extra binding key',f=>{f.manual.targets[1].identityBindingsV1[0].name='Title';}],['duplicate binding',f=>{f.manual.targets[1].identityBindingsV1.push(clone(f.manual.targets[1].identityBindingsV1[0]));}],
 ['unknown type',f=>{f.manual.targets[1].identityBindingsV1[0].nodeType='guess';}],['missing source',f=>{delete f.manual.targets[1].identityBindingsV1[0].nativeSource;}],
 ['FRAME fallback root path',f=>{f.manual.targets[1].identityBindingsV1[0].referencePath='';}],['duplicate role',f=>{f.manual.targets[0].semanticRole='title';}],
])test('closed source opt-in rejects '+name,()=>{const f=fixture(core);edit(f);assert(core.validateManualSource(f.manual).some(x=>x.code==='DECLARED_TARGET_IDENTITY'));assert.throws(()=>f.compile(),{code:'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});});
test('unsupported/missing runtime policy cannot fall through to legacy',()=>{const f=fixture(core),c=f.compile().contract;for(const version of [undefined,4]){const bad=clone(c);if(version===undefined)delete bad.runtimePolicy.declaredTargetIdentityVersion;else bad.runtimePolicy.declaredTargetIdentityVersion=version;assert.throws(()=>core.evaluateCompiledContract(f.snapshot,bad),{code:'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});}});
for(const [name,mutate] of [
 ['missing capability',c=>{c.capabilities.facts=c.capabilities.facts.filter(f=>!f.startsWith('declaredTargetMembershipV1.'));}],
 ['legacy exporter stamp',c=>{c.package.sourceExportVersion='component-contract-editor@0.2.91';}],
 ['diagnostic role IR',c=>{c.rules[0].assert.actual.query.where=[{predicate:'equals',actual:{fact:'semantic.role'},expected:{literal:'title'}}];}],
])test('inconsistent new runtime envelope rejects '+name,()=>{const f=fixture(core),c=f.compile().contract;mutate(c);assert.throws(()=>core.evaluateCompiledContract(f.snapshot,c),{code:'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});});
test('native source correspondence survives renaming without using layer names as identity',()=>{const f=fixture(core);f.snapshot.nodes[2].name='Renamed';f.snapshot.nodes[2].semantic.path='Card / Title / Renamed';assert.equal(target(prepare(f)).nodeId,'text');assert.equal(classification(f),'compliant');});
test('target inside native caller SLOT cannot borrow component-owned source identity',()=>{const f=fixture(core);f.snapshot.nodes[1].type='SLOT';assert.equal(target(prepare(f)).status,'unknown');assert.equal(classification(f),'human-review');});
