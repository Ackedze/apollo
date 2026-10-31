// Actual chat UI/service/native bridge; deterministic synthetic CLI and canvas, no live Figma/model.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createLandingCanvasBridge,NS}=require('../src/landing/native');
const {createLandingService}=require('../../../services/apollo-proxy/src/landing/service');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
(async()=>{
 const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'apollo-landing-browser-'))),out=process.env.LANDING_QA_ROOT||work;
 fs.mkdirSync(out,{recursive:true});let browser,ui,sequence=0,modelCalls=0,late,held=false;const nodes=new Map(),errors=[],operations=[];
 function node(type='FRAME'){const n={id:'1:'+ ++sequence,type,name:type,x:0,y:0,width:100,height:100,visible:true,children:[],data:new Map(),appendChild(child){if(child.parent)child.parent.children.splice(child.parent.children.indexOf(child),1);this.children.push(child);child.parent=this;},getSharedPluginData(ns,key){return this.data.get(ns+':'+key)||'';},setSharedPluginData(ns,key,value){this.data.set(ns+':'+key,value);},resize(w,h){this.width=w;this.height=h;}};nodes.set(n.id,n);return n;}
 const canvas=node('PAGE'),neighbor=node();canvas.appendChild(neighbor);const api={currentPage:canvas,createFrame:()=>{const n=node();canvas.appendChild(n);return n;},getNodeByIdAsync:async id=>nodes.get(id)||null};
 const native=createLandingCanvasBridge({api,hash,post:m=>void ui.evaluate(m=>window.landing.accept(m),m)});
 const spec={facts:[],decisions:[],questions:[],sections:[{id:'hero',role:'hero',nodeId:null}]};
 const step=(kind,message)=>({kind,message,specJson:JSON.stringify(spec),query:'',offset:0,resources:[],resultJson:JSON.stringify({summary:'Synthetic editable landing',checks:[{name:'visual',verdict:'UNKNOWN'}],limits:['No live Figma']})});
 const source={id:'release',knowledgeVersion:'knowledge',skill:{version:'0.3.0',sha256:'a'.repeat(64)},assertCurrent(){},initial:{instructions:{'SKILL.md':'Synthetic'},norms:[],workflow:[]}};
 const service=createLandingService({root:path.join(work,'chats'),knowledge:()=>source,createCli:()=>({run:async({profile})=>{
  modelCalls++;let result;if(modelCalls===1)result=step('question','Какое действие нужно посетителю?');
  else if(profile==='landing-plan'){if(modelCalls>3)spec.editSectionIds=['hero'];result=step('build','Собираем лендинг.');}
  else if(held)result=await new Promise(resolve=>late=()=>resolve(step('finish','Поздний ответ')));
  else{const root=canvas.children.find(n=>n.getSharedPluginData(NS,'owner'));const section=node('INSTANCE'),text=node('TEXT');section.setSharedPluginData(NS,'section','hero');section.getMainComponentAsync=async()=>({key:'synthetic-published-key'});text.characters='Confirmed copy';section.appendChild(text);root.appendChild(section);spec.sections[0].nodeId=section.id;result=step('finish','Лендинг собран.');}
  return {result,receipt:{usage:{actualInputTokens:1,actualOutputTokens:1},mcp:profile==='landing-figma'?{toolCalls:1}:null}};
 }})});
 try{
  const bundle=path.join(work,'ui.js');require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../src/landing/ui.js')],bundle:true,platform:'browser',outfile:bundle,globalName:'Landing',define:{__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__:'null'}});
  fs.writeFileSync(path.join(work,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="ui.css"><style>body{margin:0;height:100vh;display:flex;font:16px Arial}.design-check-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}*{box-sizing:border-box}</style><main id="root"></main><script src="ui.js"></script>');
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});ui=await browser.newPage({viewport:{width:800,height:900}});ui.on('pageerror',e=>errors.push(e.message));
  await ui.exposeFunction('nativeHost',m=>{operations.push(m.operation);native.accept(m);});
  await ui.exposeFunction('proxyHost',async({url,options})=>{try{const route=new URL(url).pathname.replace('/landing/',''),body=options.body?JSON.parse(options.body):undefined;let result;
   if(route==='status')return {success:true,available:true};if(route==='chats')return body?{success:true,chat:service.create(body)}:{success:true,chats:service.list()};
   const [,id,action]=route.split('/');if(!action)result=service.poll(id);else result=service[{messages:'submit',canvas:'canvas',observation:'observation',cancel:'cancel',failure:'failure'}[action]](id,body);return {success:true,chat:result};
  }catch(e){return {success:false,code:e.code||e.message};}});
  await ui.goto(require('node:url').pathToFileURL(path.join(work,'index.html')).href);
  await ui.evaluate(()=>{window.landing=Landing.mountLanding({root:document.getElementById('root'),send:m=>void window.nativeHost(m),request:async(url,options)=>{const value=await window.proxyHost({url,options});return {ok:value.success,json:async()=>value};}});});
  const skill=ui.getByRole('button',{name:'Лендинг Альфа-Бизнеса',exact:false}),input=ui.getByRole('textbox',{name:'Бриф или уточнение'});
  await skill.waitFor();await ui.waitForFunction(()=>!document.querySelector('[data-skill]').disabled);await skill.click();await input.fill('Лендинг для предпринимателей');await input.press('Enter');await ui.getByText('Какое действие нужно посетителю?',{exact:true}).first().waitFor();assert.equal(canvas.children.length,1);
  await ui.getByRole('textbox',{name:'Файл Figma'}).fill('https://www.figma.com/design/FileKey123/Project');await input.fill('Открыть счёт');await input.press('Enter');await ui.getByRole('heading',{name:'Макет сохранён',exact:true}).waitFor();assert.equal(canvas.children.length,2);assert.equal(native.busy(),false);assert.equal(modelCalls,3);
  const link=ui.getByRole('link',{name:'Открыть макет в Figma'});assert.match(await link.getAttribute('href'),/FileKey123/);await ui.screenshot({path:path.join(out,'landing-completed-800.png')});
  held=true;await input.fill('Измени только заголовок');await input.press('Enter');await ui.getByRole('heading',{name:'Предыдущий результат',exact:true}).waitFor();while(!late)await new Promise(r=>setTimeout(r,10));assert.equal(canvas.children.length,2,'follow-up reuses the same root');
  await ui.getByRole('button',{name:'Остановить',exact:true}).focus();await ui.keyboard.press('Enter');await ui.waitForFunction(()=>document.querySelector('[data-stop]').hidden);late();await new Promise(r=>setTimeout(r,100));assert.equal(native.busy(),false);assert.equal(service.list()[0].status,'cancelled');assert.equal(await link.count(),1,'previous result remains after cancellation');
  await ui.getByRole('button',{name:'Новый чат',exact:true}).click();await skill.waitFor();const history=ui.getByRole('combobox',{name:'История генерации'});await history.selectOption(service.list()[0].id);await ui.getByRole('heading',{name:'Предыдущий результат',exact:true}).waitFor();assert.equal(modelCalls,5,'history does not run a model');
  for(const width of [540,360]){await ui.setViewportSize({width,height:800});assert.equal(await ui.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const box=await input.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);await ui.screenshot({path:path.join(out,'landing-cancelled-'+width+'.png')});}
  assert.equal(await ui.getByRole('heading',{name:'Генерация',exact:true}).count(),1);fs.writeFileSync(path.join(out,'DOM.html'),await ui.content());assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',syntheticOnly:true,liveFigma:false,modelCalls,operations,checks:['question/answer','actual service and native bridge','independent readback','one reused root','previous result preserved','keyboard Stop','late response ignored','history read-only','800/540/360 widths']},null,2));console.log('Landing UI PASS: dialogue, native readback, retained result, scoped reuse, Stop, history, responsive widths.');
 }finally{native.close();if(browser)await browser.close();fs.rmSync(work,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
