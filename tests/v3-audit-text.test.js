const test=require('node:test'),assert=require('node:assert/strict');
const {createV3UiClient}=require('../src/v3-audit/ui-client'),p=require('../src/v3-audit/transport');
const {buildV3Groups}=require('../src/v3-audit/ui-model');
const settings={pickerLabel:'Desktop',pageTypeId:null,shellAuditEnabled:false};
const tick=()=>new Promise(setImmediate),ok=value=>({ok:true,json:async()=>value});
function captured(id){return{runId:id,dataId:'a'.repeat(64),textTargets:[{nodeId:'text',focusActionId:'v3-focus-0'}],textReport:{reportId:id+':texts',reportKind:'apollo-text-audit-report',summary:{scannedTextNodes:1},facts:{texts:[{node:{id:'text',visible:true},text:'Тест',ancestors:[]}]}}};}
function setup(options={}){const sent=[],client=createV3UiClient(Object.assign({send:message=>sent.push(message),pollDelay:0},options));return{client,sent,start:(id,kind='texts')=>client.start({requestId:id,kind,uiPreferences:settings}),reply:(id,result,kind='texts')=>client.accept({type:'v3-audit-result',schemaVersion:p.BRIDGE,requestId:id,kind,result})};}
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
test('accepted text stays visible during new capture with progress, historical label and disabled focus',async t=>{
 const path=require('node:path'),esbuild=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const built=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit/TextAudit.tsx')],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/*']});const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
 globalThis.document={visibilityState:'visible'};t.after(()=>delete globalThis.document);
 const validation={findings:[{id:'old-finding',nodeId:'text',title:'Сохранённое замечание',priority:'warning'}],responseMarkdown:'Сохранённый текст'};
 const f=setup({request:async()=>ok({success:true,run:{id:'remote',status:'completed',validation}})});
 try{
  f.start('accepted');f.reply('accepted',captured('accepted'));await tick();const verify=f.sent.find(m=>m.type==='v3-audit-verify');f.client.accept({type:'v3-audit-operation-result',schemaVersion:p.BRIDGE,requestId:verify.requestId,runId:'accepted'});await tick();
  f.start('next');let markup=renderToStaticMarkup(React.createElement(module.exports.TextAudit,{state:f.client.getState(),client:f.client}));
  assert.match(markup,/Сохранённое замечание/);assert.match(markup,/Подключаем данные проверки/);assert.match(markup,/Показан предыдущий принятый результат/);assert.match(markup.match(/<button[^>]*data-finding-focus[^>]*>/)?.[0]||'',/disabled=""/);
  f.client.accept({type:'v3-audit-error',schemaVersion:p.BRIDGE,requestId:'next',code:'AUDIT_DATA_PACKAGE_MISSING'});
  markup=renderToStaticMarkup(React.createElement(module.exports.TextAudit,{state:f.client.getState(),client:f.client}));assert.match(markup,/Сохранённое замечание/);assert.match(markup,/предыдущий принятый результат/);assert.equal(f.client.getState().texts.result,validation);
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
