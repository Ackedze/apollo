import {createV3SourceObservation} from './source-observation';
import { createAuditDataClient } from './data-client';
import { createV3AuditBridge } from './bridge';
import { FindingActionRegistry } from './remediation/findingActionRegistry';
import { createAuditSession } from './remediation/session';
import { createCooperativeYield, designTraversalBudget } from './utils/promisePool';
import { sha256Hex } from './utils/sha256';
import { readOfflineAuditIndex, type OfflineAuditIndex } from './embedded-data';
import {createComponentTimings} from './component-timings';
import {readTrackedGlyph26} from './glyph26';
declare const __APOLLO_NATIVE_BUILD_INPUTS_SHA__: string;
const p=require('./transport');
const {createRunTrace}=require('./run-trace');
const pluginBuildId=typeof __APOLLO_NATIVE_BUILD_INPUTS_SHA__==='string'?__APOLLO_NATIVE_BUILD_INPUTS_SHA__:null;
const athenaIndexProgress=(source:string)=>source==='proxy'
 ?'Подготавливаем индексы Athena из Proxy…':'Подготавливаем индексы';

export function createV3NativePort(options:{post(message:any):void;readRevision():number;isUnavailable():boolean;canMutate():boolean;onBusy(busy:boolean):void;onMutation():void;pluginVersion:string;useCompactIndex?:boolean;offlineIndex?:()=>OfflineAuditIndex}){
 let seq=0,closed=false,capture:any=null,operation:any=null;
 let focusing:{requestId:string;cancel():void}|null=null;
 let compactIndex:Awaited<ReturnType<typeof readOfflineAuditIndex>>|null=null;
 const accepted=new Map<string,any>(),pending=new Map<string,any>();
 const busy=()=>Boolean(capture||operation);
 const post=(message:any)=>{if(!closed)options.post(message);};
 const notifyBusy=()=>options.onBusy(busy());
 function queueGlyph26Sync(scope:any){
  if(closed||!scope.glyph26Tracked?.size)return;
  const serial=scope.glyph26SyncSerial=(scope.glyph26SyncSerial||0)+1;
  clearTimeout(scope.glyph26SyncTimer);
  scope.glyph26SyncTimer=setTimeout(async()=>{
   const current=()=>!closed&&accepted.get(scope.message.requestId)===scope&&scope.glyph26SyncSerial===serial&&figma.currentPage.id===scope.pageId&&(figma.fileKey||null)===scope.fileKey;
   if(!current())return;
   if(busy()||options.isUnavailable()){queueGlyph26Sync(scope);return;}
   const guard=()=>{if(!current())throw Error('AUDIT_CANCELLED');if(busy()||options.isUnavailable())throw Error('AUDIT_BUSY');};
   try{
    const updates=await readTrackedGlyph26(Array.from(scope.glyph26Tracked),scope.rootIds,scope.pageId,guard,scope.glyph26Review.servicePattern);guard();
    const payload=JSON.stringify(updates);if(payload===scope.glyph26LastSync)return;
    scope.glyph26LastSync=payload;
    post({type:'v3-audit-glyph26-sync',schemaVersion:p.BRIDGE,runId:scope.message.requestId,sequence:serial,updates});
   }catch(error){if(current()&&(error as Error).message==='AUDIT_BUSY')queueGlyph26Sync(scope);}
  },80);
 }
 const traceFor=(scope:any)=>operation?.scope===scope?operation.trace:scope.trace;
 function context(scope:any){const revision=options.readRevision();return{stage:operation?.scope===scope?operation.stage:scope.stage,serial:scope.notificationSerial,pending:scope.notifications.size,invalidated:scope.invalidated,
  capturedRevision:scope.revision,revision,revisionChanged:revision!==scope.revision,mutationStarted:operation?.scope===scope&&operation.started===true};}
 function traceGuard(scope:any,guard:()=>void,trace=scope.trace,stage?:string){return()=>{try{guard();}catch(error){trace.add('guard-refused',Object.assign(context(scope),stage?{stage}:{},{code:(error as Error).message}),true);throw error;}};}
 function abortData(ownerRequestId:string,code:string){
  for(const[id,task]of pending)if(task.ownerRequestId===ownerRequestId){task.trace.add('data-cancelled',{dataRequestId:id,code});pending.delete(id);clearTimeout(task.timer);post({type:'v3-audit-data-cancel',schemaVersion:p.VERSION,requestId:id,ownerRequestId});task.reject(Error(code));}
 }
 function request(scope:any,kind:string,dataId?:string,fileId?:string):Promise<any>{
  scope.guard();return new Promise((resolve,reject)=>{
   const requestId='v3-data-'+(++seq),ownerRequestId=scope.ownerRequestId;
   const trace=traceFor(scope);trace.add('data-request',{dataRequestId:requestId,resource:kind,dataId,assetId:fileId});
   const timer=setTimeout(()=>{if(!pending.has(requestId))return;trace.add('data-timeout',{dataRequestId:requestId,code:'AUDIT_DATA_READ_TIMEOUT'},true);pending.delete(requestId);post({type:'v3-audit-data-cancel',schemaVersion:p.VERSION,requestId,ownerRequestId});reject(Error('AUDIT_DATA_READ_TIMEOUT'));},45000);
   pending.set(requestId,{resolve,reject,timer,ownerRequestId,guard:scope.guard,trace});
   post(Object.assign({type:'v3-audit-data-request',schemaVersion:p.VERSION,requestId,ownerRequestId,operation:kind},kind==='asset'?{dataId,fileId}:{}));
  });
 }
 function sourceGuard(scope:any){if(closed||scope.invalidated||figma.currentPage.id!==scope.pageId||options.readRevision()!==scope.revision)throw Error('AUDIT_SOURCE_CHANGED');}
 function invalidateScope(scope:any){
  const details=Object.assign({},sourceChange(scope),context(scope));scope.trace.add('source-invalidated',details,true);if(traceFor(scope)!==scope.trace)traceFor(scope).add('source-invalidated',details,true);
  if(!scope.invalidated){scope.invalidated=true;if(accepted.has(scope.message.requestId))post({type:'v3-audit-invalidated',schemaVersion:p.BRIDGE,runId:scope.message.requestId,sourceChange:sourceChange(scope),trace:scope.traceSnapshot()});}
  if(capture===scope)capture.bridge.invalidate();
  if(operation?.scope===scope&&!operation.started&&!operation.readonly){operation.reject(Error('AUDIT_SOURCE_CHANGED'));abortData(operation.requestId,'AUDIT_SOURCE_CHANGED');}
 }
 function sourceChange(scope:any,stage=capture===scope?'capture':operation?.scope===scope?'operation':'retained'){return Object.assign({stage},scope.observation.diagnostic()||{reason:figma.currentPage.id!==scope.pageId?'page-changed':'context-invalidated'});}
 async function settleNotifications(scope:any,guard:()=>void){const checkpoint=createCooperativeYield(guard);while(scope.notifications.size){await Promise.all(Array.from(scope.notifications));await checkpoint();}guard();}
 function assertReady(scope:any){if(scope.notifications.size)throw Error('AUDIT_SOURCE_CHANGED');}
 function invalidateActions(scope:any,impact:Map<string,ReadonlySet<string>|null>){
  const affected:string[]=[];
  for(const [id,dependency] of scope.actionDependencies){
   if((dependency?.affected(impact)??impact.size>0)&&!scope.staleActions.has(id)){
    scope.staleActions.add(id);affected.push(id);
   }
  }
  if(affected.length&&accepted.has(scope.message.requestId))post({type:'v3-audit-actions-invalidated',schemaVersion:p.BRIDGE,runId:scope.message.requestId,actionIds:affected,trace:scope.traceSnapshot()});
 }
 function captureRun(message:any,internal=false,rootIds?:string[]){
  if(closed||capture||operation&&!internal||!internal&&options.isUnavailable()){post({type:'v3-audit-error',schemaVersion:p.BRIDGE,requestId:message.requestId,code:'AUDIT_BUSY'});return;}
  focusing?.cancel();
  const ids=rootIds||Array.from(figma.currentPage.selection.length?figma.currentPage.selection:figma.currentPage.children).map(node=>node.id);
  const textOnly=message.kind==='texts';
  const scope:any={message,rootIds:ids,fileKey:figma.fileKey||null,pageId:figma.currentPage.id,revision:options.readRevision(),invalidated:false,ownerRequestId:message.requestId,session:null,notificationSerial:0,notifications:new Set<Promise<unknown>>(),observation:createV3SourceObservation(textOnly?'texts':'components')};
  scope.stage='roots';scope.trace=createRunTrace({requestId:message.requestId,runId:message.requestId,kind:message.kind,side:'native',pluginVersion:options.pluginVersion,pluginBuildId});scope.trace.add('capture-start',{rootCount:ids.length});
  scope.guard=traceGuard(scope,()=>sourceGuard(scope));scope.checkpoint=createCooperativeYield(scope.guard);
  scope.offlineIndex=message.kind==='components'?(options.offlineIndex||(options.useCompactIndex?async()=>{
   if(!compactIndex){
    const loaded=await readOfflineAuditIndex(await request(scope,'compact-index'),scope.guard);
    scope.guard();compactIndex=loaded;
   }
   scope.guard();scope.compactSummary=compactIndex.summary;
   scope.trace.add('data-index-ready',{dataId:compactIndex.summary.dataId,resource:compactIndex.summary.source});
   post({type:'v3-audit-progress',schemaVersion:p.BRIDGE,requestId:scope.ownerRequestId,
    progress:{stage:'data',message:athenaIndexProgress(compactIndex.summary.source)}});
   return compactIndex.index;
  }:undefined)):undefined;
  const componentTimings=scope.offlineIndex?createComponentTimings():undefined;
  scope.traceSnapshot=()=>{
   const trace=scope.trace.snapshot(),timings=componentTimings?.snapshot();
   if(timings)trace.componentTimings=timings;
   return trace;
  };
  scope.data=scope.offlineIndex?null:createAuditDataClient({loadManifest:()=>request(scope,'manifest'),readAsset:(id,file)=>request(scope,'asset',id,file),hashText:text=>sha256Hex(text,scope.guard),yieldControl:()=>scope.checkpoint()});
  scope.registry=new FindingActionRegistry();scope.registry.reset();
  scope.bridge=createV3AuditBridge({data:scope.data,offlineIndex:scope.offlineIndex,snapshot:scope.offlineIndex||textOnly?scope.observation.snapshot:undefined,pluginVersion:options.pluginVersion,findingActions:scope.registry,componentTimings,
   isUnavailable:()=>false,readRevision:options.readRevision,
   onGuard:guard=>{scope.guard=traceGuard(scope,guard);scope.checkpoint=createCooperativeYield(scope.guard,undefined,scope.offlineIndex?designTraversalBudget:undefined);},onBusy:()=>notifyBusy(),
   prepareRoots:async(roots,guard,isSharedKey)=>{
    if(scope.offlineIndex){
     componentTimings!.start();
     return scope.observation.beginTraversal(roots,guard,isSharedKey,
      (node:InstanceNode)=>componentTimings!.measure('figmaGetMainComponentAsync',()=>node.getMainComponentAsync()));
    }
    scope.stage='observation';scope.trace.add('observation-start',context(scope));
    const included=await scope.observation.prepare(roots,guard,!textOnly,isSharedKey);
    scope.trace.add('observation-ready',context(scope));return included;
   },
   assertPublishReady:()=>assertReady(scope),
   finish:async(guard,publish)=>{
    scope.stage='publish';let round=0;
    if(scope.offlineIndex){
     scope.trace.add('publish-barrier',Object.assign(context(scope),{round:1}));
     await scope.checkpoint();
     let impact:Map<string,ReadonlySet<string>|null>|null=null;
     try{impact=scope.observation.finishCapture(guard);}
     catch{guard();scope.trace.add('capture-notification-unreadable',context(scope),true);}
     scope.captureUnverified=impact===null;
     scope.capturePartial=impact===null||impact.size>0;
     if(impact?.size)invalidateActions(scope,impact);
     if(scope.capturePartial)scope.trace.add('capture-coverage',Object.assign(context(scope),sourceChange(scope,'capture'),{outcome:'partial'}));
     guard();scope.trace.add('publish-ready',context(scope));publish();return;
    }
    while(true){
     scope.trace.add('publish-barrier',Object.assign(context(scope),{round:++round}));
     await scope.checkpoint();await settleNotifications(scope,guard);
     const serial=scope.notificationSerial;
     await scope.observation.verify(guard);
     guard();
     if(scope.notifications.size||scope.notificationSerial!==serial){scope.trace.add('publish-retry',Object.assign(context(scope),{previousSerial:serial}));continue;}
     scope.trace.add('publish-ready',context(scope));
     publish();return;
    }
   },
   prepareResult:async(result,context)=>{
    scope.stage='actions';scope.trace.add('session-start',{stage:scope.stage});
    await settleNotifications(scope,context.guard);
    scope.pageId=context.pageId;scope.revision=context.revision;
    scope.staleActions=new Set();
    scope.actionDependencies=new Map();
    try{
     scope.session=await createAuditSession(result,scope.registry,context.pageId,context.guard,scope.offlineIndex?scope.observation.observedNode:undefined);
     if(scope.offlineIndex)for(const action of scope.session.actionScopes()){
      scope.actionDependencies.set(action.id,scope.observation.dependencies(action.targets,action.paint,action.page?figma.currentPage:undefined));
     }
    }catch(error){
     if(!scope.offlineIndex)throw error;
     context.guard();
     scope.session=null;
     scope.trace.add('session-unavailable',{stage:scope.stage,outcome:'partial',code:'AUDIT_SESSION_UNAVAILABLE'},true);
    }
    await settleNotifications(scope,context.guard);
    result.mutationAvailable=scope.session!==null&&options.canMutate();
    if(scope.session)scope.trace.add('session-ready',{stage:scope.stage});
   },
   post:message=>{
    if(capture!==scope)return;
    if(message.type==='v3-audit-progress'){
     scope.checked=message.progress?.checked;
     if(scope.stage!==message.progress?.stage){scope.stage=message.progress?.stage;scope.trace.add('stage',{stage:scope.stage,checked:scope.checked,total:message.progress?.total});}
    }
    const terminal=['v3-audit-result','v3-audit-error','v3-audit-cancelled'].includes(message.type);
    if(terminal)scope.trace.add('capture-terminal',Object.assign({},message.code==='AUDIT_SOURCE_CHANGED'?sourceChange(scope,'capture'):{},context(scope),message.failure??{},{code:message.code,outcome:message.type==='v3-audit-result'?'success':message.type==='v3-audit-cancelled'?'cancelled':'error',checked:scope.checked}),message.type!=='v3-audit-result');
    if(message.type==='v3-audit-result'){
     if(scope.message.kind==='components')scope.glyph26Review={
      candidates:(message.result.visibleViews?.glyph26||[]).map((item:any)=>({id:item.id,key:item.componentKey})),
      servicePattern:(message.result.glyph26?.findings||[]).some((item:any)=>item.reason==='service-pattern-required'),
     };
     scope.glyph26Tracked=new Set<string>();scope.glyph26Watch=new Set<string>(scope.rootIds);
     for(const item of scope.glyph26Review?.candidates||[]){
      let node=scope.observation.observedNode(item.id);
      while(node&&node.type!=='PAGE'&&node.type!=='DOCUMENT'){scope.glyph26Watch.add(node.id);node=node.parent;}
     }
     for(const[id,old]of accepted)if(old.message.kind===scope.message.kind){clearTimeout(old.glyph26SyncTimer);accepted.delete(id);}
     accepted.set(scope.message.requestId,scope);capture=null;
    }else if(['v3-audit-error','v3-audit-cancelled'].includes(message.type)){abortData(scope.ownerRequestId,message.code);capture=null;}
    const reply=message.code==='AUDIT_SOURCE_CHANGED'?Object.assign({},message,{sourceChange:sourceChange(scope,'capture')}):Object.assign({},message);
    if(message.type==='v3-audit-progress'&&message.progress.stage==='indexes'&&scope.compactSummary){
     reply.progress=Object.assign({},message.progress,{message:athenaIndexProgress(scope.compactSummary.source)});
    }
    if(terminal)reply.trace=scope.traceSnapshot();
    if(message.type==='v3-audit-result'&&scope.compactSummary)reply.result.athenaIndex=scope.compactSummary;
    if(message.type==='v3-audit-result'&&scope.offlineIndex){
     const gaps=(reply.result.offlineCoverage?.gaps??[]).slice();
     if(!scope.session)gaps.push('capture-session-unavailable');
     if(scope.capturePartial){
      gaps.push('capture-source-changed');
      if(scope.captureUnverified)reply.result.mutationAvailable=false;
      reply.staleActionIds=Array.from(scope.staleActions);
      reply.sourceChange=sourceChange(scope,'capture');
     }
     reply.result.offlineCoverage={gaps};
    }
    post(reply);notifyBusy();
   }});
  capture=scope;notifyBusy();scope.bridge.accept(Object.assign({},message,{rootIds:ids}));
 }
 function actionReply(task:any,type:string,extra:any){task.trace.add('operation-terminal',Object.assign(context(task.scope),['AUDIT_SOURCE_CHANGED','AUDIT_ACTION_SOURCE_CHANGED'].includes(extra.code)?sourceChange(task.scope,'operation'):{},{stage:task.stage,code:extra.code,outcome:type==='v3-audit-operation-result'?'success':type==='v3-audit-operation-cancelled'?'cancelled':'error',mutationStarted:task.started}),type!=='v3-audit-operation-result');post(Object.assign({type,schemaVersion:p.BRIDGE,requestId:task.requestId,runId:task.scope.message.requestId,trace:task.trace.snapshot()},extra));}
 async function focus(message:any){
  const scope=accepted.get(message.runId);
  if(!scope?.session)return post({type:'v3-audit-operation-error',schemaVersion:p.BRIDGE,requestId:message.requestId,runId:message.runId,code:'AUDIT_SESSION_UNAVAILABLE'});
  focusing?.cancel();
  const task={scope,requestId:message.requestId,stage:'focus',started:false,trace:createRunTrace({
   requestId:message.requestId,runId:message.runId,kind:scope.message.kind,side:'native',pluginVersion:options.pluginVersion,
  })};
  let reject!:(error:Error)=>void,cancelled=false;
  const cancelledWork=new Promise<never>((_,fail)=>{reject=fail;});
  const current={requestId:message.requestId,cancel(){
   if(cancelled)return;
   cancelled=true;task.trace.add('cancel-request',context(scope));reject(Error('AUDIT_CANCELLED'));
  }};
  focusing=current;
  task.trace.add('operation-start',context(scope));
  const guard=()=>{
   if(closed||cancelled||focusing!==current||accepted.get(message.runId)!==scope)throw Error('AUDIT_CANCELLED');
   if(busy()||options.isUnavailable())throw Error('AUDIT_BUSY');
   const reason=(figma.fileKey||null)!==scope.fileKey?'file-changed':figma.currentPage.id!==scope.pageId?'page-changed':null;
   if(reason){
    task.trace.add('guard-refused',{stage:'focus',reason,code:'AUDIT_SOURCE_CHANGED'},true);
    throw Error('AUDIT_SOURCE_CHANGED');
   }
  };
  try{
   await Promise.race([scope.session.focus(message.focusActionId,guard,task.trace),cancelledWork]);
   actionReply(task,'v3-audit-operation-result',{mutationStarted:false});
  }catch(error){
   actionReply(task,cancelled?'v3-audit-operation-cancelled':'v3-audit-operation-error',{code:(error as Error).message,mutationStarted:false});
  }finally{if(focusing===current)focusing=null;}
 }
 async function act(message:any){
  if(busy()||options.isUnavailable()){post({type:'v3-audit-operation-error',schemaVersion:p.BRIDGE,requestId:message.requestId,runId:message.runId,code:'AUDIT_BUSY'});return;}
  const scope=accepted.get(message.runId);
  if(!scope?.session){post({type:'v3-audit-operation-error',schemaVersion:p.BRIDGE,requestId:message.requestId,runId:message.runId,code:'AUDIT_SESSION_UNAVAILABLE'});return;}
  focusing?.cancel();
  let reject!:(error:Error)=>void;const cancelled=new Promise<never>((_,fail)=>{reject=fail;});
  const task:any={scope,requestId:message.requestId,cancelled:false,started:false,reject,stage:message.type.replace('v3-audit-',''),trace:createRunTrace({requestId:message.requestId,runId:scope.message.requestId,kind:scope.message.kind,side:'native',pluginVersion:options.pluginVersion})};operation=task;scope.ownerRequestId=task.requestId;
  const paint=scope.offlineIndex&&message.type==='v3-audit-action'?scope.session.paintAction(message.actionId):null;
  const textReplacement=message.type==='v3-audit-text-replace';
  const dependency=scope.offlineIndex&&message.type==='v3-audit-action'?scope.actionDependencies.get(message.actionId):null;
  if(paint)task.paintEvents=[];
  if(textReplacement)task.textEvents=[];
  const textPhases:Array<(outcome:string)=>void>=[];
  function textPhase(stage:string){
   const finish=task.trace.startPhase(stage);let open=true;
   const close=(outcome:string)=>{if(open){open=false;finish(outcome);}};textPhases.push(close);return close;
  }
  task.trace.add('operation-start',context(scope));
  const guard=traceGuard(scope,()=>{if(closed||operation!==task||task.cancelled)throw Error('AUDIT_CANCELLED');if((figma.fileKey||null)!==scope.fileKey){task.trace.add('guard-refused',{stage:task.stage,reason:'file-changed',code:'AUDIT_SOURCE_CHANGED'},true);throw Error('AUDIT_SOURCE_CHANGED');}if(figma.currentPage.id!==scope.pageId){task.trace.add('guard-refused',{stage:task.stage,reason:'page-changed',code:'AUDIT_SOURCE_CHANGED'},true);throw Error('AUDIT_SOURCE_CHANGED');}if(textReplacement&&task.started&&(task.textInterrupted||options.readRevision()!==task.textRevision))throw Error('AUDIT_SOURCE_CHANGED');if(!task.started){sourceGuard(scope);if(scope.staleActions.has(message.actionId))throw Error('AUDIT_ACTION_SOURCE_CHANGED');}},task.trace,task.stage);
  scope.guard=guard;scope.checkpoint=createCooperativeYield(guard);notifyBusy();
  const paintGuard=()=>{
   guard();
   if(task.started&&(task.paintInterrupted||options.readRevision()!==task.paintRevision))throw Error('AUDIT_SOURCE_CHANGED');
  };
  let outcome:any=null,error:any=null;
  const work=async()=>{
   if(textReplacement)task.finishTextPreparation=textPhase('text-preparation');
   if(scope.captureUnverified)throw Error('AUDIT_ACTION_SOURCE_CHANGED');
   guard();await settleNotifications(scope,guard);
   const finishVerification=paint?task.trace.startPhase('source-verification'):undefined;
   let verified=false;
   try{if(!textReplacement){if(dependency)await dependency.verify(guard);else await scope.observation.verify(guard);}verified=true;}
   finally{finishVerification?.(verified?'success':'error');}
   guard();
   if(scope.data)await scope.data.open(guard);
   guard();await settleNotifications(scope,guard);
   if(message.type==='v3-audit-verify')return{};
   if(!options.canMutate())throw Error('AUDIT_OBSERVER_UNAVAILABLE');
   if(textReplacement&&scope.message.kind!=='texts')throw Error('AUDIT_ACTION_UNAVAILABLE');
   const beforeWrite=()=>{
    guard();if(task.started)return;
    assertReady(scope);
    if(dependency)dependency.assertCurrent();
    else if(paint)scope.observation.assertNodeCurrent(paint.nodeId);
    if(paint&&dependency){
     task.paintPreimage=scope.observation.paintPreimage(paint.nodeId);
     if(!task.paintPreimage)throw Error('AUDIT_ACTION_SOURCE_CHANGED');
    }
    if(textReplacement)task.finishTextWrite=textPhase('text-write');
    task.trace.add('mutation-start',context(scope));task.started=true;scope.invalidated=true;
    task.announcingMutation=true;
    try{options.onMutation();}finally{task.announcingMutation=false;}
    if(paint)task.paintRevision=options.readRevision();
    if(textReplacement)task.textRevision=options.readRevision();
   };
   if(textReplacement){
    let applied:any;
    try{applied=await scope.session.replaceTexts(message.replacements,{assertCurrent:guard,beforeWrite,verifyBeforeWrite:async()=>{
     guard();task.finishTextPreparation?.('success');task.finishTextPreparation=null;
     const finish=textPhase('source-verification');let verified=false;
     try{await settleNotifications(scope,guard);await scope.observation.verify(guard);await settleNotifications(scope,guard);verified=true;}
     finally{finish(verified?'success':'error');}
    }});}finally{task.finishTextWrite?.(applied?'success':'error');task.finishTextWrite=null;}
    task.completedTexts=applied.textReplacements;guard();
    const finish=textPhase('text-confirmation');let confirmed=false;
    try{
     scope.observation.recordTextChanges(applied.textReplacements);
     scope.observation.assertTextCurrent(guard);
     for(const event of task.textEvents){if(!await scope.observation.unchanged(event,true))throw Error('AUDIT_SOURCE_CHANGED');guard();}
     // Notification identity reads may yield; recheck facts after that boundary.
     if(task.textEvents.length)scope.observation.assertTextCurrent(guard);
     task.textEventsChecked=task.textEvents.length;guard();task.textRetained=true;confirmed=true;
     return applied;
    }finally{finish(confirmed?'success':'error');}
   }
   const verifyBeforeWrite=dependency?async()=>{
    await settleNotifications(scope,guard);
    const finish=paint?task.trace.startPhase('source-verification-before-write'):undefined;
    let verified=false;
    try{await dependency.verify(guard);verified=true;}
    finally{finish?.(verified?'success':'error');}
    await settleNotifications(scope,guard);
   }:undefined;
   if(!paint)return scope.session.execute(message.actionId,{assertCurrent:guard,beforeWrite,verifyBeforeWrite});
   const applied=await scope.session.applyPaint(message.actionId,{assertCurrent:paintGuard,beforeWrite,verifyBeforeWrite},()=>task.trace.startPhase('token-import'));
   paintGuard();
   scope.observation.recordPaintChange(paint.nodeId,paint.styleField,task.paintPreimage);
   for(const event of task.paintEvents){
    const impact=await scope.observation.impacts(event);
    if(!impact||dependency?.affected(impact))throw Error('AUDIT_SOURCE_CHANGED');
    invalidateActions(scope,impact);
    paintGuard();
   }
   task.paintEventsChecked=task.paintEvents.length;
   return applied;
  };
  try{
   outcome=await Promise.race([work(),cancelled]);
   if(paint){paintGuard();if(task.paintEventsChecked!==task.paintEvents.length)throw Error('AUDIT_SOURCE_CHANGED');}
   else{guard();if(textReplacement&&task.textEventsChecked!==task.textEvents.length)throw Error('AUDIT_SOURCE_CHANGED');}
  }
  catch(value){error=value;if(textReplacement&&task.completedTexts&&!error.textReplacements)error.textReplacements=task.completedTexts;}
  finally{
   for(const finish of textPhases)finish(error||task.cancelled?'error':'success');task.finishTextPreparation=null;
   abortData(task.requestId,task.cancelled?'AUDIT_CANCELLED':'AUDIT_SOURCE_CHANGED');
   if(operation===task){
    operation=null;
    const code=error?/^AUDIT_[A-Z_]+$/.test(error.message)?error.message:'AUDIT_ACTION_FAILED':null;
    const type=task.cancelled?'v3-audit-operation-cancelled':error?'v3-audit-operation-error':'v3-audit-operation-result';
    const recheckId=!paint&&!textReplacement&&task.started&&!closed&&figma.currentPage.id===scope.pageId?'v3-recheck-'+(++seq):null;
    const paintFix=paint&&type==='v3-audit-operation-result'?outcome?.paintFix:null;
    if(paintFix){scope.revision=task.paintRevision;scope.invalidated=false;}
    const textRetained=textReplacement&&task.textRetained&&type==='v3-audit-operation-result';
    if(textRetained){scope.revision=task.textRevision;scope.invalidated=false;}
    if(code==='AUDIT_ACTION_SOURCE_CHANGED'&&dependency&&!task.started){
     scope.staleActions.add(message.actionId);
     post({type:'v3-audit-actions-invalidated',schemaVersion:p.BRIDGE,runId:scope.message.requestId,actionIds:[message.actionId]});
    }
    const completedTexts=textReplacement?(outcome?.textReplacements||error?.textReplacements)?.filter((row:any)=>{
     try{const node=scope.observation.observedNode(row.nodeId);if(!node||node.type!=='TEXT'||node.removed||node.characters!==row.text)return false;let parent=node.parent;while(parent&&parent.type!=='PAGE')parent=parent.parent;return parent?.id===scope.pageId;}catch{return false;}
    }):null;
    actionReply(task,type,Object.assign({code,message:outcome?.message||'',mutationStarted:task.started,recheckRequestId:recheckId},
     paintFix?{paintFix}:textRetained?{stale:false}:(paint||textReplacement)&&task.started?{stale:true}:{},
     completedTexts?{textReplacements:completedTexts,failedTextNodeId:error?.failedTextNodeId}:{},
     (code==='AUDIT_SOURCE_CHANGED'||code==='AUDIT_ACTION_SOURCE_CHANGED')?{sourceChange:sourceChange(scope,'operation')}:{}));
    if(recheckId){
     captureRun(Object.assign({},scope.message,{requestId:recheckId}),true,scope.rootIds);
    }else notifyBusy();
   }
  }
 }
 return{
  busy,
  recordGlyph26Replacements(ids:string[]){
   for(const scope of accepted.values()){
    const allowed=new Set((scope.glyph26Review?.candidates||[]).map((item:any)=>item.id));
    for(const id of ids)if(allowed.has(id))scope.glyph26Tracked.add(id);
    queueGlyph26Sync(scope);
   }
  },
  syncTrackedGlyph26(){for(const scope of accepted.values())queueGlyph26Sync(scope);},
  async glyph26Review(runId:string,platform:string){
   const scope=accepted.get(runId);
   const guard=()=>{
    if(closed||busy()||accepted.get(runId)!==scope||!scope?.glyph26Review||scope.message.channel!==platform||!['iOS','Android'].includes(platform))throw Error('Результат ревью недоступен. Повтори проверку в Apollo.');
    if((figma.fileKey||null)!==scope.fileKey||figma.currentPage.id!==scope.pageId)throw Error('Открыт другой макет. Вернись к проверенной области.');
   };
   guard();const roots:SceneNode[]=[];
   for(const id of scope.rootIds){
    const node=await figma.getNodeByIdAsync(id);guard();
    let parent=node;while(parent&&parent.type!=='PAGE')parent=parent.parent;
    if(!node||node.removed||node.type==='PAGE'||node.type==='DOCUMENT'||parent?.id!==scope.pageId)throw Error('Проверенная область недоступна. Повтори проверку в Apollo.');
    roots.push(node as SceneNode);
   }
   return {page:figma.currentPage,roots,candidates:scope.glyph26Review.candidates,servicePattern:scope.glyph26Review.servicePattern};
  },
  observeChange(event:NodeChangeEvent){
   for(const scope of accepted.values())if(event.nodeChanges?.some(change=>scope.glyph26Watch?.has(change.id)))queueGlyph26Sync(scope);
   const scopes=new Set<any>(Array.from(accepted.values()).concat(capture?[capture]:[],operation?[operation.scope]:[]));
   for(const scope of scopes){
    if(scope.invalidated){
     if(operation?.scope===scope&&operation.textEvents){
      if(operation.textEvents.length<32)operation.textEvents.push(event);else operation.textInterrupted=true;
     }
     if(operation?.scope===scope&&operation.paintEvents){
      if(operation.paintEvents.length<32)operation.paintEvents.push(event);
      else operation.paintInterrupted=true;
     }
     continue;
    }
    scope.notificationSerial++;
    const serial=scope.notificationSerial,trace=traceFor(scope);trace.add('notification',Object.assign(context(scope),{changes:event?.nodeChanges,totalChanges:Array.isArray(event?.nodeChanges)?event.nodeChanges.length:0}));
    if(scope.offlineIndex&&capture===scope){
     scope.observation.queueCaptureChange(event);
     trace.add('notification-result',Object.assign(context(scope),{previousSerial:serial,outcome:'queued'}));
     continue;
    }
    // First-write safety retains the prior conservative event barrier.
    if(scope.offlineIndex&&accepted.get(scope.message.requestId)===scope){
     const check=scope.observation.impacts(event).then((impact:Map<string,ReadonlySet<string>|null>|null)=>{
      trace.add('notification-result',Object.assign(context(scope),{previousSerial:serial,outcome:!impact?'refused':impact.size?'changed':'unchanged'}),!impact);
      if(!impact)invalidateScope(scope);else invalidateActions(scope,impact);
     }).catch(()=>invalidateScope(scope)).finally(()=>scope.notifications.delete(check));
     scope.notifications.add(check);continue;
    }
    if(operation?.scope===scope&&!operation.started){invalidateScope(scope);continue;}
    const check=scope.observation.unchanged(event,capture===scope||scope.message.kind==='texts').then((same:boolean)=>{trace.add('notification-result',Object.assign({},same?{}:sourceChange(scope),context(scope),{previousSerial:serial,outcome:same?'unchanged':'refused'}),!same);if(!same)invalidateScope(scope);}).catch(()=>{trace.add('notification-error',context(scope),true);invalidateScope(scope);}).finally(()=>scope.notifications.delete(check));
    scope.notifications.add(check);
   }
  },
  invalidate(callsite='native-invalidate'){
   for(const scope of accepted.values())queueGlyph26Sync(scope);
   if(operation?.paintEvents&&operation.started&&!operation.announcingMutation)operation.paintInterrupted=true;
   if(operation?.textEvents&&operation.started&&!operation.announcingMutation)operation.textInterrupted=true;
   const scopes=new Set<any>(Array.from(accepted.values()).concat(capture?[capture]:[]));for(const scope of scopes){const afterWrite=operation?.scope===scope&&operation.started===true;traceFor(scope).add('context-invalidated',Object.assign(context(scope),{callsite,outcome:afterWrite?'refresh-required':'refused'}),!afterWrite);}
   for(const scope of accepted.values())if(!scope.invalidated){scope.invalidated=true;post({type:'v3-audit-invalidated',schemaVersion:p.BRIDGE,runId:scope.message.requestId,sourceChange:sourceChange(scope),trace:scope.traceSnapshot()});}
   if(capture)capture.bridge.invalidate();
   if(operation&&!operation.started){operation.reject(Error('AUDIT_SOURCE_CHANGED'));abortData(operation.requestId,'AUDIT_SOURCE_CHANGED');}
  },
  close(){closed=true;for(const scope of accepted.values())clearTimeout(scope.glyph26SyncTimer);focusing?.cancel();capture?.bridge.cancel();if(operation){operation.cancelled=true;if(!operation.started)operation.reject(Error('AUDIT_CANCELLED'));}for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('AUDIT_CANCELLED'));}pending.clear();accepted.clear();},
  accept(message:any){
   if(message?.type==='v3-audit-data-response'){
    const task=pending.get(message.requestId);if(!task)return true;
    if(message.schemaVersion!==p.VERSION||message.ownerRequestId!==task.ownerRequestId||!p.exact(message,['type','schemaVersion','requestId','ownerRequestId',message.error?'error':'result']))return true;
    pending.delete(message.requestId);clearTimeout(task.timer);
    try{task.guard();if(message.error)throw Error(/^AUDIT_[A-Z_]+$/.test(message.error)?message.error:'AUDIT_DATA_UNAVAILABLE');task.trace.add('data-response',{dataRequestId:message.requestId,outcome:'success'});task.resolve(message.result);}catch(error){task.trace.add('data-response',{dataRequestId:message.requestId,code:(error as Error).message,outcome:'error'},true);task.reject(error);}return true;
   }
   if(!['v3-audit-run','v3-audit-cancel','v3-audit-focus','v3-audit-action','v3-audit-text-replace','v3-audit-verify','v3-audit-invalidate'].includes(message?.type))return false;
   if(!p.command(message))return true;
   if(message.type==='v3-audit-invalidate'){this.invalidate('ui-context-invalidate');return true;}
   if(message.type==='v3-audit-run'){captureRun(message);return true;}
   if(message.type==='v3-audit-cancel'){
    if(focusing&&focusing.requestId===message.requestId)focusing.cancel();
    if(capture?.message.requestId===message.requestId){capture.trace.add('cancel-request',context(capture));capture.bridge.cancel();abortData(message.requestId,'AUDIT_CANCELLED');}
    if(operation?.requestId===message.requestId){operation.trace.add('cancel-request',context(operation.scope));operation.cancelled=true;abortData(message.requestId,'AUDIT_CANCELLED');if(!operation.started)operation.reject(Error('AUDIT_CANCELLED'));}
    return true;
   }
   if(message.type==='v3-audit-focus')void focus(message);else void act(message);
   return true;
  },
 };
}
