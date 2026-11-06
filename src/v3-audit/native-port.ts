import {createV3SourceObservation} from './source-observation';
import { createAuditDataClient } from './data-client';
import { createV3AuditBridge } from './bridge';
import { FindingActionRegistry } from './remediation/findingActionRegistry';
import { createAuditSession } from './remediation/session';
import { createCooperativeYield } from './utils/promisePool';
import { sha256Hex } from './utils/sha256';
const p=require('./transport');
const {createRunTrace}=require('./run-trace');

export function createV3NativePort(options:{post(message:any):void;readRevision():number;isUnavailable():boolean;canMutate():boolean;onBusy(busy:boolean):void;onMutation():void;pluginVersion:string}){
 let seq=0,closed=false,capture:any=null,operation:any=null;
 const accepted=new Map<string,any>(),pending=new Map<string,any>();
 const busy=()=>Boolean(capture||operation);
 const post=(message:any)=>{if(!closed)options.post(message);};
 const notifyBusy=()=>options.onBusy(busy());
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
  if(!scope.invalidated){scope.invalidated=true;if(accepted.has(scope.message.requestId))post({type:'v3-audit-invalidated',schemaVersion:p.BRIDGE,runId:scope.message.requestId,sourceChange:sourceChange(scope),trace:scope.trace.snapshot()});}
  if(capture===scope)capture.bridge.invalidate();
  if(operation?.scope===scope&&!operation.started&&!operation.readonly){operation.reject(Error('AUDIT_SOURCE_CHANGED'));abortData(operation.requestId,'AUDIT_SOURCE_CHANGED');}
 }
 function sourceChange(scope:any,stage=capture===scope?'capture':operation?.scope===scope?'operation':'retained'){return Object.assign({stage},scope.observation.diagnostic()||{reason:figma.currentPage.id!==scope.pageId?'page-changed':'context-invalidated'});}
 async function settleNotifications(scope:any,guard:()=>void){const checkpoint=createCooperativeYield(guard);while(scope.notifications.size){await Promise.all(Array.from(scope.notifications));await checkpoint();}guard();}
 function assertReady(scope:any){if(scope.notifications.size)throw Error('AUDIT_SOURCE_CHANGED');}
 function captureRun(message:any,internal=false,rootIds?:string[]){
  if(closed||capture||operation&&!internal||!internal&&options.isUnavailable()){post({type:'v3-audit-error',schemaVersion:p.BRIDGE,requestId:message.requestId,code:'AUDIT_BUSY'});return;}
  const ids=rootIds||Array.from(figma.currentPage.selection.length?figma.currentPage.selection:figma.currentPage.children).map(node=>node.id);
  const scope:any={message,rootIds:ids,fileKey:figma.fileKey||null,pageId:figma.currentPage.id,revision:options.readRevision(),invalidated:false,ownerRequestId:message.requestId,session:null,notificationSerial:0,notifications:new Set<Promise<unknown>>(),observation:createV3SourceObservation()};
  scope.stage='roots';scope.trace=createRunTrace({requestId:message.requestId,runId:message.requestId,kind:message.kind,side:'native',pluginVersion:options.pluginVersion});scope.trace.add('capture-start',{rootCount:ids.length});
  scope.guard=traceGuard(scope,()=>sourceGuard(scope));scope.checkpoint=createCooperativeYield(scope.guard);
  scope.data=createAuditDataClient({loadManifest:()=>request(scope,'manifest'),readAsset:(id,file)=>request(scope,'asset',id,file),hashText:text=>sha256Hex(text,scope.guard),yieldControl:()=>scope.checkpoint()});
  scope.registry=new FindingActionRegistry();scope.registry.reset();
  scope.bridge=createV3AuditBridge({data:scope.data,pluginVersion:options.pluginVersion,findingActions:scope.registry,
   isUnavailable:()=>false,readRevision:options.readRevision,
   onGuard:guard=>{scope.guard=traceGuard(scope,guard);scope.checkpoint=createCooperativeYield(scope.guard);},onBusy:()=>notifyBusy(),
   prepareRoots:async(roots,guard)=>{scope.stage='observation';scope.trace.add('observation-start',context(scope));await scope.observation.prepare(roots,guard);scope.trace.add('observation-ready',context(scope));},
   assertPublishReady:()=>assertReady(scope),
   finish:async(guard,publish)=>{
    scope.stage='publish';let round=0;
    while(true){
     scope.trace.add('publish-barrier',Object.assign(context(scope),{round:++round}));
     await scope.checkpoint();await settleNotifications(scope,guard);
     const serial=scope.notificationSerial;
     await scope.observation.verify(guard);guard();
     if(scope.notifications.size||scope.notificationSerial!==serial){scope.trace.add('publish-retry',Object.assign(context(scope),{previousSerial:serial}));continue;}
     scope.trace.add('publish-ready',context(scope));
     publish();return;
    }
   },
   prepareResult:async(result,context)=>{scope.stage='actions';scope.trace.add('session-start',{stage:scope.stage});context.guard();await settleNotifications(scope,context.guard);scope.pageId=context.pageId;scope.revision=context.revision;scope.session=await createAuditSession(result,scope.registry,context.pageId,context.guard);context.guard();await settleNotifications(scope,context.guard);result.mutationAvailable=options.canMutate();scope.trace.add('session-ready',{stage:scope.stage});},
   post:message=>{
    if(capture!==scope)return;
    if(message.type==='v3-audit-progress'){
     scope.checked=message.progress?.checked;
     if(scope.stage!==message.progress?.stage){scope.stage=message.progress?.stage;scope.trace.add('stage',{stage:scope.stage,checked:scope.checked,total:message.progress?.total});}
    }
    const terminal=['v3-audit-result','v3-audit-error','v3-audit-cancelled'].includes(message.type);
    if(terminal)scope.trace.add('capture-terminal',Object.assign({},message.code==='AUDIT_SOURCE_CHANGED'?sourceChange(scope,'capture'):{},context(scope),{code:message.code,outcome:message.type==='v3-audit-result'?'success':message.type==='v3-audit-cancelled'?'cancelled':'error',checked:scope.checked}),message.type!=='v3-audit-result');
    if(message.type==='v3-audit-result'){
     for(const[id,old]of accepted)if(old.message.kind===scope.message.kind)accepted.delete(id);
     accepted.set(scope.message.requestId,scope);capture=null;
    }else if(['v3-audit-error','v3-audit-cancelled'].includes(message.type)){abortData(scope.ownerRequestId,message.code);capture=null;}
    const reply=message.code==='AUDIT_SOURCE_CHANGED'?Object.assign({},message,{sourceChange:sourceChange(scope,'capture')}):Object.assign({},message);
    if(terminal)reply.trace=scope.trace.snapshot();post(reply);notifyBusy();
   }});
  capture=scope;notifyBusy();scope.bridge.accept(Object.assign({},message,{rootIds:ids}));
 }
 function actionReply(task:any,type:string,extra:any){task.trace.add('operation-terminal',Object.assign(context(task.scope),extra.code==='AUDIT_SOURCE_CHANGED'?sourceChange(task.scope,'operation'):{},{stage:task.stage,code:extra.code,outcome:type==='v3-audit-operation-result'?'success':type==='v3-audit-operation-cancelled'?'cancelled':'error',mutationStarted:task.started}),type!=='v3-audit-operation-result');post(Object.assign({type,schemaVersion:p.BRIDGE,requestId:task.requestId,runId:task.scope.message.requestId,trace:task.trace.snapshot()},extra));}
 async function act(message:any){
  if(busy()||options.isUnavailable()){post({type:'v3-audit-operation-error',schemaVersion:p.BRIDGE,requestId:message.requestId,runId:message.runId,code:'AUDIT_BUSY'});return;}
  const scope=accepted.get(message.runId);
  if(!scope){post({type:'v3-audit-operation-error',schemaVersion:p.BRIDGE,requestId:message.requestId,runId:message.runId,code:'AUDIT_SESSION_UNAVAILABLE'});return;}
  let reject!:(error:Error)=>void;const cancelled=new Promise<never>((_,fail)=>{reject=fail;});
  const task:any={scope,requestId:message.requestId,cancelled:false,started:false,readonly:message.type==='v3-audit-focus',reject,stage:message.type.replace('v3-audit-',''),trace:createRunTrace({requestId:message.requestId,runId:scope.message.requestId,kind:scope.message.kind,side:'native',pluginVersion:options.pluginVersion})};operation=task;scope.ownerRequestId=task.requestId;
  task.trace.add('operation-start',context(scope));
  const guard=traceGuard(scope,()=>{if(closed||operation!==task||task.cancelled)throw Error('AUDIT_CANCELLED');if((figma.fileKey||null)!==scope.fileKey){task.trace.add('guard-refused',{stage:task.stage,reason:'file-changed',code:'AUDIT_SOURCE_CHANGED'},true);throw Error('AUDIT_SOURCE_CHANGED');}if(figma.currentPage.id!==scope.pageId){task.trace.add('guard-refused',{stage:task.stage,reason:'page-changed',code:'AUDIT_SOURCE_CHANGED'},true);throw Error('AUDIT_SOURCE_CHANGED');}if(!task.started&&!task.readonly)sourceGuard(scope);},task.trace,task.stage);
  scope.guard=guard;scope.checkpoint=createCooperativeYield(guard);notifyBusy();
  let outcome:any=null,error:any=null;
  const work=async()=>{
   // Navigation uses only the held opaque target and its original page, never current selection.
   if(task.readonly){guard();await scope.session.focus(message.focusActionId,guard);guard();return{};}
   guard();await settleNotifications(scope,guard);await scope.observation.verify(guard);guard();await scope.data.open(guard);guard();await settleNotifications(scope,guard);
   if(message.type==='v3-audit-verify')return{};
   if(message.type==='v3-audit-focus'){await scope.session.focus(message.focusActionId,guard);guard();return{};}
   if(!options.canMutate())throw Error('AUDIT_OBSERVER_UNAVAILABLE');
   return scope.session.execute(message.actionId,{assertCurrent:guard,beforeWrite:()=>{guard();if(!task.started)assertReady(scope);if(!task.started){task.trace.add('mutation-start',context(scope));task.started=true;scope.invalidated=true;options.onMutation();}}});
  };
  try{outcome=await Promise.race([work(),cancelled]);guard();}
  catch(value){error=value;}
  finally{
   abortData(task.requestId,task.cancelled?'AUDIT_CANCELLED':'AUDIT_SOURCE_CHANGED');
   if(operation===task){
    operation=null;
    const code=error?/^AUDIT_[A-Z_]+$/.test(error.message)?error.message:'AUDIT_ACTION_FAILED':null;
    const type=task.cancelled?'v3-audit-operation-cancelled':error?'v3-audit-operation-error':'v3-audit-operation-result';
    const recheckId=task.started&&!closed&&figma.currentPage.id===scope.pageId?'v3-recheck-'+(++seq):null;
    actionReply(task,type,Object.assign({code,message:outcome?.message||'',mutationStarted:task.started,recheckRequestId:recheckId},code==='AUDIT_SOURCE_CHANGED'?{sourceChange:sourceChange(scope,'operation')}:{}));
    if(recheckId){
     captureRun(Object.assign({},scope.message,{requestId:recheckId}),true,scope.rootIds);
    }else notifyBusy();
   }
  }
 }
 return{
  busy,
  observeChange(event:NodeChangeEvent){
   const scopes=new Set<any>(Array.from(accepted.values()).concat(capture?[capture]:[],operation?[operation.scope]:[]));
   for(const scope of scopes){
    if(scope.invalidated)continue;
    scope.notificationSerial++;
    const serial=scope.notificationSerial,trace=traceFor(scope);trace.add('notification',Object.assign(context(scope),{changes:event?.nodeChanges,totalChanges:Array.isArray(event?.nodeChanges)?event.nodeChanges.length:0}));
    // First-write safety retains the prior conservative event barrier.
    if(operation?.scope===scope&&!operation.started&&!operation.readonly){invalidateScope(scope);continue;}
    const check=scope.observation.unchanged(event,capture===scope).then((same:boolean)=>{trace.add('notification-result',Object.assign({},same?{}:sourceChange(scope),context(scope),{previousSerial:serial,outcome:same?'unchanged':'refused'}),!same);if(!same)invalidateScope(scope);}).catch(()=>{trace.add('notification-error',context(scope),true);invalidateScope(scope);}).finally(()=>scope.notifications.delete(check));
    scope.notifications.add(check);
   }
  },
  invalidate(callsite='native-invalidate'){
   const scopes=new Set<any>(Array.from(accepted.values()).concat(capture?[capture]:[]));for(const scope of scopes){const afterWrite=operation?.scope===scope&&operation.started===true;traceFor(scope).add('context-invalidated',Object.assign(context(scope),{callsite,outcome:afterWrite?'refresh-required':'refused'}),!afterWrite);}
   for(const scope of accepted.values())if(!scope.invalidated){scope.invalidated=true;post({type:'v3-audit-invalidated',schemaVersion:p.BRIDGE,runId:scope.message.requestId,sourceChange:sourceChange(scope),trace:scope.trace.snapshot()});}
   if(capture)capture.bridge.invalidate();
   if(operation&&!operation.started){operation.reject(Error('AUDIT_SOURCE_CHANGED'));abortData(operation.requestId,'AUDIT_SOURCE_CHANGED');}
  },
  close(){closed=true;capture?.bridge.cancel();if(operation){operation.cancelled=true;if(!operation.started)operation.reject(Error('AUDIT_CANCELLED'));}for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('AUDIT_CANCELLED'));}pending.clear();accepted.clear();},
  accept(message:any){
   if(message?.type==='v3-audit-data-response'){
    const task=pending.get(message.requestId);if(!task)return true;
    if(message.schemaVersion!==p.VERSION||message.ownerRequestId!==task.ownerRequestId||!p.exact(message,['type','schemaVersion','requestId','ownerRequestId',message.error?'error':'result']))return true;
    pending.delete(message.requestId);clearTimeout(task.timer);
    try{task.guard();if(message.error)throw Error(/^AUDIT_[A-Z_]+$/.test(message.error)?message.error:'AUDIT_DATA_UNAVAILABLE');task.trace.add('data-response',{dataRequestId:message.requestId,outcome:'success'});task.resolve(message.result);}catch(error){task.trace.add('data-response',{dataRequestId:message.requestId,code:(error as Error).message,outcome:'error'},true);task.reject(error);}return true;
   }
   if(!['v3-audit-run','v3-audit-cancel','v3-audit-focus','v3-audit-action','v3-audit-verify','v3-audit-invalidate'].includes(message?.type))return false;
   if(!p.command(message))return true;
   if(message.type==='v3-audit-invalidate'){this.invalidate('ui-context-invalidate');return true;}
   if(message.type==='v3-audit-run'){captureRun(message);return true;}
   if(message.type==='v3-audit-cancel'){
    if(capture?.message.requestId===message.requestId){capture.trace.add('cancel-request',context(capture));capture.bridge.cancel();abortData(message.requestId,'AUDIT_CANCELLED');}
    if(operation?.requestId===message.requestId){operation.trace.add('cancel-request',context(operation.scope));operation.cancelled=true;abortData(message.requestId,'AUDIT_CANCELLED');if(!operation.started)operation.reject(Error('AUDIT_CANCELLED'));}
    return true;
   }
   void act(message);return true;
  },
 };
}
