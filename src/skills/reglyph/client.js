'use strict';
const p = require('./protocol');
const {activity}=require('../../token-journal-protocol');
let clientSequence = 0;
const {createPickerCatalog,pickerRepresentatives,searchText,rowIdentity,reviewGroup}=require('./catalog');
function createReglyphClient({send,isBusy = () => false,onChange = () => {},onOperation=()=>null}) {
  const listeners = new Set(),queue = [],previewPending = new Map(),previewAttempts = new Map(),priorityPreviews = new Set(),retryTimers = new Map(),visiblePreviews = new Map();
  const identity = Date.now().toString(36)+'-'+(++clientSequence);
  let sequence=0,revision=0,active=null,opened=false,initialized=false,pickerCatalog=null,picker=null;
  let state={status:'idle',context:{channelId:'b2b',pickerLabel:'Desktop'},supported:false,available:true,validSelection:false,scenario:'default',planStale:false,scopeName:'',catalog:null,rows:[],observedRows:[],images:new Map(),previewErrors:new Map(),error:'',errorCode:'',errorOperation:null,confirmation:null,selectionConfirmation:null,progress:null,result:null,largePreview:null};
  function emit(patch) {state=Object.assign({},state,patch);for(const fn of listeners)fn();onChange();}
  const foreground = () => Boolean(active && !active.background) || queue.some(job=>!job.background);
  function request(operation,payload={},background=false) {
    return new Promise((resolve,reject) => {
      const job={operation,payload,background,revision,resolve,reject};
      if(background)queue.push(job);else{const index=queue.findIndex(item=>item.background);if(index<0)queue.push(job);else queue.splice(index,0,job);}
      pump();
    });
  }
  function pump() {
    if(active || !queue.length || !state.supported)return;
    if(isBusy()){emit({available:false});return;}
    while(queue.length && queue[0].operation==='preview' && state.images.has(queue[0].payload.key)){const cached=queue.shift();if(previewPending.get(cached.payload.key)===cached.previewToken)previewPending.delete(cached.payload.key);cached.resolve(null);}
    if(!queue.length)return;
    active=queue.shift();
    if(active.operation==='preview')previewAttempts.set(active.payload.key,(previewAttempts.get(active.payload.key) || 0)+1);
    const scans=active.operation==='scan' || active.operation==='selection-decision' && active.payload.decision==='switch';
    if(scans || active.operation==='replace')active.activity=activity(onOperation,scans?'reglyph-scan':'reglyph-replace');
    active.requestId='reglyph-'+identity+'-'+(++sequence);
    send({type:'reglyph-request',schemaVersion:p.SCHEMA,requestId:active.requestId,revision:active.revision,operation:active.operation,payload:active.payload});
    onChange();
  }
  function discardQueue(){while(queue.length)queue.shift().resolve(null);previewPending.clear();previewAttempts.clear();priorityPreviews.clear();for(const timer of retryTimers.values())clearTimeout(timer);retryTimers.clear();}
  function dropPreview(key) {
    priorityPreviews.delete(key);clearTimeout(retryTimers.get(key));retryTimers.delete(key);
    for(let i=queue.length-1;i>=0;i--)if(queue[i].operation==='preview' && queue[i].payload.key===key){
      const job=queue.splice(i,1)[0];if(previewPending.get(key)===job.previewToken)previewPending.delete(key);job.resolve(null);
    }
  }
  function discardPreviews(){
    for(const key of Array.from(previewPending.keys()))dropPreview(key);
    for(const timer of retryTimers.values())clearTimeout(timer);retryTimers.clear();priorityPreviews.clear();previewAttempts.clear();
  }
  function watchPreview(key){
    visiblePreviews.set(key,(visiblePreviews.get(key) || 0)+1);preview(key,true);
    return()=>{const count=(visiblePreviews.get(key) || 1)-1;if(count)visiblePreviews.set(key,count);else{visiblePreviews.delete(key);if(!state.rows.some(row=>row.newKey===key))dropPreview(key);}};
  }
  function preview(key,priority=false) {
    if(priority)priorityPreviews.add(key);
    if(!key || state.images.has(key))return;
    if(previewPending.has(key)){
      const index=queue.findIndex(job=>job.operation==='preview' && job.payload.key===key);
      if(priority && index>=0){const job=queue.splice(index,1)[0],firstBackground=queue.findIndex(item=>item.background);if(firstBackground<0)queue.push(job);else queue.splice(firstBackground,0,job);}return;
    }
    if((previewAttempts.get(key) || 0)>=3)return;
    const previewToken={};previewPending.set(key,previewToken);
    const promise=new Promise(resolve=>{const job={operation:'preview',payload:{key,refresh:state.previewErrors.has(key)},previewToken,background:true,revision,resolve,reject:resolve};if(priority){const index=queue.findIndex(item=>item.background);if(index<0)queue.push(job);else queue.splice(index,0,job);}else queue.push(job);});
    const requestRevision=revision;
    void promise.finally(()=>{
      if(previewPending.get(key)===previewToken)previewPending.delete(key);
      if(requestRevision===revision && priorityPreviews.has(key) && state.previewErrors.has(key) && (previewAttempts.get(key) || 0)<3 && !retryTimers.has(key))retryTimers.set(key,setTimeout(()=>{retryTimers.delete(key);if(requestRevision===revision)preview(key,true);},400*(previewAttempts.get(key) || 1)));
    });pump();
  }
  function pickerIndex(){
    if(pickerCatalog!==state.catalog){pickerCatalog=state.catalog;picker=pickerCatalog?createPickerCatalog(pickerCatalog,state.scenario):null;}
    return picker;
  }
  const representatives=()=>pickerIndex()?.representatives || [];
  function receive(event) {
    if(active && (event.type==='error' && event.requestType===active.operation || event.type==='done' && event.failed>0))active.failed=true;
    if(event.type==='catalog') {
      initialized=true;previewPending.clear();previewAttempts.clear();
      emit({planStale:false,scopeName:'',catalog:event.catalog,scenario:event.catalog.scenarioId || state.scenario,rows:[],observedRows:[],status:'idle',result:null,error:'',errorCode:'',errorOperation:null,images:new Map(),previewErrors:new Map(),confirmation:null,selectionConfirmation:null,largePreview:null});
    } else if(event.type==='preview-cache') {
      const images=new Map(state.images);for(const item of event.images)images.set(item.key,item);emit({images});
    } else if(event.type==='preview') {
      const images=new Map(state.images),errors=new Map(state.previewErrors);images.set(event.key,{image:event.image,monochrome:event.monochrome});errors.delete(event.key);emit({images,previewErrors:errors});
    } else if(event.type==='preview-error') {
      const errors=new Map(state.previewErrors);errors.set(event.key,event.text);emit({previewErrors:errors});
    } else if(event.type==='scan-progress')emit({progress:{processed:event.processed,total:event.total}});
    else if(event.type==='scan-confirmation')emit({status:'idle',confirmation:event});
    else if(event.type==='services-pattern-required')emit({status:'idle',rows:[],observedRows:[],scopeName:'',progress:null,result:null,error:'',confirmation:event});
    else if(event.type==='undo-complete') {
      discardQueue();
      emit({status:'idle',planStale:false,scopeName:'',rows:[],observedRows:[],confirmation:null,selectionConfirmation:null,progress:null,result:null,error:'',errorCode:'',errorOperation:null,largePreview:null});
    }
    else if(event.type==='scan') {
      const rows=event.rows.map(row=>Object.assign({},row,{reviewGroup:reviewGroup(row)}));
      const images=new Map(state.images),errors=new Map(state.previewErrors);
      for(const item of event.targetPreviews || []){images.set(item.key,{image:item.image,monochrome:item.monochrome});errors.delete(item.key);previewAttempts.set(item.key,1);}
      for(const item of event.previewErrors || []){errors.set(item.key,item.text);previewAttempts.set(item.key,1);}
      emit({status:'preview',planStale:false,scopeName:event.scopeName || '',rows,observedRows:event.observedRows || [],images,previewErrors:errors,error:event.unreadable?`Не удалось прочитать вхождений: ${event.unreadable}.`:''});
    } else if(event.type==='selection-confirmation')emit({selectionConfirmation:event});
    else if(event.type==='selection-confirmation-dismissed')emit({selectionConfirmation:null});
    else if(event.type==='selection-switch-started')emit({status:'scanning',planStale:false,rows:[],observedRows:[],scopeName:'',result:null,progress:null,error:'',errorCode:'',errorOperation:null,selectionConfirmation:null,largePreview:null});
    else if(event.type==='stale') {
      const notice=['preview','scanning','replacing'].includes(state.status);
      emit({planStale:true,confirmation:null,selectionConfirmation:null,largePreview:null,
        status:notice?'error':state.status,error:notice?'':state.error,errorCode:notice?'SELECTION_CHANGED':state.errorCode,errorOperation:notice?null:state.errorOperation});
    } else if(event.type==='selection')selection(event.count>0);
    else if(event.type==='done') {
      const previous=new Map(state.rows.map(row=>[rowIdentity(row),row]));
      const rows=(event.remainingRows || []).map(row=>Object.assign({},row,{reviewGroup:previous.get(rowIdentity(row))?.reviewGroup || reviewGroup(row)}));
      emit({status:'done',rows,result:event,errorCode:'',errorOperation:null,error:(event.errors || []).join('\n')});
    } else if(event.type==='icon-preview') {
      if(event.token!==state.largePreview?.token)return;
      const key=state.largePreview.key,images=new Map(state.images),errors=new Map(state.previewErrors);
      if(key){images.set(key,{image:event.image,monochrome:event.monochrome});errors.delete(key);}
      emit({images,previewErrors:errors,largePreview:{token:event.token,key,image:event.image,monochrome:event.monochrome,error:''}});
    }
    else if(event.type==='icon-preview-error') {
      if(event.token===state.largePreview?.token)emit({largePreview:Object.assign({},state.largePreview,{error:event.text})});
    }
    else if(event.type==='preview-cache-reset'){emit({images:new Map(),previewErrors:new Map(),previewGeneration:(state.previewGeneration || 0)+1});for(const row of state.rows)preview(row.newKey,true);}
    else if(event.type==='error') {
      if(state.planStale && event.requestType==='go-to')return;
      if(state.planStale && event.requestType==='scan')emit({status:'error',error:event.text,errorCode:'SELECTION_CHANGED',errorOperation:'scan'});
      else emit({status:event.requestType==='go-to'?state.status:'error',error:event.text,errorCode:event.code || '',errorOperation:event.requestType});
    }
  }
  function accept(message) {
    if(!['reglyph-event','reglyph-result'].includes(message?.type))return false;
    if(message.schemaVersion!==p.SCHEMA)return true;
    if(message.type==='reglyph-event'){if(message.revision===revision)receive(message.event);return true;}
    if(!active || message.requestId!==active.requestId)return true;
    const job=active;active=null;job.activity?.finish(job.revision!==revision?'cancelled':message.error || job.failed?'failed':'completed');
    if(message.error && job.revision===revision){if(job.background){if(job.payload.key){const errors=new Map(state.previewErrors);errors.set(job.payload.key,message.error);emit({previewErrors:errors});}}else if(state.planStale && ['scan','go-to'].includes(job.operation)){
      if(job.operation==='scan')emit({status:'error',error:message.error,errorCode:'SELECTION_CHANGED',errorOperation:'scan'});
    }else emit({status:'error',error:message.error,errorCode:'',errorOperation:job.operation});}
    job.resolve(message);
    if(!queue.length && job.operation!=='flush-previews' && state.catalog && state.supported)void request('flush-previews',{},true);
    recoverSelection();
    if(!job.background || foreground())emit({});pump();return true;
  }
  function setContext(context) {
    if(!p.contextValid(context) || (revision>0 && p.contextKey(context)===p.contextKey(state.context)))return;
    revision++;initialized=false;discardQueue();
    emit({context,supported:p.supported(context),status:'idle',planStale:false,scopeName:'',catalog:null,rows:[],observedRows:[],images:new Map(),previewErrors:new Map(),error:'',errorCode:'',errorOperation:null,confirmation:null,selectionConfirmation:null,largePreview:null,result:null});
    send({type:'reglyph-context',schemaVersion:p.SCHEMA,revision,context});
    if(opened && state.supported)void request('ready');
  }
  async function start(confirmation) {
    if(!state.supported || isBusy() || foreground())return;
    discardPreviews();
    emit({status:'scanning',planStale:false,rows:[],observedRows:[],scopeName:'',error:'',errorCode:'',errorOperation:null,result:null,confirmation:null,selectionConfirmation:null,largePreview:null,progress:null});
    const payload=confirmation?{scenarioId:confirmation.scenario,confirmationToken:confirmation.token}:{scenarioId:state.scenario};
    void request('scan',payload);
  }
  function apply(retry=false) {
    const failure=state.status==='done' && state.result?.failed>0 || state.status==='error' && state.errorOperation==='replace';
    if((retry?!failure:state.status!=='preview') || state.planStale || state.selectionConfirmation || foreground() || isBusy())return;
    emit({status:'replacing',result:null,error:'',errorCode:'',errorOperation:null});
    void request('replace',{choices:state.rows.map(row=>({rowId:rowIdentity(row),oldKey:row.oldKey,newKey:row.newKey}))});
  }
  function recoverSelection(){
    if(state.validSelection && state.status==='error' && state.errorCode==='NO_SELECTION' && !foreground())emit({status:'idle',error:'',errorCode:'',errorOperation:null});
  }
  function selection(valid){emit({validSelection:valid});recoverSelection();}
  return {subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getState:()=>state,accept,setContext,
    open(){opened=true;if(state.supported && !initialized && !queue.some(j=>j.operation==='ready') && active?.operation!=='ready')void request('ready');},
    refresh(){const available=!isBusy();if(state.available!==available)emit({available});if(available)pump();},busy:foreground,
    selection(message){selection(message.valid);},
    decideSelection(decision){const confirmation=state.selectionConfirmation;if(!confirmation || foreground() || isBusy())return;if(decision==='switch')discardPreviews();emit({selectionConfirmation:null});void request('selection-decision',{token:confirmation.token,decision});},
    start,confirmScenario(scenario){const confirmation=state.confirmation;if(confirmation)start({scenario,token:confirmation.token});},
    dismissConfirmation(){if(state.confirmation)emit({confirmation:null,status:'idle'});},
    scenario(id){if(id!=='default' || id===state.scenario || foreground() || isBusy())return;discardQueue();emit({scenario:id,status:'idle',planStale:false,scopeName:'',error:'',rows:[],observedRows:[],confirmation:null,result:null});void request('scenario',{id});},
    choose(rowId,newKey){if(state.status!=='preview' || state.planStale || state.selectionConfirmation || foreground() || !state.catalog?.newIcons.some(icon=>icon.key===newKey))return;emit({rows:state.rows.map(row=>rowIdentity(row)===rowId?Object.assign({},row,{newKey}):row)});preview(newKey,true);},
    skip(rowId){if(state.status==='preview' && !foreground())emit({rows:state.rows.map(row=>rowIdentity(row)===rowId?Object.assign({},row,{newKey:''}):row)});},
    focus(id){if(!state.planStale && !state.selectionConfirmation)void request('go-to',{id});},preview,watchPreview,
    previewFailed(key){const images=new Map(state.images),errors=new Map(state.previewErrors);images.delete(key);errors.set(key,'Не удалось показать превью.');emit({images,previewErrors:errors});preview(key,true);},
    largePreview(descriptor,token){
      if(state.planStale && !descriptor.key){emit({largePreview:{token,image:descriptor.image,monochrome:descriptor.monochrome}});return;}
      emit({largePreview:{token,key:descriptor.key,image:descriptor.image,monochrome:descriptor.monochrome}});void request('icon-preview',Object.assign({token},descriptor.key?{key:descriptor.key}:{id:descriptor.id}),true);
    },
    closePreview(){emit({largePreview:null});},
    replace(){apply();},retryReplace(){apply(true);},
    back(){emit({status:'preview',error:'',errorCode:state.planStale?'OUTDATED':'',errorOperation:null});},reset(){if(foreground())return;emit({status:'idle',planStale:false,scopeName:'',rows:[],observedRows:[],result:null,error:'',errorCode:'',errorOperation:null,confirmation:null,selectionConfirmation:null,largePreview:null});void request('reset');},
    undo(){if(!state.supported || foreground() || isBusy())return;discardQueue();void request('undo');},
    refreshPreviews(){discardQueue();void request('clear-preview-cache');},representatives,options:(row,query)=>pickerIndex()?.options(row,query) || []
  };
}
module.exports = {createReglyphClient,pickerRepresentatives,searchText,reviewGroup,rowIdentity};
