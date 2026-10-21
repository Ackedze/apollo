const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require("../packages/generation-core/tests/planning-fixtures.cjs");
const {contractHash}=require("../dist/runtime.cjs");
function plugin(reply) {
 const messages=[];let writes=0;
 const figma={currentPage:{selection:[]},showUI(){},on(){},ui:{postMessage:m=>{messages.push(m);if((m.type==='generation-context-request'||m.type==='generation-frontend-request')&&reply)queueMicrotask(()=>figma.ui.onmessage(reply(m)));}},createFrame(){writes++;throw new Error('UNAUTHORIZED_WRITE');}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../dist/code.js"),'utf8'),{figma,__html__:'',setTimeout,clearTimeout,TextEncoder});
 return {messages,send:m=>figma.ui.onmessage(m),writes:()=>writes};
}
test('actual main bundle awaits Proxy and reports SOURCE_COMPILE without any native write',async()=>{
 const p=plugin(m=>({type:'generation-context-response',requestId:m.requestId,error:true,code:'SOURCE_COMPILE'}));
 await p.send({type:'generation-prepare',requestId:'gen-1',spec:fixture().spec});
 const r=p.messages.find(m=>m.type==='generation-result');assert.equal(r.requestId,'gen-1');assert.equal(r.result.schemaAccepted,true);
 assert.equal(r.result.status,'blocked');assert.equal(r.result.sourceReadiness,'blocked');assert.equal(r.result.plan,null);
 assert.ok(r.result.diagnostics.some(d=>d.code==='SOURCE_COMPILE'));assert.equal(p.writes(),0);
 await p.send({type:'generation-execute',requestId:'gen-2',sessionId:'invented',targets:['figma']});
 assert.ok(p.messages.some(m=>m.type==='generation-error'&&m.requestId==='gen-2'));assert.equal(p.writes(),0);
});
test('actual main processes successful correlated response while preparation is busy',async()=>{
 const f=fixture();f.context.view.lockHash=contractHash(f.context.view.lock);
 const p=plugin(m=>({type:'generation-context-response',requestId:m.requestId,data:{success:true,schemaVersion:'apollo.v4-generation-context.v1-experimental',specHash:contractHash(m.spec),contextHash:contractHash(f.context),context:f.context}}));
 await p.send({type:'generation-prepare',requestId:'valid',spec:f.spec});
 const r=p.messages.find(m=>m.type==='generation-result');assert.ok(r.result.plan);assert.ok(r.result.preflight);assert.equal(p.writes(),0);
 assert.equal(r.result.executionPorts.figma,'available');assert.equal(r.result.executionPorts.frontend,'available');
});
test('actual main invalidates pending context and ignores its late response',async()=>{
 const p=plugin(),preparation=p.send({type:'generation-prepare',requestId:'stale',spec:fixture().spec});
 const request=p.messages.find(m=>m.type==='generation-context-request');assert.ok(request);
 await p.send({type:'generation-invalidate'});await preparation;
 assert.ok(p.messages.find(m=>m.type==='generation-result').result.diagnostics.some(d=>d.code==='GENERATION_SESSION_STALE'));
 await p.send({type:'generation-context-response',requestId:request.requestId,data:{success:true}});assert.equal(p.writes(),0);
});
test('actual main rejects malformed ScreenSpec before requesting Proxy or native writes',async()=>{
 const p=plugin();await p.send({type:'generation-prepare',requestId:'bad',spec:{kind:'invented'}});
 const r=p.messages.find(m=>m.type==='generation-result');assert.equal(r.result.schemaAccepted,false);assert.equal(r.result.plan,null);
 assert.equal(p.messages.some(m=>m.type==='generation-context-request'),false);assert.equal(p.writes(),0);
});
