const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),esbuild=require('esbuild'),{JSDOM}=require('jsdom');
const {createProgressBarClient}=require('../../src/design-check/progressbar-client');
const {PILOT,RULE_IDS}=require('../../src/design-check/progressbar-protocol');
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
function harness({staleAtVerify=false,sourceError=false,foreignResult=false}={}){
 const requests=[],native=[],capture={schemaVersion:'apollo.progressbar-capture.v1',captureId:'synthetic',complete:true,nodes:[{id:'1:1',name:'Area'},{id:'1:2',name:'ProgressBar :: Goal'}]},sourcePin='a'.repeat(64);
 const result={schemaVersion:'apollo.progressbar-assessment.v1',mode:'agent-pattern-pilot',reportId:capture.captureId,captureId:capture.captureId,sourcePin,
  knowledge:{contentVersion:'synthetic-knowledge'},sources:[{sourceId:'canonical-progressbar',path:'patterns/p_progress-bar.md',sha256:'b'.repeat(64)}],
  assessments:[{nodeId:foreignResult?'9:9':'1:2',outcome:'insufficient-data',observation:'90%',reason:'Purpose is unknown.',ruleIds:RULE_IDS,ruleResults:RULE_IDS.map(ruleId=>({ruleId,outcome:'insufficient-data',reason:'Unknown purpose.'})),evidenceNodeIds:['1:2'],sourceRefs:RULE_IDS.map(ruleId=>({sourceId:'canonical-progressbar',sha256:'b'.repeat(64),ruleId}))}]};
 let client;const response=value=>({ok:true,json:async()=>value});
 client=createProgressBarClient({endpoint:'http://127.0.0.1:3007/v1/analyze/codex/runs',pollMs:1,request:async(url,options)=>{
  requests.push({url,options});if(options.method==='POST'){
   const body=JSON.parse(options.body);assert.equal(body.report.pilot,PILOT);
   if(body.report.phase==='prepare')return response({success:true,preparation:{reportId:'synthetic',captureId:'synthetic',sourcePin,subjects:[{nodeId:'1:2'}]}});
   if(sourceError)return {ok:false,json:async()=>({success:false,code:'PROGRESSBAR_SOURCE_STALE'})};
   return response({success:true,run:{id:'run_12345678-abcd',status:'queued'}});
  }
  return response({success:true,run:{id:'run_12345678-abcd',status:'completed',validation:result}});
 },send:message=>{native.push(message);queueMicrotask(()=>client.accept({type:'progressbar-native-result',requestId:message.requestId,operation:message.operation,
  ...(message.operation==='verify'&&staleAtVerify?{error:'PROGRESSBAR_CAPTURE_STALE'}:{result:message.operation==='capture'?capture:true})}));}});
 return{client,requests,native,result,capture};
}
test('explicit pilot uses capture → source preparation → native verify → existing run/poll → final native verify; focus and recheck stay separate',async()=>{
 const h=harness();assert.equal(h.requests.length,0);assert.equal(await h.client.start(),true);assert.equal(h.client.getState().phase,'complete');assert.deepEqual(h.client.getState().report.assessments,h.result.assessments);
 const timings=h.client.getState().report.timings;assert.deepEqual(Object.keys(timings.stagesMs),['capture','prepare','verify','running']);assert.ok(timings.totalMs>=0);assert.ok(Object.values(timings.stagesMs).every(ms=>ms>=0));
 assert.deepEqual(h.native.map(n=>n.operation),['capture','verify','verify']);assert.equal(h.requests.filter(r=>r.options.method==='POST').length,2);assert.equal(await h.client.focus('9:9'),false);assert.equal(await h.client.focus('1:2'),true);
 assert.equal(h.native.at(-1).operation,'focus');assert.equal(await h.client.start(),true);h.client.close();
});
test('stale capture refuses before the paid POST; source drift and foreign node responses cannot display PASS',async()=>{
 const a=harness({staleAtVerify:true});assert.equal(await a.client.start(),false);assert.equal(a.requests.length,1);assert.equal(a.client.getState().report,null);a.client.close();
 for(const options of [{sourceError:true},{foreignResult:true}]){const h=harness(options);assert.equal(await h.client.start(),false);assert.equal(h.client.getState().phase,'error');assert.equal(h.client.getState().report,null);h.client.close();}
});
test('invalidation preserves the historical report, disables focus and ignores late unrelated native messages',async()=>{
 const h=harness();await h.client.start();const report=h.client.getState().report;h.client.accept({type:'progressbar-invalidated',captureId:'foreign'});assert.equal(h.client.getState().phase,'complete');
 h.client.accept({type:'progressbar-invalidated',captureId:h.capture.captureId});assert.equal(h.client.getState().phase,'stale');assert.equal(h.client.getState().report,report);assert.equal(await h.client.focus('1:2'),false);
 h.client.accept({type:'progressbar-native-result',requestId:'late-foreign',operation:'capture',result:{}});assert.equal(h.client.getState().phase,'stale');h.client.close();
 assert.throws(()=>createProgressBarClient({endpoint:'https://external.invalid/upload'}),/ENDPOINT_INVALID/);
});
const bundle=esbuild.buildSync({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{ProgressBarPilot}from'./src/design-check/ProgressBarPilot';export function mount(node,client){const root=createRoot(node);flushSync(()=>root.render(<div className="apollo-new"><ProgressBarPilot client={client}/></div>));return()=>root.unmount();}`,resolveDir:path.resolve(__dirname,'../..'),loader:'jsx'},bundle:true,write:false,format:'iife',globalName:'PilotTest',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
test('Patterns panel shows a separate labelled report with source details, node focus, stale state and explicit recheck',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,h=harness();let close;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 try{w.eval(bundle+'\nwindow.PilotTest=PilotTest;');close=w.PilotTest.mount(d.querySelector('#root'),h.client);assert.match(d.querySelector('button').textContent,/Проверить ProgressBar/);d.querySelector('button').click();await tick();await tick();
  assert.match(d.body.textContent,/Недостаточно данных/);assert.match(d.body.textContent,/не входит в результаты детерминированных/);assert.match(d.querySelector('.apollo-progressbar-start').textContent,/Перепроверить/);
  d.querySelector('[data-finding-focus]').click();await tick();assert.equal(h.native.at(-1).operation,'focus');
  d.querySelector('.apollo-finding-info-toggle').click();await tick();assert.ok(d.querySelector('dialog'));assert.match(d.querySelector('dialog').textContent,/goal-for-target-progress/);
  h.client.accept({type:'progressbar-invalidated',captureId:h.capture.captureId});await tick();assert.equal(d.querySelector('[data-finding-focus]').disabled,true);assert.match(d.body.textContent,/предыдущий агентский отчёт/);
 }finally{close?.();h.client.close();w.close();}
});
