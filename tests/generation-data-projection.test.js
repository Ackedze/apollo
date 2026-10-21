const test=require('node:test'),assert=require('node:assert/strict');
const {projectFigmaAuthoring,admitFigmaComponent}=require("../src/generation/agent/figma/projection"),{createFigmaTargets}=require("../src/generation/agent/figma/target");
const manual={component:{componentId:'test.card'},semanticApi:[{id:'size'}],rules:[]},pin={componentId:'test.card',manualSourceHash:'manual-hash'},source={path:'/data/manual.json',sha256:'file-hash',bytes:1};
const records={semantic:{schemaVersion:'apollo.agent-figma-semantic-mapping.v1',mappings:[{mappingId:'test.map',componentId:'test.card',platform:'desktop',representationId:'test.figma',choices:['test.choice'],defaults:[{properties:{size:'40'}}]}]},typed:{schemaVersion:'apollo.agent-figma-typed-native-binding-input.v1',bindings:[{mappingId:'test.map',port:'size',targetId:'target.root',componentProperty:'Size',type:'VARIANT',writeDomain:{type:'string',enum:['40']},normativeSource:{...source,pointer:'/semanticApi/0',RuleIDs:[]}}]},profiles:{choices:[{id:'test.choice',key:'key',properties:{Size:'40'}}],sourceDependencies:[],actualPartDefinitions:[]},manuals:[{pin:source,manual}],targets:{profiles:[]},ruleLinks:{links:[]},denials:[]};
test('compact planning manuals keep exact authority and never admit a stale reference',()=>{
 const packet={platform:'desktop',contracts:[{pin,manual}],mappings:[]},projected=projectFigmaAuthoring(packet,records,{manualReferences:true}),node={mappingId:'test.map',props:{size:'40'},slots:{}};
 assert.equal(projected.figmaMappingRecords.manuals[0].manual,undefined);assert.deepEqual(projected.contracts[0].manual,manual);assert.equal(admitFigmaComponent(node,projected,'desktop').choice.id,'test.choice');
 projected.figmaMappingRecords.manuals[0].manualReference.manualSourceHash='foreign';assert.throws(()=>admitFigmaComponent(node,projected,'desktop'),/FIGMA_PORT_AUTHORITY_UNAVAILABLE/);
});
test('server targets use the admitted data mapping and retain value/platform guards',()=>{
 const targets=createFigmaTargets({genericMapping:records,choices:[],capabilityPlatform:'desktop'}),node={mappingId:'test.map',props:{size:'40'},slots:{}};
 assert.equal(targets.componentTarget(node,'desktop').choice,'test.choice');assert(targets.componentTarget({...node,props:{size:'64'}},'desktop').issues.length);assert(targets.componentTarget(node,'mobile-web').issues.length);
});

test('a parent pins one dependency revision while a newer standalone manual remains current',()=>{
 const input=structuredClone(records),old=structuredClone(manual),latest=structuredClone(manual);
 old.metadata={revision:1};latest.metadata={revision:2};
 input.manuals=[{pin:source,manual:old}];
 input.profiles.sourceDependencies=[{componentId:'parent',revision:1,dependencyPins:[{componentId:'test.card',revision:1,manualSourceHash:'old',compiledHash:'compiled-old'}]},
 {componentId:'test.card',revision:2,manualSemanticHash:'new',compiledSemanticHash:'compiled-new',dependencyPins:[]},
 {componentId:'test.card',revision:1,manualSemanticHash:'old',compiledSemanticHash:'compiled-old',dependencyPins:[]}];
 const projected=projectFigmaAuthoring({platform:'desktop',contracts:[{pin,manual:latest},{pin:{componentId:'parent'},manual:{component:{componentId:'parent'}}}],mappings:[]},input,{manualReferences:true});
 assert.deepEqual(projected.figmaMappingRecords.manuals[0].manual,old);
 assert.equal(admitFigmaComponent({mappingId:'test.map',props:{size:'40'},slots:{}},projected,'desktop').choice.id,'test.choice');
 const bad=structuredClone(projected);bad.figmaMappingRecords.profiles.sourceDependencies[0].dependencyPins[0].compiledHash='forged';
 assert.throws(()=>admitFigmaComponent({mappingId:'test.map',props:{size:'40'},slots:{}},bad,'desktop'),/FIGMA_DEPENDENCY_STALE/);
});
