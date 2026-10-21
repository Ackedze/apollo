const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
const {auditDelivery}=require("../src/audit-report"),runtime=require("../dist/runtime.cjs"),fixture=require("./fixtures");
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
try{const page=await browser.newPage({acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const snapshot=fixture.snapshot(),contract=fixture.contract();snapshot.nodes[0].appearance.opacity=.5;
 const component={scopeId:'scope',auditId:'c'.repeat(64),name:'Synthetic',snapshot,result:runtime.auditContractSnapshot(snapshot,contract),release:{channel:'local-pilot',id:'r',contractId:'test'}};
 const full={schemaVersion:'apollo.area-audit.v1-experimental',auditId:'a'.repeat(64),components:[component],release:{channel:'local-pilot'},warnings:[],notChecked:[],result:runtime.aggregateAreaResult([component],[],{complete:true,components:[{}]})};
 const data=auditDelivery({audit:full,rules:contract.rules.map(r=>({ruleId:r.ruleId,componentScopeId:'scope',title:r.presentation.title,assert:r.assert})),focusTargets:{schemaVersion:'apollo.audit-focus-targets.v1',runId:full.auditId,findings:[]}});
 for(const width of [800,1024]){await page.setViewportSize({width,height:860});await page.goto(pathToFileURL(path.resolve(__dirname,"../dist/ui.html")).href);
  await page.evaluate(()=>{window.bridgeMessages=[];window.httpRequests=[];parent.postMessage=m=>window.bridgeMessages.push(m.pluginMessage);window.emit=d=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:d}}));window.fetch=async(url,options)=>{window.httpRequests.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>({success:true,explanation:'Selected component explained'})};};window.emit({type:'selection',valid:true,name:'Synthetic'});});
  await page.getByRole('button',{name:/^Компоненты:/}).click();await page.getByRole('navigation',{name:'Категории проверки'}).getByRole('button',{name:/^Кастомы/}).click();await page.getByRole('button',{name:'Проверить',exact:true}).click();
  const request=await page.evaluate(()=>window.bridgeMessages.filter(m=>['audit','audit-report-request'].includes(m.type)).at(-1));assert.equal(request.platform,'desktop');await page.evaluate(({data,request})=>window.emit(Object.assign({type:'audit-result',requestId:request.requestId},data)),{data,request});
  await page.waitForSelector('.apollo-finding-card');assert.equal(await page.locator('.apollo-finding-card').count(),1);assert.equal((await page.evaluate(()=>window.httpRequests)).length,0);
  await page.getByText('Источники проверки',{exact:true}).click();
  const smallDownload=page.waitForEvent('download');await page.locator('#export').click();const small=await smallDownload,smallBody=JSON.parse(fs.readFileSync(await small.path()));assert.equal(smallBody.schemaVersion,'apollo.audit-summary.v1');assert.equal(smallBody.components[0].snapshot.nodes,undefined);
  await page.locator('#export-full').click();assert.equal(await page.locator('#export-full').isDisabled(),true);const req=await page.evaluate(()=>window.bridgeMessages.filter(m=>['audit','audit-report-request'].includes(m.type)).at(-1));assert.equal(req.operation,'full');
  const fullDownload=page.waitForEvent('download');await page.evaluate(({req,full})=>window.emit(Object.assign({},req,{type:'audit-report-result',data:full})),{req,full});const downloaded=await fullDownload;assert.deepEqual(JSON.parse(fs.readFileSync(await downloaded.path())),full);assert.equal(await page.locator('#export-full').isDisabled(),false);
  await page.locator('#codex-explanation').evaluate(el=>el.hidden=false);await page.locator('#explain').click();const selected=await page.evaluate(()=>window.bridgeMessages.filter(m=>['audit','audit-report-request'].includes(m.type)).at(-1));assert.equal(selected.operation,'component');assert.equal(selected.componentAuditId,component.auditId);assert.equal((await page.evaluate(()=>window.httpRequests)).length,0);
  await page.evaluate(({selected,component})=>window.emit(Object.assign({},selected,{type:'audit-report-result',data:{auditId:component.auditId,release:component.release,snapshot:component.snapshot}})),{selected,component});await page.waitForFunction(()=>window.httpRequests.length===1);assert.deepEqual((await page.evaluate(()=>window.httpRequests[0])).body.snapshot,snapshot);
  await page.waitForFunction(()=>document.getElementById('explanation').textContent==='Selected component explained');
  await page.locator('#export-full').focus();assert.equal(await page.locator('#export-full').evaluate(el=>document.activeElement===el),true);
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,items:[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,id:el.id,cls:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width})).filter(x=>x.right>innerWidth+1&&x.width>0).slice(0,15)}));assert(overflow.scroll<=overflow.width,'No horizontal overflow');
  if(process.env.DESIGN_CHECK_QA_ROOT){const out=path.join(process.env.DESIGN_CHECK_QA_ROOT,`audit-report-${width}.png`);fs.mkdirSync(path.dirname(out),{recursive:true});await page.screenshot({path:out,fullPage:true});}
  await page.locator('#export-full').click();const stale=await page.evaluate(()=>window.bridgeMessages.filter(m=>['audit','audit-report-request'].includes(m.type)).at(-1));await page.evaluate(auditId=>window.emit({type:'audit-invalidated',auditId}),full.auditId);
  await page.evaluate(stale=>window.emit(Object.assign({},stale,{type:'audit-report-result',data:{auditId:stale.auditId}})),stale);await page.waitForFunction(()=>!document.getElementById('export-full').disabled);
  // A new failed area must never inherit the previous area's cards, counts or caption.
  await page.evaluate(()=>window.emit({type:'selection',valid:true,id:'next-area',name:'CorporateContent'}));
  await page.getByRole('button',{name:'Проверить',exact:true}).click();
  const next=await page.evaluate(()=>window.bridgeMessages.filter(m=>m.type==='audit').at(-1));
  assert.equal(await page.locator('.apollo-finding-card:visible').count(),0);
  await page.evaluate(next=>window.emit({type:'error',requestId:next.requestId,message:'Свойства узла scope изменились. (AUDIT_CAPTURE_CHANGED · verify-capture)'}),next);
  await page.getByRole('alert').filter({hasText:'AUDIT_CAPTURE_CHANGED'}).waitFor();
  assert.equal(await page.locator('.apollo-finding-card:visible').count(),0);
  assert.equal(await page.getByRole('navigation',{name:'Категории проверки'}).getByRole('button',{name:'Кастомы',exact:true}).count(),1);
  // A delayed response from the old request cannot revive it.
  await page.evaluate(({data,request})=>window.emit(Object.assign({type:'audit-result',requestId:request.requestId},data)),{data,request});
  assert.equal(await page.locator('.apollo-finding-card:visible').count(),0);
  await page.getByRole('button',{name:'Проверка',exact:true}).click();
  assert.notEqual(await page.locator('.apollo-overview-caption').innerText(),'Synthetic');
  const alert=await page.getByRole('alert').filter({hasText:'AUDIT_CAPTURE_CHANGED'}).boundingBox(),context=await page.locator('.apollo-contextbar.is-overview').boundingBox();
  assert.ok(alert.y>=context.y+context.height,'Audit error is visible below the scope bar');
  if(process.env.DESIGN_CHECK_QA_ROOT)await page.screenshot({path:path.join(process.env.DESIGN_CHECK_QA_ROOT,`failed-area-${width}.png`),fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('Compact report browser QA PASS: 800/1024, exports, selected explain, stale replies, keyboard and layout.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
