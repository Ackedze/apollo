const test = require('node:test'), assert = require('node:assert/strict'), core = require('../dist/core.cjs');
const {fixture, clone} = require('./helpers/declared-target.cjs');

function textFixture() {
  const f=fixture(core), n=f.snapshot.nodes[2];
  n.text={characters:'A🙂B',fontSize:16,lineHeight:{unit:'PIXELS',value:20},textAutoResize:'HEIGHT',textTruncation:'DISABLED',paragraphSpacing:0,maxHeight:null};
  n.bounds={height:40};
  f.manual.rules[0].targetId='title.target';f.manual.rules[0].capability='text.content';
  f.manual.rules[0].constraints=[{type:'layoutConstraint',fact:'textContentV1.characterCount',max:3},{type:'layoutConstraint',fact:'textContentV1.lineCount',max:2}];
  return f;
}
const run=f=>core.evaluateCompiledContract(f.snapshot,core.prepareAuthoringPreviewContract(f.compile().contract));
test('text metrics count Unicode code points and actual auto-height lines',()=>{
  const f=textFixture();assert(run(f).evaluations.every(e=>e.classification==='compliant'));
  f.snapshot.nodes[2].text.characters+='C';assert(run(f).evaluations.some(e=>e.classification==='violation'));
  f.snapshot.nodes[2].bounds.height=60;assert(run(f).evaluations.every(e=>e.classification==='violation'));
});
for (const [name,mutate] of [
  ['fixed height',n=>n.text.textAutoResize='NONE'],['truncation',n=>n.text.textTruncation='ENDING'],
  ['paragraph spacing',n=>n.text.paragraphSpacing=4],['height cap',n=>n.text.maxHeight=40],
  ['mixed line height',n=>delete n.text.lineHeight],['unknown height',n=>n.unknownFacts=['bounds.height']],
  ['nonintegral text height',n=>n.bounds.height=45],['old capture',n=>delete n.text.paragraphSpacing],
]) test('line count stays unknown: '+name,()=>{const f=textFixture();mutate(f.snapshot.nodes[2]);assert(run(f).evaluations.some(e=>e.classification==='human-review'));});
test('cached metrics cannot conceal violations',()=>{const f=textFixture();f.snapshot.nodes[2].textContentV1={characterCount:0,lineCount:0};f.snapshot.nodes[2].bounds.height=80;assert(run(f).evaluations.some(e=>e.classification==='violation'));});
test('alignment constraint selects visible TEXT descendants and detects CENTER',()=>{
  const f=textFixture();f.manual.rules[0].targetId='root';f.manual.rules[0].targetScope='self-and-descendants';
  f.manual.rules[0].constraints=[{type:'layoutConstraint',fact:'text.textAlignHorizontal',value:'LEFT'}];
  f.snapshot.nodes[2].text.textAlignHorizontal='LEFT';assert(run(f).evaluations.every(e=>e.classification==='compliant'));
  f.snapshot.nodes[2].text.textAlignHorizontal='CENTER';assert(run(f).evaluations.some(e=>e.classification==='violation'));
  f.snapshot.nodes[2].visible=false;assert(!run(f).evaluations.some(e=>e.classification==='violation'));
});
test('historical contracts retain replay facts without opting into metrics',()=>{const f=fixture(core);assert.equal(core.prepareValidationSnapshot(f.snapshot,f.compile().contract).nodes[2].textContentV1,undefined);});
test('missing or unknown policy cannot trust cached text metrics',()=>{const f=textFixture(), c=f.compile().contract;delete c.runtimePolicy.textContentFactsVersion;assert.throws(()=>core.prepareValidationSnapshot(f.snapshot,c));c.runtimePolicy.textContentFactsVersion=2;assert.throws(()=>core.prepareValidationSnapshot(f.snapshot,c));});
test('native fact policy checks IR references even with an incomplete capability declaration',()=>{
 const f=textFixture(),c=f.compile().contract;c.capabilities.facts=[];delete c.runtimePolicy.textContentFactsVersion;
 assert.throws(()=>core.prepareValidationSnapshot(f.snapshot,c));c.runtimePolicy.textContentFactsVersion=1;c.package.sourceExportVersion='component-contract-editor@0.2.93';assert.throws(()=>core.prepareValidationSnapshot(f.snapshot,c));
});

function nativeFixture() {
  const f=fixture(core), root=f.snapshot.nodes[0], n={id:'part',parentId:root.id,childIds:[],name:'Part',type:'INSTANCE',order:3,visible:true,unknownFacts:[],semantic:{role:'part'},component:{identity:{componentKey:'part-a',componentSetKey:'part-set',mainComponentId:'part-main'},sourceIdentity:{version:1,sourceNodeId:'part-source',ownerComponentKey:'synthetic-variant',ownerMainComponentId:'synthetic-main'},properties:{Title:'Primary'},propertyTypes:{Title:'VARIANT'},propertyReferences:[],propertyReferenceBindings:{}}};
  root.childIds.push(n.id);f.snapshot.nodes.push(n);f.snapshot.variantReference=core.captureVariantReference(clone(f.snapshot),'synthetic-variant','synthetic-set');
  const structureId=core.stableHash(f.snapshot.variantReference.nodes);f.evidence.structures={[structureId]:f.snapshot.variantReference.nodes};f.evidence.variants[0].structureId=structureId;
  for(const t of f.manual.targets)t.identityBindingsV1[0].referenceHash=core.stableHash(f.snapshot.variantReference);
  f.manual.targets.push({id:'part.target',semanticRole:'part',label:'Part',resolution:'resolved',lineage:[],pathHint:'Card / Part',identityBindingsV1:[{representationId:'desktop',componentKey:'synthetic-variant',componentSetKey:'synthetic-set',referenceHash:core.stableHash(f.snapshot.variantReference),referencePath:'Part',nodeType:'INSTANCE',nativeSource:{sourceNodeId:'part-source',ownerComponentKey:'synthetic-variant',ownerMainComponentId:'synthetic-main'}}]});
  f.manual.rules[0].constraints=[{type:'propertyDomain',fact:'nativeTargetPropertiesV1.'+core.declaredTargetMembershipKey('part.target')+'.properties.Title',values:['Secondary']}];
  return f;
}
test('native occurrence configuration detects an invalid value',()=>{const f=nativeFixture();assert(run(f).evaluations.some(e=>e.classification==='violation'));f.snapshot.nodes[3].component.properties.Title='Secondary';assert(run(f).evaluations.every(e=>e.classification==='compliant'));});
for(const [name,mutate]of [
  ['foreign source',n=>n.component.sourceIdentity.sourceNodeId='foreign'],
  ['foreign source owner',n=>n.component.sourceIdentity.ownerComponentKey='foreign'],
  ['wrong local owner',n=>n.component.sourceIdentity.ownerMainComponentId='foreign'],
  ['unknown property',n=>n.unknownFacts=['component.properties.Title']],
  ['wrong type',n=>n.component.propertyTypes.Title='BOOLEAN'],
])test('native property remains unknown: '+name,()=>{const f=nativeFixture();mutate(f.snapshot.nodes[3]);assert(run(f).evaluations.some(e=>e.classification==='human-review'));});
test('swap exception is tied to the exact native occurrence',()=>{
  const f=nativeFixture(), key=core.declaredTargetMembershipKey('part.target');
  f.manual.rules[0].constraints=[{type:'layoutConstraint',fact:'nativeTargetPropertiesV1.swapCountExcept_'+key,min:0,max:0}];
  assert(run(f).evaluations.every(e=>e.classification==='compliant'));
  f.snapshot.nodes[3].component.identity={componentKey:'foreign',componentSetKey:'foreign-set',mainComponentId:'foreign-main'};
  assert(run(f).evaluations.every(e=>e.classification==='compliant'));
  f.manual.rules[0].constraints[0].fact='nativeTargetPropertiesV1.swapCountExcept_'+core.declaredTargetMembershipKey('root');
  f.snapshot.nodes[3].component.sourceIdentity.sourceNodeId='foreign';
  assert(run(f).evaluations.some(e=>e.classification==='human-review'));
});
test('an instance swap outside the exact exception is a violation',()=>{
  const f=nativeFixture(),part=f.snapshot.nodes[3],foreign=clone(part);
  foreign.id='other';foreign.name='Other';foreign.component.sourceIdentity.sourceNodeId='other-source';
  f.snapshot.nodes[0].childIds.push(foreign.id);f.snapshot.nodes.push(foreign);
  f.snapshot.variantReference=core.captureVariantReference(clone(f.snapshot),'synthetic-variant','synthetic-set');
  const structureId=core.stableHash(f.snapshot.variantReference.nodes);f.evidence.structures={[structureId]:f.snapshot.variantReference.nodes};f.evidence.variants[0].structureId=structureId;
  for(const t of f.manual.targets)t.identityBindingsV1[0].referenceHash=core.stableHash(f.snapshot.variantReference);
  f.manual.rules[0].constraints=[{type:'layoutConstraint',fact:'nativeTargetPropertiesV1.swapCountExcept_'+core.declaredTargetMembershipKey('part.target'),min:0,max:0}];
  assert(run(f).evaluations.every(e=>e.classification==='compliant'));
  foreign.component.identity={componentKey:'foreign',componentSetKey:'foreign-set',mainComponentId:'foreign-main'};
  assert(run(f).evaluations.some(e=>e.classification==='violation'));
});
test('finite scenario context precondition is accepted only for a declared root input',()=>{
  const f=fixture(core);f.manual.validationContext=[{id:'Placement',valueType:'enum',domain:['single','group'],label:'Placement',description:'Explicit placement'}];
  f.manual.rules[0].applicability.context={'expectedInput.Placement':'single'};
  assert(!f.compile().issues.some(i=>i.level==='error'));
  f.manual.rules[0].applicability.context={'expectedInput.Placement':'invented'};
  assert(f.compile().issues.some(i=>i.code==='RULE_CONTEXT_UNMAPPED'));
});
