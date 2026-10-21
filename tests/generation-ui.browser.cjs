const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {fixture}=require("../packages/generation-core/tests/planning-fixtures.cjs");
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try {const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://localhost:3001/agent/**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,code:'AGENT_PROXY_UNAVAILABLE'})}));
 for(const width of [800]) {
  await page.route('http://localhost:3001/generation/context',route=>route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({success:false,code:'SOURCE_COMPILE',error:'SOURCE_COMPILE'})}));
  await page.setViewportSize({width,height:860});await page.goto(pathToFileURL(path.resolve(__dirname,"../dist/ui.html")).href);
  await page.getByRole('button', { name: 'Генерация', exact: true }).click();
   await page.locator('#generation-settings-toggle').click();await page.locator('#generation-tools > summary').click();
  await page.evaluate(()=>{window.bridgeMessages=[];parent.postMessage=m=>window.bridgeMessages.push(m.pluginMessage);});
  assert.equal(await page.locator('#generation-prepare').isDisabled(),true);
  const drop = async files => page.evaluate(files => {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(new File([file.text],file.name,{type:'application/json'}));
    const zone = document.getElementById('generation-dropzone');
    zone.dispatchEvent(new DragEvent('dragenter',{dataTransfer:transfer,bubbles:true,cancelable:true}));
    const highlighted = zone.classList.contains('is-dragging');
    const prevented = !zone.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
    return {highlighted,prevented,cleared:!zone.classList.contains('is-dragging')};
  },files);
  assert.deepEqual(await drop([{name:'dropped-screen.json',text:JSON.stringify(fixture().spec)}]),{highlighted:true,prevented:true,cleared:true});
  await page.waitForFunction(()=>!document.getElementById('generation-prepare').disabled);
  assert.equal(await page.locator('#generation-name').innerText(),'dropped-screen.json');
  for (const [files,message] of [
    [[{name:'screen.txt',text:'{}'}],/JSON-файлом/],
    [[{name:'broken.json',text:'{'}],/некорректный JSON/],
    [[{name:'large.json',text:' '.repeat(1024*1024+1)}],/больше 1 МБ/],
    [[{name:'one.json',text:'{}'},{name:'two.json',text:'{}'}],/один JSON-файл/],
  ]) {
    await drop(files);
    await page.waitForFunction(()=>document.getElementById('generation-dropzone').getAttribute('aria-disabled')==='false');
    assert.match(await page.locator('#generation-status').innerText(),message);
    assert.equal(await page.locator('#generation-prepare').isDisabled(),true);
    assert.equal(await page.locator('#generation-execute').isDisabled(),true);
    assert.equal(await page.locator('#generation-name').innerText(),'Спецификация не загружена');
  }
  assert.equal(await page.evaluate(()=>{
    const transfer=new DataTransfer();transfer.items.add(new File(['{}'],'outside.json'));
    return !document.body.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
  }),true);
  await page.locator('#generation-spec-file').setInputFiles({name:'synthetic-screen.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture().spec))});
  await page.waitForFunction(()=>!document.getElementById('generation-prepare').disabled);
  await page.locator('#generation-prepare').click();const request=await page.evaluate(()=>window.bridgeMessages.at(-1));
  assert.equal(request.type,'generation-prepare');assert.equal(request.spec.platform,'desktop');
  assert.equal((await drop([{name:'ignored.json',text:'{}'}])).highlighted,false);
  assert.equal(await page.locator('#generation-name').innerText(),'synthetic-screen.json');
  assert.equal(await page.evaluate(()=>window.bridgeMessages.at(-1).type),'generation-prepare');
  await page.evaluate(spec=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:{type:'generation-context-request',requestId:'generation-context:1',spec}}})),fixture().spec);
  await page.waitForFunction(()=>window.bridgeMessages.some(m=>m.type==='generation-context-response'));
  const response=await page.evaluate(()=>window.bridgeMessages.find(m=>m.type==='generation-context-response'));
  assert.equal(response.requestId,'generation-context:1');assert.equal(response.code,'SOURCE_COMPILE');
  const result={status:'blocked',sessionId:'',schemaAccepted:true,apiAvailability:'unverified',sourceReadiness:'blocked',preflight:null,executionPorts:{figma:'unavailable',frontend:'unavailable'},receipts:[],diagnostics:[{code:'SOURCE_COMPILE',stage:'source',message:'Source gate'}]};
  await page.evaluate(({request,result})=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:{type:'generation-result',requestId:request.requestId,result}}})),{request,result});
  assert.match(await page.locator('#generation-stages').innerText(),/Code API: ещё не подтверждён/);
  assert.match(await page.locator('#generation-diagnostics').innerText(),/SOURCE_COMPILE.*Ready-компиляцию/);
  assert.equal(await page.locator('#generation-execute').isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const before=await page.locator('#generation-status').innerText();
  await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:{type:'generation-result',requestId:'stale',result:{status:'completed'}}}})));
  assert.equal(await page.locator('#generation-status').innerText(),before);
  const partial=Object.assign({},result,{receipts:[{target:'frontend',status:'created',verification:'incomplete',rollback:'not-needed',artifact:{id:'a'.repeat(32)},diagnostics:[{code:'FRONTEND_NORMATIVE_RULES_UNVERIFIED',message:'unverified'}]}]});
  await page.evaluate(({request,result})=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:{type:'generation-result',requestId:request.requestId,result}}})),{request,result:partial});
  assert.match(await page.locator('#generation-status').innerText(),/Результаты созданы/);assert.match(await page.locator('#generation-receipts').innerText(),/Правила контракта/);
  assert.equal(await page.locator('#generation-receipts a').getAttribute('href'),'http://localhost:3001/generation/frontend/artifacts/'+ 'a'.repeat(32)+'/dist/index.html?probe=1');
 }
 assert.deepEqual(errors,[]);console.log('Apollo Generation UI: file picker, drag/drop, invalid-file guards, busy isolation, real HTTP bridge errors, source diagnostics and stale responses passed at 800×860px.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
