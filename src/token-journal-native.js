'use strict';
const p=require('./token-journal-protocol');
const PREFIX='apollo.local-operation.v1:';
const byteSize=value=>encodeURIComponent(JSON.stringify(value)).replace(/%[a-f0-9]{2}/gi,'x').length;
function createTokenJournalBridge({storage,post,maxRecords=256,maxBytes=262144}) {
  let serial=Promise.resolve();
  async function entries() {
    const keys=(await storage.keysAsync()).filter(key=>key.startsWith(PREFIX)).sort();
    if(keys.length>2048)throw Error('STATISTICS_QUEUE_LIMIT');
    const records=[],invalidIds=[];let unreadable=0,bytes=0;
    for(const key of keys){try{const value=await storage.getAsync(key),size=byteSize(value);bytes+=size;
      if(size>2048 || !p.valid(value) || key!==PREFIX+value.id)throw Error();
      records.push(value);
    }catch(_){unreadable++;const id=key.slice(PREFIX.length);invalidIds.push(/^[a-zA-Z0-9:_-]{1,150}$/.test(id)?id:'unreadable');}}
    return{records,unreadable,invalidIds,bytes,count:keys.length};
  }
  async function execute(operation,payload) {
    if(operation==='pending'){
      if(!p.exact(payload,[]))throw Error('STATISTICS_REQUEST_INVALID');
      const rows=await entries();return{records:rows.records,unreadable:rows.unreadable,invalidIds:rows.invalidIds};
    }
    if(!p.exact(payload,['record']) || !p.valid(payload.record))throw Error('STATISTICS_RECORD_INVALID');
    const record=payload.record,key=PREFIX+record.id,existing=await storage.getAsync(key);
    if(operation==='put'){
      if(existing){
        if(!p.valid(existing) || !p.follows(existing,record))throw Error('STATISTICS_RECORD_CONFLICT');
        if(p.same(existing,record))return{id:record.id};
      }else{if((await storage.keysAsync()).filter(item=>item.startsWith(PREFIX)).length>=maxRecords)throw Error('STATISTICS_QUEUE_FULL');const rows=await entries();if(rows.count>=maxRecords || rows.bytes+byteSize(record)+64>maxBytes)throw Error('STATISTICS_QUEUE_FULL');}
      await storage.setAsync(key,record);return{id:record.id};
    }
    if(operation==='ack'){
      if(existing && p.same(existing,record)){
        await storage.deleteAsync(key);
      }
      return{id:record.id};
    }
    throw Error('STATISTICS_REQUEST_INVALID');
  }
  return{accept(message){
    if(message?.type!=='token-journal-request')return false;
    const reply=(result,error)=>post(Object.assign({type:'token-journal-result',schemaVersion:p.SCHEMA,requestId:message.requestId,operation:message.operation},error?{error}:{result}));
    if(!p.exact(message,['type','schemaVersion','requestId','operation','payload']) || message.schemaVersion!==p.SCHEMA || typeof message.requestId!=='string' || !/^token-journal-[a-zA-Z0-9-]{1,110}$/.test(message.requestId) || !['put','pending','ack'].includes(message.operation)){reply(null,'STATISTICS_REQUEST_INVALID');return true;}
    // Serialize this producer; distinct keys keep other plugin producers intact.
    serial=serial.then(()=>execute(message.operation,message.payload)).then(value=>reply(value),error=>reply(null,/^STATISTICS_/.test(error.message)?error.message:'STATISTICS_STORAGE_UNAVAILABLE'));
    return true;
  }};
}
module.exports={createTokenJournalBridge,PREFIX};
