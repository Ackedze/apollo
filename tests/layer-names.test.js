const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const {createLayerNamesBridge,collect} = require('../src/skills/layer-names/native');
const {createLayerNamesClient} = require('../src/skills/layer-names/client');
const p = require('../src/skills/layer-names/run-protocol')(require('../src/skills/layer-names/protocol'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function completed(body,plan,status='completed',error=null) {return {success:true,run:{schemaVersion:p.RUN_SCHEMA,requestId:body.requestId,runId:'00000000-0000-4000-8000-000000000001',snapshotId:body.snapshot.snapshotId,status,step:1,readCount:0,pending:null,plan:status==='completed'?plan:null,error,skill:{name:'figma-layer-name-hygiene',version:'0.2.0',sha256:'a'.repeat(64)},wire:{version:p.WIRE_VERSION,sha256:p.WIRE_SHA256}}};}

function fixture() {
  let id = 0;
  function node(type,name,parent,extra={}) {
    const n = Object.assign({id:String(++id),type,name,parent,visible:true,locked:false,removed:false,x:0,y:0,width:200,height:40,children:[],getPluginDataKeys:()=>[]},extra);
    if (parent) parent.children.push(n); return n;
  }
  const page=node('PAGE','Page'),root=node('FRAME','Order',page),form=node('FRAME','Frame 1',root);
  const title=node('TEXT','Delivery',form,{characters:'Delivery address',autoRename:true});
  const instance=node('INSTANCE','Instance',root),inside=node('FRAME','Frame 2',instance);
  node('TEXT','Caption',inside,{characters:'Existing component',autoRename:true});
  const hidden=node('FRAME','Frame hidden',root,{visible:false});node('FRAME','Hidden child',hidden);
  const component=node('COMPONENT','Library',root);node('FRAME','Definition child',component);
  const slot=node('SLOT','SLOT:body',root),asset=node('FRAME','Asset',root,{exportSettings:[{format:'PNG'}]});
  const manual=node('TEXT','_title',root,{characters:'Visible text',autoRename:false});
  const outside=node('FRAME','Outside',page),messages=[];let mutations=0;
  const api={currentPage:page,viewport:{scrollAndZoomIntoView:()=>{}},commitUndo:()=>{}};page.selection=[root,form];
  const bridge=createLayerNamesBridge({api,hash,post:m=>messages.push(m),onMutation:()=>mutations++});
  function rpc(operation,payload={}) {bridge.accept({type:'layer-names-request',schemaVersion:p.SCHEMA,requestId:'request-'+messages.length,operation,payload});return messages.at(-1);}
  const change=(target,newName,category='recommended')=>({nodeId:target.id,oldName:target.name,newName,reason:'Confirmed by content',category});
  function prepare(changes) {const snapshot=rpc('capture').result;assert.ok(snapshot);const result=rpc('register',{snapshotId:snapshot.snapshotId,plan:{changes}});assert.ok(!result.error,result.error);return snapshot;}
  return {node,root,form,title,inside,instance,hidden,component,slot,asset,manual,outside,api,bridge,rpc,change,prepare,messages,mutations:()=>mutations};
}
test('selection is deduplicated; definitions, instance children, exports and automatic text names are protected',()=>{
  const f=fixture(),snapshot=f.rpc('capture').result,ids=snapshot.nodes.map(n=>n.nodeId);
  assert.deepEqual(snapshot.rootIds,[f.root.id]);assert.ok(ids.includes(f.form.id));assert.ok(ids.includes(f.instance.id));assert.ok(ids.includes(f.manual.id));
  for(const n of [f.title,f.inside,f.hidden,f.component,f.slot,f.asset,f.outside])assert.ok(!ids.includes(n.id));
  assert.deepEqual(snapshot.nodes.find(n=>n.nodeId===f.form.id).texts,['Delivery address']);
});
test('apply writes only selected names and undo preserves geometry, text and optional names',()=>{
  const f=fixture(),before=collect(f.api,[f.root],hash).facts;
  const snapshot=f.prepare([f.change(f.form,'DeliveryForm'),f.change(f.manual,'CardTitle','optional')]);
  const result=f.rpc('apply',{snapshotId:snapshot.snapshotId,nodeIds:[f.form.id]}).result;
  assert.equal(result.complete,true);assert.equal(f.form.name,'DeliveryForm');assert.equal(f.manual.name,'_title');assert.equal(f.title.autoRename,true);assert.equal(f.mutations(),1);
  const after=collect(f.api,[f.root],hash).facts;after.find(n=>n.id===f.form.id).name='Frame 1';assert.deepEqual(after,before);
  assert.equal(f.rpc('undo').result.complete,true);assert.equal(f.form.name,'Frame 1');assert.equal(f.manual.autoRename,false);
});
for(const kind of ['title','parent','locked','name'])test('stale '+kind+' rejects whole plan before any write',()=>{
  const f=fixture(),snapshot=f.prepare([f.change(f.form,'DeliveryForm'),f.change(f.manual,'CardTitle')]);
  if(kind==='title')f.title.characters='Changed meaning';if(kind==='parent')f.form.parent=f.outside;
  if(kind==='locked')f.root.locked=true;if(kind==='name')f.manual.name='Manual edit';
  assert.match(f.rpc('apply',{snapshotId:snapshot.snapshotId,nodeIds:[f.form.id,f.manual.id]}).error,/измен|недоступ/i);
  assert.equal(f.form.name,'Frame 1');assert.equal(f.mutations(),0);
});
test('protected ancestors outside selected root stay protected; focus never replaces captured selection',()=>{
  const f=fixture();f.api.currentPage.selection=[f.inside];assert.equal(f.rpc('capture').result.nodes.length,0);
  f.api.currentPage.selection=[f.root];const snapshot=f.prepare([f.change(f.form,'DeliveryForm')]);
  f.rpc('focus',{snapshotId:snapshot.snapshotId,nodeId:f.form.id});assert.deepEqual(f.api.currentPage.selection,[f.root]);
});
test('rollback does not overwrite subsequent manual names and permits restoring original empty names',()=>{
  const f=fixture();f.form.name='';let snapshot=f.prepare([f.change(f.form,'DeliveryForm')]);
  f.rpc('apply',{snapshotId:snapshot.snapshotId,nodeIds:[f.form.id]});assert.equal(f.rpc('undo').result.complete,true);assert.equal(f.form.name,'');
  snapshot=f.prepare([f.change(f.form,'DeliveryForm')]);f.rpc('apply',{snapshotId:snapshot.snapshotId,nodeIds:[f.form.id]});
  f.form.name='Manual edit';assert.match(f.rpc('undo').error,/измен/);assert.equal(f.form.name,'Manual edit');
});
test('partial write failure is read back, reported and invalidates consumers',()=>{
  const f=fixture(),snapshot=f.prepare([f.change(f.form,'DeliveryForm'),f.change(f.manual,'CardTitle')]);
  Object.defineProperty(f.manual,'name',{get:()=> '_title',set:()=>{throw Error('Owned simulated failure');},configurable:true});
  const result=f.rpc('apply',{snapshotId:snapshot.snapshotId,nodeIds:[f.form.id,f.manual.id]}).result;
  assert.equal(result.complete,false);assert.equal(result.verified,true);assert.deepEqual(result.changes.map(c=>c.nodeId),[f.form.id]);assert.equal(result.observed.length,2);assert.equal(f.mutations(),1);
  assert.ok(f.rpc('apply',{snapshotId:snapshot.snapshotId,nodeIds:[f.manual.id]}).error);
});
test('model cannot target outside nodes, duplicate IDs or silently remove emoji',()=>{
  const f=fixture(),snapshot=f.rpc('capture').result;
  assert.equal(p.planValid({changes:[f.change(f.outside,'Other')]},snapshot),false);
  assert.equal(p.planValid({changes:[f.change(f.form,'One'),f.change(f.form,'Two')]},snapshot),false);
  f.form.name='👩🏽‍💻 Frame 1';const next=f.rpc('capture').result;
  assert.equal(p.planValid({changes:[f.change(f.form,'Form')]},next),false);
  assert.equal(p.planValid({changes:[f.change(f.form,'👩🏽‍💻 Form')]},next),true);
  assert.equal(p.planValid({changes:[f.change(f.form,'👩 Form')]},next),false);
});
test('capture refuses over-budget areas instead of claiming a complete scan',()=>{
  const f=fixture();for(let i=0;i<p.MAX_CANDIDATES;i++)f.node('FRAME','Frame '+i,f.root);
  assert.match(f.rpc('capture').error,/много слоёв/);
});
test('UI client completes native capture → agent plan → frozen preview → selected apply; optional remains unselected',async()=>{
  const f=fixture();let client;
  const emit=message=>queueMicrotask(()=>client.accept(message));
  const bridge=createLayerNamesBridge({api:f.api,hash,post:emit});
  client=createLayerNamesClient({send:m=>bridge.accept(m),request:async(url,options)=>{const body=JSON.parse(options.body);return{ok:true,json:async()=>completed(body,{changes:[f.change(f.form,'DeliveryForm'),f.change(f.manual,'CardTitle','optional')]})};}});
  await client.start();assert.equal(client.getState().status,'preview');assert.deepEqual(client.getState().selected,[f.form.id]);
  await client.apply();assert.equal(client.getState().status,'done');assert.equal(f.form.name,'DeliveryForm');assert.equal(f.manual.name,'_title');
  await client.undo();assert.equal(client.getState().status,'undone');assert.equal(f.form.name,'Frame 1');
});
test('cancelled analysis ignores a late model reply and cannot register or apply it',async()=>{
  const f=fixture();let client,release,requested=false;const operations=[];
  const bridge=createLayerNamesBridge({api:f.api,hash,post:m=>queueMicrotask(()=>client.accept(m))});
  client=createLayerNamesClient({send:m=>{operations.push(m.operation);bridge.accept(m);},request:async(url,options)=>{if(url.endsWith('/cancel'))return{ok:true,json:async()=>({success:true,run:null})};requested=true;await new Promise(resolve=>{release=resolve;});const body=JSON.parse(options.body);return{ok:true,json:async()=>completed(body,{changes:[f.change(f.form,'DeliveryForm')]})};}});
  const work=client.start();while(!requested)await new Promise(resolve=>setImmediate(resolve));client.cancel();release();await work;
  assert.equal(client.getState().status,'idle');assert.deepEqual(operations,['capture']);assert.equal(f.form.name,'Frame 1');
});
for (const transport of ['fetch','json']) test('start localizes '+transport+' transport failures without registering a plan',async()=>{
  const f=fixture(),operations=[];let client;
  const bridge=createLayerNamesBridge({api:f.api,hash,post:m=>queueMicrotask(()=>client.accept(m))});
  client=createLayerNamesClient({send:m=>{operations.push(m.operation);bridge.accept(m);},request:async()=>{
    if(transport==='fetch')throw new TypeError('Failed to fetch');
    return{ok:true,json:async()=>{throw new SyntaxError('Unexpected token <');}};
  }});
  await client.start();assert.equal(client.getState().status,'error');
  assert.match(client.getState().error,/Проверьте подключение и версию Proxy/);
  assert.doesNotMatch(client.getState().error,/Failed to fetch|Unexpected token/);
  assert.deepEqual(operations,['capture']);assert.equal(f.form.name,'Frame 1');
});

function virtualClock(t) {
  const originalSet = global.setTimeout, originalClear = global.clearTimeout, timers = new Map();
  let now = 0, sequence = 0;
  global.setTimeout = (run, delay) => { const id = ++sequence; timers.set(id,{at:now+delay,run}); return id; };
  global.clearTimeout = id => timers.delete(id);
  t.after(() => { global.setTimeout = originalSet; global.clearTimeout = originalClear; });
  return {get now(){return now;},advance(ms){
    const until = now + ms;
    while (true) {
      const next = Array.from(timers).filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].run();
    }
    now = until;
  }};
}
for (const scenario of [
  {name:'keeps a successful 250-second agent run for preview',delay:250000,status:200},
  {name:'shows a delayed agent failure instead of an area-size timeout',delay:223271,status:502,message:/Агент завершил анализ с ошибкой/},
  {name:'shows the server execution deadline',delay:300000,status:504,message:/Время выполнения анализа истекло/},
  {name:'bounds waiting after the default server wall deadline plus transport grace',delay:1000000,status:200,message:/ApolloProxyControl не ответил вовремя/,timeout:true},
]) test('analysis '+scenario.name,async t=>{
  const clock=virtualClock(t),f=fixture(),operations=[];let client,body,requested=false;
  const bridge=createLayerNamesBridge({api:f.api,hash,post:m=>queueMicrotask(()=>client.accept(m))});
  client=createLayerNamesClient({send:m=>{operations.push(m.operation);bridge.accept(m);},request:async(url,options)=>{
    if(url.endsWith('/cancel'))return{ok:true,json:async()=>({success:true,run:null})};
    if(options.signal.aborted)throw Object.assign(Error('aborted'),{name:'AbortError'});
    if(options.method==='POST'){body=JSON.parse(options.body);requested=true;return{ok:true,json:async()=>completed(body,null,'running')};}
    const done=clock.now>=scenario.delay,code=scenario.status===504?'LAYER_NAMES_DEADLINE':'CODEX_PROCESS_FAILED';
    return{ok:true,json:async()=>completed(body,{changes:[f.change(f.form,'DeliveryForm')]},!done?'running':scenario.status===200?'completed':'failed',done&&scenario.status!==200?{code,message:code}:null)};
  }});
  const work=client.start();while(!requested)await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  clock.advance(scenario.timeout?930000:scenario.delay);await work;assert.equal(f.form.name,'Frame 1');
  if(!scenario.message){assert.equal(client.getState().status,'preview');assert.deepEqual(operations,['capture','register']);}
  else{assert.equal(client.getState().status,'error');assert.match(client.getState().error,scenario.message);assert.doesNotMatch(client.getState().error,/меньш.*област/);assert.deepEqual(operations,['capture']);}
});
