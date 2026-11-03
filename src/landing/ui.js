'use strict';
const {createOpaqueId}=require('../design-check/opaque-id');
const assets=require('../design-check/assets');
const {mountGenerationSelect,styleGenerationSettings}=require('../GenerationSelect');
require('./ui.css');
const LANDING_SKILL='ab-generate-custom-landing';
const WORKING=new Set(['running','awaiting-canvas','awaiting-readback']);
const uuid=()=>{try{if(typeof globalThis.crypto?.randomUUID==='function')return globalThis.crypto.randomUUID();}catch{}return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16);});};
const BUILD=typeof __APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__==='string'?__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__:null;
const errors={AGENT_ROUTING_TIMEOUT:'Не удалось подключить модель за отведённое время. План и прочитанные источники сохранены; можно продолжить в этом чате.',LANDING_PREPARATION_BUDGET:'Подготовка заняла отведённые ей шаги. План сохранён; недостающие данные указаны в подробностях. Можно продолжить в этом чате.',LANDING_NATIVE_EVIDENCE_REQUIRED:'Для проверки структуры лендинга обновите Apollo. План и созданная область сохранены.',AGENT_MODEL_CAPACITY:'Модель временно перегружена. Выполненные шаги сохранены. Продолжите позже в этом чате.',LANDING_PROXY_UPDATE_REQUIRED:'Для создания лендинга в текущем файле и выбранной секции обновите Apollo Proxy.',LANDING_CONTEXT_CHANGED:'Этот чат связан с другой страницей или файлом Figma. Вернитесь к макету или начните новый чат.',LANDING_SECTION_UNAVAILABLE:'Выбранная секция недоступна. Выберите место в настройках экрана.',LANDING_FILE_CONTEXT_UNAVAILABLE:'Вставьте ссылку на текущий файл Figma в сообщение и отправьте его снова. Бриф сохранён.',LANDING_NO_PROGRESS:'Подготовка повторяет чтение без новых данных. Подтверждённый контекст сохранён; можно продолжить в этом чате.',LANDING_STEP_BUDGET:'Подготовка не завершилась за один проход. История сохранена; можно продолжить в этом чате.',LANDING_SKILL_UNAVAILABLE:'Выбранный навык недоступен в данных Proxy. Обновите данные или начните новый чат с доступным навыком.',LANDING_DATA_REQUIRED:'Подключите пакет данных в Proxy.',LANDING_WORKFLOW_REQUIRED:'Для лендингов нужна новая совместимая сборка Proxy.',LANDING_REQUIRED_KNOWLEDGE_MISSING:'В пакете не хватает правил лендингов. Обновите данные Proxy.',LANDING_PROVIDER_UNSUPPORTED:'Для этого сценария выберите Codex в Proxy.',LANDING_CANVAS_STALE:'Макет или его принадлежность изменились. Результат сохранён.',LANDING_OUTSIDE_CHANGED:'Во время сборки изменилось окружение макета. Результат сохранён.',LANDING_UNREQUESTED_CONTENT_CHANGED:'Изменилась секция вне порученной правки. Работа остановлена, макет сохранён.',LANDING_RESULT_INCOMPLETE:'Сборка пока неполная. Можно продолжить в этом чате.',LANDING_REVISION_STALE:'Состояние чата обновилось. Загружаем текущую версию.',LANDING_BUSY:'Дождитесь завершения текущей сборки или остановите её.'};
function mountLanding({root,send,isUnavailable=()=>false,isVisible=()=>true,readPlatform=()=> 'Desktop',onBusy=()=>{},request=fetch,beforeOperation}){
 root.classList.add('landing-workspace');root.innerHTML=`
  <h2 class="design-check-sr-only">Генерация</h2>
  <div class="landing-history-label"><label class="design-check-sr-only" for="landing-history">История генерации</label><select id="landing-history" data-history aria-label="История генерации"><option value="">История чатов</option></select></div>
  <div class="landing-conversation" data-conversation><div class="landing-empty" data-start><h3>Что создадим?</h3><p>Опиши задачу — уточним детали и соберём макет в этом файле Figma.</p></div><div data-messages role="log" aria-label="Диалог о макете" aria-live="polite" aria-relevant="additions"></div><section data-result hidden aria-label="Результат генерации"></section></div>
  <p class="landing-notice" data-status role="status" aria-live="polite"></p>
  <details class="landing-details"><summary>Подробности</summary><pre data-details></pre><button type="button" data-export>Скачать историю и результат</button><details><summary>История прежней генерации</summary><div data-legacy></div><button type="button" data-load-legacy>Загрузить историю</button></details></details>
  <form class="landing-composer generation-prompt-form" data-form>
   <div class="apollo-message-field"><label class="design-check-sr-only" for="generation-prompt">Бриф или уточнение</label><textarea id="generation-prompt" data-input rows="1" maxlength="32000" placeholder="Опиши задачу"></textarea><button type="submit" class="generation-send" data-submit aria-label="Отправить сообщение" title="Отправить сообщение"><img data-send-icon width="24" height="24" alt=""></button><button type="button" class="generation-send is-stop" data-stop hidden aria-label="Остановить" title="Остановить"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg></button></div>
   <div class="apollo-generation-options"><button type="button" class="apollo-new-chat" data-new><span class="apollo-option-icon"><span class="apollo-option-plus" data-plus></span></span><span>Новый чат</span></button><div class="apollo-generation-options-right"><select data-kind aria-label="Что генерируем"><option value="ab-generate-custom-landing">Лендинг</option></select><div data-kind-picker></div><div class="landing-settings"><button type="button" data-settings-toggle aria-expanded="false" aria-controls="landing-screen-settings"><span>Настройки экрана</span><span class="apollo-option-icon"><span class="apollo-option-chevron" data-chevron></span></span></button><div id="landing-screen-settings" data-screen-settings hidden><label>Где собрать лендинг?<select data-placement aria-label="Место лендинга"><option value="new">Создать новую секцию</option></select></label><p data-platform>Desktop · текущий файл Figma</p></div></div></div></div>
  </form>`;
 const $=name=>root.querySelector('[data-'+name+']'),tickets=new Map();let chat=null,available=false,busy=false,inFlight=false,closed=false,initialized=false,version=0,timer=null,nativeContext=null,linkedContext=null,lastMessages='',lastRelease='',operationKey='',activeNewId=null,lastError=null,placementChosen=false,skillRegistry=false;
 $('send-icon').src=assets.sendCircle;$('plus').style.maskImage='url("'+assets.newChat+'")';$('chevron').style.maskImage='url("'+assets.chevron+'")';
 styleGenerationSettings($('screen-settings'),$('settings-toggle'));
 const kindPicker=mountGenerationSelect({host:$('kind-picker'),select:$('kind'),onOpen:()=>{settings(false);}});
 function settings(open){$('screen-settings').hidden=!open;$('settings-toggle').setAttribute('aria-expanded',String(open));}
 function updateContext(value){if(linkedContext&&linkedContext.pageId!==value.pageId)linkedContext=null;nativeContext=value;const select=$('placement'),previous=select.value;select.replaceChildren(new Option('Создать новую секцию','new'));for(const section of value.sections||[])select.append(new Option('В секции: '+section.name,'section:'+section.id));select.value=placementChosen&&Array.from(select.options).some(o=>o.value===previous)?previous:value.selectedSectionId?'section:'+value.selectedSectionId:'new';}
 function updateSkills(info){
  const select=$('kind'),previous=chat?.skillId||select.value;
  skillRegistry=Array.isArray(info.skills);
  const skills=skillRegistry?info.skills.filter(skill=>typeof skill?.id==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(skill.id)&&typeof skill.name==='string'&&skill.name.length):[{id:LANDING_SKILL,name:'Лендинг'}];
  select.replaceChildren(...skills.map(skill=>new Option(skill.name,skill.id)));
  select.value=skills.some(skill=>skill.id===previous)?previous:skills.some(skill=>skill.id===info.defaultSkillId)?info.defaultSkillId:skills[0]?.id||'';
 }
 function selectChatSkill(){
  const select=$('kind'),id=chat?.skillId||LANDING_SKILL;
  if(!Array.from(select.options).some(option=>option.value===id)){const option=new Option(chat.skillName||'Недоступный навык',id);option.dataset.historical='true';select.append(option);}
  select.value=id;kindPicker.refresh();
 }
 function placement(){const value=$('placement').value;return value.startsWith('section:')?{mode:'section',sectionId:value.slice(8)}:{mode:'new-section',sectionId:null};}
 const outside=event=>{if(!$('settings-toggle').parentNode.contains(event.target))settings(false);};
 const escape=event=>{if(event.key==='Escape'&&!$('screen-settings').hidden){event.preventDefault();settings(false);$('settings-toggle').focus();}};
 document.addEventListener('pointerdown',outside);root.addEventListener('keydown',escape);$('settings-toggle').onclick=async()=>{kindPicker.close(false);const open=$('screen-settings').hidden,token=version;if(open&&!chat){try{const value=await context();if(token!==version)return;updateContext(value);}catch{notice('Не удалось прочитать текущую страницу Figma.');return;}}settings(open);};
 const legacy=require('../generation/session/client').createSessionClient(send);
 function native(operation,payload={}){return new Promise((resolve,reject)=>{const requestId='landing:'+createOpaqueId(),t=setTimeout(()=>{tickets.delete(requestId);reject(Object.assign(Error('LANDING_CANVAS_TIMEOUT'),{code:'LANDING_CANVAS_TIMEOUT'}));},30000);tickets.set(requestId,{operation,resolve,reject,t});try{send({type:'landing-canvas',requestId,operation,payload});}catch(e){clearTimeout(t);tickets.delete(requestId);reject(e);}});}
 async function api(route,body){const abort=new AbortController(),t=setTimeout(()=>abort.abort(),15000);try{const response=await request('http://localhost:3001/landing/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:abort.signal});const value=await response.json();if(!response.ok||value.success!==true)throw Object.assign(Error(value.code||'LANDING_PROXY_UNAVAILABLE'),{code:value.code||'LANDING_PROXY_UNAVAILABLE'});return value;}catch(e){if(!e.code)e.code='LANDING_PROXY_UNAVAILABLE';throw e;}finally{clearTimeout(t);}}
 async function context(){const value=await native('context');if(BUILD&&value.buildId!==BUILD)throw Object.assign(Error('LANDING_PLUGIN_RELOAD_REQUIRED'),{code:'LANDING_PLUGIN_RELOAD_REQUIRED'});return value;}
 function fileKey(){return nativeContext?.fileKey||(linkedContext?.pageId===nativeContext?.pageId?linkedContext?.fileKey:null)||null;}
 function fileKeyFromMessage(text){
  const keys=new Set();for(const match of text.matchAll(/https:\/\/[^\s<>"']+/g)){try{const url=new URL(match[0]),key=/^\/(?:design|file)\/([A-Za-z0-9_-]{6,128})(?:\/|$)/.exec(url.pathname);if(['figma.com','www.figma.com'].includes(url.hostname)&&!url.username&&!url.password&&!url.port&&key)keys.add(key[1]);}catch{}}
  return keys.size===1?Array.from(keys)[0]:null;
 }
 function notice(text){$('status').textContent=text;}
 function controls(){
  const working=Boolean(chat&&WORKING.has(chat.status)),locked=inFlight||working,needsFileLink=chat?.status==='awaiting-canvas'&&!fileKey();
  if(busy!==locked){busy=locked;onBusy(busy);}
  const unsupported=!['Desktop','desktop'].includes(readPlatform());
  $('start').hidden=Boolean(chat?.messages.length);$('history').disabled=locked;$('new').disabled=locked;$('kind').disabled=locked||Boolean(chat);$('placement').disabled=locked||Boolean(chat);$('settings-toggle').disabled=locked;
  $('input').disabled=inFlight||locked&&!needsFileLink||!available||isUnavailable()||unsupported;
  $('submit').disabled=inFlight||!available||isUnavailable()||unsupported||locked&&chat?.status!=='awaiting-canvas'||chat?.status==='awaiting-canvas'&&!fileKey()&&!$('input').value.trim()||chat?.status!=='awaiting-canvas'&&!$('input').value.trim();
  $('submit').hidden=working&&chat.status!=='awaiting-canvas';$('submit').setAttribute('aria-label',chat?.status==='awaiting-canvas'?'Продолжить сборку':'Отправить сообщение');
  $('stop').hidden=!locked;$('stop').disabled=false;$('input').setAttribute('aria-busy',String(working));
  $('export').disabled=!chat;$('platform').textContent=unsupported?'Пока доступен только Desktop':'Desktop · текущий файл Figma';
 }
 function message(role,text){const article=document.createElement('article'),heading=document.createElement('h3'),p=document.createElement('p');article.className='landing-message landing-message-'+role;heading.textContent=role==='user'?'Вы':'Apollo';p.textContent=text;article.append(heading,p);return article;}
 function render(){
  if(chat){const signature=JSON.stringify(chat.messages);if(signature!==lastMessages){const nearEnd=$('conversation').scrollHeight-$('conversation').scrollTop-$('conversation').clientHeight<64;$('messages').replaceChildren(...chat.messages.map(m=>message(m.role,m.text)));lastMessages=signature;if(nearEnd)$('conversation').scrollTop=$('conversation').scrollHeight;}
   const panel=$('result');panel.hidden=!chat.result;if(chat.result){panel.replaceChildren();const title=document.createElement('h3'),text=document.createElement('p'),link=document.createElement('a');title.textContent=chat.result.revision!==chat.revision?'Предыдущий результат':chat.status==='needs-verification'?'Макет собран · нужна проверка':'Макет сохранён';text.textContent=chat.result.summary||'Редактируемый макет в Figma';link.textContent='Открыть макет в Figma';link.href='https://www.figma.com/design/'+chat.context.fileKey+'/Apollo?node-id='+encodeURIComponent(chat.result.rootNodeId);link.target='_blank';link.rel='noopener noreferrer';panel.append(title,text,link);const note=document.createElement('p');note.className='muted';note.textContent='Черновик. Фактические проверки и ограничения — в подробностях.';panel.append(note);}
   const error=chat.error||lastError;notice(error?errors[error.code]||'Сборка прервана. История и макет сохранены; подробности доступны ниже.':chat.messages.at(-1)?.role==='assistant'&&chat.messages.at(-1)?.text===chat.message?'':chat.message||'');$('details').textContent=JSON.stringify({status:chat.status,revision:chat.revision,source:chat.source,planning:chat.planning,verification:chat.result?.verification||null,sources:chat.sources,checks:chat.result?.checks||[],issues:chat.result?.issues||[],limits:chat.result?.limits||[],usage:chat.usage,error,failures:chat.failures||[]},null,2);
  }controls();
 }
 function acceptChat(next){if(!next||next.schemaVersion!=='apollo.landing-chat.v1'||chat&&next.id!==chat.id||!Array.isArray(next.messages)||!Number.isSafeInteger(next.sequence)||chat&&next.sequence<chat.sequence)throw Object.assign(Error('LANDING_RESPONSE_INVALID'),{code:'LANDING_RESPONSE_INVALID'});chat=next;selectChatSkill();render();}
 async function release(){if(chat?.id)await native('release',{chatId:chat.id}).catch(()=>{});}
 function schedule(){clearTimeout(timer);if(!closed&&chat&&WORKING.has(chat.status))timer=setTimeout(()=>void poll(),500);}
 async function processCanvas(token){
  if(!chat||!['awaiting-canvas','awaiting-readback'].includes(chat.status)||token!==version)return;
  const marker=chat.id+':'+chat.revision+':'+chat.status+':'+chat.sequence;if(operationKey===marker)return;
  if(chat.status==='awaiting-canvas'&&!fileKey()){notice('Вставьте ссылку на текущий файл Figma в сообщение и отправьте его снова. Бриф сохранён.');controls();return;}
  operationKey=marker;inFlight=true;controls();const id=chat.id,revision=chat.revision;
  try{let result;
   if(chat.status==='awaiting-canvas'){const payload={chatId:id,revision,pageId:chat.context.pageId,fileKey:fileKey(),rootNodeId:chat.target?.rootNodeId||null,ownerNonce:chat.target?.ownerNonce||null,placement:chat.context.placement||placement()};if(chat.source?.nativeEvidenceVersion===1)payload.evidenceVersion=1;const c=await native('open',payload);if(token!==version)return;result=await api('chats/'+id+'/canvas',{revision,target:c.target,readback:c.readback});}
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
 async function history(){const value=await api('chats'),select=$('history'),current=chat?.id||'';select.replaceChildren(new Option('История чатов',''));for(const item of value.chats){const label=new Date(item.updatedAt).toLocaleDateString('ru-RU')+' · '+item.title;select.append(new Option(label,item.id));}select.value=current;}
 function reset(){settings(false);placementChosen=false;version++;clearTimeout(timer);chat=null;for(const option of Array.from($('kind').options))if(option.dataset.historical)option.remove();if(!$('kind').value&&$('kind').options.length)$('kind').selectedIndex=0;kindPicker.refresh();activeNewId=null;lastMessages='';operationKey='';lastError=null;$('messages').replaceChildren();$('result').replaceChildren();$('result').hidden=true;$('history').value='';$('input').value='';notice(available?'':'Для генерации нужны совместимые Proxy и данные.');controls();}
 $('new').onclick=reset;
 $('history').onchange=async()=>{const id=$('history').value;if(!id){reset();return;}const token=++version;inFlight=true;controls();try{const value=await api('chats/'+id);if(token!==version)return;chat=null;acceptChat(value.chat);schedule();}catch(e){notice(errors[e.code]||'Не удалось загрузить чат.');}finally{inFlight=false;controls();}};
 $('placement').onchange=()=>{placementChosen=true;};
 $('form').onsubmit=async event=>{
  event.preventDefault();if($('submit').disabled)return;const token=version;
  const text=$('input').value.trim();if(!text&&chat?.status!=='awaiting-canvas')return;inFlight=true;controls();
  try{if(beforeOperation)await beforeOperation();if(token!==version)return;updateContext(await context());if(token!==version)return;if(chat&&chat.context.pageId!==nativeContext.pageId)throw Object.assign(Error('LANDING_CONTEXT_CHANGED'),{code:'LANDING_CONTEXT_CHANGED'});const key=fileKey()||fileKeyFromMessage(text);if(!key)throw Object.assign(Error('LANDING_FILE_CONTEXT_UNAVAILABLE'),{code:'LANDING_FILE_CONTEXT_UNAVAILABLE'});if(chat&&(chat.context.pageId!==nativeContext.pageId||chat.context.fileKey!==key))throw Object.assign(Error('LANDING_CONTEXT_CHANGED'),{code:'LANDING_CONTEXT_CHANGED'});if(!nativeContext.fileKey)linkedContext={fileKey:key,pageId:nativeContext.pageId};if(chat?.status==='awaiting-canvas'){operationKey='';await processCanvas(token);return;}if(!chat){activeNewId=activeNewId||uuid();const body={id:activeNewId,pageId:nativeContext.pageId,fileKey:fileKey(),placement:placement()};if(skillRegistry)body.skillId=$('kind').value;const value=await api('chats',body);if(token!==version)return;acceptChat(value.chat);}
   const id=chat.id,body={requestId:uuid(),revision:chat.revision,text};const value=await api('chats/'+id+'/messages',body);if(token!==version)return;lastError=null;acceptChat(value.chat);$('input').value='';$('input').style.height='48px';settings(false);schedule();await history();
  }catch(e){if(token===version){lastError={code:e.code||e.message};notice(e.code==='APOLLO_COMPATIBILITY_REQUIRED'?e.message:errors[e.code]||'Не удалось связаться с Proxy. Сообщение осталось в поле ввода.');if(chat&&e.code!=='APOLLO_COMPATIBILITY_REQUIRED')await poll();}}
  finally{inFlight=false;controls();}
 };
 $('stop').onclick=async()=>{if(!chat)return;const id=chat.id,token=version;inFlight=true;controls();await release();try{const value=await api('chats/'+id+'/cancel',{});if(token===version)acceptChat(value.chat);}catch{notice('Макет сохранён. Подтвердить остановку в Proxy не удалось.');}finally{inFlight=false;controls();}};
 $('input').oninput=()=>{$('input').style.height='auto';$('input').style.height=Math.max(48,Math.min(144,$('input').scrollHeight))+'px';controls();};
 $('input').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();$('form').requestSubmit();}};
 $('export').onclick=()=>{if(!chat)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(chat,null,2)],{type:'application/json'}));a.href=url;a.download='apollo-landing-'+chat.id+'-r'+chat.revision+'.json';a.click();URL.revokeObjectURL(url);};
 $('load-legacy').onclick=async()=>{try{const saved=await legacy.load();$('legacy').replaceChildren(...(saved?.conversation.messages||[]).map(m=>message(m.role,m.text)));if(!saved)$('legacy').textContent='Сохранённой истории прежней генерации нет.';}catch{$('legacy').textContent='Не удалось прочитать прежнюю историю. Она не удалена.';}};
 function refresh(){controls();if(!isVisible()&&!available)initialized=false;if(!initialized&&isVisible()){initialized=true;notice('Подключаем генерацию…');void(async()=>{try{updateContext(await context());const info=await api('status');updateSkills(info);available=info.available===true&&['new-section','section'].every(mode=>info.placementModes?.includes(mode));notice(available?'':info.available===true?errors.LANDING_PROXY_UPDATE_REQUIRED:errors[info.code]||'Для генерации обновите Proxy и пакет данных.');await history();}catch(e){notice(e.code==='LANDING_PLUGIN_RELOAD_REQUIRED'?'Переоткройте Apollo: интерфейс и native-код имеют разные версии.':'Нет связи с Proxy. Запустите его и откройте раздел снова.');}finally{controls();}})();}}
 refresh();
 return {refresh,busy:()=>busy,accept(m){if(legacy.accept(m))return true;if(m?.type!=='landing-canvas-result')return false;const ticket=tickets.get(m.requestId);if(!ticket)return true;tickets.delete(m.requestId);clearTimeout(ticket.t);if(m.operation!==ticket.operation||m.error)ticket.reject(Object.assign(Error(m.error?.code||'LANDING_RESPONSE_INVALID'),{code:m.error?.code||'LANDING_RESPONSE_INVALID',diagnostic:m.error||null}));else ticket.resolve(m.value);return true;},close(){closed=true;kindPicker.close(false);document.removeEventListener('pointerdown',outside);root.removeEventListener('keydown',escape);clearTimeout(timer);void release();for(const t of tickets.values()){clearTimeout(t.t);t.reject(Error('LANDING_CLOSED'));}tickets.clear();}};
}
module.exports={mountLanding};
