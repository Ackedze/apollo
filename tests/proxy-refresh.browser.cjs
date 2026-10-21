// Bundled UI/main and synthetic Proxy transport at the one shipped width.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {postactionScene}=require("./postaction-scoped.fixture.cjs"),runtime=require("../dist/runtime.cjs");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function wait(fn){for(let i=0;i<800;i++){const value=fn();if(value)return value;await sleep(5);}throw Error('No expected refresh event');}
function proxyReply(request,source,changed=false){
 const releaseId=(changed?'f':'e').repeat(64),contracts=[],resolutions=[];
 for(const identity of request.components){const loaded=runtime.loadAuthoringSource(source),contract=loaded.contract;
  if(!runtime.collectContractKeys(contract).has(identity.componentKey)){resolutions.push(Object.assign({},identity,{status:'not-found'}));continue;}
  if(!contracts.length)contracts.push({source,release:{id:releaseId,channel:'local-pilot',contractId:contract.package.id,sourceHash:loaded.sourceHash,manualSourceHash:contract.package.manualSourceHash,contractHash:runtime.contractHash(contract)}});
  resolutions.push(Object.assign({},identity,{status:'resolved',contractId:contract.package.id}));
 }
 return{releaseId,contracts,resolutions};
}
(async()=>{
 const out=process.env.POSTACTION_QA_ROOT;if(!out)throw Error('POSTACTION_QA_ROOT');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),receipts=[],errors=[];
 try{for(const scenario of ['valid','expired','cancel','edit','page','topology','release']){
  const page=await browser.newPage({viewport:{width:800,height:860}}),f=postactionScene(),requests=[];let clock=0,ready=false,pending=[],held=false,release,refreshId;
  class Clock extends Date{static now(){return clock;}}
  Object.defineProperty(f.actual,'resolvedVariableModes',{get:()=>({theme:f.page.explicitVariableModes.theme})});f.peer.resolvedVariableModes={theme:'base'};f.peer.explicitVariableModes={theme:'base'};
  const create=f.actual.main.createInstance;f.actual.main.createInstance=()=>{const n=create();n.setExplicitVariableModeForCollection=(c,mode)=>{n.resolvedVariableModes=Object.assign({},n.resolvedVariableModes,{[c.id]:mode});};return n;};
  f.api.ui.postMessage=m=>{f.messages.push(JSON.parse(JSON.stringify(m)));if(m.type==='document-recheck-start')refreshId=m.requestId;if(ready)void page.evaluate(m=>window.emitPlugin(m),m).catch(()=>{});else pending.push(m);};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../dist/code.js"),'utf8'),{figma:f.api,__html__:'',TextEncoder,Date:Clock,setTimeout,clearTimeout});
  await page.exposeFunction('nativeHost',m=>{requests.push(m);return f.api.ui.onmessage(m);});
  await page.addInitScript(()=>{parent.postMessage=v=>{void window.nativeHost(v.pluginMessage);};window.emitPlugin=m=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:m}}));const timer=window.setTimeout;window.refreshTimers=[];window.setTimeout=(fn,ms,...args)=>{if(ms===65000){window.refreshTimers.push(ms);window.fireRefreshTimeout=()=>fn(...args);}return timer(fn,ms,...args);};});
  await page.route(/^https?:/,async route=>{
   const req=route.request();if(!req.url().endsWith('/v2/contracts/resolve'))return route.abort();
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*','Content-Type':'application/json'};
   if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});
   const body=req.postDataJSON(),refreshing=Boolean(refreshId);
   if(refreshing&&!held){held=true;await new Promise(r=>release=r);clock+=scenario==='expired'?61000:16000;}
   await route.fulfill({status:200,headers,body:JSON.stringify(proxyReply(body,f.source,refreshing&&scenario==='release'))});
  });
  page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(__dirname,"../dist/ui.html")).href);ready=true;for(const m of pending)await page.evaluate(m=>window.emitPlugin(m),m);
  const button=()=>page.getByRole('button',{name:'Проверить',exact:true}),category=name=>page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:new RegExp('^'+name+'(?: \\d|$)')});
  await button().click();const contract=await wait(()=>f.messages.find(m=>m.type==='audit-result'));const native=await wait(()=>f.messages.find(m=>m.type==='document-audit-result'));await button().waitFor();
  const peer=JSON.stringify(contract.audit.components.find(c=>c.scopeId==='peer'));await category('Темизация').click();await page.getByRole('button',{name:'Сменить',exact:true}).click();await wait(()=>held);
  await page.getByText('Получаем контракты компонентов через Proxy…',{exact:true}).waitFor();assert.match(await category('Темизация').textContent(),/1$/);assert.equal(await page.getByRole('button',{name:'Перепроверяем',exact:true}).isDisabled(),true);assert.deepEqual(await page.evaluate(()=>window.refreshTimers),[65000]);
  const ack=f.messages.find(m=>m.type==='document-action-result');await f.api.ui.onmessage({type:'contracts-resolved',requestId:'foreign-proxy-request',data:proxyReply({components:[]},f.source)});await page.evaluate(m=>window.emitPlugin(m),{type:'document-recheck-result',schemaVersion:'apollo.document-audit.v1',requestId:'foreign-refresh',runId:ack.runId});assert.equal(f.messages.some(m=>m.type==='document-recheck-result'),false);
  if(scenario==='valid')for(let i=0;i<3;i++)await f.mutate({nodeChanges:[{id:f.actual.id,node:f.actual}]});
  if(scenario==='cancel')await page.evaluate(()=>window.fireRefreshTimeout());
  if(scenario==='edit'){f.peer.opacity=.13;await f.mutate({nodeChanges:[{id:f.peer.id,node:f.peer}]});}
  if(scenario==='topology'){f.node('invented-new-child','RECTANGLE',f.area,{visible:true});await f.mutate({nodeChanges:[{id:f.area.id,node:f.area}]});}
  if(scenario==='page'){f.api.currentPage=Object.assign({},f.page,{id:'invented-other-page',selection:[]});f.emit('currentpagechange');}
  release();
  const terminal=await wait(()=>f.messages.find(m=>['document-recheck-result','document-recheck-error'].includes(m.type)));await button().waitFor();
  if(scenario==='valid'){
   assert.equal(terminal.type,'document-recheck-result');assert.equal(terminal.result.checks.length,5);assert.equal(terminal.result.checks[2].findings.filter(x=>x.status==='theme-mismatch').length,0);assert.equal(JSON.stringify(terminal.contract.audit.components.find(c=>c.scopeId==='peer')),peer);assert.equal(await page.getByRole('button',{name:'Сменить',exact:true}).count(),0);assert.match(await category('Темизация').textContent(),/0$/);
   assert.equal(f.messages.filter(m=>m.type==='resolve-contracts'&&m.requestId.startsWith('recheck:')).length,2);await category('Пора обновить').click();assert.equal(await page.getByRole('button',{name:'Обновить',exact:true}).count(),2);assert.equal(await page.getByRole('button',{name:'Обновить',exact:true}).last().isEnabled(),true);
   // A second action uses the newly issued native action registry, not the old run.
   const start=f.messages.length;await page.locator('.document-audit-finding').filter({has:page.getByRole('heading',{name:'Составной компонент',exact:true})}).getByRole('button',{name:'Обновить',exact:true}).click();const updated=await wait(()=>f.messages.slice(start).find(m=>m.type==='document-recheck-result'));await button().waitFor();assert.equal(updated.result.checks[1].findings.some(x=>x.name==='Составной компонент'&&x.status==='update'),false);assert.match(await category('Пора обновить').textContent(),/1$/);assert.equal(await page.getByRole('button',{name:'Обновить',exact:true}).last().isEnabled(),true);
  }else{
   assert.equal(terminal.type,'document-recheck-error');await sleep(30);assert.equal(f.messages.some(m=>m.type==='document-recheck-result'),false);assert.match(await category('Темизация').textContent(),/1$/);assert.equal(await page.getByRole('button',{name:'Сменить',exact:true}).count(),0);
  }
  assert.equal(f.writes.filter(x=>x[0]==='theme').length,1);receipts.push({scenario,width:800,type:terminal.type,syntheticElapsedMs:clock,nativeCategories:native.result.checks.length,foreignReplyIgnored:true,countersHeldUntilFresh:true,stageVisible:true});f.emit('close');await page.close();
 }assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({actualBuiltUi:true,actualBuiltMain:true,syntheticProxy:true,liveFigma:false,widths:[800],errors,receipts},null,2)+'\n');console.log(JSON.stringify({scenarios:receipts.length,width:800,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
