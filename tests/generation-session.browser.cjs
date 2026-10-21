// Synthetic bridge and planner; persistence tests never execute Figma or frontend.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {fixture}=require("../packages/generation-core/tests/planning-fixtures.cjs");const {contractHash:hash}=require("../dist/runtime.cjs");
function plan(body){const spec=fixture().spec;spec.id='synthetic-persisted';spec.platform=body.input.platform;spec.viewport=body.input.viewport;
 const result={schemaVersion:'apollo.v4-prompt-plan.v1-experimental',requestId:body.requestId,status:'draft',executionAllowed:false,inputHash:hash(body.input),contextHash:hash('context'),contracts:[{componentId:'synthetic',revision:1,manualSourceHash:hash('manual'),archiveSha256:hash('zip'),sourceStatus:'draft'}],spec,specHash:hash(spec)};result.resultHash=hash(result);return{success:true,result};}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const output=process.env.APOLLO_SESSION_SCREENSHOT_DIR||'/private/tmp/apollo-generation-session';fs.mkdirSync(output,{recursive:true});
 try{for(const width of [800]){
  const page=await browser.newPage(),errors=[],writes=[],requests=[];let stored=null,fail=false,hold=false,releaseLoad;
  page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('syntheticSessionBridge',async m=>{
   requests.push(m);
   if(m.type==='design-check-ui-request')return{type:'design-check-ui-result',schemaVersion:m.schemaVersion,requestId:m.requestId,operation:m.operation,result:m.operation==='resize'?{width:m.payload.compact?400:800,height:860}:null};
   if(m.type!=='generation-session-request')return null;
   const reply={type:'generation-session-result',schemaVersion:m.schemaVersion,requestId:m.requestId,operation:m.operation};
   if(m.operation==='load'){const value=stored;if(hold)await new Promise(resolve=>releaseLoad=resolve);reply.result=value;}
   else if(fail)reply.error='GENERATION_SESSION_STORAGE_FAILED';
   else{stored=m.payload;writes.push(stored);reply.result=true;}
   return reply;
  });
  await page.addInitScript(()=>{parent.postMessage=m=>{void window.syntheticSessionBridge(m.pluginMessage).then(reply=>{if(reply)window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:reply}}));});};});
  await page.route('http://localhost:3001/generation/plan',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(plan(route.request().postDataJSON()))}));
  await page.setViewportSize({width,height:860});await page.goto(pathToFileURL(path.resolve(__dirname,"../dist/ui.html")).href);
  await page.getByRole('button',{name:'Генерация',exact:true}).click();await page.locator('#generation-prompt').fill('Synthetic two rows.');await page.locator('#generation-plan-prompt').click();
  await page.waitForFunction(()=>document.getElementById('generation-spec-json').textContent.includes('synthetic-persisted'));
  await page.locator('#generation-prompt').fill('Unsent refinement');await page.locator('#generation-settings-toggle').click();await page.locator('#generation-height').fill('1000');await page.keyboard.press('Escape');
  await page.waitForTimeout(350);assert.equal(stored.composer,'Unsent refinement');assert.equal(stored.viewport.height,'1000');assert.doesNotMatch(JSON.stringify(stored),/sessionId|resultHash|executionAllowed|verificationEvidence/);
  await page.reload();await page.getByRole('button',{name:'Генерация',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('generation-session-status').textContent.includes('История восстановлена'));
  assert.equal(await page.locator('#generation-chat-log article').count(),2);assert.equal(await page.locator('#generation-prompt').inputValue(),'Unsent refinement');assert.equal(await page.locator('#generation-height').inputValue(),'1000');
  assert.match(await page.locator('#generation-spec-json').textContent(),/synthetic-persisted/);assert.equal(await page.locator('#generation-prepare').isDisabled(),true);assert.equal(await page.locator('#generation-execute').isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,'restored-'+width+'.png'),fullPage:true});
  fail=true;await page.locator('#generation-prompt').fill('Kept after storage failure');await page.waitForFunction(()=>document.getElementById('generation-session-status').textContent.includes('Не удалось сохранить'));
  assert.equal(await page.locator('#generation-chat-log article').count(),2);assert.equal(await page.locator('#generation-prompt').inputValue(),'Kept after storage failure');assert.equal(stored.composer,'Unsent refinement');
  fail=false;hold=true;releaseLoad=null;await page.reload();await page.getByRole('button',{name:'Генерация',exact:true}).click();
  await page.locator('#generation-prompt').fill('New input before late restoration');
  for(let i=0;i<50&&!releaseLoad;i++)await page.waitForTimeout(10);assert(releaseLoad);hold=false;releaseLoad();await page.waitForTimeout(350);
  assert.equal(await page.locator('#generation-prompt').inputValue(),'New input before late restoration');assert.equal(await page.locator('#generation-chat-log article').count(),2);
  await page.locator('#generation-plan-prompt').click();await page.waitForFunction(()=>document.getElementById('generation-spec-json').textContent.includes('synthetic-persisted'));
  await page.locator('#generation-settings-toggle').click();await page.locator('#generation-chat-reset').click();await page.waitForTimeout(50);assert.equal(stored.conversation.messages.length,0);assert.equal(stored.conversation.draft,null);
  await page.reload();await page.getByRole('button',{name:'Генерация',exact:true}).click();await page.waitForTimeout(50);assert.equal(await page.locator('#generation-chat-log article').count(),0);assert.equal(await page.locator('#generation-spec-export').isDisabled(),true);
  assert(!requests.some(m=>['generation-prepare','generation-execute'].includes(m.type)));assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Generation persistence: reload/composer/viewport, Draft-only restoration, storage failure, late-load race, reset and no target writes PASS at 800×860px.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
