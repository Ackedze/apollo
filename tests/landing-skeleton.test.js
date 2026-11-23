'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const plan=require('../src/landing/native-plan'),{createNativeExecutor,pin}=require('../src/landing/native-executor');
const hash=v=>crypto.createHash('sha256').update(plan.stable(v)).digest('hex'),copy=v=>JSON.parse(JSON.stringify(v));
const KEY='a'.repeat(40),CC='b'.repeat(40),SET='c'.repeat(40),VARIANT='d'.repeat(40),NS='apollolanding';
function harness(){
 let seq=0,active=true;const nodeMap=new Map(),loaded=[],created=[];
 const node=(type,name=type)=>{
  const values=new Map(),n={id:'n:'+ ++seq,type,name,x:0,y:0,width:100,height:20,visible:true,children:[],parent:null,removed:false,fills:[],boundVariables:{},explicitVariableModes:{},resolvedVariableModes:{},getSharedPluginData:(ns,key)=>values.get(ns+':'+key)||'',setSharedPluginData:(ns,key,v)=>values.set(ns+':'+key,v),resize(w,h){this.width=w;this.height=h;},appendChild(c){this.insertChild(this.children.length,c);},insertChild(i,c){if(c.parent)c.parent.children.splice(c.parent.children.indexOf(c),1);c.parent=this;this.children.splice(i,0,c);},remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;this.removed=true;},findAllWithCriteria({types}){return descendants(this).slice(1).filter(n=>types.includes(n.type));},getStyledTextSegments(){return this.type==='TEXT'?[{fontName:this.fontName}]:[];},getMainComponentAsync:async()=>n.mainComponent||null,setProperties(props){for(const [k,v]of Object.entries(props)){assert(this.componentProperties[k],'Unknown property');this.componentProperties[k].value=v;}},setBoundVariable(field,v){this.boundVariables[field]={type:'VARIABLE_ALIAS',id:v.id};},setExplicitVariableModeForCollection(c,m){this.explicitVariableModes[c.id]=m;this.resolvedVariableModes[c.id]=m;}};
  if(type==='TEXT'){n.characters='Default';n.fontName={family:'Fixture',style:'Regular'};n.hasMissingFont=false;delete n.children;}
  nodeMap.set(n.id,n);return n;
 };
 const descendants=n=>[n,...Array.from(n.children||[]).flatMap(descendants)];
 const page=node('PAGE'),library=node('PAGE'),root=node('FRAME','Owned');page.appendChild(root);root.setSharedPluginData(NS,'owner','owner');
 const clone=(source,parent)=>{
  const n=node(source.type==='COMPONENT'?'INSTANCE':source.type,source.name);for(const key of ['width','height','characters','fontName','hasMissingFont','boundVariables','explicitVariableModes','resolvedVariableModes','variantProperties','componentProperties'])if(source[key]!==undefined)n[key]=copy(source[key]);
  if(n.type==='INSTANCE'){
   n.mainComponent=source.type==='COMPONENT'?source:source.mainComponent;
   n.componentProperties=Object.fromEntries(Object.entries(n.mainComponent.parent?.type==='COMPONENT_SET'?n.mainComponent.parent.componentPropertyDefinitions:n.mainComponent.componentPropertyDefinitions||{}).map(([name,p])=>[name,{type:p.type,value:n.mainComponent.variantProperties?.[name]??p.defaultValue}]));
  }
  if(parent)parent.appendChild(n);for(const c of source.children||[])clone(c,n);return n;
 };
 const component=(key,name)=>{const c=node('COMPONENT',name);c.key=key;c.explicitVariableModes={};c.resolvedVariableModes={};c.componentPropertyDefinitions={};library.appendChild(c);c.createInstance=()=>{const n=clone(c);created.push(n.id);return n;};return c;};
 const button=component(KEY,'Button');button.componentPropertyDefinitions={'Enabled#1:0':{type:'BOOLEAN',defaultValue:false}};button.appendChild(node('TEXT','Label'));
 const corporate=component(CC,'Container'),slot=node('SLOT','Body'),payload=node('FRAME','SwapMe');corporate.appendChild(slot);slot.appendChild(payload);payload.appendChild(node('TEXT','Content'));
 const set=node('COMPONENT_SET','Variant family');set.key=SET;set.componentPropertyDefinitions={View:{type:'VARIANT',defaultValue:'Right',variantOptions:['Right']}};library.appendChild(set);const variant=component(VARIANT,'View=Right');variant.variantProperties={View:'Right'};set.appendChild(variant);set.defaultVariant=variant;
 const api={currentPage:page,fileKey:'FixtureFile',skipInvisibleInstanceChildren:false,getNodeByIdAsync:async id=>nodeMap.get(id)||null,createFrame:()=>node('FRAME'),importComponentByKeyAsync:async key=>{const c=[button,corporate,variant].find(c=>c.key===key);if(!c)throw Error('Missing key');return c;},importComponentSetByKeyAsync:async key=>{assert.equal(key,SET);return set;},loadFontAsync:async font=>loaded.push(font),variables:{getVariableCollectionByIdAsync:async()=>null,getVariableByIdAsync:async()=>null,importVariableByKeyAsync:async()=>{throw Error('Unexpected variable');}}};
 const guard=()=>{if(!active)throw Object.assign(Error('LANDING_CANCELLED'),{code:'LANDING_CANCELLED'});};
 const capture=async()=>{
  const rows=[],sections=[];const visit=(n,sectionId=null)=>{
   sectionId=n.getSharedPluginData(NS,'section')||sectionId;
   const r={id:n.id,parentId:n.parent?.id,type:n.type,name:n.name,role:n.getSharedPluginData(NS,'role'),nativeKey:n.getSharedPluginData(NS,'native-key'),sectionId};
   for(const key of ['x','y','visible','boundVariables','explicitVariableModes','resolvedVariableModes','characters','fontName','hasMissingFont',...Object.keys(plan.fields)])if(n[key]!==undefined)r[key]=copy(n[key]);
   if(n.type==='INSTANCE'){r.componentKey=n.mainComponent.key;r.componentSetKey=n.mainComponent.parent?.type==='COMPONENT_SET'?n.mainComponent.parent.key:null;r.componentProperties=copy(n.componentProperties);r.componentSwapKeys=Object.fromEntries(Object.entries(n.componentProperties).filter(([,p])=>p.type==='INSTANCE_SWAP').map(([name,p])=>[name,nodeMap.get(p.value)?.key||null]));}
   rows.push(r);if(n.getSharedPluginData(NS,'section'))sections.push({id:n.id,sectionId,fingerprint:hash(r)});for(const c of n.children||[])visit(c,sectionId);
  };visit(root);
  return {rootNodeId:root.id,pageId:page.id,ownerNonce:'owner',leaseNonce:'lease',outsideHash:hash([]),nodeCount:rows.length,instanceCount:rows.filter(n=>n.type==='INSTANCE').length,sections,text:rows.filter(n=>n.type==='TEXT').map(n=>n.characters).join('\n'),coverage:'tagged-sections-and-text',native:{schemaVersion:'apollo.landing-native.v2',nodes:rows,modeDefaults:{},collections:{},variables:{}}};
 };
 const executor=createNativeExecutor({api,hash,guard,capture,root});
 const run=async(plan,stage,decision,extra={})=>{const request={operationId:crypto.randomUUID(),stage,sectionId:stage==='structure'?'hero':null,plan,decision,planHash:hash(plan),beforeHash:hash(pin(await capture())),mountNodeId:root.id,replacement:null,expectedSection:null,order:['hero'],...extra};return {request,result:await executor.execute(request)};};
 return {api,node,page,root,button,corporate,created,loaded,capture,executor,run,stop:()=>{active=false;},descendants};
}
const tree=nodes=>({schemaVersion:plan.SCHEMA,rootId:nodes[0].id,mountId:null,rootLayout:{},nodes});
test('generic vertical and horizontal layouts contain published instances and bind actual typed props/IDs',async()=>{
 const h=harness(),p=tree([{id:'column',parent:'$mount',kind:'layout',layout:{fields:{layoutMode:'VERTICAL',itemSpacing:24}}},{id:'row',parent:'column',kind:'layout',layout:{fields:{layoutMode:'HORIZONTAL',itemSpacing:16}}},{id:'first',parent:'row',kind:'instance',key:KEY,importType:'COMPONENT',props:{Enabled:true}},{id:'second',parent:'row',kind:'instance',key:SET,importType:'COMPONENT_SET',props:{View:'Right'}}]);
 const {result}=await h.run(p,'structure',{root:{type:'FRAME',componentKey:null},props:{}});assert.equal(result.issue,null);assert.equal(result.bindings.length,4);assert.equal(h.created.length,2);assert(h.loaded.length>0);plan.confirm(p,result.bindings,result.readback,'structure',h.root.id);
 const row=result.readback.native.nodes.find(n=>n.nativeKey==='row');assert.equal(row.layoutMode,'HORIZONTAL');assert.deepEqual(result.readback.native.nodes.filter(n=>n.parentId===row.id).map(n=>n.nativeKey),['first','second']);assert.equal(result.readback.native.nodes.find(n=>n.nativeKey==='first').componentProperties['Enabled#1:0'].value,true);
});
test('native API mismatch and ambiguous slot selection return observed facts before any scene creation',async()=>{
 for(const selector of [false,true]){
  const h=harness(),nodes=selector?[{id:'instance',parent:'$mount',kind:'instance',key:CC,importType:'COMPONENT'},{id:'slot',parent:'instance',kind:'slot',selector:[{type:'SLOT',name:'Missing'}]}]:[{id:'instance',parent:'$mount',kind:'instance',key:KEY,importType:'COMPONENT',props:{ContentPreset:'List'}}],p=tree(nodes),before=await h.capture();
  const {result}=await h.run(p,'structure',{root:{type:'INSTANCE',componentKey:selector?CC:KEY},props:selector?{}:{ContentPreset:'List'}});assert.equal(result.issue.code,'LANDING_NATIVE_API_BINDING_REQUIRED');assert.deepEqual(await h.capture(),before);assert.equal(h.created.length,0);
 }
});
test('published swap keys are imported and passed to setProperties as native IDs with independent key readback',async()=>{
 const h=harness();h.button.componentPropertyDefinitions['Icon#2:0']={type:'INSTANCE_SWAP',defaultValue:h.corporate.id};const p=tree([{id:'button',parent:'$mount',kind:'instance',key:KEY,importType:'COMPONENT',props:{Icon:CC}}]),{result}=await h.run(p,'structure',{root:{type:'INSTANCE',componentKey:KEY},props:{Icon:CC}});
 assert.equal(result.issue,null);const node=result.readback.native.nodes.find(n=>n.nativeKey==='button');assert.equal(node.componentProperties['Icon#2:0'].value,h.corporate.id);assert.equal(node.componentSwapKeys['Icon#2:0'],CC);plan.confirm(p,result.bindings,result.readback,'structure',h.root.id);
});
test('source-derived container/Body replacement uses the exact pristine guard and retains root/slot bindings',async()=>{
 const h=harness(),foundation={schemaVersion:plan.SCHEMA,rootId:'host',mountId:'body',rootLayout:{},nodes:[{id:'host',parent:'$root',kind:'instance',key:CC,importType:'COMPONENT',role:'host'},{id:'body',parent:'host',kind:'slot',selector:[{type:'SLOT',name:'Body'}],role:'body'}]},decision={container:{role:'host',type:'INSTANCE',componentKey:CC},mount:{role:'body',type:'SLOT',componentKey:null}};
 const first=await h.run(foundation,'foundation',decision),nodes=first.result.readback.native.nodes,host=nodes.find(n=>n.role==='host'),body=nodes.find(n=>n.role==='body'),defaults=nodes.filter(n=>n.parentId===body.id||n.type==='TEXT');
 const p=tree([{id:'button',parent:'$mount',kind:'instance',key:KEY,importType:'COMPONENT',props:{}}]),replacement={containerId:host.id,mountId:body.id,nodes:defaults,consumed:false};
 const next=await h.run(p,'structure',{root:{type:'INSTANCE',componentKey:KEY},props:{}},{mountNodeId:body.id,replacement,containerRole:'host'});
 assert.equal(next.result.issue,null);const observed=next.result.readback.native.nodes;assert(observed.some(n=>n.id===host.id));assert(observed.some(n=>n.id===body.id));assert(!observed.some(n=>n.name==='SwapMe'));assert.equal(next.result.readback.sections.length,1);
});
test('a changed default payload refuses consumption and preserves the appended block for recovery',async()=>{
 const h=harness(),foundation={schemaVersion:plan.SCHEMA,rootId:'host',mountId:'body',rootLayout:{},nodes:[{id:'host',parent:'$root',kind:'instance',key:CC,importType:'COMPONENT',role:'host'},{id:'body',parent:'host',kind:'slot',selector:[{type:'SLOT',name:'Body'}],role:'body'}]},d={container:{role:'host',type:'INSTANCE',componentKey:CC},mount:{role:'body',type:'SLOT',componentKey:null}};
 const first=await h.run(foundation,'foundation',d),nodes=first.result.readback.native.nodes,body=nodes.find(n=>n.role==='body'),host=nodes.find(n=>n.role==='host'),payload=h.descendants(h.root).find(n=>n.name==='SwapMe');payload.children[0].characters='User change';
 const p=tree([{id:'button',parent:'$mount',kind:'instance',key:KEY,importType:'COMPONENT',props:{}}]);
 await assert.rejects(h.run(p,'structure',{root:{type:'INSTANCE',componentKey:KEY},props:{}},{mountNodeId:body.id,containerRole:'host',replacement:{containerId:host.id,mountId:body.id,nodes,consumed:false}}),/LANDING_SLOT_REPLACEMENT_UNCONFIRMED/);assert(!payload.removed);assert(h.descendants(h.root).some(n=>n.getSharedPluginData(NS,'section')==='hero'));
});
test('repeated completed operation returns the same IDs; a changed body under the same operation is refused',async()=>{
 const h=harness(),p=tree([{id:'button',parent:'$mount',kind:'instance',key:KEY,importType:'COMPONENT',props:{}}]),{request,result}=await h.run(p,'structure',{root:{type:'INSTANCE',componentKey:KEY},props:{}}),count=h.created.length;
 const repeated=await h.executor.execute(request);assert.deepEqual(repeated.bindings,result.bindings);assert.equal(h.created.length,count);const altered=copy(request);altered.plan.nodes[0].props={Enabled:true};altered.planHash=hash(altered.plan);altered.decision.props={Enabled:true};await assert.rejects(h.executor.execute(altered),/LANDING_NATIVE_PLAN_STALE/);assert.equal(h.created.length,count);
});
test('Stop while fonts are awaited prevents late native creation',async()=>{
 const h=harness();let started=false,resolve;h.api.loadFontAsync=()=>{started=true;return new Promise(r=>resolve=r);};const p=tree([{id:'button',parent:'$mount',kind:'instance',key:KEY,importType:'COMPONENT',props:{}}]);const run=h.run(p,'structure',{root:{type:'INSTANCE',componentKey:KEY},props:{}});while(!started)await new Promise(r=>setTimeout(r,1));h.stop();resolve();await assert.rejects(run,/LANDING_CANCELLED/);assert.equal(h.created.length,0);assert.equal(h.root.children.length,0);
});
test('Stop after the first native insertion resumes the same partial root and retains its ID',async()=>{
 const h=harness(),p=tree([{id:'column',parent:'$mount',kind:'layout',layout:{fields:{layoutMode:'VERTICAL'}}},{id:'button',parent:'column',kind:'instance',key:KEY,importType:'COMPONENT',props:{}}]),d={root:{type:'FRAME',componentKey:null},props:{}},append=h.root.appendChild.bind(h.root);
 h.root.appendChild=n=>{append(n);setTimeout(h.stop,0);};await assert.rejects(h.run(p,'structure',d),/LANDING_CANCELLED/);h.root.appendChild=append;assert.equal(h.root.children.length,1);const id=h.root.children[0].id;assert.equal(h.root.children[0].getSharedPluginData(NS,'section'),'');
 const resumed=createNativeExecutor({api:h.api,hash,guard:()=>{},capture:h.capture,root:h.root}),request={operationId:crypto.randomUUID(),stage:'structure',sectionId:'hero',plan:p,decision:d,planHash:hash(p),beforeHash:hash(pin(await h.capture())),mountNodeId:h.root.id,replacement:null,expectedSection:null,order:['hero']};
 const result=await resumed.execute(request);assert.equal(result.issue,null);assert.equal(h.root.children.length,1);assert.equal(h.root.children[0].id,id);assert.equal(h.root.children[0].getSharedPluginData(NS,'section'),'hero');assert.equal(h.created.length,1);
});
test('Stop during a requested replacement keeps the old verified section until the same partial replacement resumes',async()=>{
 const h=harness(),oldPlan=tree([{id:'column',parent:'$mount',kind:'layout',layout:{fields:{layoutMode:'VERTICAL'}}}]),d={root:{type:'FRAME',componentKey:null},props:{}};await h.run(oldPlan,'structure',d);const before=await h.capture(),oldId=before.sections[0].id;
 const p=tree([{id:'column',parent:'$mount',kind:'layout',layout:{fields:{layoutMode:'HORIZONTAL'}}},{id:'button',parent:'column',kind:'instance',key:KEY,importType:'COMPONENT',props:{}}]),append=h.root.appendChild.bind(h.root);h.root.appendChild=n=>{append(n);setTimeout(h.stop,0);};await assert.rejects(h.run(p,'structure',d,{expectedSection:before.sections[0]}),/LANDING_CANCELLED/);h.root.appendChild=append;
 assert.equal(h.root.children.length,2);const partial=h.root.children.find(n=>n.id!==oldId).id;const resumed=createNativeExecutor({api:h.api,hash,guard:()=>{},capture:h.capture,root:h.root});
 await resumed.execute({operationId:crypto.randomUUID(),stage:'structure',sectionId:'hero',plan:p,decision:d,planHash:hash(p),beforeHash:hash(pin(await h.capture())),mountNodeId:h.root.id,replacement:null,expectedSection:before.sections[0],order:['hero']});assert.equal(h.root.children.length,1);assert.equal(h.root.children[0].id,partial);assert.notEqual(partial,oldId);
});
test('plugin wrapper keeps every accepted pristine helper body exact and native source contains no object spread',()=>{
 const proxyRoot=path.resolve(__dirname,'../../../services/apollo-proxy'),original=require(path.join(proxyRoot,'src/landing/figma-recipes')),wrapped=require('../src/landing/native-recipes').forApi(null);for(const name of Object.keys(original))assert.equal(wrapped[name].toString(),original[name].toString(),name);
 const ts=require('typescript');for(const file of ['native-plan.js','native-executor.js','native.js','native-recipes.js']){const source=ts.createSourceFile(file,fs.readFileSync(path.join(__dirname,'../src/landing',file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(source.parseDiagnostics.length,0,file);const visit=node=>{assert.notEqual(node.kind,ts.SyntaxKind.SpreadAssignment,file);ts.forEachChild(node,visit);};visit(source);}
 assert.equal(fs.readFileSync(path.join(__dirname,'../src/landing/native-plan.js'),'utf8'),fs.readFileSync(path.join(proxyRoot,'src/landing/native-plan.js'),'utf8'));
});
test('native bridge negotiates the executor and independently captures assembled keys/layout/actual IDs',async()=>{
 const h=harness(),chat=crypto.randomUUID(),owner='a'.repeat(64),messages=[];h.root.setSharedPluginData(NS,'chat',chat);h.root.setSharedPluginData(NS,'owner',owner);
 const bridge=require('../src/landing/native').createLandingCanvasBridge({api:h.api,hash,post:m=>messages.push(m)});
 let seq=0;const call=async(operation,payload)=>{const requestId='bridge-'+ ++seq;bridge.accept({type:'landing-canvas',requestId,operation,payload});for(let i=0;i<1000;i++){const result=messages.find(m=>m.requestId===requestId);if(result)return result;await new Promise(r=>setTimeout(r,1));}throw Error('Fixture timed out');};
 const opened=await call('open',{chatId:chat,revision:1,pageId:h.page.id,fileKey:'FixtureFile',rootNodeId:h.root.id,ownerNonce:owner,evidenceVersion:2,skeletonExecutor:plan.VERSION});assert.equal(opened.error,null);assert.equal(opened.value.readback.native.executor,plan.VERSION);
 const p={schemaVersion:plan.SCHEMA,rootId:'host',mountId:'body',rootLayout:{},nodes:[{id:'host',parent:'$root',kind:'instance',key:CC,importType:'COMPONENT',role:'host'},{id:'body',parent:'host',kind:'slot',selector:[{type:'SLOT',name:'Body'}],role:'body'}]},d={container:{role:'host',type:'INSTANCE',componentKey:CC},mount:{role:'body',type:'SLOT',componentKey:null}},t=opened.value.target,request={operationId:crypto.randomUUID(),sourcePin:'fixture',stage:'foundation',sectionId:null,plan:p,decision:d,planHash:hash(p),beforeHash:hash(pin(opened.value.readback)),mountNodeId:null,replacement:null,order:[]};
 const assembled=await call('assemble',{chatId:chat,revision:1,rootNodeId:t.rootNodeId,ownerNonce:t.ownerNonce,leaseNonce:t.leaseNonce,request});assert.equal(assembled.error,null,JSON.stringify(assembled.error));plan.confirm(p,assembled.value.bindings,assembled.value.readback,'foundation');assert.equal(assembled.value.readback.instanceCount,1);bridge.close();
});
test('bridge Stop/readback/resume retains a scoped partial unit without certifying a completed section',async()=>{
 const h=harness(),chat=crypto.randomUUID(),owner='a'.repeat(64),messages=[];h.root.setSharedPluginData(NS,'chat',chat);h.root.setSharedPluginData(NS,'owner',owner);
 const bridge=require('../src/landing/native').createLandingCanvasBridge({api:h.api,hash,post:m=>messages.push(m)});let seq=0;
 const call=async(operation,payload)=>{const requestId='partial-'+ ++seq;bridge.accept({type:'landing-canvas',requestId,operation,payload});for(let i=0;i<1000;i++){const result=messages.find(m=>m.requestId===requestId);if(result)return result;await new Promise(r=>setTimeout(r,1));}throw Error('Fixture timed out');};
 const open=revision=>call('open',{chatId:chat,revision,pageId:h.page.id,fileKey:'FixtureFile',rootNodeId:h.root.id,ownerNonce:owner,evidenceVersion:2,skeletonExecutor:plan.VERSION});let opened=await open(1),t=opened.value.target;
 const p=tree([{id:'column',parent:'$mount',kind:'layout',layout:{fields:{layoutMode:'VERTICAL'}}},{id:'button',parent:'column',kind:'instance',key:KEY,importType:'COMPONENT',props:{}}]),d={root:{type:'FRAME',componentKey:null},props:{}},append=h.root.appendChild.bind(h.root);
 h.root.appendChild=n=>{append(n);setTimeout(()=>{void call('release',{chatId:chat});},0);};
 const request=()=>({operationId:crypto.randomUUID(),sourcePin:'fixture',stage:'structure',sectionId:'hero',plan:p,decision:d,planHash:hash(p),beforeHash:hash(pin(opened.value.readback)),mountNodeId:h.root.id,replacement:null,expectedSection:null,order:['hero']});
 const first=await call('assemble',{chatId:chat,revision:1,rootNodeId:t.rootNodeId,ownerNonce:t.ownerNonce,leaseNonce:t.leaseNonce,request:request()});assert.equal(first.error.code,'LANDING_CANVAS_UNAVAILABLE');h.root.appendChild=append;assert.equal(h.root.children.length,1);const retained=h.root.children[0].id;
 opened=await open(2);assert.equal(opened.error,null);assert.equal(opened.value.readback.sections.length,0);assert.equal(opened.value.readback.native.nodes.find(n=>n.id===retained).sectionId,'hero');t=opened.value.target;
 const resumed=await call('assemble',{chatId:chat,revision:2,rootNodeId:t.rootNodeId,ownerNonce:t.ownerNonce,leaseNonce:t.leaseNonce,request:request()});assert.equal(resumed.error,null,JSON.stringify(resumed.error));assert.equal(h.root.children.length,1);assert.equal(h.root.children[0].id,retained);assert.equal(resumed.value.readback.sections.length,1);bridge.close();
});
