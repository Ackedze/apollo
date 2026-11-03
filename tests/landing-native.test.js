const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createLandingCanvasBridge,NS}=require('../src/landing/native');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const CHAT='11111111-1111-4111-8111-111111111111';
function harness(){
 let seq=0;const nodes=new Map(),messages=[];
 function node(type='FRAME'){const n={id:'1:'+ ++seq,type,name:type,x:0,y:0,width:100,height:100,visible:true,children:[],data:new Map(),appendChild(child){if(child.parent)child.parent.children.splice(child.parent.children.indexOf(child),1);this.children.push(child);child.parent=this;},getSharedPluginData(ns,key){return this.data.get(ns+':'+key)||'';},setSharedPluginData(ns,key,value){this.data.set(ns+':'+key,value);},resize(w,h){this.width=w;this.height=h;},resizeWithoutConstraints(w,h){this.resize(w,h);}};nodes.set(n.id,n);return n;}
 const page=node('PAGE'),neighbor=node();page.appendChild(neighbor);const api={currentPage:page,fileKey:'FileKey123',createFrame:()=>{const n=node();page.appendChild(n);return n;},createSection:()=>{const n=node('SECTION');page.appendChild(n);return n;},getNodeByIdAsync:async id=>nodes.get(id)||null};
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

test('context resolves the selected section; a landing appends an owned frame and preserves existing content',async()=>{
 const h=harness(),outer=h.node('SECTION'),parent=h.node('SECTION'),content=h.node('TEXT');content.characters='User content';h.page.appendChild(outer);outer.appendChild(parent);parent.appendChild(content);h.page.selection=[content];
 const context=await h.call('context');assert.equal(context.value.fileKey,'FileKey123');assert.equal(context.value.selectedSectionId,parent.id);assert.ok(context.value.sections.some(s=>s.id===parent.id));assert.equal(context.value.sections.length,2);
 const opened=await h.call('open',{chatId:CHAT,revision:1,pageId:h.page.id,fileKey:'FileKey123',rootNodeId:null,ownerNonce:null,placement:{mode:'section',sectionId:parent.id}});assert.equal(opened.error,null);const t=opened.value.target,root=h.nodes.get(t.rootNodeId);
 assert.equal(t.parentNodeId,parent.id);assert.equal(root.parent,parent);assert.ok(parent.children.includes(content));assert.equal(content.characters,'User content');
 root.height=2000;const read=await h.observe(t);assert.equal(read.error,null);assert.ok(parent.height>=root.y+2000);content.x++;assert.equal((await h.observe(t)).error.code,'LANDING_OUTSIDE_CHANGED');h.bridge.close();
});

test('missing or restricted fileKey is reported as null; an explicit key retains native ownership guards',async()=>{
 assert.equal(require('../manifest.json').enablePrivatePluginApi,true);
 for(const restricted of [false,true]){
  const h=harness();
  if(restricted)Object.defineProperty(h.api,'fileKey',{get(){throw Error('Private API unavailable');}});else delete h.api.fileKey;
  const context=await h.call('context');assert.equal(context.error,null);assert.equal(context.value.fileKey,null);assert.equal(context.value.pageId,h.page.id);
  const opened=await h.open();assert.equal(opened.error,null);const t=opened.value.target;assert.equal(t.fileKey,'FileKey123');
  h.nodes.get(t.rootNodeId).setSharedPluginData(NS,'owner','foreign');assert.equal((await h.observe(t)).error.code,'LANDING_CANVAS_STALE');h.bridge.close();
 }
 const h=harness();assert.equal((await h.call('open',{chatId:CHAT,revision:1,pageId:h.page.id,fileKey:'OtherFile123',rootNodeId:null,ownerNonce:null})).error.code,'LANDING_CANVAS_INVALID');h.bridge.close();
});
test('new-section placement creates exactly one section/root and resumes it after reload',async()=>{
 const h=harness(),payload={chatId:CHAT,revision:1,pageId:h.page.id,fileKey:'FileKey123',rootNodeId:null,ownerNonce:null,placement:{mode:'new-section',sectionId:null}};
 const first=await h.call('open',payload),again=await h.call('open',payload);assert.equal(first.error,null);assert.deepEqual(again.value.target,first.value.target);const t=first.value.target,parent=h.nodes.get(t.parentNodeId);assert.equal(parent.type,'SECTION');assert.equal(parent.children.length,1);assert.equal(h.page.children.filter(n=>n.type==='SECTION').length,1);
 await h.call('release',{chatId:CHAT});const reopened=await h.call('open',Object.assign({},payload,{revision:2,rootNodeId:t.rootNodeId,ownerNonce:t.ownerNonce}));assert.equal(reopened.error,null);assert.equal(reopened.value.target.parentNodeId,parent.id);assert.equal(parent.children.length,1);h.bridge.close();
});
test('foreign/missing sections and external container resize are refused without deleting user or partial nodes',async()=>{
 const h=harness(),parent=h.node('SECTION');h.page.appendChild(parent);const base={chatId:CHAT,revision:1,pageId:h.page.id,fileKey:'FileKey123',rootNodeId:null,ownerNonce:null};
 assert.equal((await h.call('open',Object.assign({},base,{placement:{mode:'section',sectionId:'missing'}}))).error.code,'LANDING_SECTION_UNAVAILABLE');
 const opened=await h.call('open',Object.assign({},base,{placement:{mode:'section',sectionId:parent.id}})),t=opened.value.target;parent.width++;assert.equal((await h.observe(t)).error.code,'LANDING_CANVAS_STALE');assert.equal((await h.call('release',{chatId:CHAT})).error,null);assert.equal(h.nodes.get(t.rootNodeId).getSharedPluginData(NS,'active'),'');assert.equal(parent.children.length,1);
});

test('negotiated native evidence reads actual hierarchy, nested keys, props, modes, images and fonts',async()=>{
 const h=harness(),opened=await h.call('open',{chatId:CHAT,revision:1,pageId:h.page.id,fileKey:'FileKey123',rootNodeId:null,ownerNonce:null,evidenceVersion:1}),t=opened.value.target,root=h.nodes.get(t.rootNodeId),host=h.node('INSTANCE'),body=h.node('SLOT'),section=h.node('INSTANCE'),text=h.node('TEXT'),image=h.node('RECTANGLE');
 host.setSharedPluginData(NS,'role','host');body.setSharedPluginData(NS,'role','body');section.setSharedPluginData(NS,'section','hero');host.getMainComponentAsync=async()=>({key:'host-key'});section.getMainComponentAsync=async()=>({key:'variant-key',parent:{type:'COMPONENT_SET',key:'set-key'}});section.componentProperties={Capacity:{type:'VARIANT',value:'3'}};section.explicitVariableModes={grid:'wide'};section.resolvedVariableModes={grid:'wide'};text.characters='Confirmed copy';text.fontName={family:'Fixture',style:'Regular'};text.hasMissingFont=false;image.fills=[{type:'IMAGE',imageHash:'actual-image-hash'}];root.appendChild(host);host.appendChild(body);body.appendChild(section);section.appendChild(text);section.appendChild(image);
 const observed=await h.observe(t);assert.equal(observed.error,null);const nodes=observed.value.native.nodes;assert.equal(nodes.length,observed.value.nodeCount);assert.equal(nodes.find(n=>n.id===body.id).parentId,host.id);const actual=nodes.find(n=>n.id===section.id);assert.equal(actual.componentKey,'variant-key');assert.equal(actual.componentSetKey,'set-key');assert.equal(actual.componentProperties.Capacity.value,'3');assert.deepEqual(actual.resolvedVariableModes,{grid:'wide'});assert.equal(nodes.find(n=>n.id===image.id).imageHashes[0].imageHash,'actual-image-hash');assert.deepEqual(nodes.find(n=>n.id===text.id).fontName,text.fontName);assert.equal(nodes.find(n=>n.id===text.id).hasMissingFont,false);h.bridge.close();
});
test('legacy capture stays compatible and a lease cannot change its negotiated evidence version',async()=>{
 const h=harness(),opened=await h.open();assert.equal(Object.hasOwn(opened.value.readback,'native'),false);const changed=await h.call('open',{chatId:CHAT,revision:1,pageId:h.page.id,fileKey:'FileKey123',rootNodeId:null,ownerNonce:null,evidenceVersion:1});assert.equal(changed.error.code,'LANDING_CANVAS_STALE');h.bridge.close();
});
