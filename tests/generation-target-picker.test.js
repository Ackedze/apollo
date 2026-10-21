const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild'),{JSDOM}=require('jsdom');
const app=path.resolve(__dirname,"..");
const code=esbuild.buildSync({stdin:{contents:fs.readFileSync(path.join(app,"./src/generation/chat/ui.js"),'utf8')+'\nmodule.exports.flush=require("react-dom").flushSync;',resolveDir:path.join(app,"./src/generation/chat")},bundle:true,write:false,outfile:path.join(app,"./tests/generation-target-picker.bundle.js"),platform:'browser',format:'iife',globalName:'QA',loader:{'.module.css':'local-css'},define:{'process.env.NODE_ENV':'"production"'}}).outputFiles.find(file=>file.path.endsWith('.js')).text;

test('generation target button displays the current selection on mount, choice and restored change',async()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(app,"./src/ui.html"),'utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'https://apollo.test/'}),w=dom.window,d=w.document;
 try{
  const root=d.querySelector('#generation-panel');d.body.append(root);
  const select=d.createElement('select');select.id='agent-generation-target';
  const options=[['frontend','Фронт'],['figma-owned','Figma · новый макет'],['figma','Figma · чтение лаборатории']];
  for(const [value,label] of options)select.add(new w.Option(label,value));root.append(select);
  let inputs=0,changes=0;select.addEventListener('input',()=>inputs++);select.addEventListener('change',()=>changes++);
  w.eval(code+'\nwindow.QA=QA;');
  const chat=w.QA.mountGenerationChat({root,controller:{subscribe(){},getState:()=>({mode:'generation',chat:{open:false}})}});
  const button=()=>root.querySelector('#generation-target-holder .generation-picker-button');
  assert.equal(button().textContent,'Фронт');assert.equal(select.hidden,true);assert.equal(select.getAttribute('aria-label'),'Где собирать');
  for(const [value,label] of options){
   w.QA.flush(()=>button().click());
   const menu=root.querySelector('#generation-target-holder .generation-select-menu');assert.equal(menu.getAttribute('aria-label'),'Где собирать');
   const option=Array.from(menu.querySelectorAll('button')).find(b=>b.textContent===label);assert.ok(option);
   w.QA.flush(()=>option.click());
   assert.equal(select.value,value);assert.equal(button().textContent,label);assert.equal(button().getAttribute('aria-expanded'),'false');assert.equal(d.activeElement,button());
  }
  assert.equal(inputs,3);assert.equal(changes,3);
  w.QA.flush(()=>{select.value='figma-owned';select.dispatchEvent(new w.Event('change',{bubbles:true}));});
  assert.equal(button().textContent,'Figma · новый макет');
  w.QA.flush(()=>button().dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
  await new Promise(resolve=>w.requestAnimationFrame(resolve));
  assert.equal(d.activeElement.textContent,'Figma · новый макет');
  w.QA.flush(()=>d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(button().getAttribute('aria-expanded'),'false');assert.equal(d.activeElement,button());
  select.disabled=true;await new Promise(resolve=>w.setTimeout(resolve,0));w.QA.flush(()=>chat.refresh());
  assert.equal(button().disabled,true);assert.equal(button().textContent,'Figma · новый макет');
 }finally{w.close();}
});
