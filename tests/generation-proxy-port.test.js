const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),esbuild=require('esbuild');
const {fixture,hash}=require("../packages/generation-core/tests/planning-fixtures.cjs");
const file=path.join(__dirname,"../src/generation/proxy/port.ts");
const source=esbuild.transformSync(fs.readFileSync(file,'utf8'),{loader:'ts',format:'cjs'}).code;
const moduleObject={exports:{}};vm.runInNewContext(source,{module:moduleObject,exports:moduleObject.exports,setTimeout,clearTimeout,Map,JSON});
const {createGenerationProxyPort}=moduleObject.exports;
const envelope=(spec,context)=>({success:true,schemaVersion:'apollo.v4-generation-context.v1-experimental',specHash:hash(spec),contextHash:hash(context),context});
test('context RPC copies spec, correlates requests and checks spec/context hashes',async()=>{
 const f=fixture(),messages=[],p=createGenerationProxyPort(m=>messages.push(m),hash);
 const read=p.readContext(f.spec);const original=JSON.parse(JSON.stringify(f.spec));f.spec.id='edited';
 assert.equal(messages.length,1);assert.equal(messages[0].spec.id,original.id);
 p.accept({type:'generation-context-response',requestId:'unknown',data:envelope(original,f.context)});
 p.accept({type:'generation-context-response',requestId:messages[0].requestId,data:envelope(original,f.context)});
 assert.deepEqual(await read,f.context);
 const bad=p.readContext(original),d=envelope(original,f.context);d.specHash=hash('another');
 p.accept({type:'generation-context-response',requestId:messages.at(-1).requestId,data:d});await assert.rejects(bad,/GENERATION_PROXY_RESPONSE_INVALID/);
 const tampered=p.readContext(original),t=envelope(original,f.context);t.contextHash=hash('another');
 p.accept({type:'generation-context-response',requestId:messages.at(-1).requestId,data:t});await assert.rejects(tampered,/GENERATION_PROXY_RESPONSE_INVALID/);
});
test('source gate errors survive RPC while arbitrary text is sanitized',async()=>{
 const messages=[],p=createGenerationProxyPort(m=>messages.push(m),hash),f=fixture();
 for(const [code,expected] of [['SOURCE_COMPILE','SOURCE_COMPILE'],['/private/path?secret','GENERATION_PROXY_UNAVAILABLE']]) {
 const read=p.readContext(f.spec);p.accept({type:'generation-context-response',requestId:messages.at(-1).requestId,error:true,code});await assert.rejects(read,new RegExp(expected));
 }
});
test('cancel rejects in-flight requests and late responses cannot satisfy the next request',async()=>{
 const messages=[],p=createGenerationProxyPort(m=>messages.push(m),hash),f=fixture();
 const cancelled=p.readContext(f.spec),first=messages[0].requestId;p.invalidate();await assert.rejects(cancelled,/GENERATION_SESSION_STALE/);
 const fresh=p.readContext(f.spec);assert.notEqual(messages.at(-1).requestId,first);
 p.accept({type:'generation-context-response',requestId:first,data:envelope(f.spec,f.context)});
 p.accept({type:'generation-context-response',requestId:messages.at(-1).requestId,data:envelope(f.spec,f.context)});assert.deepEqual(await fresh,f.context);
});
test('missing UI response times out and a thrown post cleans its pending timer',async()=>{
 const p=createGenerationProxyPort(()=>{},hash,5);await assert.rejects(p.readContext(fixture().spec),/GENERATION_PROXY_TIMEOUT/);
 const throwing=createGenerationProxyPort(()=>{throw new Error('POST_FAILED');},hash,5000);await assert.rejects(throwing.readContext(fixture().spec),/POST_FAILED/);
});
const {resolveGenerationContext}=require("../src/generation/proxy/ui");
test('UI uses only fixed Generation endpoint and preserves structured errors',async()=>{
 const output=[],data={requestId:'generation-context:1',spec:fixture().spec};let observed;
 await resolveGenerationContext(data,m=>output.push(m),async(url,options)=>{observed={url,options};return{ok:false,status:422,json:async()=>({success:false,code:'SOURCE_COMPILE',error:'/private/source'})};});
 assert.equal(observed.url,'http://localhost:3001/generation/context');assert.deepEqual(JSON.parse(observed.options.body),{spec:data.spec});
 assert.equal(output[0].code,'SOURCE_COMPILE');assert.equal(JSON.stringify(output).includes('/private/source'),false);
 const old=[];await resolveGenerationContext(data,m=>old.push(m),async()=>({ok:false,status:404,json:async()=>{throw new Error('HTML');}}));assert.equal(old[0].code,'GENERATION_PROXY_ROUTE_UNAVAILABLE');
 let calls=0;await resolveGenerationContext({requestId:'unsafe'},()=>{},async()=>{calls++;});assert.equal(calls,0);
});
