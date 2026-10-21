const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),esbuild=require('esbuild');
const {projectFigmaAuthoring,projectedContractPins}=require("../src/generation/agent/figma/projection");
const {contractHash:hash}=require("../dist/runtime.cjs");
const filename=path.join(__dirname,"../src/generation/prompt/ui.js"),code=esbuild.buildSync({entryPoints:[filename],bundle:true,platform:'node',write:false,alias:{'@apollo/predicate-engine':path.resolve(__dirname,"../packages/component-contract-core/predicate/index.js")}}).outputFiles[0].text;
const loaded=new Module(filename);loaded._compile(code,filename);const {createPromptTransport,validatePromptResult}=loaded.exports;
function fixture(){
 const pin={componentId:'existing',revision:2,manualSourceHash:hash('existing manual'),archiveSha256:hash('existing archive'),sourceStatus:'draft'};
 const packet={contracts:[{pin,manual:{rules:[{id:'EXISTING'}]}}],mappings:[]},manualPin={path:'/synthetic/manual.json',sha256:hash('manual bytes')};
 const records={semantic:{mappings:[{mappingId:'synthetic.value',componentId:'synthetic.value',platform:'universal',representationId:'synthetic.figma'}]},
  profiles:{choices:[],sourceDependencies:[{componentId:'synthetic.value',revision:7,manual:manualPin,archive:{sha256:hash('archive')},manualSemanticHash:hash('manual'),compiledSemanticHash:hash('compiled'),dependencyPins:[]}]},
  manuals:[{pin:manualPin,manual:{component:{componentId:'synthetic.value'},rules:[{id:'SYNTHETIC-1',text:'Keep complete source rule'}],semanticApi:[]}}],typed:{bindings:[]},ruleLinks:{links:[]},denials:[]};
 return{packet,records,projected:projectFigmaAuthoring(packet,records)};
}
const input={prompt:'Synthetic value',platform:'desktop',viewport:{width:1600,height:900}};
function reply(requestId,contracts){const spec=require("../packages/generation-core/tests/planning-fixtures.cjs").fixture().spec,r={schemaVersion:'apollo.v4-prompt-plan.v1-experimental',requestId,status:'draft',executionAllowed:false,inputHash:hash(input),contextHash:hash('context'),contracts,spec,specHash:hash(spec)};r.resultHash=hash(r);return r;}
test('generic dependency pins preserve source revision and remain unverified without changing existing contracts',()=>{
 const {packet,records,projected}=fixture(),pins=projectedContractPins(projected),added=pins.find(p=>p.componentId==='synthetic.value');
 assert.equal(added.revision,7);assert.equal(added.sourceStatus,'unverified');assert.equal(added.compiledHash,records.profiles.sourceDependencies[0].compiledSemanticHash);
 assert.deepEqual(pins[0],packet.contracts[0].pin);assert.deepEqual(projected.contracts[1].manual,records.manuals[0].manual);assert.equal(packet.contracts.length,1);
});
test('the plugin transport accepts a complete reply containing generic projected contract pins',async()=>{
 const {projected}=fixture(),contracts=projectedContractPins(projected);let expected;
 const transport=createPromptTransport(async(url,options)=>{const request=JSON.parse(options.body);expected=reply(request.requestId,contracts);return{ok:true,status:200,json:async()=>({success:true,result:expected})};});
 assert.deepEqual(await transport.plan(input,'figma'),expected);
});
test('plugin metadata validation still rejects missing revision or verification status after response hashes are recomputed',()=>{
 const {projected}=fixture(),r=reply('synthetic-request',projectedContractPins(projected));assert.equal(validatePromptResult(r,r.requestId,input),true);
 for(const field of ['revision','sourceStatus']){const bad=structuredClone(r);delete bad.contracts[1][field];delete bad.resultHash;bad.resultHash=hash(bad);assert.equal(validatePromptResult(bad,bad.requestId,input),false);}
});

test('different manuals inside one pinned container resolve by component identity and exact document pointer',()=>{
 const {packet,records}=fixture();records.manuals[0].manualPointer='/expected';records.profiles.sourceDependencies[0].manualPointer='/expected';const expected=structuredClone(records.manuals[0].manual);records.manuals.unshift({pin:records.manuals[0].pin,manualPointer:'/other',manual:{component:{componentId:'other'},rules:[{id:'FOREIGN'}],semanticApi:[]}});
 const result=projectFigmaAuthoring(packet,records);assert.deepEqual(result.contracts.find(c=>c.pin.componentId==='synthetic.value').manual,expected);records.profiles.sourceDependencies[0].manualPointer='/missing';assert.throws(()=>projectFigmaAuthoring(packet,records),/FIGMA_PORT_AUTHORITY_UNAVAILABLE/);
});

test('a registered logical mapping gains its native realization without duplicating or accepting a foreign component',()=>{
 const {packet,records}=fixture();packet.mappings=[{id:'synthetic.value',componentId:'synthetic.value',codeRepresentationId:'synthetic.code'}];const result=projectFigmaAuthoring(packet,records);assert.equal(result.mappings.length,1);assert.equal(result.mappings[0].target,'figma');assert.equal(result.mappings[0].representationId,'synthetic.figma');assert.equal(packet.mappings[0].target,undefined);packet.mappings[0].componentId='foreign';assert.throws(()=>projectFigmaAuthoring(packet,records),/FIGMA_MAPPING_DUPLICATE/);packet.mappings[0]={...result.mappings[0]};assert.throws(()=>projectFigmaAuthoring(packet,records),/FIGMA_MAPPING_DUPLICATE/);
});
