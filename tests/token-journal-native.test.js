const {test}=require('node:test'),assert=require('node:assert/strict');
const {createTokenJournalBridge,PREFIX}=require('../src/token-journal-native');
const p=require('../src/token-journal-protocol');
const row=(id='one',patch={})=>Object.assign({id,operation:'reglyph-scan',startedAt:'2026-10-29T10:00:00.000Z',durationMs:null,status:'running',usageMode:'none'},patch);
function storage(){const data=new Map([['unrelated-settings',{keep:true}]]);return{data,keysAsync:async()=>Array.from(data.keys()),getAsync:async key=>structuredClone(data.get(key)),setAsync:async(key,value)=>{data.set(key,structuredClone(value));},deleteAsync:async key=>{data.delete(key);}};}
function producer(store,options={}){let seq=0;const pending=new Map(),bridge=createTokenJournalBridge(Object.assign({storage:store,post:m=>{pending.get(m.requestId)(m);pending.delete(m.requestId);}},options));return async(operation,payload={})=>new Promise(resolve=>{const requestId='token-journal-test-'+(++seq);pending.set(requestId,resolve);bridge.accept({type:'token-journal-request',schemaVersion:p.SCHEMA,requestId,operation,payload});});}
test('local record lifecycle is idempotent and stale start acknowledgment cannot delete a terminal record',async()=>{
 const store=storage(),call=producer(store),running=row(),done=row('one',{status:'completed',durationMs:20});
 assert.ok((await call('put',{record:running})).result);await call('put',{record:running});await call('put',{record:done});
 await call('ack',{record:running});assert.equal((await call('pending')).result.records[0].status,'completed');
 assert.equal((await call('put',{record:row('one',{status:'failed',durationMs:20})})).error,'STATISTICS_RECORD_CONFLICT');
 await call('ack',{record:done});assert.deepEqual((await call('pending')).result.records,[]);assert.deepEqual(store.data.get('unrelated-settings'),{keep:true});
});
test('two independent producers sharing clientStorage retain each other records and acknowledgments',async()=>{
 const store=storage(),a=producer(store),b=producer(store),ra=row('a'),rb=row('b');await Promise.all([a('put',{record:ra}),b('put',{record:rb})]);
 assert.deepEqual((await a('pending')).result.records.map(x=>x.id).sort(),['a','b']);
 await a('ack',{record:ra});assert.deepEqual((await b('pending')).result.records.map(x=>x.id),['b']);assert.ok(!store.data.has(PREFIX+'a'),'durable Proxy receipt releases this producer queue item');
});
test('malformed retained head is reported without exposing raw data or hiding valid records',async()=>{
 const store=storage();store.data.set(PREFIX+'aaa-broken',{secret:'MUST_NOT_EXPORT'});const call=producer(store);await call('put',{record:row('valid')});const result=(await call('pending')).result;
 assert.equal(result.unreadable,1);assert.deepEqual(result.invalidIds,['aaa-broken']);assert.equal(result.records[0].id,'valid');assert.ok(store.data.has(PREFIX+'aaa-broken'));assert.ok(!JSON.stringify(result).includes('MUST_NOT_EXPORT'));
});
test('queue cap and storage quota refuse new metadata explicitly while retaining older records',async()=>{
 const store=storage(),call=producer(store,{maxRecords:1});await call('put',{record:row('kept')});assert.equal((await call('put',{record:row('overflow')})).error,'STATISTICS_QUEUE_FULL');assert.ok(store.data.has(PREFIX+'kept'));
 const tiny=producer(storage(),{maxBytes:50});assert.equal((await tiny('put',{record:row('too-large')})).error,'STATISTICS_QUEUE_FULL');
 const failed=producer(Object.assign({},store,{setAsync:async()=>{throw Error('PRIVATE_STORAGE_DETAIL');}}));const error=await failed('put',{record:row('kept',{status:'failed',durationMs:3})});assert.equal(error.error,'STATISTICS_STORAGE_UNAVAILABLE');assert.equal(store.data.get(PREFIX+'kept').status,'running');
});
test('strict metadata protocol refuses arbitrary operations, fields, IDs and forged terminal transitions',async()=>{
 const store=storage(),call=producer(store);
 for(const record of [row('bad/id'),row('ok',{operation:'delete-settings'}),row('ok',{layout:'secret'}),row('ok',{operation:'reglyph-scan',usageMode:'separate'})])assert.equal((await call('put',{record})).error,'STATISTICS_RECORD_INVALID');
 assert.equal((await call('pending',{key:'unrelated-settings'})).error,'STATISTICS_REQUEST_INVALID');assert.equal(store.data.size,1);
});
module.exports={storage,producer,row};
