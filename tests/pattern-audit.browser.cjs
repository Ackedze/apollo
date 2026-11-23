'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{build}=require('esbuild');
const {pathToFileURL}=require('node:url'),apollo=path.resolve(__dirname,'..'),proxy=process.env.APOLLO_PROXY_TEST_ROOT||path.resolve(apollo,'../../services/apollo-proxy');
const p=require('../src/figma-audit/protocol'),{createFigmaAuditBridge}=require('../src/figma-audit/native'),{createAuditService}=require(path.join(proxy,'src/figma-audit/service'));
async function run(){
 const output=process.env.DESIGN_CHECK_QA_ROOT;if(!output)throw Error('Set DESIGN_CHECK_QA_ROOT to a private directory.');fs.mkdirSync(output,{recursive:true});
 const entry=[
 "import React from 'react';import{createRoot}from'react-dom/client';import{PatternAuditSkill}from "+JSON.stringify(path.join(apollo,'src/skills/pattern-audit/PatternAuditSkill')),
 'import '+JSON.stringify(path.join(apollo,'src/skills/layer-names/ui.css')),
 'import '+JSON.stringify(path.join(apollo,'src/design-check/new-shell.css')),
 'import '+JSON.stringify(path.join(apollo,'src/design-check/finding-card.css')),
 'const{createPatternAuditClient}=require('+JSON.stringify(path.join(apollo,'src/skills/pattern-audit/client'))+')',
 "const client=createPatternAuditClient({send:m=>void window.nativeRequest(m).then(reply=>client.accept(reply)),request:async(url,options)=>{const value=await window.proxyRequest(url,options?.body);return{ok:value.success===true,status:value.success?200:503,json:async()=>value};}});window.auditClient=client;createRoot(document.getElementById('root')).render(<div className=\"apollo-skills\"><PatternAuditSkill client={client} scopeName=\"Синтетическая форма\"/></div>);"
 ].join(';');
 await build({stdin:{contents:entry,resolveDir:apollo,loader:'tsx'},nodePaths:[path.join(apollo,'node_modules')],bundle:true,outfile:path.join(output,'patterns.js'),define:{'process.env.NODE_ENV':'"production"'}});
 fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="patterns.css"><style>body{margin:0;font:14px "Apollo Alfa",sans-serif}#root{padding:20px}</style><div id="root"></div><script src="patterns.js"></script></html>');
 let service,native,root,currentPage,release,calls=0;const errors=[],operations=[],prompts=[],sourceId='knowledge/data/ds-ai-hub/products/ab/patterns/fixture.md',quote='Между самостоятельными блоками используйте 24 px.';
 const step=(action,extra={})=>Object.assign({action,query:'',resourceId:'',offset:0,nodeIds:[],plan:[],checks:[],summary:'Синтетический эксперимент',gaps:[],excluded:[],documents:[]},extra);
 function reset(mode='mixed'){
  calls=0;release=null;prompts.length=0;currentPage={id:'page',type:'PAGE'};root={id:'root',name:'Форма — синтетический пример',type:'FRAME',parent:currentPage,children:[],itemSpacing:12,fills:[]};currentPage.selection=[root];
  native=createFigmaAuditBridge({api:{currentPage,viewport:{scrollAndZoomIntoView:()=>{}}},hash:JSON.stringify,post:()=>{}});
  const statuses=mode==='pass'?['PASS']:['FAIL','FAIL','UNKNOWN'],plan=statuses.map((_,i)=>({id:'rule-'+i,sourceId,rule:'Правило '+(i+1),targets:['root'],requiredFields:[{id:'gap-'+i,field:'itemSpacing',nodeId:'root',role:'target'}]}));
  const checks=statuses.map((status,i)=>({id:'rule-'+i,status,actual:'12 px',expected:'24 px',evidenceIds:['native-1'],sourceQuote:quote,reason:status==='UNKNOWN'?'Не установлено назначение в сценарии.':'Наблюдаемый отступ отличается от требования.',fix:status==='FAIL'?'Установить 24 px':'',severity:i===1?'warning':'error',factBindings:[{factId:'gap-'+i,evidenceId:'native-1'}]}));
  const outputs=[step('plan',{plan}),step('read_nodes',{nodeIds:['root']}),step('begin_report'),step('finish',{checks})],receipts=new Map();
  service=createAuditService({protocol:p,history:{readRequest:id=>receipts.get(id)||null,writeRequest:r=>receipts.set(r.requestId,structuredClone(r)),readRun:()=>null},persist:()=>{},knowledge:()=>({id:'fixture',skill:{id:'pattern-audit',version:'0.1.0'},knowledgeVersion:'fixture-md',documentRouting:null,customizationFacts:null,instructions:'Synthetic fixture only; MD norms.',initial:[],sources:()=>[{id:sourceId,offset:0,end:quote.length,sha256:'f'.repeat(64)}],assertCurrent(){},hasRead:(_id,q)=>q===quote}),invoke:async({prompt,schema,runId,requestId,phase})=>{
   calls++;prompts.push({prompt,schema,runId,requestId,phase});if(calls===2)await new Promise(resolve=>{release=resolve;});return{result:outputs[calls-1],usage:{measurementId:'u'+calls,actualInputTokens:10,actualOutputTokens:2}};
  }});
 }
 reset();const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:800,height:860},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,route=>route.abort());
  await page.exposeFunction('nativeRequest',async message=>{operations.push(message.operation);try{return{type:'figma-audit-native-result',callId:message.callId,success:true,result:await native.execute(message)};}catch(e){return{type:'figma-audit-native-result',callId:message.callId,success:false,code:e.code};}});
  await page.exposeFunction('proxyRequest',(url,body)=>{try{
   const data=body?JSON.parse(body):{},u=new URL(url);assert(u.pathname.startsWith('/skills/pattern-audit/'));
   if(u.pathname.endsWith('/status'))return{success:true,wireVersion:p.VERSION,requestControl:'request-id-v1',factEvidence:'native-fields-v1'};
   if(u.pathname.includes('/requests/')){const id=decodeURIComponent(u.pathname.split('/')[4]);return Object.assign({success:true},u.pathname.endsWith('/cancel')?service.cancelRequest(id):service.control(id));}
   if(u.pathname.endsWith('/runs'))return{success:true,run:service.start(data)};
   const id=u.pathname.split('/')[4],requestId=u.searchParams.get('requestId');
   if(u.pathname.endsWith('/context'))return{success:true,run:service.context(id,data)};
   if(u.pathname.endsWith('/input')){const run=service.get(id,requestId);return{success:true,input:{kind:'apollo.pattern-audit-input.v1',runId:id,requestId,snapshotId:run.snapshotId,steps:prompts}};}
   return{success:true,run:service.get(id,requestId)};
  }catch(e){return{success:false,code:e.code||e.message};}});
  const load=async()=>{await page.goto(pathToFileURL(path.join(output,'index.html')).href);await page.getByRole('button',{name:'Проверка паттернов',exact:true}).click();};
  const dialog=page.getByRole('dialog',{name:'Проверка паттернов',exact:true}),start=()=>dialog.getByRole('button',{name:'Запустить проверку',exact:true});
  const select=valid=>page.evaluate(valid=>window.auditClient.selection({pageId:'page',id:valid?'root':'',valid}),valid);
  const screenshot=async name=>{await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(output,name+'.png')});};
  await load();assert.equal(await start().isDisabled(),true);await select(true);assert.equal(await start().isEnabled(),true);await screenshot('patterns-idle');
  await start().click();await dialog.getByRole('button',{name:'Остановить',exact:true}).waitFor();while(!release)await page.waitForTimeout(10);await screenshot('patterns-running');
  await dialog.getByRole('button',{name:'Закрыть проверку паттернов',exact:true}).click();await page.getByRole('button',{name:'Проверка паттернов',exact:true}).click();assert.equal(calls,2);
  release();await dialog.getByRole('tab',{name:'Нарушения · 1',exact:true}).waitFor();assert.equal(calls,4);assert.equal(operations.filter(x=>x==='verify').length,2);await screenshot('patterns-results');
  assert.equal(await dialog.getByRole('button',{name:/Применить|Заменить/}).count(),0);
  await dialog.getByRole('tab',{name:'Нарушения · 1'}).focus();await page.keyboard.press('ArrowRight');assert.equal(await dialog.getByRole('tab',{name:'Рекомендации · 1'}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');assert.equal(await dialog.getByRole('tab',{name:'Не проверено · 1'}).getAttribute('aria-selected'),'true');await screenshot('patterns-unchecked');
  await dialog.getByRole('tab',{name:'Нарушения · 1'}).click();await dialog.getByRole('button',{name:'Источник правила',exact:true}).click();await page.getByText(quote,{exact:true}).waitFor();await screenshot('patterns-source');await page.keyboard.press('Escape');
  currentPage.selection=[];await select(false);const focus=dialog.getByRole('button',{name:'Показать в макете: Форма — синтетический пример',exact:true});assert.equal(await focus.isEnabled(),true);await focus.click();assert.deepEqual(currentPage.selection,[root]);
  const download=async label=>{await dialog.getByRole('button',{name:'Скачать диагностику',exact:true}).click();const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:label,exact:true}).click();return JSON.parse(fs.readFileSync(await (await pending).path(),'utf8'));};
  const report=await download('Скачать отчёт');assert.equal(report.tool,'pattern-audit');assert.equal(report.result.checks.length,3);
  const input=await download('Исходный JSON');assert.equal(input.steps.length,4);assert.deepEqual(input.steps.map(s=>s.prompt),prompts.map(s=>s.prompt));
  await page.evaluate(()=>window.auditClient.accept({type:'native-diagnostic-invalidated'}));assert.equal(await focus.isDisabled(),true);await screenshot('patterns-stale');
  await dialog.getByRole('button',{name:'Закрыть проверку паттернов',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Проверка паттернов',exact:true}).evaluate(n=>n===document.activeElement),true);
  reset('pass');await load();await select(true);await start().click();while(!release)await page.waitForTimeout(10);release();await dialog.getByText('В выполненных проверках нарушения не найдены.',{exact:true}).waitFor();assert.equal(await dialog.getByRole('tablist').count(),0);await screenshot('patterns-pass');
  reset();await load();await select(true);await start().click();while(!release)await page.waitForTimeout(10);await dialog.getByRole('button',{name:'Остановить',exact:true}).click();release();await dialog.getByText(/Проверка остановлена/).first().waitFor();assert.equal(await dialog.getByRole('tablist').count(),0);await screenshot('patterns-cancelled');
  assert.deepEqual(errors,[]);const summary={passed:true,width:800,realAgent:false,liveFigma:false,checks:['separate card/dialog/client/endpoint','idle/running/results/source/unchecked/pass/stale/cancelled','reopen without rerun','native freshness','keyboard tabs and focus return','no mutations','focus after deselection','owned original-input download','no console errors']};fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
 }finally{release?.();await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
