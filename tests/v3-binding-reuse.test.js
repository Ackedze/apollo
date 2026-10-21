const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),esbuild=require('esbuild');
function compiled(file){const filename=path.resolve(__dirname,"../src/v3-binding",file),code=esbuild.buildSync({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,m=new Module(filename,module);m.paths=module.paths;m._compile(code,filename);return m.exports;}
const {bindingCandidates,createBindingIndex}=compiled('candidates.ts'),{createBindingAdapter}=compiled('adapter.ts'),{getNodePaintFingerprint}=compiled('styleMetadata.ts');
const {buildActionData}=require("../src/document-audit/actions"),{collectAuditDisplayMetadata}=require("../src/audit-display-resources"),{findingDisplaySummary}=require("../src/finding-display"),{collectReferences}=require("../src/v3-binding/resource-labels"),{describeNativeStyles}=require("../src/document-audit/styles"),{createCatalogPort,createCatalogTransport}=require("../src/v3-binding/catalog-port");
const hash=require("../dist/runtime.cjs").contractHash,key='a'.repeat(40),styleKey='b'.repeat(40);
const paint=()=>({type:'SOLID',color:{r:.2,g:.3,b:.4},opacity:.5,visible:true}),node=()=>({id:'invented-node',type:'RECTANGLE',fills:[paint()],strokes:[paint()],fillStyleId:'',strokeStyleId:''});
const catalogs={tokens:[{meta:{library:'Invented'},collections:[{name:'Invented semantic',variables:[{key,name:'color/surface',resolvedType:'COLOR',scopes:['ALL_SCOPES'],actualValuesByMode:{mode:[{r:.2,g:.3,b:.4,a:.5}]}}]}]}],styles:[]};
const lifecycle=()=>{let writes=0;return{guard(){},async beforeWrite(){},onWritten(){writes++;},writes:()=>writes};};
function api(){return{variables:{importVariableByKeyAsync:async k=>({id:'VariableID:10:1',key:k,resolvedType:'COLOR'}),setBoundVariableForPaint:(p,field,v)=>Object.assign({},p,{boundVariables:{color:{type:'VARIABLE_ALIAS',id:v.id}}}),getVariableByIdAsync:async()=>({id:'VariableID:10:1',key,resolvedType:'COLOR'})}};}
test('v3 candidates preserve exact color, alpha, scopes and chosen key for fill and stroke',()=>{
 for(const property of ['fills','strokes']){const n=node(),actions=bindingCandidates(n,property,catalogs);assert.equal(actions.length,1);assert.equal(actions[0].targetVariableKey,key);assert.equal(actions[0].targetName,'color/surface');n[property][0].opacity=.6;assert.equal(bindingCandidates(n,property,catalogs).length,0);}
 const restricted=structuredClone(catalogs);restricted.tokens[0].collections[0].variables[0].scopes=['STROKE_COLOR'];assert.equal(bindingCandidates(node(),'fills',restricted).length,0);
});
test('candidate registry keeps multiple explicit choices opaque and never accepts a UI key',()=>{
 const n=node(),f={findingId:'finding',status:'custom-style',evidence:{property:'fills'},occurrences:[n.id],targets:[{id:'target',nodeId:n.id}]},observation={checks:[{id:'customStyles',findings:[f]}],nodes:new Map([[n.id,n]])};
 const one=bindingCandidates(n,'fills',catalogs)[0],two=Object.assign({},one,{targetVariableKey:'c'.repeat(40),targetName:'another'}),data=buildActionData(observation,'run',{},hash,new Map([['finding',[one,two]]]));
 assert.equal(data.registry.size,2);assert.equal(data.sidecar.items[0].actions.length,2);assert.equal(data.sidecar.items[0].actions[0].binding.key,key);for(const a of data.sidecar.items[0].actions)assert.equal(data.registry.get(a.actionId).targetId,'target');
});
test('selected variable applies once, resets opacity and confirms the native published key',async()=>{
 global.figma=api();const n=node(),action=bindingCandidates(n,'fills',catalogs)[0],l=lifecycle(),adapter=createBindingAdapter(async()=>catalogs),result=await adapter.apply(action,n,l);
 assert.equal(result.verified,true);assert.equal(l.writes(),1);assert.equal(n.fills[0].opacity,1);assert.equal(n.fills[0].boundVariables.color.id,'VariableID:10:1');
});
test('wrong imported key, stale import-time paint and failed readback cannot claim success',async()=>{
 for(const scenario of ['wrong-key','changed-paint','wrong-readback','import-denied']){
  global.figma=api();const n=node(),action=bindingCandidates(n,'fills',catalogs)[0],l=lifecycle();
  if(scenario==='wrong-key')figma.variables.importVariableByKeyAsync=async()=>({id:'wrong',key:styleKey,resolvedType:'COLOR'});
  if(scenario==='changed-paint')figma.variables.importVariableByKeyAsync=async()=>{n.fills[0].opacity=.8;return{id:'right',key,resolvedType:'COLOR'};};
  if(scenario==='wrong-readback')figma.variables.getVariableByIdAsync=async()=>({key:styleKey});
  if(scenario==='import-denied')figma.variables.importVariableByKeyAsync=async()=>{throw Error('denied');};
  await assert.rejects(createBindingAdapter(async()=>catalogs).apply(action,n,l));assert.equal(l.writes(),scenario==='wrong-readback'?1:0);
 }
});
test('uniform mixed TEXT fills bind every segment and the refreshed native check removes the finding',async()=>{
 global.figma=api();const n=Object.assign(node(),{type:'TEXT',fills:Symbol('mixed'),characters:'AB',textStyleId:'',fontName:{family:'Invented',style:'Regular'},fontSize:14});const segments=[{start:0,end:1,fills:[paint()],fillStyleId:''},{start:1,end:2,fills:[paint()],fillStyleId:''}];n.getStyledTextSegments=()=>segments;n.setRangeFills=(s,e,p)=>segments.find(r=>r.start===s&&r.end===e).fills=p;
 const read=fn=>fn(),options=()=>({read,styleCache:new Map(),variableCache:new Map(),policy:{ignoreTypography:true}});
 const before=await describeNativeStyles(figma,n,options());assert.equal(before.findings[0].status,'custom-style');const action=bindingCandidates(n,'fills',catalogs)[0];assert.ok(action);const l=lifecycle();await createBindingAdapter(async()=>catalogs).apply(action,n,l);assert.equal(l.writes(),2);assert.equal((await describeNativeStyles(figma,n,options())).findings.some(f=>f.property==='fills'),false);
});
test('PAINT, TEXT font errors/range fallback and EFFECT keep v3 native application semantics',async()=>{
 for(const field of ['fill','stroke','effect']){
  const n=node(),property=field==='fill'?'fillStyleId':field==='stroke'?'strokeStyleId':'effectStyleId';n[property]='';const style={id:'S:10:1',key:styleKey,type:field==='effect'?'EFFECT':'PAINT'};n[{fill:'setFillStyleIdAsync',stroke:'setStrokeStyleIdAsync',effect:'setEffectStyleIdAsync'}[field]]=async id=>n[property]=id;
  global.figma={importStyleByKeyAsync:async()=>style,getStyleByIdAsync:async()=>style};const result=await createBindingAdapter(async()=>catalogs).apply({kind:'bind-style',nodeId:n.id,styleField:field,targetStyleKey:styleKey,expectedStyleId:null,reason:'deprecated-style'},n,lifecycle());assert.equal(result.verified,true);
 }
 for(const fontFailure of [false,true]){
  const n=Object.assign(node(),{type:'TEXT',textStyleId:'',characters:'AB',fontName:{family:'Invented',style:'Regular'},fontSize:14,lineHeight:{unit:'PIXELS',value:20}}),style={id:'S:10:1',key:styleKey,type:'TEXT',fontName:n.fontName,fontSize:14,lineHeight:n.lineHeight,name:'Invented body',textCase:'ORIGINAL',textDecoration:'NONE'};
  n.getStyledTextSegments=()=>[{start:0,end:2,textCase:'ORIGINAL',textDecoration:'NONE'}];n.getRangeAllFontNames=()=>[n.fontName];n.setTextStyleIdAsync=async()=>{};n.setRangeTextStyleIdAsync=async(s,e,id)=>n.textStyleId=id;n.getRangeTextStyleId=()=>n.textStyleId;
  global.figma={importStyleByKeyAsync:async()=>style,getStyleByIdAsync:async()=>style,loadFontAsync:async()=>{if(fontFailure)throw Error('font missing');}};const l=lifecycle(),work=createBindingAdapter(async()=>catalogs).apply({kind:'bind-style',nodeId:n.id,styleField:'text',targetStyleKey:styleKey,expectedStyleId:null,reason:'deprecated-style'},n,l);
  if(fontFailure){await assert.rejects(work);assert.equal(l.writes(),0);}else{assert.equal((await work).verified,true);assert.equal(n.textStyleId,style.id);assert.equal(l.writes(),2);}
 }
});
test('actual and expected typed binding arrays resolve local IDs and stable keys without changing raw facts',async()=>{
 const report={evaluations:[{trace:{factPaths:['textBindingIdentityV1.fill.tokenIds'],actual:['VariableID:10:1'],expected:[key]}},{trace:{factPaths:['textBindingIdentityV1.style.styleKeys'],actual:['local:S:10:1'],expected:[styleKey]}}]},before=JSON.stringify(report);
 const metadata=await collectAuditDisplayMetadata({variables:{getVariableByIdAsync:async id=>id==='VariableID:10:1'?{id,key,name:'color/surface',variableCollectionId:'collection'}:null,getVariableCollectionByIdAsync:async id=>({id,name:'Invented semantic'})},getStyleByIdAsync:async id=>id==='S:10:1'?{id,key:styleKey,name:'Text/body'}:null},report);
 assert.equal(collectReferences(report).references.length,4);assert.match(findingDisplaySummary([key],{factPath:'textBindingIdentityV1.fill.tokenIds'},metadata),/color\/surface/);assert.match(findingDisplaySummary([styleKey],{factPath:'textBindingIdentityV1.style.styleKeys'},metadata),/Text\/body/);assert.equal(JSON.stringify(report),before);
});
test('bounded catalog transport keeps fixed operations, rejects oversized input and ignores late replies',async()=>{
 let calls=0,reply;const transport=createCatalogTransport(m=>reply=m,async()=>{calls++;return{ok:true,text:async()=>'{"ok":true}'};});
 await transport.accept({type:'v3-catalog-request',requestId:'v3-catalog:1',operation:'query',body:{value:'x'.repeat(65537)},budgetMs:50});assert.equal(calls,0);assert.equal(reply.error,'CATALOG_UNAVAILABLE');
 const sent=[],port=createCatalogPort(m=>sent.push(m));const result=port.read('names',null,5);await assert.rejects(result,/CATALOG_TIMEOUT/);assert.equal(port.accept({type:'v3-catalog-response',requestId:sent[0].requestId,data:{},error:null}),true);assert.equal(sent[1].type,'v3-catalog-cancel');
});

test('nested allowed paints and token arrays keep readable expected names and raw parameters',()=>{const metadata={schemaVersion:'apollo.audit-display-metadata.v1',resources:[{kind:'token',id:key,key,name:'color/surface',collectionName:'Invented'}]};assert.match(findingDisplaySummary([[key]],{factPath:'textBindingIdentityV1.fill.tokenIds'},metadata),/color\/surface/);assert.match(findingDisplaySummary([[{type:'SOLID',color:{r:51,g:77,b:102},opacity:.5,tokenId:key}]],{factPath:'appearance.fill'},metadata),/color\/surface/);});

test('v3 paint fallback and typography catalog fingerprints reach the v4 candidate adapter',()=>{global.figma={mixed:Symbol('mixed')};const n=node();n.fills=[{type:'SOLID',color:{r:1,g:0,b:0},opacity:1}];const styles=[{meta:{library:'Invented styles'},styles:[{key:styleKey,name:'Red',group:'Colors',type:'paint',value:{kind:'paint',data:{paints:[{type:'solid',color:'rgba(255, 0, 0, 1)',opacity:1}]}}},{key:'c'.repeat(40),name:'Body',group:'Text',type:'text',value:{kind:'text',data:{fontName:'Invented Regular',fontSize:14,lineHeight:20}}}]}];const fill=bindingCandidates(n,'fills',{tokens:[],styles});assert.equal(fill[0].targetStyleKey,styleKey);assert.equal(fill[0].reason,'exact-style-match');const text=Object.assign(node(),{type:'TEXT',fontName:{family:'Invented',style:'Regular'},fontSize:14,lineHeight:{unit:'PIXELS',value:20},openTypeFeatures:{},textStyleId:''});assert.equal(bindingCandidates(text,'typography',{tokens:[],styles})[0].targetStyleKey,'c'.repeat(40));});


test('one reusable catalog index processes every finding beyond the old one-second cutoff',async()=>{
 let loads=0,reads=0;const c=Object.assign({},catalogs.tokens[0]);Object.defineProperty(c,'collections',{get(){reads++;return catalogs.tokens[0].collections;}});const full={tokens:[c],styles:[]};
 const adapter=createBindingAdapter(async()=>{loads++;return full;}),nodes=new Map(),findings=[];
 for(let i=0;i<1200;i++){const n=Object.assign(node(),{id:'invented-'+i});nodes.set(n.id,n);findings.push({findingId:n.id,status:'custom-style',evidence:{property:'fills'},targets:[{nodeId:n.id}]});}
 const observation={checks:[{id:'customStyles',findings}],nodes};let clock=0;const now=Date.now;Date.now=()=>clock+=500;
 try{const first=await adapter.resolve(observation,{},()=>{});assert.equal(first.bindings.size,1200);assert.equal(first.bindings.get('invented-1199')[0].targetVariableKey,key);const before=reads;await adapter.resolve(observation,{},()=>{});assert.equal(reads,before);assert.equal(loads,2);}finally{Date.now=now;}
});
test('all concrete alias modes, v3 rounding and scope names survive token-first fallback',()=>{
 const full=structuredClone(catalogs),v=full.tokens[0].collections[0].variables[0];v.actualValuesByMode={light:[{r:.2,g:.3,b:.4,a:.5}],dark:[{r:.8,g:.7,b:.6,a:.5}]};v.valuesByMode={dark:{type:'VARIABLE_ALIAS',id:'invented'}};v.scopes=['FRAME_FILL'];full.tokens[0].collections[0].modes=[{modeId:'light',name:'Светлая'},{modeId:'dark',name:'Тёмная'}];
 const n=node();n.fills[0].color={r:.80000002,g:.7,b:.6};assert.equal(bindingCandidates(n,'fills',createBindingIndex(full))[0].targetModes[0],'Тёмная');n.fills[0].opacity=.5002;assert.equal(bindingCandidates(n,'fills',full).length,0);v.scopes=['FILL_COLOR'];n.fills[0].opacity=.5;assert.equal(bindingCandidates(n,'fills',full).length,0);
});
test('unique existing V4 expected token precedes values and cannot guess between alternatives',()=>{
 const {findReferenceCandidate}=require("../src/v3-binding/reference-candidate");const e={applicability:'applicable',subjectNodeId:'snapshot',trace:{factPaths:['appearance.fill'],actual:[{type:'SOLID'}],expected:[[{type:'SOLID',tokenId:'c'.repeat(40)}]]}};
 const data={audit:{components:[{scopeId:'root',result:{engine:{evaluations:[e]}}}]},captures:[{subject:{id:'root'},captured:{anatomy:[{id:'snapshot',figmaNodeId:'invented-node'}]}}]};const reference=findReferenceCandidate(data,'invented-node','fills'),matches=bindingCandidates(node(),'fills',catalogs,reference);assert.deepEqual(matches.map(a=>a.targetVariableKey),['c'.repeat(40),key]);
 e.trace.expected.push([{type:'SOLID',tokenId:key}]);assert.equal(findReferenceCandidate(data,'invented-node','fills'),null);e.trace.expected.pop();e.trace.actual[0].tokenId=key;assert.equal(findReferenceCandidate(data,'invented-node','fills'),null);
});
test('catalog timeout stays visible and keeps an independently captured reference candidate',async()=>{
 const adapter=createBindingAdapter(async()=>{throw Error('CATALOG_TIMEOUT');},()=>({key,name:'Invented expected',library:null}));const n=node(),f={findingId:'f',status:'custom-style',evidence:{property:'fills'},targets:[{nodeId:n.id}]};const result=await adapter.resolve({checks:[{id:'customStyles',findings:[f]}],nodes:new Map([[n.id,n]])},{},()=>{});
 assert.equal(result.status.state,'unavailable');assert.match(result.status.message,/вовремя/);assert.equal(result.bindings.get('f')[0].targetVariableKey,key);
});

test('catalog freshness is verified before import and again before native write',async()=>{
 for(const field of ['variable','fill','text']){
  global.figma=api();const n=node(),l=lifecycle(),failure=Error('CATALOG_PIN_CHANGED');let checks=0,setters=0;
  let action=Object.assign({},bindingCandidates(n,'fills',catalogs)[0],{catalogSourceIdentity:'snapshot'});
  if(field!=='variable'){
   const style={id:'S:invented',key:styleKey,type:field==='text'?'TEXT':'PAINT',fontName:{family:'Invented',style:'Regular'},textCase:'ORIGINAL',textDecoration:'NONE'};
   Object.assign(n,{type:field==='text'?'TEXT':'RECTANGLE',textStyleId:'',characters:'AB',fontName:style.fontName});n.getStyledTextSegments=()=>[{start:0,end:2,textCase:'ORIGINAL',textDecoration:'NONE'}];n.getRangeAllFontNames=()=>[style.fontName];
   n.setFillStyleIdAsync=n.setTextStyleIdAsync=n.setRangeTextStyleIdAsync=async()=>{setters++;};Object.assign(figma,{importStyleByKeyAsync:async()=>style,loadFontAsync:async()=>{}});
   action={kind:'bind-style',nodeId:n.id,styleField:field,targetStyleKey:styleKey,expectedStyleId:null,reason:'deprecated-style',catalogSourceIdentity:'snapshot'};
  }
  const adapter=createBindingAdapter(async()=>catalogs,()=>null,async(id,guard)=>{assert.equal(id,'snapshot');guard();if(++checks===2)throw failure;});
  await assert.rejects(adapter.apply(action,n,l),error=>error===failure);assert.equal(checks,2);assert.equal(l.writes(),0);assert.equal(setters,0);assert.equal(n.fills[0].boundVariables,undefined);
 }
});
test('a native context change after font loading cannot enter the whole-node or range setter',async()=>{
 const n=Object.assign(node(),{type:'TEXT',textStyleId:'',characters:'AB',fontName:{family:'Invented',style:'Regular'}}),style={id:'S:invented',key:styleKey,type:'TEXT',fontName:n.fontName,textCase:'ORIGINAL',textDecoration:'NONE'},failure=Error('NATIVE_FACTS_CHANGED');let loaded=false,setters=0;
 n.getStyledTextSegments=()=>[{start:0,end:2,textCase:'ORIGINAL',textDecoration:'NONE'}];n.getRangeAllFontNames=()=>[style.fontName];n.setTextStyleIdAsync=n.setRangeTextStyleIdAsync=async()=>{setters++;};global.figma={importStyleByKeyAsync:async()=>style,loadFontAsync:async()=>{loaded=true;}};
 const l=lifecycle();l.guard=()=>{if(loaded)throw failure;};await assert.rejects(createBindingAdapter(async()=>catalogs).apply({kind:'bind-style',nodeId:n.id,styleField:'text',targetStyleKey:styleKey,expectedStyleId:null,reason:'deprecated-style'},n,l),error=>error===failure);assert.equal(setters,0);assert.equal(l.writes(),0);
});
test('common catalog transport enforces the larger body bound while streaming and keeps its own deadline',async()=>{
 let reply,calls=0,cancelled=false;const transport=createCatalogTransport(m=>reply=m,async()=>{calls++;return{ok:true,body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(8*1024*1024+1)}),cancel:async()=>{cancelled=true;}})}};});
 await transport.accept({type:'v3-catalog-request',requestId:'v3-catalog:1',operation:'catalogs',body:{sourceIds:['invented']},budgetMs:2000});assert.equal(calls,1);assert.equal(cancelled,true);assert.equal(reply.error,'CATALOG_UNAVAILABLE');
 const sent=[],port=createCatalogPort(m=>sent.push(m));const pending=port.read('catalogs',{},2000);assert.equal(sent[0].budgetMs,2000);port.accept({type:'v3-catalog-response',requestId:sent[0].requestId,data:{},error:null});await pending;
});
