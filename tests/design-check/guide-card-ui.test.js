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
  assert.equal(cards[0].querySelector('.apollo-guide-recommendations__title').textContent,'Рекомендации из гайдов');
  assert.equal(cards[0].querySelector('.apollo-guide-recommendations__families'),null);
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
 assert.equal(d.querySelector('.apollo-answer-question').textContent,'Второй вопрос?');
 close();dom.window.close();
});


test('pattern captions, examples, lists and real usage survive the presentation without invented titles',()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously'});dom.window.eval(bundle);const d=dom.window.document;
 const rule='**Условие.**\n\n- Сохраняй 48 dp.\n- Не теряй исключение.\n\n🍏 [Пример](https://example.test/ios)\n\nПаттерн: «Хаптик», v.1.4';
 const footer='*Токены: всего 1 200 · вход 1 000 (из них кеш: 800) · выход 200.*';
 const blocks=[{kind:'text',text:rule},{kind:'text',text:footer}];
 const close=dom.window.GuideCardTest.mount(d.querySelector('#root'),{text:blocks.map(b=>b.text).join('\n\n'),blocks,provenance:'Агент: Codex · база: fixture'});
 assert.equal(d.querySelectorAll('h2,.apollo-answer-kicker').length,0);
 assert.equal(d.querySelectorAll('.apollo-answer-rule').length,1);
 assert.deepEqual([...d.querySelectorAll('.apollo-answer-rule li')].map(li=>li.textContent.replace('–','').trim()),['Сохраняй 48 dp.','Не теряй исключение.']);
 assert.equal(d.querySelector('.apollo-answer-rule a').href,'https://example.test/ios');
 assert.equal(d.querySelector('.apollo-answer-source').textContent,'Паттерн: «Хаптик», v.1.4');
 const details=d.querySelector('.apollo-answer-details');assert.equal(details.open,false);
 assert(details.textContent.includes('всего 1 200'));assert(details.textContent.includes('Агент: Codex'));
 assert.equal(d.querySelectorAll('.apollo-answer-rule .md-em').length,0);
 details.querySelector('summary').click();assert.equal(details.open,true);
 close();dom.window.close();
});

test('guide document titles retain exact safe destinations; ordinary token prose stays in the answer',()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously'});dom.window.eval(bundle);const d=dom.window.document;
 const blocks=[{kind:'text',text:'Токены: это тема вопроса, а не технический счётчик.'},{kind:'guide',family:'hig',text:'Рекомендация.\n\nГайд: HIG — [Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)'}];
 const close=dom.window.GuideCardTest.mount(d.querySelector('#root'),{text:blocks.map(b=>b.text).join('\n\n'),blocks});
 assert.equal(d.querySelectorAll('.apollo-answer-title').length,0);
 assert.equal(d.querySelectorAll('.apollo-answer-details').length,0);
 assert(d.querySelector('.apollo-answer-blocks > .markdown-root').textContent.includes('Токены: это тема'));
 const link=d.querySelector('.apollo-guide-recommendations__source a');
 assert.equal(link.textContent,'Playing haptics');assert.equal(link.href,'https://developer.apple.com/design/human-interface-guidelines/playing-haptics');
 close();dom.window.close();
});


test('several documents from the same family retain a source link immediately after each recommendation',()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously'});dom.window.eval(bundle);const d=dom.window.document;
 const text='Первая рекомендация.\n\nГайд: HIG — [First](https://example.test/first)\n\nВторая рекомендация.\n\nГайд: HIG — [Second](https://example.test/second)';
 const close=dom.window.GuideCardTest.mount(d.querySelector('#root'),{text,blocks:[{kind:'guide',family:'hig',text}]});
 const documents=[...d.querySelectorAll('.apollo-guide-recommendations__document')];assert.equal(documents.length,2);
 assert.equal(documents[0].querySelector('a').href,'https://example.test/first');assert(documents[0].textContent.startsWith('Первая рекомендация.'));
 assert.equal(documents[1].querySelector('a').href,'https://example.test/second');assert(documents[1].textContent.startsWith('Вторая рекомендация.'));
 assert(!d.querySelector('.apollo-guide-recommendations__content').textContent.includes('Гайд:'));
 close();dom.window.close();
});


test('displayed questions use sentence case and one question mark without changing answer wording or input blocks',()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously'});dom.window.eval(bundle);const d=dom.window.document;
 const missing='**Не нашёл ответа в паттернах АБМ. Напиши в чат [помощь](https://example.test/help).**\n\n- насколько увеличивать высоту???';
 const blocks=[{kind:'text',text:'**как показывать поле ввода.**',questionHeading:true},{kind:'text',text:'**Для iOS используй TextArea.**\n\nПаттерн: «Поля ввода», v.2.3'},{kind:'text',text:missing},{kind:'guide',family:'hig',question:'как показывать поле ввода.',text:'Мобильная рекомендация.'}];
 const before=JSON.stringify(blocks);
 const close=dom.window.GuideCardTest.mount(d.querySelector('#root'),{text:blocks.map(b=>b.text).join('\n\n'),blocks});
 assert.equal(d.querySelector('.apollo-answer-question').textContent,'Как показывать поле ввода?');
 assert.equal(d.querySelector('.apollo-guide-recommendations__question').textContent,'Как показывать поле ввода?');
 assert(d.querySelector('.apollo-answer-rule').textContent.includes('Для iOS используй TextArea.'));
 assert(d.querySelector('.apollo-answer-blocks').textContent.includes('Насколько увеличивать высоту?'));
 assert.equal(d.querySelector('a').href,'https://example.test/help');
 assert.equal(JSON.stringify(blocks),before);
 assert.equal(d.querySelectorAll('h2,.apollo-answer-kicker').length,0);
 close();dom.window.close();
});


test('only a change of pattern inserts a divider and it precedes the next question',()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously'});dom.window.eval(bundle);const d=dom.window.document;
 const blocks=[{kind:'text',text:'Первое правило.\n\nПаттерн: «Кнопки», v.1.7'},{kind:'text',text:'Второе правило.\n\nПаттерн: «Кнопки», v.1.7'},{kind:'text',questionHeading:true,text:'**что с полем**'},{kind:'text',text:'Другое правило.\n\nПаттерн: «Поля ввода», v.2.3'}];
 const close=dom.window.GuideCardTest.mount(d.querySelector('#root'),{text:blocks.map(b=>b.text).join('\n\n'),blocks});
 const lines=[...d.querySelectorAll('hr.apollo-answer-separator')];assert.equal(lines.length,1);
 assert(lines[0].nextElementSibling.classList.contains('apollo-answer-question'));
 assert.equal(lines[0].nextElementSibling.textContent,'Что с полем?');
 assert.equal(d.querySelectorAll('.apollo-answer-source').length,3);
 close();dom.window.close();
});


test('explicit guide text blocks render inline with their full source caption while fallback guides keep the card',()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously'});dom.window.eval(bundle);const d=dom.window.document;
 const text='**Используй понятную подпись.**\n\nГайд: HIG — [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)';
 const close=dom.window.GuideCardTest.mount(d.querySelector('#root'),{text,blocks:[{kind:'text',text}]});
 assert.equal(d.querySelectorAll('.apollo-guide-recommendations').length,0);
 assert.equal(d.querySelectorAll('.apollo-answer-inline-guide').length,1);
 assert(d.querySelector('.apollo-guide-recommendations__source').textContent.startsWith('Гайд: HIG — Buttons'));
 assert.equal(d.querySelector('a').href,'https://developer.apple.com/design/human-interface-guidelines/buttons');
 assert.equal(d.querySelectorAll('.apollo-answer-source').length,0);close();dom.window.close();
});
