// Reproduce Web -> ABM switching during a pending request in the built UI.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createUiMainBridge}=require('../../src/design-check/ui-protocol');
(async()=>{
 const output=process.env.DESIGN_CHECK_QA_ROOT;if(!output)throw Error('Set DESIGN_CHECK_QA_ROOT');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true});let release;
 try{
  const page=await browser.newPage({viewport:{width:800,height:860}});page.setDefaultTimeout(10000);
  const payloads=[],errors=[],failures=[];let serverBusy=false,started;
  const ready=new Promise(resolve=>{started=resolve;}),hold=new Promise(resolve=>{release=resolve;});
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',request=>{if(request.url().endsWith('/analyze'))failures.push(request.failure());});
  const bridge=createUiMainBridge({storage:{getAsync:async()=>null,setAsync:async()=>{}},resize(){},post:value=>page.evaluate(message=>window.emitPlugin(message),value)});
  await page.exposeFunction('__platformLockBridge',value=>bridge.accept(value));
  await page.addInitScript(()=>{window.emitPlugin=value=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:value}}));parent.postMessage=value=>{if(value.pluginMessage?.type==='design-check-ui-request')void window.__platformLockBridge(value.pluginMessage);};});
  await page.route(/^https?:/,async route=>{
   const url=new URL(route.request().url());if(url.origin!=='http://localhost:3001')return route.abort();
   let body={};
   if(url.pathname==='/health')body={ok:true,proxy:{version:'fixture'},agent:{busy:serverBusy},capabilities:{dialoguePlatformRouting:true}};
   if(url.pathname==='/analyze'){
    const payload=JSON.parse(route.request().postData());payloads.push(payload);
    if(payloads.length===1){serverBusy=true;started();await hold;serverBusy=false;}
    body={success:true,source:'codex',provider:'codex',dialogueLibrary:payload.dialoguePlatform==='Desktop'?'ab':'abm',result:payload.dialoguePlatform==='Desktop'?'Получен ответ Web.':'Получен ответ АБМ.'};
   }
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(pathToFileURL(path.resolve(__dirname,'../../dist/ui.html')).href);
  await page.getByRole('button',{name:'Открыть чат с Apollo',exact:true}).click();
  const picker=page.locator('[title="Платформа"] > button'),menu=page.getByRole('group',{name:'Платформа',exact:true});
  const input=page.getByRole('textbox',{name:'Вопрос Apollo',exact:true});
  await input.fill('Первый вопрос про Web');await picker.click();assert.equal(await menu.count(),1);
  await input.press('Enter');await ready;
  assert.equal(payloads[0].dialoguePlatform,'Desktop');assert(await picker.isDisabled());
  assert.equal(await picker.innerText(),'Desktop');assert.equal(await menu.count(),0);
  await picker.dispatchEvent('click');assert.equal(await menu.count(),0);assert.equal(payloads.length,1);
  assert(!(await page.locator('.agent-conversation').innerText()).includes('Ожидание ответа остановлено'));
  await page.screenshot({path:path.join(output,'platform-locked-during-web.png')});
  release();await page.getByText('Получен ответ Web.',{exact:true}).waitFor();
  assert.equal(await picker.isDisabled(),false);assert.deepEqual(failures,[]);
  await picker.click();await menu.getByRole('button',{name:'iOS',exact:true}).click();
  assert.equal(await picker.innerText(),'iOS');await input.fill('Второй вопрос про АБМ');await input.press('Enter');
  await page.getByText('Получен ответ АБМ.',{exact:true}).waitFor();
  assert.deepEqual(payloads.map(p=>p.dialoguePlatform),['Desktop','iOS']);assert.equal(await page.locator('.assistant-copy').count(),2);assert.equal(await page.locator('.design-check-error').count(),0);
  serverBusy=true;await page.waitForFunction(()=>document.querySelector('[title="Платформа"] > button').disabled);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#apollo-chat-screen').count(),0);
  serverBusy=false;await page.waitForFunction(()=>!document.querySelector('[title="Платформа"] > button').disabled);
  assert.equal(payloads.length,2,'Closing chat must not schedule a new request');assert.deepEqual(errors,[]);
  console.log('PASS: a pending Web response is preserved, platform selection is locked, and the next question switches to ABM after completion.');
 }finally{release?.();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
