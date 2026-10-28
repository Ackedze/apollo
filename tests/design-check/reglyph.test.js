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
  const frame={id:'frame',type:'FRAME',parent:page,findAllWithCriteria:()=>[icon]};icon.parent=frame;page.selection=[frame];
  const api={currentPage:page,ui:{onmessage:'original'},on:(name,callback)=>{events[name]=callback;},clientStorage:{getAsync:async k=>storage.get(k),setAsync:async(k,value)=>storage.set(k,value)},importComponentByKeyAsync:k=>imports(k),getNodeByIdAsync:async id=>id==='icon'?icon:null,base64Encode:()=>'AQ==',commitUndo(){},viewport:{scrollAndZoomIntoView(){}}};
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
  return {api,icon,bridge,catalogs,messages,swaps,context,request,changed:()=>changed,setImports:fn=>{imports=fn;}};
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
