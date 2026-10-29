// Built Apollo UI + actual ReGlyph native bridge; synthetic Figma instances, no remote service.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {createReglyphBridge}=require('../src/skills/reglyph/native');
const {createTokenJournalBridge,PREFIX}=require('../src/token-journal-native');
function fixture(post){
 const swaps=[],storage=new Map(),nodes=new Map();let quota=false;
 const statsStorage={keysAsync:async()=>Array.from(storage.keys()),getAsync:async key=>storage.get(key),setAsync:async(key,value)=>{if(quota&&key.startsWith(PREFIX))throw Error('quota');storage.set(key,value);},deleteAsync:async key=>{storage.delete(key);}};
 const page={id:'page',type:'PAGE',selection:[],findAllWithCriteria:()=>[]};
 // Owned fixture PNG, no library assets or user data.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAALUlEQVR42mNgGAWjYBSMgqkA4v///w8jYBSMglEwCkbBKBgFo2AUjIJRMApGwShAAABp0wX9vRJ7xQAAAABJRU5ErkJggg==','base64');
 const target=key=>({key,name:key,width:24,height:24,children:[],exportAsync:async()=>png});
 for(let n=1;n<=3;n++){
  let key='old'+n;
  const icon={id:'icon'+n,name:'Старая иконка '+n,type:'INSTANCE',width:24,height:24,children:[],parent:null,getMainComponentAsync:async()=>target(key),exportAsync:async()=>png,swapComponent(component){key=component.key;swaps.push([this.id,key]);},resize(w,h){this.width=w;this.height=h;}};nodes.set(icon.id,icon);
 }
 const originalIcons=Array.from(nodes.values());
 const frame={id:'frame',type:'FRAME',name:'Экран',parent:page,findAllWithCriteria:()=>originalIcons};for(const node of nodes.values())node.parent=frame;page.selection=[frame];
 const otherFrame={id:'other-frame',name:'Другой фрейм',type:'FRAME',parent:page,findAllWithCriteria:()=>[otherIcon]};
 const otherIcon={id:'other-icon',type:'INSTANCE',name:'Другая иконка',parent:otherFrame,width:24,height:24,children:[],getMainComponentAsync:async()=>target('old1'),exportAsync:async()=>png,swapComponent(component){swaps.push([this.id,component.key]);},resize(){}};nodes.set(otherIcon.id,otherIcon);
 const api={currentPage:page,clientStorage:{getAsync:async k=>storage.get(k),setAsync:async(k,v)=>storage.set(k,v)},importComponentByKeyAsync:async key=>target(key),getNodeByIdAsync:async id=>nodes.get(id),base64Encode:bytes=>Buffer.from(bytes).toString('base64'),commitUndo(){},viewport:{scrollAndZoomIntoView(){}}};
 const catalog={version:1,scenarioId:'default',oldIcons:[1,2,3].map(n=>({key:'old'+n,name:'Старая иконка '+n})),newIcons:[{key:'new1',name:'Alfa',baseName:'Альфа',searchDescription:'Альфа баллы',familyId:'a',library:'Glyph 26',width:24,height:24,properties:{Style:'Line',Color:'False'}},{key:'new2',name:'Calendar',baseName:'Календарь',searchDescription:'Дата поездки',familyId:'b',library:'Glyph 26',width:24,height:24,properties:{Style:'Line',Color:'False'}}],mappings:[{oldKey:'old1',newKey:'new1'},{oldKey:'old2',newKey:'new2'}]};
 const bridge=createReglyphBridge({api,post,catalogs:{default:catalog,services:Object.assign({},catalog,{scenarioId:'services'})},detection:{containers:[],iconViewSets:[]}});
 const statistics=createTokenJournalBridge({storage:statsStorage,post});
 return{bridge:{accept:message=>statistics.accept(message)||bridge.accept(message)},swaps,statsPending:()=>Array.from(storage.keys()).filter(key=>key.startsWith(PREFIX)),quota:value=>{quota=value;},poison:value=>{if(value)storage.set(PREFIX+'poison',{private:'NEVER_EXPORT_THIS_VALUE'});else storage.delete(PREFIX+'poison');},selection(other){page.selection=other?[otherFrame]:[frame];bridge.selectionChanged();}};
}
(async()=>{
 const output=process.env.DESIGN_CHECK_QA_ROOT;if(!output)throw Error('Set DESIGN_CHECK_QA_ROOT to a private output directory.');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
 let deliveryMode='online',journal=null,postLocal=null;
 if(process.env.APOLLO_STATISTICS_BROWSER_CASES){
  if(!process.env.APOLLO_PROXY_SOURCE_ROOT)throw Error('Set APOLLO_PROXY_SOURCE_ROOT to the accepted Proxy source.');
  const api=require(path.join(process.env.APOLLO_PROXY_SOURCE_ROOT,'src/token-journal'));journal=api.createTokenJournal(path.join(output,'proxy-journal'));api.mountJournalRoutes({get(){},post:(name,fn)=>{postLocal=fn;}},journal);
 }
 const page=await browser.newPage({viewport:{width:800,height:860}}),errors=[],sent=[];page.on('pageerror',error=>errors.push(error.message));
 let delivery=Promise.resolve();const f=fixture(message=>{delivery=delivery.then(()=>page.evaluate(message=>window.emitPlugin(message),message));});
 await page.exposeFunction('changeFixtureSelection',other=>f.selection(other));
 await page.exposeFunction('previewRequestCount',()=>sent.filter(message=>message.operation==='icon-preview').length);
 await page.exposeFunction('nativeRequest',message=>{
  sent.push(message);if(f.bridge.accept(message))return null;
  if(message.type==='design-check-ui-request')return{type:'design-check-ui-result',schemaVersion:message.schemaVersion,requestId:message.requestId,operation:message.operation,result:null};return null;
 });
 await page.addInitScript(()=>{window.emitPlugin=data=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:data}}));parent.postMessage=value=>{void window.nativeRequest(value.pluginMessage).then(reply=>{if(reply)window.emitPlugin(reply);});};});
 await page.route(/^https?:/,async route=>{
  if(!route.request().url().endsWith('/usage/local'))return route.abort();
  if(deliveryMode==='offline')return route.abort();
  const body=route.request().postDataJSON();let code=200,value={success:true,id:body.id,status:body.status};
  if(postLocal)postLocal({body},{status:status=>{code=status;return{json:reply=>{value=reply;}};},json:reply=>{value=reply;}});
  if(deliveryMode==='wrong-receipt')value={success:true,id:'wrong',status:body.status};
  return route.fulfill({status:code,contentType:'application/json',body:JSON.stringify(value)});
 });
 await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/ui.html')).href);await page.evaluate(()=>document.fonts.ready);
 await page.getByRole('button',{name:'Навыки',exact:true}).click();
 const card=page.getByRole('button',{name:'Обновить иконки',exact:true});await card.waitFor();
 assert.equal(await page.locator('.apollo-skills-catalog>.apollo-skill-card').count(),2,'both skills share the existing catalogue');
 await page.screenshot({animations:'disabled',path:path.join(output,'skills-catalog.png')});
 await card.click();await page.getByRole('heading',{name:'Выбери iOS или Android',exact:true}).waitFor();assert.equal(sent.filter(m=>m.type==='reglyph-request').length,0);
 await page.getByRole('button',{name:'Закрыть: Обновить иконки',exact:true}).click();
 // Use the actual controller through the existing platform picker UI.
 await page.getByRole('button',{name:'Desktop',exact:true}).click();await page.getByRole('button',{name:'iOS',exact:true}).click();
 await page.evaluate(()=>window.emitPlugin({type:'selection',pageId:'page',valid:true,id:'frame',name:'Экран'}));
 await card.click();const check=page.getByRole('button',{name:'Проверить иконки',exact:true});
 const trigger=page.locator('.apollo-reglyph-scenario>button'),menu=page.getByRole('group',{name:'Сценарий замены',exact:true});
 async function chooseScenario(label){await trigger.click();await menu.getByRole('button',{name:label,exact:true}).click();}
 async function inspectPicker(width){
  await page.waitForFunction(()=>!document.querySelector('.apollo-reglyph-scenario>button')?.disabled);
  const metrics=await trigger.evaluate(element=>{const other=element.closest('footer').querySelector('.apollo-skills-actions>button'),icon=element.querySelector('svg'),a=element.getBoundingClientRect(),b=icon.getBoundingClientRect();return{font:getComputedStyle(element).fontSize,labelFont:getComputedStyle(element.querySelector('.design-check-picker-label')).fontSize,otherFont:getComputedStyle(other).fontSize,height:a.height,otherHeight:other.getBoundingClientRect().height,iconWidth:b.width,iconHeight:b.height,iconCenter:b.y+b.height/2-a.y-a.height/2,iconInset:a.right-b.right};});
  assert.equal(metrics.font,metrics.otherFont);assert.equal(metrics.labelFont,metrics.otherFont);assert.equal(metrics.height,metrics.otherHeight);assert.equal(metrics.iconWidth,16);assert.equal(metrics.iconHeight,16);assert.ok(Math.abs(metrics.iconCenter)<1);assert.ok(metrics.iconInset>=16);
  assert.equal(await page.locator('dialog select').count(),0,'scenario is a house picker, not a native select');
  await trigger.click();await menu.waitFor();assert.equal(await menu.getByRole('button').count(),2);
  assert.equal(await menu.evaluate(element=>element.closest('dialog')?.open),true,'menu stays interactive inside the native dialog top layer');
  assert.equal(await menu.getByRole('button',{pressed:true}).count(),1);
  const popup=await menu.boundingBox(),button=await trigger.boundingBox();assert.ok(popup.y>=8 && popup.y+popup.height<=button.y);assert.ok(popup.x>=8 && popup.x+popup.width<=width-8);
  await page.screenshot({animations:'disabled',path:path.join(output,`reglyph-picker-${width}.png`)});
  await page.keyboard.press('Escape');assert.equal(await menu.count(),0);assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await trigger.evaluate(element=>element===document.activeElement),true);
 }
 await inspectPicker(800);
 await page.keyboard.press('ArrowDown');await menu.waitFor();await page.keyboard.press('End');assert.equal(await menu.getByRole('button',{name:'Замена в сервисах',exact:true}).evaluate(element=>element===document.activeElement),true);
 await page.keyboard.press('ArrowUp');assert.equal(await menu.getByRole('button',{name:'Базовая замена',exact:true}).evaluate(element=>element===document.activeElement),true);
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await trigger.getByText('Замена в сервисах',{exact:true}).waitFor();
 await chooseScenario('Базовая замена');
 await trigger.click();await menu.waitFor();await page.getByRole('heading',{name:'Выбери область и запусти проверку',exact:true}).click();assert.equal(await menu.count(),0);
 await check.click();
 await page.getByRole('heading',{name:/Готовы к замене/}).waitFor();assert.equal(f.swaps.length,0,'scan is read-only');
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-preview-800.png')});
 assert.equal(await page.locator('.apollo-reglyph-row').count(),3);
 const previousRows=await page.locator('.apollo-reglyph-row').allTextContents();
 await page.evaluate(()=>window.changeFixtureSelection(true));
 await page.getByText('Проверенная область: Экран',{exact:true}).waitFor();
 assert.deepEqual(await page.locator('.apollo-reglyph-row').allTextContents(),previousRows);assert.equal(await page.getByRole('alert').count(),0);assert.equal(await page.getByText('Нужна новая проверка',{exact:true}).count(),0);
 const apply=page.getByRole('button',{name:'Заменить · 2',exact:true});assert.equal(await apply.isDisabled(),false);
 assert.equal(await page.getByRole('button',{name:'Показать в макете',exact:true}).evaluateAll(buttons=>buttons.every(button=>!button.disabled)),true);
 await page.getByRole('button',{name:'Показать в макете',exact:true}).first().click();
 await page.waitForFunction(()=>!document.querySelector('.apollo-reglyph-small')?.disabled);
 await page.evaluate(()=>window.changeFixtureSelection(true));
 const previewsBefore=sent.filter(message=>message.operation==='icon-preview').length;
 await page.locator('.apollo-reglyph-icon-card').first().getByRole('button',{name:/^Превью:/}).click();
 assert.equal(await page.getByRole('dialog').count(),2);await page.waitForFunction(async count=>await window.previewRequestCount()===count,previewsBefore+1);assert.equal(sent.filter(message=>message.operation==='icon-preview').length,previewsBefore+1,'original source preview stays actionable');
 await page.getByRole('dialog').last().getByRole('button',{name:/^Закрыть:/}).click();
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-pinned-scope-800.png')});
 await page.setViewportSize({width:440,height:780});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.locator('dialog[open]').count(),1);
 const historyBounds=await page.locator('dialog[open]').boundingBox();assert.equal(historyBounds.y,8);assert.equal(historyBounds.height,764);
 const historyFooter=await page.locator('.apollo-skill-footer').boundingBox();assert.ok(historyFooter.y+historyFooter.height<=780);
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-pinned-scope-440.png')});
 assert.equal(await page.locator('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth),true);assert.equal(await page.getByRole('alert').count(),0);
 await page.getByRole('button',{name:'Закрыть: Обновить иконки',exact:true}).click();await card.click();assert.deepEqual(await page.locator('.apollo-reglyph-row').allTextContents(),previousRows);
 assert.equal(await apply.isDisabled(),false);assert.equal(await page.getByRole('alert').count(),0);
 await page.setViewportSize({width:800,height:860});
 await page.getByRole('button',{name:'Заменить · 2',exact:true}).click();
 await page.getByRole('heading',{name:'Точно заменяем?',exact:true}).waitFor();assert.equal(f.swaps.length,0);
 await page.getByRole('dialog').last().getByRole('button',{name:'Заменить · 2',exact:true}).click();
 await page.getByRole('heading',{name:/Иконки обновлены/}).waitFor();assert.equal(f.swaps.length,2);
 await page.getByRole('button',{name:'Назад к замене',exact:true}).click();
 const row=page.locator('.apollo-reglyph-row').first();await row.getByRole('button',{name:'Выбрать',exact:true}).click();
 await page.getByRole('searchbox').fill('дата');await page.locator('.apollo-reglyph-option>button').getByText('Календарь',{exact:true}).click();assert.equal(await page.getByRole('dialog').count(),1);
 await page.getByRole('button',{name:'Заменить · 1',exact:true}).click();await page.getByRole('heading',{name:'Иконки обновлены',exact:true}).waitFor();assert.equal(f.swaps.length,3);assert.ok(f.swaps.every(([id])=>id!=='other-icon'),'other selected frame is never changed');assert.equal(sent.filter(m=>m.operation==='scan').length,1,'all replacements use the original scan');
 if(process.env.APOLLO_STATISTICS_BROWSER_CASES){
  const beforeMutations=f.swaps.length,beforeRequests=sent.filter(m=>m.type==='reglyph-request'&&['scan','replace'].includes(m.operation)).length;
  deliveryMode='offline';await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.click();await page.getByText('Проверенная область: Другой фрейм',{exact:true}).waitFor();
  const retry=page.getByRole('button',{name:'Повторить отправку',exact:true});await retry.waitFor();
  assert.equal(await page.locator('.apollo-statistics-notice[role="status"]:visible').count(),1,'one active announcement inside the top modal');
  assert.equal(await retry.evaluate(button=>!!button.closest('dialog[open]')),true);assert.equal(f.swaps.length,beforeMutations);
  await page.screenshot({animations:'disabled',path:path.join(output,'statistics-offline-800.png')});
  await page.setViewportSize({width:440,height:780});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await page.locator('dialog[open]').evaluate(node=>node.scrollWidth<=node.clientWidth),true);await page.screenshot({animations:'disabled',path:path.join(output,'statistics-offline-440.png')});
  await retry.click();assert.equal(sent.filter(m=>m.type==='reglyph-request'&&['scan','replace'].includes(m.operation)).length,beforeRequests+1,'retry is only metadata delivery');
  deliveryMode='online';await page.evaluate(()=>window.dispatchEvent(new Event('online')));await retry.waitFor({state:'hidden'});await page.waitForFunction(()=>!!document.activeElement?.closest('dialog[open]'));
  assert.equal(f.statsPending().length,0);assert.equal(f.swaps.length,beforeMutations);
  deliveryMode='wrong-receipt';await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.click();await retry.waitFor();assert.ok(f.statsPending().length,'mismatched receipt retains outbox');
  const count=journal.read().records.length;deliveryMode='online';await retry.click();await retry.waitFor({state:'hidden'});assert.equal(journal.read().records.length,count,'receipt retry does not duplicate journal rows');
  f.poison(true);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await retry.waitFor();
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать сведения',exact:true}).click();const download=await downloaded;await download.saveAs(path.join(output,'statistics-pending.json'));
  const metadata=fs.readFileSync(path.join(output,'statistics-pending.json'),'utf8');assert.ok(metadata.includes('poison'));assert.ok(!metadata.includes('NEVER_EXPORT_THIS_VALUE'));
  f.poison(false);await retry.click();await retry.waitFor({state:'hidden'});
  f.quota(true);await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.click();await page.getByText('Проверенная область: Другой фрейм',{exact:true}).waitFor();await retry.waitFor();assert.equal(await page.locator('.apollo-reglyph-row').count(),1,'quota cannot replace the skill result');assert.equal(f.swaps.length,beforeMutations);
  await page.screenshot({animations:'disabled',path:path.join(output,'statistics-quota-440.png')});f.quota(false);await retry.click();await retry.waitFor({state:'hidden'});assert.equal(f.statsPending().length,0);
  assert.ok(journal.read().records.every(row=>row.totalTokens===0&&row.calls===0));assert.ok(journal.read().records.some(row=>row.operation.includes('Обновить иконки')));
  await page.setViewportSize({width:800,height:860});
 }
 await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.waitFor();await check.click();await page.getByText('Проверенная область: Другой фрейм',{exact:true}).waitFor();assert.equal(await page.locator('.apollo-reglyph-row').count(),1);await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.waitFor();
 await chooseScenario('Замена в сервисах');
 await page.getByRole('button',{name:'Закрыть: Обновить иконки',exact:true}).click();
 await page.getByRole('button',{name:'iOS',exact:true}).click();await page.getByRole('button',{name:'Android',exact:true}).click();
 await card.click();await page.getByText('АБМ · Android · Без ИИ',{exact:true}).waitFor();
 await page.setViewportSize({width:440,height:780});await inspectPicker(440);
 await trigger.click();await menu.waitFor();await page.keyboard.press('Tab');assert.equal(await menu.count(),0);assert.equal(await check.evaluate(element=>element===document.activeElement),true);
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-ready-440.png')});
 assert.equal(await page.locator('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth),true);
 const box=await page.locator('.apollo-skill-footer').boundingBox();assert.ok(box.y+box.height<=780);
 await page.getByRole('button',{name:'Закрыть: Обновить иконки',exact:true}).click();await card.focus();assert.equal(await card.evaluate(element=>document.activeElement===element),true);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'PASS',swaps:f.swaps,reglyphRequests:sent.filter(m=>m.type==='reglyph-request').map(m=>m.operation),liveFigma:'NOT_RUN',statistics:journal?{records:journal.read().records.map(({operation,status,totalTokens,calls})=>({operation,status,totalTokens,calls})),faults:['offline/retry','wrong-receipt/idempotence','corrupt/export','quota/retry'],pending:f.statsPending().length}:null},null,2));console.log('ReGlyph integrated UI PASS: two cards, native gate, pinned original scope across selection changes, partial confirmation, remaining rows, picker/search, replacement, scenario, Android, custom picker keyboard/outside close/16px type/chevron, 800/440 footer.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
