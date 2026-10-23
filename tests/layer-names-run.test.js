const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const source=process.env.APOLLO_SKILLS_TEST_ROOT || path.resolve(__dirname,'..');
const {createLayerNamesBridge}=require(path.join(source,'src/skills/layer-names/native'));
const {createLayerNamesClient}=require(path.join(source,'src/skills/layer-names/client'));
const p=require(path.join(source,'src/skills/layer-names/run-protocol'))(require(path.join(source,'src/skills/layer-names/protocol')));
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture(){
 const page={id:'page',type:'PAGE',selection:[]},root={id:'root',type:'FRAME',name:'Order',parent:page,children:[],visible:true};
 const form={id:'form',type:'FRAME',name:'Frame 1',parent:root,children:[],visible:true,locked:false,x:10,y:20,width:200,height:60,layoutMode:'VERTICAL'};
 const text={id:'text',type:'TEXT',name:'Heading',characters:'Адрес доставки',autoRename:true,parent:form,children:[],visible:true};
 const hidden={id:'hidden',type:'FRAME',name:'Secret',parent:form,children:[],visible:false};
 form.children=[text,hidden];root.children=[form];page.children=[root];page.selection=[root];let last,client;const operations=[];
 const bridge=createLayerNamesBridge({api:{currentPage:page,viewport:{scrollAndZoomIntoView(){}},commitUndo(){}},hash,post:m=>{last=m;if(client)queueMicrotask(()=>client.accept(m));}});
 const send=m=>{operations.push(m.operation);bridge.accept(m);};
 const rpc=(operation,payload={})=>{send({type:'layer-names-request',schemaVersion:p.SCHEMA,requestId:'r'+operations.length,operation,payload});return last;};
 const change={nodeId:'form',oldName:'Frame 1',newName:'Адрес доставки',reason:'Внутри находится заголовок «Адрес доставки».',category:'recommended'};
 const makeClient=request=>{client=createLayerNamesClient({send,request});return client;};
 return {page,root,form,text,hidden,rpc,change,makeClient,operations};
}
function run(body,status='completed',overrides={}){return Object.assign({schemaVersion:p.RUN_SCHEMA,requestId:body.requestId,runId:'00000000-0000-4000-8000-000000000001',snapshotId:body.snapshot.snapshotId,status,step:1,readCount:0,pending:null,plan:status==='completed'?{changes:[]}:null,error:null,skill:{name:'figma-layer-name-hygiene',version:'0.2.0',sha256:'a'.repeat(64)},wire:{version:p.WIRE_VERSION,sha256:p.WIRE_SHA256}},overrides);}
const response=value=>({ok:true,status:200,json:async()=>({success:true,run:value})});
test('readonly context is scoped, frozen and supplies layout/child composition without hidden evidence',()=>{
 const f=fixture(),s=f.rpc('capture').result,context=f.rpc('read',{snapshotId:s.snapshotId,nodeIds:['form']}).result;
 assert.ok(context,'Native bridge must expose bounded readonly naming context');assert.equal(p.contextValid(context,s,['form']),true);
 assert.equal(context.nodes[0].layoutMode,'VERTICAL');assert.deepEqual(context.nodes[0].geometry,[10,20,200,60]);
 assert.deepEqual(context.nodes[0].childTypes,[{type:'TEXT',count:1}]);assert.deepEqual(context.nodes[0].texts,['Адрес доставки']);assert.equal(f.form.name,'Frame 1');
 for(const ids of [['outside'],['hidden'],['form','form'],Array(25).fill('form')])assert.match(f.rpc('read',{snapshotId:s.snapshotId,nodeIds:ids}).error,/област/);
 assert.equal(p.contextValid({snapshotId:s.snapshotId,nodes:[null]},s,['form']),false);
});
test('context refuses changed content or selection before returning facts',()=>{
 for(const kind of ['content','selection']){
  const f=fixture(),s=f.rpc('capture').result;
  if(kind==='content')f.text.characters='Изменённый смысл';else f.page.selection=[f.form];
  assert.match(f.rpc('read',{snapshotId:s.snapshotId,nodeIds:['form']}).error,/измен/);assert.equal(f.form.name,'Frame 1');
 }
});
test('client executes overview → requested native context → correlated plan → guarded apply/undo',async()=>{
 const f=fixture();let ticket,contextCalls=0;
 const client=f.makeClient(async(url,options)=>{
  const b=options.body&&JSON.parse(options.body);
  if(url.endsWith('/runs')){assert.equal(p.contextValid(b.context,b.snapshot,['root','form']),true);ticket=run(b,'awaiting-context',{pending:{callId:'read-1',nodeIds:['form']}});return response(ticket);}
  assert.ok(url.endsWith('/context'));contextCalls++;assert.equal(b.callId,'read-1');assert.deepEqual(b.context.nodes[0].texts,['Адрес доставки']);
  return response(Object.assign({},ticket,{status:'completed',step:2,readCount:1,pending:null,plan:{changes:[f.change]}}));
 });
 const states=[];client.subscribe(()=>states.push(client.getState().status));await client.start();
 assert.equal(contextCalls,1);assert.ok(states.includes('reading-context'));assert.equal(client.getState().status,'preview');assert.equal(client.getState().run.readCount,1);
 assert.deepEqual(f.operations,['capture','read','read','register']);await client.apply();assert.equal(f.form.name,'Адрес доставки');await client.undo();assert.equal(f.form.name,'Frame 1');
});
test('cancel during a context response ignores a late plan and requests server cancellation',async()=>{
 const f=fixture();let ticket,release,entered=false,cancelled=0;
 const client=f.makeClient(async(url,options)=>{
  if(url.endsWith('/cancel')){cancelled++;return response(null);}
  const b=JSON.parse(options.body);
  if(url.endsWith('/runs')){ticket=run(b,'awaiting-context',{pending:{callId:'read-1',nodeIds:['form']}});return response(ticket);}
  entered=true;await new Promise(resolve=>{release=resolve;});return response(Object.assign({},ticket,{status:'completed',pending:null,plan:{changes:[f.change]}}));
 });
 const work=client.start();while(!entered)await new Promise(resolve=>setImmediate(resolve));await client.cancel();release();await work;
 assert.ok(cancelled>=1);assert.equal(client.getState().status,'idle');assert.deepEqual(f.operations,['capture','read','read']);assert.equal(f.form.name,'Frame 1');
});
test('selection changes stop a pending run without registering its plan',async()=>{
 const f=fixture();let created=false,cancelled=0;
 const client=f.makeClient(async(url,options)=>{
  if(url.endsWith('/cancel')){cancelled++;return response(null);}
  const b=JSON.parse(options.body);created=true;return response(run(b,'running'));
 });
 client.selection({pageId:'page',id:'root',valid:true});const work=client.start();while(!created)await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setImmediate(resolve));client.selection({pageId:'page',id:'form',valid:true});await work;
 assert.equal(client.getState().status,'error');assert.match(client.getState().error,/Выделение изменилось/);assert.ok(cancelled);assert.deepEqual(f.operations,['capture','read']);
});
test('upstream connection failures are distinguished from execution deadlines and retain progress',async()=>{
 for(const [code,message] of [['LAYER_NAMES_CONNECTION_FAILED',/установить соединение/],['LAYER_NAMES_DEADLINE',/Время выполнения/]]){
  const f=fixture(),client=f.makeClient(async(url,options)=>url.endsWith('/cancel')?response(null):response(run(JSON.parse(options.body),'failed',{readCount:1,error:{code,message:code}})));
  await client.start();assert.equal(client.getState().status,'error');assert.match(client.getState().error,message);assert.equal(client.getState().run.readCount,1);assert.deepEqual(f.operations,['capture','read']);
 }
});
test('foreign run identity cannot trigger additional native reads or registration',async()=>{
 const f=fixture(),client=f.makeClient(async(url,options)=>response(run(JSON.parse(options.body),'awaiting-context',{requestId:'foreign',pending:{callId:'read',nodeIds:['form']}})));
 await client.start();assert.equal(client.getState().status,'error');assert.deepEqual(f.operations,['capture','read']);
});
