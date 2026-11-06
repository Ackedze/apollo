const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto'),esbuild=require('esbuild');
const {buildV3Groups}=require('../src/v3-audit/ui-model'),protocol=require('../src/v3-audit/protocol');
const root=path.resolve(__dirname,'..'),key='a'.repeat(40),other='b'.repeat(40),style='S:'+'c'.repeat(40)+',1:1',changedStyle='S:'+'d'.repeat(40)+',1:2';
function load(){
 const result=esbuild.buildSync({stdin:{resolveDir:root,loader:'ts',contents:`export * from './src/v3-audit/entry';export * from './src/v3-audit/bridge';export * from './src/v3-audit/data-client';export * from './src/v3-audit/rules/componentRules';export * from './src/v3-audit/rules/runtimeContractRegistry';export * from './src/v3-audit/assessment/customizationAssessment';export * from './src/v3-audit/services/auditResults';export * from './src/v3-audit/create-check-state';export * from './src/v3-audit/stats/report';`},bundle:true,write:false,metafile:true,platform:'node',format:'cjs',logLevel:'silent'});
 assert(!Object.keys(result.metafile.inputs).some(p=>/component-contract-core|predicate\/index|experimentalContractV2/.test(p)));
 const m={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,m,m.exports);return m.exports;
}
function rule(extra={}){return Object.assign({ruleId:'component:sample.fixed-typography',severity:'error',source:'component-contract',ruleKind:'design-rule',authority:{status:'active',provenance:'design-system-author',revision:1},appliesTo:'styles.text',target:{component:'sample',layers:['Title']},ruleText:'Title typography follows the selected library baseline.'},extra);}
function registry(rules=[rule()]){return {componentKey:'sample',packageName:'SampleHeading',aliases:['SampleHeading'],figmaKeys:[key],rulesFile:{componentKey:'sample',rules}};}
function diff(){return {nodeId:'title',nodeName:'Title',nodePath:'SampleHeading / Title',visible:true,diffKind:'text-style',message:'Changed text style',context:{actualComponentKey:null,referenceComponentKey:null,referenceOrigin:'host',actualNestedOwnerComponentKey:key,actualNestedOwnerPath:'SampleHeading',actualNestedOwnerRelativePath:'Title',nestedOwnerComponentKey:null,nestedOwnerComponentRole:null,nestedOwnerPath:null,nestedOwnerRelativePath:null},details:{property:'styles.text',reference:{value:'Default',resourceType:'style',resourceId:style},actual:{value:'Alternate',resourceType:'style',resourceId:changedStyle}},assessment:{verdict:'unknown',source:'standalone-reference',reasonCode:'no-contextual-expectation',ruleId:null,message:'Unknown',remediation:null,presentation:'show'}};}
function withRegistry(api,entries,run){
 globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__=entries;globalThis.__APOLLO_TEST_REMOTE_AUDIT_PRESENTATIONS__=[];
 try{return run();}finally{delete globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__;delete globalThis.__APOLLO_TEST_REMOTE_AUDIT_PRESENTATIONS__;api.clearNormalizedAuditPolicies();}
}
function report(api,item){
 const state=api.createCheckState();state.relevanceBuckets.current=[item];state.totalItems=1;const views=api.buildAuditResultViews(state);
 const result=api.buildApolloStatsReport({pluginVersion:'test',user:{id:null,name:'Synthetic'},figma:{fileKey:null,fileName:null,editorType:'figma'},scan:{channel:'Desktop',startedAt:new Date(0),finishedAt:new Date(1),selection:[],settings:{shellAuditEnabled:false,experimentalContractV2Enabled:false},scannedComponents:1},views:views.statsViews,resolveStyleResource:()=>null,resolveTokenResource:()=>null});
 return {views,result};
}
test('final assessment materializes a confirmed rule once without changing comparison facts',()=>{
 const api=load();withRegistry(api,[registry()],()=>{
  const input=diff(),before=JSON.stringify(input),output=api.finalizeComponentRuleAssessment(input);
  assert.equal(output.assessment.verdict,'violation');assert.equal(output.assessment.ruleId,rule().ruleId);assert.equal(output.assessment.presentation,'show');assert.equal(output.details,input.details);assert.equal(output.context,input.context);assert.equal(JSON.stringify(input),before);assert.equal(api.finalizeComponentRuleAssessment(output),output);
 });
});
test('final assessment retains owner/layer/authority/severity guards and missing facts',()=>{
 const api=load();const controls=[
  {name:'foreign owner',change:d=>{d.context.actualNestedOwnerComponentKey=other;}},
  {name:'foreign layer',change:d=>{d.nodeName='Caption';d.nodePath='SampleHeading / Caption';d.context.actualNestedOwnerRelativePath='Caption';}},
  {name:'inactive',rules:[rule({authority:{status:'inactive',provenance:'design-system-author',revision:1}})]},
  {name:'untrusted provenance',rules:[rule({authority:{status:'active',provenance:'untrusted',revision:1}})]},
  {name:'invalid revision',rules:[rule({authority:{status:'active',provenance:'design-system-author',revision:0}})]},
  {name:'warning',rules:[rule({severity:'warning'})]},
  {name:'missing facts',change:d=>{delete d.details;}},
  {name:'unmatched property',change:d=>{d.details.property='unknown.property';}},
 ];
 for(const control of controls)withRegistry(api,[registry(control.rules)],()=>{const input=diff();control.change?.(input);assert.equal(api.finalizeComponentRuleAssessment(input),input,control.name);assert.equal(input.assessment.verdict,'unknown');});
});
test('final assessment preserves authoritative decisions and uninterpreted baseline facts',()=>{
 const api=load();withRegistry(api,[registry()],()=>{
  for(const verdict of ['allowed','expected','violation']){const input=diff();input.assessment.verdict=verdict;assert.equal(api.finalizeComponentRuleAssessment(input),input);}
  const raw=diff();delete raw.assessment;assert.equal(api.finalizeComponentRuleAssessment(raw),raw);
  const input=diff(),selected=api.assessCustomizationDiffs([input],{hostDiffs:[],hostReference:[],nestedContextEvidence:{explains:()=>true,selectedReference:()=>input.details.actual}});assert.equal(selected.length,0);
 });
});
test('rule-data unavailability remains a refusal while the exporter never promotes UNKNOWN',()=>{
 const api=load();api.clearNormalizedAuditPolicies();assert.throws(()=>api.finalizeComponentRuleAssessment(diff()),/AUDIT_RULE_DATA_UNAVAILABLE/);
 withRegistry(api,[registry()],()=>{
  const input=diff(),item={id:'owner',name:'SampleHeading',nodeType:'INSTANCE',componentKey:key,relevance:'current',pageName:'Synthetic',fullPath:'SampleHeading',pathSegments:[{id:'owner',label:'SampleHeading',nodeType:'INSTANCE',visible:true}],comparisonIssues:[],diffs:[input],baselineDiffs:[Object.assign({},input,{assessment:undefined})]},before=JSON.stringify(item);
  const {views,result}=report(api,item);assert.equal(result.categories.customizations.items[0].changes[0].assessment.verdict,'unknown');assert.equal(views.visibleViews.changesWip[0].diffs[0].assessment,undefined);assert.equal(JSON.stringify(item),before);
  const final=api.finalizeComponentRuleAssessment(input),confirmed=report(api,Object.assign({},item,{diffs:[final]}));assert.equal(confirmed.result.categories.customizations.items[0].changes[0].assessment.verdict,'violation');assert.equal(confirmed.result.categories.customizations.items[0].changes[0].assessment.ruleId,final.assessment.ruleId);
 });
});

const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function policy(){return {indexEntry:{componentKey:'sample',packageName:'SampleHeading',packagePath:'sample',coverage:'required',figmaKeys:[key],sourceCatalogPath:'components/sample.json',artifacts:{generatedContract:'api.json',rules:'rules.json',composition:'composition.json'}},aliases:['SampleHeading'],loadedArtifacts:{generatedContract:true,rules:true,composition:true,overrides:false,agentContext:false,auditMapping:false},apiEntry:{packageComponentKey:'sample',aliases:['SampleHeading'],figmaKeys:[key],contracts:[{id:'sample-api',name:'SampleHeading',normalizedName:'sampleheading',componentKey:key,status:'current',role:'Main',platform:'Desktop',figma:{variants:{variantKeys:[],properties:{},allowedCombinations:[]}}}]},rulesEntry:registry(),compositionEntry:{contract:{contracts:[]},aliases:['SampleHeading']},agentContext:null,auditMapping:null};}
function data(api,baselineStyle=style){
 const base='https://ackedze.github.io/design-system_ab/JSONS/',entryUrl=base+'referenceSourcesMVP.json',policyUrl=base+'apollo/policies.json';
 const documents=[
  [entryUrl,{schemaVersion:2,baseUrl:base,apollo:{patternRulesPath:'apollo/patterns.json'},catalogs:[{fileName:'tokens.json',path:'tokens/tokens.json',source:{kind:'tokens'}},{fileName:'styles.json',path:'styles/styles.json',source:{kind:'styles'}},{fileName:'sample.json',path:'components/sample.json',source:{kind:'components',indexPath:'components/sample.index.json'}}]}],
  [base+'apollo/patterns.json',{schemaVersion:1,rules:[]}],
  [base+'tokens/tokens.json',{meta:{fileName:'tokens.json'},collections:[{id:'collection',key:'e'.repeat(40),name:'Colors',variables:[{id:'token',key:other,name:'Synthetic',resolvedType:'COLOR',valuesByMode:{default:{r:0,g:0,b:0,a:1}}}]}]}],
  [base+'styles/styles.json',{styles:[]}],
  [base+'components/sample.index.json',{catalogPath:'components/sample.json',components:[{key,name:'SampleHeading'}]}],
  [base+'components/sample.json',{meta:{fileName:'sample.json',library:'Synthetic'},components:[{key,name:'SampleHeading',status:'current',platform:'Desktop',role:'Main',structure:[{id:1,parentId:null,path:'SampleHeading',name:'SampleHeading',type:'COMPONENT',visible:true,componentInstance:{componentKey:key,variantProperties:{}}},{id:2,parentId:1,path:'SampleHeading / Title',name:'Title',type:'TEXT',visible:true,styles:baselineStyle?{text:{styleKey:baselineStyle}}:{}}]}]}],
  [policyUrl,{schemaVersion:'apollo.v3-audit-policies.v1',coverage:{defaultPolicy:'none'},packages:[policy()]}],
 ];
 const assets=new Map(),files=documents.map(([url,value])=>{const text=JSON.stringify(value),id=hash(url);assets.set(id,text);return {id,sha256:hash(text),bytes:Buffer.byteLength(text),urls:[url]};}),body={schemaVersion:protocol.SCHEMA,entryUrl,policyFileId:hash(policyUrl),files},manifest=Object.assign({},body,{dataId:hash(protocol.canonical(body))});
 return api.createAuditDataClient({hashText:hash,loadManifest:async()=>structuredClone(manifest),readAsset:async(dataId,fileId)=>({dataId,fileId,sha256:hash(assets.get(fileId)),text:assets.get(fileId)})});
}
function native(actualStyle){
 const page={id:'page',name:'Synthetic',type:'PAGE',parent:null,children:[]},main={id:'main',key,name:'SampleHeading',type:'COMPONENT',remote:true,parent:page,children:[]};
 const instance={id:'owner',name:'SampleHeading',type:'INSTANCE',visible:true,parent:page,children:[],overrides:[{id:'title',overriddenFields:['textStyleId']}],variantProperties:{},componentProperties:{},getMainComponentAsync:async()=>main};
 const title={id:'title',name:'Title',type:'TEXT',visible:true,parent:instance,characters:'Synthetic',textStyleId:actualStyle};instance.children=[title];page.children=[instance];
 globalThis.figma={mixed:Symbol('mixed'),currentPage:page,currentUser:{id:null,name:'Synthetic'},root:{name:'Synthetic'},editorType:'figma',importComponentByKeyAsync:async()=>main,variables:{getVariableCollectionByIdAsync:async()=>null},getStyleByIdAsync:async id=>({id,key:id.slice(2).split(',')[0],name:id}),getNodeByIdAsync:async id=>({owner:instance,title,page})[id]||null};return instance;
}
test('actual classifier feeds one matching assessment to views, report, bridge and UI for OK, BAD and detached style',async()=>{
 const oldFetch=globalThis.fetch;let networkCalls=0;globalThis.fetch=()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');};
 try{for(const actualStyle of [style,changedStyle,'']){
  const api=load(),instance=native(actualStyle),result=await api.runV3Audit({runId:'consistency',channel:'Desktop',pageType:null,shellAuditEnabled:false,pluginVersion:'test',selection:[instance],data:data(api),assertCurrent(){},onProgress(){}}),payload=api.auditResultForUi(result),summary=buildV3Groups(payload),custom=summary.groups.find(g=>g.id==='components').categories.find(c=>c.id==='changes');
  if(actualStyle===style){assert.equal(result.report.categories.customizations.count,0);assert.equal(custom.count,0);continue;}
  const nativeDiff=result.views.visibleViews.changes.flatMap(item=>item.diffs).find(d=>d.details?.property==='styles.text');assert.ok(nativeDiff,'the actual classifier must emit the typography diff');assert.equal(nativeDiff.assessment.verdict,'violation');assert.equal(nativeDiff.assessment.ruleId,rule().ruleId);
  const reported=result.report.categories.customizations.items.flatMap(item=>item.changes).find(d=>d.property==='styles.text');assert.equal(reported.assessment.verdict,nativeDiff.assessment.verdict);assert.equal(reported.assessment.ruleId,nativeDiff.assessment.ruleId);assert.equal(custom.entries[0].classification,'violation');assert.equal(custom.entries[0].diffs[0].assessment.ruleId,nativeDiff.assessment.ruleId);
  assert.equal(result.views.visibleViews.changesWip[0].diffs[0].assessment,undefined);assert.equal(payload.visibleViews.changes[0].diffs[0].assessment,nativeDiff.assessment);
 }}finally{globalThis.fetch=oldFetch;delete globalThis.figma;}assert.equal(networkCalls,0);
});
