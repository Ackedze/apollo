'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'landing-approval-ui-'))),out=process.env.LANDING_QA_ROOT||work;fs.mkdirSync(out,{recursive:true});let browser,ui,fault=false;const errors=[],operations=[],decisions=[];
 const id=crypto.randomUUID(),makeApproval=revision=>({id:crypto.randomUUID(),revision,structureHash:'d'.repeat(64),status:'pending'});
 let chat={schemaVersion:'apollo.landing-chat.v1',id,revision:1,sequence:1,status:'needs-structure-approval',message:'Каркас создан. Структура подходит?',messages:[{role:'user',text:'Synthetic landing'},{role:'assistant',text:'Каркас создан. Структура подходит?'}],source:{skeletonExecutor:'native-layout-v1',nativeEvidenceVersion:2},context:{fileKey:'FixtureFile',pageId:'page'},target:{fileKey:'FixtureFile',pageId:'page',rootNodeId:'root',ownerNonce:'a'.repeat(64),leaseNonce:'b'.repeat(64)},execution:{stage:'approve-structure',structureApproval:makeApproval(1)},usage:[],sources:[],spec:{sections:[]},readback:null,result:null,canvasTransport:{version:2,lastOperationId:null}};
 try{
  require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../src/landing/ui.js')],bundle:true,platform:'browser',loader:{'.module.css':'local-css'},outfile:path.join(work,'ui.js'),globalName:'Landing',define:{__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__:'null'}});
  fs.writeFileSync(path.join(work,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="ui.css"><style>body{margin:0;height:100vh;display:flex}*{box-sizing:border-box}</style><main id="root" class="v4-legacy"></main><script src="ui.js"></script>');
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});ui=await browser.newPage({viewport:{width:800,height:800}});ui.on('pageerror',e=>errors.push(e.message));
  await ui.exposeFunction('proxyHost',({url,options})=>{
   const route=new URL(url).pathname.replace('/landing/',''),body=options.body?JSON.parse(options.body):null;
   if(route==='status')return {success:true,available:true,chatDeletion:true,placementModes:['new-section','section'],skills:[{id:'ab-generate-custom-landing',name:'Лендинг',skeletonExecutor:'native-layout-v1'}]};
   if(route==='chats')return {success:true,chats:[{id,status:chat.status,title:'Synthetic landing',updatedAt:'2026-11-06T00:00:00Z'}]};
   const action=route.split('/')[2];
   if(action==='structure-decision'){
    decisions.push(body);assert.equal(body.approvalId,chat.execution.structureApproval.id);assert.equal(body.structureHash,chat.execution.structureApproval.structureHash);
    chat.sequence++;
    if(body.decision==='revise'){chat.status='needs-structure-changes';chat.message='Что изменить в структуре?';chat.messages.push({role:'assistant',text:chat.message});}
    else{chat.status='awaiting-canvas';chat.revision++;chat.execution.structureApproval.status='accepted';chat.message='Считываем согласованный каркас';if(fault){fault=false;return {networkError:true};}}
   }
   if(action==='messages'){chat.status='needs-structure-approval';chat.revision++;chat.sequence++;chat.execution.structureApproval=makeApproval(chat.revision);chat.execution.stage='approve-structure';chat.message='Изменённый каркас создан. Подтверди структуру.';chat.messages.push({role:'assistant',text:chat.message});}
   if(action==='canvas'){chat.status='needs-input';chat.sequence++;chat.canvasTransport.lastOperationId=body.operationId;chat.message='Synthetic: fresh read acknowledged';}
   return {success:true,chat};
  });
  await ui.exposeFunction('nativeHost',async m=>{
   operations.push(m.operation);let value;
   if(m.operation==='context')value={fileKey:'FixtureFile',pageId:'page',buildId:null,evidenceVersions:[1,2],skeletonExecutor:'native-layout-v1',sections:[]};
   else if(m.operation==='release')value={preserved:true};
   else if(m.operation==='open'){assert.equal(decisions.at(-1).decision,'approve');assert.equal(m.payload.skeletonExecutor,'native-layout-v1');value={target:chat.target,readback:{native:{schemaVersion:'apollo.landing-native.v2'}}};}
   else throw Error('Unexpected scene operation '+m.operation);
   await ui.evaluate(result=>window.landing.accept(result),{type:'landing-canvas-result',requestId:m.requestId,operation:m.operation,error:null,value});
  });
  await ui.goto(require('node:url').pathToFileURL(path.join(work,'index.html')).href);
  for(const file of ['legacy.css','v3/shell.css','integration.css','new-shell.css'])await ui.addStyleTag({url:require('node:url').pathToFileURL(path.join(__dirname,'../src/design-check',file)).href});await ui.evaluate(()=>document.body.classList.add('design-check-shell','apollo-new'));
  const mount=async()=>{await ui.evaluate(()=>{window.landing?.close();window.landing=Landing.mountLanding({root:document.getElementById('root'),send:m=>void window.nativeHost(m),request:async(url,options)=>{const value=await window.proxyHost({url,options});if(value.networkError)throw Error('Accepted response lost');return {ok:value.success,json:async()=>value};}});});await ui.waitForFunction(()=>document.querySelector('[data-history]').options.length>1);const label=await ui.locator('[data-history] option[value="'+id+'"]').textContent();await ui.locator('[data-history-picker] button').click();await ui.getByRole('group',{name:'История генерации',exact:true}).getByRole('button',{name:label,exact:true}).click();await ui.getByRole('button',{name:'Структура подходит',exact:true}).waitFor();};
  await mount();const approve=ui.getByRole('button',{name:'Структура подходит',exact:true}),revise=ui.getByRole('button',{name:'Изменить структуру',exact:true}),input=ui.getByRole('textbox',{name:'Бриф или уточнение'});
  assert(operations.every(v=>['context','release'].includes(v)));assert.equal(decisions.length,0);assert.equal(await ui.getByRole('link',{name:'Показать каркас в Figma'}).getAttribute('href'),'https://www.figma.com/design/FixtureFile/Apollo?node-id=root');assert.equal(await approve.isEnabled(),true);await ui.screenshot({path:path.join(out,'structure-approval-800.png')});
  await revise.focus();await ui.keyboard.press('Enter');await ui.waitForFunction(()=>document.activeElement===document.querySelector('[data-input]'));assert.equal(decisions[0].decision,'revise');assert.equal(await approve.isVisible(),false);assert.equal(operations.includes('open'),false);
  await input.fill('Поменяй порядок блоков');await input.press('Enter');await approve.waitFor();const revisedId=chat.execution.structureApproval.id;assert.notEqual(revisedId,decisions[0].approvalId);
  await ui.evaluate(()=>window.landing.close());await mount();assert.equal(decisions.length,1,'Reload is not an approval');assert.equal(operations.includes('open'),false);
  fault=true;await approve.focus();await ui.keyboard.press('Enter');await ui.waitForFunction(()=>document.querySelector('[data-status]').textContent==='Synthetic: fresh read acknowledged');assert.equal(decisions.length,2);assert.equal(decisions[1].approvalId,revisedId);assert.equal(decisions[1].decision,'approve');assert.equal(operations.filter(v=>v==='open').length,1);assert.equal(await approve.isVisible(),false);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',syntheticOnly:true,liveFigma:false,paidModelCalls:0,fixedWidth:800,negativeFocus:true,newApprovalAfterRevision:true,reloadNotApproval:true,lostAcceptedResponseNotReplayed:true,nativeOpenOnlyAfterAcceptance:true,operations,decisions:decisions.map(d=>({decision:d.decision,revision:d.revision}))},null,2)+'\n');console.log('Structure approval UI PASS');
 }catch(error){fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error.stack||error),errors,operations,decisions,chat},null,2)+'\n');throw error;}
 finally{if(browser)await browser.close();fs.rmSync(work,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
