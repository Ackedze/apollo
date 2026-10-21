// Built UI/main integration. The Figma API and transport are synthetic.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{fixture}=require("./document-audit.test");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 const out=process.env.DOCUMENT_AUDIT_QA_ROOT;if(!out)throw Error('Set DOCUMENT_AUDIT_QA_ROOT');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),errors=[],receipts=[];let checks=0;
 try{for(const width of [800,440,360]){
  const page=await browser.newPage({viewport:{width,height:860}}),f=fixture(),area=f.node('Исходная область');
  const local=f.component('Локальная кнопка',false,'',area);f.node('Локальный набор','COMPONENT_SET',area,{remote:false,key:'invented-local-set'});
  f.node('Подтверждённый детач','FRAME',area,{detachedInfo:{type:'library',componentKey:'invented-library-key'}});
  f.node('Непривязанная заливка','RECTANGLE',area,{fills:[{type:'SOLID',color:{r:1,g:0,b:0}}],fillStyleId:''});
  const remote=f.component('old',true,'published');f.component('latest-published',true,'published');let active=0,peak=0;
  for(let i=0;i<375;i++)f.node('Экземпляр '+i,'INSTANCE',area,{getMainComponentAsync:async()=>{peak=Math.max(peak,++active);await sleep(3);active--;return remote;}});
  f.theme('base');area.resolvedVariableModes={theme:'corp'};f.page.selection=[area];let ready=false,pending=[],releaseContract,contractStarted=false;
  const gate=new Promise(r=>releaseContract=r),requests=[];
  f.api.ui.postMessage=m=>{f.messages.push(JSON.parse(JSON.stringify(m)));if(ready)void page.evaluate(m=>window.emitPlugin(m),m).catch(()=>{});else pending.push(m);};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../dist/code.js"),'utf8'),{figma:f.api,__html__:'',TextEncoder,setTimeout,clearTimeout});
  await page.exposeFunction('nativeHost',m=>{requests.push(m);return f.api.ui.onmessage(m);});
  await page.addInitScript(()=>{parent.postMessage=v=>{void window.nativeHost(v.pluginMessage);};window.emitPlugin=m=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:m}}));const timer=window.setTimeout;window.setTimeout=(f,ms,...args)=>{if(ms===60000)window.fireContractTimeout=()=>f(...args);return timer(f,ms,...args);};});
  await page.route(/^https?:/,async route=>{const req=route.request();if(req.url().endsWith('/v2/contracts/resolve')){const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*','Content-Type':'application/json'};if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});contractStarted=true;await gate;const body=req.postDataJSON();return route.fulfill({status:200,headers,body:JSON.stringify({releaseId:'invented-release',contracts:[],resolutions:body.components.map(x=>Object.assign({},x,{status:'not-found'}))})});}return route.abort();});
  page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(__dirname,"../dist/ui.html")).href);ready=true;for(const m of pending)await page.evaluate(m=>window.emitPlugin(m),m);pending=[];
  const action=()=>page.getByRole('button',{name:/^Провер(?:ить|яем)$/}),category=name=>page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:new RegExp('^'+name)}).click();
  await action().click();f.page.selection=[];f.emit('selectionchange');
  for(let i=0;i<1000&&!f.messages.some(m=>m.type==='document-audit-result');i++)await sleep(5);
  // Shared getter sees the independent capture pools (12 + 12) and native recheck (16).
  const native=f.messages.find(m=>m.type==='document-audit-result');assert.ok(native);assert.equal(native.result.context.selectionSignature,area.id);assert.ok(peak>1&&peak<=40);checks+=3;
  for(let i=0;i<300&&!contractStarted;i++)await sleep(5);assert.ok(contractStarted);assert.equal(await action().isDisabled(),true);assert.equal(await page.getByText('Проверки документа завершены.',{exact:false}).isVisible(),false);checks+=3;
  await category('Локальные компоненты');await page.getByRole('heading',{name:local.name,exact:true}).waitFor();await page.getByRole('heading',{name:'Локальный набор',exact:true}).waitFor();checks+=2;
  await page.getByRole('button',{name:'Найти в макете',exact:true}).first().click();for(let i=0;i<300&&!f.writes.length;i++)await sleep(5);assert.equal(f.writes.length,1);assert.ok(f.messages.some(m=>m.type==='document-audit-focus-result'&&m.success));checks+=2;
  await page.screenshot({path:path.join(out,'local-'+width+'.png')});
  await category('Детач');await page.getByRole('heading',{name:'Подтверждённый детач',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Непривязанная заливка',exact:true}).count(),0);checks+=2;await page.screenshot({path:path.join(out,'detached-'+width+'.png')});
  await category('Кастомные стили и токены');await page.getByRole('heading',{name:'Непривязанная заливка',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Подтверждённый детач',exact:true}).count(),0);checks+=2;await page.screenshot({path:path.join(out,'styles-'+width+'.png')});
  await category('Темизация');await page.getByText('На текущей странице не выбран явный режим Corp.',{exact:true}).waitFor();checks++;
  const auditRequest=requests.find(m=>m.type==='audit');assert.ok(auditRequest);await page.evaluate(()=>window.fireContractTimeout());
  for(let i=0;i<300&&!f.messages.some(m=>m.type==='audit-cancelled'&&m.requestId===auditRequest.requestId);i++)await sleep(5);
  assert.ok(requests.some(m=>m.type==='audit-cancel'&&m.requestId===auditRequest.requestId));assert.ok(f.messages.some(m=>m.type==='audit-cancelled'&&m.requestId===auditRequest.requestId));checks+=2;
  await page.getByRole('button',{name:'Проверить',exact:true}).waitFor();assert.equal(await action().isEnabled(),true);assert.equal(await page.locator('.document-audit-finding').count(),1);checks+=2;
  releaseContract();await sleep(50);assert.equal(f.messages.some(m=>m.type==='audit-result'&&m.requestId===auditRequest.requestId),false);checks++;
  area.name='Изменённая область';await f.mutate({nodeChanges:[{id:area.id,type:'PROPERTY_CHANGE'}]});await page.getByRole('status').filter({hasText:'Результат проверки документа устарел'}).waitFor();
  assert.equal(await page.locator('.document-audit-finding').count(),1);assert.equal(await page.getByRole('button',{name:'Найти в макете',exact:true}).isDisabled(),true);checks+=2;
  const rect=await page.locator('.results-pane').evaluate(n=>{const r=n.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight};});assert.ok(rect.top>=0&&rect.bottom<=rect.viewport&&rect.height>=260);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks+=2;
  await page.screenshot({path:path.join(out,'stale-'+width+'.png')});receipts.push({width,occurrences:375,peak,rect,cancelAcknowledged:true,lateContractRejected:true,sourceChangeStale:true});f.emit('close');await page.close();
 }assert.deepEqual(errors,[]);checks++;fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({checks,errors,receipts,actualBuiltUi:true,actualBuiltMain:true,syntheticOnly:true,liveFigma:false},null,2)+'\n');console.log(JSON.stringify({checks,errors,widths:[800,440,360],liveFigma:false}));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e.stack);process.exitCode=1;});
