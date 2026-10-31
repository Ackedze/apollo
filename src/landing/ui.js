'use strict';
const {createOpaqueId}=require('../design-check/opaque-id');
require('./ui.css');
const WORKING=new Set(['running','awaiting-canvas','awaiting-readback']);
const uuid=()=>{try{if(typeof globalThis.crypto?.randomUUID==='function')return globalThis.crypto.randomUUID();}catch{}return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16);});};
const BUILD=typeof __APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__==='string'?__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__:null;
const errors={LANDING_SKILL_UNAVAILABLE:'В данных Proxy ещё нет навыка лендингов. Обновите данные.',LANDING_DATA_REQUIRED:'Подключите пакет данных в Proxy.',LANDING_WORKFLOW_REQUIRED:'Для лендингов нужна новая совместимая сборка Proxy.',LANDING_REQUIRED_KNOWLEDGE_MISSING:'В пакете не хватает правил лендингов. Обновите данные Proxy.',LANDING_PROVIDER_UNSUPPORTED:'Для этого сценария выберите Codex в Proxy.',LANDING_CANVAS_STALE:'Макет или его принадлежность изменились. Результат сохранён.',LANDING_OUTSIDE_CHANGED:'Во время сборки изменилось окружение макета. Результат сохранён.',LANDING_UNREQUESTED_CONTENT_CHANGED:'Изменилась секция вне порученной правки. Работа остановлена, макет сохранён.',LANDING_RESULT_INCOMPLETE:'Сборка пока неполная. Можно продолжить в этом чате.',LANDING_REVISION_STALE:'Состояние чата обновилось. Загружаем текущую версию.',LANDING_BUSY:'Дождитесь завершения текущей сборки или остановите её.'};
function mountLanding({root,send,isUnavailable=()=>false,isVisible=()=>true,readPlatform=()=> 'Desktop',onBusy=()=>{},request=fetch}){
 root.classList.add('landing-workspace');root.innerHTML=`
  <div class="landing-toolbar"><h2>Генерация</h2><button type="button" data-new>Новый чат</button></div>
  <label class="landing-history-label">История<select data-history aria-label="История генерации"><option value="">Новый чат</option></select></label>
  <div class="landing-start" data-start><h3>Что создаём?</h3><button type="button" class="landing-skill" data-skill><strong>Лендинг Альфа-Бизнеса</strong><span>Бриф, уточнения и редактируемый макет в Figma</span></button></div>
  <div class="landing-conversation" data-conversation><div data-messages role="log" aria-label="Диалог о лендинге" aria-live="polite" aria-relevant="additions"></div><section data-result hidden aria-label="Результат генерации"></section></div>
  <p class="landing-notice" data-status role="status" aria-live="polite"></p>
  <details class="landing-details"><summary>Подробности</summary><pre data-details></pre><button type="button" data-export>Скачать историю и результат</button><details><summary>История прежней генерации</summary><div data-legacy></div><button type="button" data-load-legacy>Загрузить историю</button></details></details>
  <form class="landing-composer" data-form hidden><label data-file-label>Файл Figma<input data-file type="url" placeholder="https://www.figma.com/design/…" autocomplete="off"><small>Ссылка нужна для создания макета в этом файле.</small></label><label class="design-check-sr-only" for="landing-brief">Бриф или уточнение</label><textarea id="landing-brief" data-input rows="2" maxlength="32000" placeholder="Опишите предложение, аудиторию и цель лендинга"></textarea><div class="landing-actions"><span data-platform>Desktop · Figma</span><button type="button" class="primary" data-stop hidden>Остановить</button><button type="submit" class="primary" data-submit>Отправить</button></div></form>`;
 const $=name=>root.querySelector('[data-'+name+']'),tickets=new Map();let chat=null,selected=false,available=false,busy=false,inFlight=false,closed=false,initialized=false,version=0,timer=null,nativeContext=null,lastMessages='',lastRelease='',operationKey='',activeNewId=null,lastError=null;
 const legacy=require('../generation/session/client').createSessionClient(send);
 function native(operation,payload={}){return new Promise((resolve,reject)=>{const requestId='landing:'+createOpaqueId(),t=setTimeout(()=>{tickets.delete(requestId);reject(Object.assign(Error('LANDING_CANVAS_TIMEOUT'),{code:'LANDING_CANVAS_TIMEOUT'}));},30000);tickets.set(requestId,{operation,resolve,reject,t});try{send({type:'landing-canvas',requestId,operation,payload});}catch(e){clearTimeout(t);tickets.delete(requestId);reject(e);}});}
 async function api(route,body){const abort=new AbortController(),t=setTimeout(()=>abort.abort(),15000);try{const response=await request('http://localhost:3001/landing/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:abort.signal});const value=await response.json();if(!response.ok||value.success!==true)throw Object.assign(Error(value.code||'LANDING_PROXY_UNAVAILABLE'),{code:value.code||'LANDING_PROXY_UNAVAILABLE'});return value;}catch(e){if(!e.code)e.code='LANDING_PROXY_UNAVAILABLE';throw e;}finally{clearTimeout(t);}}
 async function context(){const value=await native('context');if(BUILD&&value.buildId!==BUILD)throw Object.assign(Error('LANDING_PLUGIN_RELOAD_REQUIRED'),{code:'LANDING_PLUGIN_RELOAD_REQUIRED'});return value;}
 function fileKey(){if(nativeContext?.fileKey)return nativeContext.fileKey;const value=$('file').value.trim();if(!value)return chat?.context.fileKey||null;try{const url=new URL(value);if(!['www.figma.com','figma.com'].includes(url.hostname)||url.protocol!=='https:')return null;return /^\/(?:design|file)\/([a-zA-Z0-9_-]{6,128})(?:\/|$)/.exec(url.pathname)?.[1]||null;}catch{return null;}}
 function notice(text){$('status').textContent=text;}
 function controls(){
  const working=Boolean(chat&&WORKING.has(chat.status)),locked=inFlight||working;
  if(busy!==locked){busy=locked;onBusy(busy);}
  const unsupported=!['Desktop','desktop'].includes(readPlatform());
  $('form').hidden=!selected;$('start').hidden=selected;$('history').disabled=locked;$('new').disabled=locked;$('skill').disabled=!available||isUnavailable()||unsupported;
  $('input').disabled=locked||!available||isUnavailable()||unsupported;
  $('file').disabled=locked&&chat?.status!=='awaiting-canvas';$('file-label').hidden=Boolean(nativeContext?.fileKey||chat?.context.fileKey);
  $('submit').disabled=!available||isUnavailable()||unsupported||locked&&chat?.status!=='awaiting-canvas'||chat?.status==='awaiting-canvas'&&!fileKey()||chat?.status!=='awaiting-canvas'&&!$('input').value.trim();
  $('submit').hidden=working&&chat.status!=='awaiting-canvas';$('submit').textContent=chat?.status==='awaiting-canvas'?'Создать макет':'Отправить';
  $('stop').hidden=!locked;$('stop').disabled=false;$('input').setAttribute('aria-busy',String(working));
  $('export').disabled=!chat;$('platform').textContent=unsupported?'Пока доступен только Desktop':'Desktop · Figma';
 }
 function message(role,text){const article=document.createElement('article'),heading=document.createElement('h3'),p=document.createElement('p');article.className='landing-message landing-message-'+role;heading.textContent=role==='user'?'Вы':'Apollo';p.textContent=text;article.append(heading,p);return article;}
 function render(){
  if(chat){const signature=JSON.stringify(chat.messages);if(signature!==lastMessages){const nearEnd=$('conversation').scrollHeight-$('conversation').scrollTop-$('conversation').clientHeight<64;$('messages').replaceChildren(...chat.messages.map(m=>message(m.role,m.text)));lastMessages=signature;if(nearEnd)$('conversation').scrollTop=$('conversation').scrollHeight;}
   const panel=$('result');panel.hidden=!chat.result;if(chat.result){panel.replaceChildren();const title=document.createElement('h3'),text=document.createElement('p'),link=document.createElement('a');title.textContent=chat.result.revision===chat.revision?'Макет сохранён':'Предыдущий результат';text.textContent=chat.result.summary||'Редактируемый макет в Figma';link.textContent='Открыть макет в Figma';link.href='https://www.figma.com/design/'+chat.context.fileKey+'/Apollo?node-id='+encodeURIComponent(chat.result.rootNodeId);link.target='_blank';link.rel='noopener noreferrer';panel.append(title,text,link);const note=document.createElement('p');note.className='muted';note.textContent='Черновик. Фактические проверки и ограничения — в подробностях.';panel.append(note);}
   const error=chat.error||lastError;notice(error?errors[error.code]||'Сборка прервана. История и макет сохранены; подробности доступны ниже.':chat.message||'');$('details').textContent=JSON.stringify({status:chat.status,revision:chat.revision,source:chat.source,sources:chat.sources,checks:chat.result?.checks||[],issues:chat.result?.issues||[],limits:chat.result?.limits||[],usage:chat.usage,error,failures:chat.failures||[]},null,2);
  }controls();
 }
 function acceptChat(next){if(!next||next.schemaVersion!=='apollo.landing-chat.v1'||chat&&next.id!==chat.id||!Array.isArray(next.messages)||!Number.isSafeInteger(next.sequence)||chat&&next.sequence<chat.sequence)throw Object.assign(Error('LANDING_RESPONSE_INVALID'),{code:'LANDING_RESPONSE_INVALID'});chat=next;render();}
 async function release(){if(chat?.id)await native('release',{chatId:chat.id}).catch(()=>{});}
 function schedule(){clearTimeout(timer);if(!closed&&chat&&WORKING.has(chat.status))timer=setTimeout(()=>void poll(),500);}
 async function processCanvas(token){
  if(!chat||!['awaiting-canvas','awaiting-readback'].includes(chat.status)||token!==version)return;
  const marker=chat.id+':'+chat.revision+':'+chat.status+':'+chat.sequence;if(operationKey===marker)return;
  if(chat.status==='awaiting-canvas'&&!fileKey()){notice('Вставьте ссылку на текущий файл Figma, чтобы создать макет.');controls();return;}
  operationKey=marker;inFlight=true;controls();const id=chat.id,revision=chat.revision;
  try{let result;
   if(chat.status==='awaiting-canvas'){const c=await native('open',{chatId:id,revision,pageId:chat.context.pageId,fileKey:fileKey(),rootNodeId:chat.target?.rootNodeId||null,ownerNonce:chat.target?.ownerNonce||null});if(token!==version)return;result=await api('chats/'+id+'/canvas',{revision,target:c.target,readback:c.readback});}
   else{const t=chat.target,readback=await native('observe',{chatId:id,revision,rootNodeId:t.rootNodeId,ownerNonce:t.ownerNonce,leaseNonce:t.leaseNonce});if(token!==version)return;result=await api('chats/'+id+'/observation',{revision,readback});}
   if(token===version){acceptChat(result.chat);if(!WORKING.has(chat.status)){lastRelease=id+':'+chat.revision;await release();await history();}}
  }catch(e){if(token===version){lastError={code:/^LANDING_[A-Z_]+$/.test(e.code||'')?e.code:'LANDING_CANVAS_UNAVAILABLE',diagnostic:e.diagnostic||{message:String(e.message).slice(0,1000)}};await release();await api('chats/'+id+'/failure',{revision,error:lastError}).then(value=>acceptChat(value.chat)).catch(()=>{});notice(errors[e.code]||'Не удалось подтвердить сборку. Макет сохранён; можно продолжить в этом чате.');}}
  finally{inFlight=false;if(token===version){render();schedule();}}
 }
 async function poll(){
  if(!chat||closed)return;const token=version,id=chat.id;
  try{const value=await api('chats/'+id);if(token!==version)return;acceptChat(value.chat);
   if(WORKING.has(chat.status))await processCanvas(token);
   else if(lastRelease!==id+':'+chat.revision){lastRelease=id+':'+chat.revision;await release();await history();}
  }catch(e){if(token===version){lastError={code:e.code||e.message};notice('Нет связи с Proxy. История и макет сохранены.');await release();}}
  finally{if(token===version)schedule();}
 }
 async function history(){const value=await api('chats'),select=$('history'),current=chat?.id||'';select.replaceChildren(new Option('Новый чат',''));for(const item of value.chats){const label=new Date(item.updatedAt).toLocaleDateString('ru-RU')+' · '+item.title;select.append(new Option(label,item.id));}select.value=current;}
 function reset(){version++;clearTimeout(timer);chat=null;selected=false;activeNewId=null;lastMessages='';operationKey='';lastError=null;$('messages').replaceChildren();$('result').replaceChildren();$('result').hidden=true;$('history').value='';$('input').value='';notice(available?'Выберите, что хотите создать.':'Для генерации нужны совместимые Proxy и данные.');controls();}
 $('new').onclick=reset;
 $('skill').onclick=()=>{selected=true;controls();$('input').focus();};
 $('history').onchange=async()=>{const id=$('history').value;if(!id){reset();return;}const token=++version;inFlight=true;controls();try{const value=await api('chats/'+id);if(token!==version)return;chat=null;selected=true;acceptChat(value.chat);schedule();}catch(e){notice(errors[e.code]||'Не удалось загрузить чат.');}finally{inFlight=false;controls();}};
 $('form').onsubmit=async event=>{
  event.preventDefault();if($('submit').disabled)return;const token=version;
  if(chat?.status==='awaiting-canvas'){operationKey='';await processCanvas(token);return;}
  const text=$('input').value.trim();if(!text)return;inFlight=true;controls();
  try{if(!chat){nativeContext=await context();activeNewId=activeNewId||uuid();const value=await api('chats',{id:activeNewId,pageId:nativeContext.pageId,fileKey:fileKey()});if(token!==version)return;acceptChat(value.chat);}
   const id=chat.id,body={requestId:uuid(),revision:chat.revision,text};const value=await api('chats/'+id+'/messages',body);if(token!==version)return;lastError=null;acceptChat(value.chat);$('input').value='';schedule();await history();
  }catch(e){if(token===version){lastError={code:e.code||e.message};notice(errors[e.code]||'Не удалось связаться с Proxy. Сообщение осталось в поле ввода.');if(chat)await poll();}}
  finally{inFlight=false;controls();}
 };
 $('stop').onclick=async()=>{if(!chat)return;const id=chat.id,token=version;inFlight=true;controls();await release();try{const value=await api('chats/'+id+'/cancel',{});if(token===version)acceptChat(value.chat);}catch{notice('Макет сохранён. Подтвердить остановку в Proxy не удалось.');}finally{inFlight=false;controls();}};
 $('input').oninput=controls;$('file').oninput=controls;
 $('input').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();$('form').requestSubmit();}};
 $('export').onclick=()=>{if(!chat)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(chat,null,2)],{type:'application/json'}));a.href=url;a.download='apollo-landing-'+chat.id+'-r'+chat.revision+'.json';a.click();URL.revokeObjectURL(url);};
 $('load-legacy').onclick=async()=>{try{const saved=await legacy.load();$('legacy').replaceChildren(...(saved?.conversation.messages||[]).map(m=>message(m.role,m.text)));if(!saved)$('legacy').textContent='Сохранённой истории прежней генерации нет.';}catch{$('legacy').textContent='Не удалось прочитать прежнюю историю. Она не удалена.';}};
 function refresh(){controls();if(!isVisible()&&!available)initialized=false;if(!initialized&&isVisible()){initialized=true;notice('Подключаем навык лендингов…');void(async()=>{try{nativeContext=await context();const info=await api('status');available=info.available===true;notice(available?'Выберите, что хотите создать.':errors[info.code]||'Для генерации обновите Proxy и пакет данных.');await history();}catch(e){notice(e.code==='LANDING_PLUGIN_RELOAD_REQUIRED'?'Переоткройте Apollo: интерфейс и native-код имеют разные версии.':'Нет связи с Proxy. Запустите его и откройте раздел снова.');}finally{controls();}})();}}
 refresh();
 return {refresh,busy:()=>busy,accept(m){if(legacy.accept(m))return true;if(m?.type!=='landing-canvas-result')return false;const ticket=tickets.get(m.requestId);if(!ticket)return true;tickets.delete(m.requestId);clearTimeout(ticket.t);if(m.operation!==ticket.operation||m.error)ticket.reject(Object.assign(Error(m.error?.code||'LANDING_RESPONSE_INVALID'),{code:m.error?.code||'LANDING_RESPONSE_INVALID',diagnostic:m.error||null}));else ticket.resolve(m.value);return true;},close(){closed=true;clearTimeout(timer);void release();for(const t of tickets.values()){clearTimeout(t.t);t.reject(Error('LANDING_CLOSED'));}tickets.clear();}};
}
module.exports={mountLanding};
