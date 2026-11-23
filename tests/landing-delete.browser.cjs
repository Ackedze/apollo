'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createLandingService}=require(path.join(process.env.APOLLO_PROXY_PROJECT_ROOT||path.resolve(__dirname,'../../../services/apollo-proxy'),'src/landing/service'));
const {createDirectLandingService}=require(path.join(process.env.APOLLO_PROXY_PROJECT_ROOT||path.resolve(__dirname,'../../../services/apollo-proxy'),'src/landing/direct-service'));
const {createLandingCanvasBridge}=require('../src/landing/native');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
(async()=>{
 const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'landing-delete-ui-'))),out=process.env.LANDING_QA_ROOT||work,store=path.join(work,'chats');fs.mkdirSync(out,{recursive:true});
 const source={id:'fixture',knowledgeVersion:'fixture',skill:{version:'0.3.0',sha256:'fixture'},assertCurrent(){},initial:{instructions:{},norms:[],workflow:[],resources:[]}};
 let browser,ui,service,calls=0,releaseWorker,capability=true,fault=null,listFault=null,directNotFound=0;const errors=[],operations=[],deletes=[],reads=[];
 const make=()=>createLandingService({root:store,knowledge:()=>source,createCli:()=>({run:()=>{calls++;return new Promise(resolve=>releaseWorker=()=>resolve({result:{kind:'question',message:'Fixture late reply',specJson:JSON.stringify({facts:[],decisions:[],questions:[],sections:[]}),query:'',offset:0,resources:[],resultJson:'{}'},receipt:{usage:{actualInputTokens:1}}}));}})});
 service=make();
 function seed(status,title,nodeId){const c=service.create({pageId:'1:1',fileKey:'FixtureFile'}),file=path.join(store,c.id+'.json'),r=JSON.parse(fs.readFileSync(file));r.status=status;r.revision=1;r.messages=[{id:crypto.randomUUID(),role:'user',text:title,revision:1}];r.target={fileKey:'FixtureFile',pageId:'1:1',rootNodeId:nodeId,ownerNonce:'a'.repeat(64),leaseNonce:'b'.repeat(64)};r.result=status==='completed'?{summary:'Synthetic saved result',figmaUrl:'https://www.figma.com/design/FixtureFile/Result?node-id='+nodeId,Ready:false}:null;fs.writeFileSync(file,JSON.stringify(r));return r;}
 const a=seed('completed','Сохранённый лендинг с длинным названием для проверки узкой панели','1:2'),b=seed('interrupted','Прерванный черновик','1:3');service=make();
 const directRoot=path.join(work,'direct-chats'),direct=createDirectLandingService({root:directRoot,knowledge(){throw Error('Unexpected knowledge read');},createCli(){throw Error('Unexpected CLI call');}});
 const directRecord=path.join(directRoot,a.id+'.json');fs.renameSync(path.join(store,a.id+'.json'),directRecord);
 const originalDirectRecord=fs.readFileSync(directRecord,'utf8');
 const chats=()=>[...direct.list(),...service.list()];
 const aRow=chats().find(item=>item.id===a.id);
 const page={id:'1:1',type:'PAGE',children:[],selection:[]};for(const id of ['1:2','1:3'])page.children.push({id,type:'FRAME',name:'Existing Figma result',x:0,y:0,width:100,height:100,children:[],parent:page,getSharedPluginData:()=>''});
 const scene=()=>page.children.map(n=>({id:n.id,name:n.name,x:n.x,y:n.y,width:n.width,height:n.height})),before=hash(scene());
 const bridge=createLandingCanvasBridge({api:{currentPage:page,fileKey:'FixtureFile',getNodeByIdAsync:async id=>page.children.find(n=>n.id===id)||null,createFrame(){throw Error('Unexpected canvas write');},createSection(){throw Error('Unexpected canvas write');}},hash,post:m=>void ui.evaluate(m=>window.landing.accept(m),m).catch(e=>errors.push(e.message))});
 try{
  require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../src/landing/ui.js')],bundle:true,platform:'browser',loader:{'.module.css':'local-css'},outfile:path.join(work,'ui.js'),globalName:'Landing',define:{__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__:'null'}});
  fs.writeFileSync(path.join(work,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="ui.css"><style>body{margin:0;height:100vh;display:flex;font:16px Arial}.design-check-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}*{box-sizing:border-box}</style><main id="root" class="v4-legacy"></main><aside class="design-check-chat-screen" style="display:none"><span class="agent-proxy-version" data-proxy-reference>Proxy v1.4.27</span></aside><script src="ui.js"></script>');
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});ui=await browser.newPage({viewport:{width:800,height:860}});ui.on('pageerror',e=>errors.push(e.message));
  await ui.exposeFunction('nativeHost',m=>{operations.push(m.operation);bridge.accept(m);});
  await ui.exposeFunction('proxyHost',({url,options})=>{
   try{const route=new URL(url).pathname.replace('/landing/',''),body=options.body?JSON.parse(options.body):undefined;
    if(route==='status')return {success:true,available:true,flow:'direct-cli-mcp-v1',placementModes:['new-section','section'],...(capability?{chatDeletion:true}:{})};
    if(route==='chats'){
     if(listFault==='unavailable'){listFault=null;return {networkError:'list-unavailable'};}
     if(listFault==='malformed'){listFault=null;return {success:true,chats:[{}]};}
     const rows=chats();if(listFault==='still-present'){listFault=null;rows.push(aRow);}
     return {success:true,chats:rows.map(item=>item.id===a.id?Object.assign(item,{lastMessagePreview:'Собрал новый экран по последнему сообщению.'}):item)};
    }
    const [,id,action]=route.split('/'),backend=id===a.id?direct:service;
    if(action==='delete'){
     deletes.push({id,body});
     if(fault==='before'){fault=null;return {networkError:'before-acceptance'};}
     if(fault==='stale'){fault=null;return {success:false,code:'LANDING_REVISION_STALE'};}
     let value;
     try{value=backend.remove(id,body);}catch(error){if(id===a.id&&error.code==='LANDING_CHAT_NOT_FOUND')directNotFound++;throw error;}
     if(fault==='after'){fault=null;return {networkError:'accepted-response-lost'};}
     return {success:true,...value};
    }
    if(!action)reads.push(id);
    return {success:true,chat:action?backend[{cancel:'cancel',failure:'failure'}[action]](id,body):backend.poll(id)};
   }catch(e){return {success:false,code:e.code||e.message};}
  });
  await ui.goto(require('node:url').pathToFileURL(path.join(work,'index.html')).href);for(const file of ['legacy.css','v3/shell.css','integration.css','new-shell.css'])await ui.addStyleTag({url:require('node:url').pathToFileURL(path.join(__dirname,'../src/design-check',file)).href});await ui.evaluate(()=>document.body.classList.add('design-check-shell','apollo-new'));await ui.addStyleTag({path:path.join(__dirname,'../src/design-check/assets/fonts.css')});await ui.addStyleTag({content:'body{font-family:"Apollo Alfa",sans-serif}'});
  const mount=async()=>{await ui.evaluate(()=>{window.landing?.close();window.landing=Landing.mountLanding({root:document.getElementById('root'),send:m=>void window.nativeHost(m),request:async(url,options)=>{const value=await window.proxyHost({url,options});if(value.networkError)throw Error(value.networkError);return {ok:value.success,json:async()=>value};}});});await ui.waitForFunction(()=>document.querySelectorAll('[data-open-chat]').length>0);};
  const history=ui.locator('[data-history-list]'),picker=ui.getByRole('button',{name:'История чатов',exact:true}),menu=ui.getByRole('dialog',{name:'История чатов',exact:true});
  const closeButton=menu.getByRole('button',{name:'Закрыть историю',exact:true}),newButton=menu.getByRole('button',{name:'Новый чат',exact:true});
  const row=id=>history.locator('[data-open-chat="'+id+'"]');
  const remove=id=>menu.locator('[data-delete-chat="'+id+'"]');
  const open=async()=>{if(!(await menu.isVisible()))await picker.click();await menu.waitFor();};
  const select=async(id,working=false)=>{await open();await row(id).click();if(!working)await ui.waitForFunction(()=>!document.querySelector('[data-history-toggle]').disabled);};
  const note=menu.locator('[data-history-note]');
  await mount();assert.equal(await ui.locator('[data-delete-toggle]').count(),0);assert.equal(await history.isVisible(),false);
  await picker.focus();await ui.keyboard.press('Enter');await menu.waitFor();
  const motion=await menu.evaluate(async panel=>{
   const animation=panel.getAnimations()[0];
   if(!animation)return null;
   const result={duration:animation.effect.getTiming().duration,from:animation.effect.getKeyframes()[0].transform};
   await animation.finished;
   return result;
  });
  assert.deepEqual(motion,{duration:220,from:'translateX(-24px)'});
  assert.equal(await closeButton.evaluate(n=>n===document.activeElement),true);
  assert.equal(await row(a.id).locator('.landing-history-preview').innerText(),'Собрал новый экран по последнему сообщению.');
  assert.equal(await row(b.id).locator('.landing-history-preview').innerText(),'Прерванный черновик');
  assert.match(await row(a.id).locator('time').innerText(),/\d{2}:\d{2}/);
  const first=history.locator('li').first(),second=history.locator('li').nth(1);
  const panel=await menu.boundingBox(),firstBox=await first.boundingBox(),nextBox=await second.boundingBox(),newBox=await newButton.boundingBox();
  assert.equal(panel.width,392);assert.equal(panel.x,4);
  assert.equal(newBox.x-panel.x,12);assert.equal(newBox.y-panel.y,84);
  assert.equal(firstBox.x-panel.x,12);assert.equal(firstBox.y-newBox.y-newBox.height,4);
  assert.equal(firstBox.height,72);assert.equal(nextBox.y-firstBox.y-firstBox.height,4);
  const removeButton=remove(a.id);
  assert.equal(await removeButton.locator('button').count(),0,'delete is not a nested button');
  const trash=await removeButton.boundingBox();assert.equal(trash.width,24);assert.equal(trash.height,24);
  assert.equal(firstBox.x+firstBox.width-trash.x-trash.width,12);
  await row(a.id).focus();await ui.keyboard.press('Tab');assert.equal(await removeButton.evaluate(n=>n===document.activeElement),true);
  await ui.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);assert.equal(await picker.evaluate(n=>n===document.activeElement),true);
  for(let i=0;i<3;i++){
   await ui.evaluate(()=>{document.querySelector('[data-history-toggle]').click();document.querySelector('[data-history-close]').click();});
   assert.equal(await picker.getAttribute('aria-expanded'),'false');
   assert.equal(await ui.locator('[data-content]').evaluate(n=>n.inert),false);
   assert.equal(await menu.isVisible(),false);
  }
  await ui.emulateMedia({reducedMotion:'reduce'});await open();
  assert.equal(await menu.evaluate(n=>n.getAnimations().length),0);
  assert.equal(await picker.getAttribute('aria-expanded'),'true');
  assert.equal(await ui.locator('[data-content]').evaluate(n=>n.inert),true);
  await ui.locator('[data-history-backdrop]').click({position:{x:600,y:200}});assert.equal(await menu.isVisible(),false);
  capability=false;await mount();await open();assert.equal(await menu.locator('.generation-history-remove').count(),0);assert.equal(await row(a.id).isVisible(),true);await newButton.click();assert.equal(await menu.isVisible(),false);assert.equal(deletes.length,0);
  capability=true;await mount();await select(b.id);
  const input=ui.getByRole('textbox',{name:'Бриф или уточнение'});await input.fill('Несохранённый бриф');
  await open();await remove(a.id).focus();fault='before';await ui.keyboard.press('Enter');
  const retryMessage='Не удалось подтвердить удаление. Повтори попытку.';
  await note.getByText(retryMessage,{exact:true}).waitFor();
  assert.equal(chats().length,2);assert.equal(deletes.length,1);
  assert.equal(await menu.locator('[data-delete-confirm]').count(),0);
  assert.equal(await remove(a.id).evaluate(n=>n===document.activeElement),true);
  assert.equal(await ui.getByRole('button',{name:'Остановить',exact:true}).isVisible(),false);
  fault='after';
  await remove(a.id).evaluate(button=>{button.click();button.click();});
  await note.getByText(retryMessage,{exact:true}).waitFor();
  assert.equal(chats().length,1);assert.equal(deletes.length,2);
  for(const kind of ['unavailable','malformed','still-present']){
   listFault=kind;
   await remove(a.id).click();
   await note.getByText(retryMessage,{exact:true}).waitFor();
   assert.equal(await row(a.id).count(),1);
   assert.equal(await input.inputValue(),'Несохранённый бриф');
  }
  await remove(a.id).click();await note.getByText('Чата больше нет в истории. Макет в Figma сохранён.',{exact:true}).waitFor();
  assert.equal(await row(a.id).count(),0);
  assert.equal(await row(b.id).getAttribute('aria-current'),'true','deleting another row preserves the current chat');
  assert.equal(await input.inputValue(),'Несохранённый бриф');assert.equal(await menu.isVisible(),true);
  assert.equal(await row(b.id).evaluate(n=>n===document.activeElement),true);
  assert.equal(calls,0);assert.equal(deletes.length,6);assert.equal(directNotFound,4);
  assert.equal(reads.filter(id=>id===a.id).length,1);
  for(const sent of deletes)assert.deepEqual(sent,{id:a.id,body:{revision:a.revision}});
  assert.equal(fs.readFileSync(directRecord.replace('.json','.deleted.json'),'utf8'),originalDirectRecord);
  assert.equal(hash(scene()),before);
  await ui.evaluate(()=>window.landing.close());service=make();await mount();assert.equal(await row(a.id).count(),0);await select(b.id);await open();
  fault='stale';await remove(b.id).click();await note.getByText('Чат изменился. Нажми на корзину ещё раз.',{exact:true}).waitFor();
  assert.equal(chats().length,1);const readsAfterStale=reads.length;
  await remove(b.id).click();await note.getByText('Чат удалён из истории. Макет в Figma сохранён.',{exact:true}).waitFor();
  assert.equal(reads.length,readsAfterStale+1);
  assert.deepEqual(chats(),[]);assert.equal(await menu.isVisible(),true);assert.equal(await history.locator('[data-open-chat]').count(),0);
  assert.equal(await newButton.evaluate(n=>n===document.activeElement),true);
  await menu.getByText('Сохранённых чатов пока нет.').waitFor();await newButton.click();assert.equal(await menu.isVisible(),false);
  const active=service.create({pageId:'1:1',fileKey:'FixtureFile'});service.submit(active.id,{requestId:crypto.randomUUID(),revision:0,text:'Synthetic active request'});const settled=service.whenSettled(active.id);
  await mount();await open();assert.equal(await remove(active.id).isDisabled(),true);
  await ui.keyboard.press('Escape');await select(active.id,true);await ui.waitForFunction(()=>document.querySelector('[data-history-toggle]').disabled);assert.equal(await picker.isDisabled(),true);assert.equal(deletes.filter(row=>row.id===active.id).length,0);
  await ui.getByRole('button',{name:'Остановить',exact:true}).click();await ui.waitForFunction(()=>!document.querySelector('[data-history-toggle]').disabled);releaseWorker();await settled;await open();
  await remove(active.id).click();await note.getByText('Чат удалён из истории. Макет в Figma сохранён.',{exact:true}).waitFor();
  assert.deepEqual(chats(),[]);assert.equal(calls,1);assert.equal(hash(scene()),before);
  assert(operations.every(op=>['context','release'].includes(op)));assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',syntheticOnly:true,liveFigma:false,paidModelCalls:0,fakeModelCalls:1,viewport:{width:800,height:860},motion,reducedMotion:true,rapidToggle:true,historyDrawer:true,lastMessagePreview:true,legacyTitleFallback:true,oneClickDeletion:true,rowDeleteWithoutSwitch:true,unsentDraftPreserved:true,oldProxyHidden:true,directNotFound,unverifiedAbsenceRefused:true,lostBeforeAndAfterResponseRetry:true,repeatDeleteBodyUnchanged:true,activeChatProtected:true,emptyHistory:true,figmaSceneUnchanged:true,operations},null,2)+'\n');console.log('Landing history deletion UI PASS');
 }catch(error){fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error.stack||error),errors,operations,deletes,chats:service.list()},null,2)+'\n');throw error;}
 finally{releaseWorker?.();bridge.close();if(browser)await browser.close();fs.rmSync(work,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
