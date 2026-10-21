const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild'),{JSDOM}=require('jsdom');
const app=path.resolve(__dirname,".."),repository=path.resolve(app,"./"),aliases=require("../build").runtimeBuildOptions().alias;
const bundle=esbuild.buildSync({entryPoints:[path.join(app,"./src/ui.js")],absWorkingDir:app,outfile:path.join(app,"./tests/chat-submit.bundle.js"),bundle:true,write:false,platform:'browser',format:'iife',alias:aliases,loader:{'.module.css':'local-css'},define:{'process.env.NODE_ENV':'"production"',__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__:JSON.stringify('a'.repeat(64))}}).outputFiles.find(f=>f.path.endsWith('.js')).text;
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
async function harness(run){
 const dom=new JSDOM(fs.readFileSync(path.join(app,"./src/ui.html"),'utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'https://apollo.test/'}),w=dom.window,d=w.document,messages=[],plans=[];let replyPlan;
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.parent.postMessage=message=>{const m=message.pluginMessage;messages.push(m);let reply;
  if(m.type==='generation-session-request')reply={type:'generation-session-result',schemaVersion:m.schemaVersion,requestId:m.requestId,operation:m.operation,result:m.operation==='load'?null:true};
  if(m.type==='agent-draft-storage')reply={type:'agent-draft-storage-result',requestId:m.requestId,draft:m.operation==='save'?m.draft:null};
  if(m.type==='design-check-ui-request')reply={type:'design-check-ui-result',schemaVersion:m.schemaVersion,requestId:m.requestId,operation:m.operation,result:m.operation==='resize'?{width:800,height:860}:null};
  if(reply)w.setTimeout(()=>w.dispatchEvent(new w.MessageEvent('message',{source:w,data:{pluginMessage:reply}})),0);
 };
 w.fetch=async(url,options)=>{
  if(url==='http://localhost:3001/generation/plan'){plans.push(JSON.parse(options.body));return new Promise(resolve=>replyPlan=resolve);}
  return{ok:true,json:async()=>String(url).endsWith('/mcp/status')?{success:true,configured:false}:{ok:true,version:'synthetic'}};
 };
 try{w.eval(bundle);await tick();await tick();await run({w,d,messages,plans,reply:value=>replyPlan(value)});}finally{w.close();}
}
test('actual generation submit clears composer before response, saves empty composer and retains sent message on network failure',async()=>{
 await harness(async({w,d,messages,plans,reply})=>{
  const input=d.querySelector('#generation-prompt'),form=d.querySelector('#generation-prompt-form');input.value='Synthetic screen '+ 'x'.repeat(500);input.dispatchEvent(new w.Event('input',{bubbles:true}));
  const original=input.value;assert.equal(d.querySelector('#generation-plan-prompt').disabled,false);form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(input.value,'','cleared synchronously, before the planner reply');assert.equal(d.querySelectorAll('#generation-chat-log article').length,1);assert.match(d.querySelector('#generation-chat-log').textContent,/Synthetic screen/);assert.equal(input.style.height,'48px');
  await tick();assert.equal(plans.length,1);assert.equal(plans[0].input.prompt,original);assert.equal(messages.filter(m=>m.type==='generation-session-request'&&m.operation==='save').at(-1).payload.composer,'');
  reply({ok:false,status:503,json:async()=>({success:false,code:'PROMPT_PROXY_UNAVAILABLE'})});await tick();await tick();assert.equal(input.value,'');assert.match(d.querySelector('#generation-chat-log').textContent,/Synthetic screen/);assert.equal(d.querySelectorAll('#generation-chat-log article').length,2);
  input.value='x'.repeat(11900);input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.querySelector('#generation-plan-prompt').disabled,false);form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(input.value.length,11900,'rejected aggregate conversation must remain editable');assert.equal(plans.length,1);assert.equal(d.querySelectorAll('#generation-chat-log article').length,2);
 });
});


test('successful planner response keeps the cleared composer and appends its reply',async()=>{
 await harness(async({w,d,plans,reply})=>{
  const input=d.querySelector('#generation-prompt');input.value='Synthetic screen';input.dispatchEvent(new w.Event('input',{bubbles:true}));input.form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(input.value,'');await tick();
  const body=plans[0],hash=require("../dist/runtime.cjs").contractHash,spec=require("../packages/generation-core/tests/planning-fixtures.cjs").fixture().spec;
  spec.id='synthetic-chat-success';spec.platform=body.input.platform;spec.viewport=body.input.viewport;spec.schemaVersion='apollo.screen-spec.v2-experimental';spec.capabilityGaps=[];spec.unresolved=[];
  const result={schemaVersion:'apollo.v4-prompt-plan.v1-experimental',requestId:body.requestId,status:'draft',executionAllowed:false,inputHash:hash(body.input),contextHash:hash('synthetic'),contracts:[{componentId:'synthetic',revision:1,manualSourceHash:hash('manual'),archiveSha256:hash('archive'),sourceStatus:'draft'}],spec,specHash:hash(spec)};if(body.generationMethod)result.generationMethod=body.generationMethod;result.resultHash=hash(result);
  reply({ok:true,json:async()=>({success:true,result})});await tick();await tick();
  assert.equal(input.value,'');assert.equal(d.querySelectorAll('#generation-chat-log article').length,2);assert.match(d.querySelector('#generation-spec-json').textContent,/synthetic-chat-success/);
 });
});
