const test=require('node:test'),assert=require('node:assert/strict');
const {createV3UiClient}=require('../src/v3-audit/ui-client'),p=require('../src/v3-audit/transport');
const {buildV3Groups}=require('../src/v3-audit/ui-model');
const settings={pickerLabel:'Desktop',pageTypeId:null,shellAuditEnabled:false};
const tick=()=>new Promise(setImmediate),ok=value=>({ok:true,json:async()=>value});
function captured(id){return{runId:id,dataId:'a'.repeat(64),textTargets:[{nodeId:'text',focusActionId:'v3-focus-0'}],textReport:{reportId:id+':texts',reportKind:'apollo-text-audit-report',summary:{scannedTextNodes:1},facts:{texts:[{node:{id:'text',visible:true},text:'Тест',ancestors:[]}]}}};}
function setup(options={}){const sent=[],client=createV3UiClient(Object.assign({send:message=>sent.push(message),pollDelay:0},options));return{client,sent,start:(id,kind='texts')=>client.start({requestId:id,kind,uiPreferences:settings}),reply:(id,result,kind='texts')=>client.accept({type:'v3-audit-result',schemaVersion:p.BRIDGE,requestId:id,kind,result})};}
for(const scopeName of ['', ' \t '])test('native text capture allows unnamed scope '+JSON.stringify(scopeName)+' and keeps verification and navigation',async t=>{
 const path=require('node:path'),crypto=require('node:crypto'),esbuild=require('esbuild');
 const built=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit/native-port.ts')],bundle:true,write:false,platform:'node',format:'cjs',supported:{'object-rest-spread':false}});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 const page={id:'page',type:'PAGE',name:'Example'},root={id:'card',type:'FRAME',name:scopeName,width:320,visible:true,parent:page};
 const text={id:'text',type:'TEXT',name:'Title',visible:true,opacity:1,characters:'Check this',parent:root};
 root.children=[text];page.children=[root];page.selection=[root];
 let focused;
 globalThis.figma={currentPage:page,root:{name:'Fixture'},fileKey:'fixture',editorType:'figma',mixed:Symbol('mixed'),
  getNodeByIdAsync:async id=>[page,root,text].find(node=>node.id===id),viewport:{scrollAndZoomIntoView(nodes){focused=nodes[0];}}};
 t.after(()=>delete globalThis.figma);
 const protocol=require('../src/v3-audit/protocol'),fileId='a'.repeat(64),url='https://ackedze.github.io/design-system_ab/policy.json';
 const body={schemaVersion:protocol.SCHEMA,entryUrl:url,policyFileId:fileId,files:[{id:fileId,sha256:'b'.repeat(64),bytes:10,urls:[url]}]};
 const manifest=Object.assign({dataId:crypto.createHash('sha256').update(protocol.canonical(body)).digest('hex')},body);
 const messages=[];let port;
 port=mod.exports.createV3NativePort({pluginVersion:'0.4.17',readRevision:()=>0,isUnavailable:()=>false,canMutate:()=>false,
  onBusy(){},onMutation(){},post(message){
   messages.push(message);
   if(message.type==='v3-audit-data-request')queueMicrotask(()=>port.accept(Object.assign({type:'v3-audit-data-response',schemaVersion:p.VERSION,
    requestId:message.requestId,ownerRequestId:message.ownerRequestId},message.operation==='manifest'?{result:manifest}:{error:'AUDIT_DATA_UNAVAILABLE'})));
  }});
 t.after(()=>port.close());
 async function until(predicate){
  const deadline=Date.now()+4000;
  while(!messages.some(predicate)){assert(Date.now()<deadline,'native operation did not finish');await new Promise(setImmediate);}
  return messages.find(predicate);
 }
 const send=(type,requestId,extra)=>port.accept(Object.assign({type,schemaVersion:p.BRIDGE,requestId},extra));
 send('v3-audit-run','capture',{kind:'texts',channel:'Desktop',pageType:null,shellAuditEnabled:false});
 const captured=await until(message=>message.type==='v3-audit-result'||message.type==='v3-audit-error');
 assert.equal(captured.type,'v3-audit-result',captured.code);
 assert.equal(captured.result.dataId,manifest.dataId);
 assert.equal(captured.result.textReport.facts.scopes[0].width,320);
 assert.equal(captured.result.textReport.facts.scopes[0].name,scopeName);
 assert.equal(captured.result.textReport.facts.scopes[0].nodeId,root.id);
 assert.equal(captured.result.textReport.facts.texts[0].node.id,text.id);
 assert(!messages.some(message=>message.type==='v3-audit-data-request'&&message.operation==='asset'));
 send('v3-audit-verify','verify',{runId:'capture'});
 const verified=await until(message=>message.requestId==='verify');
 assert.equal(verified.type,'v3-audit-operation-result',verified.code);
 send('v3-audit-focus','focus',{runId:'capture',focusActionId:captured.result.textTargets[0].focusActionId});
 const focus=await until(message=>message.requestId==='focus');
 assert.equal(focus.type,'v3-audit-operation-result',focus.code);
 assert.equal(focused,text);
 text.characters='Changed during the model run';
 send('v3-audit-verify','changed',{runId:'capture'});
 const changed=await until(message=>message.requestId==='changed');
 assert.equal(changed.code,'AUDIT_SOURCE_CHANGED');
});
test('native text capture preserves path segments and checks sibling uniqueness outside the selection', async () => {
 const path=require('node:path'),esbuild=require('esbuild');
 const built=esbuild.buildSync({
  stdin:{contents:"export {collectApolloTextFacts} from './stats/textReport'; export {buildNodePath} from './utils/nodeHelpers';",
    resolveDir:path.join(__dirname,'../src/v3-audit'),loader:'ts'},
  bundle:true,write:false,platform:'node',format:'cjs',supported:{'object-rest-spread':false},
 });
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 const {collectApolloTextFacts,buildNodePath}=mod.exports;
 const page={id:'page',type:'PAGE',name:'Example',children:[]};
 const component={id:'cta',type:'COMPONENT',name:'CTA',parent:page,key:'a'.repeat(40),children:[]};
 function child(parent,id,name,type='FRAME') {
  const node={id,name,type,parent,children:[],visible:true,width:100,characters:'Text'};
  parent.children.push(node);
  return node;
 }
 const segmented=child(child(child(component,'content','Content'),'inner','Inner'),'label','Label','TEXT');
 const flatName=child(child(component,'joined','Content / Inner'),'other','Label','TEXT');
 const hidden=child(flatName.parent,'hidden','Label','TEXT');hidden.visible=false;
 const facts=await collectApolloTextFacts([segmented,flatName],buildNodePath,async()=>null,undefined,undefined,[]);
 assert.equal(facts[0].node.path,facts[1].node.path);
 assert.deepEqual(facts[0].componentPath.map(part=>[part.name,part.uniqueName]),[
  ['CTA',true],['Content',true],['Inner',true],['Label',true],
 ]);
 assert.deepEqual(facts[1].componentPath.map(part=>[part.name,part.uniqueName]),[
  ['CTA',true],['Content / Inner',true],['Label',false],
 ]);
 assert.equal(facts[0].componentPath[0].nodeId,facts[0].ancestors[0].nodeId);
});
test('verification catches a sibling name collision introduced during a native lookup', async () => {
 const path=require('node:path'),esbuild=require('esbuild');
 const built=esbuild.buildSync({
  stdin:{contents:"export {createV3SourceObservation} from './source-observation'; export {collectApolloTextFacts} from './stats/textReport'; export {buildNodePath} from './utils/nodeHelpers';",
    resolveDir:path.join(__dirname,'../src/v3-audit'),loader:'ts'},
  bundle:true,write:false,platform:'node',format:'cjs',supported:{'object-rest-spread':false},
 });
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 const {createV3SourceObservation,collectApolloTextFacts,buildNodePath}=mod.exports;
 const page={id:'page',type:'PAGE',name:'Example'};
 const main={id:'main',type:'COMPONENT',name:'TopBar',key:'a'.repeat(40),remote:true,parent:page};
 const instance={id:'topbar',type:'INSTANCE',name:'TopBar',componentProperties:{},parent:page,getMainComponentAsync:async()=>main};
 const counter={id:'counter',type:'FRAME',name:'Counter',parent:instance};
 const text={id:'selected',type:'TEXT',name:'N',parent:counter,width:10,characters:'N'};
 const sibling={id:'outside-selection',type:'TEXT',name:'Template',parent:counter,characters:'X'};
 instance.children=[counter];counter.children=[text,sibling];page.children=[instance,main];
 const proof=createV3SourceObservation('texts'),guard=()=>{};
 await proof.prepare([text],guard,false);
 const [fact]=await collectApolloTextFacts([text],buildNodePath,async()=>null,guard,proof.snapshot,[]);
 assert.equal(fact.componentPath.at(-1).uniqueName,true);
 await proof.verify(guard);

 let resume;
 const started=new Promise(resolve=>{
  instance.getMainComponentAsync=()=>new Promise(resolveMain=>{resume=()=>resolveMain(main);resolve();});
 });
 const result=proof.verify(guard);
 await started;
 sibling.name='N';
 resume();
 await assert.rejects(result,/AUDIT_SOURCE_CHANGED/);
 assert.deepEqual(proof.diagnostic(),{reason:'observed-facts-changed',nodeId:'counter',fields:['childNames']});
});
test('text check submits the original V3 report only, verifies native freshness, and keeps Ask independent',async()=>{
 const calls=[],validation={findings:[{id:'finding',nodeId:'text',title:'Текст',priority:'warning'}],responseMarkdown:'Проверено'};
 const f=setup({request:async(url,options)=>{calls.push({url,options});return ok({success:true,run:{id:'remote-1',status:'completed',validation}});}});
 try{f.start('text-run');const result=captured('text-run');f.reply('text-run',result);await tick();assert.equal(f.client.getState().busy,true);assert.equal(f.client.getState().texts.result,null);
  assert.equal(calls.length,1);assert.match(calls[0].url,/\/v1\/analyze\/codex\/runs$/);assert.deepEqual(JSON.parse(calls[0].options.body),{report:result.textReport});
  const verify=f.sent.find(message=>message.type==='v3-audit-verify');assert(verify);f.client.accept({type:'v3-audit-operation-result',schemaVersion:p.BRIDGE,requestId:verify.requestId,runId:'text-run'});await tick();
  assert.equal(f.client.getState().texts.result,validation);assert.equal(f.client.getState().busy,false);assert(!f.sent.some(message=>/resolve-contract|document-audit/.test(message.type)));
 }finally{f.client.close();}
});
test('Stop after POST discards late model result and starts a new capture without dropping saved result',async()=>{
 let release;const f=setup({request:()=>new Promise(resolve=>{release=resolve;})});
 try{f.start('old');f.reply('old',captured('old'));await tick();assert(f.client.stop());assert.equal(f.client.busy(),false);assert.match(f.client.getState().notice,/на сервере может продолжаться/);
  f.start('next');release(ok({success:true,run:{id:'old-remote',status:'completed',validation:{findings:[],responseMarkdown:'old'}}}));await tick();assert.equal(f.client.getState().texts.result,null);assert.equal(f.client.getState().busy,true);assert(!f.sent.some(message=>message.type==='v3-audit-verify'));
 }finally{f.client.close();}
});
test('model reply from changed native source is never accepted',async()=>{
 const f=setup({request:async()=>ok({success:true,run:{id:'remote',status:'completed',validation:{findings:[],responseMarkdown:'Нет замечаний'}}})});
 try{f.start('stale');f.reply('stale',captured('stale'));await tick();const verify=f.sent.find(message=>message.type==='v3-audit-verify');assert(verify);
  f.client.accept({type:'v3-audit-operation-error',schemaVersion:p.BRIDGE,requestId:verify.requestId,runId:'stale',code:'AUDIT_SOURCE_CHANGED'});await tick();assert.equal(f.client.getState().texts.result,null);assert.match(f.client.getState().error,/Макет изменился/);
 }finally{f.client.close();}
});
test('out-of-scope text findings and mismatched operation identity are refused',async()=>{
 const f=setup({request:async()=>ok({success:true,run:{id:'remote',status:'completed',validation:{findings:[{nodeId:'foreign'}],responseMarkdown:'x'}}})});
 try{f.start('scope');f.reply('scope',captured('scope'));await tick();assert.equal(f.client.getState().texts.result,null);assert.equal(f.client.getState().busy,false);assert(!f.sent.some(message=>message.type==='v3-audit-verify'));}finally{f.client.close();}
});
test('package RPC is closed to known opaque asset paths and canceled replies never cross native bridge',async()=>{
 const calls=[];let release;const f=setup({request:async(url)=>{calls.push(url);return new Promise(resolve=>{release=resolve;});}});
 try{f.client.accept({type:'v3-audit-data-request',schemaVersion:p.VERSION,requestId:'data',ownerRequestId:'run',operation:'asset',dataId:'a'.repeat(64),fileId:'b'.repeat(64),url:'https://foreign'});await tick();assert.equal(calls.length,0);
  const message={type:'v3-audit-data-request',schemaVersion:p.VERSION,requestId:'data',ownerRequestId:'run',operation:'asset',dataId:'a'.repeat(64),fileId:'b'.repeat(64)};f.client.accept(message);await tick();assert.equal(calls[0],'http://localhost:3001/v1/audit-data/'+message.dataId+'/assets/'+message.fileId);
  f.client.accept({type:'v3-audit-data-cancel',schemaVersion:p.VERSION,requestId:'data',ownerRequestId:'run'});release(ok({text:'late'}));await tick();assert(!f.sent.some(message=>message.type==='v3-audit-data-response'));
 }finally{f.client.close();}
});
test('V3 categories retain zero-diff unknown coverage and keep raw baseline out of issue counts',()=>{
 const item={id:'node',name:'Example',comparisonIssues:['Недостаточно данных'],relevance:'unknown',diffs:[]};
 const result={visibleViews:{relevance:{unknown:[item]},changesWip:[{id:'raw',diffs:[{nodeId:'child',message:'baseline'}]}]}};
 const summary=buildV3Groups(result,settings),components=summary.groups.find(group=>group.id==='components');
 assert.equal(summary.total,0);assert.equal(summary.incomplete,true);assert.equal(components.categories.some(category=>['unknown','changesWip'].includes(category.id)),false);assert.equal(summary.unconfirmed.entries.length,1);assert.equal(summary.unconfirmed.entries[0].item,item);assert.equal(result.visibleViews.relevance.unknown[0],item);assert.equal(require('../src/v3-audit/ui-model').nativeMetrics(result,settings).checks.find(check=>check.id==='v3:unknown').status,'incomplete');assert.equal(summary.groups.find(group=>group.id==='patterns').connected,false);
});
test('fresh UI capture never supplies arbitrary roots and a stale previous component result stays visible',async()=>{
 const f=setup();try{f.start('one','components');const first=Object.assign(captured('one'),{visibleViews:{relevance:{current:[]}}});f.reply('one',first,'components');assert.equal(f.client.getState().result,first);
  f.client.invalidate();assert.equal(f.client.getState().stale,true);f.start('two','components');assert.equal(f.client.getState().result,first);f.client.accept({type:'v3-audit-error',schemaVersion:p.BRIDGE,requestId:'two',code:'AUDIT_DATA_PACKAGE_MISSING'});assert.equal(f.client.getState().result,first);assert.equal(f.client.getState().stale,true);
  for(const message of f.sent.filter(message=>message.type==='v3-audit-run')){assert.equal('rootIds'in message,false);assert(p.command(message));}
 }finally{f.client.close();}
});
test('source invalidation cancels a pending native text verification and discards its late reply',async()=>{
 const f=setup({request:async()=>ok({success:true,run:{id:'remote',status:'completed',validation:{findings:[],responseMarkdown:'done'}}})});
 try{f.start('verifying');f.reply('verifying',captured('verifying'));await tick();const verify=f.sent.find(message=>message.type==='v3-audit-verify');assert(verify);
  f.client.accept({type:'v3-audit-invalidated',schemaVersion:p.BRIDGE,runId:'verifying'});await tick();assert.equal(f.client.busy(),false);assert(f.sent.some(message=>message.type==='v3-audit-cancel'&&message.requestId===verify.requestId));
  f.client.accept({type:'v3-audit-operation-result',schemaVersion:p.BRIDGE,requestId:verify.requestId,runId:'verifying'});await tick();assert.equal(f.client.getState().texts.result,null);assert.match(f.client.getState().error,/Макет изменился/);
 }finally{f.client.close();}
});
test('structured comparisons use original V3 display names and never stringify opaque objects',()=>{
 const {comparisons}=require('../src/v3-audit/ui-model');assert.deepEqual(comparisons({details:{property:'fill',reference:{value:{}},actual:{value:{}}}}),[]);
 assert.deepEqual(comparisons({details:{property:'variant.SingleIcon',reference:{value:false},actual:{value:true}}}),[{property:'SingleIcon',before:'False',after:'True'}]);
 assert.deepEqual(comparisons({details:{property:'text.style',reference:{displayName:'Action/16–20'},actual:{binding:{name:'Action/11–16'}}}}),[{property:'Типографика',before:'Action/16–20',after:'Action/11–16'}]);
});
test('new text capture shows the loading state and preserves the accepted result for a failed retry',async t=>{
 const path=require('node:path'),esbuild=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const built=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit/TextAudit.tsx')],bundle:true,write:false,platform:'node',format:'cjs',loader:{'.css':'empty','.module.css':'empty'},external:['react','react-dom','react-dom/*']});const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
 globalThis.document={visibilityState:'visible'};t.after(()=>delete globalThis.document);
 const validation={findings:[{id:'old-finding',nodeId:'text',title:'Сохранённое замечание',priority:'warning'}],responseMarkdown:'Сохранённый текст'};
 const f=setup({request:async()=>ok({success:true,run:{id:'remote',status:'completed',validation}})});
 try{
  f.start('accepted');f.reply('accepted',captured('accepted'));await tick();const verify=f.sent.find(m=>m.type==='v3-audit-verify');f.client.accept({type:'v3-audit-operation-result',schemaVersion:p.BRIDGE,requestId:verify.requestId,runId:'accepted'});await tick();
  f.start('next');let markup=renderToStaticMarkup(React.createElement(module.exports.TextAudit,{state:f.client.getState(),client:f.client,onStart:()=>{},onStop:()=>{},onClose:()=>{},startDisabled:false}));
  assert.doesNotMatch(markup,/Сохранённое замечание/);assert.match(markup,/Подключаем данные проверки/);assert.equal(f.client.getState().texts.result,validation);
  f.client.accept({type:'v3-audit-error',schemaVersion:p.BRIDGE,requestId:'next',code:'AUDIT_DATA_PACKAGE_MISSING'});
  markup=renderToStaticMarkup(React.createElement(module.exports.TextAudit,{state:f.client.getState(),client:f.client,onStart:()=>{},onStop:()=>{},onClose:()=>{},startDisabled:false}));assert.match(markup,/Сохранённое замечание/);assert.match(markup,/Повтори проверку текстов перед применением/);assert.equal(f.client.getState().texts.result,validation);
 }finally{f.client.close();}
});
test('JSON snapshot separates accepted payload and pending/failed diagnostics without legacy audit fallback',async()=>{
 const f=setup(),input=Object.assign({},settings);try{
  let snapshot=f.client.snapshot('components');assert.equal(snapshot.engine,'apollo-v3');assert.equal(snapshot.status,'diagnostic');assert.equal(snapshot.hasAcceptedResult,false);assert.equal(snapshot.originalPayload,null);
  f.client.start({requestId:'pending',kind:'components',uiPreferences:input});input.pickerLabel='iOS';snapshot=f.client.snapshot('components');assert.equal(snapshot.pending.requestId,'pending');assert.equal(snapshot.settings.pickerLabel,'Desktop');assert.equal(snapshot.status,'diagnostic');
  const payload=Object.assign(captured('pending'),{visibleViews:{relevance:{current:[]}},baseChecks:[]});f.reply('pending',payload,'components');snapshot=f.client.snapshot('components');assert.equal(snapshot.hasAcceptedResult,true);assert.equal(snapshot.status,'accepted');assert.deepEqual(snapshot.originalPayload,payload);snapshot.originalPayload.dataId='mutated-export';assert.equal(f.client.getState().result.dataId,'a'.repeat(64));
  f.start('failed','components');f.client.accept({type:'v3-audit-error',schemaVersion:p.BRIDGE,requestId:'failed',code:'AUDIT_DATA_PACKAGE_MISSING'});snapshot=f.client.snapshot('components');assert.equal(snapshot.runId,'pending');assert.equal(snapshot.lastAttempt.requestId,'failed');assert.equal(snapshot.lastAttempt.error,'AUDIT_DATA_PACKAGE_MISSING');assert.equal(snapshot.stale,true);assert.equal(snapshot.status,'stale');assert.match(snapshot.error,/Обнови данные Proxy/);
  assert.throws(()=>f.client.snapshot('legacy'),/AUDIT_REQUEST_INVALID/);
 }finally{f.client.close();}
});
test('download uses current V3 JSON in a local blob and revokes its temporary URL',async()=>{
 const f=setup();let blob,clicks=0,revoked=0,link;
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldDocument=globalThis.document;
 URL.createObjectURL=value=>{blob=value;return'blob:owned-synthetic';};URL.revokeObjectURL=value=>{assert.equal(value,'blob:owned-synthetic');revoked++;};globalThis.document={createElement:tag=>{assert.equal(tag,'a');link={click(){clicks++;}};return link;}};
 try{const snapshot=f.client.download('texts');assert.equal(clicks,1);assert.match(link.download,/^apollo-v3-texts-diagnostic\.json$/);assert.deepEqual(JSON.parse(await blob.text()),snapshot);assert.equal(snapshot.status,'diagnostic');assert.equal(snapshot.hasAcceptedResult,false);await new Promise(resolve=>setTimeout(resolve,5));assert.equal(revoked,1);}
 finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;f.client.close();}
});

test('UX-writer sends native scope and component identity, then focuses the exact text in its accepted run',async()=>{
  const calls=[];
  const finding={nodeId:'text',priority:'warning',category:'Типографика',message:'Пробел после предлога',replacement:'В кабинете',sources:[{path:'references/guide.md',ruleId:'Переносы'}]};
  const validation={skillId:'ux-writer-v2',coverageGaps:[],findings:[finding]};
  const f=setup({request:async(url,options)=>{calls.push({url,options});return ok({success:true,run:{id:'ux-remote',status:'completed',validation}});}});
  try{
    const result=captured('ux-run');
    result.textReport.scan={channel:'Desktop'};
    result.textReport.facts.scopes=[{nodeId:'card',name:'Карточка',width:320,overlay:false}];
    const fact=result.textReport.facts.texts[0];
    Object.assign(fact,{scopeNodeId:'card',effectiveOpacity:1,ancestors:[{nodeId:'button',name:'Переименованный инстанс',componentKey:'key',componentName:'[D] Button'}]});
    f.start('ux-run');f.reply('ux-run',result);await tick();
    const sent=JSON.parse(calls[0].options.body).report;
    assert.equal(sent.reportKind,'apollo-ux-writer-report');
    assert.deepEqual(sent.facts,result.textReport.facts);
    const verify=f.sent.find(message=>message.type==='v3-audit-verify');assert(verify);
    f.client.accept({type:'v3-audit-operation-result',schemaVersion:p.BRIDGE,requestId:verify.requestId,runId:'ux-run'});await tick();
    assert.equal(f.client.getState().texts.result,validation);
    const action=f.client.focus('ux-run','v3-focus-0');
    const focus=f.sent.find(message=>message.type==='v3-audit-focus');
    assert.equal(focus.focusActionId,'v3-focus-0');assert.equal(focus.runId,'ux-run');
    f.client.accept({type:'v3-audit-operation-result',schemaVersion:p.BRIDGE,requestId:focus.requestId,runId:'ux-run'});
    await action;
  }finally{f.client.close();}
});

test('native text collector uses a component-set name and key rather than the renamed instance label',async()=>{
  const path=require('node:path'),esbuild=require('esbuild');
  const built=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit/stats/textReport.ts')],bundle:true,write:false,platform:'node',format:'cjs'});
  const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
  const page={type:'PAGE',name:'Page'};
  const set={type:'COMPONENT_SET',name:'[D] Button'};
  const variant={type:'COMPONENT',name:'View=Primary',key:'component-key',parent:set};
  let mainReads=0;
  const card={id:'card',type:'FRAME',width:320,name:'Card',children:[],parent:page,opacity:0.5};
  const button={id:'button',type:'INSTANCE',name:'Button I renamed',parent:card,children:[],componentProperties:{},
    async getMainComponentAsync(){mainReads++;return variant;}};
  card.children.push(button);
  button.children.push(...['1:1','1:2'].map(id=>({id,type:'TEXT',name:'Label',characters:'В банк',parent:button})));
  const scopes=[];
  const facts=await mod.exports.collectApolloTextFacts([card],n=>n.name,async()=>null,()=>{},undefined,scopes);
  assert.equal(mainReads,1);
  assert.deepEqual(scopes,[{nodeId:'card',name:'Card',width:320,overlay:false}]);
  assert.deepEqual(facts.map(f=>[f.node.id,f.scopeNodeId,f.effectiveOpacity]),[['1:1','card',0.5],['1:2','card',0.5]]);
  assert.deepEqual(facts[0].owner,{nodeId:'button',name:'Button I renamed',componentName:'[D] Button',componentKey:'component-key',variantProperties:{}});
});
async function acceptedEditableText(extra={},setupCapture=()=>{}){
 const validation={skillId:'ux-writer-v2',coverageGaps:[],findings:[{nodeId:'text',priority:'warning',category:'Типографика',message:'Пробел',replacement:'Для\u00a0кого',sources:[]}]};
 Object.assign(validation,extra);
 let modelCalls=0;const f=setup({request:async()=>{modelCalls++;return ok({success:true,run:{id:'remote',status:'completed',validation}});}});
 const capture=captured('editable');capture.mutationAvailable=true;capture.textReport.facts.scopes=[];capture.textReport.facts.texts[0].text='Для кого';
 setupCapture(capture);f.start('editable');f.reply('editable',capture);await tick();
 const verify=f.sent.find(m=>m.type==='v3-audit-verify');if(verify)f.client.accept({type:'v3-audit-operation-result',schemaVersion:p.BRIDGE,requestId:verify.requestId,runId:'editable'});await tick();
 return Object.assign(f,{capture,validation,modelCalls:()=>modelCalls});
}
test('one common run gates edits until completion and verification, then a model failure offers retry without old cards',async t=>{
 const path=require('node:path'),esbuild=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const built=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit/TextAudit.tsx')],bundle:true,write:false,platform:'node',format:'cjs',loader:{'.css':'empty','.module.css':'empty'},external:['react','react-dom','react-dom/*']});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 globalThis.document={visibilityState:'visible'};t.after(()=>delete globalThis.document);
 const validation={skillId:'ux-writer-v2',coverageGaps:[],findings:[{nodeId:'text',priority:'warning',category:'Типографика',message:'Готовая механическая правка',replacement:'Для\u00a0кого',sources:[]}]};
 let resolvePoll,posts=0,mode='pending',failureCode='OPENROUTER_UNAVAILABLE';
 const f=setup({request:async(url,options)=>{
  if(options?.method==='POST'){
   posts++;
   return ok({success:true,run:{id:'remote-'+posts,status:mode==='failure'?'failed':mode==='pending'?'running':'completed',
    error:mode==='failure'?{code:failureCode}:null,validation}});
  }
  return new Promise(resolve=>{resolvePoll=resolve;});
 }});
 const render=()=>renderToStaticMarkup(React.createElement(mod.exports.TextAudit,{state:f.client.getState(),client:f.client,onStart:()=>{},onStop:()=>{},onClose:()=>{},startDisabled:false}));
 const start=id=>{const capture=captured(id);capture.mutationAvailable=true;capture.textReport.facts.scopes=[];capture.textReport.facts.texts[0].text='Для кого';f.start(id);f.reply(id,capture);};
 const verify=async id=>{const request=f.sent.find(m=>m.type==='v3-audit-verify'&&m.runId===id);assert(request);f.client.accept({type:'v3-audit-operation-result',schemaVersion:p.BRIDGE,requestId:request.requestId,runId:id});await tick();};
 try{
  start('first');await tick();await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.client.getState().texts.result,null);assert.doesNotMatch(render(),/Готовая механическая правка|Применить всё/);
  assert.equal(await f.client.replaceTexts(),false);assert.equal(f.client.editText('text','Преждевременно'),false);
  resolvePoll(ok({success:true,run:{id:'remote-1',status:'completed',validation}}));await tick();
  assert.equal(f.client.getState().busy,true);assert.equal(await f.client.replaceTexts(),false);
  await verify('first');assert.match(render(),/Готовая механическая правка/);assert(f.client.editText('text','Для\u00a0кого'));
  assert.equal(posts,1);assert(!f.sent.some(m=>m.type==='v3-audit-text-replace'),'proposals must not mutate Figma automatically');
  mode='failure';start('failure');await tick();
  assert.match(f.client.getState().error,/Модель не справилась/);assert.match(render(),/Повторить анализ/);
  assert.doesNotMatch(render(),/Готовая механическая правка|Применить всё|Новая проверка/);
  assert.equal(await f.client.replaceTexts(),false);assert.equal(f.client.editText('text','После сбоя'),false);
  assert.equal(f.client.snapshot('texts').lastAttempt.error,'OPENROUTER_UNAVAILABLE');assert.equal(f.client.snapshot('texts').lastAttempt.modelFailed,true);
  failureCode='OPENROUTER_CREDITS_REQUIRED';start('credits');await tick();
  assert.equal(f.client.getState().error,'OpenRouter отклонил запрос: недостаточно средств или исчерпан лимит API-ключа. Проверь в OpenRouter баланс и лимит ключа, подключённого в Apollo Proxy, затем повтори анализ.');
  assert.doesNotMatch(render(),/Модель не справилась|OPENROUTER_CREDITS_REQUIRED|Готовая механическая правка|Применить всё/);
  assert.match(render(),/role="alert"/);assert.match(render(),/Повторить анализ/);
  assert.equal(f.client.snapshot('texts').lastAttempt.error,'OPENROUTER_CREDITS_REQUIRED');assert.equal(f.client.snapshot('texts').lastAttempt.modelFailed,true);
  assert.equal(await f.client.replaceTexts(),false);assert.equal(posts,3,'billing failure must not retry automatically');
  mode='success';start('retry');await tick();assert.equal(await f.client.replaceTexts(),false);await verify('retry');
  assert.equal(posts,4);assert.equal(f.client.getState().texts.stale,false);assert.match(render(),/Готовая механическая правка/);assert.doesNotMatch(render(),/Повторить анализ|Модель не справилась/);
 }finally{f.client.close();}
});
test('text edits are retained as drafts and apply through the original native target without a paid recheck',async()=>{
 const f=await acceptedEditableText();try{
  assert(f.client.editText('text','Для\u202fкого – 👩🏽‍💻'));
  const applying=f.client.replaceTexts(['text']),request=f.sent.find(m=>m.type==='v3-audit-text-replace');assert(request);assert(p.command(request));
  assert.equal(request.runId,'editable');assert.deepEqual(request.replacements,[{focusActionId:'v3-focus-0',before:'Для кого',after:'Для\u202fкого – 👩🏽‍💻'}]);
  assert.equal(f.client.editText('text','late edit'),false);assert.equal(await f.client.replaceTexts(),false);
  f.client.accept({type:'v3-audit-operation-result',schemaVersion:p.BRIDGE,requestId:request.requestId,runId:'editable',stale:true,mutationStarted:true,textReplacements:[{nodeId:'text',text:request.replacements[0].after}],message:'Заменён текст'});
  assert.equal(await applying,true);assert.deepEqual(f.client.getState().texts.applied,{text:request.replacements[0].after});assert.equal(f.client.getState().texts.stale,true);assert.equal(f.client.getState().texts.result,f.validation);assert.equal(f.capture.textReport.facts.texts[0].text,'Для кого');assert.equal(f.modelCalls(),1);assert.equal(f.sent.filter(m=>m.type==='v3-audit-run').length,1);
  assert.equal(await f.client.replaceTexts(),false);
 }finally{f.client.close();}
});
test('unsafe edited values and unretained layers never reach the native replacement bridge',async()=>{
 const f=await acceptedEditableText();try{
  assert.equal(f.client.editText('invented','text'),false);f.client.editText('text','bad\u0000');assert.equal(await f.client.replaceTexts(),false);
  f.client.editText('text','Для кого');assert.equal(await f.client.replaceTexts(),false);
  assert.equal(await f.client.replaceTexts(['invented']),false);assert(!f.sent.some(m=>m.type==='v3-audit-text-replace'));
 }finally{f.client.close();}
});
test('native partial text failure makes only the text result stale and keeps the completed count',async()=>{
 const f=await acceptedEditableText();try{
  const applying=f.client.replaceTexts(),request=f.sent.find(m=>m.type==='v3-audit-text-replace');
  f.client.accept({type:'v3-audit-operation-error',schemaVersion:p.BRIDGE,requestId:request.requestId,runId:'editable',code:'AUDIT_ACTION_FAILED',stale:true,mutationStarted:true,textReplacements:[{nodeId:'text',text:'Для\u00a0кого'}]});
  assert.equal(await applying,false);assert.deepEqual(f.client.getState().texts.applied,{text:'Для\u00a0кого'});assert.equal(f.client.getState().texts.stale,true);assert.equal(f.client.getState().stale,false);assert.match(f.client.getState().operation.message,/Заменено текстовых слоёв: 1/);assert.equal(f.modelCalls(),1);
 }finally{f.client.close();}
});

test('source refusal before a text write disables the accepted result until a new review',async()=>{
 const f=await acceptedEditableText();try{
  const applying=f.client.replaceTexts(),request=f.sent.find(m=>m.type==='v3-audit-text-replace');
  f.client.accept({type:'v3-audit-operation-error',schemaVersion:p.BRIDGE,requestId:request.requestId,runId:'editable',code:'AUDIT_ACTION_SOURCE_CHANGED',mutationStarted:false});
  assert.equal(await applying,false);assert.equal(f.client.getState().texts.stale,true);assert.equal(await f.client.replaceTexts(),false);assert.equal(f.modelCalls(),1);
 }finally{f.client.close();}
});

test('unverified layer metadata is optional, bound to captured targets and normalized',async()=>{
 const f=await acceptedEditableText({unverifiedTexts:[{nodeId:'text',reason:' Заглушка '},{nodeId:'text',reason:'Заглушка'},{nodeId:'text',reason:'Перекрытие'}]});
 try{assert.deepEqual(f.client.getState().texts.result.unverifiedTexts,[{nodeId:'text',reason:'Заглушка\nПерекрытие'}]);}finally{f.client.close();}
});
test('unverified layer metadata rejects foreign IDs and malformed or empty reasons',async()=>{
 for(const unverifiedTexts of [null,{},[{nodeId:'foreign',reason:'Пропуск'}],[{nodeId:'text',reason:' '}],[{nodeId:'text',reason:2}]]){
  const f=await acceptedEditableText({unverifiedTexts});try{assert.equal(f.client.getState().texts.result,null);assert.match(f.client.getState().error,/привязать/);}finally{f.client.close();}
 }
});
test('applied confirmation ignores native rows without an exact requested target and text',async()=>{
 const f=await acceptedEditableText();try{
  const applying=f.client.replaceTexts(),request=f.sent.find(m=>m.type==='v3-audit-text-replace');
  f.client.accept({type:'v3-audit-operation-result',schemaVersion:p.BRIDGE,requestId:request.requestId,runId:'editable',stale:true,textReplacements:[{nodeId:'foreign',text:'Для\u00a0кого'},{nodeId:'text',text:'different'}]});
  assert.equal(await applying,true);assert.deepEqual(f.client.getState().texts.applied,{});
 }finally{f.client.close();}
});

test('partial batch confirms completed layers only and leaves the second card unapplied',async()=>{
 const f=await acceptedEditableText({findings:['text','second'].map(nodeId=>({nodeId,priority:'warning',replacement:'Для\u00a0кого',sources:[]}))},capture=>{
  capture.textTargets.push({nodeId:'second',focusActionId:'v3-focus-1'});
  capture.textReport.facts.texts.push({node:{id:'second'},text:'Для кого'});
 });try{
  const applying=f.client.replaceTexts(),request=f.sent.find(m=>m.type==='v3-audit-text-replace');assert.equal(request.replacements.length,2);
  f.client.accept({type:'v3-audit-operation-error',schemaVersion:p.BRIDGE,requestId:request.requestId,runId:'editable',code:'AUDIT_ACTION_FAILED',stale:true,mutationStarted:true,failedTextNodeId:'second',textReplacements:[{nodeId:'text',text:'Для\u00a0кого'}]});
  assert.equal(await applying,false);assert.deepEqual(f.client.getState().texts.applied,{text:'Для\u00a0кого'});
  assert.equal(f.client.getState().texts.stale,true);assert.equal(f.modelCalls(),1);
  const groups=require('../src/v3-audit/text-review-model').textReviewGroups(f.client.getState().texts.result,f.client.getState().texts.applied);assert.deepEqual(groups.errors.map(row=>row.nodeId),['second']);
 }finally{f.client.close();}
});

test('failed focus keeps the existing stale refusal for the text run',async()=>{
 const f=await acceptedEditableText();try{
  const focusing=f.client.focus('editable','v3-focus-0'),request=f.sent.find(m=>m.type==='v3-audit-focus');
  f.client.accept({type:'v3-audit-operation-error',schemaVersion:p.BRIDGE,requestId:request.requestId,runId:'editable',code:'AUDIT_ACTION_FAILED',stale:true});
  assert.equal(await focusing,false);assert.equal(f.client.getState().texts.stale,true);
 }finally{f.client.close();}
});

test('confirmed sequential replacements remove only completed rows and keep remaining drafts and targets',async()=>{
 const f=await acceptedEditableText({findings:['text','second'].map(nodeId=>({nodeId,priority:'warning',replacement:'Для\u00a0кого',sources:[]}))},capture=>{
  capture.textTargets.push({nodeId:'second',focusActionId:'v3-focus-1'});capture.textReport.facts.texts.push({node:{id:'second'},text:'Для кого'});
 });try{
  const {textReviewGroups,textReplacements}=require('../src/v3-audit/text-review-model');f.client.editText('second','Для\u202fкого');
  for(const [index,nodeId]of ['text','second'].entries()){
   const applying=f.client.replaceTexts([nodeId]),request=f.sent.filter(m=>m.type==='v3-audit-text-replace').at(-1);assert.equal(request.replacements.length,1);
   f.client.accept({type:'v3-audit-operation-result',schemaVersion:p.BRIDGE,requestId:request.requestId,runId:'editable',stale:false,textReplacements:[{nodeId,text:request.replacements[0].after}]});assert(await applying);
   const state=f.client.getState().texts;assert.equal(state.stale,false);assert.equal(textReviewGroups(state.result,state.applied).errors.length,1-index);assert.equal(textReplacements(state).length,1-index);
  }
  assert.equal(f.client.getState().texts.result,f.validation);assert.equal(f.capture.textReport.facts.texts[0].text,'Для кого');assert.equal(f.modelCalls(),1);
 }finally{f.client.close();}
});
