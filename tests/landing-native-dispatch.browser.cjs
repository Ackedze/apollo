'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const project=process.env.APOLLO_PROJECT_ROOT||path.resolve(__dirname,'..'),work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'landing-native-dispatch-'))),out=process.env.LANDING_QA_ROOT||work;
 fs.mkdirSync(out,{recursive:true});let browser,ui;const errors=[],operations=[],nativePosts=[],routes=[];
 const id=crypto.randomUUID(),target={fileKey:'FixtureFile',pageId:'page',rootNodeId:'root',ownerNonce:'a'.repeat(64),leaseNonce:'b'.repeat(64)},sourcePin='c'.repeat(64);
 const readback=()=>({rootNodeId:'root',pageId:'page',ownerNonce:target.ownerNonce,leaseNonce:target.leaseNonce,outsideHash:'d'.repeat(64),nodeCount:1+nativePosts.length,instanceCount:Math.max(0,nativePosts.length-1),sections:[],text:'',coverage:'tagged-sections-and-text',native:{schemaVersion:'apollo.landing-native.v2',executor:'native-layout-v1',nodes:[]}});
 const request=(stage,sectionId)=>({operationId:crypto.randomUUID(),sourcePin,stage,sectionId,plan:{schemaVersion:'apollo.native-skeleton.v1',rootId:stage==='foundation'?'host':'hero',mountId:stage==='foundation'?'host':null,rootLayout:{},nodes:[]},planHash:'e'.repeat(64)});
 let chat={schemaVersion:'apollo.landing-chat.v1',id,revision:1,sequence:1,status:'awaiting-canvas',message:'Готовим область',messages:[{role:'user',text:'Synthetic landing'}],source:{skeletonExecutor:'native-layout-v1',nativeEvidenceVersion:2},context:{fileKey:'FixtureFile',pageId:'page'},target:null,execution:{stage:'prepare-foundation',nativeRequest:null},usage:[],sources:[],spec:{sections:[{id:'hero'}]},readback:null,result:null,canvasTransport:{version:2,lastOperationId:null}};
 function queue(stage,sectionId){chat.status='awaiting-native';chat.execution.stage=stage;chat.execution.nativeRequest=request(stage,sectionId);chat.message=stage==='foundation'?'Создаём основу…':'Создаём первый блок…';}
 try{
  require(path.join(project,'node_modules/esbuild')).buildSync({entryPoints:[path.join(project,'src/landing/ui.js')],bundle:true,platform:'browser',loader:{'.module.css':'local-css'},outfile:path.join(work,'ui.js'),globalName:'Landing',define:{__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__:'null'}});
  fs.writeFileSync(path.join(work,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="ui.css"><style>body{margin:0;height:100vh;display:flex}*{box-sizing:border-box}</style><main id="root" class="v4-legacy"></main><script src="ui.js"></script>');
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});ui=await browser.newPage({viewport:{width:800,height:800}});ui.on('pageerror',e=>errors.push(e.message));
  await ui.exposeFunction('proxyHost',({url,options})=>{
   const route=new URL(url).pathname.replace('/landing/',''),body=options.body?JSON.parse(options.body):null;routes.push(route);
   if(route==='status')return {success:true,available:true,skills:[{id:'ab-generate-custom-landing',name:'Лендинг',skeletonExecutor:'native-layout-v1'}]};
   if(route==='chats')return {success:true,chats:[{id,status:chat.status,title:'Synthetic landing',updatedAt:'2026-11-06T00:00:00Z'}]};
   const action=route.split('/')[2];
   if(action==='canvas'){assert.equal(chat.status,'awaiting-canvas');assert.equal(body.target.rootNodeId,target.rootNodeId);chat.target=target;chat.status='awaiting-readback';chat.readback=body.readback;chat.sequence++;}
   if(action==='observation'){assert.equal(chat.status,'awaiting-readback');queue('foundation',null);chat.sequence++;}
   if(action==='native'){
    assert.equal(chat.status,'awaiting-native');assert.equal(body.nativeResult.operationId,chat.execution.nativeRequest.operationId);assert.equal(body.nativeResult.issue,null);assert.equal(body.readback.rootNodeId,'root');assert(body.operationId);nativePosts.push(body);
    if(nativePosts.length===1)queue('structure','hero');
    else{assert.equal(nativePosts.length,2);chat.status='needs-structure-approval';chat.execution.stage='approve-structure';chat.execution.nativeRequest=null;chat.execution.structureApproval={id:crypto.randomUUID(),revision:1,structureHash:'f'.repeat(64),status:'pending'};chat.message='Каркас создан. Структура подходит?';}
    chat.sequence++;
   }
   if(body?.operationId)chat.canvasTransport.lastOperationId=body.operationId;
   assert(!['failure','structure-decision','messages'].includes(action),'No failure, content or approval before explicit user action');return {success:true,chat};
  });
  await ui.exposeFunction('nativeHost',async m=>{
   operations.push(m.operation);let value;
   if(m.operation==='context')value={fileKey:'FixtureFile',pageId:'page',buildId:null,evidenceVersions:[1,2],skeletonExecutor:'native-layout-v1',sections:[]};
   else if(m.operation==='open')value={target,readback:readback()};
   else if(m.operation==='observe')value=readback();
   else if(m.operation==='assemble'){assert.equal(m.payload.request.operationId,chat.execution.nativeRequest.operationId);assert.equal(m.payload.rootNodeId,target.rootNodeId);value={operationId:m.payload.request.operationId,bindings:[{id:m.payload.request.plan.rootId,nodeId:'native-'+m.payload.request.plan.rootId}],issue:null,readback:readback()};}
   else if(m.operation==='release')value={preserved:true};else throw Error('Unexpected native operation '+m.operation);
   await ui.evaluate(result=>window.landing.accept(result),{type:'landing-canvas-result',requestId:m.requestId,operation:m.operation,error:null,value});
  });
  await ui.goto(require('node:url').pathToFileURL(path.join(work,'index.html')).href);
  await ui.evaluate(()=>{window.landing=Landing.mountLanding({root:document.getElementById('root'),send:m=>void window.nativeHost(m),request:async(url,options)=>{const value=await window.proxyHost({url,options});return {ok:value.success,json:async()=>value};}});});
  await ui.waitForFunction(()=>document.querySelector('[data-history]').options.length>1);
  const label=await ui.locator('[data-history] option[value="'+id+'"]').textContent();await ui.locator('[data-history-picker] button').click();await ui.getByRole('group',{name:'История генерации',exact:true}).getByRole('button',{name:label,exact:true}).click();
  await ui.getByRole('button',{name:'Структура подходит',exact:true}).waitFor({timeout:6000});
  assert.deepEqual(operations.filter(v=>v==='assemble'),['assemble','assemble']);assert.equal(nativePosts.length,2);assert.equal(nativePosts[0].nativeResult.bindings[0].id,'host');assert.equal(nativePosts[1].nativeResult.bindings[0].id,'hero');assert.deepEqual(errors,[]);assert.equal(chat.status,'needs-structure-approval');
  await ui.screenshot({path:path.join(out,'native-dispatch-800.png')});
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',syntheticOnly:true,liveFigma:false,paidModelCalls:0,fixedWidth:800,flow:'UI open → readback → native foundation → native hero → structure approval',nativeAssembles:2,nativePosts:2,approvalNotBypassed:true,operations},null,2)+'\n');console.log('Native dispatch UI PASS: foundation and block assembled through real UI handler; waits for approval.');
 }catch(e){fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(e.stack||e),operations,nativePosts: nativePosts.length,chatStatus:chat.status,routes,errors},null,2)+'\n');throw e;}
 finally{if(ui)await ui.evaluate(()=>window.landing?.close()).catch(()=>{});if(browser)await browser.close();fs.rmSync(work,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
