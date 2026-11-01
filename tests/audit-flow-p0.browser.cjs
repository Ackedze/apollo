// Real built UI/main; synthetic Figma and local contracts. Never a live Figma test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {pathToFileURL}=require('node:url'),{actionScene}=require('./focus-actions.fixture.cjs'),authored=require('./authoring-fixtures');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<1000;i++){const value=check();if(value)return value;await sleep(5);}throw Error('Condition not reached');}
(async()=>{
 const out=process.env.DOCUMENT_AUDIT_QA_ROOT;if(!out)throw Error('Set DOCUMENT_AUDIT_QA_ROOT');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const errors=[],host=[],trace=[],f=actionScene();let ready=false,queued=[],holdNative=false,heldNative=null;const page=await browser.newPage({viewport:{width:800,height:900},acceptDownloads:true});
 const imported=f.api.importComponentByKeyAsync;let hydrated=false;
 f.api.importComponentByKeyAsync=async key=>{const main=await imported(key);if(!hydrated&&key==='host-key'){hydrated=true;f.raw.fillStyleId='hydrated-style';f.raw.fills=[{type:'SOLID',color:{r:0,g:1,b:0}}];}return main;};
 f.api.getStyleByIdAsync=async id=>id==='hydrated-style'?{id,key:'a'.repeat(40),type:'PAINT',name:'Synthetic bound style'}:null;
 const nativeConsole=Object.create(console);nativeConsole.info=(prefix,entry)=>{if(prefix==='[Apollo audit]')trace.push(JSON.parse(JSON.stringify(entry)));};
 try{
  f.api.ui.postMessage=m=>{f.messages.push(JSON.parse(JSON.stringify(m)));if(ready)void page.evaluate(m=>window.emitPlugin(m),m).catch(()=>{});else queued.push(m);};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/code.js'),'utf8'),{figma:f.api,__html__:'',console:nativeConsole,TextEncoder,setTimeout,clearTimeout});
  await page.exposeFunction('nativeHost',m=>{host.push(m);if(holdNative&&m.type==='document-audit-request'){heldNative=m;return;}return f.api.ui.onmessage(m);});
  await page.addInitScript(()=>{parent.postMessage=m=>void window.nativeHost(m.pluginMessage);window.emitPlugin=m=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:m}}));const timer=setTimeout;window.auditDeadlineCallbacks=[];window.setTimeout=(fn,ms,...args)=>{if(ms===60000||ms===20000)window.auditDeadlineCallbacks.push({ms,fn:()=>fn(...args)});return timer(fn,ms,...args);};});
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());await page.goto(pathToFileURL(path.join(__dirname,'../dist/ui.html')).href);ready=true;for(const m of queued)await page.evaluate(m=>window.emitPlugin(m),m);queued=[];
  await f.api.ui.onmessage({type:'load-contract',source:authored.nested().source});
  const check=()=>page.getByRole('button',{name:'Проверить',exact:true}),stop=()=>page.getByRole('button',{name:'Остановить',exact:true});
  await check().click();await until(()=>f.messages.filter(m=>m.type==='audit-result').length===1&&f.messages.filter(m=>m.type==='document-audit-result').length===1);await check().waitFor();assert.equal(await check().isEnabled(),true);
  assert.ok(hydrated);assert.ok(trace.some(e=>e.event==='phase-drift'&&e.stage==='published-imports'&&e.nodeId===f.raw.id));assert.equal(f.messages.some(m=>m.type.startsWith('document-audit-')&&m.diagnostic?.code==='NATIVE_FACTS_CHANGED'),false);
  const baselineCount=f.messages.filter(m=>m.type==='audit-result').length;holdNative=true;await check().click();await until(()=>heldNative&&f.messages.filter(m=>m.type==='audit-result').length>baselineCount);
  await page.waitForFunction(()=>document.querySelector('.apollo-overview-caption[role=status]')?.textContent.includes('Читаем'));
  assert.equal(await page.locator('.apollo-status-messages [role=status]').count(),0);
  for(const height of [900,640]){await page.setViewportSize({width:800,height});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'progress-800-'+height+'.png')});}
  await page.setViewportSize({width:800,height:900});
  assert.equal(await stop().isEnabled(),true);const logical=host.filter(m=>m.type==='audit').at(-1),pinned=logical.context.selectionSignature;
  f.page.selection=[f.peer];f.emit('selectionchange');const before=f.messages.filter(m=>m.type==='audit-result').length;f.actual.opacity=.2;await f.mutate({nodeChanges:[{id:f.actual.id,node:f.actual,type:'PROPERTY_CHANGE'}]});
  await until(()=>host.filter(m=>m.type==='audit'&&m.requestId===logical.requestId).length===2);await until(()=>f.messages.filter(m=>m.type==='audit-result').length>before);assert.ok(host.filter(m=>m.type==='audit'&&m.requestId===logical.requestId).every(m=>m.context.selectionSignature===pinned));
  holdNative=false;await f.api.ui.onmessage(heldNative);await check().waitFor();assert.equal(await check().isEnabled(),true);
  // A new run waits on a real pending native method; Stop must finish before it resolves.
  f.page.selection=[f.area];f.emit('selectionchange');const original=f.actual.getMainComponentAsync;let release,blocked=true;const gate=new Promise(r=>release=r);f.actual.getMainComponentAsync=async()=>{if(blocked)await gate;return original();};const beforeStop=host.filter(m=>m.type==='audit').length;
  await check().click();await stop().waitFor();await until(()=>host.filter(m=>m.type==='audit').length>beforeStop);const stoppingId=host.filter(m=>m.type==='audit').at(-1).requestId;
  assert.equal(await page.evaluate(()=>window.auditDeadlineCallbacks.filter(x=>x.ms===60000).length),0);await page.screenshot({path:path.join(out,'waiting-stop-800.png')});await stop().focus();await page.keyboard.press('Enter');await check().waitFor();assert.equal(await check().isEnabled(),true);
  blocked=false;release();await sleep(50);assert.equal(f.messages.some(m=>m.type==='audit-result'&&m.requestId===stoppingId),false);assert.ok(f.messages.some(m=>m.type==='audit-cancelled'&&m.requestId===stoppingId));
  let fail=true;f.actual.getMainComponentAsync=async()=>{if(fail){fail=false;throw Error('NATIVE_READ_TIMEOUT');}return original();};await check().click();await check().waitFor();await until(()=>f.messages.some(m=>m.diagnostic));
  const downloadPromise=page.waitForEvent('download');await page.evaluate(()=>document.getElementById('export').click());const download=await downloadPromise;const target=path.join(out,'summary.json');await download.saveAs(target);const report=JSON.parse(fs.readFileSync(target,'utf8'));
  const failures=(report.auditFailures||[]).concat(report.nativeAudit?.failures||[]);assert.ok(failures.some(d=>d.code==='NATIVE_READ_TIMEOUT'&&d.stage&&d.requestId));assert.ok(report.auditId);await page.setViewportSize({width:800,height:640});await page.screenshot({path:path.join(out,'complete-800-640.png')});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',actualBuiltMain:true,actualBuiltUI:true,syntheticOnly:true,liveFigma:false,importMaterializationBeforeSnapshot:true,consoleTraceIdentifiedPhase:true,stopBeforeRPCResolution:true,lateReplyRejected:true,stagedContractRecaptured:true,pinnedContext:true,firstFailureInExport:true,viewports:[[800,900],[800,640]],errors},null,2)+'\n');fs.writeFileSync(path.join(out,'CONSOLE-TRACE.json'),JSON.stringify(trace,null,2)+'\n');console.log('P0 browser PASS: materialization/console trace, pinned scope, staged recapture, Stop/late response, retained diagnostics.');
 }finally{f.emit('close');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
