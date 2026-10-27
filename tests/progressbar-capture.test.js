const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createProgressBarCapture}=require('../src/design-check/progressbar-capture');
const stable=value=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}':JSON.stringify(value);
const hash=value=>crypto.createHash('sha256').update(stable(value)).digest('hex');
function fixture({now}={}){
 const events=new Map(),pageEvents=new Map(),posts=[],focus=[];let selected=[],exports=0;
 const text={id:'1:3',type:'TEXT',name:'Label',visible:true,characters:'Накоплено на оборудование'};
 const instance={id:'1:2',type:'INSTANCE',name:'Progress',visible:true,variantProperties:{State:'First'},children:[text],getMainComponentAsync:async()=>({key:'1'.repeat(40),name:'State=First',parent:{type:'COMPONENT_SET',name:'ProgressBar :: Goal',key:'a'.repeat(40)}})};
 const root={id:'1:1',type:'FRAME',name:'Synthetic area',visible:true,width:640,height:400,children:[instance],exportAsync:async()=>{exports++;return Buffer.alloc(64,1);}};
 const page={id:'0:1',on:(name,fn)=>pageEvents.set(name,fn),off:name=>pageEvents.delete(name)};
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
