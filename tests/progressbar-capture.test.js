const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createProgressBarCapture}=require('../src/design-check/progressbar-capture');
const stable=value=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}':JSON.stringify(value);
const hash=value=>crypto.createHash('sha256').update(stable(value)).digest('hex');
function fixture({now}={}){
 const events=new Map(),pageEvents=new Map(),posts=[],focus=[];let selected=[],exports=0;
 const text={id:'1:3',type:'TEXT',name:'Label',visible:true,characters:'Накоплено на оборудование'};
 const instance={id:'1:2',type:'INSTANCE',name:'Progress',visible:true,variantProperties:{State:'First'},children:[text],getMainComponentAsync:async()=>({key:'1'.repeat(40),name:'State=First',parent:{type:'COMPONENT_SET',name:'ProgressBar :: Goal',key:'a'.repeat(40)}})};
 const root={id:'1:1',type:'FRAME',name:'Synthetic area',visible:true,width:640,height:400,children:[instance],exportAsync:async()=>{exports++;return Buffer.alloc(64,1);}};
 const page={id:'0:1',type:'PAGE',parent:null,on:(name,fn)=>pageEvents.set(name,fn),off:name=>pageEvents.delete(name)};
 root.parent=page;instance.parent=root;text.parent=instance;
 Object.defineProperty(page,'selection',{get:()=>selected,set:value=>{selected=value;queueMicrotask(()=>events.get('selectionchange')?.());}});selected=[root];
 const api={currentPage:page,fileKey:'synthetic-file',base64Encode:bytes=>Buffer.from(bytes).toString('base64'),on:(name,fn)=>events.set(name,fn),off:name=>events.delete(name),viewport:{scrollAndZoomIntoView:nodes=>focus.push(nodes.map(n=>n.id))}};
 const bridge=createProgressBarCapture({api,hash,post:value=>posts.push(value),now});return{bridge,api,page,root,text,instance,events,pageEvents,posts,focus,exports:()=>exports};
}
test('pilot captures typed native identity, variant, full visible text and one real export; fingerprint binds the immutable payload',async()=>{
 const f=fixture(),captured=await f.bridge.capture('capture:1');assert.equal(f.exports(),1);assert.equal(captured.complete,true);assert.equal(captured.nodes[1].component.key,'1'.repeat(40));assert.equal(captured.nodes[1].component.setKey,'a'.repeat(40));assert.equal(captured.nodes[1].component.variants.State,'First');assert.equal(captured.nodes[2].text,f.text.characters);assert.equal(captured.screenshot.nodeId,f.root.id);
 const without=Object.assign({},captured);delete without.fingerprint;assert.equal(hash(without),captured.fingerprint);assert.equal((await f.bridge.verify(captured.captureId)).capture,captured);
});
test('cold published identity reads fit the capture budget; exhausting the overall budget still refuses before PNG',async()=>{
 let time=0,reads=0;const f=fixture({now:()=>time}),main=f.instance.getMainComponentAsync;
 f.instance.getMainComponentAsync=async()=>{if(!reads++)time+=9600;return main();};assert.equal((await f.bridge.capture('capture:cold')).complete,true);assert.equal(f.exports(),1);
 const g=fixture({now:()=>time}),original=g.instance.getMainComponentAsync;g.instance.getMainComponentAsync=async()=>{time+=26000;return original();};await assert.rejects(g.bridge.capture('capture:expired'),/CAPTURE_STALE/);assert.equal(g.exports(),0);
});
test('edits during export or later native verification refuse the capture without any model transport',async()=>{
 const f=fixture();f.root.exportAsync=async()=>{f.text.characters='Changed during export';return Buffer.alloc(64);};await assert.rejects(f.bridge.capture('capture:1'),/CAPTURE_STALE/);
 const g=fixture(),capture=await g.bridge.capture('capture:2');g.text.characters='Changed before paid request';await assert.rejects(g.bridge.verify(capture.captureId),/CAPTURE_STALE/);
});
test('unreadable native identity, unreadable text and bounded traversal stay incomplete before PNG/model work',async()=>{
 const f=fixture();f.instance.getMainComponentAsync=async()=>null;await assert.rejects(f.bridge.capture('capture:1'),/IDENTITY_UNAVAILABLE/);assert.equal(f.exports(),0);
 const g=fixture();Object.defineProperty(g.text,'characters',{get(){throw Error('unreadable');}});await assert.rejects(g.bridge.capture('capture:2'));assert.equal(g.exports(),0);
 const h=fixture();h.root.children=Array.from({length:301},(_,i)=>({id:'1:'+ (i+10),type:'TEXT',name:'Synthetic',visible:true,characters:'text'}));await assert.rejects(h.bridge.capture('capture:3'),/CAPTURE_INCOMPLETE/);assert.equal(h.exports(),0);
});
test('page/node/selection changes invalidate capture; hidden descendants are explicitly excluded',async()=>{
 const f=fixture();f.bridge.start();f.root.children.push({id:'1:9',type:'TEXT',visible:false,name:'Hidden',characters:'Not captured'});const c=await f.bridge.capture('capture:1');assert.equal(c.excludedHidden,1);assert.equal(c.nodes.some(n=>n.id==='1:9'),false);
 f.pageEvents.get('nodechange')({});assert.ok(f.posts.some(p=>p.type==='progressbar-invalidated'&&p.captureId===c.captureId));await assert.rejects(f.bridge.verify(c.captureId),/CAPTURE_STALE/);f.bridge.close();
 const g=fixture(),d=await g.bridge.capture('capture:2');g.api.currentPage={id:'0:2',selection:[g.root]};await assert.rejects(g.bridge.verify(d.captureId),/CAPTURE_STALE/);
});
test('node focus is restricted to registered captured nodes and handles the asynchronous native selection event',async()=>{
 const f=fixture();f.bridge.start();const c=await f.bridge.capture('capture:1');
 const send=nodeId=>f.bridge.accept({type:'progressbar-native-request',requestId:'focus:'+nodeId,operation:'focus',captureId:c.captureId,nodeId});
 send('9:9');await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.posts.at(-1).error,'PROGRESSBAR_TARGET_UNAVAILABLE');assert.equal(f.focus.length,0);
 send('1:2');await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.posts.at(-1).result,true);assert.deepEqual(f.focus,[['1:2']]);assert.equal((await f.bridge.verify(c.captureId,false)).capture,c);
 f.bridge.close();
});
test('foreign native messages and extra client file paths are rejected',async()=>{
 const f=fixture();assert.equal(f.bridge.accept({type:'other'}),false);f.bridge.accept({type:'progressbar-native-request',requestId:'capture:1',operation:'capture',captureId:null,nodeId:null,path:'/private/file'});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.posts[0].error,'PROGRESSBAR_REQUEST_INVALID');assert.equal(f.exports(),0);
});
test('typed sibling edits preserve the selected capture, including while its PNG is exported',async()=>{
 const f=fixture(),sibling={id:'9:9',type:'FRAME',name:'Other canvas',parent:f.page};f.bridge.start();
 const notify=()=>f.pageEvents.get('nodechange')({nodeChanges:[{type:'PROPERTY_CHANGE',id:sibling.id,node:sibling,properties:['name']}]});
 const c=await f.bridge.capture('capture:sibling');sibling.name='Renamed elsewhere';notify();assert.equal((await f.bridge.verify(c.captureId)).capture,c);assert.equal(f.posts.some(p=>p.type==='progressbar-invalidated'),false);
 f.pageEvents.get('nodechange')({nodeChanges:[{type:'DELETE',id:sibling.id,node:{id:sibling.id,type:'FRAME',removed:true}}]});assert.equal((await f.bridge.verify(c.captureId)).capture,c);
 const exportPng=f.root.exportAsync;f.root.exportAsync=async()=>{notify();return exportPng();};assert.equal((await f.bridge.capture('capture:png-sibling')).complete,true);f.bridge.close();
});
test('relevant edits, removal, movement, insertion and influencing ancestor changes still invalidate',async()=>{
 for(const kind of ['edit','delete','move','insert','ancestor','ancestor-delete']){
  const f=fixture(),ancestor={id:'0:2',type:'FRAME',parent:f.page};f.root.parent=ancestor;f.bridge.start();const c=await f.bridge.capture('capture:'+kind);
  let node=f.text,type='PROPERTY_CHANGE',properties=['characters'];
  if(kind==='edit')f.text.characters='Changed';
  if(kind==='delete'){node={id:f.text.id,type:'TEXT',removed:true};type='DELETE';}
  if(kind==='move'){f.text.parent=f.page;properties=['parent'];}
  if(kind==='insert'){node={id:'1:10',type:'TEXT',parent:f.instance};type='CREATE';}
  if(kind==='ancestor'){node=ancestor;properties=['opacity'];}
  if(kind==='ancestor-delete'){node={id:ancestor.id,type:'FRAME',removed:true};type='DELETE';}
  f.pageEvents.get('nodechange')({nodeChanges:[{type,id:node.id,node,...(type==='PROPERTY_CHANGE'?{properties}:{})}]});
  assert.ok(f.posts.some(p=>p.type==='progressbar-invalidated'),kind);await assert.rejects(f.bridge.verify(c.captureId),/CAPTURE_STALE/,kind);f.bridge.close();
 }
});
test('visual edits during export and unclassifiable events remain conservative refusals',async()=>{
 const f=fixture();f.bridge.start();f.root.exportAsync=async()=>{f.instance.opacity=0;f.pageEvents.get('nodechange')({nodeChanges:[{type:'PROPERTY_CHANGE',id:f.instance.id,node:f.instance,properties:['opacity']}]});return Buffer.alloc(64);};await assert.rejects(f.bridge.capture('capture:png-edit'),/CAPTURE_STALE/);f.bridge.close();
 for(const event of [{},{nodeChanges:[{type:'OTHER',id:'9:9'}]},{nodeChanges:[{type:'PROPERTY_CHANGE',id:'9:9',node:{id:'9:9',type:'FRAME'},properties:['name']}]}]){
  const g=fixture();g.bridge.start();const c=await g.bridge.capture('capture:unknown');g.pageEvents.get('nodechange')(event);await assert.rejects(g.bridge.verify(c.captureId),/CAPTURE_STALE/);g.bridge.close();
 }
 const h=fixture();h.bridge.start();h.root.exportAsync=async()=>{h.pageEvents.get('nodechange')({nodeChanges:[{type:'DELETE',id:'9:9',node:{id:'9:9',type:'FRAME',removed:true}}]});return Buffer.alloc(64);};await assert.rejects(h.bridge.capture('capture:inflight-removal'),/CAPTURE_STALE/);h.bridge.close();
});
