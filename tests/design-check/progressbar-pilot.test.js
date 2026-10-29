const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),esbuild=require('esbuild'),{JSDOM}=require('jsdom');
const {createProgressBarClient}=require('../../src/design-check/progressbar-client');
const {PILOT,RESULT_SCHEMA,FAMILIES,RULE_IDS,validPreparation,validResult}=require('../../src/design-check/progressbar-protocol');
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
function harness({staleAtVerify=false,sourceError=false,foreignResult=false,mixed=false,legacyProxy=false,mutatePrepared,mutateResult,onOperation,runStatus='queued'}={}){
 const requests=[],native=[],sourcePin='a'.repeat(64),knowledge={contentVersion:'synthetic-knowledge'};
 const familyIds=mixed?Object.keys(FAMILIES):['progressbar'];
 const subjects=familyIds.map((family,index)=>({nodeId:'1:'+String(index+2),family,profile:FAMILIES[family].profile,kind:FAMILIES[family].kinds[0],ruleIds:FAMILIES[family].ruleIds,library:family==='progressbar'?'Web :: Corp Presets':'Web _ Core'}));
 const capture={schemaVersion:'apollo.progressbar-capture.v1',captureId:'synthetic',complete:true,nodes:[{id:'1:1',name:'Area'},...subjects.map(subject=>({id:subject.nodeId,parentId:'1:1',name:subject.kind}))]};
 const sources=Array.from(new Set(subjects.map(subject=>subject.profile))).map(profile=>({sourceId:'canonical-'+profile,path:'patterns/synthetic-'+profile+'.md',sha256:'b'.repeat(64)}));
 const prepared={pilot:PILOT,reportId:capture.captureId,captureId:capture.captureId,sourcePin,knowledge,subjects,sources,requestedRuleIds:RULE_IDS.filter(id=>subjects.some(subject=>subject.ruleIds.includes(id)))};
 const result={schemaVersion:RESULT_SCHEMA,pilot:PILOT,mode:'agent-pattern-pilot',reportId:capture.captureId,captureId:capture.captureId,sourcePin,knowledge,sources,deterministicFindingsIncluded:false,
  assessments:subjects.map(subject=>{const outcome=mixed?(['amount','icon-button'].includes(subject.family)?'violation':'compliant'):'insufficient-data';return {
   nodeId:foreignResult?'9:9':subject.nodeId,family:subject.family,kind:subject.kind,library:subject.library,severity:outcome==='violation'?(subject.family==='icon-button'?'warning':'error'):null,
   outcome,observation:'Synthetic observation.',reason:outcome==='insufficient-data'?'Purpose is unknown.':'Synthetic reason.',ruleIds:subject.ruleIds,
   ruleResults:subject.ruleIds.map(ruleId=>({ruleId,outcome,reason:'Synthetic rule reason.',evidenceNodeIds:[subject.nodeId]})),evidenceNodeIds:[subject.nodeId],
   sourceRefs:subject.ruleIds.map(ruleId=>({sourceId:'canonical-'+subject.profile,sha256:'b'.repeat(64),ruleId}))};})};
 mutatePrepared?.(prepared);mutateResult?.(result);
 let client;const response=value=>({ok:true,json:async()=>value});
 client=createProgressBarClient({onOperation,endpoint:'http://127.0.0.1:3007/v1/analyze/codex/runs',pollMs:1,request:async(url,options)=>{
  requests.push({url,options});if(options.method==='POST'){
   const body=JSON.parse(options.body);assert.equal(body.report.pilot,PILOT);
   if(body.report.phase==='prepare')return legacyProxy?{ok:false,json:async()=>({success:false,error:'Apollo pattern report facts.occurrences must be an array.'})}:response({success:true,preparation:prepared});
   if(sourceError)return {ok:false,json:async()=>({success:false,code:'PROGRESSBAR_SOURCE_STALE'})};
   return response({success:true,run:{id:'run_12345678-abcd',status:runStatus}});
  }
  return response({success:true,run:{id:'run_12345678-abcd',status:'completed',validation:result}});
 },send:message=>{native.push(message);queueMicrotask(()=>client.accept({type:'progressbar-native-result',requestId:message.requestId,operation:message.operation,
  ...(message.operation==='verify'&&staleAtVerify?{error:'PROGRESSBAR_CAPTURE_STALE'}:{result:message.operation==='capture'?capture:true})}));}});
 return{client,requests,native,result,capture,prepared};
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
 try{w.eval(bundle+'\nwindow.PilotTest=PilotTest;');close=w.PilotTest.mount(d.querySelector('#root'),h.client);assert.match(d.querySelector('button').textContent,/Проверить паттерны/);d.querySelector('button').click();await tick();await tick();
  assert.match(d.body.textContent,/Недостаточно данных/);assert.match(d.body.textContent,/не входит в результаты детерминированных/);assert.match(d.querySelector('.apollo-progressbar-start').textContent,/Перепроверить/);
  d.querySelector('[data-finding-focus]').click();await tick();assert.equal(h.native.at(-1).operation,'focus');
  d.querySelector('.apollo-finding-info-toggle').click();await tick();assert.ok(d.querySelector('dialog'));assert.match(d.querySelector('dialog').textContent,/goal-for-target-progress/);
  h.client.accept({type:'progressbar-invalidated',captureId:h.capture.captureId});await tick();assert.equal(d.querySelector('[data-finding-focus]').disabled,true);assert.match(d.body.textContent,/предыдущий агентский отчёт/);
 }finally{close?.();h.client.close();w.close();}
});

test('mixed pilot uses exactly 2 / 2 / 1 / 1 eligible rules and refuses missing, extra, duplicate, foreign, mismatched and inconsistent responses',()=>{
 const h=harness({mixed:true});try{
  assert.equal(validPreparation(h.prepared,h.capture),true);assert.equal(validResult(h.result,h.capture,h.prepared),true);
  assert.deepEqual(h.result.assessments.map(item=>item.ruleIds.length),[2,2,1,1]);
  const changes=[
   value=>value.assessments.pop(),value=>value.assessments.push(value.assessments[0]),value=>value.assessments[1].nodeId=value.assessments[0].nodeId,
   value=>value.schemaVersion='apollo.progressbar-assessment.v1',value=>value.assessments[1].ruleIds=FAMILIES.progressbar.ruleIds,
   value=>value.assessments[2].ruleResults.push(value.assessments[2].ruleResults[0]),value=>value.assessments[0].ruleResults[0].evidenceNodeIds=['foreign'],
   value=>value.assessments[1].family='progressbar',value=>value.assessments[1].library='Web :: Corp Presets',value=>value.assessments[3].severity='error',
   value=>value.assessments[1].outcome='compliant',value=>value.assessments[0].sourceRefs[0].sha256='c'.repeat(64),
   value=>value.assessments[1].sourceRefs[0].sourceId='canonical-progressbar',value=>value.assessments[0].evidenceNodeIds=[],
   value=>value.deterministicFindingsIncluded=true,value=>value.sourcePin='c'.repeat(64),value=>value.captureId='foreign'
  ];
  changes.forEach((change,index)=>{const value=structuredClone(h.result);change(value);assert.equal(validResult(value,h.capture,h.prepared),false,'mutation '+index);});
  for(const change of [value=>value.pilot='progressbar-goal-limit-v1',value=>value.subjects[1].ruleIds=FAMILIES.progressbar.ruleIds,value=>value.requestedRuleIds.pop()]){
   const value=structuredClone(h.prepared);change(value);assert.equal(validPreparation(value,h.capture),false);
  }
 }finally{h.client.close();}
});
test('unsupported Proxy and invalid eligible rule preparation stop before the paid run with no positive result',async()=>{
 for(const options of [{legacyProxy:true},{mutatePrepared:value=>{value.subjects[0].family='amount';}}]){
  const h=harness(options);try{assert.equal(await h.client.start(),false);assert.equal(h.requests.length,1);assert.equal(h.client.getState().report,null);
   assert.match(h.client.getState().error,options.legacyProxy?/обновите код Apollo Proxy/:/PATTERN_PREPARATION_INVALID/);
  }finally{h.client.close();}
 }
});
test('mixed UI retains known libraries, per-rule modal details, error and warning tones, and current node focus',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,h=harness({mixed:true});let close;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 try{w.eval(bundle+'\nwindow.PilotTest=PilotTest;');close=w.PilotTest.mount(d.querySelector('#root'),h.client);d.querySelector('.apollo-progressbar-start').click();await tick();await tick();
  const cards=Array.from(d.querySelectorAll('.apollo-finding-card'));assert.equal(cards.length,4);assert.match(d.querySelector('h2').textContent,/Паттерны компонентов/);
  assert.match(cards[1].querySelector('.apollo-finding-library').textContent,/Web _ Core/);assert.match(cards[1].querySelector('.apollo-finding-status').className,/violation/);
  assert.equal(cards[3].querySelector('h3').textContent,'Замечание');assert.match(cards[3].querySelector('.apollo-finding-status').className,/warning/);
  cards[3].querySelector('.apollo-finding-info-toggle').click();await tick();assert.match(d.querySelector('dialog').textContent,/icon-button-clear-context/);assert.doesNotMatch(d.querySelector('dialog').textContent,/goal-for-target-progress/);
  d.querySelector('[aria-label="Закрыть сведения проверки"]').click();await tick();cards[1].click();await tick();assert.equal(h.native.at(-1).nodeId,h.result.assessments[1].nodeId);
 }finally{close?.();h.client.close();w.close();}
});

test('pattern lifecycle traces early preparation failure separately from a model-backed completed run',async()=>{
 const failed=[],a=harness({legacyProxy:true,onOperation:kind=>({agent:()=>failed.push('agent'),finish:status=>failed.push([kind,status])})});await a.client.start();assert.deepEqual(failed,[['pattern-check','failed']]);a.client.close();
 const complete=[],b=harness({onOperation:kind=>({agent:()=>complete.push('agent'),finish:status=>complete.push([kind,status])})});await b.client.start();assert.deepEqual(complete,['agent',['pattern-check','completed']]);b.client.close();
});

test('pattern lifecycle retains remote cancellation and reports its local deadline as failure',async()=>{
 const cancelled=[],h=harness({runStatus:'cancelled',onOperation:()=>({agent(){},finish:status=>cancelled.push(status)})});
 assert.equal(await h.client.start(),false);assert.deepEqual(cancelled,['cancelled']);h.client.close();
 const realSetTimeout=global.setTimeout,failed=[];let expire;
 global.setTimeout=(fn,ms,...args)=>{if(ms===150000){expire=fn;return realSetTimeout(()=>{},150000);}return realSetTimeout(fn,ms,...args);};
 const client=createProgressBarClient({endpoint:'http://127.0.0.1:3007/v1/analyze/codex/runs',request:async()=>{throw Error('unexpected request');},send(){},onOperation:()=>({finish:status=>failed.push(status)})});
 try{const run=client.start();expire();assert.equal(await run,false);assert.deepEqual(failed,['failed']);}
 finally{global.setTimeout=realSetTimeout;client.close();}
});
