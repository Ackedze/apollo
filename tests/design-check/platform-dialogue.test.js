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
test('changing the picker during a Web request is refused without aborting the request or discarding its answer',async()=>{
 let resolve;
 const pending=new Promise(done=>{resolve=done;}),requests=[];
 const controller=createDesignCheckController({dialogue:{cancelScope:'client-only',send:async value=>{requests.push(value);return requests.length===1?pending:{text:'ABM answer',source:'codex'};}}});
 const sent=controller.sendChat('First question');
 assert.equal(requests[0].dialoguePlatform,'Desktop');
 assert.equal(controller.updateSetting('pickerLabel','iOS'),false);
 assert.equal(controller.getState().settings.pickerLabel,'Desktop');
 assert.equal(requests[0].signal.aborted,false);
 resolve({text:'Desktop answer',source:'codex'});await sent;
 assert(!controller.getState().chat.busy);
 assert(controller.getState().chat.messages.some(entry=>entry.text==='Desktop answer'));
 assert.equal(controller.updateSetting('pickerLabel','iOS'),true);
 await controller.sendChat('Second question');assert.equal(requests[1].dialoguePlatform,'iOS');
 assert.equal(controller.getState().chat.error,'');controller.destroy();
});
test('a busy server also locks the picker after client Stop until health confirms it is free',async()=>{
 let resolve,serverBusy=false;
 const pending=new Promise(done=>{resolve=done;});
 const controller=createDesignCheckController({dialogue:{cancelScope:'client-only',status:async()=>({available:true,version:'test',busy:serverBusy}),send:async()=>{serverBusy=true;return pending;}}});
 const sent=controller.sendChat('Pending Web question');
 await new Promise(done=>setImmediate(done));controller.cancelChat();
 assert.equal(controller.updateSetting('pickerLabel','iOS'),false);
 await controller.refreshProxyStatus();assert.equal(controller.updateSetting('pickerLabel','iOS'),false);
 serverBusy=false;resolve({text:'Old answer'});await sent;await controller.refreshProxyStatus();
 assert.equal(controller.updateSetting('pickerLabel','iOS'),true);controller.destroy();
});

test('ABM sends fifteen exchanges and excludes AB messages while preserving AB history limits',async()=>{
 const sent=[];const controller=createDesignCheckController({dialogue:{send:async value=>{
  sent.push(value);return {text:'Reply '+value.question,source:'codex',dialogueLibrary:['iOS','Android'].includes(value.dialoguePlatform)?'abm':'ab'};
 }}});
 await controller.sendChat('AB topic');
 controller.updateSetting('pickerLabel','iOS');
 for(let i=0;i<17;i++)await controller.sendChat('ABM topic '+i);
 assert.equal(sent.at(-1).dialogue.length,30);
 assert.equal(sent.at(-1).dialogue[0].text,'ABM topic 1');
 assert(sent.at(-1).dialogue.every(entry=>!entry.text.includes('AB topic')));
 controller.updateSetting('pickerLabel','Desktop');
 await controller.sendChat('AB next');
 assert.equal(sent.at(-1).dialogue.length,12);
 controller.destroy();
});
