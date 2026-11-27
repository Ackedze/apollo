'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {proxyBusy,createExistingDialoguePort}=require('../../src/design-check/dialogue-port');
const {createCompatibilityClient,REQUIREMENTS}=require('../../src/compatibility');
const {createDesignCheckController}=require('../../src/design-check/controller');
const health=()=>({ok:true,proxy:{version:'1.4.55'},capabilities:{parallelDialogue:true,dialoguePlatformRouting:true},dialogue:{busy:false,cancelScope:'server-request'},agent:{busy:true},generation:{busy:true},compatibility:{protocolVersion:REQUIREMENTS.protocolVersion,data:{state:'ready',version:'a'.repeat(64),schemaVersion:REQUIREMENTS.dataSchemaVersion,profileVersion:REQUIREMENTS.dataProfiles.at(-1),deliveryProfile:REQUIREMENTS.deliveryProfile,generatedAt:REQUIREMENTS.minDataGeneratedAt}}});

test('only a complete advertised dialogue capability overrides legacy global busy',()=>{
 const current=health();assert.equal(proxyBusy(current),false);current.dialogue.busy=true;assert.equal(proxyBusy(current),true);
 for(const mutate of [h=>delete h.capabilities.parallelDialogue,h=>delete h.dialogue,h=>delete h.dialogue.cancelScope,h=>h.dialogue.busy='false']){const old=health();mutate(old);assert.equal(proxyBusy(old),true);}
});

test('dialogue transport dispatches while a skill is busy and retains its request abort signal',async()=>{
 const calls=[],signal=new AbortController().signal;
 const port=createExistingDialoguePort({endpoint:'http://localhost:3001/analyze',createSessionId:()=> 'parallel-fixture',request:async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>url.endsWith('/health')?health():{success:true,result:'Independent reply',source:'codex',provider:'codex',dialogueLibrary:'ab'}};}});
 assert.deepEqual(await port.status(),{available:true,version:'1.4.55',busy:false,cancelScope:'server-request'});
 assert.equal((await port.send({source:'codex',question:'Question during skill',dialogue:[],dialoguePlatform:'Desktop',context:null,signal})).text,'Independent reply');
 assert.equal(calls.filter(x=>x.options.method==='POST').length,1);assert.equal(calls.at(-1).options.signal,signal);
});

test('compatibility and controller keep skill progress independent; idle health cannot discard an arriving chat reply',async()=>{
 const state=health();let posts=0,signal,finish;
 const request=async(url,options)=>{
  if(url.endsWith('/health'))return{ok:true,json:async()=>structuredClone(state)};
  posts++;signal=options.signal;state.dialogue.busy=true;
  return new Promise((resolve,reject)=>{finish=()=>resolve({ok:true,json:async()=>({success:true,result:'Arrived reply',source:'codex',dialogueLibrary:'ab'})});signal.addEventListener('abort',()=>reject(Object.assign(Error('Aborted'),{name:'AbortError'})),{once:true});});
 };
 let controller;const compatibility=createCompatibilityClient({endpoint:'http://localhost:3001/health',request,onChange:value=>controller.setProxyStatus(value)});
 const port=createExistingDialoguePort({endpoint:'http://localhost:3001/analyze',request,readStatus:compatibility.refresh,createSessionId:()=> 'controller-fixture'});
 controller=createDesignCheckController({dialogue:port,beforeOperation:compatibility.ensure});
 const sending=controller.sendChat('Question');await new Promise(resolve=>setImmediate(resolve));assert.equal(posts,1);assert.equal(controller.getState().chat.cancelScope,'server-request');
 assert.equal(await controller.sendChat('Cannot overlap this same conversation'),false);await controller.refreshProxyStatus();
 state.dialogue.busy=false;await controller.refreshProxyStatus();assert.equal(controller.getState().chat.busy,true);assert.equal(signal.aborted,false);
 finish();await sending;assert.equal(controller.getState().chat.messages.at(-1).text,'Arrived reply');assert.equal(state.generation.busy,true);assert.equal(state.agent.busy,true);
 const cancelling=controller.sendChat('Cancel only this reply');await new Promise(resolve=>setImmediate(resolve));assert.equal(posts,2);
 assert.equal(controller.cancelChat(),true);assert.equal(signal.aborted,true);await cancelling;
 assert.equal(controller.getState().chat.error,'');assert.match(controller.getState().chat.notice,/Останавливаем ответ/);assert.equal(state.generation.busy,true);
 controller.destroy();
});
