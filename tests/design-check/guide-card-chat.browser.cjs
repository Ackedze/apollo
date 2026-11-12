// Actual built Apollo UI, synthetic HTTP reply; no Figma or model request.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createUiMainBridge}=require('../../src/design-check/ui-protocol');
const blocks=[{kind:'text',text:'Правило АБМ для выбранного сценария.\n\nПаттерн: «Хаптик», v.1.4'},
 {kind:'guide',family:'hig',text:'Дополнительная рекомендация HIG.\n\nГайд: HIG — [Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)'}];
(async()=>{
 const output=process.env.DESIGN_CHECK_QA_ROOT;if(!output)throw Error('Set DESIGN_CHECK_QA_ROOT to a private QA directory.');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:800,height:860}}),errors=[],requests=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const bridge=createUiMainBridge({storage:{getAsync:async()=>null,setAsync:async()=>{}},resize(){},post:value=>page.evaluate(message=>window.emitPlugin(message),value)});
  await page.exposeFunction('__guideUiBridge',value=>bridge.accept(value));
  await page.addInitScript(()=>{
   window.emitPlugin=value=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:value}}));
   parent.postMessage=value=>{if(value.pluginMessage?.type==='design-check-ui-request')void window.__guideUiBridge(value.pluginMessage);};
  });
  await page.route(/^https?:/,async route=>{
   const request=route.request(),url=new URL(request.url());let body;
   if(url.origin!=='http://localhost:3001'){await route.abort();return;}
   if(url.pathname==='/health')body={ok:true,proxy:{version:'fixture'},capabilities:{dialoguePlatformRouting:true}};
   else if(url.pathname==='/analyze'){
    const payload=JSON.parse(request.postData());requests.push(payload);assert.equal(payload.dialoguePlatform,'iOS');
    body={success:true,source:'codex',provider:'codex',dialogueLibrary:'abm',knowledgeRelease:'synthetic-guide-fixture',result:blocks.map(b=>b.text).join('\n\n'),answerBlocks:blocks};
   }else body={};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(pathToFileURL(path.resolve(__dirname,'../../dist/ui.html')).href);
  await page.locator('[title="Платформа"] button').first().click();await page.getByText('iOS',{exact:true}).click();
  await page.getByRole('button',{name:'Открыть чат с Apollo',exact:true}).click();
  await page.getByRole('textbox',{name:'Вопрос Apollo',exact:true}).fill('Как использовать хаптик?');
  await page.getByRole('button',{name:'Отправить вопрос',exact:true}).click();
  await page.locator('.assistant-copy').waitFor();
  assert.equal(requests.length,1);
  const answer=page.locator('.assistant-copy'),card=answer.locator('.apollo-guide-recommendations');
  assert.equal(await card.count(),1,'The actual assistant message must render a guide disclosure.');
  assert.equal(await page.locator('.user-msg .apollo-guide-recommendations').count(),0);
  assert.equal(await card.evaluate(node=>node.open),false);
  assert((await answer.innerText()).includes('Правило АБМ'));
  await page.screenshot({path:path.join(output,'chat-guide-collapsed.png')});
  await card.locator('summary').focus();await page.keyboard.press('Enter');
  assert.equal(await card.evaluate(node=>node.open),true);
  assert.equal(await card.getByRole('link',{name:'Playing haptics',exact:true}).getAttribute('href'),'https://developer.apple.com/design/human-interface-guidelines/playing-haptics');
  await page.screenshot({path:path.join(output,'chat-guide-expanded.png')});
  await page.keyboard.press('Space');assert.equal(await card.evaluate(node=>node.open),false);
  assert.deepEqual(errors,[]);console.log('PASS: built Apollo sends iOS, keeps the user message plain, and shows the guide disclosure in the assistant answer.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
