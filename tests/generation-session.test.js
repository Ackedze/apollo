const test=require('node:test'),assert=require('node:assert/strict');
const {SESSION_SCHEMA,BRIDGE_SCHEMA,STORAGE_KEY,validSession,createSessionBridge}=require("../src/generation/session/protocol");
const {createSessionClient}=require("../src/generation/session/client");
const {createPromptConversation}=require("../src/generation/prompt/conversation");
function session(){const chat=createPromptConversation();chat.submit('Synthetic screen');chat.receive({spec:{id:'synthetic',unresolved:[]},executionAllowed:false,sessionId:'must-not-persist'});
 return {schemaVersion:SESSION_SCHEMA,conversation:chat.snapshot(),composer:'Pending refinement',platform:'desktop',viewport:{width:'1600',height:'900'},dirty:true};}
test('snapshot restores the original prompt, last draft and pending composer without execution metadata',()=>{
 const value=session();assert(validSession(value));assert.doesNotMatch(JSON.stringify(value),/sessionId|executionAllowed|status|receipt|pins/);
 const messages=[],chat=createPromptConversation(m=>messages.push(m));chat.restore(value.conversation);value.conversation.draft.id='mutated';
 assert.equal(messages.length,2);assert.match(chat.submit('Continue'),/Synthetic screen/);assert.match(chat.submit('Again'),/"id":"synthetic"/);
 assert.doesNotMatch(chat.submit('Last'),/mutated/);
});
test('closed session schema rejects readiness, corrupt display, deep/oversized and cyclic payloads',()=>{
 for(const mutate of [s=>s.sessionId='fake',s=>s.conversation.messages[1].spec.unresolved=null,s=>s.conversation.messages[1].spec.capabilityGaps=[{}],
  s=>s.composer='x'.repeat(12001),s=>s.conversation.draft={big:'x'.repeat(2*1024*1024)},s=>s.conversation.messages=Array(513).fill({role:'user',text:'x'}),
  s=>{let p=s.conversation.draft;for(let i=0;i<40;i++){p.next={};p=p.next;}},s=>s.conversation.draft=s]){
  const value=session();mutate(value);assert.equal(validSession(value),false);
 }
 const value=session();value.composer='emoji 🧩 русский';assert(validSession(value));
});
test('storage is serialized, freezes writes and recovers after failure without deleting the prior draft',async()=>{
 let stored=session(),fail=false;const replies=[],calls=[];
 const bridge=createSessionBridge({storage:{getAsync:async key=>{assert.equal(key,STORAGE_KEY);return stored;},setAsync:async(key,value)=>{calls.push(value.composer);if(fail){fail=false;throw Error('private storage error');}stored=value;}},post:r=>replies.push(r)});
 const send=(op,payload,id)=>bridge.accept({type:'generation-session-request',schemaVersion:BRIDGE_SCHEMA,requestId:id,operation:op,payload});
 send('load',{},'load1');const next=session();send('save',next,'save1');next.composer='mutated';send('load',{},'load2');await bridge.flush();
 assert.deepEqual(replies.map(r=>r.requestId),['load1','save1','load2']);assert.equal(stored.composer,'Pending refinement');assert.deepEqual(calls,['Pending refinement']);
 fail=true;send('save',session(),'save2');await bridge.flush();assert.equal(replies.at(-1).error,'GENERATION_SESSION_STORAGE_FAILED');assert.equal(stored.composer,'Pending refinement');
 send('save',session(),'save3');await bridge.flush();assert.equal(replies.at(-1).result,true);
 send('save',Object.assign(session(),{receipt:{status:'verified'}}),'bad');await bridge.flush();assert.equal(calls.length,3);assert.equal(replies.at(-1).error,'GENERATION_SESSION_INVALID');
});
test('client correlates replies across reload, rejects unknown readiness and expires missing bridge',async()=>{
 const sent=[],client=createSessionClient(m=>sent.push(m),{timeoutMs:100});const load=client.load(),r=sent[0];
 client.accept({type:'generation-session-result',schemaVersion:BRIDGE_SCHEMA,requestId:'old-ui',operation:'load',result:session()});
 client.accept({type:'generation-session-result',schemaVersion:BRIDGE_SCHEMA,requestId:r.requestId,operation:'load',result:session()});assert.deepEqual(await load,session());
 const second=client.load(),req=sent[1];client.accept({type:'generation-session-result',schemaVersion:BRIDGE_SCHEMA,requestId:req.requestId,operation:'load',result:session(),sessionId:'fake'});await assert.rejects(second,/GENERATION_SESSION_INVALID/);
 await assert.rejects(createSessionClient(()=>{},{timeoutMs:5}).load(),/GENERATION_SESSION_TIMEOUT/);
});
