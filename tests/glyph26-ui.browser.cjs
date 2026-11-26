'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build-tmp/glyph26-ui');fs.mkdirSync(out,{recursive:true});
const requirements=require('../src/compatibility-requirements.json');
const schema='apollo.v3-audit-bridge.v1';
function install(schema){
 window.__wire=[];window.__emit=message=>window.postMessage({pluginMessage:message},'*');
 window.addEventListener('message',event=>{
  const m=event.data?.pluginMessage;if(!m)return;window.__wire.push(m);const emit=window.__emit;
  if(m.type==='ready')setTimeout(()=>emit({type:'selection',pageId:'page',id:'root',name:'Синтетическая область',valid:true}),0);
  if(m.type==='design-check-ui-request')setTimeout(()=>emit({type:'design-check-ui-result',schemaVersion:m.schemaVersion,requestId:m.requestId,operation:m.operation,result:null}),0);
  if(m.type==='contract-data-request')setTimeout(()=>emit({type:'contract-data-result',requestId:m.requestId,result:{mode:'proxy',contracts:[]}}),0);
  if(m.type==='reglyph-request')setTimeout(()=>{
   const feed=event=>emit({type:'reglyph-event',schemaVersion:m.schemaVersion,requestId:m.requestId,revision:m.revision,event});
   if(m.operation==='ready')feed({type:'catalog',catalog:{version:1,scenarioId:'default',oldIcons:[{key:'old',name:'Old'}],newIcons:[{key:'new',name:'New',baseName:'New',familyId:'new',width:24,height:24}],mappings:[]}});
   const remaining={oldKey:'manual',name:'Manual',newKey:'',ids:['node-1']};
   if(['scan','review'].includes(m.operation))feed({type:'scan',scopeName:'Синтетическая область',rows:[{oldKey:'old',name:'Old',newKey:'new',ids:['node-0']},remaining],observedRows:[]});
   if(m.operation==='replace')feed({type:'done',replaced:1,completedIds:['node-0'],failed:0,skipped:1,errors:[],remainingRows:[remaining]});
   emit({type:'reglyph-result',schemaVersion:m.schemaVersion,requestId:m.requestId,revision:m.revision});
  },0);
  if(m.type==='v3-audit-run'){
   window.__run=m.requestId;
   const items=['Автоматическая замена','Выбор дизайнера'].map((name,i)=>({id:'node-'+i,name,librarySource:'Icons',fullPath:'Макет / '+name,glyph26Status:i===0?'violation':'warning',focusActionId:'focus-'+i}));
   setTimeout(()=>emit({type:'v3-audit-result',schemaVersion:schema,requestId:m.requestId,kind:'components',result:{runId:m.requestId,dataId:'a'.repeat(64),mutationAvailable:true,liquidGlass:{status:'connected'},glyph26:{status:'complete'},visibleViews:{relevance:{},glyph26:items},report:{schemaVersion:1},textReport:{facts:{texts:[]}}}}),0);
  }
  if(m.type==='v3-audit-focus')setTimeout(()=>emit({type:'v3-audit-operation-result',schemaVersion:schema,requestId:m.requestId,runId:m.runId,result:{focused:true}}),0);
  if(m.type==='token-journal-request')setTimeout(()=>emit({type:'token-journal-result',requestId:m.requestId,operation:m.operation,result:m.operation==='pending'?{records:[],unreadable:0,invalidIds:[]}:{id:m.payload?.record?.id}}),0);
  if(m.type==='audit-statistics-request')setTimeout(()=>emit({type:'audit-statistics-result',requestId:m.requestId,operation:m.operation,result:m.operation==='pending'?{reports:[],payloadHashes:[],unreadable:0}:{reportId:m.report?.reportId}}),0);
 });
}
async function run(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{for(const [platform,width] of [['iOS',800],['iOS',440],['Android',800],['Desktop',800],['MobileWeb',800]]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://localhost:3001/**',async route=>{
   const url=new URL(route.request().url());let value={success:true};
   if(url.pathname==='/health')value={ok:true,proxy:{version:requirements.minProxyVersion},compatibility:{protocolVersion:requirements.protocolVersion,data:{state:'ready',version:'a'.repeat(64),schemaVersion:requirements.dataSchemaVersion,profileVersion:requirements.dataProfiles.at(-1),deliveryProfile:requirements.deliveryProfile,generatedAt:'2026-11-24T00:00:00Z'}}};
   if(url.pathname==='/v2/contracts/data-overview')value={schemaVersion:'apollo.contract-data.v1',rows:[],sources:{}};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  });
  let html=fs.readFileSync(path.join(root,'dist/ui.html'),'utf8');
  html=html.replace('<head>','<head><script>('+install.toString()+')('+JSON.stringify(schema)+')</script>');
  await page.setContent(html);await page.getByRole('button',{name:'Проверить',exact:true}).waitFor();
  if(platform!=='Desktop'){await page.getByRole('button',{name:'Desktop',exact:true}).click();await page.getByRole('button',{name:platform,exact:true}).click();}
  await page.getByRole('button',{name:'Проверить',exact:true}).click();
  if(['iOS','Android'].includes(platform)){
   const card=page.getByRole('button',{name:'Иконки: 2 замечаний',exact:true});await card.waitFor();
   assert.equal(await page.getByRole('button',{name:/^Паттерны:/}).count(),0);
   assert.equal(await card.locator('.apollo-overview-group-description').innerText(),'Устаревшие иконки, которые необходимо заменить\nна Glyph-26');
   await page.screenshot({path:path.join(out,platform+'-overview-'+width+'.png'),fullPage:true});
   await card.click();await page.getByRole('button',{name:'Вернуться к обзору проверки',exact:true}).waitFor();
   assert.equal(await page.getByRole('navigation',{name:'Категории проверки',exact:true}).count(),0);
   assert.equal(await page.getByRole('button',{name:'Иконки · 2',exact:true}).count(),0);
   const banner=page.locator('.apollo-glyph26-banner');
   assert.equal(await banner.count(),1);
   assert.equal(await banner.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(220, 233, 255)');
   assert(await banner.evaluate(node=>node.nextElementSibling?.getBoundingClientRect().top>=node.getBoundingClientRect().bottom));
   assert.equal(await banner.locator('.apollo-glyph26-banner-title').evaluate(node=>getComputedStyle(node).fontSize),'16px');
   assert.equal(await banner.getByRole('button',{name:'Перейти',exact:true}).count(),1);
   assert.equal(await banner.getByRole('button').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(255, 255, 255)');
   assert.equal(await page.getByRole('img',{name:'Нарушение',exact:true}).count(),1);
   assert.equal(await page.getByRole('img',{name:'Замечание',exact:true}).count(),1);
   await page.getByText('Устаревшая иконка, есть в Glyph-26',{exact:true}).waitFor();
   await page.getByText('Устаревшая иконка, может не быть в Glyph-26',{exact:true}).waitFor();
   for(const [index,message] of [
    'Устаревшая иконка: можно заменить автоматически, используй навык «Перевести на Glyph-26».',
    'Устаревшая иконка: при автоматической замене может потребовать вмешательство, используй навык «Перевести на Glyph-26».',
   ].entries()){
    await page.getByRole('button',{name:'Сведения проверки',exact:true}).nth(index).click();
    assert.equal(await page.getByRole('dialog').getByText(message,{exact:true}).count(),1);
    await page.getByRole('button',{name:'Закрыть сведения проверки',exact:true}).click();
   }
   assert.equal(await page.getByRole('button',{name:'Показать в макете',exact:true}).count(),2);
   await page.getByRole('button',{name:'Показать в макете',exact:true}).first().click();
   await page.waitForFunction(()=>window.__wire.some(m=>m.type==='v3-audit-focus'&&m.focusActionId==='focus-0'));
   assert.equal(await page.getByRole('button',{name:'Заменить',exact:true}).count(),0);
   await page.screenshot({path:path.join(out,platform+'-banner-'+width+'.png'),fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   const resultsScroll=await page.locator('.apollo-results').evaluate(node=>node.scrollTop);
   await banner.getByRole('button',{name:'Перейти',exact:true}).click();
   const skill=page.getByRole('dialog',{name:'Перевести на Glyph-26',exact:true});await skill.waitFor();
   await page.waitForTimeout(250);
   await skill.getByRole('button',{name:'Заменить · 1',exact:true}).waitFor();
   assert.equal(await skill.getByRole('button',{name:'Проверить',exact:true}).count(),0);
   assert(await page.evaluate(()=>window.__wire.some(m=>m.type==='reglyph-request'&&m.operation==='review'&&m.payload.runId===window.__run)));
   const bounds=await skill.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width);
   await page.screenshot({path:path.join(out,platform+'-skill-'+width+'.png'),fullPage:true});
   assert.equal(await page.getByRole('button',{name:'Проверка',exact:true}).getAttribute('aria-pressed'),'true');
   assert.equal(await page.evaluate(()=>window.__wire.filter(m=>m.type==='reglyph-request'&&['scan','replace'].includes(m.operation)).length),0);
   await skill.getByRole('button',{name:'Закрыть: Перевести на Glyph-26',exact:true}).click();
   await skill.waitFor({state:'detached'});
   assert.equal(await page.getByRole('button',{name:'Проверка',exact:true}).getAttribute('aria-pressed'),'true');
   assert.equal(await banner.locator('.apollo-glyph26-banner-title').textContent(),'Для автозамены используй навык «Перевести на Glyph-26»');
   assert.equal(await page.getByRole('img',{name:'Нарушение',exact:true}).count(),1);
   assert.equal(await page.locator('.apollo-results').evaluate(node=>node.scrollTop),resultsScroll);
   await banner.getByRole('button',{name:'Перейти',exact:true}).click();
   await skill.waitFor();await page.keyboard.press('Escape');await skill.waitFor({state:'detached'});
   assert.equal(await page.getByRole('button',{name:'Проверка',exact:true}).getAttribute('aria-pressed'),'true');
   if(platform==='iOS'&&width===800){
    await banner.getByRole('button',{name:'Перейти',exact:true}).click();await skill.waitFor();
    await skill.getByRole('button',{name:'Заменить · 1',exact:true}).waitFor();
    assert.equal(await skill.getByRole('button',{name:'Проверить',exact:true}).count(),0);
    await skill.getByRole('button',{name:'Заменить · 1',exact:true}).click();
    await page.getByRole('dialog',{name:'Точно заменяем?',exact:true}).getByRole('button',{name:'Заменить · 1',exact:true}).click();
    await skill.getByText('Заменено: 1. Пропущено: 1. Не удалось заменить: 0.',{exact:true}).waitFor();
    await skill.getByRole('button',{name:'Закрыть: Перевести на Glyph-26',exact:true}).click();await skill.waitFor({state:'detached'});
    assert.equal(await page.getByRole('img',{name:'Нарушение',exact:true}).count(),0);
    assert.equal(await page.getByRole('img',{name:'Замечание',exact:true}).count(),1);
    assert.equal(await page.evaluate(()=>window.__wire.filter(m=>m.type==='v3-audit-run').length),1);
    await page.getByRole('button',{name:'Вернуться к обзору проверки',exact:true}).click();
    await page.getByRole('button',{name:'Иконки: 1 замечаний',exact:true}).waitFor();
    const sync=updates=>page.evaluate(updates=>window.__emit({type:'v3-audit-glyph26-sync',schemaVersion:'apollo.v3-audit-bridge.v1',runId:window.__run,sequence:window.__sync=(window.__sync||0)+1,updates}),updates);
    await sync([{id:'node-0',status:'current'}]);
    assert.equal(await page.getByRole('button',{name:'Иконки: 1 замечаний',exact:true}).count(),1);
    await sync([{id:'node-0',status:'legacy',classification:'violation',sourceKey:'a'.repeat(40),targetKey:'b'.repeat(40),reason:'automatic-mapping',ruleId:'apollo.glyph26.automatic'}]);
    await page.getByRole('button',{name:'Иконки: 2 замечаний',exact:true}).waitFor();
    await page.getByRole('button',{name:'Иконки: 2 замечаний',exact:true}).click();
    assert.equal(await page.getByRole('img',{name:'Нарушение',exact:true}).count(),1);
    assert.equal(await page.getByRole('img',{name:'Замечание',exact:true}).count(),1);
    await sync([{id:'node-0',status:'current'}]);
    await page.waitForFunction(()=>document.querySelectorAll('.apollo-finding-status.violation').length===0);
    await page.getByRole('button',{name:'Вернуться к обзору проверки',exact:true}).click();
    await page.getByRole('button',{name:'Иконки: 1 замечаний',exact:true}).waitFor();
   }
  }else{
   await page.getByRole('button',{name:/^Паттерны:/}).waitFor();
   assert.equal(await page.getByRole('button',{name:/^Иконки:/}).count(),0);
  }
  if(!['iOS','Android'].includes(platform)){const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.equal(size.scroll,size.width);}
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,platform+'-findings-'+width+'.png'),fullPage:true});await page.close();
 }}finally{await browser.close();}
 console.log('PASS: mobile Icons replace Patterns with exact copy; web keeps Patterns; red/warning cards, focus and 800/440 px verified.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
