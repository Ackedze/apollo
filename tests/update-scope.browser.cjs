// The built UI/main, synthetic Proxy and native SLOT scene; only 800 px.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {postactionScene}=require("./postaction-scoped.fixture.cjs"),{surround,project}=require("./update-scope.fixture.cjs"),runtime=require("../dist/runtime.cjs");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function wait(fn){for(let i=0;i<800;i++){const value=fn();if(value)return value;await sleep(5);}throw Error('No expected Update refresh');}
function proxyReply(request,source,changed=false){
 const releaseId=(changed?'f':'e').repeat(64),contracts=[],resolutions=[];
 for(const identity of request.components){const loaded=runtime.loadAuthoringSource(source),contract=loaded.contract;
  if(!runtime.collectContractKeys(contract).has(identity.componentKey)){resolutions.push(Object.assign({},identity,{status:'not-found'}));continue;}
  if(!contracts.length)contracts.push({source,release:{id:releaseId,channel:'local-pilot',contractId:contract.package.id,sourceHash:loaded.sourceHash,manualSourceHash:contract.package.manualSourceHash,contractHash:runtime.contractHash(contract)}});
  resolutions.push(Object.assign({},identity,{status:'resolved',contractId:contract.package.id}));
 }return{releaseId,contracts,resolutions};
}
(async()=>{
 const out=process.env.POSTACTION_QA_ROOT;if(!out)throw Error('POSTACTION_QA_ROOT');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),receipts=[],errors=[];
 try{for(const scenario of ['valid','expired','cancel','peer-geometry','ancestor-geometry','hidden','page','topology','release']){
  const page=await browser.newPage({viewport:{width:800,height:860}}),f=postactionScene(),requests=[];let clock=0,ready=false,pending=[],held=false,release,refreshId,outsideReads=0;
  class Clock extends Date{static now(){return clock;}}
  project(f);const outer=surround(f,{onRead:()=>outsideReads++});
  const hidden=f.node('invented-original-hidden','RECTANGLE',f.area,{visible:false,opacity:1,explicitVariableModes:{},resolvedVariableModes:{},fills:[],strokes:[],effects:[]});
  f.api.ui.postMessage=m=>{f.messages.push(JSON.parse(JSON.stringify(m)));if(m.type==='document-recheck-start')refreshId=m.requestId;if(ready)void page.evaluate(m=>window.emitPlugin(m),m).catch(()=>{});else pending.push(m);};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../dist/code.js"),'utf8'),{figma:f.api,__html__:'',TextEncoder,Date:Clock,setTimeout,clearTimeout});
  await page.exposeFunction('nativeHost',m=>{requests.push(m);return f.api.ui.onmessage(m);});
  await page.addInitScript(()=>{parent.postMessage=v=>{void window.nativeHost(v.pluginMessage);};window.emitPlugin=m=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:m}}));const timer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>{if(ms===65000)window.fireRefreshTimeout=()=>fn(...args);return timer(fn,ms,...args);};});
  await page.route(/^https?:/,async route=>{
   const req=route.request();if(!req.url().endsWith('/v2/contracts/resolve'))return route.abort();
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*','Content-Type':'application/json'};
   if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});const body=req.postDataJSON(),refreshing=Boolean(refreshId);
   if(refreshing&&body.releaseId&&!held){held=true;await new Promise(r=>release=r);clock+=scenario==='expired'?61000:16000;}
   await route.fulfill({status:200,headers,body:JSON.stringify(proxyReply(body,f.source,refreshing&&scenario==='release'))});
  });
  page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(__dirname,"../dist/ui.html")).href);ready=true;for(const m of pending)await page.evaluate(m=>window.emitPlugin(m),m);
  const button=()=>page.getByRole('button',{name:'Проверить',exact:true}),category=name=>page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:new RegExp('^'+name+'(?: \\d|$)')});
  await button().click();const original=await wait(()=>f.messages.find(m=>m.type==='audit-result'));const native=await wait(()=>f.messages.find(m=>m.type==='document-audit-result'));await button().waitFor();assert.equal(outsideReads,0);
  const previousStyles=native.result.checks[4].findings.filter(x=>x.status!=='unknown').length;await category('Пора обновить').click();const actualCard=page.locator('.document-audit-finding').filter({has:page.getByRole('heading',{name:'Составной компонент',exact:true})});
  f.page.selection=[];f.emit('selectionchange');await actualCard.getByRole('button',{name:'Обновить',exact:true}).click();await wait(()=>held);await page.getByText('Подтверждаем версию контрактов через Proxy…',{exact:true}).waitFor();assert.match(await category('Пора обновить').textContent(),/2$/);assert.equal(await actualCard.getByRole('button',{name:'Обновить',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Перепроверяем',exact:true}).isDisabled(),true);assert.equal(outsideReads,0);
  const start=f.messages.find(m=>m.type==='document-recheck-start');assert.ok(!start.affectedNodeIds.some(id=>id.startsWith('invented-outside')));
  await f.api.ui.onmessage({type:'contracts-resolved',requestId:'foreign-update-rpc',data:proxyReply({components:[]},f.source)});await page.evaluate(m=>window.emitPlugin(m),{type:'document-recheck-result',schemaVersion:'apollo.document-audit.v1',requestId:'foreign-update-refresh',runId:native.result.runId});assert.equal(f.messages.some(m=>m.type==='document-recheck-result'),false);
  if(scenario==='valid')for(let i=0;i<4;i++)await f.mutate({nodeChanges:[{id:f.actual.id,node:f.actual}]});
  if(scenario==='cancel')await page.evaluate(()=>window.fireRefreshTimeout());
  if(scenario==='peer-geometry'){f.peer.width+=10;await f.mutate({nodeChanges:[{id:f.peer.id,node:f.peer}]});}
  if(scenario==='ancestor-geometry'){outer.width+=10;await f.mutate({nodeChanges:[{id:outer.id,node:outer}]});}
  if(scenario==='hidden'){hidden.opacity=.3;}
  if(scenario==='topology'){f.node('invented-late-projected-child','RECTANGLE',f.actual,{visible:true});await f.mutate({nodeChanges:[{id:f.actual.id,node:f.actual}]});}
  if(scenario==='page'){f.api.currentPage=Object.assign({},f.page,{id:'invented-other-page',selection:[]});f.emit('currentpagechange');}
  release();const terminal=await wait(()=>f.messages.find(m=>['document-recheck-result','document-recheck-error'].includes(m.type)));await button().waitFor();
  if(scenario==='valid'){
   assert.equal(terminal.type,'document-recheck-result');assert.equal(terminal.result.context.selectionSignature,native.result.context.selectionSignature);assert.equal(terminal.result.checks.length,5);assert.equal(terminal.result.checks[1].findings.some(x=>x.name==='Составной компонент'&&x.status==='update'),false);assert.equal(terminal.result.checks[1].findings.find(x=>x.name==='Второй экземпляр').status,'update');assert.match(await category('Пора обновить').textContent(),/1$/);await actualCard.waitFor({state:'detached'});
   const peerCard=page.locator('.document-audit-finding').filter({has:page.getByRole('heading',{name:'Второй экземпляр',exact:true})});assert.equal(await peerCard.getByRole('button',{name:'Обновить',exact:true}).isEnabled(),true);
   assert.equal(terminal.result.checks[4].findings.filter(x=>x.status!=='unknown').length,previousStyles-1);assert.ok(!terminal.contract.audit.result.engine.evaluations.some(e=>e.componentScopeId==='actual'&&e.ruleId.includes('fill')&&e.classification==='violation'));
   assert.ok(original.audit.result.engine.evaluations.some(e=>e.componentScopeId==='actual'&&e.ruleId.includes('fill')&&e.classification==='violation'));assert.ok(terminal.contract.audit.result.engine.evaluations.some(e=>e.componentScopeId==='actual'&&e.classification==='violation'));
   await category('Кастомные стили и токены').click();assert.match(await category('Кастомные стили и токены').textContent(),new RegExp((previousStyles-1)+'$'));
   await category('Темизация').click();assert.match(await category('Темизация').textContent(),/1$/);const themeStart=f.messages.length;await page.getByRole('button',{name:'Сменить',exact:true}).click();const themed=await wait(()=>f.messages.slice(themeStart).find(m=>m.type==='document-recheck-result'));await button().waitFor();assert.equal(themed.result.checks[2].findings[0].status,'theme-current');assert.match(await category('Темизация').textContent(),/0$/);
  }else{
   assert.equal(terminal.type,'document-recheck-error');await sleep(30);assert.equal(f.messages.some(m=>m.type==='document-recheck-result'),false);assert.match(await category('Пора обновить').textContent(),/2$/);assert.equal(await page.getByRole('button',{name:'Обновить',exact:true}).count(),0);
  }
  assert.equal(outsideReads,0);assert.equal(f.writes.filter(x=>x[0]==='swap').length,1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);receipts.push({scenario,width:800,type:terminal.type,outsideDescendantReads:outsideReads,projectedSlotRoot:true,heldStage:'release-verification',originalScopeIndependentOfSelection:true,allCategories:5,foreignReplyIgnored:true,countersHeldUntilFresh:true});f.emit('close');await page.close();
 }assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({actualBuiltUi:true,actualBuiltMain:true,syntheticProxy:true,liveFigma:false,widths:[800],errors,receipts},null,2)+'\n');console.log(JSON.stringify({scenarios:receipts.length,width:800,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
