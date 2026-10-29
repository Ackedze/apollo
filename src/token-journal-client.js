'use strict';
const {createOpaqueId}=require('./design-check/opaque-id');
const p=require('./token-journal-protocol');
function createTokenJournalClient({send,request=(...args)=>fetch(...args),endpoint='http://localhost:3001/usage/local',now=Date.now,monotonic=()=>performance.now(),sessionId=createOpaqueId(),rpcTimeoutMs=5000,deliveryTimeoutMs=1500,retryMs=30000,memoryLimit=1024}={}) {
  const listeners=new Set(),pending=new Map(),unsaved=new Map(),rejected=new Map();
  let sequence=0,serial=Promise.resolve(),flushing=false,retryTimer=null,current=null,latest=null,scheduled=false,closed=false,recheck=null;
  let state={message:'',pending:0,error:false};let storageError='',overflow=false,lastUnsaved=null,lastSnapshot={records:[],unreadable:0,invalidIds:[]};
  const emit=patch=>{state=Object.assign({},state,patch);for(const fn of listeners)fn();};
  const message=code=>['STATISTICS_STORAGE_UNAVAILABLE','STATISTICS_NATIVE_TIMEOUT','STATISTICS_NATIVE_REPLY_INVALID','STATISTICS_REQUEST_INVALID','STATISTICS_UI_CLOSED'].includes(code)?'Не удалось сохранить статистику в плагине. Повтори попытку до закрытия окна.':code==='STATISTICS_QUEUE_FULL'?'Статистика: хранилище заполнено. Не все записи сохранены.':code==='STATISTICS_PROXY_UPDATE_REQUIRED'?'Для записи статистики обнови код Apollo Proxy.':code==='STATISTICS_RECEIPT_INVALID'?'Proxy не подтвердил запись статистики.':'Статистика ожидает отправки. Проверка или навык продолжают работать.';
  function rpc(operation,payload={}) {
    if(closed)return Promise.reject(Error('STATISTICS_UI_CLOSED'));
    return new Promise((resolve,reject)=>{
      const requestId='token-journal-'+sessionId+'-'+(++sequence),timer=setTimeout(()=>{pending.delete(requestId);reject(Error('STATISTICS_NATIVE_TIMEOUT'));},rpcTimeoutMs);
      pending.set(requestId,{operation,timer,resolve,reject,id:payload.record?.id});
      try{send({type:'token-journal-request',schemaVersion:p.SCHEMA,requestId,operation,payload});}
      catch(error){clearTimeout(timer);pending.delete(requestId);reject(error);}
    });
  }
  function retryLater(){if(!closed && !retryTimer){retryTimer=setTimeout(()=>{retryTimer=null;void flush(true);},retryMs);retryTimer.unref?.();}}
  function save(record) {
    const retained=unsaved.has(record.id)||unsaved.size<memoryLimit;
    if(retained)unsaved.set(record.id,record);
    const work=serial=serial.then(async()=>{
      try{await rpc('put',{record});if(p.same(unsaved.get(record.id),record))unsaved.delete(record.id);if(!unsaved.size)storageError='';}
      catch(error){if(!retained){overflow=true;lastUnsaved=record;}storageError=error.message;emit({message:message(error.message),error:true,pending:Math.max(1,state.pending)});retryLater();}
    });
    void work.then(()=>flush());
  }
  async function deliver(record) {
    const controller=new AbortController();let timer;
    try{return await Promise.race([(async()=>{
      const response=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record),signal:controller.signal});
      const value=await response.json();
      if(!response.ok || value?.success!==true)throw Object.assign(Error(response.status===400?'STATISTICS_PROXY_UPDATE_REQUIRED':'STATISTICS_DELIVERY_FAILED'),{permanent:response.status>=400&&response.status<500});
      if(value.id!==record.id || value.status!==record.status)throw Object.assign(Error('STATISTICS_RECEIPT_INVALID'),{permanent:true});
    })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('STATISTICS_DELIVERY_TIMEOUT'));},deliveryTimeoutMs);})]);}
    finally{clearTimeout(timer);}
  }
  async function flush(force=false) {
    if(closed || flushing)return;flushing=true;if(force)rejected.clear();let errorCode='',again=false,blocked=false,deliveredAny=false;
    try{
      await serial;
      // Retry in-memory failures after retained records have made room.
      const snapshot=await rpc('pending');
      if(!snapshot || !Array.isArray(snapshot.records) || !snapshot.records.every(p.valid) || !Number.isSafeInteger(snapshot.unreadable) || snapshot.unreadable<0)throw Error('STATISTICS_NATIVE_REPLY_INVALID');
      for(const record of snapshot.records.filter(record=>!p.same(rejected.get(record.id)?.record,record)).slice(0,32)){
        try{await deliver(record);await rpc('ack',{record});rejected.delete(record.id);if(record.status!=='running')deliveredAny=true;}
        catch(error){errorCode=error.message;if(error.permanent)rejected.set(record.id,{record,code:error.message});else{blocked=true;break;}}
      }
      const remaining=await rpc('pending');
      if(!remaining || !Array.isArray(remaining.records) || !remaining.records.every(p.valid) || !Number.isSafeInteger(remaining.unreadable) || remaining.unreadable<0)throw Error('STATISTICS_NATIVE_REPLY_INVALID');
      lastSnapshot=remaining;
      const total=remaining.records.length+remaining.unreadable+unsaved.size+Number(overflow);
      if(total){emit({pending:total,error:true,message:overflow?'Статистика: память очереди заполнена. Часть записей не сохранена; скачай сведения.':remaining.unreadable?'Статистика: есть непрочитанные записи. Остальные записи отправляются.':message(storageError || errorCode || (rejected.size?'STATISTICS_PROXY_UPDATE_REQUIRED':''))});retryLater();}
      else{emit({pending:0,error:false,message:''});if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}}
      if((force || deliveredAny) && unsaved.size){for(const record of Array.from(unsaved.values()).slice(0,32))save(record);}
      again=!blocked && remaining.records.some(record=>!p.same(rejected.get(record.id)?.record,record));
    }catch(error){emit({error:true,message:message(error.message),pending:Math.max(1,state.pending)});retryLater();}
    finally{flushing=false;if(again)queueMicrotask(()=>flush());}
  }
  function begin(operation) {
    const started=now(),at=monotonic();let ended=false;
    let record={id:sessionId+':'+(++sequence),operation,startedAt:new Date(started).toISOString(),durationMs:null,status:'running',usageMode:'none'};
    if(!p.valid(record))return{agent(){},finish(){}};
    save(record);
    return{agent(){if(!ended && p.HYBRID.has(operation) && record.usageMode!=='separate'){record=Object.assign({},record,{usageMode:'separate'});save(record);}},
      finish(status='completed'){if(ended)return;ended=true;record=Object.assign({},record,{durationMs:Math.min(86400000,Math.max(0,Math.round(monotonic()-at))),status});save(record);}};
  }
  function finishCheck(status){if(!current)return;const run=current;current=null;run.activity.finish(status);}
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;
    if(!current || !latest || latest.auditBusy || current.document && ['loading','cancelling'].includes(latest.documentAudit?.status))return;
    finishCheck(latest.auditError || current.document && latest.documentAudit?.error?'failed':latest.auditStale || current.document && latest.documentAudit?.status==='stale'?'cancelled':'completed');
  });}
  return{begin,diagnostics:()=>({schemaVersion:p.SCHEMA,records:lastSnapshot.records,unreadable:lastSnapshot.unreadable,invalidIds:lastSnapshot.invalidIds || [],unsaved:Array.from(unsaved.values()),overflow,lastUnsaved,rejected:Array.from(rejected.values()),message:state.message}),flush:()=>flush(true),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getState:()=>state,
    start(id,document=false){if(current?.id===id){current.document ||= document;return;}if(current)finishCheck('cancelled');current={id,document,activity:begin('check')};schedule();},
    observe(value){latest=value;const phase=value.documentAction?.status;if(phase==='refreshing' && !recheck)recheck=begin('recheck');else if(recheck && phase!=='refreshing'){recheck.finish(phase==='success'?'completed':phase==='cancelled'?'cancelled':'failed');recheck=null;}schedule();},
    accept(value){if(value?.type!=='token-journal-result')return false;const task=pending.get(value.requestId);if(!task)return true;
      clearTimeout(task.timer);pending.delete(value.requestId);
      if(value.schemaVersion!==p.SCHEMA || value.operation!==task.operation || !p.exact(value,['type','schemaVersion','requestId','operation',typeof value.error==='string'?'error':'result']))task.reject(Error('STATISTICS_NATIVE_REPLY_INVALID'));
      else if(value.error)task.reject(Error(value.error));else if(task.operation!=='pending' && value.result?.id!==task.id)task.reject(Error('STATISTICS_NATIVE_REPLY_INVALID'));else task.resolve(value.result);return true;},
    close(){closed=true;if(retryTimer)clearTimeout(retryTimer);retryTimer=null;for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('STATISTICS_UI_CLOSED'));}pending.clear();}
  };
}
module.exports={createTokenJournalClient};
