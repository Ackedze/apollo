// Built UI regression with synthetic planner replies; no real agent or target writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {fixture}=require("../packages/generation-core/tests/planning-fixtures.cjs");
const {contractHash:hash}=require("../dist/runtime.cjs");
const agentProtocol=require("../dist/agent-protocol.cjs");
function response(body,version){
 const spec=fixture().spec;spec.id='synthetic-version-'+version;spec.platform=body.input.platform;spec.viewport=body.input.viewport;
 spec.schemaVersion='apollo.screen-spec.v2-experimental';spec.capabilityGaps=version===1?[{code:'SYNTHETIC_PORT_UNAVAILABLE',message:'Synthetic collection port unavailable.'}]:[];
 spec.unresolved=version===1?['Synthetic product clarification.']:[];
 const result={schemaVersion:'apollo.v4-prompt-plan.v1-experimental',requestId:body.requestId,status:'draft',executionAllowed:false,inputHash:hash(body.input),contextHash:hash('synthetic-context'),contracts:[{componentId:'synthetic-content',revision:1,manualSourceHash:hash('manual'),archiveSha256:hash('zip'),sourceStatus:'draft'}],spec,specHash:hash(spec)};
 result.resultHash=hash(result);return {success:true,result};
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const output=process.env.APOLLO_PROMPT_CHAT_SCREENSHOT_DIR||'/private/tmp/apollo-prompt-chat';fs.mkdirSync(output,{recursive:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function waitForPlan(marker){
   await page.waitForFunction(marker=>document.getElementById('generation-spec-json').textContent.includes(marker)||/\([A-Z_]+\)/.test(document.getElementById('generation-status').textContent),marker);
   assert((await page.locator('#generation-spec-json').textContent()).includes(marker),await page.locator('#generation-status').textContent());
  }
  for(const width of [800]){
   let mode='ok',pending,version=0,requests=[],agentRequests=[],runSequence=0;
   await page.route('http://localhost:3001/agent/**',route=>{
    if(route.request().url().endsWith('/mcp/status'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,method:'mcp',configured:false})});
    const body=route.request().postDataJSON();agentRequests.push({url:route.request().url(),body});
    if(route.request().url().endsWith('/drafts')){
     const identity={runId:'synthetic-chat-'+(++runSequence),revision:body.version.revision,specHash:body.version.specHash,contextHash:hash('synthetic-agent-context'),target:body.target};
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,identity,version:body.version})});
    }
    const run={schemaVersion:'apollo.agent-run-snapshot.v1',identity:body,sequence:1,status:'completed',capabilities:['workspace.files'],progress:[{sequence:1,kind:'check',message:'Synthetic build check.'}],pendingOperation:null,result:{message:'Synthetic screen created.',artifact:{id:'a'.repeat(32),entryPath:'dist/index.html',files:[{path:'dist/index.html',sha256:hash('synthetic-artifact'),bytes:100}]},checks:[{id:'synthetic-check',status:'unknown',origin:'synthetic',message:'Synthetic check only.',evidenceHash:null}],writesPerformed:false,acceptedWriteOperations:[],Ready:false},gaps:[]};
    run.snapshotHash=hash(run);assert(agentProtocol.validPublicSnapshot(run,body));
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,run})});
   });
   await page.addInitScript(()=>{
    window.bridgeMessages=[];parent.postMessage=message=>{
     const m=message.pluginMessage;window.bridgeMessages.push(m);let reply;
     if(m.type==='generation-session-request')reply={type:'generation-session-result',schemaVersion:m.schemaVersion,requestId:m.requestId,operation:m.operation,result:m.operation==='load'?null:true};
     if(m.type==='agent-draft-storage')reply={type:'agent-draft-storage-result',requestId:m.requestId,draft:m.operation==='save'?m.draft:null};
     if(reply)setTimeout(()=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:reply}})),0);
    };
   });
   await page.route('http://localhost:3001/generation/plan',async route=>{
    const body=route.request().postDataJSON();requests.push(body);
    if(mode==='error'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,code:'PROMPT_PROXY_UNAVAILABLE'})});return;}
    if(mode==='wait'){pending=()=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response(body,++version))}).catch(()=>{});return;}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response(body,++version))});
   });
   await page.setViewportSize({width,height:860});await page.goto(pathToFileURL(path.resolve(__dirname,"../dist/ui.html")).href);
   await page.getByRole('button',{name:'Генерация',exact:true}).click();
   assert.equal(await page.locator('#generation-settings').isHidden(),true);
   assert.equal(await page.locator('#generation-review').isHidden(),true);
   assert.equal(await page.locator('.agent-generation').isHidden(),true);
   assert((await page.locator('#generation-prompt').boundingBox()).height<60);
   await page.screenshot({path:path.join(output,'empty-800.png')});
   await page.locator('#generation-settings-toggle').click();
   assert.equal(await page.locator('#generation-settings-toggle').getAttribute('aria-expanded'),'true');
   assert.equal(await page.locator('#generation-tools').evaluate(n=>n.open),false);
   assert.equal(await page.locator('#agent-generation-target').isHidden(),true);assert.equal(await page.locator('#generation-target-holder .generation-picker-button').isVisible(),true);assert.equal(await page.locator('#agent-generation-target').inputValue(),'figma-owned');
   const settingsBox=await page.locator('#generation-settings').boundingBox();
   assert(settingsBox.x>=56&&settingsBox.y>=0&&settingsBox.x+settingsBox.width<=800&&settingsBox.y+settingsBox.height<=860);
   await page.screenshot({path:path.join(output,'settings-800.png')});
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#generation-settings').isHidden(),true);
   assert.equal(await page.locator('#generation-settings-toggle').evaluate(n=>n===document.activeElement),true);
   await page.locator('#generation-prompt').fill('Synthetic screen with two rows; labels may be placeholders; no actions.');
   assert.equal(await page.locator('#generation-prompt').evaluate(n=>n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}))),true);
   assert.equal(requests.length,0);
   await page.locator('#generation-prompt').press('Shift+Enter');
   assert.equal(requests.length,0);assert.match(await page.locator('#generation-prompt').inputValue(),/\n$/);
   await page.locator('#generation-prompt').press('Enter');await waitForPlan('synthetic-version-1');
   assert.equal(await page.locator('#generation-chat-log article').count(),2);
   assert.equal(await page.getByRole('heading',{name:'Вопросы к описанию экрана',exact:true}).count(),1);assert.equal(await page.getByRole('heading',{name:'Ограничения генератора',exact:true}).count(),1);
   assert.equal(await page.locator('#generation-prompt').inputValue(),'');
   const first=await page.locator('#generation-spec-json').textContent();
   await page.locator('#generation-prompt').fill('Keep the second row unchanged; set vertical spacing to 24 px.');
   assert.equal(await page.locator('#generation-spec-json').textContent(),first);
   assert.equal(await page.locator('#generation-spec-preview').isVisible(),false);
   assert.equal(await page.locator('#generation-spec-export').isEnabled(),true);
   assert.equal(await page.locator('#generation-prepare').isDisabled(),true);
   assert.equal(await page.locator('#generation-execute').isDisabled(),true);
   await page.getByRole('button',{name:'Проверка',exact:true}).click();await page.getByRole('button',{name:'Генерация',exact:true}).click();
   assert.equal(await page.locator('#generation-prompt').inputValue(),'Keep the second row unchanged; set vertical spacing to 24 px.');
   await page.locator('#generation-plan-prompt').focus();await page.keyboard.press('Enter');
   await waitForPlan('synthetic-version-2');
   assert.equal(await page.locator('#generation-chat-log article').count(),4);
   assert.match(requests[1].input.prompt,/Synthetic screen with two rows/);assert.match(requests[1].input.prompt,/vertical spacing to 24 px/);assert.match(requests[1].input.prompt,/synthetic-version-1/);
   const versions=await page.locator('#generation-chat-log pre').allTextContents();assert.match(versions[0],/synthetic-version-1/);assert.match(versions[1],/synthetic-version-2/);
   assert.equal(await page.locator('#generation-prepare').isEnabled(),true);
   await page.waitForFunction(()=>!document.getElementById('agent-generation-start').disabled);
   assert.equal(agentRequests.filter(r=>r.url.endsWith('/runs')).length,0);
   await page.locator('#agent-generation-start').click();
   await page.waitForFunction(()=>document.getElementById('agent-generation-result').textContent.includes('Synthetic screen created.'));
   assert.equal(await page.locator('#agent-generation-result a').isVisible(),true);
   assert.equal(await page.locator('#agent-generation-details').evaluate(n=>n.open),false);
   assert.match(await page.locator('#agent-generation-checks').textContent(),/unknown/);
   await page.screenshot({path:path.join(output,'result-800.png')});
   await page.locator('#generation-chat-log').evaluate(node=>{node.scrollTop=0;node.scrollIntoView({block:'start'});});
   await page.screenshot({path:path.join(output,'chat-history-'+width+'.png'),fullPage:true});
   await page.locator('#generation-conversation').evaluate(n=>{n.scrollTop=0;n.dispatchEvent(new Event('scroll'));});
   mode='error';await page.locator('#generation-prompt').fill('Try another refinement.');
   await page.waitForTimeout(30);assert.equal(await page.locator('#generation-conversation').evaluate(n=>n.scrollTop),0);
   await page.locator('#generation-plan-prompt').click();
   await page.waitForFunction(()=>document.getElementById('generation-status').textContent.includes('PROMPT_PROXY_UNAVAILABLE'));
   assert.match(await page.locator('#generation-spec-json').textContent(),/synthetic-version-2/);
   assert.equal(await page.locator('#generation-chat-log article').count(),6);
   mode='wait';await page.locator('#generation-prompt').fill('Cancelled refinement.');await page.locator('#generation-plan-prompt').click();await page.waitForFunction(()=>!document.getElementById('generation-prompt-cancel').hidden);
   assert.equal(await page.locator('#generation-chat-pending').isVisible(),true);
   assert.equal(await page.locator('#generation-prompt').inputValue(),'');
   for(let attempt=0;attempt<100&&!pending;attempt++)await page.waitForTimeout(10);
   assert(pending,'Planner request was not received');
   await page.locator('#generation-prompt-cancel').click();await pending();await page.waitForTimeout(30);
   assert.match(await page.locator('#generation-spec-json').textContent(),/synthetic-version-2/);
   assert.equal(await page.locator('#generation-chat-log article').count(),8);
   assert.equal(await page.locator('#generation-chat-log').getAttribute('aria-busy'),'false');
   assert.equal(await page.locator('#generation-chat-pending').isVisible(),false);
   assert.equal(await page.evaluate(()=>window.bridgeMessages.some(m=>['generation-prepare','generation-execute'].includes(m.type))),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(output,'chat-'+width+'.png'),fullPage:true});
   await page.locator('#generation-settings-toggle').click();await page.locator('#generation-chat-reset').click();
   assert.equal(await page.locator('#generation-chat-log article').count(),0);assert.equal(await page.locator('#generation-chat-empty').isVisible(),true);
   assert.equal(await page.locator('#generation-spec-export').isDisabled(),true);assert.equal(await page.locator('#generation-prompt').evaluate(n=>n===document.activeElement),true);
   await page.unroute('http://localhost:3001/generation/plan');
   await page.unroute('http://localhost:3001/agent/**');
  }
  assert.deepEqual(errors,[]);console.log('Generation chat: compact composer/settings, keyboard, contextual agent result, history/versions, navigation, typed failure, cancellation/late reply and reset passed at 800×860px; synthetic replies, no actual target writes.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
