
let layerNamesClient=null;
let figmaAuditClient=null;
const {createFigmaAuditClient}=require("./figma-audit/client");
let reglyphClient=null;
const {createReglyphClient}=require("./skills/reglyph/client");
const {createLayerNamesClient}=require("./skills/layer-names/client");
const {createAuditFocusClient}=require("./audit-focus-client");
const { mountDesignCheck, createDesignCheckController, createExistingDialoguePort, tabDefinitions } = require("./design-check/index");
const { createUiClient } = require("./design-check/ui-client");
const { createDocumentAuditClient } = require("./design-check/document-audit-client");
const { createOpaqueId } = require("./design-check/opaque-id");
require("./design-check/legacy.css");
const BASE = 'http://localhost:3001';
console.info('[Apollo] build',JSON.stringify({version:require('../package.json').version,buildId:__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__}));
const compatibility = require('./compatibility').createCompatibilityClient({ request: (url, options) => fetch(url, options),
  endpoint: BASE + '/health', onChange: value => designCheck.setProxyStatus(value) });
const tokenJournalClient = require('./token-journal-client').createTokenJournalClient({send:value=>parent.postMessage({pluginMessage:value},'*')});
let statisticsUserName=null;
const auditStatisticsClient=require('./audit-statistics/client').createStatisticsClient({userName:()=>statisticsUserName,send:value=>parent.postMessage({pluginMessage:value},'*'),versions:{plugin:require('../package.json').version,build:__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__,runtime:require('../packages/component-contract-core/package.json').version}});
const { SOURCE_SCHEMA, sourceFromFiles, linkSourcePackages } = require("./authoring-source");
const { readZip, zipEntryText } = require('@apollo/component-contract-zip');
const {renderContractFindings}=require("./design-check/ContractFindings");
require("./design-check/finding-card.css");
const $ = id => document.getElementById(id);
let generationBusy = false, landingUi = null;
let validSelection = false, busy = false, sequence = 0, activeRequest = '', cancelledAuditRequest = '', audit = null, agentSequence = 0;
const send = value => {
  if(value.type==='document-audit-request')auditStatisticsClient.start(value.requestId,'native-document',value.context||null);
  parent.postMessage({ pluginMessage: value }, '*');
};
const {createCatalogTransport}=require("./v3-binding/catalog-port");
const catalogTransport=createCatalogTransport(send);
const uiClient = createUiClient(send);
const {auditSummary,createAuditReportClient}=require("./audit-report");
const auditReports=createAuditReportClient(send);
const contractData = require("./contract-data").createContractDataClient(send);
const dialogue = createExistingDialoguePort({ request: (url, options) => fetch(url, options), endpoint: BASE + '/analyze',
  readStatus: compatibility.refresh, createSessionId: () => 'apollo-v4-' + createOpaqueId() });
let pendingContractDelivery=null,pendingNativeDelivery=null,contractContext=null;
let lastCompact = false, contractStopping=false, currentPageId='';
const designCheck = createDesignCheckController({ tabs: tabDefinitions, preferenceScope: 'agent-source', preferences: uiClient.preferences, dialogue, beforeOperation: compatibility.ensure,
  onSettingChange: key => { if (['pickerLabel','channelId','pageTypeId','connectCatalogs'].includes(key)) {documentAuditClient.invalidate();markContractStale(true);} },
  onDocumentAction:(findingId,targetId,actionId)=>{documentAuditClient.action(findingId,targetId,actionId);controls();},
  onDocumentFocus: (findingId, targetId) => documentAuditClient.focus(findingId, targetId),
  onDocumentAudit: ({ requestId, uiPreferences }) => {
    tokenJournalClient.start(requestId, true);
    documentAuditClient.start(requestId, uiPreferences);
    if (!validSelection) return;
    if (legacyOperationUnavailable()) return;
    designCheck.beginContractAudit(requestId); startContractAudit(requestId);
  },
  onStopAudit:()=>stopAudit(),
  onAudit: ({ requestId }) => { startContractAudit(requestId); }
});
function startContractAudit(requestId,retry=false) {
    if(!retry){auditStatisticsClient.start(requestId,'contract-area',designCheck.getState().settings.pickerLabel);tokenJournalClient.start(requestId);contractContext=documentAuditClient.context();}
    if(audit)markContractStale();else clearResult(false); busy = true; contractStopping=false;activeRequest = requestId; controls();
    const settings=designCheck.getState().settings;
    status(settings.connectCatalogs?'Проверяем с каталогами Athena…':'Собираем факты и независимый библиотечный эталон…'); send({ type: 'audit', requestId, context:contractContext, connectCatalogs:settings.connectCatalogs, platform: ({Desktop:'desktop',MobileWeb:'mobile-web',iOS:'ios',Android:'android'})[settings.pickerLabel] });
}
const documentAuditClient = createDocumentAuditClient({send,controller:designCheck,isBusy:()=>legacyOperationUnavailable()||contractFocusClient.busy(),onRecheckStart:m=>{for(const origin of ['native-document','contract-area'])auditStatisticsClient.start(m.requestId,origin,designCheck.getState().settings.pickerLabel,'recheck',origin==='contract-area'?m.runId.replace(/:native$/,''):m.runId);markContractStale();},onRecheckResult:m=>{auditStatisticsClient.finish(m.requestId,'native-document',m.result);if(m.contract){auditStatisticsClient.finish(m.requestId,'contract-area',Object.assign({},m.contract.audit,{statisticsMetrics:m.contract.statisticsMetrics}));render(m.contract);designCheck.setAudit(Object.assign({},m.contract.audit,{displayMetadata:m.contract.displayMetadata}));}else auditStatisticsClient.discard(m.requestId,'contract-area');controls();},onRecheckError:m=>{for(const origin of ['native-document','contract-area'])auditStatisticsClient.finish(m.requestId,origin,null,'failed');markContractStale();}});
const contractFocusClient=createAuditFocusClient({send,onStatus:status,isBusy:()=>designCheck.getState().documentAction.busy});
function flushAuditDeliveries(){
 const state=designCheck.getState();
 if(pendingContractDelivery&&state.audit?.auditId===pendingContractDelivery.audit.auditId&&!state.auditStale){const delivered=pendingContractDelivery;pendingContractDelivery=null;render(delivered);auditStatisticsClient.finish(delivered.requestId,'contract-area',Object.assign({},delivered.audit,{statisticsMetrics:delivered.statisticsMetrics}));}
 if(pendingNativeDelivery&&state.documentAudit.status==='available'&&state.documentAudit.result===pendingNativeDelivery.result){const delivered=pendingNativeDelivery;pendingNativeDelivery=null;auditStatisticsClient.finish(delivered.requestId,'native-document',delivered.result);}
}
designCheck.subscribe(() => {
  tokenJournalClient.observe(designCheck.getState());
  flushAuditDeliveries();
  const settings=designCheck.getState().settings;
  reglyphClient?.setContext({channelId:settings.channelId,pickerLabel:settings.pickerLabel});
  const compact = settings.compact;
  if (compact === lastCompact) return;
  lastCompact = compact; void uiClient.resize(compact).catch(error => status(error.message, true));
});
layerNamesClient=createLayerNamesClient({send,beforeOperation:compatibility.ensure,onOperation:kind=>tokenJournalClient.begin(kind),isBusy:()=>legacyOperationUnavailable()||contractFocusClient.busy()||['loading','cancelling'].includes(designCheck.getState().documentAudit.status),onChange:()=>controls()});
reglyphClient=createReglyphClient({send,beforeOperation:compatibility.ensure,onOperation:kind=>tokenJournalClient.begin(kind),isBusy:()=>legacyOperationUnavailable(true)||contractFocusClient.busy()||['loading','cancelling'].includes(designCheck.getState().documentAudit.status),onChange:()=>controls()});
reglyphClient.setContext({channelId:designCheck.getState().settings.channelId,pickerLabel:designCheck.getState().settings.pickerLabel});
figmaAuditClient=createFigmaAuditClient({send,beforeOperation:compatibility.ensure,readPlatform:()=>designCheck.getState().settings.pickerLabel,isBusy:()=>legacyOperationUnavailable(false,true)||contractFocusClient.busy()||['loading','cancelling'].includes(designCheck.getState().documentAudit.status),onChange:()=>controls()});
function dependencyReason(reason) {
  if (['dependency-reference-not-captured', 'dependency-reference-capture-failed', 'dependency-main-component-unavailable', 'dependency-instance-unavailable'].includes(reason)) return 'Не удалось получить независимый библиотечный эталон.';
  if (reason === 'dependency-variable-modes-unavailable') return 'Не удалось воспроизвести режимы переменных.';
  if (reason === 'dependency-capture-actual-mismatch') return 'Вложенный снимок не совпадает с фактами основного компонента.';
  if (reason === 'dependency-check-incomplete') return 'Остались неизвестные факты или неисполненные правила.';
  if (reason === 'dependency-reference-capture-limit') return 'Превышен лимит захвата вложенных компонентов.';
  return 'Недостаточно подтверждённых фактов о структуре, варианте или происхождении компонента.';
}
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function legacyOperationUnavailable(ignoreReglyph=false,ignoreFigmaAudit=false) { return (!ignoreFigmaAudit && Boolean(figmaAuditClient?.busy())) || (!ignoreReglyph && Boolean(reglyphClient?.busy())) || Boolean(layerNamesClient?.busy()) || designCheck.getState().documentAction.busy || busy || generationBusy; }
function controls() {
  landingUi?.refresh();layerNamesClient?.refresh();reglyphClient?.refresh();figmaAuditClient?.refresh();
  const unavailable=legacyOperationUnavailable();
  $('audit').disabled=!validSelection||unavailable;
  $('audit').textContent=busy?'Проверяем…':'Проверить выделение';
  designCheck.setDocumentPageAvailable(documentAuditClient.hasPage());
  designCheck.setAuditReady(!generationBusy&&(documentAuditClient.hasPage()?!designCheck.getState().documentAction.busy&&!['loading','cancelling'].includes(designCheck.getState().documentAudit.status)&&!designCheck.getState().auditBusy:validSelection&&!unavailable));
  for(const id of ['proxy','file'])$(id).disabled=unavailable;
}
function markContractStale(notifyMain=false){auditReports.invalidate();contractFocusClient.invalidate();if(notifyMain&&audit)send({type:'audit-context-invalidated',auditId:audit.auditId});agentSequence++;$('explanation').textContent='';$('explain').disabled=true;designCheck.setAuditStale();for(const button of $('result').querySelectorAll('[data-audit-focus], #gaps button'))button.disabled=true;}
function clearResult(invalidate = true) {
  // Free knowledge dialogue carries no selection/audit context and can finish
  // while the user selects another component or starts an independent audit.
  if (invalidate) { if (activeRequest && designCheck.getState().auditBusy) cancelledAuditRequest = activeRequest; activeRequest = ''; designCheck.invalidateAudit(); }
  auditReports.invalidate();contractFocusClient.invalidate();audit = null; agentSequence++; $('result').hidden = true; $('explanation').textContent = ''; $('explain').disabled = false; }
async function fetchJson(url, options = {}) {
  const response = await fetch(BASE + url, options);
  const body = await response.json();
  if (!response.ok || body.success === false) throw new Error(body.error || `Прокси вернул ${response.status}`);
  return body;
}
function load(source, release) { clearResult(); controls(); send({ type: 'load-contract', source, release }); }
$('file').onclick = () => $('contract-file').click();
$('contract-file').onchange = async event => {
  const files = Array.from(event.target.files); if (!files.length) return;
  try {
    busy = true; controls(); status('Читаем главный контракт и факты…');
    const limit = 64 * 1024 * 1024;
    if (files.reduce((size, file) => size + file.size, 0) > limit) throw new Error('Выбранные файлы больше 64 МБ.');
    if (files.length > 200) throw new Error('Выбрано больше 200 файлов.');
    const sources = [], jsonFiles = [];
    let expandedTotal = files.filter(file => !/\.zip$/i.test(file.name)).reduce((size, file) => size + file.size, 0);
    for (const file of files) {
      if (/\.zip$/i.test(file.name)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        // Bound declared expanded size before invoking Editor's ZIP reader.
        const view = new DataView(bytes.buffer); let end = -1;
        for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
        if (end < 0) throw new Error('Не удалось прочитать authoring ZIP.');
        const count = view.getUint16(end + 10, true); let offset = view.getUint32(end + 16, true), expanded = 0;
        if (count > 200) throw new Error('В authoring ZIP больше 200 файлов.');
        for (let i = 0; i < count; i++) {
          if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Некорректный authoring ZIP.');
          expanded += view.getUint32(offset + 24, true);
          offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
        }
        expandedTotal += expanded;
        if (expandedTotal > limit) throw new Error('Распакованные файлы больше 64 МБ.');
        const entries = await readZip(bytes);
        if (entries.reduce((size, entry) => size + entry.data.length, 0) > limit) throw new Error('Распакованный authoring ZIP больше 64 МБ.');
        sources.push(sourceFromFiles(entries.filter(entry => /\.json$/i.test(entry.name)).map(entry => ({ name: entry.name, text: zipEntryText(entry) }))));
      } else {
        const text = await file.text(), data = JSON.parse(text);
        if (data.schemaVersion === SOURCE_SCHEMA) sources.push(data);
        else jsonFiles.push({ name: file.name, text });
      }
    }
    if (jsonFiles.length) sources.push(sourceFromFiles(jsonFiles));
    load(linkSourcePackages(sources), null);
  } catch (error) { status(error.message, true); }
  finally { busy = false; controls(); }
  event.target.value = '';
};
$('proxy').onclick = () => { clearResult(); send({ type: 'use-proxy' }); };
$('audit').onclick = () => { void (documentAuditClient.hasPage() ? designCheck.startDocumentAudit() : designCheck.startAudit()); };
function render(data) {
  const received=Date.now(),renderStarted=performance.now();
  auditReports.invalidate();audit = data.audit;contractFocusClient.set(audit,data.focusTargets); $('result').hidden = false;
  const all = audit.result.engine.evaluations;
  const violations = all.filter(e => e.classification === 'violation');
  const unknown = all.filter(e => !['compliant', 'allowed', 'violation', 'not-applicable'].includes(e.classification));
  const passed = all.filter(e => ['compliant', 'allowed'].includes(e.classification));
  $('stats').replaceChildren();
  for (const [label, entries] of [['Нарушения', violations], ['Нужна проверка', unknown], ['Соблюдено', passed]]) {
    const box = document.createElement('div'); box.className = 'stat';
    const count = document.createElement('strong'); count.textContent = audit.projection ? label==='Нарушения' ? audit.projection.counts.violation||0 : label==='Соблюдено' ? (audit.projection.counts.compliant||0)+(audit.projection.counts.allowed||0) : entries.length : entries.length;
    const caption = document.createElement('span'); caption.textContent = label; box.append(count, caption); $('stats').append(box);
  }
  const complete = audit.result.coverage.executionComplete;
  const coverage = audit.result.coverage;
  const areaSummary = audit.components ? ` Компоненты: проверено ${coverage.checkedComponents}, по контракту владельца ${coverage.governedComponents}, без проверки ${coverage.notCheckedComponents}.` : '';
  const dependencyRuns = audit.result.engine.dependencyRuns || [];
  const checkedDependencies = dependencyRuns.filter(run => run.status === 'executed').length;
  const skippedDependencies = dependencyRuns.filter(run => run.status === 'not-applicable').length;
  const dependencySummary = dependencyRuns.length ? ` Вложенные компоненты: проверено ${checkedDependencies}, неприменимо ${skippedDependencies}, неполных проверок ${dependencyRuns.length - checkedDependencies - skippedDependencies}.` : '';
  $('coverage').textContent = (complete ? 'Все исполнимые проверки завершены.' : 'Проверка неполная. Непроверенные факты и маршруты требуют отдельного рассмотрения.') + areaSummary + dependencySummary;
  $('coverage').className = complete ? 'muted' : 'warning';
  $('warnings').replaceChildren();
  for (const warning of audit.warnings) { const p = document.createElement('p'); p.className = 'warning'; p.textContent = warning; $('warnings').append(p); }
  for (const run of dependencyRuns.filter(run => !['executed', 'not-applicable'].includes(run.status))) {
    const p = document.createElement('p'); p.className = 'warning';
    p.textContent = `Не завершена проверка ${run.componentId} · ${run.bindingId}. ${dependencyReason(run.reason)}`;
    $('warnings').append(p);
  }
  $('gaps').replaceChildren();
  for (const gap of audit.notChecked || []) {
    const item = document.createElement('article'); item.className = 'finding warning';
    const text = document.createElement('p'); text.textContent = `${gap.name}: ${gap.message}`;
    const focus = document.createElement('button'); focus.textContent = 'Показать компонент';
    focus.onclick = () => send({ type: 'focus-scope', auditId: audit.auditId, nodeId: gap.nodeId });
    item.append(text, focus); $('gaps').append(item);
  }
  renderContractFindings($('findings'),data,contractFocusClient);
  const select = $('explain-scope'); select.replaceChildren();
  for (const [index, component] of explanationComponents().entries()) {
    const option = document.createElement('option'); option.value = index; option.textContent = component.name || `Компонент ${index + 1}`; select.append(option);
  }
  updateExplanation();
  status(violations.length ? 'Проверка завершена. Есть замечания.' : complete ? 'Нарушений не обнаружено.' : 'Результат получен, покрытие неполное.');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(audit===data.audit)console.info('[Apollo] report delivery/render',JSON.stringify({auditId:audit.auditId,bridgeMs:data.delivery?Math.max(0,received-data.delivery.postedAt):null,renderToFrameMs:Math.max(0,performance.now()-renderStarted)}));}));
}
function saveReport(value,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('export').onclick=()=>{if(audit){const native=designCheck.getState().documentAudit;saveReport(Object.assign({},auditSummary(audit),{pluginBuildId:__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__,auditFailures:designCheck.getState().auditFailures,nativeAudit:{status:native.status,requestId:native.requestId,error:native.error,diagnostic:native.diagnostic||null,failures:native.failures||[],progress:native.progress||''}}),`apollo-summary-${audit.auditId.slice(0,12)}.json`);}};
$('export-full').onclick=async()=>{
  if(!audit)return;const pinned=audit,button=$('export-full');button.disabled=true;button.textContent='Получаем диагностику…';
  try{const full=await auditReports.request(pinned.auditId,'full');if(pinned===audit)saveReport(Object.assign({},full,{pluginBuildId:__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__,auditFailures:designCheck.getState().auditFailures,nativeAudit:designCheck.getState().documentAudit}),`apollo-v4-${full.auditId.slice(0,12)}.json`);}
  catch(e){if(pinned===audit)status(e.message,true);}
  finally{button.disabled=false;button.textContent='Полная диагностика';}
};
function explanationComponents() {
  return audit?.components || (audit ? [{ name: 'Выделенный компонент', release: audit.release, snapshot: audit.snapshot, auditId: audit.auditId }] : []);
}
function selectedExplanation() { return explanationComponents()[Number($('explain-scope').value)]; }
function updateExplanation() {
  agentSequence++;
  const selected = selectedExplanation();
  $('explain').disabled = !selected || selected.release.channel === 'local-file';
  $('explanation').textContent = !selected ? 'Нет проверенных компонентов для объяснения.'
    : selected.release.channel === 'local-file' ? 'Для объяснения проверьте выделение через ApolloProxyControl.' : '';
}
$('explain-scope').onchange = updateExplanation;
$('explain').onclick = async () => {
  const component = selectedExplanation();
  if (!audit || !component || component.release.channel === 'local-file') return;
  const current = ++agentSequence, pinned = audit;
  $('explain').disabled = true; $('explanation').textContent = 'Codex разбирает результат…';
  try {
    const selected=component.snapshot?.nodes ? component : await auditReports.request(pinned.auditId,'component',component.auditId);
    if(current!==agentSequence||pinned!==audit)return;
    const response = await fetchJson('/v2/contracts/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release: selected.release, snapshot: selected.snapshot, auditId: selected.auditId }) });
    if (current === agentSequence && pinned === audit) $('explanation').textContent = response.explanation;
  } catch (error) { if (current === agentSequence && pinned === audit) $('explanation').textContent = error.message; }
  finally { if (current === agentSequence && pinned === audit) $('explain').disabled = false; }
};
const contractRequests=new Map();
function stopAudit(){
 pendingContractDelivery=null;pendingNativeDelivery=null;
 if(activeRequest&&busy){contractStopping=true;designCheck.setAuditProgress(activeRequest,'Останавливаем проверку…');send({type:'audit-cancel',requestId:activeRequest});for(const [id,request]of contractRequests)if(id.startsWith(activeRequest+':')){request.abort.abort();contractRequests.delete(id);}}
 documentAuditClient.stop();controls();
}
window.addEventListener('offline',()=>{if(busy||designCheck.getState().documentAudit.status==='loading'){designCheck.stopAudit('offline');status('Потеряно соединение с интернетом. Проверка остановлена; доступные результаты сохранены.',true);}});
async function resolve(data) {
 const catalog=data.type==='resolve-catalog-reference';
 contractRequests.get(data.requestId)?.abort.abort();
 const task={abort:new AbortController()};contractRequests.set(data.requestId,task);let attempt=0;
 try{
  while(contractRequests.get(data.requestId)===task){
   const abort=new AbortController(),cancel=()=>abort.abort();task.abort.signal.addEventListener('abort',cancel,{once:true});
   const timer=setTimeout(()=>abort.abort(),20000);
   try{
    const response=await fetch(BASE+(catalog?'/v2/contracts/catalog-resolve':'/v2/contracts/resolve'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(catalog?{selection:data.selection,releaseId:data.releaseId}:{components:data.components,releaseId:data.releaseId}),signal:abort.signal});
    const body=await response.json().catch(error=>{if(catalog&&response.status===404)return{success:false,code:'CATALOG_ENDPOINT_REQUIRED',error:'Для проверки с каталогами нужна совместимая сборка Proxy.'};throw error;});if(task.abort.signal.aborted)return;
    // Missing pinned catalogue data cannot recover by repeating the same request.
    const catalogFailure=catalog&&typeof body.code==='string'&&/^CATALOG_[A-Z0-9_]+$/.test(body.code);
    if(!response.ok||body.success===false){const error=Object.assign(Error(body.error||'PROXY_RESPONSE_INVALID'),{code:catalogFailure?body.code:response.status>=500?'PROXY_UNAVAILABLE':body.code||'PROXY_RESPONSE_INVALID'});throw error;}
    designCheck.setProxyStatus({available:true,version:designCheck.getState().chat.proxy.version});send({type:'contracts-resolved',requestId:data.requestId,data:body});return;
   }catch(error){
    if(task.abort.signal.aborted)return;
    const auditRequest=activeRequest&&data.requestId.startsWith(activeRequest+':')&&!contractStopping;
    const transient=error instanceof TypeError||error.name==='AbortError'||error.code==='PROXY_UNAVAILABLE';
    if(!auditRequest||!transient){send({type:'contracts-resolved',requestId:data.requestId,code:error.code||'PROXY_UNAVAILABLE',error:'ApolloProxyControl: '+error.message});return;}
    send({type:'contracts-progress',requestId:data.requestId,code:error.name==='AbortError'?'PROXY_TIMEOUT':'PROXY_UNAVAILABLE'});
    designCheck.setAuditProgress(activeRequest,'Ожидаем ответ Proxy. Проверка продолжится автоматически…');
    await new Promise(resolve=>{const delay=setTimeout(resolve,Math.min(2000,++attempt*250));task.abort.signal.addEventListener('abort',()=>{clearTimeout(delay);resolve();},{once:true});});
   }finally{clearTimeout(timer);task.abort.signal.removeEventListener('abort',cancel);}
  }
 }finally{if(contractRequests.get(data.requestId)===task)contractRequests.delete(data.requestId);}
}

window.onmessage = event => {
  // Figma can deliver its bridge message from an outer editor frame instead
  // of the immediate sandbox parent. Accept only windows in our ancestor chain.
  let ancestor = parent;
  while (event.source !== ancestor && ancestor !== ancestor.parent) ancestor = ancestor.parent;
  if (event.source !== ancestor) return;
  const data = event.data?.pluginMessage; if (!data) return;
  if(data.type==='audit-host-yield'){
    if(Object.keys(data).sort().join(',')==='ticket,type' && typeof data.ticket==='string' && data.ticket.length>0 && data.ticket.length<=150) send({type:'audit-host-yield-done',ticket:data.ticket});
    return;
  }
  if (auditStatisticsClient.accept(data) || tokenJournalClient.accept(data) || uiClient.accept(data) || contractData.accept(data) || auditReports.accept(data)) return;
  if (figmaAuditClient?.accept(data)) return;
  if (layerNamesClient?.accept(data)) return;
  if (reglyphClient?.accept(data)) return;
  if (landingUi?.accept(data)) return;
  if(contractFocusClient.accept(data)){controls();return;}
  if (data.type === 'selection') { statisticsUserName=typeof data.statisticsUserName==='string'?data.statisticsUserName:null; figmaAuditClient?.selection(data); layerNamesClient?.selection(data); reglyphClient?.selection(data); documentAuditClient.selection(data); if(currentPageId&&data.pageId&&currentPageId!==data.pageId)markContractStale();currentPageId=data.pageId||currentPageId; validSelection = data.valid; $('selection').textContent = data.name || 'Выделите область или слои с компонентами'; }
  if (data.type === 'contract-loaded') { $('contract-name').textContent = `${data.name} · r${data.revision} · локальный авторский контракт`; status('Локальный пакет загружен. Можно проверять выделение.'); }
  if (data.type === 'source-mode') { clearResult(); $('contract-name').textContent = 'Прокси подберёт контракты по ключам компонентов'; status('Автоматическая загрузка контрактов включена.'); }
  if(['v3-catalog-request','v3-catalog-cancel'].includes(data.type)){void catalogTransport.accept(data);return;}
  if(data.type==='resolve-contracts-cancel'){const request=contractRequests.get(data.requestId);request?.abort.abort();contractRequests.delete(data.requestId);return;}
  if (data.type === 'resolve-contracts'||data.type==='resolve-catalog-reference') void resolve(data);
  if(data.type==='audit-invalidated'){if(pendingContractDelivery?.audit.auditId===data.auditId){const requestId=pendingContractDelivery.requestId;pendingContractDelivery=null;designCheck.beginContractAudit(requestId);startContractAudit(requestId,true);return;}if(audit?.auditId===data.auditId)markContractStale();}
  if(data.type==='audit-recovery'&&data.requestId===activeRequest&&!contractStopping){designCheck.recordAuditFailure(data.diagnostic);status(data.message);designCheck.setAuditProgress(activeRequest,data.message);return;}
  if (data.type === 'audit-progress' && data.requestId === activeRequest&&!contractStopping) {status(data.message);designCheck.setAuditProgress(activeRequest,data.message);}
  if(data.type==='audit-cancelled'&&data.requestId===activeRequest&&contractStopping){busy=false;auditStatisticsClient.finish(activeRequest,'contract-area',null,'cancelled');designCheck.acceptAuditCancelled(activeRequest);activeRequest='';contractStopping=false;controls();return;}
  if (data.requestId && data.requestId === cancelledAuditRequest && ['audit-result', 'error'].includes(data.type)) { busy = false; cancelledAuditRequest = ''; controls(); return; }
  if (data.type === 'audit-result' && data.requestId === activeRequest && designCheck.getState().auditBusy&&!contractStopping) { busy = false;pendingContractDelivery=data; designCheck.acceptAuditResult(data.requestId, Object.assign({},data.audit,{displayMetadata:data.displayMetadata})); activeRequest = ''; }
  if (data.type === 'error' && ((!data.requestId&&!activeRequest) || data.requestId === activeRequest&&!contractStopping)) { if(pendingNativeDelivery){auditStatisticsClient.finish(pendingNativeDelivery.requestId,'native-document',pendingNativeDelivery.result);pendingNativeDelivery=null;}designCheck.recordAuditFailure(data.diagnostic);auditStatisticsClient.finish(activeRequest,'contract-area',null,'failed');busy = false; designCheck.acceptAuditError(activeRequest, data.message); activeRequest = ''; status(data.message, true); }
  if(data.type==='document-audit-invalidated'){if(pendingNativeDelivery?.result.runId===data.runId)pendingNativeDelivery=null;if(audit)markContractStale();}
  if (documentAuditClient.accept(data)) {const state=designCheck.getState().documentAudit;if(data.type==='document-audit-progress'&&require('./document-audit/protocol').resultValid(data.result))auditStatisticsClient.checkpoint(data.requestId,data.result);if(data.type==='document-audit-result'&&documentAuditClient.isAcceptedResult(data.requestId,data.result)){pendingNativeDelivery=data;flushAuditDeliveries();}else if(data.type==='document-audit-error')auditStatisticsClient.finish(data.requestId,'native-document',null,'failed');else if(data.type==='document-audit-cancelled'&&state.cancelled)auditStatisticsClient.finish(data.requestId,'native-document',null,'cancelled');controls(); return; }
  controls();
};

controls();
send({ type: 'ready' });
landingUi=require('./landing/ui').mountLanding({root:$('generation-panel'),send,beforeOperation:compatibility.ensure,isVisible:()=>designCheck.getState().mode==='generation'&&!designCheck.getState().chat.open,readPlatform:()=>designCheck.getState().settings.pickerLabel,isUnavailable:()=>busy||Boolean(figmaAuditClient?.busy())||contractFocusClient.busy()||Boolean(reglyphClient?.busy())||Boolean(layerNamesClient?.busy())||designCheck.getState().documentAction.busy||['loading','cancelling'].includes(designCheck.getState().documentAudit.status),onBusy:value=>{generationBusy=value;controls();}});
mountDesignCheck($('design-check-root'), designCheck, { setup: $('legacy-setup'), audit: $('result'), auditDiagnostics: $('audit-diagnostics'), generation: $('generation-panel') }, { readContractData: contractData.read, skillsClient: layerNamesClient, reglyphClient, figmaAuditClient, statisticsClient:tokenJournalClient, auditStatisticsClient });
void designCheck.restorePreferences();
designCheck.subscribe(()=>landingUi?.refresh());
window.addEventListener('pagehide',()=>landingUi?.close());

// Retained metadata is retried independently of audits and model requests.
void tokenJournalClient.flush();
void auditStatisticsClient.flush();
window.addEventListener('online',()=>{void auditStatisticsClient.flush();});
window.addEventListener('online',()=>{void tokenJournalClient.flush();});

void designCheck.refreshProxyStatus();
