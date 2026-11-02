// Actual built UI/main; fake HTTP/storage/Figma only, including an iframe without WebCrypto.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {actionScene}=require('./focus-actions.fixture.cjs'),{createReport}=require('../src/audit-statistics/report'),p=require('../src/audit-statistics/protocol'),{PREFIX}=require('../src/audit-statistics/native');
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(read){for(let i=0;i<1200;i++){if(read())return;await pause(10);}throw Error('Synthetic recovery did not settle');}
(async()=>{
 const out=process.env.AUDIT_RECOVERY_QA_ROOT;assert.ok(out);fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),page=await browser.newPage({viewport:{width:800,height:900}}),f=actionScene(),map=new Map(),accepted=[],gates=[],errors=[],warnings=[];let ready=false,queue=[];
 try{
 for(let i=0;i<2;i++){const r=createReport({reportId:'prior:'+i,runId:'prior:'+i,origin:'contract-area',status:'failed',durationMs:0,result:null,startedAt:'2026-11-02T00:00:00Z'});map.set(PREFIX+r.reportId,r);}
 f.api.clientStorage={keysAsync:async()=>Array.from(map.keys()),getAsync:async k=>map.get(k),setAsync:async(k,v)=>map.set(k,v),deleteAsync:async k=>map.delete(k)};
 const source=require('./authoring-fixtures').source();source.projectionStamp={sourceExportVersion:'component-contract-editor@0.2.108',compiledHash:'0'.repeat(64)};
  f.api.ui.postMessage=m=>{f.messages.push(JSON.parse(JSON.stringify(m)));if(ready)void page.evaluate(m=>window.emitPlugin(m),m).catch(()=>{});else queue.push(m);};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/code.js'),'utf8'),{figma:f.api,__html__:'',TextEncoder,setTimeout,clearTimeout});
  await page.exposeFunction('nativeHost',m=>f.api.ui.onmessage(m));
  await page.addInitScript(()=>{Object.defineProperty(crypto,'subtle',{value:undefined});parent.postMessage=m=>void window.nativeHost(m.pluginMessage);window.emitPlugin=m=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:m}}));});
  await page.route(/^https?:/,async route=>{
   const req=route.request(),url=new URL(req.url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*','Access-Control-Allow-Private-Network':'true','Content-Type':'application/json'};
   if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});const reply=body=>route.fulfill({status:200,headers,body:JSON.stringify(body)});
   if(url.pathname==='/health')return reply({ok:true,proxy:{version:'1.4.12'},compatibility:{protocolVersion:1,data:{state:'ready',version:'a'.repeat(64),schemaVersion:'apollo.proxy-data-release.v1',profileVersion:'0.4.1',deliveryProfile:'checking-ask-figma-mcp',generatedAt:'2026-11-02T12:13:09.774Z'}}});
   if(url.pathname==='/statistics/results'){const report=req.postDataJSON();accepted.push(report);return reply({accepted:true,reportId:report.reportId,payloadHash:crypto.createHash('sha256').update(p.canonical(report)).digest('hex'),state:'proxy-durable'});}
   if(url.pathname==='/v2/contracts/resolve'){await new Promise(r=>gates.push(r));return reply({releaseId:'synthetic-release',contracts:[{source,release:{}}],resolutions:[]});}
   return route.abort();
  });
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().includes('[Apollo][audit-statistics]'))warnings.push(m.text());});
  await page.goto(pathToFileURL(path.join(__dirname,'../dist/ui.html')).href);ready=true;for(const m of queue)await page.evaluate(m=>window.emitPlugin(m),m);queue=[];
  assert.equal(await page.evaluate(()=>typeof crypto.subtle),'undefined');await until(()=>accepted.length===2&&map.size===0);
  await f.api.ui.onmessage({type:'use-proxy'});
  const styles=page.locator('.apollo-overview-group').filter({hasText:'Стили и токены'}),check=()=>page.getByRole('button',{name:'Проверить',exact:true});
  for(let attempt=1;attempt<=2;attempt++){
   await check().click();if(attempt===2)assert.match(await styles.textContent(),/Стили и токены\s*1/);
   await until(()=>gates.length>0&&f.messages.filter(m=>m.type==='document-audit-result').length===attempt);gates.shift()();
   await page.getByText('Manual и факты не воспроизводят закреплённую проекцию.',{exact:true}).first().waitFor();await check().waitFor();await pause(100);
   assert.match(await styles.textContent(),/Стили и токены\s*1/);assert.match(await page.locator('.apollo-overview-coverage').textContent(),/Правила компонентов/);
  }
  await until(()=>accepted.length>=6&&!Array.from(map.keys()).some(key=>key.startsWith(PREFIX))).catch(error=>{fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({accepted:accepted.map(r=>({id:r.reportId,runId:r.runId,origin:r.origin,status:r.status})),remaining:Array.from(map.keys()),errors,warnings},null,2));throw error;});assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
  assert.ok(Array.from(map.keys()).some(key=>key.startsWith('apollo.local-operation.v1:')));
  await page.screenshot({path:path.join(out,'partial-results-800.png')});
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',actualBuiltUI:true,actualBuiltMain:true,liveFigma:false,cryptoSubtleAbsent:true,retainedPriorReports:2,deliveredReports:accepted.length,otherStorageKeysPreserved:map.size,repeatedContractFailureKeepsNativeCounters:true,contractCoverageStillIncomplete:true,previousResultsKeptWhileChecking:true,errors,warnings},null,2)+'\n');
  console.log('Partial audit + statistics recovery browser PASS');
 }finally{for(const release of gates)release();f.emit('close');await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
