const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createReglyphBridge}=require('../../src/skills/reglyph/native');
const {createReglyphClient,pickerRepresentatives,searchText}=require('../../src/skills/reglyph/client');
const p=require('../../src/skills/reglyph/protocol');
function fixture(detection={containers:[],iconViewSets:[]}) {
  const messages=[],events={},storage=new Map(),swaps=[],undoEvents=[];
  let key='old',imports=async value=>({key:value,width:24,height:24,children:[],exportAsync:async()=>new Uint8Array([1])});
  const page={id:'page',type:'PAGE',selection:[],findAllWithCriteria:()=>[]};
  const icon={id:'icon',type:'INSTANCE',name:'Icon',width:24,height:24,parent:page,children:[],getMainComponentAsync:async()=>({key}),exportAsync:async()=>new Uint8Array([1]),swapComponent:target=>{key=target.key;swaps.push(key);undoEvents.push("swap");},resize(w,h){this.width=w;this.height=h;}};
  const frame={id:'frame',name:'Исходный фрейм',type:'FRAME',parent:page,findAllWithCriteria:()=>[icon]};icon.parent=frame;page.selection=[frame];
  const api={currentPage:page,ui:{onmessage:'original'},on:(name,callback)=>{events[name]=callback;},clientStorage:{getAsync:async k=>storage.get(k),setAsync:async(k,value)=>storage.set(k,value)},importComponentByKeyAsync:k=>imports(k),getNodeByIdAsync:async id=>id==='icon'?icon:id==='frame'?frame:null,setCurrentPageAsync:async next=>{api.currentPage=next;},base64Encode:()=>'AQ==',commitUndo(){undoEvents.push('commit');},triggerUndo(){undoEvents.push('undo');key='old';},viewport:{scrollAndZoomIntoView(){}}};
  const catalog={version:1,scenarioId:'default',oldIcons:[{key:'old',name:'Old'}],newIcons:[{key:'new',name:'New',familyId:'new',width:24,height:24}],mappings:[{oldKey:'old',newKey:'new'}]};
  const catalogs={default:catalog,services:Object.assign({},catalog,{scenarioId:'services',newIcons:[{key:'logo',name:'Logo'}],mappings:[{oldKey:'old',newKey:'logo'}]})};
  let changed=0,notify=()=>{};
  const bridge=createReglyphBridge({api,catalogs,detection,post:value=>{messages.push(value);notify(value);},onMutation:()=>changed++});
  let sequence=0,revision=0;
  const context=(platform='iOS',channelId='b2b')=>bridge.accept({type:'reglyph-context',schemaVersion:p.SCHEMA,revision:++revision,context:{channelId,pickerLabel:platform}});
  const request=(operation,payload={})=>new Promise(resolve=>{
    const requestId='reglyph-test-'+(++sequence);notify=value=>{if(value.type==='reglyph-result'&&value.requestId===requestId)resolve(value);};
    bridge.accept({type:'reglyph-request',schemaVersion:p.SCHEMA,requestId,revision,operation,payload});
  });
  return {api,icon,frame,bridge,catalogs,messages,swaps,undoEvents,context,request,changed:()=>changed,setImports:fn=>{imports=fn;}};
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
  const f=fixture();f.catalogs.default.newIcons.push({key:'manual',name:'Manual'});f.context();await f.request('scan');let release;
  f.setImports(()=>new Promise(resolve=>{release=resolve;}));
  const result=f.request('replace',{choices:[{oldKey:'old',newKey:'manual'}]});
  await new Promise(resolve=>setImmediate(resolve));assert.ok(release);f.context('Android');release({key:'manual'});await result;
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
test('service scenario is refused by native even when requested directly',async()=>{
  const f=fixture();f.context();await f.request('scenario',{id:'services'});
  assert.match(f.messages.findLast(m=>m.event?.type==='error').event.text,/Уважаемые экраны/);
  await f.request('scan',{scenarioId:'services'});
  assert.match(f.messages.findLast(m=>m.event?.type==='error').event.text,/Уважаемые экраны/);
  await f.request('replace',{choices:[{oldKey:'old',newKey:'logo'}]});assert.deepEqual(f.swaps,[]);
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
  client.preview('a');client.preview('b');
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
test('stale preview closes working results and invites a new check like ReGlyph',()=>{
  const f=historyClient();f.feed({type:'stale'});
  const state=f.client.getState();assert.equal(state.status,'error');assert.equal(state.planStale,true);assert.equal(state.errorCode,'SELECTION_CHANGED');
  assert.equal(state.confirmation,null);assert.equal(state.largePreview,null);
  const before=f.sent.length;f.client.replace();f.client.focus('icon');assert.equal(f.sent.length,before);
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
test('starting a scan clears old rows and an interrupted scan does not restore them',()=>{
  for(const hasResult of [true,false]){
    const f=historyClient(hasResult);f.client.start();assert.deepEqual(f.client.getState().rows,[]);assert.deepEqual(f.client.getState().observedRows,[]);
    f.feed({type:'stale'});f.feed({type:'error',requestType:'scan',text:'Selection changed'});
    assert.equal(f.client.getState().status,'error');assert.equal(f.client.getState().errorCode,'SELECTION_CHANGED');assert.deepEqual(f.client.getState().rows,[]);
  }
  const f=historyClient(false);f.client.start();f.feed({type:'error',requestType:'scan',text:'Read failed'});assert.equal(f.client.getState().error,'Read failed');
});
test('selection notifications cannot reset an interrupted pending scan to the idle invitation',()=>{
  const f=historyClient(false);f.client.start();f.feed({type:'stale'});
  f.feed({type:'selection',count:1});f.client.selection({valid:true});
  assert.equal(f.client.getState().status,'error');assert.equal(f.client.getState().errorCode,'SELECTION_CHANGED');assert.equal(f.client.busy(),true);
  f.feed({type:'error',requestType:'scan',text:'Selection changed'});f.settle();
  f.feed({type:'selection',count:1});f.client.selection({valid:true});
  assert.equal(f.client.getState().errorCode,'SELECTION_CHANGED');assert.equal(f.client.busy(),false);
  f.client.start();assert.equal(f.client.getState().status,'scanning');
});
test('only a no-selection error recovers on a valid selection, after the pending request has completed',()=>{
  const f=historyClient(false);f.client.start();f.feed({type:'error',requestType:'scan',code:'NO_SELECTION',text:'Select a frame'});
  f.feed({type:'selection',count:1});assert.equal(f.client.getState().status,'error');assert.equal(f.client.busy(),true);
  f.settle();assert.equal(f.client.getState().status,'idle');assert.equal(f.client.busy(),false);
  f.client.start();f.feed({type:'error',requestType:'scan',text:'Read failed'});f.settle();f.client.selection({valid:true});
  assert.equal(f.client.getState().status,'error');assert.equal(f.client.getState().error,'Read failed');
});
test('channel change still resets historical results and replacement failures remain explicit',()=>{
  const f=historyClient();f.feed({type:'stale'});f.client.setContext({channelId:'b2c',pickerLabel:'iOS'});
  assert.equal(f.client.getState().status,'idle');assert.deepEqual(f.client.getState().rows,[]);assert.equal(f.client.getState().planStale,false);
  const g=historyClient();g.client.replace();g.feed({type:'stale'});g.feed({type:'error',requestType:'replace',text:'Swap failed'});assert.equal(g.client.getState().error,'Swap failed');assert.equal(g.client.getState().status,'error');
});
test('changing selection prompts, refuses old actions, and Stay restores the original selection',async()=>{
  const f=fixture();f.context();await f.request('scan');
  const other={id:'other',type:'FRAME',parent:f.api.currentPage};f.api.currentPage.selection=[other];f.bridge.selectionChanged();
  const prompt=f.messages.findLast(m=>m.event?.type==='selection-confirmation').event;
  await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.swaps,[]);
  await f.request('go-to',{id:'icon'});assert.deepEqual(f.api.currentPage.selection,[other]);
  await f.request('selection-decision',{token:prompt.token,decision:'stay'});assert.deepEqual(f.api.currentPage.selection,[f.frame]);
  await f.request('go-to',{id:'icon'});f.bridge.selectionChanged();assert.deepEqual(f.api.currentPage.selection,[f.icon]);
  assert.equal(f.messages.findLast(m=>m.event?.type==='selection-confirmation').event,prompt,'inspecting an icon does not prompt again');
  await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.swaps,['new']);
});
test('Switch discards the old selection plan and immediately scans the newly selected frame',async()=>{
  const f=fixture();f.context();await f.request('scan');
  const otherIcon=Object.assign({},f.icon,{id:'other-icon'}),other={id:'other',name:'Новый фрейм',type:'FRAME',parent:f.api.currentPage,findAllWithCriteria:()=>[otherIcon]};otherIcon.parent=other;
  f.api.currentPage.selection=[other];f.bridge.selectionChanged();const token=f.messages.findLast(m=>m.event?.type==='selection-confirmation').event.token;
  await f.request('selection-decision',{token,decision:'switch'});
  const scan=f.messages.findLast(m=>m.event?.type==='scan').event;assert.equal(scan.scopeName,'Новый фрейм');assert.deepEqual(scan.rows[0].ids,['other-icon']);
  assert.ok(f.messages.some(m=>m.event?.type==='selection-switch-started'));assert.deepEqual(f.swaps,[]);
});
test('a changed selection while reading cancels the scan rather than pinning the old frame',async()=>{
  const f=fixture();f.context();const other={id:'other',type:'FRAME',parent:f.api.currentPage};let changed=false;
  f.icon.getMainComponentAsync=async()=>{if(!changed){changed=true;f.api.currentPage.selection=[other];f.bridge.selectionChanged();}return{key:'old'};};
  await f.request('scan');assert.equal(f.messages.some(m=>m.event?.type==='scan'),false);
  await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.swaps,[]);
});
test('an unchanged selection notification while reading does not cancel the scan',async()=>{
  const f=fixture();f.context();let notified=false;
  f.icon.getMainComponentAsync=async()=>{if(!notified){notified=true;f.bridge.selectionChanged();}return{key:'old'};};
  const start=f.messages.length;await f.request('scan');
  assert.ok(f.messages.slice(start).some(m=>m.event?.type==='scan'));assert.equal(f.messages.slice(start).some(m=>m.event?.type==='stale'),false);
});
test('an invalidated scan stops in the header prepass without reading the remaining components',async()=>{
  const f=fixture();f.context();let reads=0;
  f.icon.getMainComponentAsync=async()=>{f.api.currentPage.selection=[{id:'other'}];f.bridge.selectionChanged();return{key:'old'};};
  const extra=Object.assign({},f.icon,{id:'extra',getMainComponentAsync:async()=>{reads++;return{key:'old'};}});
  f.frame.findAllWithCriteria=()=>[f.icon,extra];await f.request('scan');
  assert.equal(reads,0);assert.equal(f.bridge.busy(),false);assert.equal(f.messages.some(m=>m.event?.type==='scan'),false);assert.deepEqual(f.swaps,[]);
});
test('switching pages prompts and Stay returns to the original page and full selection',async()=>{
  const f=fixture();f.context();await f.request('scan');const original=f.api.currentPage;
  f.api.currentPage={id:'other-page',type:'PAGE',selection:[],findAllWithCriteria:()=>[]};f.bridge.selectionChanged();
  const prompt=f.messages.findLast(m=>m.event?.type==='selection-confirmation').event;
  await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.swaps,[]);
  await f.request('selection-decision',{token:prompt.token,decision:'stay'});assert.equal(f.api.currentPage,original);assert.deepEqual(original.selection,[f.frame]);
  await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.swaps,['new']);
});
test('superseded selection decisions cannot restore a previous selection',async()=>{
  const f=fixture();f.context();await f.request('scan');const first={id:'first'},second={id:'second'};
  f.api.currentPage.selection=[first];f.bridge.selectionChanged();const token=f.messages.findLast(m=>m.event?.type==='selection-confirmation').event.token;
  f.api.currentPage.selection=[second];f.bridge.selectionChanged();await f.request('selection-decision',{token,decision:'stay'});
  assert.deepEqual(f.api.currentPage.selection,[second]);assert.deepEqual(f.swaps,[]);
});
test('a newer canvas selection supersedes an asynchronous Stay lookup',async()=>{
  const f=fixture();f.context();await f.request('scan');
  f.api.currentPage.selection=[{id:'first'}];f.bridge.selectionChanged();const token=f.messages.findLast(m=>m.event?.type==='selection-confirmation').event.token;
  const getNode=f.api.getNodeByIdAsync;let release;
  f.api.getNodeByIdAsync=async id=>{if(id==='frame')await new Promise(resolve=>{release=resolve;});return getNode(id);};
  const decision=f.request('selection-decision',{token,decision:'stay'});await new Promise(resolve=>setImmediate(resolve));
  const latest={id:'latest'};f.api.currentPage.selection=[latest];f.bridge.selectionChanged();release();await decision;
  assert.deepEqual(f.api.currentPage.selection,[latest]);assert.deepEqual(f.swaps,[]);
});
async function delayedPageReturn(f,change){
  f.context();await f.request('scan');const original=f.api.currentPage;
  f.api.currentPage={id:'away',type:'PAGE',selection:[],findAllWithCriteria:()=>[]};f.bridge.selectionChanged();
  const token=f.messages.findLast(m=>m.event?.type==='selection-confirmation').event.token;
  let release;
  f.api.setCurrentPageAsync=async page=>{f.api.currentPage=page;f.bridge.selectionChanged();await new Promise(resolve=>{release=resolve;});};
  const result=f.request('selection-decision',{token,decision:'stay'});await new Promise(resolve=>setImmediate(resolve));
  change(original);release();await result;return{original,token};
}
test('Stay preserves a newer frame chosen during page return and prompts again with a fresh token',async()=>{
  const f=fixture();let latest;
  const {original,token}=await delayedPageReturn(f,page=>{latest={id:'latest',type:'FRAME',parent:page};page.selection=[latest];f.bridge.selectionChanged();});
  assert.equal(f.api.currentPage,original);assert.deepEqual(original.selection,[latest]);assert.deepEqual(f.swaps,[]);
  const repeat=f.messages.findLast(m=>m.event?.type==='selection-confirmation').event;
  assert.notEqual(repeat.token,token);assert.equal(repeat.reason,'changed-during-restore');
  f.bridge.selectionChanged();assert.equal(f.messages.findLast(m=>m.event?.type==='selection-confirmation').event.reason,'changed-during-restore');
  await f.request('selection-decision',{token,decision:'stay'});assert.deepEqual(original.selection,[latest],'the old decision cannot overwrite the new selection');
  await f.request('selection-decision',{token:repeat.token,decision:'stay'});assert.deepEqual(original.selection,[f.frame]);
});
test('the repeated prompt can check the newer frame without replacing it automatically',async()=>{
  const f=fixture();let latest;
  await delayedPageReturn(f,page=>{const icon=Object.assign({},f.icon,{id:'latest-icon'});latest={id:'latest',type:'FRAME',name:'Latest',parent:page,findAllWithCriteria:()=>[icon]};icon.parent=latest;page.selection=[latest];f.bridge.selectionChanged();});
  const repeat=f.messages.findLast(m=>m.event?.type==='selection-confirmation').event;
  await f.request('selection-decision',{token:repeat.token,decision:'switch'});
  assert.deepEqual(f.api.currentPage.selection,[latest]);assert.deepEqual(f.messages.findLast(m=>m.event?.type==='scan').event.rows[0].ids,['latest-icon']);assert.deepEqual(f.swaps,[]);
});
test('Stay rechecks selection after page return even when the selection event has not arrived',async()=>{
  const f=fixture();let latest;
  await delayedPageReturn(f,page=>{latest={id:'latest',type:'FRAME',parent:page};page.selection=[latest];});
  assert.deepEqual(f.api.currentPage.selection,[latest]);assert.equal(f.messages.findLast(m=>m.event?.type==='selection-confirmation').event.reason,'changed-during-restore');
});
test('Stay preserves navigation to another page during return and prompts for its current selection',async()=>{
  const f=fixture();const newer={id:'newer-page',type:'PAGE',selection:[{id:'newer-frame'}]};
  await delayedPageReturn(f,()=>{f.api.currentPage=newer;f.bridge.selectionChanged();});
  assert.equal(f.api.currentPage,newer);assert.equal(newer.selection[0].id,'newer-frame');assert.equal(f.messages.findLast(m=>m.event?.type==='selection-confirmation').event.reason,'changed-during-restore');
});
test('the page-change notification from an ordinary Stay does not cause another prompt',async()=>{
  const f=fixture();const {original}=await delayedPageReturn(f,()=>{});
  assert.equal(f.api.currentPage,original);assert.deepEqual(original.selection,[f.frame]);assert.equal(f.messages.filter(m=>m.event?.type==='selection-confirmation').length,1);
  assert.equal(f.messages.findLast(m=>m.event?.type==='selection-confirmation-dismissed').event.type,'selection-confirmation-dismissed');
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
    const f=fixture();f.catalogs.default.newIcons.push({key:'manual',name:'Manual'});f.context();await f.request('scan');
    if(during==='import')f.setImports(async key=>{f.icon.parent=f.api.currentPage;return{key};});
    else {let reads=0;f.icon.getMainComponentAsync=async()=>{if(++reads===2)f.icon.parent=f.api.currentPage;return{key:'old'};};}
    await f.request('replace',{choices:[{oldKey:'old',newKey:during==='import'?'manual':'new'}]});assert.deepEqual(f.swaps,[],during);
  }
});
test('ordinary selection updates keep client choices, scope label and apply enabled',()=>{
  const f=historyClient(),before=f.client.getState();f.client.selection({valid:false});f.feed({type:'selection',count:1});
  assert.equal(f.client.getState().planStale,false);assert.equal(f.client.getState().rows,before.rows);assert.equal(f.client.getState().scopeName,'Исходный фрейм');f.client.replace();assert.equal(f.sent.at(-1).operation,'replace');
});

test('a late navigation error cannot replace the changed-selection invitation',()=>{
  const f=historyClient();f.client.focus('icon');const request=f.sent.at(-1);
  f.feed({type:'stale'});f.feed({type:'error',requestType:'go-to',text:'Selection changed'});
  f.client.accept({type:'reglyph-result',schemaVersion:p.SCHEMA,revision:request.revision,requestId:request.requestId,error:'Selection changed'});
  assert.equal(f.client.getState().status,'error');assert.equal(f.client.getState().errorCode,'SELECTION_CHANGED');assert.equal(f.client.getState().error,'');
});
test('selection confirmation decisions are serialized and dismiss when native restores selection',()=>{
  const f=historyClient();f.feed({type:'selection-confirmation',token:'one'});const before=f.sent.length;
  f.client.replace();f.client.focus('icon');assert.equal(f.sent.length,before);
  f.client.decideSelection('stay');assert.deepEqual(f.sent.at(-1).payload,{token:'one',decision:'stay'});
  f.feed({type:'selection-confirmation-dismissed'});f.settle();assert.equal(f.client.getState().selectionConfirmation,null);
  f.feed({type:'selection-confirmation',token:'two'});f.client.decideSelection('switch');f.feed({type:'selection-switch-started'});
  assert.equal(f.client.getState().status,'scanning');assert.deepEqual(f.client.getState().rows,[]);
});
test('successful large preview repairs a failed thumbnail and ignores superseded preview responses',()=>{
  const f=historyClient();f.feed({type:'preview-error',key:'new',text:'temporarily unavailable'});
  f.client.largePreview({key:'new'},'large');f.feed({type:'icon-preview',token:'large',image:'large-png',monochrome:true});
  assert.deepEqual(f.client.getState().images.get('new'),{image:'large-png',monochrome:true});assert.equal(f.client.getState().previewErrors.has('new'),false);
  f.client.largePreview({key:'manual'},'later');f.feed({type:'icon-preview',token:'large',image:'stale'});
  assert.equal(f.client.getState().images.get('new').image,'large-png');assert.equal(f.client.getState().largePreview.token,'later');
  f.client.closePreview();f.feed({type:'icon-preview',token:'later',image:'closed'});
  assert.equal(f.client.getState().largePreview,null);assert.notEqual(f.client.getState().images.get('manual')?.image,'closed');
});

test('a confirmed switch is journalled as a scan without counting Stay or adding icon counters',()=>{
  const events=[],f=historyClient(true,kind=>({finish:status=>events.push([kind,status])}));
  f.feed({type:'selection-confirmation',token:'stay'});f.client.decideSelection('stay');f.settle();assert.deepEqual(events,[]);
  f.feed({type:'selection-confirmation',token:'switch'});f.client.decideSelection('switch');f.feed({type:'selection-switch-started'});f.feed({type:'scan',rows:f.rows});f.settle();
  assert.deepEqual(events,[['reglyph-scan','completed']]);
});

test('ReGlyph statistics records scan and actual replacement; focus/previews do not add operations',()=>{
 const events=[],f=historyClient(false,kind=>({finish:status=>events.push([kind,status])}));
 f.client.start();f.feed({type:'scan',rows:f.rows,scopeName:'Original'});f.settle();
 assert.deepEqual(events,[['reglyph-scan','completed']]);
 f.client.focus('icon');f.settle();f.client.largePreview({id:'icon'},'preview');f.settle();assert.equal(events.length,1);
 f.client.replace();f.feed({type:'done',remainingRows:f.rows,replaced:0,skipped:0,failed:1,errors:['source changed']});f.settle();
 assert.deepEqual(events,[['reglyph-scan','completed'],['reglyph-replace','failed']]);
});

test('all AlertView sets and standalone components are observed as protected and cannot be replaced',async()=>{
  const detection=require('../../src/skills/reglyph/detection.json');
  const expected=['AlertNoInternet','AlertNotFound','AlertServerError','AlertNoAccessRights','AlertDefaultAction','AlertFilters','AlertDefault','AlertSearch','AlertLeaveSavePossible','AlertLeaveSaveImossible','AlertDelete'];
  const sets=detection.protectedComponentSets.filter(row=>row.scope==='alert-view'),components=detection.protectedComponents.filter(row=>row.scope==='alert-view');
  assert.equal(sets.length,14);assert.equal(components.length,8);
  for(const name of expected)assert.equal([...sets,...components].filter(row=>row.name==='AlertView (🟦) / '+name).length,2,name);
  for(const row of [...sets,...components]){
    const f=fixture(detection);f.context();
    f.frame.type='INSTANCE';f.frame.getMainComponentAsync=async()=>sets.includes(row)?{key:'owner',parent:{type:'COMPONENT_SET',key:row.key}}:{key:row.key};
    await f.request('scan');const scan=f.messages.findLast(m=>m.event?.type==='scan').event;
    assert.equal(scan.rows.length,0,row.name);assert.equal(scan.observedRows.length,1,row.name);assert.equal(scan.observedRows[0].category,'protected');
    await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.swaps,[],row.name);
  }
});
test('an icon moved into an AlertView after scanning refuses replacement',async()=>{
  const detection=require('../../src/skills/reglyph/detection.json'),f=fixture(detection);f.context();await f.request('scan');
  f.frame.type='INSTANCE';f.frame.getMainComponentAsync=async()=>({key:detection.protectedComponents.find(row=>row.scope==='alert-view').key});
  await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.swaps,[]);
});
test('verified Services header stops scanning and requires the pattern screen; an arbitrary text does not',async()=>{
  for(const verified of [true,false]){
    const f=fixture({containers:[],iconViewSets:[],serviceHeaderSets:[{key:'header-set'}]});f.context();
    const text={type:'TEXT',name:'_title',characters:'Сервисы',parent:null};
    const header={id:'header',type:'INSTANCE',parent:f.frame,getMainComponentAsync:async()=>({key:'header',parent:{type:'COMPONENT_SET',key:verified?'header-set':'unrelated'}}),findAllWithCriteria:()=>[text]};text.parent=header;
    f.frame.findAllWithCriteria=()=>[f.icon,header];await f.request('scan');
    assert.equal(f.messages.some(m=>m.event?.type==='services-pattern-required'),verified);
    assert.equal(f.messages.some(m=>m.event?.type==='scan'),!verified);assert.deepEqual(f.swaps,[]);
    if(verified){await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.swaps,[]);}
  }
});
test('replacement has its own undo boundaries and Undo invalidates its plan and audit consumers',async()=>{
  const f=fixture();f.context();await f.request('scan');await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});
  assert.deepEqual(f.undoEvents,['commit','swap','commit']);assert.equal(f.changed(),1);
  await f.request('undo');assert.deepEqual(f.undoEvents,['commit','swap','commit','undo']);assert.equal(f.changed(),2);
  assert.ok(f.messages.some(m=>m.event?.type==='undo-complete'));
  await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.swaps,['new']);
  await f.request('scan');assert.equal(f.messages.findLast(m=>m.event?.type==='scan').event.rows.length,1);
});
test('a failed swap still closes its undo batch',async()=>{
  const f=fixture();f.context();await f.request('scan');f.icon.swapComponent=()=>{f.undoEvents.push('attempt');throw Error('swap failed');};
  await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});assert.deepEqual(f.undoEvents,['commit','attempt','commit']);
  assert.equal(f.messages.findLast(m=>m.event?.type==='done').event.failed,1);
});
test('Undo resets client choices, scope, summaries and dialogs and service requests stay disabled',()=>{
  const f=historyClient();const before=f.sent.length;f.client.scenario('services');assert.equal(f.sent.length,before);
  f.client.undo();assert.equal(f.sent.at(-1).operation,'undo');f.feed({type:'stale'});f.feed({type:'undo-complete'});f.settle();
  const state=f.client.getState();assert.equal(state.status,'idle');assert.equal(state.planStale,false);assert.deepEqual(state.rows,[]);assert.deepEqual(state.observedRows,[]);assert.equal(state.scopeName,'');assert.equal(state.result,null);assert.equal(state.confirmation,null);
  f.feed({type:'services-pattern-required'});assert.equal(f.client.getState().confirmation.type,'services-pattern-required');assert.equal(f.client.getState().status,'idle');
  f.client.dismissConfirmation();assert.equal(f.client.getState().confirmation,null);
});

test('an unexpected error after a successful swap still closes the partial batch',async()=>{
  const f=fixture();f.context();
  const second=Object.assign({},f.icon,{id:'second',name:'Second',swapComponent(){throw Error('should not run');}});
  const getNode=f.api.getNodeByIdAsync;f.api.getNodeByIdAsync=async id=>id==='second'?second:getNode(id);
  f.frame.findAllWithCriteria=()=>[f.icon,second];await f.request('scan');
  Object.defineProperty(second,'name',{get(){throw Error('node unavailable');}});
  await f.request('replace',{choices:[{oldKey:'old',newKey:'new'}]});
  assert.deepEqual(f.undoEvents,['commit','swap','commit']);assert.equal(f.changed(),1);
  assert.match(f.messages.findLast(m=>m.event?.type==='error').event.text,/node unavailable/);
});
test('Undo respects platform and request revision guards and cannot run beside a scan',async()=>{
  for(const platform of ['Desktop','MobileWeb']){
    const f=fixture();f.context(platform);await f.request('undo');assert.deepEqual(f.undoEvents,[]);
  }
  const f=fixture();f.context();f.bridge.accept({type:'reglyph-request',schemaVersion:p.SCHEMA,requestId:'reglyph-stale-undo',revision:0,operation:'undo',payload:{}});assert.deepEqual(f.undoEvents,[]);
  const h=historyClient(false);h.client.start();const before=h.sent.length;h.client.undo();assert.equal(h.sent.length,before);
});

test('standalone icon checking does not depend on a Proxy compatibility callback',async()=>{
  const sent=[];let checks=0;
  const client=createReglyphClient({send:message=>sent.push(message),beforeOperation:async()=>{checks++;throw Error('Proxy offline');}});
  client.setContext({channelId:'b2b',pickerLabel:'iOS'});
  await client.start();assert.equal(checks,0);assert.equal(sent.at(-1).operation,'scan');assert.equal(client.getState().error,'');
});

test('retry applies only a failed remaining plan and retains stale/busy protections',()=>{
  for(const failure of ['partial','error']){
    const f=historyClient();
    if(failure==='partial')f.feed({type:'done',remainingRows:f.rows,replaced:0,skipped:0,failed:1,errors:['swap failed']});
    else f.feed({type:'error',requestType:'replace',text:'swap failed'});
    f.client.retryReplace();assert.equal(f.sent.at(-1).operation,'replace');assert.equal(f.client.getState().status,'replacing');
    const count=f.sent.length;f.client.retryReplace();assert.equal(f.sent.length,count,'no parallel retry');
  }
  const stale=historyClient();stale.feed({type:'done',remainingRows:stale.rows,replaced:0,skipped:0,failed:1});stale.feed({type:'stale'});const count=stale.sent.length;stale.client.retryReplace();assert.equal(stale.sent.length,count);
  const success=historyClient();success.feed({type:'done',remainingRows:[],replaced:1,skipped:0,failed:0});const sent=success.sent.length;success.client.retryReplace();assert.equal(success.sent.length,sent);
});

test('catalog reload refreshes native membership/mapping and picker search without stale cached results',async()=>{
  const f=fixture();f.catalogs.default.newIcons.push({key:'manual',name:'Manual'});f.context();
  await f.request('scan');assert.equal(f.messages.findLast(m=>m.event?.type==='scan').event.rows[0].newKey,'new');
  const saved=JSON.parse(JSON.stringify(f.catalogs.default));saved.mappings=[{oldKey:'old',newKey:'manual'}];
  await f.api.clientStorage.setAsync('apollo-reglyph-abm-v1-catalog',saved);await f.request('ready');await f.request('scan');
  assert.equal(f.messages.findLast(m=>m.event?.type==='scan').event.rows[0].newKey,'manual');
  await f.request('replace',{choices:[{oldKey:'old',newKey:'manual'}]});assert.deepEqual(f.swaps,['manual']);
  const h=historyClient(false);h.feed({type:'catalog',catalog:{scenarioId:'default',newIcons:[{key:'new',name:'New'}]}});
  assert.equal(h.client.options({oldKey:'old'},'new')[0].items[0].key,'new');
  h.feed({type:'catalog',catalog:{scenarioId:'default',newIcons:[{key:'replacement',name:'Replacement'}]}});
  assert.deepEqual(h.client.options({oldKey:'old'},'new')[0].items,[]);
  assert.equal(h.client.options({oldKey:'old'},'replacement')[0].items[0].key,'replacement');h.settle();
});
test('multiple unknown occurrences with the same source key still require unambiguous row IDs',async()=>{
  const f=fixture({containers:[],iconViewSets:[{key:'view-set',directIconProperties:['Icon']}]});f.context();
  f.frame.type='INSTANCE';f.frame.getMainComponentAsync=async()=>({key:'view',parent:{type:'COMPONENT_SET',key:'view-set'}});
  f.icon.getMainComponentAsync=async()=>({key:'unknown'});f.icon.componentPropertyReferences={mainComponent:'Icon'};
  f.icon.children=[{type:'VECTOR',width:24,height:24,children:[],fills:[],strokes:[]}];
  const second=Object.assign({},f.icon,{id:'second',swapComponent(){assert.fail('Skipped occurrence changed');}});
  const getNode=f.api.getNodeByIdAsync;f.api.getNodeByIdAsync=async id=>id==='second'?second:getNode(id);
  f.frame.findAllWithCriteria=()=>[f.icon,second];await f.request('scan');
  const rows=f.messages.findLast(m=>m.event?.type==='scan').event.rows;assert.equal(rows.length,2);
  await f.request('replace',{choices:[{oldKey:'unknown',newKey:'new'}]});assert.deepEqual(f.swaps,[]);
  await f.request('replace',{choices:rows.map((row,i)=>({rowId:row.rowId,oldKey:row.oldKey,newKey:i?'':'new'}))});assert.deepEqual(f.swaps,['new']);
});

test('background acknowledgements drain the queue without redrawing unchanged UI state',()=>{
  const f=historyClient(false);let renders=0;const unsubscribe=f.client.subscribe(()=>renders++);
  f.client.preview('uncached');const request=f.sent.at(-1);assert.equal(request.operation,'preview');
  f.feed({type:'preview',key:'uncached',image:'preview'});const before=renders;
  f.client.accept({type:'reglyph-result',schemaVersion:p.SCHEMA,revision:request.revision,requestId:request.requestId});
  assert.equal(renders,before);assert.equal(f.client.getState().images.get('uncached').image,'preview');
  f.settle();assert.equal(f.client.busy(),false);
  f.client.preview('another');const preview=f.sent.at(-1);f.client.focus('icon');const queued=renders;
  f.client.accept({type:'reglyph-result',schemaVersion:p.SCHEMA,revision:preview.revision,requestId:preview.requestId});
  assert.ok(renders>queued,'queued foreground work still notifies the UI');assert.equal(f.sent.at(-1).operation,'go-to');assert.equal(f.client.busy(),true);
  f.settle();assert.equal(f.client.busy(),false);unsubscribe();
});

test('opening the catalog does not request PNGs; a completed scan publishes prepared targets atomically',()=>{
  const f=historyClient(false);assert.equal(f.sent.some(m=>m.operation==='preview'),false);
  let ready=false;const unsubscribe=f.client.subscribe(()=>{const state=f.client.getState();if(state.status==='preview'){assert.equal(state.images.get('new').image,'prepared');ready=true;}});
  f.feed({type:'scan',rows:f.rows,targetPreviews:[{key:'new',image:'prepared',monochrome:true}],previewErrors:[{key:'manual',text:'unavailable'}]});
  assert.equal(ready,true);assert.equal(f.client.getState().previewErrors.get('manual'),'unavailable');assert.equal(f.sent.some(m=>m.operation==='preview'),false);unsubscribe();
});
test('scan prepares only distinct suggested targets and reuses their cache on a second scan',async()=>{
  const f=fixture(),imported=[];let exports=0;
  f.catalogs.default.newIcons.push({key:'unused',name:'Unused'});
  f.setImports(async key=>{imported.push(key);return{key,width:24,height:24,children:[],exportAsync:async()=>{exports++;return new Uint8Array([1]);}};});
  const second=Object.assign({},f.icon,{id:'second'});f.frame.findAllWithCriteria=()=>[f.icon,second];f.context();await f.request('ready');assert.deepEqual(imported,[]);
  await f.request('scan');const first=f.messages.findLast(m=>m.event?.type==='scan').event;
  assert.deepEqual(first.rows[0].ids,['icon','second']);assert.ok(first.rows[0].image);assert.deepEqual(first.targetPreviews.map(item=>item.key),['new']);assert.deepEqual(first.previewErrors,[]);
  assert.deepEqual(imported,['new']);assert.equal(exports,1);
  await f.request('scan');assert.deepEqual(imported,['new']);assert.equal(exports,1);assert.deepEqual(f.swaps,[]);
  await f.request('clear-preview-cache');await f.request('scan');assert.equal(exports,2);assert.deepEqual(imported,['new']);
  await f.request('flush-previews');const restored=fixture();restored.api.clientStorage=f.api.clientStorage;
  restored.setImports(async()=>{assert.fail('a persisted thumbnail should not import the component');});restored.context();await restored.request('ready');await restored.request('scan');
  assert.equal(restored.messages.findLast(m=>m.event?.type==='scan').event.targetPreviews[0].image,first.targetPreviews[0].image);
});
test('a failed target preview keeps the result rows and successful thumbnails available',async()=>{
  const f=fixture();f.catalogs.default.oldIcons.push({key:'old2',name:'Second'});f.catalogs.default.newIcons.push({key:'bad',name:'Unavailable'});f.catalogs.default.mappings.push({oldKey:'old2',newKey:'bad'});
  const second=Object.assign({},f.icon,{id:'second',getMainComponentAsync:async()=>({key:'old2'})});f.frame.findAllWithCriteria=()=>[f.icon,second];
  f.setImports(async key=>{if(key==='bad')throw Error('Preview import unavailable');return{key,children:[],exportAsync:async()=>new Uint8Array([1])};});
  f.context();await f.request('scan');const scan=f.messages.findLast(m=>m.event?.type==='scan').event;
  assert.equal(scan.rows.length,2);assert.deepEqual(scan.targetPreviews.map(item=>item.key),['new']);assert.deepEqual(scan.previewErrors,[{key:'bad',text:'Preview import unavailable'}]);assert.deepEqual(f.swaps,[]);
});
test('a failed export during scanning can recover with a fresh component on visible-preview retry',async()=>{
  const f=fixture();let imports=0;
  f.setImports(async key=>{const attempt=++imports;return{key,children:[],exportAsync:async()=>{if(attempt===1)throw Error('temporary export failure');return new Uint8Array([1]);}};});
  f.context();await f.request('scan');assert.equal(f.messages.findLast(m=>m.event?.type==='scan').event.previewErrors.length,1);
  await f.request('preview',{key:'new',refresh:true});assert.equal(imports,2);assert.ok(f.messages.findLast(m=>m.event?.type==='preview').event.image);
});
test('source and target PNGs share a maximum of four concurrent exports',async()=>{
  const f=fixture();let active=0,peak=0,exports=0;
  const exportAsync=async()=>{active++;exports++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;return new Uint8Array([1]);};
  const icons=Array.from({length:6},(_,i)=>Object.assign({},f.icon,{id:'source'+i,exportAsync,getMainComponentAsync:async()=>({key:'old'+i})}));
  Object.assign(f.catalogs.default,{oldIcons:icons.map((_,i)=>({key:'old'+i,name:'Old '+i})),newIcons:icons.map((_,i)=>({key:'new'+i,name:'New '+i})),mappings:icons.map((_,i)=>({oldKey:'old'+i,newKey:'new'+i}))});
  f.frame.findAllWithCriteria=()=>icons;f.setImports(async key=>({key,children:[],exportAsync}));f.context();await f.request('scan');
  assert.equal(exports,12);assert.ok(peak>1 && peak<=4);assert.equal(active,0);assert.equal(f.messages.findLast(m=>m.event?.type==='scan').event.targetPreviews.length,6);
});
test('selection invalidation during target preparation never publishes the old result',async()=>{
  const f=fixture();f.setImports(async key=>{f.api.currentPage.selection=[{id:'other'}];f.bridge.selectionChanged();return{key,children:[],exportAsync:async()=>new Uint8Array([1])};});
  f.context();await f.request('scan');assert.equal(f.messages.some(m=>m.event?.type==='scan'),false);assert.equal(f.bridge.busy(),false);assert.deepEqual(f.swaps,[]);
});
test('only visible picker requests remain queued and duplicate tiles retain a shared request',async()=>{
  const f=historyClient(false);f.client.preview('blocker');
  const one=f.client.watchPreview('new'),two=f.client.watchPreview('new'),hidden=f.client.watchPreview('manual');hidden();one();
  await Promise.resolve();f.settle();assert.equal(f.sent.filter(m=>m.operation==='preview' && m.payload.key==='new').length,1);assert.equal(f.sent.some(m=>m.operation==='preview' && m.payload.key==='manual'),false);two();
});
test('cancelled queued tiles do not exhaust retry attempts and a visible tile gets priority',async()=>{
  const f=historyClient(false);f.client.preview('blocker');
  for(let i=0;i<4;i++){const release=f.client.watchPreview('new');release();}
  const keep=f.client.watchPreview('manual'),show=f.client.watchPreview('new');await Promise.resolve();f.settle();
  const keys=f.sent.filter(m=>m.operation==='preview').map(m=>m.payload.key);assert.deepEqual(keys,['blocker','new','manual']);keep();show();
});
test('cache clearing reloads only selected result targets rather than the entire catalog',()=>{
  const f=historyClient(false);f.feed({type:'scan',rows:f.rows,targetPreviews:[{key:'new',image:'prepared'}]});
  f.feed({type:'preview-cache-reset'});f.settle();assert.equal(f.client.getState().previewGeneration,1);
  assert.deepEqual(f.sent.filter(m=>m.operation==='preview').map(m=>m.payload.key),['new']);
});
