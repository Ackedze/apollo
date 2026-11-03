const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), vm = require('node:vm');
const filename = path.join(__dirname, '../src/audit-catalog.ts');
const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const contract = {package:{id:'web-corp.title-view',componentId:'web-corp.title-view',manualRevision:4,manualSourceHash:'manual'},
    facts:{representations:[{id:'desktop',kind:'figma',platform:'desktop'}]},rules:[{revision:4}],runtimePolicy:{},componentDependencies:[]};
  const main = {key:'variant',parent:{type:'COMPONENT_SET',key:'set',componentPropertyDefinitions:{View:{},Allowed:{},Forbidden:{}}}};
  const subject = {id:'consumer',width:300,height:40,getMainComponentAsync:async()=>main,
    componentProperties:{View:{type:'VARIANT',value:'Primary'},Allowed:{type:'BOOLEAN',value:true},Forbidden:{type:'TEXT',value:'override'}},resolvedVariableModes:{}};
  const actual = {anatomy:[{id:'preview:0',figmaNodeId:'consumer'}],snapshot:{selection:['preview:0'],source:{},context:{modes:{},platform:'desktop'},
    nodes:[{id:'preview:0',type:'INSTANCE',component:{},appearance:{color:'observed'}}]}};
  const independent = {selection:['source:0'],source:{rootNodeId:'library'},context:{modes:{},platform:'desktop'},
    nodes:[{id:'source:0',type:'INSTANCE',component:{},appearance:{color:'library'}}]};
  const calls = [], api = new Proxy({variables:{}}, {get(target,key){if(key in target)return target[key];throw Error('Unexpected Figma operation: '+String(key));}});
  const control = {guard(){calls.push('guard');},read:async work=>{calls.push('read');return work();}};
  let boundaries = [], dependencies = [], resourceRequirements = [];
  const modules = {
    '../packages/component-contract-core/src/figma-capture':{collectNodes:async(node,platform,modes,scope,reads)=>{
      assert.equal(node,subject);assert.equal(reads.preparedSourceTopology.componentKey,'variant');calls.push('actual');return copy(actual);
    },appendUnmatchedBaselineWarning:()=>undefined},
    '../packages/component-contract-core/src/catalog-reference':{
      buildCatalogReference:(response,c,request)=>{calls.push({request});return{snapshot:copy(independent),referenceHash:'proof',resourceRequirements,preparedSourceTopology:{componentKey:'variant'}};},
      applyCatalogResourceRemap:prepared=>prepared,materializeCatalogBaseline:(a,b)=>{
        assert.equal(b.nodes[0].appearance.color,'library');a.nodes[0].baseline={effective:copy(b.nodes[0])};a.nodes[0].baselineProvenance={status:'matched'};return{snapshot:a};}},
    '../packages/component-contract-core/src/capture-representation':{resolveCaptureRepresentation:()=>contract.facts.representations[0]},
    '../packages/component-contract-core/src/instance-validation':{allowedComponentPropertyNames:()=>['Allowed']},
    '../packages/component-contract-core/src/instance-main-aliases':{configureInstanceMainAliases(){}},
    '../packages/component-contract-core/src/instance-content-reference':{planInstanceContentReferences:()=>boundaries,materializeInstanceContentReferences(){}},
    '../packages/component-contract-core/src/variant-facts':{captureVariantReference:()=>({complete:true})},
    '../packages/component-contract-core/src/transition-capture':{captureTransitionContext:()=>({complete:true,context:{},fingerprint:'stable'})},
    '../packages/component-contract-core/src/component-dependencies':{componentDependencyKeys:()=>dependencies,dependencyPinIssue:()=>undefined,COMPONENT_DEPENDENCY_DEPTH_LIMIT:4},
    './v3-binding/resource-labels':require('../src/v3-binding/resource-labels'),
  };
  const moduleRecord={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {module:moduleRecord,exports:moduleRecord.exports,require:id=>{assert.ok(modules[id],id);return modules[id];},figma:api,Map,Set,Date,Math},{filename});
  return{contract,subject,actual,calls,control,api,capture:moduleRecord.exports.captureCatalogAudit,
    eligible:moduleRecord.exports.catalogPilotComponent,setBoundaries:v=>boundaries=v,setResourceRequirements:v=>resourceRequirements=v};
}
test('catalogue route uses the exact source request and independent baseline without scene operations',async()=>{
  const f=fixture();let selection;
  const result=await f.capture(f.subject,f.contract,'release',async request=>{selection=copy(request);return{};},f.control);
  assert.deepEqual(selection,{contractId:'web-corp.title-view',componentId:'web-corp.title-view',revision:4,representationId:'desktop',componentKey:'variant',variantKey:'variant',config:{View:'Primary',Allowed:true},modes:{}});
  assert.equal(result.referenceOrigin,'catalog');assert.equal(result.snapshot.nodes[0].appearance.color,'observed');
  assert.equal(result.snapshot.nodes[0].baseline.effective.appearance.color,'library');
  assert.equal(result.snapshot.source.catalogReference.releaseId,'release');
  assert.equal(result.preparedSourceTopology.componentKey,'variant');
});
test('unsupported family and depth refuse catalogue capture, never run live materialization',async()=>{
  const f=fixture();f.contract.package.componentId='web-corp.other';
  await assert.rejects(f.capture(f.subject,f.contract,'release',async()=>assert.fail('resolve'),f.control),e=>e.code==='CATALOG_COMPONENT_OUTSIDE_PILOT');
  f.contract.package.componentId='web-corp.title-view';
  await assert.rejects(f.capture(f.subject,f.contract,'release',async()=>assert.fail('resolve'),f.control,5),e=>e.code==='CATALOG_DEPENDENCY_DEPTH');
});
test('missing package, stale proof and Stop propagate instead of falling back',async()=>{
  for(const code of ['CATALOG_REFERENCE_UNAVAILABLE','CATALOG_SOURCE_PIN_MISMATCH','AUDIT_CANCELLED']){
    const f=fixture();await assert.rejects(f.capture(f.subject,f.contract,'release',async()=>{throw Object.assign(Error(code),{code});},f.control),e=>e.code===code);
    assert.equal(f.calls.includes('actual'),false);
  }
});
test('configured nested replacement remains an explicit coverage gap without creating a host',async()=>{
  const f=fixture();f.setBoundaries([{nodeId:'preview:9'}]);
  const result=await f.capture(f.subject,f.contract,'release',async()=>({}),f.control);
  assert.equal(result.snapshot.instanceContentReferences.attempts[0].failure,'catalog-configured-host-unavailable');
  assert.ok(result.warnings.length);
});
test('transition context is retained for the existing Button transition policy',async()=>{
  const f=fixture();f.contract.package.componentId='core.web.button';f.contract.runtimePolicy.transitionFactsVersion=1;
  const result=await f.capture(f.subject,f.contract,'release',async()=>({}),f.control);
  assert.equal(result.snapshot.transitionCapture.complete,true);assert.equal(result.snapshot.transitionCapture.manualSourceHash,'manual');
});

test('semantic resource witnesses ignore display-only metadata and retain every referenced resource',async()=>{
  const f=fixture(), count=300, seen=[];
  f.actual.snapshot.nodes[0].appearance={fill:Array.from({length:count},(_,i)=>({tokenId:'VariableID:token-'+i}))};
  // The display collector has its own bounded budget; duplicate baselines and
  // mode metadata must not consume the semantic capture budget.
  f.actual.snapshot.nodes[0].baseline={effective:{metadata:Array(60000).fill('unused')}};
  f.api.variables.getVariableByIdAsync=async id=>{seen.push(id);return{id,key:id,variableCollectionId:'collection'};};
  f.api.variables.getVariableCollectionByIdAsync=async id=>({id,key:id,modes:[]});
  await f.capture(f.subject,f.contract,'release',async()=>({}),f.control);
  assert.equal(new Set(seen).size,count);
  assert.deepEqual(seen,Array.from({length:count},(_,i)=>'VariableID:token-'+i));
});

test('semantic resource reads still reject missing resources and ambiguous key witnesses',async()=>{
  const missing=fixture();missing.actual.snapshot.nodes[0].appearance={fill:[{tokenId:'missing'}]};
  missing.api.variables.getVariableByIdAsync=async()=>null;
  await assert.rejects(missing.capture(missing.subject,missing.contract,'release',async()=>({}),missing.control),e=>e.code==='CATALOG_RESOURCE_READ_FAILED');
  const duplicate=fixture();duplicate.actual.snapshot.nodes[0].appearance={fill:[{tokenId:'first'},{tokenId:'second'}]};
  duplicate.api.variables.getVariableByIdAsync=async id=>({id,key:'same-key'});
  duplicate.setResourceRequirements([{kind:'variable',sourceId:'source',sourceKey:'same-key'}]);
  await assert.rejects(duplicate.capture(duplicate.subject,duplicate.contract,'release',async()=>({}),duplicate.control),e=>e.code==='CATALOG_RESOURCE_IDENTITY_AMBIGUOUS');
});

test('portable swap pins use key-proved consumer IDs and independent IDs for resources absent from the document',async()=>{
 const f=fixture();f.contract.runtimePolicy.portableSwapIdentityVersion=1;
 f.actual.snapshot.nodes[0].component.identity={mainComponentId:'consumer-main'};
 f.api.getNodeByIdAsync=async id=>({id,type:'COMPONENT',key:'published-key'});
 f.setResourceRequirements([{kind:'component',sourceId:'source-main',sourceKey:'published-key'},
  {kind:'component',sourceId:'absent-main',sourceKey:'absent-key'}]);
 const result=await f.capture(f.subject,f.contract,'release',async()=>({}),f.control);
 assert.deepEqual(JSON.parse(JSON.stringify(result.snapshot.source.swapComponentKeys)),{
  'consumer-main':'published-key','catalog-source:component:proof:absent-main':'absent-key'});
});
