// Actual built Apollo UI, synthetic HTTP reply; no Figma or model request.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createUiMainBridge}=require('../../src/design-check/ui-protocol');
const blocks=[{kind:'text',text:'**как использовать хаптик.**',questionHeading:true},{kind:'text',text:'**Правило АБМ для выбранного сценария.**\n\n- Сохрани условие.\n- Сохрани исключение.\n\n🍏 [Пример](https://example.test/ios) · 🤖 [Пример](https://example.test/android)\n\n**Второе правило АБМ.**\n\n🍏 [Пример](https://example.test/second)\n\nПаттерн: «Хаптик», v.1.4'},
 {kind:'text',text:'**другой вопрос про поля**',questionHeading:true},
 {kind:'text',text:'Правило другого паттерна.\n\nПаттерн: «Поля ввода», v.2.3'},
 {kind:'guide',family:'hig',question:'отдельный вопрос без ответа паттерна',text:'Дополнительная рекомендация HIG.\n\nГайд: HIG — [Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)'},
 {kind:'guide',family:'material2',question:'отдельный вопрос без ответа паттерна',text:'Дополнительная рекомендация Material 2.\n\nГайд: Material 2 — [Android haptics](https://m2.material.io/design/platform-guidance/android-haptics.html)'},
 {kind:'text',text:'*Токены: всего 1 200 · вход 1 000 (из них кеш: 800) · выход 200.*'}];
const requirements=require('../../src/compatibility-requirements.json');
const compatibility={protocolVersion:requirements.protocolVersion,data:{state:'ready',version:'a'.repeat(64),schemaVersion:requirements.dataSchemaVersion,profileVersion:requirements.dataProfiles[0],deliveryProfile:requirements.deliveryProfile,generatedAt:requirements.minDataGeneratedAt}};
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
   if(url.pathname==='/health')body={ok:true,proxy:{version:requirements.minProxyVersion},compatibility,capabilities:{dialoguePlatformRouting:true}};
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
  assert.equal(await answer.locator('h2,.apollo-answer-kicker').count(),0);
  assert.equal(await answer.locator('.apollo-answer-question').first().textContent(),'Как использовать хаптик?');
  assert.equal(await answer.locator('.apollo-answer-separator').count(),1);
  assert.equal(await card.locator('summary').innerText(),'Рекомендации из гайдов');
  assert.equal(await card.locator('.apollo-guide-recommendations__families').count(),0);
  assert.equal(await answer.locator('.apollo-answer-question .md-p').first().evaluate(node=>getComputedStyle(node).fontSize),'16px');
  assert.equal(await answer.locator('.apollo-answer-rule .md-p').first().evaluate(node=>getComputedStyle(node).fontSize),'14px');
  assert.equal(await answer.locator('.apollo-answer-rule strong').first().evaluate(node=>getComputedStyle(node).fontSize),'14px');
  assert.equal(await answer.locator('.apollo-answer-rule').count(),3);
  assert.equal(await answer.locator('.apollo-answer-rule li').count(),2);
  assert.equal(await answer.getByRole('link',{name:'Пример',exact:true}).count(),3);
  const metadata=answer.locator('.apollo-answer-details');
  assert.equal(await metadata.evaluate(node=>node.open),false);
  assert.equal(await metadata.getByText('Агент:',{exact:false}).isVisible(),false);
  assert((await metadata.textContent()).includes('всего 1 200'));
  await page.locator('.agent-conversation').evaluate(node=>node.scrollTop=0);
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(output,'chat-guide-collapsed.png')});
  await card.locator('summary').focus();await page.keyboard.press('Enter');
  assert.equal(await card.evaluate(node=>node.open),true);
  assert.equal(await card.locator('h4').first().evaluate(node=>getComputedStyle(node).fontSize),'16px');
  assert.equal(await card.getByRole('link',{name:'Playing haptics',exact:true}).getAttribute('href'),'https://developer.apple.com/design/human-interface-guidelines/playing-haptics');
  await card.scrollIntoViewIfNeeded();await page.waitForTimeout(250);
  await page.screenshot({path:path.join(output,'chat-guide-expanded.png')});
  await page.keyboard.press('Space');assert.equal(await card.evaluate(node=>node.open),false);
  await metadata.locator('summary').focus();await page.keyboard.press('Enter');
  assert.equal(await metadata.evaluate(node=>node.open),true);
  assert.equal(await metadata.getByText('Агент:',{exact:false}).isVisible(),true);
  assert.equal(await metadata.getByText('Токены:',{exact:false}).isVisible(),true);
  assert.deepEqual(errors,[]);console.log('PASS: built Apollo sends iOS, keeps the user message plain, and shows the guide disclosure in the assistant answer.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
