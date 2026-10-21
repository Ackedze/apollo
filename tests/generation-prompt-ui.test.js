const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),esbuild=require('esbuild');
const code=esbuild.buildSync({entryPoints:[path.join(__dirname,"../src/generation/prompt/ui.js")],bundle:true,platform:'node',write:false,alias:{'@apollo/predicate-engine':path.resolve(__dirname,"../packages/component-contract-core/predicate/index.js")}}).outputFiles[0].text;
const loaded=new Module(__filename);loaded._compile(code,__filename);const {createPromptTransport,validatePromptResult}=loaded.exports;
const {fixture}=require("../packages/generation-core/tests/planning-fixtures.cjs");
const {contractHash:hash}=require("../dist/runtime.cjs");
const input={prompt:'Synthetic',platform:'desktop',viewport:{width:1600,height:900}};
function result(requestId,requestInput=input){const spec=fixture().spec;const r={schemaVersion:'apollo.v4-prompt-plan.v1-experimental',requestId,status:'draft',executionAllowed:false,inputHash:hash(requestInput),contextHash:hash('context'),contracts:[{componentId:'content',revision:1,manualSourceHash:hash('manual'),archiveSha256:hash('zip'),sourceStatus:'draft'}],spec,specHash:hash(spec)};r.resultHash=hash(r);return r;}
test('valid draft reply is correlated and hash/acceptance/viewport tampering is rejected',()=>{
 const r=result('request');assert.equal(validatePromptResult(r,'request',input),true);assert.equal(validatePromptResult(r,'foreign',input),false);
 for(const edit of [v=>v.executionAllowed=true,v=>v.status='ready',v=>v.contextHash='invalid',v=>v.spec.nodes[0].props.injected='changed',v=>v.spec.viewport.width=360,v=>v.resultHash=hash('foreign')]){const v=structuredClone(r);edit(v);assert.equal(validatePromptResult(v,'request',input),false);}
});
test('fixed route snapshots input and cancelled late reply cannot become current',async()=>{
 let release,seen;const transport=createPromptTransport(async(url,options)=>{seen={url,body:JSON.parse(options.body)};return new Promise(r=>release=()=>r({ok:true,status:200,json:async()=>({success:true,result:result(seen.body.requestId,seen.body.input)})}));});
 const copied=structuredClone(input),pending=transport.plan(copied);copied.prompt='edited';transport.invalidate();release();await assert.rejects(pending,/PROMPT_PLAN_CANCELLED/);
 assert.equal(seen.url,'http://localhost:3001/generation/plan');assert.equal(seen.body.input.prompt,input.prompt);
});
test('old Proxy route and private error text remain bounded',async()=>{
 const old=createPromptTransport(async()=>({ok:false,status:404,json:async()=>{throw Error('HTML');}}));await assert.rejects(old.plan(input),/PROMPT_ROUTE_UNAVAILABLE/);
 const bad=createPromptTransport(async()=>({ok:false,status:503,json:async()=>({success:false,code:'/private/secret'})}));await assert.rejects(bad.plan(input),/^Error: PROMPT_PROXY_UNAVAILABLE$/);
});
test('planning failure preserves correlated diagnostic while rejecting foreign request IDs',async()=>{
 const {failureDiagnostic}=require("../src/generation/failure");
 for(const foreign of [false,true]){const transport=createPromptTransport(async(url,options)=>{const requestId=JSON.parse(options.body).requestId;return{ok:false,status:503,json:async()=>({success:false,code:'PROMPT_SPEC_INVALID',diagnostic:failureDiagnostic('PROMPT_SPEC_INVALID',{phase:'planning',stage:'response-validation',requestId:foreign?'foreign':requestId},'err:synthetic')})};});
 await assert.rejects(transport.plan(input),e=>{assert.equal(e.message,'PROMPT_SPEC_INVALID');assert.equal(Boolean(e.diagnostic),!foreign);if(!foreign)assert.equal(JSON.parse(e.diagnostic).errorId,'err:synthetic');return true;});}
});
