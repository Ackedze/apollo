const {failureText}=require("./generation/failure");
const {mountAgentGeneration}=require("./generation/agent/ui");
let agentUi=null;
let layerNamesClient=null;
let reglyphClient=null;
const {createReglyphClient}=require("./skills/reglyph/client");
const {createLayerNamesClient}=require("./skills/layer-names/client");
const {createAuditFocusClient}=require("./audit-focus-client");
const { mountDesignCheck, createDesignCheckController, createExistingDialoguePort, tabDefinitions } = require("./design-check/index");
const { createUiClient } = require("./design-check/ui-client");
const { createDocumentAuditClient } = require("./design-check/document-audit-client");
const { createOpaqueId } = require("./design-check/opaque-id");
require("./design-check/legacy.css");
require("./generation/chat.css");
const {mountGenerationChat}=require("./generation/chat/ui");
let generationChatUi=null;
const {createNativeDiagnosticUi} = require("./native-diagnostic-ui");
const {createStaticReviewTransport}=require("./generation/static/review-ui");
const {createPromptTransport}=require("./generation/prompt/ui");
const promptTransport=createPromptTransport();
const {createPromptConversation,appendPromptMessage}=require("./generation/prompt/conversation");
const promptConversation=createPromptConversation(message=>{
 const log=$('generation-chat-log');appendPromptMessage(log,message);
 const conversation=$('generation-conversation');conversation.scrollTop=conversation.scrollHeight;
 $('generation-chat-empty').hidden=true;
});
let promptPlanning=false,promptRevision=0,promptDirty=false;
let sessionRevision=0,sessionLoaded=false,sessionTimer=null;
const staticReviewTransport=createStaticReviewTransport(__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__);
const BASE = 'http://localhost:3001';
const tokenJournalClient = require('./token-journal-client').createTokenJournalClient({send:value=>parent.postMessage({pluginMessage:value},'*')});
const auditStatisticsClient=require('./audit-statistics/client').createStatisticsClient({send:value=>parent.postMessage({pluginMessage:value},'*'),versions:{plugin:require('../package.json').version,build:__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__,runtime:require('../packages/component-contract-core/package.json').version}});
const { createFrontendTransport } = require("./generation/frontend/ui");
const { resolveGenerationContext } = require("./generation/proxy/ui");
const { SOURCE_SCHEMA, sourceFromFiles, linkSourcePackages } = require("./authoring-source");
const { readZip, zipEntryText } = require('@apollo/component-contract-zip');
const {renderContractFindings}=require("./design-check/ContractFindings");
require("./design-check/finding-card.css");
const $ = id => document.getElementById(id);
let generationBusy = false, generationSpec = null, generationResult = null, generationRequest = '';
let generationLoading = false, generationLoadRevision = 0;
let validSelection = false, busy = false, sequence = 0, activeRequest = '', cancelledAuditRequest = '', audit = null, agentSequence = 0;
const send = value => {
  if(value.type==='document-audit-request')auditStatisticsClient.start(value.requestId,'native-document',value.context||null);
  if(value.type==='document-audit-cancel')auditStatisticsClient.finish(value.requestId,'native-document',null,designCheck.getState().documentAudit.status==='cancelling'?'failed':'cancelled');
  if(value.type==='audit-cancel')auditStatisticsClient.finish(value.requestId,'contract-area',null,contractStopping?'failed':'cancelled');
  parent.postMessage({ pluginMessage: value }, '*');
};
const {createCatalogTransport}=require("./v3-binding/catalog-port");
const catalogTransport=createCatalogTransport(send);
const uiClient = createUiClient(send);
const {auditSummary,createAuditReportClient}=require("./audit-report");
const auditReports=createAuditReportClient(send);
const contractData = require("./contract-data").createContractDataClient(send);
const {SESSION_SCHEMA,createSessionClient}=require("./generation/session/client");
const sessionClient=createSessionClient(send);
const dialogue = createExistingDialoguePort({ request: (url, options) => fetch(url, options), endpoint: BASE + '/analyze',
  createSessionId: () => 'apollo-v4-' + createOpaqueId() });
let lastCompact = false, contractTimer=null, contractStopping=false, currentPageId='';
const designCheck = createDesignCheckController({ tabs: tabDefinitions, preferenceScope: 'agent-source', preferences: uiClient.preferences, dialogue,
  onSettingChange: key => { if (['pickerLabel','channelId','pageTypeId'].includes(key)) {documentAuditClient.invalidate();markContractStale(true);} },
  onDocumentAction:(findingId,targetId,actionId)=>{documentAuditClient.action(findingId,targetId,actionId);controls();},
  onDocumentFocus: (findingId, targetId) => documentAuditClient.focus(findingId, targetId),
  onDocumentAudit: ({ requestId, uiPreferences }) => {
    tokenJournalClient.start(requestId, true);
    documentAuditClient.start(requestId, uiPreferences);
    if (!validSelection) return;
    if (legacyOperationUnavailable()) return;
    designCheck.beginContractAudit(requestId); startContractAudit(requestId);
  },
  onAudit: ({ requestId }) => { startContractAudit(requestId); }
});
function startContractAudit(requestId) {
    auditStatisticsClient.start(requestId,'contract-area',designCheck.getState().settings.pickerLabel);
    tokenJournalClient.start(requestId);
    if(audit)markContractStale();else clearResult(false); busy = true; contractStopping=false;activeRequest = requestId; controls();
    clearTimeout(contractTimer);contractTimer=setTimeout(()=>{if(activeRequest===requestId&&busy){contractStopping=true;designCheck.setAuditProgress(requestId,'Останавливаем проверку контрактов: ожидаем подтверждение от Figma…');send({type:'audit-cancel',requestId});}},60000);
    status('Собираем факты и независимый библиотечный эталон…'); send({ type: 'audit', requestId, platform: ({Desktop:'desktop',MobileWeb:'mobile-web',iOS:'ios',Android:'android'})[designCheck.getState().settings.pickerLabel] });
}
const documentAuditClient = createDocumentAuditClient({send,controller:designCheck,isBusy:()=>legacyOperationUnavailable()||contractFocusClient.busy(),onRecheckStart:m=>{for(const origin of ['native-document','contract-area'])auditStatisticsClient.start(m.requestId,origin,designCheck.getState().settings.pickerLabel,'recheck',origin==='contract-area'?m.runId.replace(/:native$/,''):m.runId);markContractStale();},onRecheckResult:m=>{auditStatisticsClient.finish(m.requestId,'native-document',m.result);if(m.contract){auditStatisticsClient.finish(m.requestId,'contract-area',Object.assign({},m.contract.audit,{statisticsMetrics:m.contract.statisticsMetrics}));render(m.contract);designCheck.setAudit(Object.assign({},m.contract.audit,{displayMetadata:m.contract.displayMetadata}));}else auditStatisticsClient.discard(m.requestId,'contract-area');controls();},onRecheckError:m=>{for(const origin of ['native-document','contract-area'])auditStatisticsClient.finish(m.requestId,origin,null,'failed');markContractStale();}});
const contractFocusClient=createAuditFocusClient({send,onStatus:status,isBusy:()=>designCheck.getState().documentAction.busy});
designCheck.subscribe(() => {
  tokenJournalClient.observe(designCheck.getState());
  const settings=designCheck.getState().settings;
  reglyphClient?.setContext({channelId:settings.channelId,pickerLabel:settings.pickerLabel});
  const compact = settings.compact;
  if (compact === lastCompact) return;
  lastCompact = compact; void uiClient.resize(compact).catch(error => status(error.message, true));
});
const nativeDiagnosticUi = createNativeDiagnosticUi(send,state=>{ $('native-diagnostic-status').textContent=state.busy?'Читаем выделение…':state.error?'Не удалось получить диагностику. Повторите чтение.':state.report?'Чтение завершено. Неподтверждённые связи указаны в JSON.':'Чтение текущего компонента без изменения макета.'; controls(); });
layerNamesClient=createLayerNamesClient({send,onOperation:kind=>tokenJournalClient.begin(kind),isBusy:()=>legacyOperationUnavailable()||contractFocusClient.busy()||['loading','cancelling'].includes(designCheck.getState().documentAudit.status),onChange:()=>controls()});
reglyphClient=createReglyphClient({send,onOperation:kind=>tokenJournalClient.begin(kind),isBusy:()=>legacyOperationUnavailable(true)||contractFocusClient.busy()||['loading','cancelling'].includes(designCheck.getState().documentAudit.status),onChange:()=>controls()});
reglyphClient.setContext({channelId:designCheck.getState().settings.channelId,pickerLabel:designCheck.getState().settings.pickerLabel});
function dependencyReason(reason) {
  if (['dependency-reference-not-captured', 'dependency-reference-capture-failed', 'dependency-main-component-unavailable', 'dependency-instance-unavailable'].includes(reason)) return 'Не удалось получить независимый библиотечный эталон.';
  if (reason === 'dependency-variable-modes-unavailable') return 'Не удалось воспроизвести режимы переменных.';
  if (reason === 'dependency-capture-actual-mismatch') return 'Вложенный снимок не совпадает с фактами основного компонента.';
  if (reason === 'dependency-check-incomplete') return 'Остались неизвестные факты или неисполненные правила.';
  if (reason === 'dependency-reference-capture-limit') return 'Превышен лимит захвата вложенных компонентов.';
  return 'Недостаточно подтверждённых фактов о структуре, варианте или происхождении компонента.';
}
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function legacyOperationUnavailable(ignoreReglyph=false) { return (!ignoreReglyph && Boolean(reglyphClient?.busy())) || Boolean(layerNamesClient?.busy()) || Boolean(agentUi?.busy()) || designCheck.getState().documentAction.busy || busy || generationBusy || generationLoading || nativeDiagnosticUi.busy(); }
function controls() {
  agentUi?.refresh();
  layerNamesClient?.refresh();
  reglyphClient?.refresh();
  const generationUnavailable = legacyOperationUnavailable();
  $('native-diagnostic').disabled = generationUnavailable || !validSelection;
  $('native-diagnostic-export').disabled = generationUnavailable || !nativeDiagnosticUi.report();
  $('audit').disabled = !validSelection || generationUnavailable;
  $('audit').textContent = busy ? 'Проверяем…' : 'Проверить выделение';
  designCheck.setDocumentPageAvailable(documentAuditClient.hasPage());
  designCheck.setAuditReady(documentAuditClient.hasPage() ? !designCheck.getState().documentAction.busy && !['loading','cancelling'].includes(designCheck.getState().documentAudit.status) && !designCheck.getState().auditBusy : validSelection && !generationUnavailable);
  for (const id of ['proxy', 'file', 'generation-file', 'generation-spec-file']) $(id).disabled = generationUnavailable;
  $('generation-dropzone').setAttribute('aria-disabled', String(generationUnavailable));
  for(const id of ['generation-prompt','generation-platform','generation-width','generation-height'])$(id).disabled=generationUnavailable;
  $('generation-plan-prompt').disabled=generationUnavailable||!sessionLoaded||!$('generation-prompt').value.trim()||!$('generation-width').validity.valid||!$('generation-height').validity.valid;
  $('generation-prompt-cancel').hidden=!promptPlanning;
  $('generation-plan-prompt').hidden=promptPlanning;
  $('generation-chat-reset').disabled=generationUnavailable||!sessionLoaded||!promptConversation.hasMessages()&&generationSpec===null;
  $('generation-chat-reset').hidden=false;
  $('generation-chat-log').setAttribute('aria-busy',String(promptPlanning));
  $('generation-chat-pending').hidden=!promptPlanning;
  $('generation-prompt-label').textContent=promptConversation.hasMessages()?'Уточнение экрана':'Описание экрана';
  $('generation-plan-prompt').setAttribute('aria-label',promptConversation.hasMessages()?'Отправить уточнение':'Отправить сообщение');
  $('generation-plan-prompt').title=promptConversation.hasMessages()?'Отправить уточнение':'Отправить сообщение';
  generationChatUi?.refresh();
  $('generation-spec-export').disabled=generationUnavailable||generationSpec===null;
  $('generation-review').disabled = generationUnavailable || !sessionLoaded || generationSpec === null || promptDirty;
  $('generation-prepare').disabled = generationUnavailable || !sessionLoaded || generationSpec === null || promptDirty;
  const targets = $('generation-target').value === 'both' ? ['figma','frontend'] : [$('generation-target').value];
  $('generation-execute').disabled = generationUnavailable || !generationResult?.sessionId || !targets.every(target => generationResult.preflight?.targets[target] === 'prepared' && generationResult.executionPorts[target] === 'available');
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
$('export').onclick=()=>{if(audit)saveReport(auditSummary(audit),`apollo-summary-${audit.auditId.slice(0,12)}.json`);};
$('export-full').onclick=async()=>{
  if(!audit)return;const pinned=audit,button=$('export-full');button.disabled=true;button.textContent='Получаем диагностику…';
  try{const full=await auditReports.request(pinned.auditId,'full');if(pinned===audit)saveReport(full,`apollo-v4-${full.auditId.slice(0,12)}.json`);}
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
async function resolve(data) {
  try {
    const body = await fetchJson('/v2/contracts/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ components: data.components, releaseId: data.releaseId }) });
    designCheck.setProxyStatus({ available: true, version: designCheck.getState().chat.proxy.version });
    send({ type: 'contracts-resolved', requestId: data.requestId, data: body });
  } catch (error) { void designCheck.refreshProxyStatus(); send({ type: 'contracts-resolved', requestId: data.requestId, error: `ApolloProxyControl: ${error.message}` }); }
}
window.onmessage = event => {
  // Figma can deliver its bridge message from an outer editor frame instead
  // of the immediate sandbox parent. Accept only windows in our ancestor chain.
  let ancestor = parent;
  while (event.source !== ancestor && ancestor !== ancestor.parent) ancestor = ancestor.parent;
  if (event.source !== ancestor) return;
  const data = event.data?.pluginMessage; if (!data) return;
  if (auditStatisticsClient.accept(data) || tokenJournalClient.accept(data) || uiClient.accept(data) || contractData.accept(data) || auditReports.accept(data)) return;
  if (layerNamesClient?.accept(data)) return;
  if (reglyphClient?.accept(data)) return;
  if (sessionClient.accept(data)) return;
  if(contractFocusClient.accept(data)){controls();return;}
  if (data.type === 'native-diagnostic-invalidated') { nativeDiagnosticUi.invalidate(); agentUi?.invalidateNative(); return; }
  if (nativeDiagnosticUi.accept(data)) return;
  if (data.type === 'generation-result' && data.requestId === generationRequest) { generationBusy = false; renderGeneration(data.result); }
  if (data.type === 'error' && data.requestId === generationRequest) { generationBusy = false; generationResult = null; $('generation-status').textContent = data.message; }
  if (data.type === 'generation-error' && data.requestId === generationRequest) { generationBusy = false; generationResult = null; $('generation-status').textContent = data.message; }
  if (agentUi?.accept(data)) {controls();return;}
  if (data.type === 'selection') { layerNamesClient?.selection(data); reglyphClient?.selection(data); documentAuditClient.selection(data); if(currentPageId&&data.pageId&&currentPageId!==data.pageId)markContractStale();currentPageId=data.pageId||currentPageId; validSelection = data.valid; $('selection').textContent = data.name || 'Выделите область или слои с компонентами'; }
  if (data.type === 'contract-loaded') { $('contract-name').textContent = `${data.name} · r${data.revision} · локальный авторский контракт`; status('Локальный пакет загружен. Можно проверять выделение.'); }
  if (data.type === 'source-mode') { clearResult(); $('contract-name').textContent = 'Прокси подберёт контракты по ключам компонентов'; status('Автоматическая загрузка контрактов включена.'); }
  if(['v3-catalog-request','v3-catalog-cancel'].includes(data.type)){void catalogTransport.accept(data);return;}
  if (data.type === 'resolve-contracts') resolve(data);
  if (data.type === 'generation-frontend-request') generationFrontendTransport.execute(data);
  if (data.type === 'generation-frontend-cancel') generationFrontendTransport.cancel(data);
  if (data.type === 'generation-context-request') resolveGenerationContext(data, send);
  if(data.type==='audit-invalidated'&&audit?.auditId===data.auditId)markContractStale();
  if (data.type === 'audit-progress' && data.requestId === activeRequest&&!contractStopping) {status(data.message);designCheck.setAuditProgress(activeRequest,data.message);}
  if(data.type==='audit-cancelled'&&data.requestId===activeRequest&&contractStopping){busy=false;clearTimeout(contractTimer);designCheck.acceptAuditError(activeRequest,'Проверка контрактов остановлена после таймаута. Полученные native-результаты сохранены.');activeRequest='';contractStopping=false;controls();return;}
  if (data.requestId && data.requestId === cancelledAuditRequest && ['audit-result', 'error'].includes(data.type)) { busy = false; cancelledAuditRequest = ''; controls(); return; }
  if (data.type === 'audit-result' && data.requestId === activeRequest && designCheck.getState().auditBusy&&!contractStopping) { auditStatisticsClient.finish(data.requestId,'contract-area',Object.assign({},data.audit,{statisticsMetrics:data.statisticsMetrics}));busy = false;clearTimeout(contractTimer); render(data); designCheck.acceptAuditResult(data.requestId, Object.assign({},data.audit,{displayMetadata:data.displayMetadata})); activeRequest = ''; }
  if (data.type === 'error' && ((!data.requestId&&!activeRequest) || data.requestId === activeRequest&&!contractStopping)) { auditStatisticsClient.finish(activeRequest,'contract-area',null,'failed');busy = false;clearTimeout(contractTimer); designCheck.acceptAuditError(activeRequest, data.message); activeRequest = ''; status(data.message, true); }
  if(data.type==='document-audit-invalidated'&&audit)markContractStale();
  if (documentAuditClient.accept(data)) {const state=designCheck.getState().documentAudit;if(data.type==='document-audit-progress'&&require('./document-audit/protocol').resultValid(data.result))auditStatisticsClient.checkpoint(data.requestId,data.result);if(data.type==='document-audit-result'&&state.status==='available'&&state.result===data.result)auditStatisticsClient.finish(data.requestId,'native-document',data.result);else if(data.type==='document-audit-error')auditStatisticsClient.finish(data.requestId,'native-document',null,'failed');controls(); return; }
  controls();
};

const generationFrontendTransport = createFrontendTransport(send);

function renderGeneration(result) {
  generationResult = result;
  const labels = {confirmed:'подтверждён',blocked:'проверка заблокирована',unverified:'ещё не подтверждён',ready:'Ready',prepared:'план подготовлен',completed:'исполнение завершено',unavailable:'порт не подключён',available:'порт подключён'};
  $('generation-status').textContent = (result.receipts||[]).some(r=>r.status==='created'||r.status==='verified') ? 'Результаты созданы. Статус проверки указан для каждого результата.' : result.status === 'blocked' ? 'Результат не создан. Требуются подтверждённые входы.' : 'Общий план проверен. Приёмка каждого результата выполняется отдельно.';
  $('generation-stages').replaceChildren();
  for (const [name,value] of [['Схема',result.schemaAccepted?'валидна':'есть ошибки'],['Code API',labels[result.apiAvailability]],['Авторский source',labels[result.sourceReadiness]],['Preflight Figma',labels[result.preflight?.targets.figma] || 'не выполнен'],['Preflight фронта',labels[result.preflight?.targets.frontend] || 'не выполнен'],['Исполнение Figma',labels[result.executionPorts.figma]],['Исполнение фронта',labels[result.executionPorts.frontend]]]) {
    const p = document.createElement('p'); p.textContent = name + ': ' + value; $('generation-stages').append(p);
  }
  $('generation-diagnostics').replaceChildren();
  const messages = {STALE_CONTRACT_PIN:'Архивы контрактов обновились. Требуется обновить точные версии в registry и lock, затем повторить подготовку.',FRONTEND_PROFILE_NOT_ACCEPTED:'Профиль фронта ещё не принят: нужны подтверждённые ширина, подписи, стили и команды.',FRONTEND_LAYOUT_GUARD_BLOCKED:'Действия не помещаются в заданную область. Результат удалён.',FRONTEND_COMMAND_BANK_MISSING:'Не подключены подтверждённые команды действий.',FRONTEND_NORMATIVE_RULES_UNVERIFIED:'Сборка и сценарии проверены. Правила контракта и соответствие Figma ещё не подтверждены.',CODE_EVIDENCE_PORT_UNAVAILABLE:'Проверенный reader контрактов и свежего registry Code Connect / Proxy ещё не подключён.',SOURCE_COMPILE:'Proxy прочитал пакет, но авторский контракт не проходит Ready-компиляцию. Требуется исправить source или принять его в Editor.',GENERATION_PROXY_ROUTE_UNAVAILABLE:'В запущенном ApolloProxyControl нет маршрута Generation. Обновите локальный Proxy.',GENERATION_PROXY_UNAVAILABLE:'Не удалось связаться с ApolloProxyControl. Проверьте, что Proxy запущен.',GENERATION_PROXY_TIMEOUT:'Proxy не ответил вовремя. Повторите подготовку.',GENERATION_PROXY_RESPONSE_INVALID:'Ответ Proxy не совпадает со спецификацией или контрольной суммой.',SOURCE_NOT_READY:'Авторский source остаётся Draft или содержит ошибки.',STALE_PLAN:'Входные версии изменились. Повторите подготовку.',PUBLIC_EXPORT_MISSING:'Нет подтверждённого публичного export arui-private.',SCREEN_SCHEMA:'ScreenSpec содержит ошибку схемы.',MAPPING_MISSING:'Компонент не имеет подтверждённого mapping.'};
  for (const d of result.diagnostics || []) { const p = document.createElement('p'); p.className = 'warning'; p.textContent = `${d.code}: ${messages[d.code] || d.message}`; $('generation-diagnostics').append(p); }
  $('generation-receipts').replaceChildren();
  for (const r of result.receipts || []) { const p = document.createElement('p'); p.textContent = `${r.target === 'figma' ? 'Figma' : 'Фронт'}: ${r.status}; проверка: ${r.verification}; cleanup: ${r.rollback}`; $('generation-receipts').append(p);
    for(const d of r.diagnostics||[]){const detail=document.createElement('p');detail.className='warning';detail.textContent=d.code+': '+(messages[d.code]||d.message);$('generation-receipts').append(detail);}
    if(r.artifact&&/^[a-f0-9]{32}$/.test(r.artifact.id)){const a=document.createElement('a');a.href='http://localhost:3001/generation/frontend/artifacts/'+r.artifact.id+'/dist/index.html?probe=1';a.target='_blank';a.rel='noopener noreferrer';a.textContent='Открыть preview фронта';$('generation-receipts').append(a);}
  }
}
function renderStaticReview(result){
 generationResult=null;
 const words={observed:'прочитан',unavailable:'не прочитан',ready:'Ready',draft:'Draft',invalid:'есть ошибки',unverified:'не подтверждено',matches:'совпадают',stale:'устарели',rejected:'отклонена',incomplete:'неполное',valid:'валидна'};
 $('generation-status').textContent='Review завершён. Создание результата заблокировано.';
 $('generation-stages').replaceChildren();
 const lines=[`Схема: ${words[result.schemaStatus]}`,`Авторский source: ${words[result.source.readiness]}`,`Code API: ${result.api.availability==='confirmed-source-api'?'подтверждён по исходникам':'не подтверждён'}`,`Покрытие: ${words[result.coverage.status]}; nonExecutable: ${result.coverage.nonExecutable}; pending: ${result.coverage.pending}; ошибки: ${result.coverage.errors}`,`Producer freshness: ${words[result.freshness.status]}; различий: ${result.freshness.mismatches}`,`Consumer binding: ${words[result.consumerBinding.status]}; проверено файлов: ${result.consumerBinding.checkedFiles}`,`Figma и фронт: исполнение заблокировано`,`Live: не выполнен; release: не принят`];
 for(const line of lines){const p=document.createElement('p');p.textContent=line;$('generation-stages').append(p);}
 $('generation-diagnostics').replaceChildren();
 const messages={STATIC_PRODUCT_INPUT_REQUIRED:'Нужно явно задать значение.',STATIC_PRIORITY_REQUIRED:'Нужно отдельно задать бизнес-приоритет.',STATIC_REVIEW_WIRE_UNSUPPORTED:'Версия документа не поддерживается для static review.',STATIC_PRODUCER_DOCUMENT_REQUIRED:'Для этой спецификации ещё нет закреплённого producer review документа.',REVIEW_PRODUCER_CONTENT_MISMATCH:'Producer документ не совпадает с закреплённым содержимым.',REVIEW_CONSUMER_STALE:'Producer observation относится к прежним байтам consumer. Проверка текущей привязки показана отдельно.',SOURCE_NOT_READY:'Source остаётся Draft или содержит ошибки.',SOURCE_COMPILE:'Строгий runtime по-прежнему блокирует этот source.',STATIC_TARGET_UNSUPPORTED:'Статический пилот пока не поддерживает исполнение.',STATIC_WIDTH_FACTS_MISSING:'Фактическая ширина группы и кнопок ещё не проверена.',STATIC_CONTEXT_RECEIPTS_UNACCEPTED:'Scoped проверки контекстных правил ещё не приняты.',REVIEW_ONLY:'Результат доступен только для review.'};
 for(const d of result.diagnostics){const p=document.createElement('p');p.className='warning';p.textContent=d.code+(d.field?' · '+d.field:'')+': '+(messages[d.code]||'Проверка не даёт разрешения на исполнение.');$('generation-diagnostics').append(p);}
 $('generation-receipts').replaceChildren();
 if(result.consumerBinding.diagnosticCode){const p=document.createElement('p');p.className='warning';p.textContent=result.consumerBinding.diagnosticCode+': Текущая привязка не подтверждена локальной проверкой.';$('generation-diagnostics').append(p);}
 if(result.content){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Содержимое producer для review';pre.textContent=JSON.stringify({content:result.content,intent:result.intent,producerHashes:result.producer,generationPlanHash:null},null,2);details.append(summary,pre);$('generation-receipts').append(details);}
 controls();
}
function invalidatePromptPlan(){
 generationResult=null;generationRequest='';
 for(const id of ['generation-stages','generation-diagnostics','generation-receipts'])$(id).replaceChildren();
 send({type:'generation-invalidate'});
}
function sessionStatus(text){$('generation-session-status').textContent=text;$('generation-session-status').hidden=!text;}
function sessionSnapshot(){return {schemaVersion:SESSION_SCHEMA,conversation:promptConversation.snapshot(),composer:$('generation-prompt').value,
 platform:$('generation-platform').value,viewport:{width:$('generation-width').value,height:$('generation-height').value},dirty:promptDirty,generationMethod:agentUi?.selectedMethod()||'mcp'};}
async function saveSession(){
 clearTimeout(sessionTimer);if(!sessionLoaded||generationLoading)return;
 const revision=sessionRevision;
 try{await sessionClient.save(sessionSnapshot());if(revision===sessionRevision)sessionStatus('');}
 catch(e){if(revision===sessionRevision)sessionStatus(e.message==='GENERATION_SESSION_INVALID'?'История не соответствует формату сохранения (до 2 МБ и 512 сообщений). Она остаётся в панели; сохраните ScreenSpec перед закрытием.':'Не удалось сохранить историю на устройстве. Она остаётся в панели; сохраните ScreenSpec перед закрытием.');}
}
function changedSession(){sessionRevision++;clearTimeout(sessionTimer);sessionTimer=setTimeout(()=>void saveSession(),250);}
async function restoreSession(){
 const revision=sessionRevision,importRevision=generationLoadRevision;
 try{
  const value=await sessionClient.load();
  if(value&&importRevision===generationLoadRevision){
   promptConversation.restore(value.conversation);generationSpec=value.conversation.draft;promptDirty=value.dirty||revision!==sessionRevision;
   if(revision===sessionRevision){$('generation-prompt').value=value.composer;$('generation-platform').value=value.platform;
   $('generation-width').value=value.viewport.width;$('generation-height').value=value.viewport.height;agentUi?.setMethod(value.generationMethod||'mcp');}
   invalidatePromptPlan();
   if(generationSpec!==null){$('generation-spec-json').textContent=JSON.stringify(generationSpec,null,2);$('generation-spec-preview').hidden=false;$('generation-contracts').textContent='Восстановлен черновик. Контракты и входы будут прочитаны заново при проверке.';$('generation-name').textContent='Восстановленный ScreenSpec · черновик';}
   sessionStatus('История восстановлена. Перед сборкой Apollo заново проверит текущие входы.');controls();
  }
 }catch{sessionStatus('Не удалось восстановить историю. Текущий черновик сохранён в панели; повторите открытие плагина или загрузите ScreenSpec JSON.');}
 finally{sessionLoaded=true;if(revision!==sessionRevision)void saveSession();controls();}
}
function editPrompt(){
 agentUi?.edited();
 invalidatePromptPlan();promptDirty=generationSpec!==null;
 if(promptDirty)$('generation-status').textContent='Уточнение ещё не отправлено. Предыдущая спецификация сохранена; новый план будет проверен после ответа.';
 changedSession();controls();
}
for(const id of ['generation-prompt','generation-platform','generation-width','generation-height'])$(id).addEventListener('input',editPrompt);
$('generation-prompt-form').onsubmit=async event=>{
 event.preventDefault();if($('generation-plan-prompt').disabled)return;
 let prompt;
 try{prompt=promptConversation.submit($('generation-prompt').value);}
 catch(e){$('generation-status').textContent=e.message==='PROMPT_CONVERSATION_TOO_LONG'?'Запрос вместе с историей превышает 12 000 символов. Сохраните ScreenSpec и начните новый экран с кратким описанием. История остаётся доступна.':'Введите описание или уточнение.';return;}
 $('generation-prompt').value='';
 generationChatUi?.refresh();
 invalidatePromptPlan();nativeDiagnosticUi.invalidate();staticReviewTransport.invalidate();
 const current=++promptRevision;generationBusy=true;promptPlanning=true;promptDirty=generationSpec!==null;
 changedSession();void saveSession();$('generation-status').textContent='Читаем текущие контракты и составляем спецификацию…';controls();
 try{
  const promptInput={prompt,platform:$('generation-platform').value,viewport:{width:Number($('generation-width').value),height:Number($('generation-height').value)}};
  const result=await promptTransport.plan(promptInput,agentUi?.target()||'frontend',agentUi?.method()||null);
  if(current!==promptRevision)return;
  generationSpec=result.spec;promptDirty=false;promptConversation.receive(result);
  agentUi?.setDraft(result.spec,promptInput,{requestId:result.requestId});
  $('generation-name').textContent='ScreenSpec из диалога · черновик';
  $('generation-spec-json').textContent=JSON.stringify(result.spec,null,2);
  $('generation-contracts').textContent='Использованы контракты: '+result.contracts.map(c=>c.componentId+' · r'+c.revision+' · '+({ready:'Ready',draft:'Draft',unverified:'статус не подтверждён'}[c.sourceStatus])).join('; ');
  $('generation-spec-preview').hidden=false;
  $('generation-status').textContent=result.spec.unresolved.length||result.spec.capabilityGaps?.length?'Черновик сохранён. Вопросы и ограничения приведены в чате; уточнение можно отправить следующим сообщением.':'Черновик сохранён. Можно создать экран или уточнить детали в чате.';
 }catch(e){if(current===promptRevision){const messages={PROMPT_ROUTE_UNAVAILABLE:'В запущенном Proxy ещё нет планировщика. Требуется обновить Apollo Proxy.',PROMPT_PLANNER_UNAVAILABLE:'Планировщик не подключён к агенту Proxy.',PROMPT_PLANNER_BUSY:'Предыдущий запрос ещё завершается. Повторите позже.',PROMPT_PROXY_UNAVAILABLE:'Не удалось связаться с Apollo Proxy.',PROMPT_PLAN_TIMEOUT:'Агент не ответил за пять минут. Повторите запрос.',PROMPT_INPUTS_STALE:'Контракты или сборка изменились во время планирования. Повторите запрос.',PRODUCER_INPUTS_STALE:'Producer обновился во время планирования. Повторите запрос.',PROMPT_SPEC_INVALID:'Агент вернул некорректную спецификацию. Повторите запрос.',PROMPT_SPEC_MAPPING_UNSUPPORTED:'Агент выбрал компонент без доступного отображения. Повторите запрос.',PROMPT_SPEC_PORT_UNSUPPORTED:'Агент указал свойство, которого нет в контракте. Повторите запрос.'};const text=(messages[e.message]||'Новая спецификация не составлена. Повторите запрос.')+' ('+e.message+')'+(e.diagnostic?'\n'+failureText(e.diagnostic):'');promptConversation.feedback(text);$('generation-status').textContent=text;}}
 finally{if(current===promptRevision){generationBusy=false;promptPlanning=false;changedSession();void saveSession();controls();generationChatUi?.focusComposer();}}
};
$('generation-prompt-cancel').onclick=()=>{
 if(!promptPlanning)return;promptRevision++;promptTransport.invalidate();promptPlanning=false;generationBusy=false;
 const text='Ожидание отменено. Поздний ответ не будет использован; предыдущая спецификация сохранена.';
 promptConversation.feedback(text);changedSession();void saveSession();$('generation-status').textContent=text;controls();generationChatUi?.focusComposer();
};
$('generation-chat-reset').onclick=()=>{
 if($('generation-chat-reset').disabled)return;
 promptRevision++;promptTransport.invalidate();promptConversation.reset();promptDirty=false;agentUi?.reset();
 generationSpec=null;invalidatePromptPlan();
 $('generation-chat-log').replaceChildren();$('generation-chat-empty').hidden=false;$('generation-prompt').value='';
 $('generation-spec-preview').hidden=true;$('generation-spec-json').textContent='';$('generation-contracts').textContent='';
 changedSession();void saveSession();$('generation-name').textContent='Спецификация не загружена';$('generation-status').textContent='';controls();$('generation-prompt').focus();
 generationChatUi?.close(false);
};
$('generation-spec-export').onclick=()=>{
 if(generationSpec===null||$('generation-spec-export').disabled)return;
 const url=URL.createObjectURL(new Blob([JSON.stringify(generationSpec,null,2)],{type:'application/json'})),a=document.createElement('a');
 a.href=url;a.download='apollo-screen-spec.json';a.click();URL.revokeObjectURL(url);
};
$('generation-target').onchange = controls;
$('generation-file').onclick = () => $('generation-spec-file').click();
async function loadGenerationSpec(files) {
  if (busy || generationBusy || generationLoading || nativeDiagnosticUi.busy()) return;
  const revision = ++generationLoadRevision;sessionRevision++;
  generationLoading = true; generationSpec = null; generationResult = null; generationRequest = ''; promptDirty=false;
  nativeDiagnosticUi.invalidate();
  staticReviewTransport.invalidate();
  promptTransport.invalidate();
  $('generation-spec-preview').hidden=true;
  send({type:'generation-invalidate'});
  $('generation-name').textContent = 'Спецификация не загружена';
  for (const id of ['generation-status','generation-stages','generation-diagnostics','generation-receipts']) $(id).replaceChildren();
  controls();
  try {
    if (files.length !== 1) throw new Error('Перетащите один JSON-файл ScreenSpec.');
    const file = files[0];
    if (!/\.json$/i.test(file.name)) throw new Error('ScreenSpec должен быть JSON-файлом (.json).');
    if (file.size > 1024 * 1024) throw new Error('ScreenSpec больше 1 МБ.');
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch { throw new Error('Файл содержит некорректный JSON.'); }
    if (revision !== generationLoadRevision) return;
    generationSpec = parsed;promptConversation.useSpec(parsed);
    agentUi?.reset();agentUi?.setDraft(parsed,{prompt:'Собери загруженный ScreenSpec без изменения его состава и поведения.',platform:parsed.platform,viewport:parsed.viewport});
    $('generation-name').textContent = file.name;
    $('generation-status').textContent = 'Документ загружен. Для статического сценария выберите «Проверить для review».';
  } catch (error) { if (revision === generationLoadRevision) $('generation-status').textContent = error.message; }
  finally { if (revision === generationLoadRevision) { generationLoading = false; promptConversation.useSpec(generationSpec);changedSession();void saveSession();controls(); } }
}
$('generation-spec-file').onchange = event => {
  const files = Array.from(event.target.files); event.target.value = '';
  if (files.length) void loadGenerationSpec(files);
};
const specDropzone = $('generation-dropzone');
let specDragDepth = 0;
const hasDraggedFiles = event => Array.from(event.dataTransfer?.types || []).includes('Files');
const resetSpecDrag = () => { specDragDepth = 0; specDropzone.classList.remove('is-dragging'); };
specDropzone.addEventListener('dragenter', event => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  if (busy || generationBusy || generationLoading || nativeDiagnosticUi.busy()) return;
  specDragDepth++; specDropzone.classList.add('is-dragging');
});
specDropzone.addEventListener('dragover', event => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault(); event.dataTransfer.dropEffect = busy || generationBusy || generationLoading || nativeDiagnosticUi.busy() ? 'none' : 'copy';
});
specDropzone.addEventListener('dragleave', event => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault(); specDragDepth = Math.max(0, specDragDepth - 1);
  if (!specDragDepth) resetSpecDrag();
});
specDropzone.addEventListener('drop', event => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault(); resetSpecDrag(); void loadGenerationSpec(Array.from(event.dataTransfer.files));
});
// Keep a dropped file outside the import area from navigating the plugin iframe.
document.addEventListener('dragover', event => { if (hasDraggedFiles(event)) event.preventDefault(); });
document.addEventListener('drop', event => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault(); resetSpecDrag();
});
$('generation-prepare').onclick = () => {
  if (generationSpec === null || $('generation-prepare').disabled) return;
  generationBusy = true; generationResult = null; generationRequest = 'generation-' + (++sequence);
  $('generation-status').textContent = 'Проверяем спецификацию и доступность входов…'; controls();
  send({type:'generation-prepare',requestId:generationRequest,spec:generationSpec});
};
$('generation-review').onclick=async()=>{
 if(generationSpec===null||$('generation-review').disabled)return;
 generationBusy=true;generationResult=null;generationRequest='';send({type:'generation-invalidate'});
 $('generation-status').textContent='Читаем источники и проверяем документ для review…';controls();
 try{const result=await staticReviewTransport.review(generationSpec);renderStaticReview(result);}
 catch(e){const messages={STATIC_REVIEW_ROUTE_UNAVAILABLE:'В запущенном Proxy ещё нет маршрута review. Требуется обновить Proxy.',STATIC_REVIEW_RESPONSE_INVALID:'Ответ Proxy не прошёл проверку версии, данных или hashes.',REVIEW_BUILD_STALE:'Панель и сервер используют разные сборки. Требуется обновить источники и перезагрузить панель.',STATIC_REVIEW_TIMEOUT:'Proxy не ответил вовремя. Повторите проверку.',STATIC_REVIEW_PROXY_UNAVAILABLE:'Не удалось связаться с Proxy.',STATIC_REVIEW_BUSY:'Другая проверка review ещё выполняется.',STATIC_REVIEW_READ_UNAVAILABLE:'Не удалось прочитать закреплённые источники.'};$('generation-status').textContent='Review не выполнен. '+(messages[e.message]||'Проверка остановлена; данные не используются.')+' ('+e.message+')';for(const id of ['generation-stages','generation-diagnostics','generation-receipts'])$(id).replaceChildren();}
 finally{generationBusy=false;controls();}
};
$('generation-execute').onclick = () => {
  if (!generationResult?.sessionId || $('generation-execute').disabled) return;
  generationBusy = true; generationRequest = 'generation-' + (++sequence); controls();
  const targets = $('generation-target').value === 'both' ? ['figma','frontend'] : [$('generation-target').value];
  send({type:'generation-execute',requestId:generationRequest,sessionId:generationResult.sessionId,targets});
};

controls();
send({ type: 'ready' });

$('native-diagnostic').onclick=()=>{if($('native-diagnostic').disabled)return;nativeDiagnosticUi.request(generationSpec);};
$('native-diagnostic-export').onclick=()=>{
 const report=nativeDiagnosticUi.report();if(!report||$('native-diagnostic-export').disabled)return;
 const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download='apollo-native-diagnostic-'+String(report.reportHash).slice(0,12)+'.json';anchor.click();URL.revokeObjectURL(url);
};

agentUi=mountAgentGeneration({root:$('generation-agent-chat'),settingsRoot:$('generation-agent-settings'),send,onSettingsChange:changedSession,onBusy:()=>{controls();generationChatUi?.focusComposer();},isUnavailable:()=>busy||generationBusy||generationLoading||nativeDiagnosticUi.busy()||promptDirty||!sessionLoaded||designCheck.getState().documentAction.busy});
generationChatUi=mountGenerationChat({root:$('generation-panel'),controller:designCheck});
mountDesignCheck($('design-check-root'), designCheck, { setup: $('legacy-setup'), audit: $('result'), auditDiagnostics: $('audit-diagnostics'), generation: $('generation-panel') }, { readContractData: contractData.read, skillsClient: layerNamesClient, reglyphClient, statisticsClient:tokenJournalClient, auditStatisticsClient });
void designCheck.restorePreferences();
void restoreSession();
window.addEventListener('pagehide',()=>void saveSession());

// Retained metadata is retried independently of audits and model requests.
void tokenJournalClient.flush();
void auditStatisticsClient.flush();
window.addEventListener('online',()=>{void auditStatisticsClient.flush();});
window.addEventListener('online',()=>{void tokenJournalClient.flush();});
