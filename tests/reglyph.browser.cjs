// Built Apollo UI + actual ReGlyph native bridge; synthetic Figma instances, no remote service.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {createReglyphBridge}=require('../src/skills/reglyph/native');
const {createTokenJournalBridge,PREFIX}=require('../src/token-journal-native');
function fixture(post){
 const swaps=[],imports=[],storage=new Map(),nodes=new Map();let quota=false,services=false,undos=0,readWait=null,releaseRead=null,failSwaps=false,pageWait=null,releasePage=null;
 const statsStorage={keysAsync:async()=>Array.from(storage.keys()),getAsync:async key=>storage.get(key),setAsync:async(key,value)=>{if(quota&&key.startsWith(PREFIX))throw Error('quota');storage.set(key,value);},deleteAsync:async key=>{storage.delete(key);}};
 const page={id:'page',type:'PAGE',selection:[],findAllWithCriteria:()=>[]};
 // Owned fixture PNG, no library assets or user data.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAALUlEQVR42mNgGAWjYBSMgqkA4v///w8jYBSMglEwCkbBKBgFo2AUjIJRMApGwShAAABp0wX9vRJ7xQAAAABJRU5ErkJggg==','base64');
 const target=key=>({key,name:key,width:24,height:24,children:[],exportAsync:async()=>png});
 for(let n=1;n<=3;n++){
  let key='old'+n;
  const icon={id:'icon'+n,name:'Старая иконка '+n,type:'INSTANCE',width:24,height:24,children:[],parent:null,getMainComponentAsync:async()=>{if(readWait)await readWait;return target(key);},exportAsync:async()=>png,get fixtureKey(){return key;},set fixtureKey(value){key=value;},swapComponent(component){if(failSwaps)throw Error('Synthetic swap failure');key=component.key;swaps.push([this.id,key]);},resize(w,h){this.width=w;this.height=h;}};nodes.set(icon.id,icon);
 }
 const originalIcons=Array.from(nodes.values());
 const frame={id:'frame',type:'FRAME',name:'Экран',parent:page,findAllWithCriteria:()=>services?[...originalIcons,header]:originalIcons};for(const node of nodes.values())node.parent=frame;page.selection=[frame];
 const otherFrame={id:'other-frame',name:'Другой фрейм',type:'FRAME',parent:page,findAllWithCriteria:()=>[otherIcon]};
 const otherIcon={id:'other-icon',type:'INSTANCE',name:'Другая иконка',parent:otherFrame,width:24,height:24,children:[],getMainComponentAsync:async()=>target('old1'),exportAsync:async()=>png,swapComponent(component){if(failSwaps)throw Error('Synthetic swap failure');swaps.push([this.id,component.key]);},resize(){}};nodes.set(otherIcon.id,otherIcon);
 const serviceText={type:'TEXT',name:'_title',characters:'Сервисы'};
 const header={id:'header',type:'INSTANCE',name:'Заголовок',parent:frame,getMainComponentAsync:async()=>({key:'header',parent:{type:'COMPONENT_SET',key:'header-set'}}),findAllWithCriteria:()=>[serviceText]};serviceText.parent=header;
 const history=[originalIcons.map(icon=>icon.fixtureKey)];
 nodes.set(frame.id,frame);nodes.set(otherFrame.id,otherFrame);nodes.set(page.id,page);
 const awayPage={id:'away-page',type:'PAGE',selection:[],findAllWithCriteria:()=>[]};
 const api={currentPage:page,setCurrentPageAsync:async next=>{api.currentPage=next;bridge.selectionChanged();if(pageWait)await pageWait;},clientStorage:{getAsync:async k=>storage.get(k),setAsync:async(k,v)=>storage.set(k,v)},importComponentByKeyAsync:async key=>{imports.push(key);return target(key);},getNodeByIdAsync:async id=>nodes.get(id),base64Encode:bytes=>Buffer.from(bytes).toString('base64'),commitUndo(){const keys=originalIcons.map(icon=>icon.fixtureKey);if(JSON.stringify(keys)!==JSON.stringify(history.at(-1)))history.push(keys);},triggerUndo(){undos++;if(history.length>1)history.pop();originalIcons.forEach((icon,i)=>{icon.fixtureKey=history.at(-1)[i];});},viewport:{scrollAndZoomIntoView(){}}};
 const catalog={version:1,scenarioId:'default',oldIcons:[1,2,3].map(n=>({key:'old'+n,name:'Старая иконка '+n})),newIcons:[{key:'new1',name:'Alfa',baseName:'Альфа',searchDescription:'Альфа баллы',familyId:'a',library:'Glyph 26',width:24,height:24,properties:{Style:'Line',Color:'False'}},{key:'new2',name:'Calendar',baseName:'Календарь',searchDescription:'Дата поездки',familyId:'b',library:'Glyph 26',width:24,height:24,properties:{Style:'Line',Color:'False'}}],mappings:[{oldKey:'old1',newKey:'new1'},{oldKey:'old2',newKey:'new2'}]};
 for(let i=0;i<120;i++)catalog.newIcons.push({key:'extra'+i,name:'Тест '+i,familyId:'extra'+i,width:24,height:24});
 const bridge=createReglyphBridge({api,post,catalogs:{default:catalog,services:Object.assign({},catalog,{scenarioId:'services'})},detection:{containers:[],iconViewSets:[],serviceHeaderSets:[{key:'header-set'}]}});
 const statistics=createTokenJournalBridge({storage:statsStorage,post});
 return{bridge:{accept:message=>statistics.accept(message)||bridge.accept(message)},swaps,imports,onOriginalPage:()=>api.currentPage===page,away(){api.currentPage=awayPage;bridge.selectionChanged();},holdPage(value){if(value)pageWait=new Promise(resolve=>{releasePage=resolve;});else{const release=releasePage;pageWait=null;releasePage=null;release?.();}},holdRead(value){if(value)readWait=new Promise(resolve=>{releaseRead=resolve;});else{const release=releaseRead;readWait=null;releaseRead=null;release?.();}},failSwaps:value=>{failSwaps=value;},emptySelection(){page.selection=[];bridge.selectionChanged();},notifySelection:()=>bridge.selectionChanged(),undoCount:()=>undos,services:value=>{services=value;},statsPending:()=>Array.from(storage.keys()).filter(key=>key.startsWith(PREFIX)),quota:value=>{quota=value;},poison:value=>{if(value)storage.set(PREFIX+'poison',{private:'NEVER_EXPORT_THIS_VALUE'});else storage.delete(PREFIX+'poison');},selection(other){page.selection=other?[otherFrame]:[frame];bridge.selectionChanged();}};
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
 const page=await browser.newPage({viewport:{width:800,height:860}}),errors=[],sent=[];
 const waitDialogs=()=>page.waitForFunction(()=>!document.querySelector('.apollo-reglyph-dialog[data-closing="true"]'));page.on('pageerror',error=>errors.push(error.message));
 const waitMotions=()=>page.waitForFunction(()=>document.getAnimations().filter(animation=>Number.isFinite(animation.effect.getTiming().iterations)).every(animation=>animation.playState==='finished'||animation.playState==='idle'));
 // ReGlyph headers reserve the right edge for a 48 px close button, even with wrapped titles.
 const assertCloseGeometry=async dialog=>{
  await waitMotions();
  const geometry=await dialog.evaluate(element=>{
   const header=element.querySelector('header'),button=header.querySelector('.apollo-skill-close'),title=header.querySelector('h2'),icon=button.querySelector('img');
   const h=header.getBoundingClientRect(),b=button.getBoundingClientRect(),t=title.getBoundingClientRect(),i=icon.getBoundingClientRect(),style=getComputedStyle(header);
   return{button:[b.width,b.height],icon:[i.width,i.height],right:h.right-parseFloat(style.paddingRight)-b.right,centerX:i.x+i.width/2-b.x-b.width/2,centerY:i.y+i.height/2-b.y-b.height/2,titleGap:b.left-t.right,expectedGap:parseFloat(style.columnGap),headerCenter:b.y+b.height/2-(h.y+parseFloat(style.paddingTop)+(h.height-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom))/2)};
  });
  assert.deepEqual(geometry.button,[48,48]);assert.deepEqual(geometry.icon,[24,24]);
  for(const value of [geometry.right,geometry.centerX,geometry.centerY,geometry.headerCenter])assert.ok(Math.abs(value)<1,JSON.stringify(geometry));
  assert.ok(geometry.titleGap>=geometry.expectedGap-1,JSON.stringify(geometry));
 };
 const assertWorkspaceHeader=async inset=>{
  const dialog=page.locator('.apollo-reglyph-workspace');await assertCloseGeometry(dialog);
  const offsets=await dialog.evaluate(element=>{
   const d=element.getBoundingClientRect(),header=element.querySelector('header'),h=header.getBoundingClientRect(),button=header.querySelector('button').getBoundingClientRect(),title=header.querySelector('h2').getBoundingClientRect();
   return[title.left-d.left,button.top-d.top,d.right-button.right,h.bottom-button.bottom];
  });
  offsets.forEach((value,index)=>assert.ok(Math.abs(value-(index===3?24:inset))<1,JSON.stringify(offsets)));
 };
 const waitVisibleOptions=()=>page.waitForFunction(()=>{
  const list=document.querySelector('.apollo-reglyph-options');if(!list)return false;const bounds=list.getBoundingClientRect();
  const tiles=Array.from(list.querySelectorAll('.apollo-reglyph-option>div:first-child')).filter(tile=>{const rect=tile.getBoundingClientRect();return rect.bottom>=bounds.top-100 && rect.top<=bounds.bottom+100;});
  return tiles.length>0 && tiles.every(tile=>{const image=tile.querySelector('img');return image?.complete && image.naturalWidth>0;});
 });
 const assertMascot=async(quality,checking=false)=>{
  const colors={unchecked:'rgb(242, 243, 245)',clean:'rgb(188, 232, 203)',warning:'rgb(255, 224, 154)',violation:'rgb(255, 174, 166)'};
  await page.waitForFunction(({quality,color,checking})=>{const mascot=document.querySelector('.apollo-reglyph-assistant .apollo-mascot'),body=mascot?.querySelector('.apollo-mascot-body');return mascot?.classList.contains('quality-'+quality)&&mascot.classList.contains('is-checking')===checking&&getComputedStyle(body).backgroundColor===color;},{quality,color:colors[quality],checking});
  assert.equal(await page.locator('.apollo-reglyph-assistant .apollo-mascot').count(),1,'the skill mounts one shared Apollo mascot');
 };

 let delivery=Promise.resolve();const f=fixture(message=>{delivery=delivery.then(()=>page.evaluate(message=>window.emitPlugin(message),message)).catch(error=>{if(!page.isClosed())throw error;});});
 await page.exposeFunction('changeFixtureSelection',other=>f.selection(other));
 await page.exposeFunction('notifyFixtureSelection',()=>f.notifySelection());
 await page.exposeFunction('onOriginalFixturePage',()=>f.onOriginalPage());
 await page.exposeFunction('undoCount',()=>f.undoCount());
 await page.exposeFunction('previewRequestCount',()=>sent.filter(message=>message.operation==='icon-preview').length);
 await page.exposeFunction('catalogPreviewRequestCount',()=>sent.filter(message=>message.operation==='preview').length);
 await page.exposeFunction('statisticsPendingCount',()=>f.statsPending().length);
 await page.exposeFunction('statisticsJournalCount',()=>journal?.read().records.length||0);
 await page.exposeFunction('nativeRequest',message=>{
  sent.push(message);if(f.bridge.accept(message))return null;
  if(message.type==='design-check-ui-request')return{type:'design-check-ui-result',schemaVersion:message.schemaVersion,requestId:message.requestId,operation:message.operation,result:null};return null;
 });
 await page.addInitScript(()=>{window.reglyphMotions=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.matches('.apollo-reglyph-dialog,.apollo-reglyph-bubble') || this.querySelector('.apollo-reglyph-group'))window.reglyphMotions.push({className:this.className,frames,options});return animate.call(this,frames,options);};window.emitPlugin=data=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:data}}));parent.postMessage=value=>{void window.nativeRequest(value.pluginMessage).then(reply=>{if(reply)window.emitPlugin(reply);});};});
 await page.route(/^https?:/,async route=>{
  if(!route.request().url().endsWith('/usage/local'))return route.abort();
  if(deliveryMode==='offline')return route.abort();
  const body=route.request().postDataJSON();let code=200,value={success:true,id:body.id,status:body.status};
  if(postLocal)postLocal({body},{status:status=>{code=status;return{json:reply=>{value=reply;}};},json:reply=>{value=reply;}});
  if(deliveryMode==='wrong-receipt')value={success:true,id:'wrong',status:body.status};
  return route.fulfill({status:code,contentType:'application/json',body:JSON.stringify(value)});
 });
 await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/ui.html')).href);await page.evaluate(()=>document.fonts.ready);
 await page.getByRole('button',{name:'Тулзы',exact:true}).click();
 const card=page.getByRole('button',{name:'Перевести на Glyph-26',exact:true});await card.waitFor();
 assert.equal(await page.locator('.apollo-skills-catalog>.apollo-skill-card').count(),3,'ReGlyph shares the existing catalogue with layer names and Figma audit');
 await page.screenshot({animations:'disabled',path:path.join(output,'skills-catalog.png')});
 await card.click();await page.getByRole('heading',{name:'Выбери iOS или Android',exact:true}).waitFor();const unavailable=page.getByRole('region',{name:'Помощник'});assert.equal(await unavailable.getAttribute('data-mood'),'error');assert.equal(await unavailable.locator('.apollo-mascot-body').evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(255, 174, 166)');assert.equal(await unavailable.locator('.apollo-reglyph-bubble').getByText('Навык работает с правилами АБМ. Для Desktop и MobileWeb правила пока не подключены.',{exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Закрыть',exact:true}).count(),0);assert.equal(await page.locator('.apollo-reglyph-workspace .apollo-skill-footer').count(),0);await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-platform-required-800.png')});assert.equal(sent.filter(m=>m.type==='reglyph-request').length,0);
 await page.getByRole('button',{name:'Закрыть: Перевести на Glyph-26',exact:true}).click();await waitDialogs();
 // Use the actual controller through the existing platform picker UI.
 await page.getByRole('button',{name:'Desktop',exact:true}).click();await page.getByRole('button',{name:'iOS',exact:true}).click();
 await page.evaluate(()=>window.emitPlugin({type:'selection',pageId:'page',valid:true,id:'frame',name:'Экран'}));
 await card.click();const check=page.getByRole('button',{name:'Проверить',exact:true});
 await check.waitFor();await assertWorkspaceHeader(32);await assertMascot('unchecked');await page.mouse.move(20,20);await page.waitForFunction(()=>Math.abs(parseFloat(document.querySelector('.apollo-reglyph-assistant .apollo-mascot-body').style.getPropertyValue('--gaze-x')))>0);assert.equal(await page.locator('.apollo-reglyph-assistant .apollo-mascot-eyes span').first().evaluate(element=>getComputedStyle(element).animationName),'apollo-mascot-blink');assert.equal(await page.getByRole('button',{name:'Замена в сервисах',exact:true}).count(),0);
 assert.equal(await page.locator('.apollo-reglyph-scenario').count(),0);
 assert.equal(sent.filter(message=>message.operation==='preview').length,0,'opening the skill never warms catalog PNGs');assert.deepEqual(f.imports,[]);
 f.emptySelection();await check.click();await page.getByRole('heading',{name:'Сначала выбери макет',exact:true}).waitFor();
 await assertMascot('violation');assert.equal(await check.isDisabled(),false,'empty selection invites a native check rather than permanently disabling the button');
 await page.evaluate(()=>window.changeFixtureSelection(false));
 const beforeCheck=await check.boundingBox();f.holdRead(true);await check.click();
 await page.getByRole('heading',{name:/^Ищу иконки/}).waitFor();assert.equal(await check.isDisabled(),true);assert.equal(await check.textContent(),'Проверить');
 await page.waitForFunction(()=>{const button=document.querySelector('.apollo-reglyph-workspace .apollo-skill-footer button');return button?.disabled && getComputedStyle(button).backgroundColor==='rgb(33, 33, 36)';});
 const checking=await check.evaluate(element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return{width:rect.width,height:rect.height,opacity:style.opacity,background:style.backgroundColor,children:element.children.length};});
 assert.equal(checking.width,beforeCheck.width);assert.equal(checking.height,56);assert.equal(checking.opacity,'0.4');assert.equal(checking.background,'rgb(33, 33, 36)');assert.equal(checking.children,0,'there is no spinner or loading wrapper');
 await assertMascot('unchecked',true);assert.equal(await page.locator('.apollo-reglyph-assistant .apollo-mascot-gaze').evaluate(element=>getComputedStyle(element).animationName),'apollo-mascot-inspect');assert.equal(await page.locator('.apollo-reglyph-assistant .apollo-mascot-body').evaluate(element=>getComputedStyle(element).animationName),'apollo-mascot-breathe');
 await page.evaluate(()=>window.notifyFixtureSelection());await page.getByRole('heading',{name:/^Ищу иконки/}).waitFor();assert.equal(await check.isDisabled(),true);
 const scanCount=sent.filter(message=>message.operation==='scan').length;await check.evaluate(element=>element.click());assert.equal(sent.filter(message=>message.operation==='scan').length,scanCount);
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-checking-button-800.png')});f.holdRead(false);
 await page.getByRole('heading',{name:/Готовы к замене/}).waitFor().catch(async error=>{await page.screenshot({path:path.join(output,'failure.png')});console.error(await page.locator('dialog[open]').innerText());throw error;});assert.equal(f.swaps.length,0,'scan is read-only');
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-preview-800.png')});
 await assertMascot('warning');assert.equal(await page.locator('.apollo-reglyph-row').count(),3);
 assert.deepEqual([...new Set(f.imports)].sort(),['new1','new2']);assert.equal(sent.filter(message=>message.operation==='preview').length,0,'scan returns the suggested thumbnails without background requests');assert.equal(await page.locator('.apollo-reglyph-icon-card.is-target .apollo-reglyph-tile img').count(),2);
 const previousRows=await page.locator('.apollo-reglyph-row').allTextContents();
 await page.evaluate(()=>window.changeFixtureSelection(true));
 await page.getByRole('heading',{name:'Проверить другой макет?',exact:true}).waitFor();
 await page.getByRole('button',{name:'Остаться',exact:true}).click();await waitDialogs();
 assert.equal(await page.getByText(/^Проверенная область:/).count(),0);assert.equal(await page.getByText(/^Проверь соответствия\. Без выбранной замены:/).count(),0);
 assert.deepEqual(await page.locator('.apollo-reglyph-row').allTextContents(),previousRows);assert.equal(await page.getByRole('alert').count(),0);assert.equal(await page.getByText('Нужна новая проверка',{exact:true}).count(),0);
 const apply=page.getByRole('button',{name:'Заменить · 2',exact:true});assert.equal(await apply.isDisabled(),false);
 assert.equal(await page.getByRole('button',{name:'Показать в макете',exact:true}).evaluateAll(buttons=>buttons.every(button=>!button.disabled)),true);
 await page.getByRole('button',{name:'Показать в макете',exact:true}).first().click();
 await page.waitForFunction(()=>!document.querySelector('.apollo-reglyph-small')?.disabled);
 await page.evaluate(()=>window.changeFixtureSelection(true));
 await page.getByRole('heading',{name:'Проверить другой макет?',exact:true}).waitFor();await page.keyboard.press('Escape');await waitDialogs();
 const previewsBefore=sent.filter(message=>message.operation==='icon-preview').length;
 await page.locator('.apollo-reglyph-icon-card').first().getByRole('button',{name:/^Превью:/}).click();
 assert.equal(await page.getByRole('dialog').count(),2);await page.waitForFunction(async count=>await window.previewRequestCount()===count,previewsBefore+1);assert.equal(sent.filter(message=>message.operation==='icon-preview').length,previewsBefore+1,'original source preview stays actionable');
 await page.getByRole('dialog').last().getByRole('button',{name:/^Закрыть:/}).click();await waitDialogs();
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-restored-selection-800.png')});
 await page.setViewportSize({width:440,height:780});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.locator('dialog[open]').count(),1);
 const historyBounds=await page.locator('dialog[open]').boundingBox();assert.equal(historyBounds.y,8);assert.equal(historyBounds.height,764);
 const historyFooter=await page.locator('.apollo-skill-footer').boundingBox();assert.ok(historyFooter.y+historyFooter.height<=780);
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-restored-selection-440.png')});
 await page.getByRole('button',{name:'Выбрать',exact:true}).first().click();
 await waitMotions();const narrowPicker=page.getByRole('dialog').last(),narrowBox=await narrowPicker.boundingBox();assert.ok(narrowBox.x>=8 && narrowBox.x+narrowBox.width<=432);assert.ok(narrowBox.y>=8 && narrowBox.y+narrowBox.height<=772);
 assert.equal(await narrowPicker.evaluate(element=>element.scrollWidth<=element.clientWidth),true);
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-icon-picker-440.png')});
 await waitVisibleOptions();await page.waitForFunction(async()=>await window.catalogPreviewRequestCount()>0);
 const firstCatalogCount=sent.filter(message=>message.operation==='preview').length,firstCatalogKeys=new Set(f.imports);
 assert.ok(f.imports.filter(key=>key.startsWith('extra')).length<60,'opening the picker only loads visible options and a small margin');
 await narrowPicker.locator('.apollo-reglyph-options').evaluate(element=>{element.scrollTop=element.scrollHeight-element.clientHeight;});
 await page.waitForFunction(async before=>await window.catalogPreviewRequestCount()>before,firstCatalogCount);await waitVisibleOptions();
 assert.ok(f.imports.some(key=>key.startsWith('extra')&&!firstCatalogKeys.has(key)),'scrolling loads newly visible options');

 await page.keyboard.press('Escape');await waitDialogs();assert.equal(await page.getByRole('dialog').count(),1);

 assert.equal(await page.locator('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth),true);assert.equal(await page.getByRole('alert').count(),0);
 await page.getByRole('button',{name:'Закрыть: Перевести на Glyph-26',exact:true}).click();await waitDialogs();await card.click();assert.deepEqual(await page.locator('.apollo-reglyph-row').allTextContents(),previousRows);
 assert.equal(await apply.isDisabled(),false);assert.equal(await page.getByRole('alert').count(),0);
 await page.setViewportSize({width:800,height:860});
 const longRows=await page.addStyleTag({content:'.apollo-reglyph-row{min-height:1200px}'});
 await page.locator('.apollo-reglyph-content').evaluate(element=>{element.scrollTop=400;});await page.waitForFunction(()=>document.querySelector('.apollo-reglyph-content').scrollTop===400);
 await page.getByRole('button',{name:'Заменить · 2',exact:true}).click();
 await page.getByRole('heading',{name:'Точно заменяем?',exact:true}).waitFor();assert.equal(f.swaps.length,0);
 f.holdRead(true);
 await page.getByRole('dialog').last().getByRole('button',{name:'Заменить · 2',exact:true}).click();
 await page.getByRole('heading',{name:/^Обновляю иконки/}).waitFor();assert.equal(await page.locator('.apollo-reglyph-workspace .apollo-skill-footer button').count(),0,'ReGlyph hides actions while replacing');await assertMascot('unchecked',true);f.holdRead(false);

 await page.getByRole('heading',{name:'Почти готово',exact:true}).waitFor();await waitDialogs();await assertMascot('warning');assert.equal(f.swaps.length,2);assert.equal(await page.getByRole('button',{name:'Назад к замене',exact:true}).evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(33, 33, 36)');assert.notEqual(await page.getByRole('button',{name:'Новая проверка',exact:true}).evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(33, 33, 36)');
 assert.equal(await page.locator('.apollo-reglyph-content').evaluate(element=>element.scrollTop),0);
 await page.getByRole('button',{name:'Назад к замене',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.apollo-reglyph-content').scrollTop===400);await longRows.evaluate(element=>element.remove());
 const row=page.locator('.apollo-reglyph-row').first();await row.getByRole('button',{name:'Выбрать',exact:true}).click();
 const pickerDialog=page.getByRole('dialog').last();
 await waitMotions();const geometry=await pickerDialog.evaluate(element=>{const rect=element.getBoundingClientRect(),search=element.querySelector('input'),style=getComputedStyle(element);return{x:rect.x,y:rect.y,width:rect.width,height:rect.height,viewportWidth:innerWidth,viewportHeight:innerHeight,radius:style.borderRadius,padding:style.padding,searchHeight:search.getBoundingClientRect().height};});
 await assertCloseGeometry(pickerDialog);
 assert.equal(geometry.width,606);assert.equal(geometry.height,744);assert.equal(geometry.radius,'48px');assert.equal(geometry.padding,'32px');assert.equal(geometry.searchHeight,56);
 assert.ok(Math.abs(geometry.x+geometry.width/2-geometry.viewportWidth/2)<1);assert.ok(Math.abs(geometry.y+geometry.height/2-geometry.viewportHeight/2)<1);
 await pickerDialog.locator('.apollo-reglyph-options').evaluate(element=>{element.scrollTop=1000;});
 await page.getByRole('searchbox').fill('Тест');await page.waitForFunction(()=>document.querySelector('.apollo-reglyph-options').scrollTop===0);
 await page.getByRole('searchbox').fill('ничего-не-найдётся');await page.getByText('Ничего не найдено',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Очистить поиск',exact:true}).click();assert.equal(await page.getByRole('searchbox').inputValue(),'');assert.equal(await page.getByRole('button',{name:'Очистить поиск',exact:true}).count(),0);
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-icon-picker-800.png')});
 await page.getByRole('searchbox').fill('текст');await page.keyboard.press('Control+z');assert.equal(f.undoCount(),0,'text Undo does not reach Figma');
 await page.getByRole('searchbox').fill('дата');await page.locator('.apollo-reglyph-option>button').getByText('Календарь',{exact:true}).click();await waitDialogs();assert.equal(await page.getByRole('dialog').count(),1);
 await page.getByRole('button',{name:'Заменить · 1',exact:true}).click();await page.getByRole('heading',{name:'Готово! Иконки обновлены',exact:true}).waitFor();await assertMascot('clean');assert.equal(f.swaps.length,3);assert.ok(f.swaps.every(([id])=>id!=='other-icon'),'other selected frame is never changed');assert.equal(sent.filter(m=>m.operation==='scan').length,2,'one empty-selection scan and one original-frame scan; replacements do not rescan');
 await page.evaluate(()=>window.changeFixtureSelection(true));
 if(process.env.APOLLO_STATISTICS_BROWSER_CASES){
  const beforeMutations=f.swaps.length;
  const serviceUi=()=>page.locator('.apollo-statistics-notice').count();
  deliveryMode='offline';await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.click();await page.locator('.apollo-reglyph-row').first().waitFor();
  await page.waitForFunction(async()=>await window.statisticsPendingCount()>0);
  assert.equal(await serviceUi(),0);assert.equal(await page.getByRole('button',{name:'Повторить отправку',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Скачать сведения',exact:true}).count(),0);assert.equal(f.swaps.length,beforeMutations);
  await page.screenshot({animations:'disabled',path:path.join(output,'statistics-offline-800.png')});
  await page.setViewportSize({width:440,height:780});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await page.locator('dialog[open]').evaluate(node=>node.scrollWidth<=node.clientWidth),true);await page.screenshot({animations:'disabled',path:path.join(output,'statistics-offline-440.png')});
  deliveryMode='online';await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForFunction(async()=>await window.statisticsPendingCount()===0);assert.equal(f.swaps.length,beforeMutations);
  deliveryMode='wrong-receipt';await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.click();await page.waitForFunction(async()=>await window.statisticsPendingCount()>0);
  const count=journal.read().records.length;deliveryMode='online';await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForFunction(async()=>await window.statisticsPendingCount()===0);assert.equal(journal.read().records.length,count,'automatic receipt retry does not duplicate journal rows');
  f.poison(true);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForFunction(async()=>await window.statisticsPendingCount()>0);assert.equal(await serviceUi(),0);assert.ok(f.statsPending().some(key=>key.endsWith('poison')),'corrupt metadata retained for technical diagnosis');
  f.poison(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForFunction(async()=>await window.statisticsPendingCount()===0);
  const beforeQuota=journal.read().records.length;f.quota(true);await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.click();await page.locator('.apollo-reglyph-row').first().waitFor();assert.equal(await page.locator('.apollo-reglyph-row').count(),1,'quota cannot replace the skill result');assert.equal(f.swaps.length,beforeMutations);assert.equal(await serviceUi(),0);
  await page.screenshot({animations:'disabled',path:path.join(output,'statistics-quota-440.png')});f.quota(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForFunction(async before=>await window.statisticsJournalCount()>before,beforeQuota);await page.waitForFunction(async()=>await window.statisticsPendingCount()===0);
  assert.ok(journal.read().records.every(row=>row.totalTokens===0&&row.calls===0));assert.ok(journal.read().records.some(row=>row.operation.includes('Обновить иконки')));
  await page.setViewportSize({width:800,height:860});
 }
 await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.waitFor();await check.click();await page.locator('.apollo-reglyph-row').first().waitFor();assert.equal(await page.locator('.apollo-reglyph-row').count(),1);await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.waitFor();
 // Undo while the skill has focus resets the result and reaches Figma exactly once.
 await page.getByRole('heading',{name:'Давай обновим иконки',exact:true}).click();
 await page.keyboard.press('Control+Shift+z');assert.equal(f.undoCount(),0,'Redo is not intercepted as Undo');
 await page.keyboard.press('Control+z');await page.waitForFunction(async()=>await window.undoCount()===1);await check.waitFor();
 assert.equal(await page.locator('.apollo-reglyph-row').count(),0);
 // The latest batch was icon3 only; prior replacements remain in the synthetic Figma history.
 await page.evaluate(()=>window.changeFixtureSelection(false));await check.click();await page.getByRole('heading',{name:/Этих иконок нет/}).waitFor();assert.equal(await page.locator('.apollo-reglyph-row').count(),1);
 await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.waitFor();
 f.services(true);await check.click();const servicesDialog=page.getByRole('dialog').last();
 await servicesDialog.getByRole('heading',{name:'Для сервисов есть эталонный предсобранный экран',exact:true}).waitFor();
 assert.match(await servicesDialog.getByRole('link',{name:'Паттерн для iOS'}).getAttribute('href'),/20022540-222178$/);
 assert.match(await servicesDialog.getByRole('link',{name:'Паттерн для Android'}).getAttribute('href'),/20022540-228115$/);
 await waitMotions();const serviceStyles=await servicesDialog.evaluate(element=>{const header=element.querySelector('header'),links=Array.from(element.querySelectorAll('a')),text=element.querySelector('main>p');return{gap:getComputedStyle(header).gap,bodySize:getComputedStyle(text).fontSize,bodyLine:getComputedStyle(text).lineHeight,labels:links.map(link=>link.textContent),links:links.map(link=>({height:link.getBoundingClientRect().height,whiteSpace:getComputedStyle(link).whiteSpace})),copy:text.textContent};});
 await assertCloseGeometry(servicesDialog);
 assert.equal(serviceStyles.gap,'32px');assert.equal(serviceStyles.bodySize,'19px');assert.equal(serviceStyles.bodyLine,'24px');assert.ok(serviceStyles.links.every(link=>link.height===56 && link.whiteSpace==='nowrap'));
 assert.deepEqual(serviceStyles.labels,['Паттерн для iOS','Паттерн для Android']);assert.ok(serviceStyles.copy.includes('из\u00a0паттерна'));
 assert.equal(await servicesDialog.getByRole('button',{name:'Понятно',exact:true}).count(),0);
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-services-800.png')});
 await servicesDialog.getByRole('button',{name:'Закрыть: Для сервисов есть эталонный предсобранный экран',exact:true}).click();await waitDialogs();assert.equal(await page.getByRole('dialog').count(),1);f.services(false);
 await page.getByRole('button',{name:'Закрыть: Перевести на Glyph-26',exact:true}).click();await waitDialogs();
 await page.getByRole('button',{name:'iOS',exact:true}).click();await page.getByRole('button',{name:'Android',exact:true}).click();
 await card.click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator('.apollo-reglyph-context').count(),0);
 await page.setViewportSize({width:440,height:780});await check.waitFor();await assertWorkspaceHeader(24);assert.equal(await page.locator('.apollo-reglyph-scenario').count(),0);
 f.services(true);await check.click();await page.getByRole('heading',{name:'Для сервисов есть эталонный предсобранный экран',exact:true}).waitFor();
 await assertCloseGeometry(page.getByRole('dialog').last());
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-services-440.png')});
 assert.equal(await page.getByRole('dialog').last().evaluate(element=>element.scrollWidth<=element.clientWidth),true);
 await page.keyboard.press('Escape');await waitDialogs();assert.equal(await page.getByRole('dialog').count(),1);f.services(false);
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-ready-440.png')});
 assert.equal(await page.locator('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth),true);
 const box=await page.locator('.apollo-skill-footer').boundingBox();assert.ok(box.y+box.height<=780);
 await page.evaluate(()=>window.changeFixtureSelection(true));f.failSwaps(true);await check.click();await page.getByRole('button',{name:'Заменить · 1',exact:true}).click();
 await page.getByRole('heading',{name:'Не удалось обновить иконки',exact:true}).waitFor();const retry=page.getByRole('button',{name:'Попробовать ещё раз',exact:true});
 await assertMascot('violation');await page.mouse.move(20,20);await waitMotions();assert.equal(await retry.isDisabled(),false);assert.equal(await retry.evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(33, 33, 36)');assert.equal(await page.getByRole('button',{name:'Новая проверка',exact:true}).count(),0);
 const scansBeforeRetry=sent.filter(message=>message.operation==='scan').length;f.failSwaps(false);await retry.click();await page.getByRole('heading',{name:'Готово! Иконки обновлены',exact:true}).waitFor();assert.equal(sent.filter(message=>message.operation==='scan').length,scansBeforeRetry,'retry applies the remaining plan without rescanning');

 await page.getByRole('button',{name:'Новая проверка',exact:true}).click();await check.click();await page.getByRole('button',{name:'Заменить · 1',exact:true}).waitFor();
 await page.evaluate(()=>window.changeFixtureSelection(false));await page.getByRole('heading',{name:'Проверить другой макет?',exact:true}).waitFor();
 const selectionDialog=page.getByRole('dialog').last();await selectionDialog.getByRole('button',{name:'Проверить',exact:true}).click();await waitDialogs();
 await page.getByRole('heading',{name:/Этих иконок нет/}).waitFor();assert.equal(await page.locator('.apollo-reglyph-row').count(),1);
 assert.ok(sent.some(message=>message.operation==='selection-decision' && message.payload.decision==='stay'));
 assert.ok(sent.some(message=>message.operation==='selection-decision' && message.payload.decision==='switch'));
 const motions=await page.evaluate(()=>window.reglyphMotions);
 assert.ok(motions.some(item=>item.className.includes('apollo-reglyph-picker') && item.options.duration===220 && item.frames[0].transform==='translateY(12px) scale(.98)'));
 assert.ok(motions.some(item=>item.className.includes('apollo-reglyph-picker') && item.options.duration===160 && item.frames[1].opacity===0));
 assert.ok(motions.some(item=>item.className==='apollo-reglyph-bubble' && item.options.duration===220));
 // Reduced-motion users receive the same final states without queued entrance/exit motion.
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Выбрать',exact:true}).click();await page.getByRole('searchbox').waitFor();await page.keyboard.press('Escape');await waitDialogs();
 assert.equal(await page.locator('.apollo-reglyph-assistant .apollo-mascot-eyes span').first().evaluate(element=>getComputedStyle(element).animationName),'none');
 const revision=sent.findLast(message=>message.type==='reglyph-context').revision;
 await page.evaluate(revision=>window.emitPlugin({type:'reglyph-event',schemaVersion:'apollo.reglyph.v1',revision,event:{type:'stale'}}),revision);
 await page.getByRole('heading',{name:'Проверим новый макет',exact:true}).waitFor();await assertMascot('unchecked');
 // A real canvas selection change while Figma is still reading must not produce idle + disabled Check.
 f.holdRead(true);await check.click();await page.getByRole('heading',{name:/^Ищу иконки/}).waitFor();
 await page.evaluate(()=>window.changeFixtureSelection(true));await page.getByRole('heading',{name:/^Выделение изменилось/}).waitFor();
 assert.equal(await check.isDisabled(),true);assert.equal(await page.locator('.apollo-reglyph-content').getAttribute('aria-busy'),'true');
 assert.equal(await page.getByRole('heading',{name:'Давай обновим иконки',exact:true}).count(),0);
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-selection-finishing.png')});
 f.holdRead(false);await page.waitForFunction(()=>!document.querySelector('.apollo-reglyph-workspace .apollo-skill-footer button')?.disabled);
 await page.getByRole('heading',{name:'Проверим новый макет',exact:true}).waitFor();
 await page.evaluate(()=>window.notifyFixtureSelection());assert.equal(await page.getByRole('heading',{name:'Давай обновим иконки',exact:true}).count(),0);
 await check.click();await page.getByRole('button',{name:'Заменить · 1',exact:true}).waitFor();await assertMascot('warning');

 // A canvas choice made while Stay is awaiting page return survives and opens a fresh prompt.
 const swapsBeforeReturn=f.swaps.length;f.away();await page.getByRole('heading',{name:'Проверить другой макет?',exact:true}).waitFor();
 f.holdPage(true);await page.getByRole('button',{name:'Остаться',exact:true}).click();await waitDialogs();await page.waitForFunction(async()=>await window.onOriginalFixturePage());
 await page.evaluate(()=>window.changeFixtureSelection(false));f.holdPage(false);
 await page.getByRole('heading',{name:'Проверить другой макет?',exact:true}).waitFor();
 const repeated=page.getByRole('dialog').last();assert.equal((await repeated.locator('main').innerText()).replace(/\s+/g,' '),'Текущую проверку мне придётся сбросить.');
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-selection-changed-during-return.png')});
 await repeated.getByRole('button',{name:'Проверить',exact:true}).click();await waitDialogs();await page.getByRole('heading',{name:/Этих иконок нет/}).waitFor();
 assert.equal(await page.locator('.apollo-reglyph-row').count(),1);assert.equal(f.swaps.length,swapsBeforeReturn,'return and repeated check never replace icons automatically');


 // Presentation-only synthetic result: missing targets follow unknown sources and share the yellow source-card treatment.
 await page.evaluate(revision=>window.emitPlugin({type:'reglyph-event',schemaVersion:'apollo.reglyph.v1',revision,event:{type:'scan',rows:[
  {oldKey:'ui-unknown',newKey:'',name:'Unknown source',category:'unknown',ids:['ui-unknown']},
  {oldKey:'ui-unresolved',newKey:'',name:'Missing target',ids:['ui-unresolved']},
  {oldKey:'ui-ready',newKey:'new1',name:'Ready source',ids:['ui-ready']}
 ],observedRows:[{oldKey:'ui-logo',name:'Logo',category:'logo',ids:['ui-logo']}]}}),revision);
 await page.waitForFunction(()=>document.querySelectorAll('.apollo-reglyph-group').length===4);
 assert.deepEqual(await page.locator('.apollo-reglyph-group>h3').evaluateAll(headings=>headings.map(heading=>heading.firstChild.textContent.trim())),['Этих иконок нет в библиотеках','Этих иконок нет в Glyph 26','Логотипы','Готовы к замене']);
 const sourceColor=selector=>page.locator(selector+'>.apollo-reglyph-icon-card:first-child').evaluate(element=>getComputedStyle(element).backgroundColor);
 assert.equal(await sourceColor('.apollo-reglyph-row.is-unresolved'),'rgb(253, 249, 236)');assert.equal(await sourceColor('.apollo-reglyph-row.is-unknown'),await sourceColor('.apollo-reglyph-row.is-unresolved'));
 await page.screenshot({animations:'disabled',path:path.join(output,'reglyph-unresolved-yellow-order.png')});

 await page.getByRole('button',{name:'Закрыть: Перевести на Glyph-26',exact:true}).click();await waitDialogs();await card.focus();assert.equal(await card.evaluate(element=>document.activeElement===element),true);await page.keyboard.press('Control+z');assert.equal(f.undoCount(),1,'closed skill does not intercept Undo');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'PASS',swaps:f.swaps,reglyphRequests:sent.filter(m=>m.type==='reglyph-request').map(m=>m.operation),liveFigma:'NOT_RUN',statistics:journal?{records:journal.read().records.map(({operation,status,totalTokens,calls})=>({operation,status,totalTokens,calls})),faults:['offline/automatic recovery','wrong-receipt/idempotence','corrupt retention without service UI','quota/automatic retry'],pending:f.statsPending().length}:null},null,2));console.log('ReGlyph integrated UI PASS: three cards, offline ReGlyph without Proxy, native gate, ReGlyph selection confirmation and Stay restore, partial confirmation, remaining rows, picker/search, replacement, text/native Undo, disabled service scenario and pattern links, Android, 800/440 footer.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
