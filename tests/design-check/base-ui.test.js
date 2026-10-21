const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),esbuild=require('esbuild'),{JSDOM}=require('jsdom');
const {buildResultGroups,baseCheck}=require("../../src/design-check/result-groups");
const app=path.resolve(__dirname,"../.."),peerRequire=createRequire(require.resolve('react-dom/client'));
const code=esbuild.buildSync({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {AuditOverview} from './src/design-check/AuditOverview';import {DocumentAuditCards} from './src/design-check/DocumentAudit';export function mount(node,kind,props){const root=createRoot(node),render=props=>root.render(<div className="design-check-shell apollo-new">{kind==='overview'?<AuditOverview {...props}/>:<DocumentAuditCards {...props}/>}</div>);render(props);return{render,close:()=>root.unmount()};}`,resolveDir:app,loader:'jsx'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'QA',nodePaths:require.resolve.paths('react-dom/client')||[],alias:{react:path.dirname(peerRequire.resolve('react/package.json'))},define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
function state(theme='theme-current',font='font-current',incomplete=false){
 const finding=(status,id)=>({findingId:id,status,name:'Страница: Страница',message:status==='theme-mismatch'?'На текущей странице не выбран явный режим Corp.':status==='font-mismatch'?'На текущей странице выбран System (SF). Выбери AlfaSans в коллекции Font.':status==='unknown'?'Не удалось подтвердить режим Font.':'Режим корректный',componentKey:null,owner:null,occurrences:[],targets:[{id:id+'-target',kind:'page-anchor',nodeId:'selected',pageId:'page'}],evidence:{actualModeName:status==='theme-current'?'Corp':status==='theme-mismatch'?'Default':status==='font-current'?'AlfaSans':'System (SF)'}});
 return{auditStale:false,documentAudit:{status:'available',result:{checks:[{id:'theme',status:incomplete?'incomplete':'complete',scope:'page',gaps:incomplete?['variable-collection-unavailable']:[],checked:1,findings:[finding(theme,'theme')]},{id:'font',status:font==='unknown'?'incomplete':'complete',scope:'page',gaps:font==='unknown'?['font-collection-unavailable']:[],checked:1,findings:[finding(font,'font')]}]}},tabs:{themization:{status:'not-connected'}},auditProgress:''};
}
const summary=s=>buildResultGroups(s,[{id:'themization',title:'Темизация'}],()=>[]),wait=()=>new Promise(r=>setTimeout(r,30));
async function harness(kind,props,run){
 const css=fs.readFileSync(path.join(app,"./src/design-check/new-shell.css"),'utf8'),dom=new JSDOM('<style>'+css+'</style><div id="mount"></div>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://apollo.test/'}),w=dom.window;
 Object.defineProperty(w,'innerWidth',{value:800});Object.defineProperty(w,'innerHeight',{value:860});w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 w.eval(code+'\nwindow.QA=QA;');const root=w.QA.mount(w.document.getElementById('mount'),kind,props);
 try{await wait();await run(w,root);}finally{root.close();w.close();}
}
test('confirmed Corp with incomplete unrelated coverage renders grey Base and no error/action badge',async()=>{
 const s=state('theme-current','font-current',true);let opens=0;
 await harness('overview',{state:s,summary:summary(s),busy:false,checkedScope:'Область',onOpen(){},onBase(){opens++;}},async w=>{
  const button=w.document.querySelector('.apollo-base-result');assert.equal(button.textContent,'База');assert.equal(w.getComputedStyle(button).backgroundColor,'rgba(0, 0, 0, 0.04)');
  assert.equal(button.querySelector('.apollo-group-count'),null);assert.doesNotMatch(w.document.body.textContent,/Темизация не подтверждена|Установи темизацию|Сменить|Подробнее/);
  assert.equal(w.document.querySelector('.apollo-mascot svg'),null);button.click();assert.equal(opens,1);
 });
});
test('Base counter follows two, one and zero errors and keeps the ordinary card background',async()=>{
 const s=state('theme-mismatch','font-mismatch'),props={state:s,summary:summary(s),busy:false,checkedScope:'Область',onOpen(){},onBase(){}};
 await harness('overview',props,async(w,root)=>{
  assert.equal(w.document.querySelector('.apollo-base-result .apollo-group-count').textContent,'2');
  const fixedTheme=state('theme-current','font-mismatch');root.render(Object.assign({},props,{state:fixedTheme,summary:summary(fixedTheme)}));await wait();assert.equal(w.document.querySelector('.apollo-base-result .apollo-group-count').textContent,'1');
  const fixedFont=state();root.render(Object.assign({},props,{state:fixedFont,summary:summary(fixedFont)}));await wait();assert.equal(w.document.querySelector('.apollo-base-result .apollo-group-count'),null);
 });
});
test('nested Base displays only problematic Theme/Font cards and preserves guarded nested Theme correction',async()=>{
 let actions=0;const s=state('theme-mismatch','font-mismatch'),props={check:baseCheck(s.documentAudit.result),tab:'themization',actionsEnabled:true,mutationEnabled:true,onFocus(){},onAction(){actions++;},actionData:{items:[{findingId:'theme',actions:[{actionId:'theme-action',targetId:'theme-target',label:'Сменить',description:'Сменить Theme текущей страницы на Corp.'}]}]}};
 await harness('cards',props,async(w,root)=>{
  assert.equal(w.document.querySelectorAll('.apollo-finding-card').length,2);assert.equal(w.document.querySelectorAll('.apollo-finding-status.violation').length,2);
  assert.match(w.document.body.textContent,/System \(SF\)/);const action=w.document.querySelector('button[aria-label^="Сменить:"]');action.click();assert.equal(actions,1);
  const fixed=state('theme-current','font-mismatch');root.render(Object.assign({},props,{check:baseCheck(fixed.documentAudit.result)}));await wait();assert.equal(w.document.querySelectorAll('.apollo-finding-card').length,1);assert.equal(w.document.querySelector('button[aria-label^="Сменить:"]'),null);assert.doesNotMatch(w.document.body.textContent,/Corp.*Corp/);
  root.render(Object.assign({},props,{check:baseCheck(state().documentAudit.result)}));await wait();assert.equal(w.document.querySelectorAll('.apollo-finding-card').length,0);assert.match(w.document.body.textContent,/замечаний по базе нет/);
 });
});
test('unavailable Font remains a yellow unknown card and stale Theme correction stays disabled',async()=>{
 const s=state('theme-mismatch','unknown'),props={check:baseCheck(s.documentAudit.result),tab:'themization',actionsEnabled:true,mutationEnabled:true,onFocus(){},staleFindingIds:['theme'],actionData:{items:[{findingId:'theme',actions:[{actionId:'theme-action',targetId:'theme-target',label:'Сменить',description:'Сменить Theme текущей страницы на Corp.'}]}]}};
 await harness('cards',props,async w=>{assert.equal(w.document.querySelectorAll('.apollo-finding-status.warning').length,1);assert.equal(w.document.querySelector('button[aria-label^="Сменить:"]').disabled,true);assert.match(w.document.body.textContent,/часть данных недоступна/);});
});
