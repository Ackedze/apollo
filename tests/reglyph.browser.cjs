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
 return{bridge,swaps};
}
(async()=>{
 const output=process.env.DESIGN_CHECK_QA_ROOT;if(!output)throw Error('Set DESIGN_CHECK_QA_ROOT to a private output directory.');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
 const page=await browser.newPage({viewport:{width:800,height:860}}),errors=[],sent=[];page.on('pageerror',error=>errors.push(error.message));
 let delivery=Promise.resolve();const f=fixture(message=>{delivery=delivery.then(()=>page.evaluate(message=>window.emitPlugin(message),message));});
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
 await page.getByRole('button',{name:'Открыть настройки Apollo',exact:true}).click();
 await page.getByRole('button',{name:'Desktop',exact:true}).click();await page.getByRole('button',{name:'iOS',exact:true}).click();
 await page.getByRole('button',{name:'Открыть настройки Apollo',exact:true}).click();
 await page.evaluate(()=>window.emitPlugin({type:'selection',pageId:'page',valid:true,id:'frame',name:'Экран'}));
 await card.click();const check=page.getByRole('button',{name:'Проверить иконки',exact:true});await check.click();
 await page.getByRole('heading',{name:/Готовы к замене/}).waitFor();assert.equal(f.swaps.length,0,'scan is read-only');
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-preview-800.png')});
 assert.equal(await page.locator('.apollo-reglyph-row').count(),3);
 await page.getByRole('button',{name:'Заменить · 2',exact:true}).click();
 await page.getByRole('heading',{name:'Точно заменяем?',exact:true}).waitFor();assert.equal(f.swaps.length,0);
 await page.getByRole('dialog').last().getByRole('button',{name:'Заменить · 2',exact:true}).click();
 await page.getByRole('heading',{name:/Иконки обновлены/}).waitFor();assert.equal(f.swaps.length,2);
 await page.getByRole('button',{name:'Назад к замене',exact:true}).click();
 const row=page.locator('.apollo-reglyph-row').first();await row.getByRole('button',{name:'Выбрать',exact:true}).click();
 await page.getByRole('searchbox').fill('дата');await page.locator('.apollo-reglyph-option>button').getByText('Календарь',{exact:true}).click();assert.equal(await page.getByRole('dialog').count(),1);
 await page.getByRole('button',{name:'Заменить · 1',exact:true}).click();await page.getByRole('heading',{name:'Иконки обновлены',exact:true}).waitFor();assert.equal(f.swaps.length,3);
 await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.waitFor();
 await page.getByRole('combobox',{name:'Сценарий замены'}).selectOption('services');
 await page.getByRole('button',{name:'Закрыть: Обновить иконки',exact:true}).click();
 await page.getByRole('button',{name:'Открыть настройки Apollo',exact:true}).click();
 await page.getByRole('button',{name:'iOS',exact:true}).click();await page.getByRole('button',{name:'Android',exact:true}).click();
 await page.getByRole('button',{name:'Открыть настройки Apollo',exact:true}).click();
 await card.click();await page.getByText('АБМ · Android · Без ИИ',{exact:true}).waitFor();
 await page.setViewportSize({width:440,height:780});await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-ready-440.png')});
 assert.equal(await page.locator('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth),true);
 const box=await page.locator('.apollo-skill-footer').boundingBox();assert.ok(box.y+box.height<=780);
 await page.getByRole('button',{name:'Закрыть: Обновить иконки',exact:true}).click();await card.focus();assert.equal(await card.evaluate(element=>document.activeElement===element),true);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'PASS',swaps:f.swaps,reglyphRequests:sent.filter(m=>m.type==='reglyph-request').map(m=>m.operation),liveFigma:'NOT_RUN'},null,2));console.log('ReGlyph integrated UI PASS: two cards, native gate, read-only scan, partial confirmation, remaining rows, picker/search, replacement, scenario, Android, 800/440 footer.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
