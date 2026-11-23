const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const esbuild=require('esbuild');
function load(file){const b=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit',file)],bundle:true,write:false,metafile:true,platform:'node',format:'cjs',logLevel:'silent'});assert(!Object.keys(b.metafile.inputs).some(p=>/component-contract-core|experimentalContractV2|predicate\/index/.test(p)));const m={exports:{}};new Function('require','module','exports',b.outputFiles[0].text)(require,m,m.exports);return m.exports;}
test('native raw UTF-8 digest agrees with Node including surrogate and block boundaries',async()=>{
 const {sha256Hex}=load('utils/sha256.ts');
 for(const text of ['', 'abc', 'Привет 😀', '\ud800', '\udc00', 'x'.repeat(55),'x'.repeat(56),'x'.repeat(63),'x'.repeat(64),'x'.repeat(65), '😀'.repeat(5000),'x'.repeat(4095)+'😀'+ 'я'.repeat(100)]){
  assert.equal(await sha256Hex(text),crypto.createHash('sha256').update(text).digest('hex'));
 }
});
test('queued Stop interrupts hashing large ASCII and surrogate-pair assets before a digest is returned',async()=>{
 const {sha256Hex}=load('utils/sha256.ts');
 for(const text of ['x'.repeat(36063480),'😀'.repeat(2000000)]){
  let stopped=false;const timer=setTimeout(()=>{stopped=true;},0);
  try{await assert.rejects(sha256Hex(text,()=>{if(stopped)throw Error('AUDIT_CANCELLED');}),/AUDIT_CANCELLED/);assert(stopped);}finally{clearTimeout(timer);}
 }
 const full='Привет 😀'.repeat(10000);assert.equal(await sha256Hex(full),crypto.createHash('sha256').update(full).digest('hex'));
});
test('layout relation capture preserves all no-cancel nodes and yields to queued Stop',async()=>{
 const {collectApolloLayoutRelations}=load('stats/layoutRelations.ts');let visits=0,stop=false;
 const roots=Array.from({length:30000},(_,i)=>({id:'n'+i,name:'Frame',type:'FRAME',get visible(){visits++;return true;},children:[]}));
 const timer=setTimeout(()=>{stop=true;},0);
 await assert.rejects(collectApolloLayoutRelations(roots,n=>n.name,()=>{if(stop)throw Error('AUDIT_CANCELLED');}),/AUDIT_CANCELLED/);clearTimeout(timer);
 visits=0;assert.deepEqual(await collectApolloLayoutRelations(roots,n=>n.name),[]);assert.equal(visits,roots.length);
});
function packageFor(text,extra={}){
 const p=require('../src/v3-audit/protocol'),hash=x=>crypto.createHash('sha256').update(x).digest('hex'),url='https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json',id=hash(url);
 const row={id,sha256:hash(text),bytes:Buffer.byteLength(text),urls:[url]},body=Object.assign({schemaVersion:p.SCHEMA,entryUrl:url,policyFileId:id,files:[row]},extra);
 return{manifest:Object.assign({},body,{dataId:hash(p.canonical(body))}),row,hash};
}
test('async native client verifies the full 36MB digest/length and refuses queued Stop during asset processing',async()=>{
 const text='x'.repeat(36063480),f=packageFor(text),{createAuditDataClient}=load('data-client.ts'),{sha256Hex}=load('utils/sha256.ts'),{createCooperativeYield}=load('utils/promisePool.ts');
 for(const cancel of [true,false]){
  let stopped=false;const guard=()=>{if(stopped)throw Error('AUDIT_CANCELLED');},checkpoint=createCooperativeYield(guard);
  const client=createAuditDataClient({hashText:text=>sha256Hex(text,guard),yieldControl:checkpoint,loadManifest:async()=>f.manifest,readAsset:async(dataId,fileId)=>({dataId,fileId,sha256:f.row.sha256,text})});
  await client.open(guard);let timer;
  try{if(cancel)timer=setTimeout(()=>{stopped=true;},0);
   if(cancel)await assert.rejects(client.readText(f.manifest.entryUrl),/AUDIT_CANCELLED/);
   else assert.equal(await client.readText(f.manifest.entryUrl),text);
  }finally{clearTimeout(timer);}
 }
});
test('a cancelled manifest hash cannot install identity or poison the next open',async()=>{
 const f=packageFor('{}',{note:'x'.repeat(2000000)}),{createAuditDataClient}=load('data-client.ts'),{sha256Hex}=load('utils/sha256.ts');let stopped=false;
 const guard=()=>{if(stopped)throw Error('AUDIT_CANCELLED');};
 const client=createAuditDataClient({hashText:text=>sha256Hex(text,guard),loadManifest:async()=>f.manifest,readAsset:async()=>{throw Error('UNUSED');}});
 const timer=setTimeout(()=>{stopped=true;},0);await assert.rejects(client.open(guard),/AUDIT_CANCELLED/);clearTimeout(timer);
 assert.throws(()=>client.identity(),/NOT_OPEN/);stopped=false;await client.open(guard);assert.equal(client.identity(),f.manifest.dataId);
});
test('async verification pins the received message before yielding, preserving raw Unicode/CRLF bytes',async()=>{
 const text='😀\ud800\r\n'.repeat(5000),f=packageFor(text),original=structuredClone(f.manifest),asset={dataId:f.manifest.dataId,fileId:f.row.id,sha256:f.row.sha256,text};
 const {createAuditDataClient}=load('data-client.ts');let calls=0;
 const client=createAuditDataClient({hashText:async value=>{const hash=f.hash(value);await new Promise(resolve=>setTimeout(resolve,0));if(++calls===1)f.manifest.files=[];else asset.text='changed';return hash;},loadManifest:async()=>f.manifest,readAsset:async()=>asset});
 const manifest=await client.open();assert.deepEqual(manifest,original);assert.equal(await client.readText(original.entryUrl),text);
 for(const kind of ['length','hash']){
  const valid=packageFor(text),bad=createAuditDataClient({hashText:async text=>valid.hash(text),loadManifest:async()=>valid.manifest,readAsset:async(dataId,fileId)=>({dataId,fileId,sha256:valid.row.sha256,text:kind==='length'?text+'x':'y'.repeat(Buffer.byteLength(text))})});
  await bad.open();await assert.rejects(bad.readText(valid.manifest.entryUrl),/ASSET_MISMATCH/);
 }
});
test('native package RPC cancels cold token loading, then checks and focuses actual nodes on the next run',async t=>{
 const helpers=require('../../../services/apollo-proxy/test/audit-data.test'),f=await helpers.fixture(t),built=await f.build();
 const reader=require('../../../services/apollo-proxy/src/audit-data/reader').createAuditDataReader({knowledgeRoot:built.packageRoot}),manifest=await reader.manifest(),roles=new Map(manifest.files.map(row=>[row.id,row.roles]));
 const node=helpers.native();figma.currentPage.selection=[node];figma.currentPage.explicitVariableModes={};let focused=null;figma.viewport={scrollAndZoomIntoView:nodes=>{focused=nodes;}};
 t.after(()=>{port.close();delete globalThis.figma;});
 const p=require('../src/v3-audit/transport'),messages=[],waiters=new Map();let blocked=false,port;
 function wait(id){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('NATIVE_TEST_NO_TERMINAL:'+id)),8000);waiters.set(id,value=>{clearTimeout(timer);resolve(value);});});}
 port=load('native-port.ts').createV3NativePort({readRevision:()=>1,isUnavailable:()=>false,canMutate:()=>true,onBusy(){},onMutation(){},pluginVersion:'test',post:message=>{
  messages.push(message);
  if(message.type==='v3-audit-data-request'){
   if(!blocked&&message.operation==='asset'&&roles.get(message.fileId)?.includes('tokens-catalog')){blocked=true;setTimeout(()=>port.accept({type:'v3-audit-cancel',schemaVersion:p.BRIDGE,requestId:'cold-cancel'}),0);return;}
   void(async()=>{try{const result=message.operation==='manifest'?await reader.manifest():await reader.asset(message.dataId,message.fileId);port.accept({type:'v3-audit-data-response',schemaVersion:p.VERSION,requestId:message.requestId,ownerRequestId:message.ownerRequestId,result});}catch(error){port.accept({type:'v3-audit-data-response',schemaVersion:p.VERSION,requestId:message.requestId,ownerRequestId:message.ownerRequestId,error:error.code||'AUDIT_DATA_UNAVAILABLE'});}})();
  }
  if(['v3-audit-result','v3-audit-error','v3-audit-cancelled','v3-audit-operation-result','v3-audit-operation-error'].includes(message.type)){waiters.get(message.requestId)?.(message);waiters.delete(message.requestId);}
 }});
 const start=id=>port.accept({type:'v3-audit-run',schemaVersion:p.BRIDGE,requestId:id,kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});
 const cancelled=wait('cold-cancel');start('cold-cancel');assert.equal((await cancelled).type,'v3-audit-cancelled');assert.equal(port.busy(),false);await new Promise(setImmediate);
 const next=wait('warm-after-stop');start('warm-after-stop');const result=await next;assert.equal(result.type,'v3-audit-result',result.code);assert.equal(port.busy(),false);
 const item=result.result.visibleViews.relevance.current[0];assert(item.focusActionId);
 const focus=wait('focus');port.accept({type:'v3-audit-focus',schemaVersion:p.BRIDGE,requestId:'focus',runId:'warm-after-stop',focusActionId:item.focusActionId});assert.equal((await focus).type,'v3-audit-operation-result');assert.deepEqual(focused,[node]);
 assert(!messages.some(message=>message.type==='resolve-contracts'||message.type==='resolve-catalog-reference'));
});
test('page base reuses explicit Corp and Font default/explicit/alias semantics',async()=>{
 const {checkPageBase}=load('page-font.ts');
 const theme={id:'theme',key:'t'.repeat(40),remote:true,name:'Theme',defaultModeId:'retail',modes:[{modeId:'corp',name:'Corp'},{modeId:'retail',name:'Retail'}]},font={id:'font',key:'f'.repeat(40),remote:true,name:'Font',defaultModeId:'alfa',modes:[{modeId:'alfa',name:'AlfaSans'},{modeId:'sf',name:'System (SF)'}]};
 const page={id:'page',explicitVariableModes:{theme:'corp'},children:[]},node={id:'node',visible:true,resolvedVariableModes:{theme:'corp',font:'alfa'}};page.children=[node];
 const collections={theme,font},api={currentPage:page,variables:{getVariableCollectionByIdAsync:async id=>collections[id]||null}};
 let checks=await checkPageBase(api,'Desktop',[node],()=>{},[node]);assert.equal(checks.find(check=>check.id==='theme').classification,'compliant');assert.equal(checks.find(check=>check.id==='font').classification,'compliant');assert.equal(checks.find(check=>check.id==='font').evidence.modeSource,'default');
 page.explicitVariableModes.font='sf';checks=await checkPageBase(api,'Desktop',[node],()=>{},[node]);assert.equal(checks.find(check=>check.id==='font').classification,'violation');
 collections['font-alias']=Object.assign({},font,{id:'font-alias'});page.explicitVariableModes['font-alias']='alfa';checks=await checkPageBase(api,'Desktop',[node],()=>{},[node]);assert.equal(checks.find(check=>check.id==='font').classification,'unknown');assert.equal(checks.find(check=>check.id==='font').status,'incomplete');
 checks=await checkPageBase(api,'iOS',[node],()=>{},[node]);assert(checks.every(check=>check.classification==='not-applicable'));
 delete page.explicitVariableModes.font;delete page.explicitVariableModes['font-alias'];delete collections.font;checks=await checkPageBase(api,'Desktop',[node],()=>{},[node]);assert.equal(checks.find(check=>check.id==='font').classification,'unknown');
});
test('projection keeps known violations red and preserves independent incomplete coverage and gaps',async()=>{
 const {checkPageBase}=load('page-font.ts'),{buildV3Groups,nativeMetrics}=require('../src/v3-audit/ui-model');
 const theme={id:'theme',key:'t',remote:true,name:'Theme',defaultModeId:'retail',modes:[{modeId:'corp',name:'Corp'},{modeId:'retail',name:'Retail'}]},font={id:'font',key:'f',remote:true,name:'Font',defaultModeId:'alfa',modes:[{modeId:'alfa',name:'AlfaSans'},{modeId:'sf',name:'System (SF)'}]},page={id:'page',explicitVariableModes:{theme:'retail',font:'sf'},children:[]},node={id:'node',resolvedVariableModes:{theme:'retail',font:'sf',missing:'unavailable'}};page.children=[node];
 const baseChecks=await checkPageBase({currentPage:page,variables:{getVariableCollectionByIdAsync:async id=>({theme,font})[id]||null}},'Desktop',[node],()=>{},[node]);assert(baseChecks.every(check=>check.status==='incomplete'&&check.classification==='violation'));
 const result={visibleViews:{},baseChecks},summary=buildV3Groups(result),metric=nativeMetrics(result).checks.find(check=>check.id==='v3:themization');
 assert.equal(summary.total,2);assert.equal(summary.incomplete,true);assert.equal(summary.theme.incomplete,true);assert.equal(metric.status,'incomplete');assert.equal(metric.findings.filter(f=>f.status==='violation').length,2);assert(metric.gaps.includes('variable-collection-unavailable'));
 const mixed={visibleViews:{changes:[{id:'host',diffs:[{nodeId:'child',assessment:{verdict:'violation',message:'Known violation'}},{nodeId:'child',assessment:{verdict:'unknown',message:'Unavailable fact'}}]}],changesWip:[{id:'host',diffs:[{nodeId:'child',message:'Raw observation'}]}]}};
 const projected=buildV3Groups(mixed),category=projected.groups.find(group=>group.id==='components').categories.find(category=>category.id==='changes');
 assert.equal(projected.total,1);assert.equal(category.entries[0].classification,'violation');assert.equal(category.incomplete,true);assert.equal(projected.incomplete,true);assert.equal(nativeMetrics(mixed).checks.find(check=>check.id==='v3:changes').status,'incomplete');
 const baselineOnly=buildV3Groups({visibleViews:{changesWip:mixed.visibleViews.changesWip}});assert.equal(baselineOnly.total,0);assert.equal(baselineOnly.incomplete,false,'raw observations are not unknown policy verdicts');
});
