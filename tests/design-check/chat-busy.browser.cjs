// Built Apollo UI, mocked HTTP only; no real agent or Figma request.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createUiMainBridge}=require('../../src/design-check/ui-protocol');
(async()=>{
 const output=process.env.DESIGN_CHECK_QA_ROOT;if(!output)throw Error('Set DESIGN_CHECK_QA_ROOT');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:800,height:860}});page.setDefaultTimeout(10000);
  const errors=[],payloads=[];let mode='free';page.on('pageerror',e=>errors.push(e.message));
  const bridge=createUiMainBridge({storage:{getAsync:async()=>null,setAsync:async()=>{}},resize(){},post:value=>page.evaluate(message=>window.emitPlugin(message),value)});
  await page.exposeFunction('__chatBusyBridge',value=>bridge.accept(value));
  await page.addInitScript(()=>{window.emitPlugin=value=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:value}}));parent.postMessage=value=>{if(value.pluginMessage?.type==='design-check-ui-request')void window.__chatBusyBridge(value.pluginMessage);};});
  await page.route(/^https?:/,async route=>{
   const url=new URL(route.request().url());if(url.origin!=='http://localhost:3001')return route.abort();
   let status=200,body={};
   if(url.pathname==='/health')body={ok:true,proxy:{version:'fixture'},agent:{busy:mode==='preflight'||mode==='blocked'},capabilities:{dialoguePlatformRouting:true}};
   if(url.pathname==='/analyze'){
    payloads.push(JSON.parse(route.request().postData()));
    if(mode==='race'){mode='blocked';status=429;body={success:false,code:'APOLLO_AGENT_BUSY',error:'AI-агент уже обрабатывает другой запрос Apollo. Токены: всего 0.'};}
    else body={success:true,source:'codex',provider:'codex',dialogueLibrary:'abm',result:'Ответ fixture.'};
   }
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(pathToFileURL(path.resolve(__dirname,'../../dist/ui.html')).href);
  await page.locator('[title="Платформа"] button').first().click();await page.getByText('iOS',{exact:true}).click();
  await page.getByRole('button',{name:'Открыть чат с Apollo',exact:true}).click();
  const input=page.getByRole('textbox',{name:'Вопрос Apollo',exact:true}),send=page.getByRole('button',{name:'Отправить вопрос',exact:true});
  const question='Что гайды говорят про использование кнопок?';
  await input.fill(question);mode='preflight';await send.click();
  await page.locator('.apollo-chat-waiting').waitFor();
  assert.equal(await input.inputValue(),question);assert.equal(payloads.length,0);assert.equal(await page.locator('.user-msg').count(),0);assert(await send.isDisabled());
  await input.press('Enter');assert.equal(await input.inputValue(),question);assert.equal(payloads.length,0);
  mode='free';await page.waitForFunction(()=>!document.querySelector('button[aria-label="Отправить вопрос"]').disabled);
  assert.equal(payloads.length,0,'Polling must never submit automatically');
  mode='race';await send.click();await page.locator('.apollo-chat-waiting').waitFor();
  assert.equal(await input.inputValue(),question);assert.equal(payloads.length,1);assert.equal(await page.locator('.user-msg').count(),0);
  assert.equal(await page.locator('.design-check-error').count(),0);assert(!(await page.locator('.agent-conversation').innerText()).includes('Токены'));
  await page.screenshot({path:path.join(output,'busy-draft-retained.png')});
  await input.fill(question+' Ещё один пункт.');mode='free';await page.waitForFunction(()=>!document.querySelector('button[aria-label="Отправить вопрос"]').disabled);
  assert.equal(payloads.length,1);await send.click();await page.locator('.assistant-copy').waitFor();
  assert.equal(payloads.length,2);assert.deepEqual(payloads[1].dialogue,[]);assert.equal(await page.locator('.user-msg').count(),1);assert.equal(await input.inputValue(),'');assert.deepEqual(errors,[]);
  console.log('PASS: busy preflight and racing rejection retain the draft without duplicate history, errors, token footers or automatic retries.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
