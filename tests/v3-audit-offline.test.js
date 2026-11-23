'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDesignCheckController } = require('../src/design-check/controller');
const { createCompatibilityClient } = require('../src/compatibility');
const { createV3UiClient } = require('../src/v3-audit/ui-client');
const { buildV3Groups } = require('../src/v3-audit/ui-model');
const { createComponentTimings } = require('../src/v3-audit/component-timings');
const { createRunTrace, readTrace } = require('../src/v3-audit/run-trace');

const source = require('esbuild').buildSync({ stdin: { contents: 'module.exports = Object.assign({},require("./src/v3-audit/native-port.ts"),require("./src/v3-audit/embedded-data.ts"),require("./src/v3-audit/services/auditTreeTraversal.ts"),require("./src/document-audit/reads.js"))', resolveDir: path.join(__dirname,'..') },
  bundle: true, write: false, platform: 'node', format: 'cjs', supported: { 'object-rest-spread': false } }).outputFiles[0].text;
const runtime = { exports: {} };
new Function('module','exports','require',source)(runtime,runtime.exports,require);
const { createV3NativePort, createOfflineAuditIndex, traverseAuditTree, setHostYieldTransport, completeHostYield } = runtime.exports;
const {data:embedded,legacyKey,targetKey}=require('./fixtures/v3-audit-compact-index.cjs');
const externalKey = '1234567890'.repeat(4);
const getFixtureIndex=()=>createOfflineAuditIndex(embedded.payload,embedded.dataId);
const compactPath='/v1/audit-data/compact-index';
const repositoryPath='/design-system_ab/JSONS/apollo/indexes/athena-audit.json';

async function until(fn) {
  for (let i=0;i<400;i++) {
    if(fn())return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.fail('Timed out waiting for audit fixture');
}

function fixture(t,{key=legacyKey,index=getFixtureIndex,breakProperties=false,built=false,delivery}={}) {
  const calls=[], posts=[], imports=[], progress=[], pending=new Map();
  const page={id:'1:1',type:'PAGE',name:'Example',parent:null,children:[],explicitVariableModes:{},
    get visible(){throw TypeError('no such property visible on PAGE node');}};
  const main=(id,key)=>({id,key,remote:true,type:'COMPONENT',name:'Example',children:[],parent:null,opacity:1});
  let current=main('2:1',key), focused=null, revision=1, swaps=0;
  const target=main('2:2',targetKey);
  const instance={id:'1:2',type:'INSTANCE',visible:true,parent:page,children:[],overrides:[],name:'Example',opacity:0.6,
    variantProperties:{},componentProperties:{'Label#1':{type:'TEXT',value:'Example label'}},
    getMainComponentAsync:async()=>current,
    swapComponent(node){swaps++;current=node;this.componentProperties={'Label#2':{type:'TEXT',value:'Default label'}};},
    setProperties(values){if(!breakProperties)for(const [name,value] of Object.entries(values))this.componentProperties[name].value=value;},
  };
  page.children=[instance];page.selection=[instance];
  const figma={fileKey:'example',currentPage:page,currentUser:null,root:{name:'Example'},editorType:'figma',mixed:Symbol('mixed'),
    getNodeByIdAsync:async id=>page.children.find(node=>node.id===id)||null,
    importComponentByKeyAsync:async key=>{imports.push(key);return pending.get(key)|| (key===targetKey?target:current);},
    viewport:{scrollAndZoomIntoView(nodes){focused=nodes;}},variables:{getVariableCollectionByIdAsync:async()=>null},
  };
  const request=async (url,options)=>{
    const pathname=new URL(url).pathname;
    calls.push(pathname);
    if(delivery)return delivery(pathname,options);
    throw Error('ECONNREFUSED');
  };
  const compatibility=createCompatibilityClient({request,endpoint:'http://localhost:3001/health'});
  const controller=createDesignCheckController({auditEngine:'v3',settingCapabilities:{shellAuditEnabled:true},beforeOperation:compatibility.ensure,
    beforeAudit:kind=>kind==='texts'?compatibility.ensure():undefined,onAudit:input=>ui.start(input),onStopAudit:()=>ui.stop()});
  let deliver,close,observeChange;
  const ui=createV3UiClient({request,send:message=>deliver(message),onChange:value=>{
    if(value.progress!==progress.at(-1))progress.push(value.progress);
    controller.setV3AuditState(value);
  }});
  const post=message=>{posts.push(message);ui.accept(message);};
  if(built){
    const listeners=new Map();
    page.on=()=>{};page.off=()=>{};
    figma.on=(name,handler)=>listeners.set(name,handler);
    figma.off=name=>listeners.delete(name);
    figma.clientStorage={};
    figma.showUI=(_,options)=>assert.equal(options.width,800);
    figma.ui={postMessage(message){
      if(message.type==='audit-host-yield')setTimeout(()=>deliver({type:'audit-host-yield-done',ticket:message.ticket}),0);
      post(message);
    }};
    const code=fs.readFileSync(path.join(__dirname,'../dist/code.js'),'utf8');
    vm.runInNewContext(code,{figma,__html__:'',TextEncoder,setTimeout,clearTimeout});
    deliver=message=>figma.ui.onmessage(message);
    close=()=>listeners.get('close')?.();
  }else{
    globalThis.figma=figma;
    const native=createV3NativePort({offlineIndex:delivery?undefined:index,useCompactIndex:!!delivery,post,readRevision:()=>revision,pluginVersion:'fixture',
      isUnavailable:()=>false,canMutate:()=>true,onBusy(){},onMutation(){revision++;native.invalidate();}});
    deliver=message=>native.accept(message);
    observeChange=event=>native.observeChange(event);
    close=()=>{native.close();delete globalThis.figma;};
  }
  controller.setAuditReady(true);
  t.after(()=>{ui.close();close();controller.destroy();});
  async function run(){assert.equal(await controller.startAudit(),true);await until(()=>!ui.busy());return ui.snapshot();}
  return {ui,controller,calls,posts,imports,progress,instance,page,run,pending,figma,observeChange,focused:()=>focused,swaps:()=>swaps};
}

test('normal button reaches the real native report with Proxy unavailable and retains focus',async t=>{
  const h=fixture(t);
  const result=await h.run();
  assert(result.hasAcceptedResult,result.lastAttempt?.error);
  assert.equal(result.dataId,embedded.dataId);
  assert.deepEqual(h.calls,[]);
  assert(!h.posts.some(message=>message.type==='v3-audit-data-request'));
  const finding=result.originalPayload.visibleViews.themization[0];
  assert.equal(finding.recommendation,'[D] Button');
  assert.equal(finding.replacementComponentKey,targetKey);
  let focusReads=0;
  const lookup=h.figma.getNodeByIdAsync;
  h.figma.getNodeByIdAsync=async id=>{focusReads++;return lookup(id);};
  const focusPromise=h.ui.focus(result.runId,finding.focusActionId);
  assert.equal(h.ui.busy(),false);
  assert(await focusPromise);
  assert.equal(focusReads,0);
  assert.deepEqual(h.focused(),[h.instance]);
  assert.deepEqual(h.calls,[]);
  assert.equal(await h.controller.startAudit('texts'),false);
  assert.deepEqual(h.calls,['/health']);
});

test('capture skips hidden descendants and overlaps distinct visible instance reads',async t=>{
  const h=fixture(t);
  const root={id:'1:3',type:'FRAME',name:'Root',visible:true,parent:h.page,children:[]};
  let calls=0,inFlight=0,peak=0;
  const instances=Array.from({length:12},(_,index)=>Object.assign({},h.instance,{
   id:'visible:'+index,parent:root,async getMainComponentAsync(){
    calls++;peak=Math.max(peak,++inFlight);
    await new Promise(resolve=>setTimeout(resolve,2));
    inFlight--;return h.instance.getMainComponentAsync();
   },
  }));
  const hidden={id:'hidden',type:'FRAME',visible:false,parent:root,
   get children(){assert.fail('hidden branch was read');}};
  root.children=[hidden,...instances];h.page.children=[root];h.page.selection=[root];
  const result=await h.run();
  assert(result.hasAcceptedResult,result.lastAttempt?.error);
  assert.equal(calls,12);
  assert.equal(h.imports.length,1);
  assert(peak>1&&peak<=8);
  assert.equal(result.trace.sessions[0].native.componentTimings.calls.figmaGetMainComponentAsync.count,12);
});

test('Design skips confirmed shared variants and detaches before reading children, including the page fallback',async t=>{
  const sideMenu='379ded7ba661ce24eaedeb43cf38f117fd89be96';
  const variant='3fd50fe48ed8ce51ff236a54525ed6ec90b073c9';
  const unrelated='f'.repeat(40);
  const parent={type:'component',name:'[D] SideMenu',library:'Example',status:'active',role:'main',platforms:['Desktop'],sources:[]};
  const rows=Object.assign({},embedded.payload.components.rows,{
    [sideMenu]:parent,[variant]:{type:'variant',name:'Edit Mode=False',componentKey:sideMenu},[unrelated]:parent,
  });
  const index=createOfflineAuditIndex(Object.assign({},embedded.payload,{components:{rows}}),embedded.dataId);
  const h=fixture(t,{index:()=>index});
  const reads={instanceChildren:0,detachChildren:0,characters:0,styles:0,tokens:0,selectedIdentity:0,modes:0};
  const text=(id,parent)=>({id,type:'TEXT',name:id,visible:true,parent,
    get characters(){reads.characters++;return id;},
    get fills(){reads.styles++;return [];},
    get boundVariables(){reads.tokens++;return {};},
    get resolvedVariableModes(){reads.modes++;return {};},
  });
  const container={id:'container',type:'FRAME',name:'Screen',visible:true,parent:h.page,children:[]};
  const shell={id:'shared-instance',type:'INSTANCE',name:'Custom name',visible:true,parent:container,
    componentProperties:{},variantProperties:{},
    getMainComponentAsync:async()=>({id:'shared-main',key:variant,type:'COMPONENT',name:'Edit Mode=False',remote:true,parent:null,children:[]}),
    get children(){reads.instanceChildren++;return [child,selected];},
  };
  const child=text('inside instance',shell);
  const selected={id:'selected-inside',type:'INSTANCE',name:'inside',visible:true,parent:shell,children:[],
    componentProperties:{},variantProperties:{},
    async getMainComponentAsync(){reads.selectedIdentity++;return null;},
  };
  const detach={id:'shared-detached',type:'FRAME',name:'Renamed detach',visible:true,parent:container,
    detachedInfo:{type:'library',componentKey:variant},
    get children(){reads.detachChildren++;return [detachedText];},
  };
  const detachedText=text('inside detach',detach);
  const sibling={id:'unrelated',type:'INSTANCE',name:'[D] SideMenu',visible:true,parent:container,children:[],
    componentProperties:{},variantProperties:{},
    getMainComponentAsync:async()=>({id:'unrelated-main',key:unrelated,type:'COMPONENT',name:'[D] SideMenu',remote:true,parent:null,children:[]}),
  };
  sibling.children=[{id:'outside',type:'TEXT',name:'Outside',characters:'Outside',visible:true,parent:sibling}];
  const unconfirmed={id:'unknown-detach',type:'FRAME',name:'[D] SideMenu',visible:true,parent:container,children:[],
    detachedInfo:{type:'library',componentKey:'missing-key'}};
  unconfirmed.children=[{id:'unconfirmed-text',type:'TEXT',name:'Unconfirmed',characters:'Unconfirmed',visible:true,parent:unconfirmed}];
  container.children=[shell,detach,sibling,unconfirmed];
  h.page.children=[container];
  h.page.selection=h.page.children;
  h.figma.getNodeByIdAsync=async id=>[container,selected,sibling].find(node=>node.id===id)||null;
  assert.equal(h.controller.getState().settings.shellAuditEnabled,false);
  const skipped=await h.run();
  assert(skipped.hasAcceptedResult,skipped.lastAttempt?.error);
  assert.deepEqual(skipped.originalPayload.textReport.facts.texts.map(fact=>fact.text),['Outside','Unconfirmed']);
  assert.deepEqual(Object.values(reads),[0,0,0,0,0,0,0]);

  h.page.selection=[selected];
  const excluded=await h.run();
  assert.equal(excluded.lastAttempt.error,'AUDIT_SHARED_SCOPE_EXCLUDED');
  assert.match(excluded.error,/Вся выделенная область относится к шареду/);
  assert.deepEqual(Object.values(reads),[0,0,0,0,0,0,0]);

  h.page.selection=[selected,sibling];
  const mixed=await h.run();
  assert.equal(mixed.lastAttempt.error,null);
  assert.deepEqual(mixed.originalPayload.textReport.facts.texts.map(fact=>fact.text),['Outside']);
  assert.deepEqual(Object.values(reads),[0,0,0,0,0,0,0]);

  assert.equal(h.controller.updateSetting('shellAuditEnabled',true),true);
  h.page.selection=[container];
  const full=await h.run();
  assert.equal(full.lastAttempt.error,null);
  assert.deepEqual(full.originalPayload.textReport.facts.texts.map(fact=>fact.text),
    ['inside instance','inside detach','Outside','Unconfirmed']);
  assert(Object.values(reads).every(count=>count>0));
});

test('offline Design shows findings from one capture and still checks live identity before changing a component',async t=>{
  const h=fixture(t);
  h.instance.children=['First','Second'].map((characters,index)=>({
    id:'text:'+index,type:'TEXT',name:characters,characters,visible:true,parent:h.instance,
  }));
  const getMain=h.instance.getMainComponentAsync;
  let reads=0,mainChanged=false;
  h.instance.getMainComponentAsync=async()=>{
    reads++;
    const main=await getMain();
    return mainChanged?Object.assign({},main,{id:'changed-main'}):main;
  };
  const result=await h.run();
  assert(result.hasAcceptedResult,result.lastAttempt?.error);
  assert.equal(reads,1);
  const timings=result.trace.sessions.find(session=>session.requestId===result.runId).native.componentTimings;
  assert.equal(timings.finished,true);
  assert.equal(timings.calls.classifyComponent.count,1);
  assert.equal(timings.calls.treeVisit.completed,3);
  assert.equal(timings.calls.visitNodeRegistration.completed,3);
  assert.equal(timings.calls.visitComponentGrouping.completed,1);
  assert.equal(timings.calls.componentProgress.completed,1);
  assert.equal(timings.calls.customStyles.count,3);
  assert.equal(timings.calls.deprecatedStyles.count,3);
  assert.equal(timings.calls.figmaImportComponentByKeyAsync.completed,1);
  assert.equal(timings.calls.figmaGetMainComponentAsync.count,1);
  assert.deepEqual(result.originalPayload.textReport.facts.texts.map(fact=>[fact.text,fact.owner.componentKey]),[
    ['First',legacyKey],['Second',legacyKey],
  ]);
  const finding=result.originalPayload.visibleViews.themization[0];
  assert.equal(finding.replacementComponentKey,targetKey);
  mainChanged=true;
  assert.equal(await h.ui.action(finding.actions.find(action=>action.label==='Заменить').id),false);
  assert.equal(reads,2);
  assert.equal(h.swaps(),0);
  assert.equal(h.posts.find(message=>message.type==='v3-audit-operation-error').sourceChange.reason,'main-component-changed');
  h.instance.opacity=0.9;
  h.observeChange({nodeChanges:[{type:'PROPERTY_CHANGE',id:h.instance.id,properties:['opacity']}]});
  await until(()=>h.ui.getState().staleActionIds.includes(finding.actions[0].id));
  assert.equal(h.ui.getState().stale,false);
  assert.deepEqual(h.ui.snapshot().originalPayload,result.originalPayload);
});

async function captureWhileReadingLibrary(h,notify){
  let release;
  h.pending.set(legacyKey,new Promise(resolve=>{release=resolve;}));
  const run=h.run();
  await until(()=>h.imports.includes(legacyKey));
  notify();
  release(await h.instance.getMainComponentAsync());
  return run;
}

test('offline Design publishes a partial report when queued geometry reveals changed variable modes',async t=>{
  const h=fixture(t);
  Object.assign(h.instance,{y:20,relativeTransform:[[1,0,0],[0,1,20]],resolvedVariableModes:{theme:'before'}});
  const sibling=Object.assign({},h.instance,{id:'1:3',name:'Other',resolvedVariableModes:{theme:'before'}});
  h.page.children.push(sibling);h.page.selection=[h.instance,sibling];
  const result=await captureWhileReadingLibrary(h,()=>{
    h.observeChange({nodeChanges:[{type:'PROPERTY_CHANGE',node:h.instance,id:h.instance.id,properties:['y','relativeTransform']}]});
    h.instance.resolvedVariableModes={theme:'after'};
  });
  assert(result.hasAcceptedResult,result.lastAttempt.error);
  assert.equal(result.lastAttempt.error,null);
  assert.deepEqual(result.sourceChange,{reason:'observed-facts-changed',stage:'capture',nodeId:h.instance.id,fields:['resolvedVariableModes']});
  const findings=result.originalPayload.visibleViews.themization;
  const changed=findings.find(item=>item.nodeId===h.instance.id),unchanged=findings.find(item=>item.nodeId===sibling.id);
  assert.deepEqual(result.staleActionIds,[changed.actions[0].id]);
  assert(!result.staleActionIds.includes(unchanged.actions[0].id));
  assert(result.originalPayload.mutationAvailable);
  assert(buildV3Groups(result.originalPayload).coverageDetails.some(item=>item.id==='capture-source'));
  assert.equal(await h.ui.action(changed.actions[0].id),false);
  assert.equal(h.swaps(),0);
  assert.equal(await h.ui.focus(result.runId,changed.focusActionId),true);
  assert.equal(h.focused()[0],h.instance);
  const native=result.trace.sessions[0].native;
  assert(native.events.some(event=>event.event==='notification-result'&&event.outcome==='queued'));
  assert(native.events.some(event=>event.event==='capture-coverage'&&event.outcome==='partial'));
  assert.equal(native.firstFailure,null);
  assert.equal(await h.ui.action(unchanged.actions[0].id),true);
  assert.equal(h.swaps(),1);
  await until(()=>!h.ui.busy());
});

test('offline Design publishes unchanged queued events with full coverage',async t=>{
  const h=fixture(t);
  const result=await captureWhileReadingLibrary(h,()=>{
    h.observeChange({nodeChanges:[{type:'PROPERTY_CHANGE',id:h.instance.id,properties:['opacity']}]});
  });
  assert(result.hasAcceptedResult,result.lastAttempt.error);
  assert.equal(result.sourceChange,null);
  assert(!result.originalPayload.offlineCoverage.gaps.includes('capture-source-changed'));
  assert(result.originalPayload.mutationAvailable);
});

test('offline Design retains findings and refuses native writes when a queued event is ambiguous',async t=>{
  const h=fixture(t);
  const result=await captureWhileReadingLibrary(h,()=>{
    h.observeChange({nodeChanges:[{type:'DELETE',id:'unobserved-removed-node'}]});
  });
  assert(result.hasAcceptedResult,result.lastAttempt.error);
  assert.equal(result.sourceChange.reason,'topology-notification');
  assert(result.originalPayload.offlineCoverage.gaps.includes('capture-source-changed'));
  assert.equal(result.originalPayload.mutationAvailable,false);
  const finding=result.originalPayload.visibleViews.themization[0];
  assert.equal(await h.ui.operate('v3-audit-action',result.runId,{actionId:finding.actions[0].id}),false);
  assert.equal(h.posts.find(message=>message.type==='v3-audit-operation-error').code,'AUDIT_ACTION_SOURCE_CHANGED');
  assert.equal(h.swaps(),0);
});

test('offline Design retains findings if the live session for applying them is unavailable',async t=>{
  const h=fixture(t);
  Object.defineProperty(h.page,'explicitVariableModes',{get(){
    if(h.posts.some(message=>message.progress?.stage==='texts'))throw Error('native value unavailable');
    return {};
  }});
  const result=await h.run();
  assert(result.hasAcceptedResult,result.lastAttempt.error);
  assert(result.originalPayload.visibleViews.themization.length>0);
  assert(result.originalPayload.offlineCoverage.gaps.includes('capture-session-unavailable'));
  assert.equal(result.originalPayload.mutationAvailable,false);
  assert.equal(result.trace.sessions[0].native.firstFailure.code,'AUDIT_SESSION_UNAVAILABLE');
});

test('offline Design resolves nested source IDs concurrently, retaining first occurrence order and fallback',async t=>{
  const h=fixture(t),ownerOrder=[];
  h.instance.children=['I1:2;50:0;50:1','I1:3;50:2','I1:4;50:1;50:3'].map(id=>
    Object.assign({},h.instance,{id,parent:h.instance,children:[]}));
  const makeSource=(id,name)=>{
    const parent={id:name,name,type:'COMPONENT',key:name,remote:false,visible:true,parent:h.page,
      get children(){ownerOrder.push(name);return[];}};
    return{id,type:'RECTANGLE',name:id,parent,visible:true};
  };
  const first=makeSource('50:1','first'),second=makeSource('50:2','second');
  const pending=new Map(),lookups=[],getNode=h.figma.getNodeByIdAsync;
  h.figma.getNodeByIdAsync=id=>{
    if(!id.startsWith('50:'))return getNode(id);
    lookups.push(id);
    if(id==='50:0')return Promise.resolve(null);
    return new Promise(resolve=>pending.set(id,resolve));
  };
  const run=h.run();
  await until(()=>pending.has('50:1')&&pending.has('50:2'));
  pending.get('50:2')(second);pending.get('50:1')(first);
  const result=await run;
  assert(result.hasAcceptedResult,result.lastAttempt.error);
  assert.deepEqual(lookups.slice().sort(),['50:0','50:1','50:2']);
  assert.deepEqual(Array.from(new Set(ownerOrder)),['first','second']);
});

test('Stop abandons a bounded batch of nested source lookups and late replies do not schedule more',async t=>{
  const h=fixture(t),pending=[];
  h.instance.children=Array.from({length:7},(_,index)=>Object.assign({},h.instance,{
    id:'I1:'+index+';60:'+index,parent:h.instance,children:[],
  }));
  const getNode=h.figma.getNodeByIdAsync;
  h.figma.getNodeByIdAsync=id=>id.startsWith('60:')?new Promise(resolve=>pending.push(resolve)):getNode(id);
  const run=h.run();
  await until(()=>pending.length===4);
  assert(h.controller.stopAudit());
  const result=await run;
  assert.equal(result.lastAttempt.cancelled,true);
  assert.equal(result.hasAcceptedResult,false);
  pending.forEach(resolve=>resolve(null));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pending.length,4);
  assert(!h.posts.some(message=>message.type==='v3-audit-result'));
});

test('shared component catalogs apply to every channel and keep their lifecycle status',async t=>{
  const payload=structuredClone(embedded.payload),rows=payload.components.rows;
  const iconParent='1'.repeat(40),icon='2'.repeat(40),logo='3'.repeat(40),unknown='4'.repeat(40);
  payload.sources.sources.push({id:1,catalogPath:'icons/Icons.json'},{id:2,catalogPath:'logotypes/Logotypes.json'});
  rows[iconParent]={type:'component',name:'Glyph',library:'Icons',status:'active',role:'main',platforms:[],sources:[1]};
  rows[icon]={type:'variant',name:'Size=m',componentKey:iconParent};
  rows[logo]={type:'component',name:'Logotype',library:'Logotypes',status:'deprecated',role:'main',platforms:[],sources:[2]};
  rows[unknown]={...rows[iconParent],sources:[0]};
  const index=createOfflineAuditIndex(payload,embedded.dataId);
  for(const key of [iconParent,icon,logo]){
    const result=index.find(key);
    assert.equal(result.state,'found');
    assert.deepEqual(result.channels,['Desktop','MobileWeb','iOS','Android']);
  }
  assert.equal(index.find(logo).reference.status,'deprecated');
  assert.equal(index.find(unknown).state,'unknown');
  const h=fixture(t,{key:icon,index:()=>index});
  const result=await h.run();
  assert(result.hasAcceptedResult,result.lastAttempt?.error);
  assert.equal(result.originalPayload.visibleViews.relevance.current[0].librarySource,'Icons');
  assert.equal(result.originalPayload.visibleViews.wrongChannel.length,0);
  assert.equal(buildV3Groups(result.originalPayload).unconfirmed.entries.length,0);
});

test('Design keeps same-key ID differences in diagnostics and still reports a failed library lookup',async t=>{
  const h=fixture(t);
  const main=await h.instance.getMainComponentAsync();
  h.pending.set(legacyKey,Promise.resolve(Object.assign({},main,{id:'different-fixture-id'})));
  const first=await h.run();
  assert(first.hasAcceptedResult,first.lastAttempt?.error);
  assert.equal(first.originalPayload.visibleViews.relevance.current[0].libraryFreshness.reason,'publication-unconfirmed');
  assert.equal(buildV3Groups(first.originalPayload).unconfirmed.entries.length,0);

  h.figma.importComponentByKeyAsync=async()=>{throw Error('Library unavailable');};
  const second=await h.run();
  assert(second.hasAcceptedResult,second.lastAttempt?.error);
  const entries=buildV3Groups(second.originalPayload).unconfirmed.entries;
  assert.equal(entries.length,1);
  assert.equal(entries[0].item.libraryFreshness.reason,'component-import-failed');
});

test('offline Design measures actual Figma style and variable reads, including a refused lookup',async t=>{
  const h=fixture(t);
  let styleReads=0,variableReads=0;
  h.figma.getStyleByIdAsync=async()=>{styleReads++;throw Error('style unavailable');};
  h.figma.variables.getVariableByIdAsync=async()=>{variableReads++;return null;};
  h.instance.children=[{id:'1:3',type:'FRAME',name:'Styled layer',visible:true,parent:h.instance,children:[],
    fillStyleId:'local-style',fills:[{type:'SOLID',color:{r:0,g:0,b:0},boundVariables:{color:{type:'VARIABLE_ALIAS',id:'VariableID:999:1'}}}]}];
  const result=await h.run();
  assert(result.hasAcceptedResult,result.lastAttempt?.error);
  const {calls}=result.trace.sessions.find(session=>session.requestId===result.runId).native.componentTimings;
  assert(styleReads>0);
  assert.equal(calls.figmaGetStyleByIdAsync.count,styleReads);
  assert.equal(calls.figmaGetStyleByIdAsync.failed,styleReads);
  assert.equal(calls.figmaGetVariableByIdAsync.count,1);
  assert.equal(variableReads,1);
});

test('compiled plugin loads from the repository with Proxy unavailable and Stop preserves the result and focus',async t=>{
  const h=fixture(t,{built:true,delivery:pathname=>{
    if(pathname===compactPath)throw Error('ECONNREFUSED');
    assert.equal(pathname,repositoryPath);
    return Response.json(embedded);
  }}),getMain=h.instance.getMainComponentAsync;
  assert.deepEqual(h.calls,[]);
  let mainReads=0;
  h.instance.getMainComponentAsync=async()=>{mainReads++;return getMain();};
  const saved=await h.run();assert(saved.hasAcceptedResult,saved.lastAttempt?.error);
  assert.equal(mainReads,1);
  assert.equal(saved.dataId,embedded.dataId);
  assert.equal(saved.originalPayload.athenaIndex.source,'repository');
  const buildId=createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../dist/build-inputs.json'))).digest('hex');
  assert.equal(saved.pluginBuildId,buildId);
  const capture=saved.trace.sessions.find(session=>session.requestId===saved.runId).native;
  assert.equal(capture.pluginBuildId,buildId);
  assert.equal(capture.componentTimings.calls.figmaImportComponentByKeyAsync.count,1);
  assert.equal(capture.componentTimings.calls.treeVisit.completed,1);
  assert.equal(capture.componentTimings.calls.componentProgress.completed,1);
  assert.equal(h.posts.filter(message=>message.type==='v3-audit-data-request'&&message.operation==='compact-index').length,1);
  let resolve;
  const reads=h.imports.length;
  h.pending.set(legacyKey,new Promise(done=>{resolve=done;}));
  assert(await h.controller.startAudit());
  await until(()=>h.imports.slice(reads).includes(legacyKey));
  assert(h.controller.stopAudit());await until(()=>!h.ui.busy());
  resolve(await h.instance.getMainComponentAsync());
  const stopped=h.ui.snapshot();
  assert.equal(stopped.lastAttempt.cancelled,true);
  assert.equal(stopped.runId,saved.runId);
  assert.deepEqual(stopped.originalPayload,saved.originalPayload);
  const pending=stopped.trace.sessions.find(session=>session.requestId===stopped.lastAttempt.requestId).native;
  assert.equal(pending.componentTimings.finished,false);
  assert.deepEqual(pending.componentTimings.calls.figmaImportComponentByKeyAsync,{count:1,completed:0,failed:0,totalMs:0,maxMs:0});
  assert.deepEqual(pending.componentTimings.calls.treeVisit,{count:1,completed:0,failed:0,totalMs:0,maxMs:0});
  assert(await h.ui.focus(saved.runId,saved.originalPayload.visibleViews.themization[0].focusActionId));
  assert.equal(h.focused()?.[0],h.instance);assert.deepEqual(h.calls,[compactPath,repositoryPath]);
});

test('the first Design check prefers Proxy and the next check reuses the verified index',async t=>{
  const h=fixture(t,{delivery:pathname=>{assert.equal(pathname,compactPath);return Response.json(embedded);}});
  assert.deepEqual(h.calls,[]);
  const first=await h.run();
  assert.deepEqual(h.progress.filter(message=>message.includes('Athena')),[
    'Читаем индексы Athena из Proxy…','Подготавливаем индексы Athena из Proxy…',
  ]);
  h.progress.length=0;
  const second=await h.run();
  assert(first.hasAcceptedResult,first.lastAttempt?.error);
  assert.equal(second.originalPayload.athenaIndex.source,'proxy');
  assert.equal(second.dataId,embedded.dataId);
  assert.notEqual(first.runId,second.runId);
  assert.deepEqual(h.calls,[compactPath]);
  assert.deepEqual(h.progress.filter(message=>message.includes('Athena')),['Подготавливаем индексы Athena из Proxy…']);
});

test('a missing compact-index route or file uses the repository',async t=>{
  for(const response of [new Response('Not found',{status:404}),Response.json({error:'AUDIT_ATHENA_INDEX_MISSING'},{status:503})]){
    const h=fixture(t,{delivery:pathname=>{
      if(pathname===compactPath)return response;
      assert.equal(pathname,repositoryPath);
      return Response.json(embedded);
    }});
    const result=await h.run();
    assert(result.hasAcceptedResult,result.lastAttempt?.error);
    assert.equal(result.originalPayload.athenaIndex.source,'repository');
    assert.equal(result.dataId,embedded.dataId);
    assert.deepEqual(h.calls,[compactPath,repositoryPath]);
    assert.deepEqual(h.progress.filter(message=>/^(Качаем|Подготавливаем) индексы/.test(message)),[
      'Качаем индексы','Подготавливаем индексы',
    ]);
    h.progress.length=0;
    assert.equal((await h.run()).originalPayload.athenaIndex.source,'repository');
    assert.deepEqual(h.calls,[compactPath,repositoryPath]);
    assert.deepEqual(h.progress.filter(message=>/^(Качаем|Подготавливаем) индексы/.test(message)),['Подготавливаем индексы']);
  }
});

test('a corrupt index is refused from either source',async t=>{
  const invalid=()=>Response.json(Object.assign({},embedded,{dataId:'1'.repeat(64)}));
  for(const [proxy,repository] of [
    [invalid(),null],
    [new Response(Uint8Array.of(255)),null],
    [Response.json({error:'AUDIT_DATA_ASSET_MISMATCH'},{status:409}),null],
    [new Response(null,{status:404}),invalid()],
  ]){
    const h=fixture(t,{delivery:pathname=>pathname===compactPath?proxy:repository});
    assert.equal((await h.run()).lastAttempt.error,'AUDIT_ATHENA_INDEX_INVALID');
    assert.deepEqual(h.calls,repository?[compactPath,repositoryPath]:[compactPath]);
    assert(!h.progress.some(message=>message.startsWith('Подготавливаем индексы')));
  }
});

test('Stop aborts the initial index request and does not reuse the abandoned read',async t=>{
  let first=true,signal;
  const h=fixture(t,{delivery:(pathname,options)=>{
    assert.equal(pathname,compactPath);
    if(!first)return Response.json(embedded);
    first=false;signal=options.signal;
    return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
  }});
  assert(await h.controller.startAudit());
  await until(()=>!!signal);
  assert(h.controller.stopAudit());
  await until(()=>!h.ui.busy());
  assert(signal.aborted);
  assert.equal(h.ui.snapshot().lastAttempt.cancelled,true);
  assert(!h.progress.some(message=>message.includes('Athena')));
  assert.equal((await h.run()).dataId,embedded.dataId);
  assert.deepEqual(h.calls,[compactPath,compactPath]);
});

test('tree timings count actual yields separately and preserve hidden and skipped branches',async()=>{
  const root={children:Array.from({length:256},()=>({}))};
  root.children.push({visible:false,children:[{}]},{skipChildren:true,children:[{}]});
  const timings=createComponentTimings();
  timings.start();
  await timings.measure('renderedTree',()=>traverseAuditTree([root],{
    timings,throwIfCancelled(){},isVisible:node=>node.visible!==false,
    getChildren:node=>node.children??[],visit:async node=>node.skipChildren?{skipChildren:true}:undefined,
  }));
  timings.finish();
  const {calls}=timings.snapshot();
  assert.equal(calls.treeCheckpoint.completed,259);
  assert.equal(calls.treeVisibility.completed,259);
  assert.equal(calls.treeVisit.completed,258);
  assert.equal(calls.treeChildren.completed,257);
  assert.equal(calls.treeEdgeGuard.completed,259);
  assert(calls.treeYield.completed>=1&&calls.treeYield.completed<calls.treeCheckpoint.completed);
  assert.equal(calls.treeCheckpointGuard.completed,calls.treeCheckpoint.completed+calls.treeYield.completed);
});

test('one offline tree uses fewer host turns and can stop from the existing UI reply',async t=>{
  let clock=Date.now()+100,turns=0,stopAfterReply=false,stopped=false,visits=0;
  t.mock.method(Date,'now',()=>clock);
  const root={children:Array.from({length:1024},()=>({}))};
  const release=setHostYieldTransport(ticket=>{
    turns++;
    queueMicrotask(()=>{if(stopAfterReply)stopped=true;assert(completeHostYield(ticket));});
  });
  t.after(release);
  async function traverse(offline){
    const timings=createComponentTimings(()=>clock);
    timings.start();
    await traverseAuditTree([root],{timings,prepareNodes:offline?async()=>{}:undefined,
      throwIfCancelled(){if(stopped)throw Error('AUDIT_CANCELLED');},
      visit:async()=>{visits++;clock+=2;},isVisible:()=>true,getChildren:node=>node.children??[],
    });
    return timings.snapshot().calls.treeYield.count;
  }
  const previous=await traverse(false);
  assert.equal(turns,0);
  const current=await traverse(true);
  assert.equal(visits,2050);
  assert.deepEqual([previous,current,turns],[256,64,64]);
  stopAfterReply=true;visits=0;
  await assert.rejects(traverse(true),/AUDIT_CANCELLED/);
  assert(visits>0&&visits<root.children.length);
});

test('component timing export counts overlap, failures and unfinished calls without recording call arguments',async()=>{
  let now=0, release;
  const timings=createComponentTimings(()=>now);
  timings.start();
  const pending=timings.measure('figmaGetStyleByIdAsync',()=>new Promise(done=>{release=done;}));
  now=5;
  const failed=timings.measure('figmaGetStyleByIdAsync',async()=>{now=10;throw Error('private style ID');});
  await assert.rejects(failed,/private style ID/);
  const partial=timings.snapshot();
  now=12;release(null);await pending;
  now=14;timings.finish();
  now=20;
  const complete=timings.snapshot();
  const trace=readTrace({schemaVersion:'apollo.v3-audit-trace.v1',requestId:'request',runId:'request',
    kind:'components',side:'native',events:[],componentTimings:Object.assign({},complete,{calls:Object.assign(
      {privateOperation:{count:1,completed:1,failed:0,totalMs:2,maxMs:2}},
      complete.calls,{customStyles:{count:0,completed:1,failed:0,totalMs:2,maxMs:2}},
    )})});
  assert.deepEqual(partial,{elapsedMs:10,finished:false,calls:{figmaGetStyleByIdAsync:{count:2,completed:1,failed:1,totalMs:5,maxMs:5}}});
  assert.deepEqual(trace.componentTimings,{elapsedMs:14,finished:true,calls:{figmaGetStyleByIdAsync:{count:2,completed:2,failed:1,totalMs:17,maxMs:12}}});
});

test('paint operation phase durations survive trace sanitization without exposing arguments',()=>{
  let now=10;
  const trace=createRunTrace({requestId:'operation',runId:'audit',kind:'components',side:'native'},()=>now);
  const finishVerification=trace.startPhase('source-verification');
  now=518;
  finishVerification('success');
  now=600;
  const finishImport=trace.startPhase('token-import');
  now=724.125;
  finishImport('error');
  const snapshot=trace.snapshot();
  snapshot.events[3].variableKey='private variable key';
  assert.deepEqual(readTrace(snapshot).events,[
    {sequence:1,elapsedMs:0,event:'operation-phase-start',stage:'source-verification'},
    {sequence:2,elapsedMs:508,event:'operation-phase-end',durationMs:508,stage:'source-verification',outcome:'success'},
    {sequence:3,elapsedMs:590,event:'operation-phase-start',stage:'token-import'},
    {sequence:4,elapsedMs:714.125,event:'operation-phase-end',durationMs:124.125,stage:'token-import',outcome:'error'},
  ]);
});

for(const breakProperties of [false,true])test('exact replacement verifies key and preserved properties: '+(!breakProperties?'success':'refused'),async t=>{
  const h=fixture(t,{breakProperties}),result=await h.run();assert(result.hasAcceptedResult,result.lastAttempt?.error);
  const action=result.originalPayload.visibleViews.themization[0].actions.find(action=>action.label==='Заменить');
  assert(action);
  assert.equal(await h.ui.action(action.id),!breakProperties);
  await until(()=>!h.ui.busy());
  const terminal=h.posts.find(message=>message.type.startsWith('v3-audit-operation-')&&message.mutationStarted);
  assert.equal(terminal.type,breakProperties?'v3-audit-operation-error':'v3-audit-operation-result');
  assert.equal(h.swaps(),1);
  assert.equal((await h.instance.getMainComponentAsync()).key,targetKey);
  assert.equal(h.instance.componentProperties['Label#2'].value,breakProperties?'Default label':'Example label');
  assert.deepEqual(h.calls,[]);
});

test('addressed conflicts and missing sources produce UNKNOWN only where evidence is incomplete',async t=>{
  const full=getFixtureIndex();
  const [ambiguous]=Object.entries(embedded.payload.components.rows).find(([,row])=>row.type==='ambiguous');
  assert.equal(full.find(ambiguous).state,'unknown');
  assert.equal(full.find(externalKey).state,'outside');
  const manifest=structuredClone(embedded.payload.manifest);
  delete manifest.coverage.MobileWeb;
  const partial=createOfflineAuditIndex(Object.assign({},embedded.payload,{manifest}),embedded.dataId);
  assert.equal(partial.find(externalKey).state,'unknown');
  assert.equal(partial.find(legacyKey).state,'found');
  const h=fixture(t,{key:externalKey,index:()=>partial}),result=await h.run();
  assert(result.hasAcceptedResult,result.lastAttempt?.error);
  assert.equal(result.originalPayload.visibleViews.local.length,0);
  assert.equal(result.originalPayload.visibleViews.relevance.unknown[0].componentKey,externalKey);
  assert.equal(buildV3Groups(result.originalPayload).incomplete,true);
});

test('an individually deprecated token is detected in a current collection',async t=>{
  const collections=embedded.payload.tokenCatalogs.flatMap(catalog=>catalog.collections);
  const collection=collections.find(row=>row.name==='Interface Dynamic');
  const variable=collection.variables.find(row=>embedded.payload.resources.tokens[row.key]?.status==='active');
  assert(variable);
  const {resources}=embedded.payload;
  const tokens=Object.assign({},resources.tokens,{[variable.key]:{status:'deprecated',closed:false}});
  const index=createOfflineAuditIndex(Object.assign({},embedded.payload,{resources:Object.assign({},resources,{tokens})}),embedded.dataId);
  const h=fixture(t,{index:()=>index});
  h.instance.boundVariables={fills:[{type:'VARIABLE_ALIAS',id:variable.id}]};
  const result=await h.run();
  assert(result.hasAcceptedResult,result.lastAttempt?.error);
  assert(result.originalPayload.visibleViews.deprecatedStyles.some(row=>row.token&&row.styleKey===variable.key));
  assert.deepEqual(h.calls,[]);
});

test('Design returns paint previews for raw and local findings without changing binding actions',async t=>{
 const payload=structuredClone(embedded.payload),collection=payload.tokenCatalogs[0].collections[0],token=collection.variables[0];
 const red={r:1,g:0,b:0},blue={r:0,g:0,b:1,a:.5};
 Object.assign(collection,{id:'VariableCollectionId:2:1',defaultModeId:'light',modes:[{modeId:'light'},{modeId:'dark'}]});
 token.actualValuesByMode={light:[red],dark:[blue]};
 const index=createOfflineAuditIndex(payload,embedded.dataId);
 const h=fixture(t,{index:()=>index});
 const rect=(id,props)=>Object.assign({id,type:'RECTANGLE',name:id,visible:true,parent:h.page,
  resolvedVariableModes:{[collection.id]:'dark'}},props);
 const raw=rect('1:3',{fills:[{type:'SOLID',color:red}]});
 const local=rect('1:4',{strokes:[{type:'SOLID',color:red}],strokeStyleId:'local-style'});
 const gradient=rect('1:5',{fills:[{type:'GRADIENT_LINEAR'}]});
 h.figma.getStyleByIdAsync=async()=>({key:'local-style-key',name:'Local stroke'});
 h.page.children=[raw,local,gradient];h.page.selection=[raw,local,gradient];
 const saved=await h.run();
 assert(saved.hasAcceptedResult,saved.lastAttempt?.error);
 const entries=saved.originalPayload.visibleViews.customStyles;
 for(const [node,field,type] of [[raw,'fill','raw-value'],[local,'stroke','style']]){
  const finding=entries.find(entry=>entry.id===node.id);
  assert.equal(finding.reason,field);
  assert.equal(finding.resource.type,type);
  assert.equal(finding.actualColor,'#ff0000ff');
  assert.deepEqual(finding.actions.map(action=>[action.kind,action.targetName,action.targetColor]),[['bind-variable',token.name,'#0000ff80']]);
  assert.match(finding.actions[0].id,/^finding-action:/);
 }
 assert.equal(entries.find(entry=>entry.id===gradient.id).actualColor,undefined);
 assert.deepEqual(h.calls,[]);
});

test('Design fixes one confirmed color field without rerunning or rewriting the accepted audit',async t=>{
 const payload=structuredClone(embedded.payload),collection=payload.tokenCatalogs[0].collections[0];
 const migration=require('../src/v3-audit/remediation/blue-tint-migration.json');
 const link='182feecc4124025888d1b3a12e64b2fff6dfd481', opaque='e4ba6dbc4798f1b6feac19a65dea6f835e139f2f', inverted='a5c552b018c9ee0c261e1c445eb393b20a47fca1';
 const linkToken=migration.styles[link][0].key, active=migration.styles[inverted].find(({role})=>role==='component').key;
 const unavailable=migration.styles[inverted].find(({role})=>role==='modal').key;
 const oldColor={r:0.11,g:0.11,b:0.12}, dark={r:0,g:0,b:0.5};
 Object.assign(collection,{id:'VariableCollectionId:2:1',defaultModeId:'light',modes:[{modeId:'light'},{modeId:'dark'}]});
 for(const key of [linkToken,active,unavailable]){
  collection.variables.push({key,name:migration.tokens[key].name,resolvedType:'COLOR',actualValuesByMode:{light:[oldColor],dark:[dark]}});
  payload.resources.tokens[key]={status:key===unavailable?'deprecated':'active',closed:false};
 }
 for(const key of [link,opaque,inverted]){
  payload.resources.styles[key]={status:'deprecated',closed:false};
  payload.styleCatalogs[0].styles.push({key, name:key, type:'paint'});
 }
 const h=fixture(t,{index:()=>createOfflineAuditIndex(payload,embedded.dataId)});
 const ids=new Map([[link,'legacyLink'],[opaque,'legacyOpaque'],[inverted,'legacyInverted']]);
 h.figma.getStyleByIdAsync=async id=>({key:[...ids].find(([,value])=>value===id)?.[0],name:id});
 const raw=()=>[{type:'SOLID',color:oldColor}];
 const node=(id,key,field)=>({id,type:'RECTANGLE',name:id,parent:h.page,visible:true,opacity:1,
  resolvedVariableModes:{[collection.id]:'dark'},[field+'StyleId']:ids.get(key),[field==='fill'?'fills':'strokes']:raw()});
 const fill=node('1:3',link,'fill'),stroke=node('1:4',inverted,'stroke'),noReplacement=node('1:5',opaque,'fill');
 stroke.fills=raw();stroke.fillStyleId=ids.get(link);
 const multiple=node('1:6',link,'fill');multiple.fills=raw().concat(raw());
 const rawLayer=node('1:7',null,'fill');
 h.page.children=[fill,stroke,noReplacement,multiple,rawLayer];h.page.selection=h.page.children;
 const imported=[];
 h.figma.variables.importVariableByKeyAsync=async key=>{imported.push(key);return{key,id:'VariableID:'+key,resolvedType:'COLOR'};};
 h.figma.variables.setBoundVariableForPaint=(paint,property,variable)=>Object.assign({},paint,{boundVariables:{[property]:{type:'VARIABLE_ALIAS',id:variable.id}}});
 let afterPaintWrite=false,peerReads=0;
 const peerPaints=noReplacement.fills;
 Object.defineProperty(noReplacement,'fills',{get:()=>{if(afterPaintWrite)peerReads++;return peerPaints;}});
 let strokes=stroke.strokes;
 Object.defineProperty(stroke,'strokes',{get:()=>strokes,set:value=>{
  strokes=value;stroke.strokeStyleId='';afterPaintWrite=true;
  h.observeChange({nodeChanges:[{id:stroke.id,type:'PROPERTY_CHANGE',properties:['strokes','strokeStyleId']}]});
 }});
 let fills=stroke.fills;
 Object.defineProperty(stroke,'fills',{get:()=>fills,set:value=>{fills=value;stroke.fillStyleId='';}});
 const result=await h.run();
 assert(result.hasAcceptedResult,result.lastAttempt?.error);
 const styles=result.originalPayload.visibleViews.deprecatedStyles;
 const finding=(id,reason='fill')=>styles.find(row=>row.id===id&&row.reason===reason);
 assert.deepEqual(finding(fill.id).actions.map(a=>[a.kind,a.label,a.targetName,a.targetColor]),[['bind-variable','Заменить','text/info','#000080ff']]);
 assert.deepEqual(finding(stroke.id,'stroke').actions.map(a=>[a.targetGroup,a.targetName]),[['Поверхность компонента','neutral_inverted/100']]);
 for(const skipped of [noReplacement,multiple]) assert.equal(finding(skipped.id).actions,undefined);
 fill.fillStyleId='changed';
 assert.equal(await h.ui.action(finding(fill.id).actions[0].id),false);
 assert.deepEqual(imported,[]);
 const refused=h.ui.snapshot().trace.sessions.at(-1).native.events.filter(event=>event.event==='operation-phase-end');
 assert.deepEqual(refused.map(({stage,outcome})=>[stage,outcome]),[['source-verification','error']]);
 const refreshed=await h.run();
 const baseline=JSON.stringify(refreshed.originalPayload);
 const countResults=()=>h.posts.filter(m=>m.type==='v3-audit-result').length;
 const results=countResults(),progress=h.posts.filter(m=>m.type==='v3-audit-progress').length;
 const actionsFor=field=>refreshed.originalPayload.visibleViews.deprecatedStyles.find(row=>row.id===stroke.id&&row.reason===field).actions;
 const visible=()=>{const state=h.ui.getState();return buildV3Groups(state.result,{},state).groups[0].categories.find(c=>c.id==='deprecatedStyles').entries;};
 const strokeAction=actionsFor('stroke')[0];
 assert.equal(await h.ui.action(strokeAction.id),true);
 assert.deepEqual(imported,[active]);
 const operation=h.ui.snapshot().trace.sessions.at(-1).native.events;
 const phases=operation.filter(event=>event.event==='operation-phase-end');
 assert.deepEqual(phases.map(({stage,outcome})=>[stage,outcome]),[['source-verification','success'],['token-import','success'],['source-verification-before-write','success']]);
 assert(phases.every(({durationMs,sequence})=>durationMs>=0&&sequence<operation.find(event=>event.event==='mutation-start').sequence));
 assert.equal(stroke.strokes[0].boundVariables.color.id,'VariableID:'+active);
 assert.equal(h.ui.busy(),false);
 assert.equal(peerReads,0);
 afterPaintWrite=false;
 assert(!visible().some(row=>row.item.id===stroke.id&&row.item.reason==='stroke'));
 assert(visible().some(row=>row.item.id===stroke.id&&row.item.reason==='fill'));
 assert(visible().some(row=>row.item.id===noReplacement.id));
 assert.equal(await h.ui.action(strokeAction.id),false);
 assert.equal(await h.ui.action(actionsFor('fill')[0].id),true);
 assert.deepEqual(imported,[active,linkToken]);
 assert(!visible().some(row=>row.item.id===stroke.id));
 const rawAction=refreshed.originalPayload.visibleViews.customStyles.find(row=>row.id===rawLayer.id).actions.find(action=>action.kind==='bind-variable');
 assert.equal(await h.ui.action(rawAction.id),true);
 const state=h.ui.getState();
 assert(!buildV3Groups(state.result,{},state).groups[0].categories.find(c=>c.id==='detachedStyles').entries.some(row=>row.item.id===rawLayer.id));
 const after=h.ui.snapshot();
 assert.equal(after.runId,refreshed.runId);
 assert.equal(after.stale,false);
 assert.equal(JSON.stringify(after.originalPayload),baseline);
 assert.deepEqual(after.paintFixes,[{nodeId:stroke.id,field:'stroke'},{nodeId:stroke.id,field:'fill'},{nodeId:rawLayer.id,field:'fill'}]);
 assert.equal(countResults(),results);
 assert.equal(h.posts.filter(m=>m.type==='v3-audit-progress').length,progress);
 assert.deepEqual(h.calls,[]);
});

for(const external of [false,true])test('Color binding keeps original findings and skips full recheck when '+(external?'another layer changed':'the binding cannot be confirmed'),async t=>{
 const payload=structuredClone(embedded.payload),token=payload.tokenCatalogs[0].collections[0].variables[0];
 token.actualValuesByMode={mode:[{r:1,g:0,b:0}]};
 const audit=fixture(t,{index:()=>createOfflineAuditIndex(payload,embedded.dataId)});
 const layer={id:'1:3',type:'RECTANGLE',name:'Цвет',parent:audit.page,visible:true},peer={id:'1:4',type:'RECTANGLE',name:'Соседний слой',parent:audit.page,visible:true,fills:[{type:'SOLID',color:{r:1,g:0,b:0}}]};
 audit.page.children=[layer,peer];audit.page.selection=audit.page.children;
 let current=[{type:'SOLID',color:{r:1,g:0,b:0}}];
 Object.defineProperty(layer,'fills',{get:()=>current,set:value=>{
  if(!external)return;
  current=value;
  peer.fills=[{type:'SOLID',color:{r:0,g:1,b:0}}];
  audit.observeChange({nodeChanges:[{id:peer.id,node:peer,type:'PROPERTY_CHANGE',properties:['fills']}]});
 }});
 audit.figma.variables.importVariableByKeyAsync=async key=>({id:'VariableID:'+key,key,resolvedType:'COLOR'});
 audit.figma.variables.setBoundVariableForPaint=(paint,field,variable)=>Object.assign({},paint,{boundVariables:{[field]:{type:'VARIABLE_ALIAS',id:variable.id}}});
 const first=await audit.run();
 const finding=first.originalPayload.visibleViews.customStyles.find(row=>row.reason==='fill');
 assert(finding?.actions?.some(action=>action.kind==='bind-variable'));
 const target=first.originalPayload.visibleViews.customStyles.find(row=>row.id===layer.id).actions.find(action=>action.kind==='bind-variable');
 const peerAction=first.originalPayload.visibleViews.customStyles.find(row=>row.id===peer.id).actions.find(action=>action.kind==='bind-variable');
 assert.equal(await audit.ui.action(target.id),external);
 const after=audit.ui.snapshot();
 assert.equal(after.stale,!external);
 assert.deepEqual(after.paintFixes,external?[{nodeId:layer.id,field:'fill'}]:undefined);
 assert.deepEqual(after.originalPayload,first.originalPayload);
 assert.equal(audit.posts.filter(m=>m.type==='v3-audit-result').length,1);
 if(external){
  assert.deepEqual(audit.ui.getState().staleActionIds,[peerAction.id]);
  assert.equal(await audit.ui.action(peerAction.id),false);
 }else assert.equal(audit.posts.find(m=>m.type==='v3-audit-operation-error').code,'AUDIT_ACTION_UNCONFIRMED');
});

test('Color binding rechecks only its dependencies and refuses a target edit during token import',async t=>{
 const payload=structuredClone(embedded.payload),token=payload.tokenCatalogs[0].collections[0].variables[0];
 token.actualValuesByMode={mode:[{r:1,g:0,b:0}]};
 const h=fixture(t,{index:()=>createOfflineAuditIndex(payload,embedded.dataId)});
 const layer={id:'1:3',type:'RECTANGLE',name:'Color',parent:h.instance,visible:true,fills:[{type:'SOLID',color:{r:1,g:0,b:0}}]};
 const second=Object.assign({},layer,{id:'1:4',name:'Other color'});
 const outside=Object.assign({},layer,{id:'1:5',parent:h.page,name:'Outside'});
 h.instance.children=[layer,second];h.page.children.push(outside);
 const first=await h.run();
 const actionFor=id=>first.originalPayload.visibleViews.customStyles.find(row=>row.id===id).actions.find(action=>action.kind==='bind-variable');
 h.observeChange({nodeChanges:[{id:h.instance.id,node:h.instance,type:'PROPERTY_CHANGE',properties:['opacity']}]});
 outside.name='Outside edit';
 h.observeChange({nodeChanges:[{id:outside.id,node:outside,type:'PROPERTY_CHANGE',properties:['name']}]});
 h.figma.variables.setBoundVariableForPaint=(paint,field,variable)=>Object.assign({},paint,{boundVariables:{[field]:{id:variable.id}}});
 h.figma.variables.importVariableByKeyAsync=async key=>{
  layer.fills=[{type:'SOLID',color:{r:0,g:1,b:0}}];
  return {key,id:'VariableID:'+key,resolvedType:'COLOR'};
 };
 assert.equal(await h.ui.action(actionFor(layer.id).id),false);
 assert.deepEqual(layer.fills[0].color,{r:0,g:1,b:0});
 assert.equal(h.ui.getState().stale,false);
 assert(h.ui.getState().staleActionIds.includes(actionFor(layer.id).id));
 h.figma.variables.importVariableByKeyAsync=async key=>({key,id:'VariableID:'+key,resolvedType:'COLOR'});
 assert.equal(await h.ui.action(actionFor(second.id).id),true);
 assert.equal(second.fills[0].boundVariables.color.id,'VariableID:'+token.key);
});

test('an edited root paint does not disable the page Theme action',async t=>{
 const h=fixture(t);
 const theme={id:'theme',key:'theme-key',name:'Theme',remote:true,modes:[{modeId:'old',name:'Promo'},{modeId:'corp',name:'Corp'}]};
 h.page.explicitVariableModes={theme:'old'};
 h.page.setExplicitVariableModeForCollection=(collection,mode)=>{h.page.explicitVariableModes[collection.id]=mode;};
 h.figma.variables.getVariableCollectionByIdAsync=async id=>id===theme.id?theme:null;
 h.instance.fills=[{type:'SOLID',color:{r:1,g:0,b:0}}];
 const report=await h.run();
 const action=report.originalPayload.baseChecks.find(check=>check.id==='theme').actions[0];
 h.instance.fills=[{type:'SOLID',color:{r:0,g:1,b:0}}];
 h.observeChange({nodeChanges:[{id:h.instance.id,node:h.instance,type:'PROPERTY_CHANGE',properties:['fills']}]});
 assert(await h.ui.action(action.id));
 assert.deepEqual(h.page.explicitVariableModes,{theme:'corp'});
 await until(()=>!h.ui.busy());
});
