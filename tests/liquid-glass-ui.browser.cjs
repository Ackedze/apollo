'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build-tmp/liquid-glass-ui');fs.mkdirSync(out,{recursive:true});
const requirements=require('../src/compatibility-requirements.json');
const schema='apollo.v3-audit-bridge.v1';
function install(schema){
 window.__wire=[];window.__emit=message=>window.postMessage({pluginMessage:message},'*');
 window.addEventListener('message',event=>{
  const m=event.data?.pluginMessage;if(!m)return;window.__wire.push(m);const emit=window.__emit;
  if(m.type==='ready')setTimeout(()=>emit({type:'selection',pageId:'page',id:'root',name:'Синтетическая область',valid:true}),0);
  if(m.type==='design-check-ui-request')setTimeout(()=>emit({type:'design-check-ui-result',schemaVersion:m.schemaVersion,requestId:m.requestId,operation:m.operation,result:null}),0);
  if(m.type==='contract-data-request')setTimeout(()=>emit({type:'contract-data-result',requestId:m.requestId,result:{mode:'proxy',contracts:[]}}),0);
  if(m.type==='v3-audit-run'){
   window.__run=m.requestId;
   const items=['Старый компонент','ResultScreen без стекла'].map((name,i)=>({id:'node-'+i,name,librarySource:'iOS · Fixture',fullPath:'Макет / '+name,liquidGlassStatus:'violation',liquidGlassReason:i===1?'variant-property-missing':undefined,focusActionId:'focus-'+i}));
   setTimeout(()=>emit({type:'v3-audit-result',schemaVersion:schema,requestId:m.requestId,kind:'components',result:{runId:m.requestId,dataId:'a'.repeat(64),mutationAvailable:true,liquidGlass:{status:'connected'},visibleViews:{relevance:{},liquidGlass:items},report:{schemaVersion:1},textReport:{facts:{texts:[]}}}}),0);
  }
  if(m.type==='v3-audit-focus')setTimeout(()=>emit({type:'v3-audit-operation-result',schemaVersion:schema,requestId:m.requestId,runId:m.runId,result:{focused:true}}),0);
  if(m.type==='token-journal-request')setTimeout(()=>emit({type:'token-journal-result',requestId:m.requestId,operation:m.operation,result:m.operation==='pending'?{records:[],unreadable:0,invalidIds:[]}:{id:m.payload?.record?.id}}),0);
  if(m.type==='audit-statistics-request')setTimeout(()=>emit({type:'audit-statistics-result',requestId:m.requestId,operation:m.operation,result:m.operation==='pending'?{reports:[],payloadHashes:[],unreadable:0}:{reportId:m.report?.reportId}}),0);
 });
}
async function run(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{for(const width of [800,440]){
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
  await page.getByRole('button',{name:'Desktop',exact:true}).click();await page.getByRole('button',{name:'iOS',exact:true}).click();
  await page.getByRole('button',{name:'Проверить',exact:true}).click();
  await page.getByRole('button',{name:'Компоненты: 2 замечаний',exact:true}).click();
  await page.getByRole('button',{name:'Не на Liquid Glass · 2',exact:true}).click();
  assert.equal(await page.locator('.apollo-v3-findings').count(),1);
  assert.equal(await page.getByText('Компонент не переведён на Liquid Glass.',{exact:true}).count(),2);
  assert.equal(await page.getByRole('button',{name:'Показать в макете',exact:true}).count(),2);
  await page.getByRole('button',{name:'Сведения проверки',exact:true}).nth(1).click();
  assert.equal(await page.getByText('Обнови компонент до актуальной версии и включи Liquid Glass.',{exact:true}).isVisible(),true);
  await page.getByRole('button',{name:'Закрыть сведения проверки',exact:true}).click();
  await page.getByRole('button',{name:'Показать в макете',exact:true}).first().click();
  await page.waitForFunction(()=>window.__wire.some(m=>m.type==='v3-audit-focus'&&m.focusActionId==='focus-0'));
  assert.equal(await page.getByRole('button',{name:'Заменить',exact:true}).count(),0);
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.equal(size.scroll,size.width);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,'liquid-glass-'+width+'.png'),fullPage:true});await page.close();
 }}finally{await browser.close();}
 console.log('PASS: existing cards, new category, counts, focus and no overflow at 800 / 440 px.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
