// Actual unchanged build settings; real bundled UI/main, synthetic native API only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');const {fixture}=require("./document-audit.test");
async function run(){
 const out=process.env.DOCUMENT_AUDIT_QA_ROOT;if(!out)throw Error('Set DOCUMENT_AUDIT_QA_ROOT');fs.mkdirSync(path.join(out,'screenshots'),{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});let checks=0;const errors=[],network=[],receipts=[];
 try{
  for(const width of [800,440,360]){
   const page=await browser.newPage({viewport:{width,height:860}}),f=fixture(),local=f.component('Локальная кнопка',false,''),remote=f.component('old',true,'key');f.component('latest-key',true,'key');f.instance('Зависимость',remote,local);const frame=f.node('Макет');f.instance('Локальный экземпляр',local,frame);f.instance('Библиотечный экземпляр',remote,frame);f.instance('Актуальный экземпляр',f.nodes.get('latest-key'),frame);f.theme('base');f.theme(null,'scene-theme');f.collections.get('scene-theme').key=f.collections.get('theme').key;f.collections.get('scene-theme').modes.push({name:'Extra',modeId:'extra'});f.page.selection=[frame];
   let releaseImport;const importFn=f.api.importComponentByKeyAsync;f.api.importComponentByKeyAsync=key=>new Promise(resolve=>{releaseImport=()=>resolve(importFn(key));});
   const source=fs.readFileSync(path.join(__dirname,"../dist/code.js"),'utf8'),hostMessages=[];let pending=[];
   f.api.ui.postMessage=m=>{f.messages.push(JSON.parse(JSON.stringify(m)));pending.push(m);void page.evaluate(m=>window.emitPlugin(m),m).catch(()=>{});};
   vm.runInNewContext(source,{figma:f.api,__html__:'',TextEncoder,setTimeout,clearTimeout});
   let holdDiagnostic=false,heldDiagnostic=null,holdContract=true,heldContract=null;
   await page.exposeFunction('nativeHost',m=>{hostMessages.push(m);if(holdContract&&m.type==='contracts-resolved'){heldContract=m;return;}if(holdDiagnostic&&m.type==='native-diagnostic-request'){heldDiagnostic=m;return;}return f.api.ui.onmessage(m);});
   await page.addInitScript(()=>{parent.postMessage=v=>{void window.nativeHost(v.pluginMessage);};window.emitPlugin=m=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:m}}));});
   page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});
   await page.goto(pathToFileURL(path.resolve(__dirname,"../dist/ui.html")).href);await page.getByRole('button',{name:'Проверить',exact:true}).click();
   await page.getByRole('status').filter({hasText:'Проверяем выбранную область'}).waitFor();checks++;
   assert.ok(hostMessages.some(m=>m.type==='document-audit-request'&&m.context.platform==='Desktop'&&m.context.pageId==='page'));checks++;
   for(let i=0;i<100&&!releaseImport;i++)await new Promise(r=>setTimeout(r,1));assert.ok(releaseImport);releaseImport();
   await page.getByRole('button',{name:/Локальные компоненты: .*найдено/}).waitFor();checks++;
   assert.ok(f.messages.some(m=>m.type==='document-audit-result'));checks++;
   assert.equal(await page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:/^Актуальные компоненты/}).getAttribute('aria-pressed'),'true');checks++;
   await page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:/^Локальные компоненты/}).click();
   await page.getByRole('heading',{name:'Локальная кнопка',exact:true}).waitFor();checks++;
   for(let i=0;i<100&&!heldContract;i++)await new Promise(r=>setTimeout(r,1));assert.ok(heldContract);holdContract=false;await f.api.ui.onmessage(heldContract);
   assert.equal(await page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:/^Локальные компоненты/}).getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.document-audit-finding').count(),1);checks+=2;
   await f.mutate();assert.equal(f.messages.some(m=>m.type==='document-audit-invalidated'),false);assert.equal(await page.locator('.document-audit-finding').count(),1);checks+=2;
   assert.equal(await page.locator('.document-audit-finding').count(),1);checks++;assert.equal(await page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:/^Локальные компоненты/}).getAttribute('aria-pressed'),'true');checks++;
   assert.equal(await page.locator('.document-audit-finding').innerText().then(t=>t.includes('экземпляров в области: 1')),true);checks++;
   await page.getByRole('button',{name:'Найти в макете',exact:true}).focus();await page.keyboard.press('Enter');
   for(let i=0;i<100&&!f.writes.length;i++)await new Promise(r=>setTimeout(r,1));assert.equal(f.writes.length,1);checks++;
   assert.ok(f.messages.some(m=>m.type==='document-audit-focus-result'&&m.success===true));checks++;
   f.emit('selectionchange');
   await page.mouse.move(0,0);await page.screenshot({path:path.join(out,'screenshots','native-local-'+width+'.png')});
   await page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:/^Темизация/}).click();await page.getByText('На текущей странице не выбран явный режим Corp.',{exact:true}).waitFor();checks++;
   const resultViewport=await page.locator('.results-pane').evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+Math.min(24,r.height/2));return{inside:r.top>=0&&r.bottom<=innerHeight,height:r.height,accessible:hit===n||n.contains(hit)};});assert.equal(resultViewport.inside,true);assert.equal(resultViewport.accessible,true);assert.ok(resultViewport.height>=260);checks+=3;
   await page.getByText('На текущей странице не выбран явный режим Corp.',{exact:true}).scrollIntoViewIfNeeded();
   await page.mouse.move(0,0);await page.screenshot({path:path.join(out,'screenshots','native-theme-'+width+'.png')});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks++;
   await page.getByRole('navigation',{name:'Разделы Apollo'}).getByRole('button',{name:'Генерация',exact:true}).click();assert.equal(await page.locator('#generation-panel').isVisible(),true);checks++;
   await page.getByRole('button',{name:'Открыть чат с Apollo'}).click();assert.equal(await page.getByRole('region',{name:'Чат с Apollo',exact:true}).isVisible(),true);checks++;
   await page.getByRole('button',{name:'Проверка',exact:true}).click();await page.getByText('На текущей странице не выбран явный режим Corp.',{exact:true}).waitFor();checks++;
   // A true page-mode change marks the snapshot stale and keeps every native category visible.
   f.page.explicitVariableModes.theme='corp';await f.mutate();await page.getByRole('status').filter({hasText:'Результат проверки документа устарел'}).waitFor();assert.equal(await page.locator('.document-audit-finding').count(),1);assert.equal(await page.getByRole('button',{name:'Найти в макете',exact:true}).isDisabled(),true);checks+=3;
   const category=async name=>page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name}).click();
   await category(/^Локальные компоненты/);await page.getByRole('heading',{name:'Локальная кнопка',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Найти в макете',exact:true}).isDisabled(),true);checks++;
   await category(/^Актуальные компоненты/);await page.getByRole('heading',{name:'Актуальный экземпляр',exact:true}).waitFor();checks++;
   await category(/^Пора обновить/);assert.equal(await page.locator('.document-audit-finding').count(),2);checks++;
   await category(/^Темизация/);await page.getByText('На текущей странице не выбран явный режим Corp.',{exact:true}).waitFor();checks++;
   await page.getByText('На текущей странице не выбран явный режим Corp.',{exact:true}).scrollIntoViewIfNeeded();await page.mouse.move(0,0);
   await page.screenshot({path:path.join(out,'screenshots','native-stale-'+width+'.png')});
   // Wrong page theme is reported for an individual nested sublayer with no eligible contract.
   f.page.explicitVariableModes.theme='base';const nested=f.node('Вложенный текст','TEXT',frame);nested.resolvedVariableModes={'scene-theme':'base'};f.page.selection=[nested];f.emit('selectionchange');
   await page.getByRole('button',{name:'Проверить',exact:true}).click();await page.getByRole('button',{name:'Темизация страницы: не выбран Corp',exact:true}).waitFor();
   assert.equal(await page.getByRole('complementary',{name:'Категории проверки'}).getByRole('button',{name:/^Темизация/}).getAttribute('aria-pressed'),'true');await page.getByText('На текущей странице не выбран явный режим Corp.',{exact:true}).waitFor();checks+=2;
   const nestedTheme=f.messages.filter(m=>m.type==='document-audit-result').at(-1);assert.equal(nestedTheme.result.context.selectionSignature,nested.id);assert.equal(nestedTheme.result.checks[2].findings[0].evidence.actualModeId,'base');assert.equal(nestedTheme.result.checks[2].findings[0].evidence.aliasCount,2);checks+=3;
   // Missing main and unavailable theme remain visible unknown, even with offline contract transport.
   f.api.importComponentByKeyAsync=importFn;f.collections.clear();f.page.children=f.page.children.filter(n=>n.id!=='anchor-scene-theme');delete nested.resolvedVariableModes['scene-theme'];const missing=f.instance('Неизвестный экземпляр',null);f.page.selection=[missing];f.emit('selectionchange');await page.getByRole('button',{name:'Проверить',exact:true}).click();
   await page.getByRole('button',{name:/Локальные компоненты: есть непроверенные данные/}).waitFor();await page.getByRole('button',{name:/Локальные компоненты: есть непроверенные данные/}).click();
   await page.getByText('Не удалось определить, локальный это компонент или библиотечный.',{exact:true}).waitFor();checks++;
   assert.ok(await page.getByText('Проверка неполная.',{exact:false}).count());checks++;
   await page.screenshot({path:path.join(out,'screenshots','native-unknown-'+width+'.png')});
   // A current page without selection still runs only page theme; local/freshness are incomplete.
   f.page.selection=[];f.theme('corp');f.emit('selectionchange');await category(/^Темизация/);await page.getByRole('button',{name:'Проверить',exact:true}).click();
   await page.getByText('На текущей странице явно выбран режим Corp.',{exact:true}).waitFor();checks++;
   const latest=f.messages.filter(m=>m.type==='document-audit-result').at(-1);assert.equal(latest.result.checks[0].status,'incomplete');assert.equal(latest.result.context.selectionSignature,'');checks+=2;
   // Main validates platform; native mobile shows not-applicable, never a web PASS.
   await page.getByRole('button',{name:'Открыть настройки Apollo'}).click();await page.getByRole('button',{name:'Desktop',exact:true}).click();await page.getByRole('button',{name:'iOS',exact:true}).click();await page.keyboard.press('Escape');
   await page.getByRole('button',{name:'Проверить',exact:true}).click();await page.getByRole('button',{name:'Темизация страницы: не применяется',exact:true}).waitFor();checks++;
   assert.equal(f.messages.filter(m=>m.type==='document-audit-result').at(-1).result.checks[2].status,'not-applicable');checks++;
   // Exercise the real nativeDiagnosticUi.busy() legacy gate in the unchanged built UI.
   // An ordinary FRAME has no componentKey and still permits the independent document request.
   const plainFrame=f.node('Обычный FRAME');assert.equal(plainFrame.type,'FRAME');assert.equal(plainFrame.key,undefined);checks+=2;
   f.page.selection=[plainFrame];f.emit('selectionchange');
   await page.getByRole('navigation',{name:'Разделы Apollo'}).getByRole('button',{name:'Генерация',exact:true}).click();
   holdDiagnostic=true;await page.locator('#native-diagnostic').click();
   await page.getByText('Читаем выделение…',{exact:true}).waitFor();assert.ok(heldDiagnostic);checks++;
   assert.equal(await page.locator('#audit').isDisabled(),true);assert.equal(await page.locator('#native-diagnostic').isDisabled(),true);assert.equal(await page.locator('#generation-prepare').isDisabled(),true);assert.equal(await page.locator('#generation-spec-file').isDisabled(),true);checks+=4;
   const legacyRequestsBefore=hostMessages.filter(m=>m.type==='audit').length;
   await page.getByRole('navigation',{name:'Разделы Apollo'}).getByRole('button',{name:'Проверка',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Проверить',exact:true}).isEnabled(),true);checks++;
   await page.getByRole('button',{name:'Проверить',exact:true}).click();await page.getByRole('button',{name:'Локальные компоненты: 0 найдено',exact:true}).waitFor();
   const independent=f.messages.filter(m=>m.type==='document-audit-result').at(-1);assert.equal(independent.result.context.selectionSignature,plainFrame.id);assert.equal(independent.result.checks[0].status,'complete');assert.equal(independent.result.checks[0].findings.length,0);checks+=3;
   const legacyRequestsAfter=hostMessages.filter(m=>m.type==='audit').length;assert.equal(legacyRequestsAfter,legacyRequestsBefore);assert.equal(await page.locator('#audit').isDisabled(),true);assert.equal(await page.locator('#native-diagnostic').isDisabled(),true);assert.equal(await page.locator('#generation-spec-file').isDisabled(),true);checks+=4;
   holdDiagnostic=false;await f.api.ui.onmessage(heldDiagnostic);await page.waitForFunction(()=>!document.getElementById('audit').disabled);assert.equal(await page.locator('#native-diagnostic-status').textContent(),'Чтение завершено. Неподтверждённые связи указаны в JSON.');assert.ok(f.messages.some(m=>m.type==='native-diagnostic-result'&&m.requestId===heldDiagnostic.requestId));checks++;
   // An actual recheck failure leaves the last snapshot visible with disabled actions.
   f.page.selection=[frame];f.emit('selectionchange');f.api.getNodeByIdAsync=async()=>{throw Error('native read denied');};
   await page.getByRole('button',{name:'Проверить',exact:true}).click();await page.getByRole('status').filter({hasText:'Не удалось прочитать данные макета'}).waitFor();
   assert.equal(await page.locator('.document-audit-finding').count(),0);assert.ok(f.messages.some(m=>m.type==='document-audit-error'));checks+=3;
   receipts.push({width,results:f.messages.filter(m=>m.type==='document-audit-result').map(m=>({runId:m.result.runId,checks:m.result.checks.map(c=>({id:c.id,status:c.status,checked:c.checked,gaps:c.gaps})),context:m.result.context})),neighborGate:{actualBusy:'nativeDiagnosticUi.busy()',ordinaryFrameWithoutKey:true,nativeResultWhileBusy:independent.result.runId,legacyRequestsBefore,legacyRequestsAfter,legacyControlsStayedDisabled:true},lifecycle:{strictPageGetters:true,lateContractKeepsCategory:true,unchangedNodechangeKeptAvailable:true,staleSnapshotInAllNativeCategories:true,staleActionsDisabled:true,nestedThemeAliasResult:nestedTheme.result.runId,resultViewport},focusWrites:f.writes,hostRequestTypes:Array.from(new Set(hostMessages.map(m=>m.type)))});
   f.emit('close');await page.close();
  }
  assert.deepEqual(errors,[]);checks++;
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({checks,widths:[800,440,360],errors,network,actualBuiltUi:true,actualBuiltMain:true,syntheticNativeOnly:true,liveFigma:false,realAgent:false,receipts},null,2)+'\n');console.log(JSON.stringify({checks,errors,widths:[800,440,360],actualBuiltMain:true,liveFigma:false}));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e.stack);process.exitCode=1;});
