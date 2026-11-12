const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild'),{JSDOM}=require('jsdom');
const {createExistingDialoguePort}=require('../../src/design-check/dialogue-port');
const root=path.resolve(__dirname,'../..');
const bundle=esbuild.buildSync({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {AssistantAnswer} from './src/design-check/AssistantAnswer';export function mount(node,props){const root=createRoot(node);flushSync(()=>root.render(<AssistantAnswer {...props}/>));return()=>flushSync(()=>root.unmount());}`,resolveDir:root,loader:'jsx'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'GuideCardTest',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
test('guide families share one disclosure using the existing Apollo overview surface and radius',()=>{
 const dom=new JSDOM('<style>'+fs.readFileSync(path.join(root,'src/design-check/new-shell.css'),'utf8')+'</style><div class="apollo-new"><div class="apollo-overview-group" id="reference"></div><div id="root"></div></div>',{runScripts:'dangerously',pretendToBeVisual:true,url:'https://apollo-fixture.invalid/'});
 const w=dom.window,d=w.document;w.eval(bundle);
 const blocks=[{kind:'text',text:'**Правило АБМ**\n\n🍏 [Пример](https://example.test/ios)'},...['hig','material2','material3'].map(family=>({kind:'guide',family,text:'- Проверенная рекомендация\n\nГайд: '+family}))];
 const close=w.GuideCardTest.mount(d.querySelector('#root'),{text:blocks.map(b=>b.text).join('\n\n'),blocks});
 try{
  const cards=[...d.querySelectorAll('.apollo-guide-recommendations')];assert.equal(cards.length,1);
  assert.equal(cards[0].querySelector('.apollo-guide-recommendations__title').textContent,'Рекомендации гайдов');
  assert.equal(cards[0].querySelector('.apollo-guide-recommendations__families').textContent,'HIG · Material 2 · Material 3');
  assert.equal(cards[0].open,false);cards[0].querySelector('summary').click();assert.equal(cards[0].open,true);cards[0].querySelector('summary').click();assert.equal(cards[0].open,false);
  assert.deepEqual([...cards[0].querySelectorAll('h4')].map(h=>h.textContent),['HIG','Material 2','Material 3']);
  assert(!d.querySelector('strong').closest('.apollo-guide-recommendations'));
  assert.equal(d.querySelector('a').href,'https://example.test/ios');
  const reference=w.getComputedStyle(d.querySelector('#reference'));
  for(const card of cards){const style=w.getComputedStyle(card);assert.equal(style.backgroundColor,reference.backgroundColor);assert.equal(style.borderRadius,reference.borderRadius);assert.equal(style.padding,'20px');assert.equal(card.querySelectorAll('li').length,3);}
 }finally{close();dom.window.close();}
});
test('ordinary Markdown and guide-like words alone do not create recommendation cards',()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously'});dom.window.eval(bundle);
 const close=dom.window.GuideCardTest.mount(dom.window.document.querySelector('#root'),{text:'Гайд: HIG — обычный текст'});
 assert.equal(dom.window.document.querySelectorAll('.apollo-guide-recommendations').length,0);close();dom.window.close();
});
test('the dialogue port preserves valid blocks and rejects untrusted family or text mismatches',async()=>{
 const send=async blocks=>{
  const port=createExistingDialoguePort({endpoint:'http://localhost:3001/analyze',createSessionId:()=> 'card-fixture',request:async()=>({ok:true,json:async()=>({success:true,source:'codex',result:'Verified text',answerBlocks:blocks})})});
  return port.send({source:'codex',question:'Fixture',dialogue:[],context:null});
 };
 const blocks=[{kind:'guide',family:'hig',text:'Verified text'}];assert.deepEqual((await send(blocks)).answerBlocks,blocks);
 await assert.rejects(send([{kind:'guide',family:'unknown',text:'Verified text'}]),/блоки/);
 await assert.rejects(send([{kind:'guide',family:'hig',text:'Different text'}]),/блоки/);
});

test('one disclosure retains the question of each recommendation without empty outside headings',()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously'});dom.window.eval(bundle);const d=dom.window.document;
 const blocks=[{kind:'text',text:'**Первый вопрос?**',questionHeading:true},{kind:'guide',family:'hig',question:'Первый вопрос?',text:'Рекомендация первого вопроса.'},{kind:'text',text:'**Второй вопрос?**',questionHeading:true},{kind:'text',text:'Правило второго вопроса.'},{kind:'guide',family:'material3',question:'Второй вопрос?',text:'Рекомендация второго вопроса.'}];
 const close=dom.window.GuideCardTest.mount(d.querySelector('#root'),{text:blocks.map(b=>b.text).join('\n\n'),blocks});
 assert.equal(d.querySelectorAll('details').length,1);
 assert.deepEqual([...d.querySelectorAll('.apollo-guide-recommendations__question')].map(p=>p.textContent),['Первый вопрос?','Второй вопрос?']);
 assert.equal(d.querySelector('#root > .apollo-answer-blocks > .markdown-root').textContent,'Второй вопрос?');
 close();dom.window.close();
});
