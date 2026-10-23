const test=require('node:test'),assert=require('node:assert/strict'),core=require('../dist/core.cjs');
const configured=require('./helpers/declared-configured.cjs'),publicSwap=require('./helpers/declared-public-swap.cjs'),asset=require('./helpers/asset-identity-lock.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function heightFixture(){
 const f=configured.fixture(core),parent=f.snapshot,part=f.part;
 part.layout={sizingVertical:'FIXED'};part.bounds={width:20,height:20};parent.context.modes={collection:'mode'};part.resolvedModes={collection:'mode'};part.variable={bindings:{},modes:{collection:'mode'},modeCatalog:{collection:{modes:[{modeId:'mode',name:'Mode'}],defaultModeId:'mode'}}};
 parent.variantReference=core.captureVariantReference(parent,'synthetic-variant','synthetic-set');
 const base=clone(parent);base.source.rootNodeId='independent-owner';
 parent.instanceContentReferences={schemaVersion:'apollo.instance-content-references.v4',base,attempts:[]};parent.instanceContentResults=[];
 const child=clone(parent);child.nodes=[clone(part)];child.nodes[0].parentId=null;child.nodes[0].semantic={path:'Part',role:'root'};
 child.selection=[part.id];child.source=Object.assign({},child.source,{componentKey:'part-neutral',componentSetKey:'part-set',rootNodeId:'actual-child'});
 delete child.instanceContentReferences;delete child.nodes[0].component.sourceIdentity;
 const standalone=clone(child);standalone.source.rootNodeId='independent-standalone';standalone.nodes[0].layout.sizingVertical='HUG';
 child.variantReference=core.captureVariantReference(standalone,'part-neutral','part-set');
 child.nodes=core.materializeEffectiveBaseline(child,standalone,true).snapshot.nodes;
 parent.componentDependencyCaptures=[{nodeId:part.id,nodeMap:{[part.id]:part.id},snapshot:child}];
 const manual=clone(asset.fixture(core).manual);Object.assign(manual.component,{componentId:'synthetic.child',contractId:'synthetic.child',componentKey:'part-set'});
 manual.representations[0].locator={componentKey:'part-set'};manual.targets=[{id:'root',semanticRole:'root',label:'Part',pathHint:'Part',lineage:[],resolution:'resolved'}];
 manual.rules=[Object.assign({},manual.rules[0],{id:'synthetic.height-mode',capability:'layout.sizingVertical',constraints:[{type:'propertyForbidden',fact:'layout.sizingVertical'}]})];
 const shape=child.variantReference.nodes,id=core.stableHash(shape),evidence={schemaVersion:'apollo.variant-anatomy.v1',sourceHash:'c'.repeat(64),structures:{[id]:shape},variants:[{componentKey:'part-neutral',componentSetKey:'part-set',structureId:id,properties:{Color:'Neutral',Presets:'Image'}}]};
 const compiled=core.compileManualSource(manual,evidence);assert(compiled.contract,JSON.stringify(compiled.issues));
 return {parent,part,child,contract:compiled.contract,manual,evidence};
}
const capture=f=>core.validatedDependencyCapture(f.parent,f.part.id,f.contract);
test('independent owner FIXED baseline survives alias restore without mutating actuals',()=>{
 const f=heightFixture(),before=clone(f.parent),v=capture(f);assert(v.snapshot,v.reason);assert(v.ownerBaseline);
 const p=core.prepareValidationSnapshot(v.snapshot,f.contract,1,v.ownerBaseline),r=p.nodes[0];
 assert.equal(r.baseline.effective.layout.sizingVertical,'FIXED');assert.equal(r.layout.sizingVertical,'FIXED');
 assert.deepEqual(core.prepareValidationSnapshot(p,f.contract,1,v.ownerBaseline),p);assert.deepEqual(f.parent,before);
});
test('manual height sizing edit remains a violation against independent owner FIXED',()=>{
 const f=heightFixture();f.part.layout.sizingVertical=f.child.nodes[0].layout.sizingVertical='HUG';const v=capture(f);assert(v.snapshot,v.reason);
 const r=core.evaluateCompiledContract(v.snapshot,f.contract,[],1,v.ownerBaseline);assert(r.evaluations.some(e=>e.classification==='violation'&&e.trace.expected==='FIXED'));
});
test('numeric height edit cannot rewrite expected20 and introduces no new height rule',()=>{
 const f=heightFixture();f.part.bounds.height=f.child.nodes[0].bounds.height=33;const v=capture(f);assert(v.snapshot,v.reason);
 assert.equal(v.ownerBaseline[f.part.id].effective.bounds.height,20);assert.equal(v.snapshot.nodes[0].bounds.height,33);
 assert(!f.contract.rules.some(r=>r.assert?.expected?.fact==='baseline.effective.bounds.height'));
});
test('standalone HUG keeps its original independent baseline',()=>{
 const f=heightFixture(),s=clone(f.child);s.nodes[0].layout.sizingVertical='HUG';const p=core.prepareValidationSnapshot(s,f.contract,1);
 assert.equal(p.nodes[0].baseline.effective.layout.sizingVertical,'HUG');assert(core.evaluateCompiledContract(s,f.contract).evaluations.every(e=>e.classification!=='violation'));
});
for(const [name,mutate] of [
 ['missing owner evidence',f=>delete f.parent.instanceContentReferences],
 ['stale owner modes',f=>f.parent.instanceContentReferences.base.context.modes.other='foreign'],
 ['foreign owner reference',f=>f.parent.instanceContentReferences.base.source.componentKey='foreign'],
 ['forged cached matched without references',f=>{delete f.parent.instanceContentReferences;f.part.baseline={effective:{layout:{sizingVertical:'FIXED'}}};f.part.baselineProvenance={status:'matched'};}],
])test('owner baseline rejects '+name,()=>{const f=heightFixture();mutate(f);const v=capture(f);assert.equal(v.reason,'dependency-owner-baseline-unavailable');});

function swapped(descendant=false){
 const f=publicSwap.fixture(core);
 if(descendant){
  const right=f.snapshot.nodes.find(n=>n.id==='right'),inner={id:'foreign-child',parentId:right.id,childIds:[],order:0,name:'Inner',type:'FRAME',visible:true,unknownFacts:[],semantic:{path:'Card / Original right / Inner'},component:{properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{},sourceIdentity:{version:1,sourceNodeId:'original-inner',ownerComponentKey:'original-key',ownerMainComponentId:'original-main'}}};right.childIds=[inner.id];f.snapshot.nodes.push(inner);f.inner=inner;
  f.snapshot.variantReference=clone(core.captureVariantReference(clone(f.snapshot),'synthetic-variant','synthetic-set',Object.keys(f.snapshot.nodes[0].component.properties)));
  f.manual.targets.push({id:inner.id,semanticRole:'foreign-child',label:'Inner',resolution:'resolved',lineage:[],pathHint:inner.semantic.path,identityBindingsV1:[{representationId:'desktop',componentKey:'synthetic-variant',componentSetKey:'synthetic-set',referenceHash:'a'.repeat(64),referencePath:'Original right / Inner',nodeType:'FRAME',nativeSource:clone(inner.component.sourceIdentity)}]});
  delete f.manual.targets.at(-1).identityBindingsV1[0].nativeSource.version;
  const ref=f.snapshot.variantReference,id=core.stableHash(ref.nodes);f.evidence.structures[id]=ref.nodes;f.evidence.variants[0].structureId=id;
  for(const t of f.manual.targets)for(const b of t.identityBindingsV1){b.referenceHash=core.stableHash(ref);b.portableReferenceHash=core.portableDeclaredTargetReferenceHash(ref);b.configurationReferenceHash=core.publicSwapDeclaredTargetReferenceHash(ref,{targets:f.manual.targets,policies:f.manual.rules,representations:f.manual.representations});}
 }
 const base=clone(f.snapshot),original=clone(f.snapshot.variantReference);base.source.rootNodeId='independent-base';
 publicSwap.swap(f,'right');if(f.inner)Object.assign(f.inner.component.sourceIdentity,{ownerComponentKey:'foreign-key',ownerMainComponentId:'foreign-main'});f.snapshot.variantReference=original;f.snapshot.source.rootNodeId='actual-instance';
 const reference=clone(f.snapshot);reference.source.rootNodeId='independent-swap';
 f.snapshot.instanceContentReferences={schemaVersion:'apollo.instance-content-references.v4',base,attempts:[{boundaryNodeId:'right',reference}]};return f;
}
const prepared=f=>{const compiled=core.compileManualSource(f.manual,f.evidence);assert(compiled.contract,JSON.stringify(compiled.issues));return core.prepareValidationSnapshot(f.snapshot,compiled.contract)};
const target=(p,id)=>p.declaredTargetIdentitiesV1.targets.find(t=>t.targetId===id);
test('only the explicitly allowed typed public swap root retains membership',()=>{
 const f=swapped(),p=prepared(f);assert.equal(target(p,'right').status,'resolved');
});
test('a public swap root never grants identity to its foreign descendants',()=>{const f=swapped(true),p=prepared(f);assert.equal(target(p,'right').status,'resolved');assert.notEqual(target(p,'foreign-child').status,'resolved')});
for(const [name,mutate] of [
 ['missing policy',f=>{f.manual.rules=f.manual.rules.filter(r=>r.id!=='synthetic.right-swap')}],
 ['missing independent reference',f=>delete f.snapshot.instanceContentReferences],
 ['foreign public owner',f=>{f.snapshot.nodes.find(n=>n.id==='right').component.sourceIdentity.ownerComponentKey='foreign'}],
 ['forged cached swap match',f=>{delete f.snapshot.instanceContentReferences;f.snapshot.instanceContentResults=[{boundaryNodeId:'right',status:'matched',lineageProven:true,matchedNodeIds:['right']}]}],
])test('public swap fails closed for '+name,()=>{const f=swapped();mutate(f);assert.notEqual(target(prepared(f),'right').status,'resolved')});

function alternative(){
 const f=configured.fixture(core),inner={id:'inner',parentId:f.part.id,childIds:[],type:'FRAME',order:0,name:'Inner',visible:true,unknownFacts:[],semantic:{path:'Card / Part / Inner'},variable:{bindings:{appearance_fill:{required:true,tokenIds:['synthetic-token']}}},component:{properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{},sourceIdentity:{version:1,sourceNodeId:'original-inner',ownerComponentKey:'part-neutral',ownerMainComponentId:'part-neutral-main'}}};
 f.part.childIds=[inner.id];f.snapshot.nodes.push(inner);f.snapshot.variantReference=clone(core.captureVariantReference(clone(f.snapshot),'synthetic-variant','synthetic-set'));
 const ref=f.snapshot.variantReference,id=core.stableHash(ref.nodes);f.evidence.structures[id]=ref.nodes;f.evidence.variants[0].structureId=id;
 for(const t of f.manual.targets)for(const b of t.identityBindingsV1){b.referenceHash=core.stableHash(ref);b.portableReferenceHash=core.portableDeclaredTargetReferenceHash(ref);}
 const b={representationId:'desktop',componentKey:'synthetic-variant',componentSetKey:'synthetic-set',referenceHash:core.stableHash(ref),portableReferenceHash:core.portableDeclaredTargetReferenceHash(ref),referencePath:'Part / Inner',nodeType:'FRAME',nativeSource:{sourceNodeId:'original-inner',ownerComponentKey:'part-neutral',ownerMainComponentId:'part-neutral-main'}};
 const alt=Object.assign({},clone(b),{componentKey:'synthetic-alternative',nativeSource:{sourceNodeId:'configured-inner',ownerComponentKey:'part-configured',ownerMainComponentId:'part-configured-main'}});
 f.manual.targets.push({id:'inner.target',semanticRole:'inner',label:'Inner',resolution:'resolved',lineage:[],pathHint:'Card / Part / Inner',identityBindingsV1:[b,alt]});
 f.evidence.variants.push({componentKey:'synthetic-alternative',componentSetKey:'synthetic-set',structureId:id,properties:{Background:'True'}});
 f.manual.rules.push(Object.assign({},f.manual.rules[0],{id:'synthetic.inner-token',targetId:'inner.target',capability:'appearance.fill',constraints:[{type:'tokenBinding',bindingRequired:true}]}));
 configured.switchVariant(f,core);Object.assign(inner.component.sourceIdentity,{sourceNodeId:'configured-inner',ownerComponentKey:'part-configured',ownerMainComponentId:'part-configured-main'});
 const reference=clone(f.snapshot);delete reference.instanceContentReferences;reference.source.rootNodeId='independent-configured-host';f.snapshot.instanceContentReferences.attempts[0].reference=reference;
 return Object.assign(f,{inner});
}
test('same-target exact declared alternative resolves only within the configured owner',()=>{const f=alternative();assert.equal(target(prepared(f),'inner.target').status,'resolved')});
test('resolved configured paint still rejects an unbound RGB override',()=>{
 const f=alternative();f.inner.variable.bindings.appearance_fill={required:false,tokenIds:[]};
 const c=f.compile().contract,r=core.evaluateCompiledContract(f.snapshot,core.prepareAuthoringPreviewContract(c));assert(r.evaluations.some(e=>e.ruleId.startsWith('synthetic.inner-token')&&e.classification==='violation'));
});
for(const [name,mutate] of [
 ['unlisted alternative',f=>f.manual.targets.find(t=>t.id==='inner.target').identityBindingsV1.pop()],
 ['wrong owner',f=>f.inner.component.sourceIdentity.ownerComponentKey='foreign'],
 ['unknown source',f=>f.inner.unknownFacts.push('component.sourceIdentity')],
 ['missing reference',f=>delete f.snapshot.instanceContentReferences],
 ['foreign configured reference',f=>f.snapshot.instanceContentReferences.attempts[0].reference.nodes.find(n=>n.id==='inner').component.sourceIdentity.sourceNodeId='foreign'],
 ['stale selected pin',f=>f.manual.targets.find(t=>t.id==='inner.target').identityBindingsV1[0].portableReferenceHash='a'.repeat(64)],
 ['duplicate physical occurrence',f=>{const n=clone(f.inner);n.id='duplicate-inner';f.snapshot.nodes.push(n);f.part.childIds.push(n.id);const r=f.snapshot.instanceContentReferences.attempts[0].reference,m=clone(n);r.nodes.push(m);r.nodes.find(n=>n.id===f.part.id).childIds.push(m.id)}],
])test('declared alternative stays unknown or ambiguous for '+name,()=>{const f=alternative();mutate(f);assert.notEqual(target(prepared(f),'inner.target').status,'resolved')});
test('repeated declaration of the same native alternative is one physical candidate',()=>{
 const f=alternative(),t=f.manual.targets.find(t=>t.id==='inner.target'),b=clone(t.identityBindingsV1[1]);b.componentKey='synthetic-alternative2';t.identityBindingsV1.push(b);f.evidence.variants.push(Object.assign({},f.evidence.variants.at(-1),{componentKey:b.componentKey}));assert.equal(target(prepared(f),'inner.target').status,'resolved');
});

test('a proven public swap exposes only its independently known native variant API',()=>{const f=swapped();const c=core.compileManualSource(f.manual,f.evidence).contract;c.capabilities.facts.push('component.properties.Size');const p=core.prepareValidationSnapshot(f.snapshot,c),n=p.nodes.find(n=>n.id==='right');assert.equal(n.variantAvailability.componentProperties[core.propertyAvailabilityKey('Size')],true);assert.equal(n.component.properties.Size,'24');});

test('public swap native Size still violates a mismatched allowed domain',()=>{const f=swapped();f.manual.rules.push(Object.assign({},f.manual.rules[0],{id:'synthetic.native-size',targetId:'right',capability:'component.configuration',permission:'constrained',constraints:[{type:'propertyDomain',fact:'component.properties.Size',values:['16']}]}));const c=core.compileManualSource(f.manual,f.evidence);assert(c.contract,JSON.stringify(c.issues));assert(core.evaluateCompiledContract(f.snapshot,c.contract).evaluations.some(e=>e.ruleId.startsWith('synthetic.native-size')&&e.classification==='violation'));});
test('unknown public swap native property type cannot become available',()=>{const f=swapped(),n=f.snapshot.nodes.find(n=>n.id==='right');n.unknownFacts.push('component.propertyTypes.Size');const c=core.compileManualSource(f.manual,f.evidence).contract;c.capabilities.facts.push('component.properties.Size');const p=core.prepareValidationSnapshot(f.snapshot,c);assert.notEqual(p.nodes.find(n=>n.id==='right').variantAvailability.componentProperties[core.propertyAvailabilityKey('Size')],true);});

for(const [name,mutate]of [
 ['missing actual value',f=>delete f.snapshot.nodes.find(n=>n.id==='right').component.properties.Size],
 ['missing independent field',f=>{const n=f.snapshot.instanceContentReferences.attempts[0].reference.nodes.find(n=>n.id==='right');delete n.component.properties.Size;delete n.component.propertyTypes.Size;}],
 ['unknown independent type',f=>f.snapshot.instanceContentReferences.attempts[0].reference.nodes.find(n=>n.id==='right').unknownFacts.push('component.propertyTypes.Size')],
 ['inconsistent independent value',f=>f.snapshot.instanceContentReferences.attempts[0].reference.nodes.find(n=>n.id==='right').component.properties.Size='32'],
])test('public swap API availability stays unknown for '+name,()=>{const f=swapped();mutate(f);const c=core.compileManualSource(f.manual,f.evidence).contract;c.capabilities.facts.push('component.properties.Size');const p=core.prepareValidationSnapshot(f.snapshot,c);assert.notEqual(p.nodes.find(n=>n.id==='right').variantAvailability.componentProperties[core.propertyAvailabilityKey('Size')],true);});

for(const [name,mutate]of [
 ['unknown owner reference context',f=>f.parent.instanceContentReferences.base.context.unknownFacts.push('context.platform')],
 ['unknown parent native identity',f=>f.parent.nodes[0].unknownFacts.push('component.identity')],
])test('owner baseline cannot make uncertain reference facts known: '+name,()=>{const f=heightFixture();mutate(f);assert.equal(capture(f).reason,'dependency-owner-baseline-unavailable')});

test('unknown independent layout remains UNKNOWN instead of a fabricated FIXED pass',()=>{const f=heightFixture();f.parent.instanceContentReferences.base.nodes.find(n=>n.id===f.part.id).unknownFacts.push('layout.sizingVertical');const v=capture(f);assert(v.snapshot,v.reason);const p=core.prepareValidationSnapshot(v.snapshot,f.contract,1,v.ownerBaseline);assert(p.nodes[0].unknownFacts.includes('baseline.effective.layout.sizingVertical'));const r=core.evaluateCompiledContract(v.snapshot,f.contract,[],1,v.ownerBaseline);assert(r.evaluations.some(e=>e.classification==='human-review'));});
test('unrelated unknown owner modes do not erase independently proven layout',()=>{const f=heightFixture();f.parent.instanceContentReferences.base.nodes.find(n=>n.id===f.part.id).unknownFacts.push('variable.modes.collection');const v=capture(f);assert(v.snapshot,v.reason);const p=core.prepareValidationSnapshot(v.snapshot,f.contract,1,v.ownerBaseline);assert(p.nodes[0].unknownFacts.includes('baseline.effective.variable.modes.collection'));assert.equal(p.nodes[0].baseline.effective.layout.sizingVertical,'FIXED');});

test('owner baseline RESET unknown -> known clears only the old derived uncertainty',()=>{
 const f=heightFixture(),expected=f.parent.instanceContentReferences.base.nodes.find(n=>n.id===f.part.id);expected.unknownFacts.push('layout.sizingVertical');
 const unknown=capture(f),previous=core.prepareValidationSnapshot(unknown.snapshot,f.contract,1,unknown.ownerBaseline);assert(previous.nodes[0].unknownFacts.includes('baseline.effective.layout.sizingVertical'));
 expected.unknownFacts=[];const known=capture(f),fresh=core.evaluateCompiledContract(known.snapshot,f.contract,[],1,known.ownerBaseline),reset=core.evaluateCompiledContract(previous,f.contract,[],1,known.ownerBaseline);
 assert(fresh.evaluations.every(e=>e.classification==='compliant'));assert(reset.evaluations.every(e=>e.classification==='compliant'));
});
test('owner baseline RESET known -> unknown remains UNKNOWN and idempotent',()=>{
 const f=heightFixture(),known=capture(f),previous=core.prepareValidationSnapshot(known.snapshot,f.contract,1,known.ownerBaseline);f.parent.instanceContentReferences.base.nodes.find(n=>n.id===f.part.id).unknownFacts.push('layout.sizingVertical');
 const unknown=capture(f),next=core.prepareValidationSnapshot(previous,f.contract,1,unknown.ownerBaseline);assert(next.nodes[0].unknownFacts.includes('baseline.effective.layout.sizingVertical'));assert.deepEqual(core.prepareValidationSnapshot(next,f.contract,1,unknown.ownerBaseline),next);assert(core.evaluateCompiledContract(next,f.contract,[],1,unknown.ownerBaseline).evaluations.some(e=>e.classification==='human-review'));
});
test('owner baseline RESET retains captured actual uncertainty',()=>{
 const f=heightFixture(),known=capture(f),source=core.prepareValidationSnapshot(known.snapshot,f.contract,1,known.ownerBaseline);source.nodes[0].unknownFacts.push('layout.sizingVertical','baseline.effective.layout.sizingVertical');
 const p=core.prepareValidationSnapshot(source,f.contract,1,known.ownerBaseline);assert(p.nodes[0].unknownFacts.includes('layout.sizingVertical'));assert(!p.nodes[0].unknownFacts.includes('baseline.effective.layout.sizingVertical'));assert(core.evaluateCompiledContract(p,f.contract,[],1,known.ownerBaseline).evaluations.some(e=>e.classification==='human-review'));
});
test('owner baseline RESET lets more-local independent proof replace previous uncertainty',()=>{
 const f=configured.fixture(core);f.part.layout={sizingVertical:'HUG'};const independent=clone(f.snapshot);independent.source.rootNodeId='independent-enclosing-owner';
 const proof=core.materializeEffectiveBaseline(f.snapshot,independent,true).snapshot.nodes.find(n=>n.id===f.part.id),owner={part:{effective:clone(proof.baseline.effective),provenance:clone(proof.baselineProvenance),unknownFacts:['baseline.effective.layout.sizingVertical']}};
 configured.switchVariant(f,core);f.part.layout.sizingVertical='FIXED';f.snapshot.instanceContentReferences.attempts[0].reference.nodes.find(n=>n.id===f.part.id).layout.sizingVertical='FIXED';f.part.unknownFacts.push('baseline.effective.layout.sizingVertical');
 const p=core.prepareValidationSnapshot(f.snapshot,f.compile().contract,undefined,owner),part=p.nodes.find(n=>n.id==='part');assert.equal(part.baseline.effective.layout.sizingVertical,'FIXED');assert.equal(part.baselineProvenance.kind,'independent-host-variant');assert(!part.unknownFacts.includes('baseline.effective.layout.sizingVertical'));
});

test('legacy unversioned capture keeps root-only representation rebase',()=>{
 const f=heightFixture();delete f.parent.source.occurrenceAddressVersion;delete f.child.source.occurrenceAddressVersion;f.child.nodes[0].component.sourceIdentity=clone(f.part.component.sourceIdentity);
 const base=clone(f.child);base.source.rootNodeId='legacy-reference';f.child.instanceContentReferences={schemaVersion:'apollo.instance-content-references.v4',base,attempts:[]};f.contract.facts.representations[0].platform='universal';
 const v=capture(f);assert(v.snapshot,v.reason);assert.equal(v.snapshot.context.platform,'universal');assert.equal(v.snapshot.instanceContentReferences.base.context.platform,'desktop');assert.equal(v.ownerBaseline,undefined);
});
test('legitimate legacy absence preserves independent actual-only child checks',()=>{
 const f=heightFixture();delete f.parent.instanceContentReferences;delete f.parent.instanceContentResults;f.part.appearance=f.child.nodes[0].appearance={opacity:.4};f.manual.rules[0].capability='appearance.opacity';f.manual.rules[0].constraints=[{type:'propertyDomain',values:[1]}];f.contract=core.compileManualSource(f.manual,f.evidence).contract;
 const v=capture(f);assert(v.snapshot,v.reason);assert.equal(v.ownerBaseline,undefined);assert(core.evaluateCompiledContract(v.snapshot,f.contract).evaluations.some(e=>e.classification==='violation'));
});
test('unadvertised legacy absence does not fabricate an owner baseline',()=>{
 const f=heightFixture();delete f.parent.instanceContentReferences;delete f.parent.instanceContentResults;const v=capture(f);assert(v.snapshot,v.reason);assert.equal(v.ownerBaseline,undefined);assert.equal(v.snapshot.nodes[0].baseline.effective.layout.sizingVertical,'HUG');
});
test('advertised malformed owner proof is not a legacy fallback',()=>{
 const f=heightFixture();delete f.parent.instanceContentReferences.base;f.parent.instanceContentResults=[{status:'matched',lineageProven:true,matchedNodeIds:[f.part.id],boundaryNodeId:f.part.id}];assert.equal(capture(f).reason,'dependency-owner-baseline-unavailable');
});


test('same configured native identity preserves enclosing paint after local reference resolution',()=>{
 const f=configured.fixture(core);configured.switchVariant(f,core);
 const local=f.snapshot.instanceContentReferences.attempts[0].reference;
 f.part.appearance={fill:[{type:'SOLID',color:{r:0,g:1,b:0}}]};
 local.nodes.find(n=>n.id===f.part.id).appearance={fill:[{type:'SOLID',color:{r:0,g:0,b:0}}]};
 const enclosing=clone(local);enclosing.source.rootNodeId='independent-enclosing-configured';
 enclosing.nodes.find(n=>n.id===f.part.id).appearance=clone(f.part.appearance);
 const expected=core.materializeEffectiveBaseline(f.snapshot,enclosing,true).snapshot.nodes.find(n=>n.id===f.part.id);
 const owner={part:{effective:clone(expected.baseline.effective),provenance:clone(expected.baselineProvenance),unknownFacts:[]}};
 const contract=f.compile().contract,p=core.prepareValidationSnapshot(f.snapshot,contract,undefined,owner),part=p.nodes.find(n=>n.id==='part');
 assert.deepEqual(part.baseline.effective.appearance.fill,enclosing.nodes.find(n=>n.id==='part').appearance.fill);
 assert.deepEqual(core.prepareValidationSnapshot(p,contract,undefined,owner),p);
});
test('manual native main aliases opt-in compiles without inventing an asset rule',()=>{
 const f=asset.fixture(core);f.manual.rules=f.manual.rules.filter(r=>!r.constraints.some(c=>c.type==='dependencyDomain'));
 f.manual.metadata.instanceMainComponentAliasesVersion=1;
 const compiled=core.compileManualSource(f.manual,f.evidence);assert(compiled.contract,JSON.stringify(compiled.issues));
 assert.equal(compiled.contract.runtimePolicy.instanceMainComponentAliasesVersion,1);
 f.manual.metadata.instanceMainComponentAliasesVersion=2;
 assert(core.validateManualSource(f.manual).some(i=>i.code==='INSTANCE_MAIN_COMPONENT_ALIASES_VERSION'));
});
