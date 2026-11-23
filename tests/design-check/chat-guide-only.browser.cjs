// Built Apollo UI, synthetic source-bound replies; no model calls.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createUiMainBridge}=require('../../src/design-check/ui-protocol');
const requirements=require('../../src/compatibility-requirements.json');
const compatibility={protocolVersion:requirements.protocolVersion,data:{state:'ready',version:'a'.repeat(64),schemaVersion:requirements.dataSchemaVersion,profileVersion:requirements.dataProfiles[0],deliveryProfile:requirements.deliveryProfile,generatedAt:requirements.minDataGeneratedAt}};
(async()=>{
 const output=process.env.DESIGN_CHECK_QA_ROOT;if(!output)throw Error('Set DESIGN_CHECK_QA_ROOT');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:800,height:860}});page.setDefaultTimeout(10000);const errors=[],payloads=[];page.on('pageerror',e=>errors.push(e.message));
  const bridge=createUiMainBridge({storage:{getAsync:async()=>null,setAsync:async()=>{}},resize(){},post:value=>page.evaluate(message=>window.emitPlugin(message),value)});
  await page.exposeFunction('__guideOnlyBridge',value=>bridge.accept(value));
  await page.addInitScript(()=>{window.emitPlugin=value=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:value}}));parent.postMessage=value=>{if(value.pluginMessage?.type==='design-check-ui-request')void window.__guideOnlyBridge(value.pluginMessage);};});
  await page.route(/^https?:/,async route=>{
   const url=new URL(route.request().url());if(url.origin!=='http://localhost:3001')return route.abort();let body={};
   if(url.pathname==='/health')body={ok:true,agent:{busy:false},proxy:{version:requirements.minProxyVersion},compatibility,capabilities:{dialoguePlatformRouting:true}};
   if(url.pathname==='/analyze'){
    const payload=JSON.parse(route.request().postData());payloads.push(payload);
    const text='**Подпись кнопки описывает действие.**\n\nГайд: HIG — [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)';
    const library=['iOS','Android'].includes(payload.dialoguePlatform)?'abm':'ab';
    const blocks=library==='ab'?[{kind:'text',text:'Ответ АБ.'}]:payloads.length===1?[{kind:'text',text}]:[{kind:'guide',family:'hig',text}];
    blocks.push({kind:'text',text:'*Токены: всего 120 · вход 100 (из них кеш: 0) · выход 20.*'});
    body={success:true,source:'codex',provider:'codex',dialogueLibrary:library,knowledgeRelease:{contentVersion:'fixture',source:library==='abm'?'ds-ai-hub-abm':'ds-ai-hub'},result:blocks.map(b=>b.text).join('\n\n'),answerBlocks:blocks};
   }
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(pathToFileURL(path.resolve(__dirname,'../../dist/ui.html')).href);
  await page.locator('[title="Платформа"] > button').click();await page.getByRole('group',{name:'Платформа',exact:true}).getByRole('button',{name:'iOS',exact:true}).click();
  await page.getByRole('button',{name:'Открыть чат с Apollo',exact:true}).click();
  const input=page.getByRole('textbox',{name:'Вопрос Apollo',exact:true}),send=page.getByRole('button',{name:'Отправить вопрос',exact:true});
  await input.fill('Что HIG говорит про подпись кнопки?');await send.click();await page.locator('.assistant-copy').waitFor();
  const first=page.locator('.assistant-copy').first();assert.equal(await first.locator('.apollo-guide-recommendations').count(),0);
  assert.equal(await first.locator('.apollo-answer-inline-guide').count(),1);
  assert((await first.locator('.apollo-guide-recommendations__source').innerText()).startsWith('Гайд: HIG'));
  assert.equal(await first.getByRole('link',{name:'Buttons',exact:true}).getAttribute('href'),'https://developer.apple.com/design/human-interface-guidelines/buttons');
  assert.equal(await first.locator('.apollo-guide-recommendations__source .md-p').evaluate(node=>getComputedStyle(node).fontSize),'13px');
  assert.equal(await first.locator('.design-check-provenance').count(),0);
  await first.locator('.apollo-answer-details > summary').click();
  assert((await first.locator('.apollo-answer-details').innerText()).includes('всего 120'));
  await page.waitForTimeout(250);await page.screenshot({path:path.join(output,'guide-only-inline.png')});
  await input.fill('Как назвать кнопку?');await send.click();await page.waitForFunction(()=>document.querySelectorAll('.assistant-copy').length===2);
  const card=page.locator('.assistant-copy').last().locator('.apollo-guide-recommendations');assert.equal(await card.count(),1);assert.equal(await card.evaluate(node=>node.open),false);
  assert.equal(payloads.length,2);assert(payloads.every(p=>p.dialoguePlatform==='iOS'));assert.deepEqual(errors,[]);
  await page.locator('[title="Платформа"] > button').click();
  await page.getByRole('group',{name:'Платформа',exact:true}).getByRole('button',{name:'Desktop',exact:true}).click();
  await input.fill('Вопрос по АБ');await send.click();
  await page.waitForFunction(()=>document.querySelectorAll('.assistant-copy').length===3);
  const ab=page.locator('.assistant-copy').last();
  assert.equal(await ab.locator('.design-check-provenance').count(),1);
  assert.equal(await first.locator('.design-check-provenance').count(),0);
  await ab.locator('.apollo-answer-details > summary').click();
  assert((await ab.locator('.design-check-provenance').innerText()).includes('Агент: Codex'));
  await page.screenshot({path:path.join(output,'abm-hidden-ab-preserved.png')});
  console.log('PASS: explicit guide replies stay inline with verified links; ordinary fallback replies retain the collapsed guide card.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
