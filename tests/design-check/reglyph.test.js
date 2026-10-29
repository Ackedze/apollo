const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createReglyphBridge}=require('../../src/skills/reglyph/native');
const {createReglyphClient,pickerRepresentatives,searchText}=require('../../src/skills/reglyph/client');
const p=require('../../src/skills/reglyph/protocol');
function fixture() {
  const messages=[],events={},storage=new Map(),swaps=[];
  let key='old',imports=async value=>({key:value});
  const page={id:'page',type:'PAGE',selection:[],findAllWithCriteria:()=>[]};
  const icon={id:'icon',type:'INSTANCE',name:'Icon',width:24,height:24,parent:page,children:[],getMainComponentAsync:async()=>({key}),exportAsync:async()=>new Uint8Array([1]),swapComponent:target=>{key=target.key;swaps.push(key);},resize(w,h){this.width=w;this.height=h;}};
  const frame={id:'frame',name:'Исходный фрейм',type:'FRAME',parent:page,findAllWithCriteria:()=>[icon]};icon.parent=frame;page.selection=[frame];
  const api={currentPage:page,ui:{onmessage:'original'},on:(name,callback)=>{events[name]=callback;},clientStorage:{getAsync:async k=>storage.get(k),setAsync:async(k,value)=>storage.set(k,value)},importComponentByKeyAsync:k=>imports(k),getNodeByIdAsync:async id=>id==='icon'?icon:id==='frame'?frame:null,setCurrentPageAsync:async next=>{api.currentPage=next;},base64Encode:()=>'AQ==',commitUndo(){},viewport:{scrollAndZoomIntoView(){}}};
  const catalog={version:1,scenarioId:'default',oldIcons:[{key:'old',name:'Old'}],newIcons:[{key:'new',name:'New',familyId:'new',width:24,height:24}],mappings:[{oldKey:'old',newKey:'new'}]};
  const catalogs={default:catalog,services:Object.assign({},catalog,{scenarioId:'services',newIcons:[{key:'logo',name:'Logo'}],mappings:[{oldKey:'old',newKey:'logo'}]})};
  let changed=0,notify=()=>{};
  const bridge=createReglyphBridge({api,catalogs,detection:{containers:[],iconViewSets:[]},post:value=>{messages.push(value);notify(value);},onMutation:()=>changed++});
  let sequence=0,revision=0;
  const context=(platform='iOS',channelId='b2b')=>bridge.accept({type:'reglyph-context',schemaVersion:p.SCHEMA,revision:++revision,context:{channelId,pickerLabel:platform}});
  const request=(operation,payload={})=>new Promise(resolve=>{
    const requestId='reglyph-test-'+(++sequence);notify=value=>{if(value.type==='reglyph-result'&&value.requestId===requestId)resolve(value);};
    bridge.accept({type:'reglyph-request',schemaVersion:p.SCHEMA,requestId,revision,operation,payload});
  });
  return {api,icon,frame,bridge,catalogs,messages,swaps,context,request,changed:()=>changed,setImports:fn=>{imports=fn;}};
}
test('same ABM implementation works on iOS and Android without replacing the Apollo message handler',async()=>{
  for(const platform of ['iOS','Android']){
    const f=fixture();f.context(platform);await f.request('scan');assert.equal(f.swaps.length,0);
    await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});
    assert.deepEqual(f.swaps,['new']);assert.equal(f.changed(),1);assert.equal(f.api.ui.onmessage,'original');assert.equal(f.bridge.busy(),false);
  }
});
test('Desktop and MobileWeb cannot scan or mutate using ABM rules',async()=>{
  for(const platform of ['Desktop','MobileWeb']){
    const f=fixture();f.context(platform);assert.match((await f.request('scan')).error,/iOS или Android/);
    assert.match((await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]})).error,/iOS или Android/);assert.deepEqual(f.swaps,[]);
  }
});
test('channel change invalidates the plan even when both platforms use the same matrix',async()=>{
  const f=fixture();f.context();await f.request('scan');f.context('iOS','b2c');await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});
  assert.deepEqual(f.swaps,[]);assert.ok(f.messages.some(message=>message.event?.type==='error'));
});
test('changing iOS to Android while importing the target refuses the first swap',async()=>{
  const f=fixture();f.context();await f.request('scan');let release;
  f.setImports(()=>new Promise(resolve=>{release=resolve;}));
  const result=f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});
  await new Promise(resolve=>setImmediate(resolve));assert.ok(release);f.context('Android');release({key:'new'});await result;
  assert.deepEqual(f.swaps,[]);
});
test('unsupported target, changed source, hidden icon and wrong context revision never mutate',async()=>{
  for(const problem of ['target','source','hidden','revision']){
    const f=fixture();f.context();await f.request('scan');
    if(problem==='source')f.icon.getMainComponentAsync=async()=>({key:'another'});
    if(problem==='hidden')f.icon.visible=false;
    if(problem==='revision')f.bridge.accept({type:'reglyph-request',schemaVersion:p.SCHEMA,requestId:'reglyph-stale',revision:0,operation:'replace',payload:{choices:[{oldKey:'old',newKey:'new'}]}});
    else await f.request('replace',{choices:[{oldKey:'old',newKey:problem==='target'?'forged':'new'}]});
    assert.deepEqual(f.swaps,[]);
  }
});
test('service scenario keeps Logo-corp as its target',async()=>{
  const f=fixture();f.context();await f.request('scenario',{id:'services'});
  await f.request('scan');const prompt=f.messages.findLast(message=>message.event?.type==='scan-confirmation')?.event;
  if(prompt)await f.request('scan',{scenarioId:'services',confirmationToken:prompt.token});
  await f.request('replace',{choices:[{oldKey:'old',newKey:'logo'}]});assert.deepEqual(f.swaps,['logo']);
});
test('picker is one Line/Color=False/nearest24 representative per family; descriptions normalize without invented synonyms',()=>{
  const icons=[{key:'solid',familyId:'a',width:24,height:24,properties:{Style:'Solid',Color:'False'}},{key:'color',familyId:'a',width:24,height:24,properties:{Style:'Line',Color:'True'}},{key:'line',familyId:'a',width:24,height:24,properties:{Style:'Line',Color:'False'}},{key:'other',familyId:'b',properties:{Style:'Line'}}];
  assert.deepEqual(pickerRepresentatives(icons).map(icon=>icon.key),['line','other']);assert.equal(searchText('Альфа-Баллы, ёлка'),'альфа баллы елка');
});
test('client does not initialize the catalog or call an HTTP service on unsupported platforms',()=>{
  const sent=[];const client=createReglyphClient({send:message=>sent.push(message)});
  client.setContext({channelId:'b2b',pickerLabel:'Desktop'});client.open();client.start();
  assert.equal(sent.filter(message=>message.type==='reglyph-request').length,0);assert.equal(client.getState().supported,false);
  client.setContext({channelId:'b2b',pickerLabel:'Android'});
  assert.equal(sent.filter(message=>message.operation==='ready').length,1);assert.equal(client.getState().supported,true);
});
test('packaged catalogs keep the source service and native exceptions',()=>{
  const base=require('../../src/skills/reglyph/default.json'),services=require('../../src/skills/reglyph/services.json'),detection=require('../../src/skills/reglyph/detection.json');
  assert.equal(base.mappings.length,1499);assert.equal(services.mappings.length,382);
  assert.ok(base.nativeCurrencyKeys.length>0);assert.equal(services.legacyCurrencies,undefined);
  assert.ok(detection.protectedFixedIconRules.length);assert.ok(detection.protectedComponentSets.some(value=>value.name==='TabBarV2 ABM'));
  assert.ok(services.newIcons.every(icon=>icon.library==='Logo-corp'));
});

test('background preview yields to another Apollo operation before sending the next request',()=>{
  const sent=[];let otherBusy=false;const client=createReglyphClient({send:message=>sent.push(message),isBusy:()=>otherBusy});
  client.setContext({channelId:'b2b',pickerLabel:'iOS'});client.open();const ready=sent.at(-1);
  client.accept({type:'reglyph-event',schemaVersion:p.SCHEMA,revision:ready.revision,event:{type:'catalog',catalog:{scenarioId:'default',newIcons:[{key:'a'},{key:'b'}]}}});
  client.accept({type:'reglyph-result',schemaVersion:p.SCHEMA,revision:ready.revision,requestId:ready.requestId});
  const preview=sent.at(-1);assert.equal(preview.operation,'preview');assert.equal(client.busy(),false);
  otherBusy=true;client.accept({type:'reglyph-event',schemaVersion:p.SCHEMA,revision:ready.revision,event:{type:'preview',key:'a',image:'image'}});
  client.accept({type:'reglyph-result',schemaVersion:p.SCHEMA,revision:ready.revision,requestId:preview.requestId});
  assert.equal(sent.at(-1),preview);assert.equal(client.getState().available,false);
  otherBusy=false;client.refresh();assert.equal(sent.at(-1).operation,'preview');assert.equal(sent.at(-1).payload.key,'b');
});
function historyClient(withResult=true,onOperation=()=>null) {
  const sent=[],handled=new Set();const client=createReglyphClient({send:message=>sent.push(message),onOperation});
  const feed=event=>client.accept({type:'reglyph-event',schemaVersion:p.SCHEMA,revision:sent.find(message=>message.type==='reglyph-context').revision,event});
  function settle(){for(let i=0;i<sent.length;i++){const message=sent[i];if(message.type!=='reglyph-request'||handled.has(message.requestId))continue;handled.add(message.requestId);if(message.operation==='preview')feed({type:'preview',key:message.payload.key,image:'cached-'+message.payload.key});client.accept({type:'reglyph-result',schemaVersion:p.SCHEMA,revision:message.revision,requestId:message.requestId});}}
  client.setContext({channelId:'b2b',pickerLabel:'iOS'});client.open();
  feed({type:'catalog',catalog:{scenarioId:'default',newIcons:[{key:'new'},{key:'manual'}]}});settle();
  const rows=[{oldKey:'old',newKey:'new',ids:['icon'],name:'Old',image:'source-image'}];
  if(withResult){feed({type:'scan',scopeName:'Исходный фрейм',rows,observedRows:[{oldKey:'native',category:'native',ids:['native-icon']}]});client.choose('old','manual');settle();}
  return{client,sent,feed,settle,rows};
}
test('actual scope invalidation retains previous rows, manual choices, observed icons and previews without an error screen',()=>{
  const f=historyClient(),before=f.client.getState();
  for(let i=0;i<3;i++){f.client.selection({valid:i!==1});f.feed({type:'stale'});}
  const after=f.client.getState();assert.equal(after.status,'preview');assert.equal(after.planStale,true);assert.equal(after.error,'');
  assert.equal(after.rows,before.rows);assert.equal(after.rows[0].newKey,'manual');assert.equal(after.observedRows,before.observedRows);assert.equal(after.images,before.images);
  const count=f.sent.length;f.client.replace();f.client.focus('icon');assert.equal(f.sent.length,count,'historical result cannot start replace or native focus');
  f.client.largePreview({id:'icon',image:'source-image'},'historical');assert.equal(f.sent.length,count);assert.equal(f.client.getState().largePreview.image,'source-image');
});
test('a new completed scan restores replacement after the previous result became historical',()=>{
  const f=historyClient();f.feed({type:'stale'});f.client.reset();f.settle();
  assert.equal(f.client.getState().planStale,false);assert.deepEqual(f.client.getState().rows,[]);
  f.client.start();f.feed({type:'scan',rows:f.rows});f.settle();f.client.replace();
  assert.equal(f.client.getState().status,'replacing');assert.equal(f.sent.at(-1).operation,'replace');
});
test('completed replacement summary and remaining rows survive scope invalidation',()=>{
  const f=historyClient();f.feed({type:'done',remainingRows:f.rows,replaced:1,skipped:1,failed:0});const result=f.client.getState().result;
  f.feed({type:'stale'});assert.equal(f.client.getState().status,'done');assert.equal(f.client.getState().result,result);
  f.client.back();assert.equal(f.client.getState().status,'preview');assert.equal(f.client.getState().planStale,true);
  const count=f.sent.length;f.client.replace();assert.equal(f.sent.length,count);
});
test('an interrupted scan restores a prior result or the invitation quietly, while real scan errors remain visible',()=>{
  for(const hasResult of [true,false]){
    const f=historyClient(hasResult),rows=f.client.getState().rows;f.client.start();f.feed({type:'stale'});f.feed({type:'error',requestType:'scan',text:'Selection changed'});
    assert.equal(f.client.getState().status,hasResult?'preview':'idle');assert.equal(f.client.getState().error,'');assert.equal(f.client.getState().rows,rows);
  }
  const f=historyClient(false);f.client.start();f.feed({type:'error',requestType:'scan',text:'Read failed'});assert.equal(f.client.getState().status,'error');assert.equal(f.client.getState().error,'Read failed');
});
test('channel change still resets historical results and replacement failures remain explicit',()=>{
  const f=historyClient();f.feed({type:'stale'});f.client.setContext({channelId:'b2c',pickerLabel:'iOS'});
  assert.equal(f.client.getState().status,'idle');assert.deepEqual(f.client.getState().rows,[]);assert.equal(f.client.getState().planStale,false);
  const g=historyClient();g.client.replace();g.feed({type:'stale'});g.feed({type:'error',requestType:'replace',text:'Swap failed'});assert.equal(g.client.getState().error,'Swap failed');assert.equal(g.client.getState().status,'error');
});
test('selection changes keep the original frame actionable, including focus, preview and replacement',async()=>{
  const f=fixture();f.context();await f.request('scan');
  assert.equal(f.messages.findLast(m=>m.event?.type==='scan').event.scopeName,'Исходный фрейм');
  const other={id:'other',type:'FRAME',parent:f.api.currentPage};
  f.api.currentPage.selection=[other];const start=f.messages.length;f.bridge.selectionChanged();
  assert.equal(f.messages.slice(start).some(m=>m.event?.type==='stale'),false);
  assert.equal((await f.request('icon-preview',{id:'icon',token:'preview'})).error,null);
  assert.equal((await f.request('go-to',{id:'icon'})).error,null);assert.deepEqual(f.api.currentPage.selection,[f.icon]);
  f.api.currentPage.selection=[other];f.bridge.selectionChanged();
  await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.swaps,['new']);assert.deepEqual(f.api.currentPage.selection,[other]);
});
test('scan and scenario confirmation stay pinned when selection changes during or after reading',async()=>{
  for(const confirm of [false,'same','switch']){
    const f=fixture();f.context();if(confirm)await f.request('scenario',{id:'services'});
    const other={id:'other',type:'FRAME',parent:f.api.currentPage};let changed=false;
    f.icon.getMainComponentAsync=async()=>{if(!changed){changed=true;f.api.currentPage.selection=[other];f.bridge.selectionChanged();}return{key:'old'};};
    await f.request('scan');const prompt=f.messages.findLast(m=>m.event?.type==='scan-confirmation')?.event;
    if(confirm){assert.ok(prompt);await f.request('scan',{scenarioId:confirm==='switch'?'default':'services',confirmationToken:prompt.token});}
    assert.ok(f.messages.findLast(m=>m.event?.type==='scan')?.event.rows.length);
    await f.request('replace',{choices:[{oldKey:'old',newKey:confirm==='same'?'logo':'new'}]});assert.deepEqual(f.swaps,[confirm==='same'?'logo':'new']);
  }
});
test('switching pages keeps the original plan and explicit navigation returns to its page',async()=>{
  const f=fixture();f.context();await f.request('scan');const originalPage=f.api.currentPage;
  const otherPage={id:'other-page',type:'PAGE',selection:[],findAllWithCriteria:()=>[]};f.api.currentPage=otherPage;f.bridge.selectionChanged();
  await f.request('go-to',{id:'icon'});assert.equal(f.api.currentPage,originalPage);assert.deepEqual(originalPage.selection,[f.icon]);
  f.api.currentPage=otherPage;f.bridge.selectionChanged();await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.swaps,['new']);assert.equal(f.api.currentPage,otherPage);
});
test('removed roots, moved sources and changed source components never use a saved plan',async()=>{
  for(const problem of ['removed-root','moved-root','moved-icon','removed-icon','source']){
    const f=fixture();f.context();await f.request('scan');const otherPage={id:'other-page',type:'PAGE'};
    if(problem==='removed-root')f.frame.removed=true;
    if(problem==='moved-root')f.frame.parent=otherPage;
    if(problem==='moved-icon')f.icon.parent=f.api.currentPage;
    if(problem==='removed-icon')f.icon.removed=true;
    if(problem==='source')f.icon.getMainComponentAsync=async()=>({key:'changed'});
    const start=f.messages.length;await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.ok(f.messages.slice(start).some(m=>m.event?.type==='error'),problem);assert.deepEqual(f.swaps,[],problem);
  }
});
test('original scope is checked again after target import and immediately before swapping',async()=>{
  for(const during of ['import','prewrite']){
    const f=fixture();f.context();await f.request('scan');
    if(during==='import')f.setImports(async key=>{f.icon.parent=f.api.currentPage;return{key};});
    else {let reads=0;f.icon.getMainComponentAsync=async()=>{if(++reads===2)f.icon.parent=f.api.currentPage;return{key:'old'};};}
    await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.swaps,[],during);
  }
});
test('ordinary selection updates keep client choices, scope label and apply enabled',()=>{
  const f=historyClient(),before=f.client.getState();f.client.selection({valid:false});f.feed({type:'selection',count:1});
  assert.equal(f.client.getState().planStale,false);assert.equal(f.client.getState().rows,before.rows);assert.equal(f.client.getState().scopeName,'Исходный фрейм');f.client.replace();assert.equal(f.sent.at(-1).operation,'replace');
});

test('a pending navigation refused after selection change cannot replace the historical result with an error',()=>{
  const f=historyClient();f.client.focus('icon');const request=f.sent.at(-1);assert.equal(request.operation,'go-to');
  f.feed({type:'stale'});f.feed({type:'error',requestType:'go-to',text:'Selection changed'});
  assert.equal(f.client.getState().status,'preview');assert.equal(f.client.getState().error,'');
  f.client.accept({type:'reglyph-result',schemaVersion:p.SCHEMA,revision:request.revision,requestId:request.requestId,error:'Selection changed'});
  assert.equal(f.client.getState().status,'preview');assert.equal(f.client.getState().error,'');
});

test('ReGlyph statistics records scan and actual replacement; focus/previews do not add operations',()=>{
 const events=[],f=historyClient(false,kind=>({finish:status=>events.push([kind,status])}));
 f.client.start();f.feed({type:'scan',rows:f.rows,scopeName:'Original'});f.settle();
 assert.deepEqual(events,[['reglyph-scan','completed']]);
 f.client.focus('icon');f.settle();f.client.largePreview({id:'icon'},'preview');f.settle();assert.equal(events.length,1);
 f.client.replace();f.feed({type:'done',remainingRows:f.rows,replaced:0,skipped:0,failed:1,errors:['source changed']});f.settle();
 assert.deepEqual(events,[['reglyph-scan','completed'],['reglyph-replace','failed']]);
});
