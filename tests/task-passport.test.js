const assert = require('node:assert/strict');
const test = require('node:test');
const { createTaskPassportBridge, captureFlow } = require('../src/skills/task-passport/native');
const { WIRE, briefError, passportCsv } = require('../src/skills/task-passport/protocol');

function canvas() {
  let last = 0;
  const nodes = new Map();
  function node(type,name) {
    const data = new Map();
    const layer = {id:''+(++last),type,name,visible:true,opacity:1,children:[],parent:null,removed:false,
      absoluteBoundingBox:{x:100,y:100,width:400,height:800},
      setSharedPluginData:(ns,key,value) => data.set(ns+key,value),
      getSharedPluginData:(ns,key) => data.get(ns+key)||'',
      resize(width) { this.width = width; },
      remove() {
        if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this),1);
        this.parent = null;
        this.removed = true;
      },
      appendChild(child) { this.insertChild(this.children.length,child); },
      insertChild(index,child) {
        if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child),1);
        this.children.splice(index,0,child);
        child.parent = this;
      },
    };
    nodes.set(layer.id,layer);
    return layer;
  }
  const page = node('PAGE','Демо');
  const section = node('SECTION','Новый платёж');
  const form = node('FRAME','Сумма'), success = node('FRAME','Готово');
  success.absoluteBoundingBox.x += 500;
  const button = Object.assign(node('INSTANCE','Button'),{reactions:[{actions:[{type:'NODE',destinationId:success.id}]}]});
  const label = Object.assign(node('TEXT','Label'),{characters:'Подписать'});
  button.appendChild(label);
  const hidden = Object.assign(node('GROUP','Приватная заметка'),{visible:false});
  hidden.appendChild(Object.assign(node('TEXT','Не читается'),{characters:'Не отправлять'}));
  form.appendChild(button);
  form.appendChild(hidden);
  section.appendChild(form);
  section.appendChild(success);
  page.appendChild(section);
  const connector = Object.assign(node('CONNECTOR','Стрелка'),{
    connectorStart:{endpointNodeId:label.id},connectorEnd:{endpointNodeId:success.id},
  });
  page.appendChild(connector);
  page.selection = [section];
  const api = {
    currentPage:page,loadFontAsync:async () => {},
    createFrame() { const frame = node('FRAME',''); page.appendChild(frame); return frame; },
    createText() { const text = node('TEXT',''); page.appendChild(text); return text; },
  };
  return {api,page,section,label,success,nodes};
}

const draft = {status:'draft',sections:[{title:'Контекст',rows:[{label:'Действие',items:[
  {value:'Подписать',source:'layout',screen:'Сумма',quote:'Подписать'},
]}]}]};

function bridge(api, options = {}) {
  let sequence = 0;
  const pending = new Map();
  const native = createTaskPassportBridge({api,hash:JSON.stringify,...options,post:message => {
    pending.get(message.requestId)(message);
    pending.delete(message.requestId);
  }});
  const call = (operation,payload) => new Promise(resolve => {
    const requestId = 'request-'+(++sequence);
    pending.set(requestId,resolve);
    assert.equal(native.accept({type:'task-passport-request',schemaVersion:WIRE,requestId,operation,payload}),true);
  });
  call.busy = native.busy;
  return call;
}

test('reads visible selected screens, identifies actions and binds arrows and prototype', () => {
  const {api} = canvas();
  const {snapshot} = captureFlow(api);
  assert.deepEqual(snapshot.screens.map(s => s.name),['Сумма','Готово']);
  assert.deepEqual(snapshot.screens[0].texts,['Подписать']);
  assert.deepEqual(snapshot.screens[0].buttons,['Подписать']);
  assert.deepEqual(snapshot.links,[
    {from:'s1',to:'s2',signal:'prototype'},{from:'s1',to:'s2',signal:'connector'},
  ]);
});

test('save checks the current text after loading fonts and updates the same frame', async () => {
  const {api,page,label,nodes} = canvas(), call = bridge(api);
  const {result:{captureId}} = await call('capture',null);
  const save = {captureId,result:draft};
  const {result:first} = await call('save',save);
  assert.equal(first.updated,false);
  const current = nodes.get(first.frameId);
  const previousBody = current.children[0];
  const {result:second} = await call('save',save);
  assert.deepEqual(second,{frameId:first.frameId,updated:true});
  assert.equal(previousBody.removed,true);

  const body = current.children[0];
  const createText = api.createText;
  api.createText = () => { throw Error('Figma rejected creation'); };
  assert.equal((await call('save',save)).error,'TASK_PASSPORT_WRITE_FAILED');
  assert.deepEqual(current.children,[body]);
  api.createText = createText;

  api.loadFontAsync = async () => { label.characters = 'Другой текст'; };
  assert.equal((await call('save',save)).error,'TASK_PASSPORT_STALE');
  assert.equal(page.children.filter(n => n.getSharedPluginData('neuroredakciya','type') === 'task-passport').length,1);
  assert.deepEqual(current.children,[body]);
});

test('brief is optional with a size limit, CSV keeps sources and neutralizes formulas', () => {
  assert.equal(briefError(''),'');
  assert.equal(briefError('Доработка платежей.'),'');
  assert.match(briefError('а'.repeat(8001)),/8 000/);
  draft.sections[0].rows[0].items[0].value = '=1+1';
  const csv = passportCsv(draft);
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('Из макета · Сумма'));
});

test('capture can read during another task; save keeps its busy and post-await freshness guards', async () => {
  const {api,page} = canvas(), original = page.children.slice();
  let otherBusy = true;
  const call = bridge(api,{isBusy:() => otherBusy});
  const read = await call('capture',null);
  assert.equal(read.error,undefined);
  assert.equal(read.result.snapshot.screens.length,2);
  assert.deepEqual(page.children,original);
  assert.equal(call.busy(),false);
  const save = {captureId:read.result.captureId,result:draft};
  assert.equal((await call('save',save)).error,'TASK_PASSPORT_BUSY');
  otherBusy = false;
  let release;
  // Both fonts share one host wait so the other operation can start before write.
  const fonts = new Promise(resolve => { release = resolve; });
  api.loadFontAsync = () => fonts;
  const saving = call('save',save);
  assert.equal(call.busy(),true);
  assert.equal((await call('capture',null)).error,'TASK_PASSPORT_BUSY');
  otherBusy = true;
  release();
  assert.equal((await saving).error,'TASK_PASSPORT_STALE');
  assert.equal(call.busy(),false);
  assert.deepEqual(page.children,original);
});

test('passport formation is independent of other tasks; own duplicate start and native writes stay guarded', async () => {
  const { createTaskPassportClient } = require('../src/skills/task-passport/client');
  let otherBusy = true, finish, saved, client, ready;
  const reached = new Promise(resolve => { ready = resolve; });
  const messages = [], requests = [];
  client = createTaskPassportClient({endpoint:'http://fixture',isBusy:() => otherBusy,
    send(message) {
      messages.push(message);
      const reply = result => client.accept({type:'task-passport-reply',requestId:message.requestId,result});
      if (message.operation === 'capture') queueMicrotask(() => reply({captureId:'own-capture',snapshot:{screens:[{}]}}));
      else saved = () => reply({frameId:'saved-frame'});
    },
    request(url, options) {
      requests.push({url,options});ready();
      return new Promise(resolve => { finish = () => resolve(Response.json({schemaVersion:WIRE,
        id:'run_a33681d8-e5b6-41c1-a499-e40a54186d57',status:'completed',result:draft})); });
    },
  });
  client.selection({pageId:'page',id:'flow',name:'Флоу',valid:true});client.refresh();
  assert.equal(client.getState().available,false);
  const forming = client.start();
  await Promise.race([reached,forming]);
  assert.equal(requests.length,1,'formation can start while another task is busy');
  assert.equal(client.busy(),false,'read-only formation must not block another tool');
  await client.start();
  assert.equal(requests.length,1,'same passport cannot start twice');
  finish();await forming;
  assert.equal(client.getState().phase,'draft');
  await client.save();
  assert.equal(messages.filter(m => m.operation === 'save').length,0);
  otherBusy = false;client.refresh();
  const saving = client.save();
  assert.equal(client.busy(),true,'native save keeps the shared write gate');
  saved();await saving;
  assert.equal(client.getState().saved,true);
  assert.equal(client.busy(),false);
});
