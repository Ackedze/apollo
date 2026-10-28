// Built Apollo UI + actual ReGlyph native bridge; synthetic Figma instances, no remote service.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {createReglyphBridge}=require('../src/skills/reglyph/native');
function fixture(post){
 const swaps=[],storage=new Map(),nodes=new Map();
 const page={id:'page',type:'PAGE',selection:[],findAllWithCriteria:()=>[]};
 // Owned fixture PNG, no library assets or user data.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAALUlEQVR42mNgGAWjYBSMgqkA4v///w8jYBSMglEwCkbBKBgFo2AUjIJRMApGwShAAABp0wX9vRJ7xQAAAABJRU5ErkJggg==','base64');
 const target=key=>({key,name:key,width:24,height:24,children:[],exportAsync:async()=>png});
 for(let n=1;n<=3;n++){
  let key='old'+n;
  const icon={id:'icon'+n,name:'Старая иконка '+n,type:'INSTANCE',width:24,height:24,children:[],parent:null,getMainComponentAsync:async()=>target(key),exportAsync:async()=>png,swapComponent(component){key=component.key;swaps.push([this.id,key]);},resize(w,h){this.width=w;this.height=h;}};nodes.set(icon.id,icon);
 }
 const frame={id:'frame',type:'FRAME',name:'Экран',parent:page,findAllWithCriteria:()=>Array.from(nodes.values())};for(const node of nodes.values())node.parent=frame;page.selection=[frame];
 const api={currentPage:page,clientStorage:{getAsync:async k=>storage.get(k),setAsync:async(k,v)=>storage.set(k,v)},importComponentByKeyAsync:async key=>target(key),getNodeByIdAsync:async id=>nodes.get(id),base64Encode:bytes=>Buffer.from(bytes).toString('base64'),commitUndo(){},viewport:{scrollAndZoomIntoView(){}}};
 const catalog={version:1,scenarioId:'default',oldIcons:[1,2,3].map(n=>({key:'old'+n,name:'Старая иконка '+n})),newIcons:[{key:'new1',name:'Alfa',baseName:'Альфа',searchDescription:'Альфа баллы',familyId:'a',library:'Glyph 26',width:24,height:24,properties:{Style:'Line',Color:'False'}},{key:'new2',name:'Calendar',baseName:'Календарь',searchDescription:'Дата поездки',familyId:'b',library:'Glyph 26',width:24,height:24,properties:{Style:'Line',Color:'False'}}],mappings:[{oldKey:'old1',newKey:'new1'},{oldKey:'old2',newKey:'new2'}]};
 const bridge=createReglyphBridge({api,post,catalogs:{default:catalog,services:Object.assign({},catalog,{scenarioId:'services'})},detection:{containers:[],iconViewSets:[]}});
 return{bridge,swaps,selection(other){page.selection=other?[{id:'other-frame',name:'Другой фрейм',type:'FRAME',parent:page,findAllWithCriteria:()=>[]}]:[frame];bridge.selectionChanged();}};
}
(async()=>{
 const output=process.env.DESIGN_CHECK_QA_ROOT;if(!output)throw Error('Set DESIGN_CHECK_QA_ROOT to a private output directory.');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
 const page=await browser.newPage({viewport:{width:800,height:860}}),errors=[],sent=[];page.on('pageerror',error=>errors.push(error.message));
 let delivery=Promise.resolve();const f=fixture(message=>{delivery=delivery.then(()=>page.evaluate(message=>window.emitPlugin(message),message));});
 await page.exposeFunction('changeFixtureSelection',other=>f.selection(other));
 await page.exposeFunction('nativeRequest',message=>{
  sent.push(message);if(f.bridge.accept(message))return null;
  if(message.type==='design-check-ui-request')return{type:'design-check-ui-result',schemaVersion:message.schemaVersion,requestId:message.requestId,operation:message.operation,result:null};return null;
 });
 await page.addInitScript(()=>{window.emitPlugin=data=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:data}}));parent.postMessage=value=>{void window.nativeRequest(value.pluginMessage).then(reply=>{if(reply)window.emitPlugin(reply);});};});
 await page.route(/^https?:/,route=>route.abort());
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
 await page.getByText('Результат предыдущей проверки. Для применения замен запусти новую проверку.',{exact:true}).waitFor();
 assert.deepEqual(await page.locator('.apollo-reglyph-row').allTextContents(),previousRows);assert.equal(await page.getByRole('alert').count(),0);assert.equal(await page.getByText('Нужна новая проверка',{exact:true}).count(),0);
 const apply=page.getByRole('button',{name:'Заменить · 2',exact:true});assert.equal(await apply.isDisabled(),true);
 await apply.evaluate(element=>element.click());assert.equal(f.swaps.length,0);
 assert.equal(await page.getByRole('button',{name:'Показать в макете',exact:true}).evaluateAll(buttons=>buttons.every(button=>button.disabled)),true);
 const previewsBefore=sent.filter(message=>message.operation==='icon-preview').length;
 await page.locator('.apollo-reglyph-icon-card').first().getByRole('button',{name:/^Превью:/}).click();
 assert.equal(await page.getByRole('dialog').count(),2);assert.equal(sent.filter(message=>message.operation==='icon-preview').length,previewsBefore,'historical source preview uses its captured bitmap');
 await page.getByRole('dialog').last().getByRole('button',{name:/^Закрыть:/}).click();
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-history-800.png')});
 await page.setViewportSize({width:440,height:780});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.locator('dialog[open]').count(),1);
 const historyBounds=await page.locator('dialog[open]').boundingBox();assert.equal(historyBounds.y,8);assert.equal(historyBounds.height,764);
 const historyFooter=await page.locator('.apollo-skill-footer').boundingBox();assert.ok(historyFooter.y+historyFooter.height<=780);
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-history-440.png')});
 assert.equal(await page.locator('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth),true);assert.equal(await page.getByRole('alert').count(),0);
 await page.getByRole('button',{name:'Закрыть: Обновить иконки',exact:true}).click();await card.click();assert.deepEqual(await page.locator('.apollo-reglyph-row').allTextContents(),previousRows);
 await page.evaluate(()=>window.changeFixtureSelection(false));assert.equal(await apply.isDisabled(),true);assert.equal(await page.getByRole('alert').count(),0);
 await page.setViewportSize({width:800,height:860});
 await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.click();await page.getByRole('heading',{name:/Готовы к замене/}).waitFor();
 await page.getByRole('button',{name:'Заменить · 2',exact:true}).click();
 await page.getByRole('heading',{name:'Точно заменяем?',exact:true}).waitFor();assert.equal(f.swaps.length,0);
 await page.getByRole('dialog').last().getByRole('button',{name:'Заменить · 2',exact:true}).click();
 await page.getByRole('heading',{name:/Иконки обновлены/}).waitFor();assert.equal(f.swaps.length,2);
 await page.getByRole('button',{name:'Назад к замене',exact:true}).click();
 const row=page.locator('.apollo-reglyph-row').first();await row.getByRole('button',{name:'Выбрать',exact:true}).click();
 await page.getByRole('searchbox').fill('дата');await page.locator('.apollo-reglyph-option>button').getByText('Календарь',{exact:true}).click();assert.equal(await page.getByRole('dialog').count(),1);
 await page.getByRole('button',{name:'Заменить · 1',exact:true}).click();await page.getByRole('heading',{name:'Иконки обновлены',exact:true}).waitFor();assert.equal(f.swaps.length,3);
 await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.waitFor();
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
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'PASS',swaps:f.swaps,reglyphRequests:sent.filter(m=>m.type==='reglyph-request').map(m=>m.operation),liveFigma:'NOT_RUN'},null,2));console.log('ReGlyph integrated UI PASS: two cards, native gate, read-only scan, partial confirmation, remaining rows, picker/search, replacement, scenario, Android, custom picker keyboard/outside close/16px type/chevron, 800/440 footer.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
