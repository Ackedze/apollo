const { createOpaqueId } = require('../../design-check/opaque-id');
const { WIRE, briefError, resultValid, passportCsv } = require('./protocol');
const RUN_KEY = 'X-Apollo-Task-Passport-Key';
const MESSAGES = {
  OPENROUTER_DISABLED:'Включите OpenRouter в настройках Apollo Proxy.',
  OPENROUTER_PROXY_REQUIRED:'Запустите Proxy через ApolloProxyControl.',
  OPENROUTER_APPROVAL_REQUIRED:'Отправка в OpenRouter не подтверждена. Можно повторить сборку.',
  OPENROUTER_KEY_REQUIRED:'Подключите API-ключ OpenRouter в настройках Proxy.',
  OPENROUTER_KEY_REJECTED:'OpenRouter отклонил ключ. Проверьте подключение в Proxy.',
  OPENROUTER_CREDITS_REQUIRED:'Проверьте баланс или лимит ключа OpenRouter.',
  OPENROUTER_RATE_LIMIT:'OpenRouter ограничил число запросов. Повторите позже.',
  OPENROUTER_TIMEOUT:'OpenRouter не ответил вовремя. Повторите сборку.',
  OPENROUTER_UNAVAILABLE:'OpenRouter сейчас недоступен. Повторите позже.',
  TASK_PASSPORT_BUSY:'Дождитесь завершения другой операции Apollo.',
  TASK_PASSPORT_SELECTION_REQUIRED:'Выделите секцию, группу или экраны в Figma.',
  TASK_PASSPORT_CAPTURE_LIMIT:'В выделении слишком много данных. Выберите часть флоу.',
  TASK_PASSPORT_AREA_INVALID:'Не удалось прочитать размеры флоу. Проверьте выделение.',
  TASK_PASSPORT_INPUT_INVALID:'Proxy отклонил данные флоу. Попробуйте выделить меньше экранов.',
  TASK_PASSPORT_RESPONSE_INVALID:'В ответе не хватает подтверждённых данных для паспорта. Попробуйте уточнить бриф.',
  TASK_PASSPORT_RUN_UNAVAILABLE:'Результат запуска больше недоступен. Соберите паспорт заново.',
  TASK_PASSPORT_STALE:'Бриф или выделение изменились. Соберите паспорт заново.',
  TASK_PASSPORT_FRAME_CONFLICT:'Для этого флоу уже есть паспорт, который Apollo не может обновить. Скачайте CSV.',
  TASK_PASSPORT_WRITE_FAILED:'Не удалось записать паспорт в Figma. Можно скачать CSV.',
  TASK_PASSPORT_INCOMPATIBLE:'Нужна совместимая версия Apollo Proxy с поддержкой паспорта задачи.',
};
const problem = code => Object.assign(Error(MESSAGES[code] || 'Не удалось связаться с Proxy. Проверьте подключение.'),{code});
const busyPhase = phase => ['reading','awaiting_approval','analyzing','saving'].includes(phase);

function createTaskPassportClient({send, endpoint, request = fetch, beforeOperation, isBusy = () => false, onChange = () => {}}) {
  let selectionKey = '', active = null, capture = null;
  let state = {phase:'idle',brief:'',scope:'',validSelection:false,available:true,error:'',briefInvalid:false,result:null,stale:false,saved:false};
  const listeners = new Set(), pending = new Map();
  const busy = () => busyPhase(state.phase);
  function set(patch) {
    state = Object.assign({},state,patch);
    for (const listener of listeners) listener();
    onChange();
  }
  function native(operation, payload) {
    const requestId = createOpaqueId();
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(Error(operation === 'save' ? 'Figma не подтвердила запись. Проверьте фрейм на канве или скачайте CSV.' :
          'Figma не ответила. Повторите сборку.'));
      },30000);
      pending.set(requestId,{resolve,reject,timer});
      send({type:'task-passport-request',schemaVersion:WIRE,requestId,operation,payload});
    });
  }
  async function proxy(path, init) {
    const response = await request(endpoint+path,init);
    const body = await response.json().catch(() => null);
    if (!response.ok) throw problem(response.status === 404 && path === '/runs' ? 'TASK_PASSPORT_INCOMPATIBLE' : body?.error);
    return body;
  }
  async function cancelRemote(operation) {
    if (!operation.id || operation.cancelling) return;
    operation.cancelling = true;
    await proxy('/runs/'+operation.id+'/cancel',{method:'POST',headers:operation.headers,
      signal:AbortSignal.timeout(8000),keepalive:true}).catch(() => {});
  }
  function cancel() {
    const operation = active;
    if (!operation) return;
    active = null;
    operation.controller.abort();
    void cancelRemote(operation);
    set({phase:'idle',error:'Сборка остановлена.'});
  }
  function ensureLive(operation) {
    if (active !== operation || operation.scope !== selectionKey) throw Error('Отменено');
  }
  function checkRun(run) {
    if (run?.schemaVersion !== WIRE || typeof run.id !== 'string' ||
        !/^run_[a-f0-9-]{36}$/.test(run.id)) throw problem('TASK_PASSPORT_INCOMPATIBLE');
  }

  return {
    busy:() => state.phase === 'saving', getState:() => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    refresh() {
      const available = !isBusy();
      if (available !== state.available) set({available});
    },
    selection(message) {
      const key = message.pageId+':'+message.id;
      if (key === selectionKey) return;
      selectionKey = key;
      if (active) cancel();
      set({scope:message.name || '',validSelection:message.valid === true,stale:state.result?.status === 'draft'});
    },
    edit(value) {
      if (!busy()) set({brief:value,briefInvalid:false,error:''});
    },
    editBrief() {
      if (!busy()) set({phase:'idle',result:null,error:'',stale:false,saved:false});
    },
    accept(message) {
      if (message?.type !== 'task-passport-reply') return false;
      const waiter = pending.get(message.requestId);
      if (!waiter) return true;
      pending.delete(message.requestId);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(problem(message.error));
      else waiter.resolve(message.result);
      return true;
    },
    async start() {
      if (busy() || !state.validSelection) return;
      const brief = state.brief.trim(), error = briefError(brief);
      if (error) { set({error,briefInvalid:true}); return; }
      const operation = {controller:new AbortController(),scope:selectionKey,id:null,headers:null};
      active = operation;
      set({phase:'reading',error:'',result:null,stale:false,saved:false,briefInvalid:false});
      try {
        await beforeOperation?.();
        ensureLive(operation);
        const read = await native('capture',null);
        ensureLive(operation);
        if (!read?.captureId || !read?.snapshot?.screens?.length) throw problem('TASK_PASSPORT_AREA_INVALID');
        const bytes = new Uint8Array(32);
        globalThis.crypto.getRandomValues(bytes);
        operation.headers = {'Content-Type':'application/json',[RUN_KEY]:Array.from(bytes,b => b.toString(16).padStart(2,'0')).join('')};
        let run = await proxy('/runs',{method:'POST',headers:operation.headers,
          body:JSON.stringify({schemaVersion:WIRE,brief,snapshot:read.snapshot}),signal:AbortSignal.timeout(15000)});
        checkRun(run);
        operation.id = run.id;
        ensureLive(operation);
        const deadline = Date.now()+190000;
        while (['awaiting_approval','analyzing'].includes(run.status)) {
          if (state.phase !== run.status) set({phase:run.status});
          if (Date.now() >= deadline) throw problem('OPENROUTER_TIMEOUT');
          await new Promise(resolve => setTimeout(resolve,500));
          ensureLive(operation);
          run = await proxy('/runs/'+operation.id,{headers:operation.headers,
            signal:AbortSignal.any([operation.controller.signal,AbortSignal.timeout(12000)])});
          checkRun(run);
          if (run.id !== operation.id) throw problem('TASK_PASSPORT_INCOMPATIBLE');
          ensureLive(operation);
        }
        if (run.status !== 'completed') throw problem(run.error);
        if (!resultValid(run.result)) throw problem('TASK_PASSPORT_RESPONSE_INVALID');
        capture = read;
        set({phase:run.result.status,result:run.result});
      } catch (error) {
        void cancelRemote(operation);
        if (active === operation) set({phase:'idle',error:error instanceof TypeError ? problem().message : error.message});
      } finally {
        if (active === operation) active = null;
      }
    },
    cancel,
    async save() {
      if (busy() || isBusy() || state.stale || state.saved || state.result?.status !== 'draft' || !capture) return;
      set({phase:'saving',error:''});
      try {
        const saved = await native('save',{captureId:capture.captureId,result:state.result});
        if (typeof saved?.frameId !== 'string') throw problem('TASK_PASSPORT_WRITE_FAILED');
        set({phase:'draft',saved:true});
      } catch (error) { set({phase:'draft',error:error.message,stale:state.stale || error.code === 'TASK_PASSPORT_STALE'}); }
    },
    download() {
      const url = URL.createObjectURL(new Blob([passportCsv(state.result)],{type:'text/csv;charset=utf-8'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'passport-zadachi.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    },
  };
}

module.exports = { createTaskPassportClient };
