'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const project=process.env.APOLLO_PROJECT_ROOT||path.resolve(__dirname,'..'),proxy=process.env.APOLLO_PROXY_ROOT||path.resolve(project,'../../services/apollo-proxy'),work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'landing-direct-ui-'))),out=process.env.LANDING_QA_ROOT||work;
 fs.mkdirSync(out,{recursive:true});let browser,ui;const errors=[],operations=[],routes=[],calls=[];
 const {createDirectLandingService,FLOW}=require(path.join(proxy,'src/landing/direct-service')),source={id:'data',resumePin:'a'.repeat(64),knowledgeVersion:'fixture',skill:{id:'ab-generate-custom-landing',name:'Лендинг',version:'0.6.0',sha256:'b'.repeat(64),generation:{workflow:FLOW}},initial:{instructions:{'SKILL.md':'Fixture skill'},selectedSkill:{id:'ab-generate-custom-landing'}},assertCurrent(){}};
 const store=path.join(work,'store'),session=crypto.randomUUID();let currentId,createdRoots=0;
 const service=createDirectLandingService({root:store,knowledge:()=>source,isProcessAlive:()=>false,createCli:()=>({async run(input){
  calls.push({profile:input.profile,sessionId:input.sessionId});const data=JSON.parse(input.prompt.split('\n').at(-1));input.onEvent({type:'thread.started',thread_id:session});
  if(calls.length===2){await new Promise(resolve=>input.signal.addEventListener('abort',resolve,{once:true}));throw Object.assign(Error('Stopped'),{code:'AGENT_CANCELLED'});}
  if(!data.target.rootNodeId)createdRoots++;
  input.onEvent({type:'item.completed',item:{id:'figma:'+calls.length,type:'mcp_tool_call',server:'apollo_figma_mcp',tool:'use_figma',status:'completed',result:{content:[{type:'text',text:JSON.stringify({target:{rootNodeId:'40:10',pageId:'1:2',parentNodeId:'1:2',ownerNonce:data.target.ownerNonce}})}]}}});
  return {result:{status:calls.length===1?'needs-structure-approval':'completed',message:calls.length===1?'Каркас создан. Структура подходит?':'Наполнение завершено.',rootNodeId:'40:10',checkpoint:'Same owned root; next step',checks:[],issues:[]},receipt:{usage:{actualInputTokens:10,actualOutputTokens:5}}};
 }})});
 const oldId=crypto.randomUUID(),old={schemaVersion:'apollo.landing-chat.v1',id:oldId,revision:2,sequence:1,status:'awaiting-native',messages:[{role:'user',text:'Исторический чат'}],context:{pageId:'1:2',fileKey:'FixtureFile'},updatedAt:'2026-11-06T00:00:00Z'};fs.writeFileSync(path.join(store,oldId+'.json'),JSON.stringify(old));
 try{
  require(path.join(project,'node_modules/esbuild')).buildSync({entryPoints:[path.join(project,'src/landing/ui.js')],bundle:true,platform:'browser',loader:{'.module.css':'local-css'},outfile:path.join(work,'ui.js'),globalName:'Landing',define:{__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__:'null'}});
  fs.writeFileSync(path.join(work,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="ui.css"><style>body{margin:0;height:100vh;display:flex}*{box-sizing:border-box}</style><main id="root" class="v4-legacy"></main><script src="ui.js"></script>');
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});ui=await browser.newPage({viewport:{width:800,height:800}});ui.on('pageerror',e=>errors.push(e.message));
  await ui.exposeFunction('proxyHost',({url,options})=>{
   const route=new URL(url).pathname.replace('/landing/',''),body=options.body?JSON.parse(options.body):null;routes.push(route);
   if(route==='status')return {success:true,available:true,flow:FLOW,chatDeletion:true,placementModes:['new-section','section'],skills:[{id:'ab-generate-custom-landing',name:'Лендинг'}]};
   if(route==='chats'&&!body)return {success:true,chats:service.list()};
   if(route==='chats'){const chat=service.create(body);currentId=chat.id;return {success:true,chat};}
   const [,id,action]=route.split('/');if(!action)return {success:true,chat:service.poll(id)};
   assert(!['canvas','native','observation','failure'].includes(action),'No retired canvas callback');
   if(action==='delete')return {success:true,...service.remove(id,body)};
   const method={messages:'submit','structure-decision':'structureDecision',cancel:'cancel'}[action];assert(method,'Known direct action');return {success:true,chat:service[method](id,body)};
  });
  await ui.exposeFunction('nativeHost',async message=>{
   operations.push(message.operation);assert.equal(message.operation,'context','Plugin only supplies context');
   await ui.evaluate(result=>window.landing.accept(result),{type:'landing-canvas-result',requestId:message.requestId,operation:message.operation,error:null,value:{pageId:'1:2',fileKey:'FixtureFile',buildId:null,flow:FLOW,sections:[],selectedSectionId:null}});
  });
  await ui.goto(require('node:url').pathToFileURL(path.join(work,'index.html')).href);
  for(const file of ['legacy.css','v3/shell.css','integration.css','new-shell.css','assets/fonts.css'])await ui.addStyleTag({url:require('node:url').pathToFileURL(path.join(project,'src/design-check',file)).href});
  await ui.evaluate(()=>document.body.classList.add('design-check-shell','apollo-new'));await ui.addStyleTag({content:'body{font-family:"Apollo Alfa",sans-serif}'});await ui.evaluate(()=>document.fonts.ready);await ui.addStyleTag({url:require('node:url').pathToFileURL(path.join(work,'ui.css')).href});
  await ui.evaluate(()=>{window.landing=Landing.mountLanding({root:document.getElementById('root'),send:message=>void window.nativeHost(message),request:async(url,options)=>{const value=await window.proxyHost({url,options});return {ok:value.success,json:async()=>value};}});});
  await ui.locator('[data-input]').waitFor();await ui.waitForFunction(()=>!document.querySelector('[data-input]').disabled);
  await ui.locator('[data-input]').fill('Собери лендинг');await ui.locator('[data-submit]').click();await ui.getByRole('button',{name:'Структура подходит',exact:true}).waitFor();
  assert.equal(calls.length,1);assert.equal(service.poll(currentId).status,'needs-structure-approval');await ui.waitForFunction(()=>!document.querySelector('[data-history]').disabled);await ui.screenshot({path:path.join(out,'direct-approval-800.png')});
  await ui.getByRole('button',{name:'Структура подходит',exact:true}).click();await ui.locator('[data-stop]').waitFor();await ui.locator('[data-stop]').click();await service.settled(currentId);
  await ui.waitForFunction(()=>!document.querySelector('[data-input]').disabled);await ui.locator('[data-input]').fill('продолжай');await ui.locator('[data-submit]').click();
  await ui.waitForFunction(()=>document.querySelector('[data-messages]').textContent.includes('Наполнение завершено.'));assert.equal(service.poll(currentId).status,'completed');assert.equal(createdRoots,1);assert.equal(calls.length,3);assert.equal(calls[0].sessionId,null);assert(calls.slice(1).every(c=>c.sessionId===session));
  await ui.waitForFunction(()=>!document.querySelector('[data-history]').disabled);await ui.screenshot({path:path.join(out,'direct-completed-800.png')});
  const label=await ui.locator('[data-history] option[value="'+oldId+'"]').textContent();await ui.locator('[data-history-picker] button').click();await ui.getByRole('group',{name:'История генерации',exact:true}).getByRole('button',{name:label,exact:true}).click();
  await ui.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('прежним механизмом'));assert(await ui.locator('[data-input]').isDisabled());assert.equal(calls.length,3);assert(!(await ui.locator('[data-new]').isDisabled()));
  assert(operations.every(operation=>operation==='context'));assert.deepEqual(errors,[]);assert(await ui.locator('[data-send-icon]').evaluate(n=>n.complete&&n.naturalWidth>0));assert.equal(JSON.parse(fs.readFileSync(path.join(store,oldId+'.json'))).status,'awaiting-native');
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',syntheticOnly:true,liveFigma:false,paidModelCalls:0,fixedWidth:800,flow:'direct CLI → approval → content Stop → same-session resume → completed; historical chat read-only',createdRoots,cliCalls:calls,pluginOperations:operations,legacyCanvasCallbacks:0,routes},null,2)+'\n');console.log('Direct CLI UI PASS: context only, structure approval, Stop/resume same root/session and read-only history.');
 }catch(error){fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error.stack||error),operations,routes,calls,errors},null,2)+'\n');throw error;}
 finally{if(ui)await ui.evaluate(()=>window.landing?.close()).catch(()=>{});if(browser)await browser.close();fs.rmSync(work,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
