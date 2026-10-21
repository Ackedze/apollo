'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
async function browserVerify(root,plan,profile,toolchain,guard,signal){
 const server=http.createServer((req,res)=>{const rel=new URL(req.url,'http://localhost').pathname;const f=path.resolve(root,'dist','.'+rel);if(!f.startsWith(path.resolve(root,'dist')+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',MIME[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 let browser;const observations=[],interactions=[],errors=[],observed=new Set();
 try{
  const {chromium}=require(path.join(toolchain.home,'node_modules/playwright'));
  browser=await chromium.launch({executablePath:toolchain.chrome.executablePath,headless:true,args:['--no-sandbox']});
  const abort=()=>{if(browser)browser.close().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
   const context=await browser.newContext({viewport:plan.spec.viewport,deviceScaleFactor:1});
   const origin='http://127.0.0.1:'+server.address().port;
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(String(e.message).slice(0,120)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,120));});
   await page.addInitScript(()=>{window.apolloProbe={layouts:[],routes:[],events:[],commands:[]};for(const [type,key] of [['apollo-layout','layouts'],['apollo-routing','routes'],['apollo-plan-event','events'],['apollo-probe-command','commands']])window.addEventListener(type,e=>window.apolloProbe[key].push(e.detail));});
   const group=plan.spec.nodes.find(n=>n.actions),selector='[data-test-id="'+group.id+'"]';
   async function load(state){await guard();await page.goto(origin+'/index.html?probe=1&state='+encodeURIComponent(state));await page.locator('[data-proposal-check]').waitFor();await page.waitForFunction(()=>window.apolloProbe.layouts.at(-1)?.status!=='pending'&&Boolean(window.apolloProbe.layouts.length));await page.waitForTimeout(80);const layout=await page.evaluate(()=>window.apolloProbe.layouts.at(-1));observations.push({state,layout});if(layout.status!=='pass')throw new Error('FRONTEND_LAYOUT_GUARD_BLOCKED');return layout;}
   let fonts;
   for(const state of plan.spec.states.values){
    await load(state);observed.add('state.'+state);
    if(!fonts){const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const doc=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:selector+' button'});fonts=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;await cdp.detach();if(!fonts.some(f=>f.familyName==='Alfa Interface Sans'&&f.glyphCount>0))throw new Error('FRONTEND_FONT_UNCONFIRMED');}
    for(const action of group.actions.items){
     const layout=await load(state),disabled=typeof action.disabled==='object'?action.disabled.state[state]:Boolean(action.disabled);
     let element;
     if(layout.visibleIds.includes(action.id))element=page.locator('[data-test-id="visible-recipe-'+action.id+'"]');
     else {await page.locator(selector+' #button-group-picker-container button').click();const options=page.locator('[role="option"]');await options.first().waitFor();assert.equal(await options.count(),layout.hiddenIds.length);element=options.nth(layout.hiddenIds.indexOf(action.id));}
     if(disabled){assert.ok(await element.isDisabled()||await element.getAttribute('aria-disabled')==='true');const box=await element.boundingBox();assert.ok(box);await page.mouse.click(box.x+box.width/2,box.y+box.height/2);}
     else await element.click();
     await page.waitForTimeout(40);const actual=await page.evaluate(()=>({probe:window.apolloProbe,state:document.querySelector('[data-screen-state]')?.getAttribute('data-screen-state')}));
     const source=layout.visibleIds.includes(action.id)?'button':'picker';
     if(disabled){assert.equal(actual.probe.events.length,0);assert.equal(actual.probe.commands.length,0);assert.equal(actual.state,state);}
     else {assert.equal(actual.probe.events.length,1);assert.equal(actual.probe.commands.length,1);const e=actual.probe.events[0],c=actual.probe.commands[0];assert.equal(e.actionId,action.id);assert.equal(e.eventId,action.eventId);assert.equal(e.source,source);assert.equal(e.hasMouseEvent,source==='button');if(source==='button')assert.equal(e.trusted,true);assert.equal(c.commandRef,profile.actions.find(a=>a.id===action.id).commandRef);assert.equal(c.actionId,action.id);assert.equal(c.source,source);assert.equal(c.hasMouseEvent,source==='button');assert.equal(actual.state,plan.spec.transitions.find(t=>t.from===state&&t.eventId===action.eventId)?.to||state);observed.add('event.'+action.eventId);}
     observed.add('action.'+action.id);interactions.push({state,actionId:action.id,disabled,source,result:actual});await guard();
    }
   }
   if(errors.length)throw new Error('FRONTEND_BROWSER_RUNTIME_FAILED');
   await load(plan.spec.states.initial);await page.screenshot({path:path.join(root,'browser.png'),fullPage:true});
   for(const n of plan.spec.nodes)observed.add('node.'+n.id);
   return {version:1,kind:'fresh-plan-browser-probe',planHash:profile.authority.planHash,authority:profile.authority.scope,browser:{version:browser.version(),executableSha256:toolchain.chrome.executableSha256,viewport:plan.spec.viewport,deviceScaleFactor:1},fonts,observations,interactions,observed:[...observed],businessSideEffects:'non-mutating-trusted-probe-bank-only',normativeAcceptance:'not-run'};
  }finally{signal.removeEventListener('abort',abort);}
 }catch(error){if(signal.aborted)throw new Error('GENERATION_SESSION_STALE');if(/^[A-Z][A-Z0-9_]{1,79}$/.test(error.message))throw error;throw new Error('FRONTEND_BROWSER_VERIFICATION_FAILED');}
 finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
module.exports={browserVerify};
