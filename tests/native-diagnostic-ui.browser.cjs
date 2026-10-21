// Built UI only, with synthetic parent messages; no Figma or generation host.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
const {fixture,hash}=require("../packages/generation-core/tests/planning-fixtures.cjs");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-native-ui-'));
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://localhost:3001/agent/**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,code:'AGENT_PROXY_UNAVAILABLE'})}));
  const deliver=message=>page.evaluate(message=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:message}})),message);
  const report={schemaVersion:'apollo.native-diagnostic-report.v2',status:'incomplete',provenance:'observed-not-accepted',read:'observed',userNativeRead:'observed',mutation:'not-run',runtimeCapability:'unknown',live:'not-run',acceptance:'not-run',acceptedBindings:'missing',primitivePolicy:'missing',pins:{synthetic:true},observations:[],diagnostics:['SYNTHETIC_UNKNOWN']};report.reportHash=hash(report);
  for(const width of [800]){
   await page.setViewportSize({width,height:860});
   await page.goto(pathToFileURL(path.resolve(__dirname,"../dist/ui.html")).href);
   await page.getByRole('button', { name: 'Генерация', exact: true }).click();
   await page.locator('#generation-settings-toggle').click();await page.locator('#generation-tools > summary').click();
   await page.evaluate(()=>{window.bridgeMessages=[];parent.postMessage=m=>window.bridgeMessages.push(m.pluginMessage);});
   assert.equal(await page.locator('#native-diagnostic').isDisabled(),true);
   await deliver({type:'selection',valid:true,name:'Synthetic existing component'});
   await page.locator('#native-diagnostic').click();
   const first=await page.evaluate(()=>window.bridgeMessages.at(-1));
   assert.deepEqual(first,{type:'native-diagnostic-request',requestId:'native-diagnostic:1',spec:null});
   assert.equal(await page.locator('#native-diagnostic-export').isDisabled(),true);
   assert.equal(await page.locator('#generation-file').isDisabled(),true);
   assert.equal(await page.locator('#audit').isDisabled(),true);
   const ignored=await page.evaluate(()=>{
    const transfer=new DataTransfer();transfer.items.add(new File(['{}'],'ignored.json',{type:'application/json'}));
    const zone=document.getElementById('generation-dropzone');zone.dispatchEvent(new DragEvent('dragenter',{dataTransfer:transfer,bubbles:true,cancelable:true}));
    const highlight=zone.classList.contains('is-dragging');zone.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));return highlight;
   });
   assert.equal(ignored,false);assert.equal(await page.locator('#generation-name').innerText(),'Спецификация не загружена');
   await deliver({type:'native-diagnostic-invalidated'});
   await page.locator('#native-diagnostic').click();const second=await page.evaluate(()=>window.bridgeMessages.at(-1));
   await deliver({type:'native-diagnostic-result',requestId:first.requestId,report});
   assert.equal(await page.locator('#native-diagnostic-export').isDisabled(),true);
   assert.equal(await page.locator('#native-diagnostic').isDisabled(),true);
   await deliver({type:'native-diagnostic-result',requestId:second.requestId,report:Object.assign({},report,{acceptance:'accepted'})});
   assert.equal(await page.locator('#native-diagnostic-export').isDisabled(),true);
   await page.locator('#native-diagnostic').click();const third=await page.evaluate(()=>window.bridgeMessages.at(-1));
   await deliver({type:'native-diagnostic-result',requestId:third.requestId,report});
   assert.equal(await page.locator('#native-diagnostic-export').isDisabled(),false);
   assert.match(await page.locator('#native-diagnostic-status').innerText(),/Неподтверждённые связи/);
   const downloading=page.waitForEvent('download');await page.locator('#native-diagnostic-export').click();const download=await downloading;
   assert.equal(download.suggestedFilename(),'apollo-native-diagnostic-'+report.reportHash.slice(0,12)+'.json');
   const output=path.join(directory,width+'.json');await download.saveAs(output);assert.deepEqual(JSON.parse(fs.readFileSync(output)),report);
   assert.equal(await page.locator('#generation-execute').isDisabled(),true);
   await page.locator('#generation-spec-file').setInputFiles({name:'synthetic-spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture().spec))});
   await page.waitForFunction(()=>!document.getElementById('generation-prepare').disabled);
   assert.equal(await page.locator('#native-diagnostic-export').isDisabled(),true);
   await page.locator('#native-diagnostic').click();const fourth=await page.evaluate(()=>window.bridgeMessages.at(-1));assert.deepEqual(fourth.spec,fixture().spec);
   await deliver({type:'native-diagnostic-result',requestId:fourth.requestId,report});
   await deliver({type:'native-diagnostic-invalidated'});assert.equal(await page.locator('#native-diagnostic-export').isDisabled(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const messages=await page.evaluate(()=>window.bridgeMessages);assert.ok(messages.every(m=>['native-diagnostic-request','generation-invalidate','agent-native-cancel','agent-draft-storage','generation-session-request'].includes(m.type)),JSON.stringify(messages.map(m=>m.type)));
   assert(messages.filter(m=>m.type==='agent-draft-storage').every(m=>['clear','save'].includes(m.operation)));
   assert(messages.filter(m=>m.type==='generation-session-request').every(m=>m.operation==='save'));
  }
  assert.deepEqual(errors,[]);
  console.log('Built native diagnostic UI passed at 800×860px: action, busy/drop isolation, stale/forged-result guards, ScreenSpec invalidation and synthetic JSON download; no generation or Figma calls.');
 }finally{fs.rmSync(directory,{recursive:true,force:true});await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
