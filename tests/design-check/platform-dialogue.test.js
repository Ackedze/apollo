const test = require('node:test'), assert = require('node:assert/strict');
const {createDesignCheckController} = require('../../src/design-check/controller');
const {createExistingDialoguePort} = require('../../src/design-check/dialogue-port');
const input = platform => ({source:'codex',question:'Как использовать хаптик?',dialogue:[],dialoguePlatform:platform,context:null,signal:new AbortController().signal});
test('the controller forwards the current picker on every question, including changes in the same chat', async () => {
 const requests=[];
 const dialogue=createExistingDialoguePort({endpoint:'http://localhost:3001/analyze',createSessionId:()=> 'platform-fixture',
  request:async (_url,options)=>{
   if(options.method==='GET')return {ok:true,json:async()=>({ok:true,capabilities:{dialoguePlatformRouting:true}})};
   const body=JSON.parse(options.body);requests.push(body);
   return {ok:true,json:async()=>({success:true,source:'codex',dialogueLibrary:['iOS','Android'].includes(body.dialoguePlatform)?'abm':'ab',result:'Synthetic answer'})};
  }});
 const controller=createDesignCheckController({dialogue});
 for(const platform of ['iOS','Android','Desktop','MobileWeb']) {
  controller.updateSetting('pickerLabel',platform);
  await controller.sendChat('Как использовать хаптик?');
  assert.equal(controller.getState().chat.error,'');
  assert.equal(requests.at(-1).dialoguePlatform,platform);
  assert.equal(JSON.parse(requests.at(-1).text).question,'Как использовать хаптик?');
 }
 assert.equal(new Set(requests.map(body=>body.session_id)).size,1);
 assert.equal(requests[1].dialogue.length,2);
 controller.destroy();
});
test('an old Proxy is rejected before any model request and returned library mismatches are not displayed',async()=>{
 for(const compatible of [false,true]) {
  const methods=[];
  const port=createExistingDialoguePort({endpoint:'http://localhost:3001/analyze',createSessionId:()=> 'platform-fixture',
   request:async(_url,options)=>{
    methods.push(options.method);
    return {ok:true,json:async()=>options.method==='GET'
     ?{ok:true,capabilities:{dialoguePlatformRouting:compatible}}
     :{success:true,source:'codex',dialogueLibrary:'ab',result:'Wrong library'}};
   }});
  await assert.rejects(port.send(input('iOS')),/обнови|Обнови/);
  assert.deepEqual(methods,compatible?['GET','POST']:['GET']);
 }
});
test('invalid platforms never cause a network request',async()=>{
 let calls=0;
 const port=createExistingDialoguePort({endpoint:'http://localhost:3001/analyze',createSessionId:()=> 'platform-fixture',request:async()=>{calls++;}});
 await assert.rejects(port.send(input('Tablet')),/Unsupported/);
 assert.equal(calls,0);
});
test('changing the picker while waiting discards a response from the previous platform',async()=>{
 let resolve;
 const pending=new Promise(done=>{resolve=done;}),requests=[];
 const controller=createDesignCheckController({dialogue:{cancelScope:'client-only',send:async value=>{requests.push(value);return pending;}}});
 const sent=controller.sendChat('First question');
 assert.equal(requests[0].dialoguePlatform,'Desktop');
 controller.updateSetting('pickerLabel','iOS');
 assert(requests[0].signal.aborted);
 resolve({text:'Old desktop answer',source:'codex'});await sent;
 assert(!controller.getState().chat.busy);
 assert(!controller.getState().chat.messages.some(entry=>entry.role==='assistant'));
 controller.destroy();
});
