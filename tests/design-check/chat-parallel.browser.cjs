// Built UI with mocked busy generation and HTTP; no real agent or Figma calls.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createUiMainBridge}=require('../../src/design-check/ui-protocol');
const requirements=require('../../src/compatibility-requirements.json');
(async()=>{
 const output=process.env.DESIGN_CHECK_QA_ROOT;if(!output)throw Error('Set DESIGN_CHECK_QA_ROOT');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const results=[];
 try{for(const width of [800]){
  const page=await browser.newPage({viewport:{width,height:860}});page.setDefaultTimeout(15000);
  const errors=[],posts=[],held=[];let legacy=false,chatBusy=false,complete=false,postStarted;const started=new Promise(resolve=>{postStarted=resolve;});
  page.on('pageerror',e=>errors.push(e.message));
  const bridge=createUiMainBridge({storage:{getAsync:async()=>null,setAsync:async()=>{}},resize(){},post:value=>page.evaluate(message=>window.emitPlugin(message),value)});
  await page.exposeFunction('__parallelBridge',value=>bridge.accept(value));
  await page.addInitScript(()=>{window.emitPlugin=value=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:value}}));parent.postMessage=value=>{if(value.pluginMessage?.type==='design-check-ui-request')void window.__parallelBridge(value.pluginMessage);};});
  await page.route(/^https?:/,async route=>{
   const url=new URL(route.request().url());if(url.origin!=='http://localhost:3001')return route.abort();let body={};
   if(url.pathname==='/health')body={ok:true,proxy:{version:'1.4.55'},capabilities:{dialoguePlatformRouting:true,...(!legacy?{parallelDialogue:true}:{})},...(!legacy?{dialogue:{busy:chatBusy,cancelScope:'server-request'}}:{}),agent:{busy:true},generation:{busy:true},compatibility:{protocolVersion:requirements.protocolVersion,data:{state:'ready',version:'a'.repeat(64),schemaVersion:requirements.dataSchemaVersion,profileVersion:requirements.dataProfiles.at(-1),deliveryProfile:requirements.deliveryProfile,generatedAt:requirements.minDataGeneratedAt}}};
   if(url.pathname==='/analyze'){
    posts.push(JSON.parse(route.request().postData()));postStarted();
    if(!complete){chatBusy=true;held.push(route);return;}
    body={success:true,result:'Ответ в чате получен. Навык продолжает работу.',source:'codex',provider:'codex',dialogueLibrary:'ab'};
   }
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(pathToFileURL(process.env.APOLLO_UI_FILE||path.resolve(__dirname,'../../dist/ui.html')).href);
  await page.getByRole('button',{name:'Открыть чат с Apollo',exact:true}).click();
  const input=page.getByRole('textbox',{name:'Вопрос Apollo',exact:true}),send=page.getByRole('button',{name:'Отправить вопрос',exact:true});
  await input.fill('Вопрос, пока навык занят');await send.waitFor();const bounds=await send.boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width);await send.click();
  const stop=page.getByRole('button',{name:'Остановить ответ',exact:true});await stop.waitFor();await started;assert.equal(posts.length,1);assert.equal(await input.isDisabled(),true);await stop.click();
  await page.getByText('Останавливаем ответ. Другие задачи продолжат работу.',{exact:true}).waitFor();
  for(const route of held.splice(0))await route.abort().catch(()=>{});chatBusy=false;
  await input.fill('Следующий независимый вопрос');await page.waitForFunction(()=>!document.querySelector('button[aria-label="Отправить вопрос"]').disabled);complete=true;await input.press('Enter');await page.getByText('Ответ в чате получен. Навык продолжает работу.',{exact:true}).waitFor();assert.equal(posts.length,2);
  await page.screenshot({path:path.join(output,'parallel-chat-'+width+'.png')});
  legacy=true;await input.fill('Сохранённый вопрос для старого Proxy');await page.locator('.apollo-chat-waiting').waitFor();assert(await send.isDisabled());assert.equal(posts.length,2);assert.equal(await input.inputValue(),'Сохранённый вопрос для старого Proxy');
  assert.deepEqual(errors,[]);results.push({width,posts:posts.length,chatDuringBusySkill:true,independentStop:true,legacyFallback:true,pageErrors:0});await page.close();
 }}finally{await browser.close();}
 fs.writeFileSync(path.join(output,'browser-result.json'),JSON.stringify({scope:'Mock HTTP and UI bridge, no real model or Figma',results},null,2)+'\n');console.log(JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1;});
