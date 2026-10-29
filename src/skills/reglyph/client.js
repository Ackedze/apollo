'use strict';
const p = require('./protocol');
let clientSequence = 0;
function pickerRepresentatives(icons) {
  const families = new Map();
  const rank = icon => [icon.properties?.Style === 'Line' ? 0 : 1,icon.properties?.Color === 'False' ? 0 : 1,Math.abs((icon.width || 24)-24)+Math.abs((icon.height || 24)-24)];
  const compare = (a,b) => {const x=rank(a),y=rank(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return a.key.localeCompare(b.key);};
  for (const icon of icons) {const id=icon.familyId || icon.key,previous=families.get(id);if(!previous || compare(icon,previous)<0)families.set(id,icon);}
  return Array.from(families.values());
}
const searchText = value => String(value || '').normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const rowIdentity = row => row.rowId || row.oldKey;
const reviewGroup = row => (row.outsideCatalog && !row.verifiedCurrency) || row.category === 'unknown' ? 'unknown' : row.category === 'unused' ? 'unused' : new Set((row.candidates || []).map(c=>c.newKey)).size>1 ? 'ambiguous' : row.newKey ? 'ready' : 'unresolved';
function createReglyphClient({send,isBusy = () => false,onChange = () => {}}) {
  const listeners = new Set(),queue = [],previewPending = new Set(),previewAttempts = new Map(),priorityPreviews = new Set(),retryTimers = new Map();
  const identity = Date.now().toString(36)+'-'+(++clientSequence);
  let sequence=0,revision=0,active=null,opened=false,initialized=false;
  let state={status:'idle',context:{channelId:'b2b',pickerLabel:'Desktop'},supported:false,available:true,validSelection:false,scenario:'default',planStale:false,scopeName:'',catalog:null,rows:[],observedRows:[],images:new Map(),previewErrors:new Map(),error:'',confirmation:null,progress:null,result:null,largePreview:null};
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
    while(queue.length && queue[0].operation==='preview' && state.images.has(queue[0].payload.key)){const cached=queue.shift();previewPending.delete(cached.payload.key);cached.resolve(null);}
    if(!queue.length)return;
    active=queue.shift();active.requestId='reglyph-'+identity+'-'+(++sequence);
    send({type:'reglyph-request',schemaVersion:p.SCHEMA,requestId:active.requestId,revision:active.revision,operation:active.operation,payload:active.payload});
    onChange();
  }
  function discardQueue(){while(queue.length)queue.shift().resolve(null);previewPending.clear();previewAttempts.clear();priorityPreviews.clear();for(const timer of retryTimers.values())clearTimeout(timer);retryTimers.clear();}
  function preview(key,priority=false) {
    if(priority)priorityPreviews.add(key);
    if(!key || state.images.has(key) || previewPending.has(key) || (previewAttempts.get(key) || 0)>=3)return;
    previewPending.add(key);previewAttempts.set(key,(previewAttempts.get(key) || 0)+1);
    const promise=new Promise(resolve=>{const job={operation:'preview',payload:{key,refresh:state.previewErrors.has(key)},background:true,revision,resolve,reject:resolve};if(priority){const index=queue.findIndex(item=>item.background);if(index<0)queue.push(job);else queue.splice(index,0,job);}else queue.push(job);});
    const requestRevision=revision;
    void promise.finally(()=>{
      previewPending.delete(key);
      if(requestRevision===revision && priorityPreviews.has(key) && state.previewErrors.has(key) && (previewAttempts.get(key) || 0)<3 && !retryTimers.has(key))retryTimers.set(key,setTimeout(()=>{retryTimers.delete(key);if(requestRevision===revision)preview(key,true);},400*(previewAttempts.get(key) || 1)));
    });pump();
  }
  function representatives(){if(!state.catalog)return[];return state.scenario==='services'?state.catalog.newIcons:pickerRepresentatives(state.catalog.newIcons);}
  function receive(event) {
    if(event.type==='catalog') {
      initialized=true;previewPending.clear();previewAttempts.clear();
      emit({planStale:false,scopeName:'',catalog:event.catalog,scenario:event.catalog.scenarioId || state.scenario,rows:[],observedRows:[],status:'idle',result:null,error:'',images:new Map(),previewErrors:new Map(),confirmation:null});
      for(const icon of representatives())preview(icon.key);
    } else if(event.type==='preview-cache') {
      const images=new Map(state.images);for(const item of event.images)images.set(item.key,item);emit({images});
    } else if(event.type==='preview') {
      const images=new Map(state.images),errors=new Map(state.previewErrors);images.set(event.key,{image:event.image,monochrome:event.monochrome});errors.delete(event.key);emit({images,previewErrors:errors});
    } else if(event.type==='preview-error') {
      const errors=new Map(state.previewErrors);errors.set(event.key,event.text);emit({previewErrors:errors});
    } else if(event.type==='scan-progress')emit({progress:{processed:event.processed,total:event.total}});
    else if(event.type==='scan-confirmation')emit({status:'idle',confirmation:event});
    else if(event.type==='scan') {
      const rows=event.rows.map(row=>Object.assign({},row,{reviewGroup:reviewGroup(row)}));
      emit({status:'preview',planStale:false,scopeName:event.scopeName || '',rows,observedRows:event.observedRows || [],error:event.unreadable?`Не удалось прочитать вхождений: ${event.unreadable}.`:''});
      for(const row of rows)preview(row.newKey,true);
    } else if(event.type==='stale') {
      if(['preview','scanning','replacing','done'].includes(state.status) || state.confirmation)emit({planStale:true,confirmation:null});
    } else if(event.type==='selection')emit({validSelection:event.count>0});
    else if(event.type==='done') {
      const previous=new Map(state.rows.map(row=>[rowIdentity(row),row]));
      const rows=(event.remainingRows || []).map(row=>Object.assign({},row,{reviewGroup:previous.get(rowIdentity(row))?.reviewGroup || reviewGroup(row)}));
      emit({status:'done',rows,result:event,error:(event.errors || []).join('\n')});
    } else if(event.type==='icon-preview')emit({largePreview:{token:event.token,image:event.image,monochrome:event.monochrome,error:''}});
    else if(event.type==='icon-preview-error')emit({largePreview:{token:event.token,error:event.text}});
    else if(event.type==='preview-cache-reset'){emit({images:new Map(),previewErrors:new Map()});for(const icon of representatives())preview(icon.key);}
    else if(event.type==='error') {
      if(state.planStale && event.requestType==='go-to')return;
      if(state.planStale && event.requestType==='scan')emit({status:state.rows.length || state.observedRows.length?'preview':'idle',error:''});
      else emit({status:event.requestType==='go-to'?state.status:'error',error:event.text});
    }
  }
  function accept(message) {
    if(!['reglyph-event','reglyph-result'].includes(message?.type))return false;
    if(message.schemaVersion!==p.SCHEMA)return true;
    if(message.type==='reglyph-event'){if(message.revision===revision)receive(message.event);return true;}
    if(!active || message.requestId!==active.requestId)return true;
    const job=active;active=null;
    if(message.error && job.revision===revision){if(job.background){if(job.payload.key){const errors=new Map(state.previewErrors);errors.set(job.payload.key,message.error);emit({previewErrors:errors});}}else if(state.planStale && ['scan','go-to'].includes(job.operation)){
      if(job.operation==='scan')emit({status:state.rows.length || state.observedRows.length?'preview':'idle',error:''});
    }else emit({status:'error',error:message.error});}
    job.resolve(message);
    if(!queue.length && job.operation!=='flush-previews' && state.catalog && state.supported)void request('flush-previews',{},true);
    emit({});pump();return true;
  }
  function setContext(context) {
    if(!p.contextValid(context) || (revision>0 && p.contextKey(context)===p.contextKey(state.context)))return;
    revision++;initialized=false;discardQueue();
    emit({context,supported:p.supported(context),status:'idle',planStale:false,scopeName:'',catalog:null,rows:[],observedRows:[],images:new Map(),previewErrors:new Map(),error:'',confirmation:null,result:null});
    send({type:'reglyph-context',schemaVersion:p.SCHEMA,revision,context});
    if(opened && state.supported)void request('ready');
  }
  function start(confirmation) {
    if(!state.supported || isBusy() || foreground())return;
    emit({status:'scanning',planStale:false,scopeName:'',error:'',result:null,confirmation:null,progress:null});
    const payload=confirmation?{scenarioId:confirmation.scenario,confirmationToken:confirmation.token}:{scenarioId:state.scenario};
    void request('scan',payload);
  }
  return {subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getState:()=>state,accept,setContext,
    open(){opened=true;if(state.supported && !initialized && !queue.some(j=>j.operation==='ready') && active?.operation!=='ready')void request('ready');},
    refresh(){const available=!isBusy();if(state.available!==available)emit({available});if(available)pump();},busy:foreground,
    selection(message){emit({validSelection:message.valid});},
    start,confirmScenario(scenario){const confirmation=state.confirmation;if(confirmation)start({scenario,token:confirmation.token});},
    dismissConfirmation(){if(state.confirmation)emit({confirmation:null,status:'idle'});},
    scenario(id){if(!['default','services'].includes(id) || id===state.scenario || foreground() || isBusy())return;discardQueue();emit({scenario:id,status:'idle',planStale:false,scopeName:'',error:'',rows:[],observedRows:[],confirmation:null,result:null});void request('scenario',{id});},
    choose(rowId,newKey){if(state.status!=='preview' || foreground() || !state.catalog?.newIcons.some(icon=>icon.key===newKey))return;emit({rows:state.rows.map(row=>rowIdentity(row)===rowId?Object.assign({},row,{newKey}):row)});preview(newKey,true);},
    skip(rowId){if(state.status==='preview' && !foreground())emit({rows:state.rows.map(row=>rowIdentity(row)===rowId?Object.assign({},row,{newKey:''}):row)});},
    focus(id){if(!state.planStale)void request('go-to',{id});},preview,
    previewFailed(key){const images=new Map(state.images),errors=new Map(state.previewErrors);images.delete(key);errors.set(key,'Не удалось показать превью.');emit({images,previewErrors:errors});preview(key,true);},
    largePreview(descriptor,token){
      if(state.planStale && !descriptor.key){emit({largePreview:{token,image:descriptor.image,monochrome:descriptor.monochrome}});return;}
      emit({largePreview:null});void request('icon-preview',Object.assign({token},descriptor.key?{key:descriptor.key}:{id:descriptor.id}),true);
    },
    replace(){if(state.status!=='preview' || state.planStale || foreground() || isBusy())return;emit({status:'replacing',error:''});void request('replace',{choices:state.rows.map(row=>({rowId:rowIdentity(row),oldKey:row.oldKey,newKey:row.newKey}))});},
    back(){emit({status:'preview'});},reset(){if(foreground())return;emit({status:'idle',planStale:false,scopeName:'',rows:[],observedRows:[],result:null,error:'',confirmation:null});void request('reset');},
    refreshPreviews(){discardQueue();void request('clear-preview-cache');},representatives
  };
}
module.exports = {createReglyphClient,pickerRepresentatives,searchText,reviewGroup,rowIdentity};
