// Actual built plugin/UI; invented scene/index. No live Figma or installed Proxy.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {actionScene}=require('./focus-actions.fixture.cjs'),authored=require('./authoring-fixtures');
const stable=v=>v&&typeof v==='object'?Array.isArray(v)?v.map(stable):Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
async function until(check){for(let i=0;i<1000;i++){if(await check())return;await new Promise(r=>setTimeout(r,5));}throw Error('Condition not reached');}
(async()=>{
 const out=process.env.DEPRECATED_STYLES_QA_ROOT;if(!out)throw Error('Set DEPRECATED_STYLES_QA_ROOT');fs.mkdirSync(out,{recursive:true});
 const data={schemaVersion:'apollo.deprecated-styles.v1',policyVersion:1,createdAt:'2026-10-31T00:00:00Z',policySha256:'d'.repeat(64),sources:[{path:'JSONS/styles/synthetic.json',sha256:'e'.repeat(64)}],styles:[{key:'a'.repeat(40),type:'PAINT',name:'Synthetic obsolete style',library:'Synthetic style library',status:'deprecated',sourceIds:['JSONS/styles/synthetic.json']}]};
 const index=Object.assign({indexId:hash(data)},data),f=actionScene();f.raw.fillStyleId='document-local-id';f.raw.name='Layer with obsolete style';f.api.getStyleByIdAsync=async id=>id==='document-local-id'?{id,key:'a'.repeat(40),type:'PAINT',name:'Synthetic obsolete style'}:null;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),page=await browser.newPage({viewport:{width:800,height:900}}),errors=[];let ready=false,queued=[];
 try{
  f.api.ui.postMessage=m=>{f.messages.push(JSON.parse(JSON.stringify(m)));if(ready)void page.evaluate(m=>window.emitPlugin(m),m).catch(()=>{});else queued.push(m);};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/code.js'),'utf8'),{figma:f.api,__html__:'',TextEncoder,setTimeout,clearTimeout});
  await page.exposeFunction('nativeHost',m=>f.api.ui.onmessage(m));
  await page.addInitScript(()=>{parent.postMessage=m=>void window.nativeHost(m.pluginMessage);window.emitPlugin=m=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{pluginMessage:m}}));});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/^https?:/,route=>route.request().url().endsWith('/v1/style-token-catalog/deprecated-styles')?route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(index)}):route.abort());
  await page.goto(pathToFileURL(path.join(__dirname,'../dist/ui.html')).href);ready=true;for(const m of queued)await page.evaluate(m=>window.emitPlugin(m),m);queued=[];
  await f.api.ui.onmessage({type:'load-contract',source:authored.nested().source});await page.getByRole('button',{name:'Проверить',exact:true}).click();
  await until(()=>f.messages.some(m=>m.type==='document-audit-result')&&f.messages.some(m=>m.type==='audit-result'));
  const native=f.messages.find(m=>m.type==='document-audit-result');assert.equal(native.result.checks.find(c=>c.id==='deprecatedStyles').findings[0].status,'deprecated-style');
  await page.getByRole('button',{name:/^Стили и токены:/}).click();await page.getByRole('button',{name:'Устаревшие · 1',exact:true}).click();
  await page.getByRole('heading',{name:'Устаревший стиль: Synthetic obsolete style',exact:true}).waitFor();assert.equal(await page.getByText('Synthetic style library',{exact:true}).count(),1);
  const focus=page.getByRole('button',{name:/Найти в макете:.*Layer with obsolete style/});await focus.focus();await page.keyboard.press('Enter');
  await until(()=>f.writes.some(w=>w[0]==='focus'));assert.equal(f.page.selection[0].id,f.raw.id);
  // Apollo's approved shell is fixed at 800px; test its supported heights.
  for(const height of [900,640]){await page.setViewportSize({width:800,height});assert.equal(await page.getByRole('region',{name:'Устаревшие стили',exact:true}).locator('.apollo-finding-card').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'obsolete-800-'+height+'.png')});}
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',syntheticOnly:true,liveFigma:false,actualBuiltMain:true,actualBuiltUI:true,versionedIndexThroughCatalogTransport:true,tabAndCount:true,keyboardFocus:true,viewports:[[800,900],[800,640]],errors},null,2)+'\n');console.log('Deprecated styles browser PASS: index transport, tab/count, native keyboard focus, 800×900/640.');
 }finally{f.emit('close');await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
