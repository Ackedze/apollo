const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild'),{JSDOM}=require('jsdom');
const app=path.resolve(__dirname,"..");
const code=esbuild.buildSync({stdin:{contents:fs.readFileSync(path.join(app,"./src/generation/agent/ui.js"),'utf8'),resolveDir:path.join(app,"./src/generation/agent")},bundle:true,write:false,platform:'browser',format:'iife',globalName:'DefaultTargetTest',alias:{'@apollo/predicate-engine':path.resolve(app,"./packages/component-contract-core/predicate/index.js")}}).outputFiles[0].text;

test('new generation starts in owned Figma and preserves explicit frontend, laboratory and method choices',async()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(app,"./src/ui.html"),'utf8'),{runScripts:'outside-only'}),w=dom.window,d=w.document,requests=[],messages=[];
 w.fetch=async url=>{requests.push(url);assert.equal(url,'http://localhost:3001/agent/mcp/status');return{ok:true,json:async()=>({success:true,configured:false})};};
 try{
  w.eval(code+'\nwindow.DefaultTargetTest=DefaultTargetTest;');
  const api=w.DefaultTargetTest.mountAgentGeneration({root:d.querySelector('#generation-agent-chat'),settingsRoot:d.querySelector('#generation-agent-settings'),send:message=>messages.push(message)});
  const target=d.querySelector('#agent-generation-target'),method=d.querySelector('#agent-generation-method');
  assert.equal(target.value,'figma-owned');assert.equal(target.selectedOptions[0].textContent,'Figma · новый макет');
  assert.equal(api.target(),'figma');assert.equal(api.method(),'mcp');assert.equal(method.hidden,false);
  const stored=messages.find(m=>m.type==='agent-draft-storage'&&m.operation==='load');assert.ok(stored);
  api.accept({type:'agent-draft-storage-result',requestId:stored.requestId,draft:null});
  await new Promise(resolve=>w.setTimeout(resolve,0));
  assert.match(d.querySelector('#agent-generation-method-hint').textContent,/MCP недоступен/);
  assert.equal(target.value,'figma-owned');assert.equal(method.value,'mcp','unavailable MCP must not silently fall back');
  for(const value of ['frontend','figma']){
   target.value=value;target.dispatchEvent(new w.Event('change',{bubbles:true}));
   assert.equal(target.value,value);assert.equal(api.target(),value);assert.equal(api.method(),null);assert.equal(method.hidden,true);
  }
  target.value='figma-owned';target.dispatchEvent(new w.Event('change',{bubbles:true}));api.setMethod('built-in');
  assert.equal(api.method(),'built-in');api.refresh();assert.equal(method.value,'built-in');
  assert.equal(requests.length,1);assert.equal(messages.filter(m=>m.type==='agent-draft-storage').length,1);
 }finally{w.close();}
});
