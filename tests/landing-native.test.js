const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createLandingCanvasBridge,NS}=require('../src/landing/native');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const CHAT='11111111-1111-4111-8111-111111111111';
function harness(){
 let seq=0;const nodes=new Map(),messages=[];
 function node(type='FRAME'){const n={id:'1:'+ ++seq,type,name:type,x:0,y:0,width:100,height:100,visible:true,children:[],data:new Map(),appendChild(child){if(child.parent)child.parent.children.splice(child.parent.children.indexOf(child),1);this.children.push(child);child.parent=this;},getSharedPluginData(ns,key){return this.data.get(ns+':'+key)||'';},setSharedPluginData(ns,key,value){this.data.set(ns+':'+key,value);},resize(w,h){this.width=w;this.height=h;}};nodes.set(n.id,n);return n;}
 const page=node('PAGE'),neighbor=node();page.appendChild(neighbor);const api={currentPage:page,createFrame:()=>{const n=node();page.appendChild(n);return n;},getNodeByIdAsync:async id=>nodes.get(id)||null};
 const bridge=createLandingCanvasBridge({api,hash,post:m=>messages.push(m)});let request=0;
 async function call(operation,payload={}){const requestId='landing:'+ ++request;bridge.accept({type:'landing-canvas',requestId,operation,payload});for(let i=0;i<100;i++){const reply=messages.find(m=>m.requestId===requestId);if(reply)return reply;await new Promise(r=>setTimeout(r,1));}throw Error('test wait');}
 const open=(revision=1)=>call('open',{chatId:CHAT,revision,pageId:page.id,fileKey:'FileKey123',rootNodeId:null,ownerNonce:null});
 const observe=t=>call('observe',{chatId:CHAT,revision:1,rootNodeId:t.rootNodeId,ownerNonce:t.ownerNonce,leaseNonce:t.leaseNonce});
 return{node,page,neighbor,api,bridge,call,open,observe,nodes,messages};
}
test('canvas open is idempotent, reuses its tagged root after reload, and never edits neighbors',async()=>{
 const h=harness(),before=hash([h.neighbor.x,h.neighbor.y,h.neighbor.width]),first=await h.open();assert.equal(first.error,null);assert.equal(h.bridge.busy(),true);const again=await h.open();assert.deepEqual(again.value.target,first.value.target);assert.equal(h.page.children.length,2);assert.equal(hash([h.neighbor.x,h.neighbor.y,h.neighbor.width]),before);
 await h.call('release',{chatId:CHAT});assert.equal(h.bridge.busy(),false);const fresh=createLandingCanvasBridge({api:h.api,hash,post:m=>h.messages.push(m)});fresh.accept({type:'landing-canvas',requestId:'fresh',operation:'open',payload:{chatId:CHAT,revision:2,pageId:h.page.id,fileKey:'FileKey123',rootNodeId:first.value.target.rootNodeId,ownerNonce:first.value.target.ownerNonce}});for(let i=0;i<100&&!h.messages.some(m=>m.requestId==='fresh');i++)await new Promise(r=>setTimeout(r,1));const reloaded=h.messages.find(m=>m.requestId==='fresh');assert.equal(reloaded.error,null);assert.equal(reloaded.value.target.rootNodeId,first.value.target.rootNodeId);assert.equal(h.page.children.length,2);fresh.close();
});
test('independent readback records real tagged sections, keys and changing content fingerprints',async()=>{
 const h=harness(),opened=await h.open(),t=opened.value.target,root=h.nodes.get(t.rootNodeId),section=h.node('INSTANCE'),text=h.node('TEXT');section.setSharedPluginData(NS,'section','hero');section.getMainComponentAsync=async()=>({key:'published-key'});text.characters='Brief copy';section.appendChild(text);root.appendChild(section);
 const first=await h.observe(t);assert.equal(first.error,null);assert.equal(first.value.instanceCount,1);assert.equal(first.value.sections[0].componentKey,'published-key');assert.equal(first.value.sections[0].id,section.id);const fp=first.value.sections[0].fingerprint;
 text.characters='Changed copy';const second=await h.observe(t);assert.notEqual(second.value.sections[0].fingerprint,fp);assert.match(second.value.text,/Changed copy/);assert.equal(second.value.coverage,'tagged-sections-and-text');h.bridge.close();
});
test('outside mutation and ownership changes fail closed without deleting the partial root',async()=>{
 const h=harness(),opened=await h.open(),t=opened.value.target,root=h.nodes.get(t.rootNodeId);h.neighbor.x++;assert.equal((await h.observe(t)).error.code,'LANDING_OUTSIDE_CHANGED');assert.ok(h.page.children.includes(root));h.neighbor.x--;root.setSharedPluginData(NS,'owner','foreign');assert.equal((await h.observe(t)).error.code,'LANDING_CANVAS_STALE');assert.ok(h.page.children.includes(root));
});
test('Stop revokes a lease while a main-component read is pending; no late continuation',async()=>{
 const h=harness(),opened=await h.open(),t=opened.value.target,root=h.nodes.get(t.rootNodeId),section=h.node('INSTANCE');section.setSharedPluginData(NS,'section','hero');let started=false,release;section.getMainComponentAsync=()=>{started=true;return new Promise(resolve=>release=resolve);};root.appendChild(section);const pending=h.observe(t);for(let i=0;i<100&&!started;i++)await new Promise(r=>setTimeout(r,1));assert.equal(started,true);await h.call('release',{chatId:CHAT});release({key:'late'});const result=await pending;assert.equal(result.error.code,'LANDING_CANVAS_UNAVAILABLE');assert.equal(root.getSharedPluginData(NS,'active'),'');assert.equal(h.bridge.busy(),false);assert.ok(h.page.children.includes(root));
});

test('the original native failure survives the canvas response without deleting partial content',async()=>{
 const h=harness(),opened=await h.open(),t=opened.value.target,root=h.nodes.get(t.rootNodeId),section=h.node('INSTANCE');section.setSharedPluginData(NS,'section','hero');section.getMainComponentAsync=async()=>{throw Error('first native read failure');};root.appendChild(section);const response=await h.observe(t);assert.match(response.error.nativeMessage,/first native read failure/);assert.ok(h.page.children.includes(root));h.bridge.close();
});
