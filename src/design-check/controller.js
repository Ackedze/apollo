const { DEFAULT_SETTINGS, PREFERENCE_VERSION, CONTEXT_FIELDS, validSetting } = require("./definitions");
const clone = value => JSON.parse(JSON.stringify(value));
const finalClassifications = new Set(['compliant', 'allowed', 'not-applicable']);

/** Callback port, not a replacement Figma message router or audit engine. */
function createDesignCheckController(options = {}) {
  const definitions = options.tabs || [];
  const sourceOnly = options.preferenceScope === 'agent-source';
  const listeners = new Set(), revisions = {}, settingCapabilities = options.settingCapabilities || {};
  let destroyed = false, sequence = 0, loadSequence = 0, saveQueue = Promise.resolve();
  let activeChat = null, activeAudit = null, proxySequence = 0;
  let state = { settings: clone(DEFAULT_SETTINGS), selectedTab: 'current', view: 'audit', mode: 'check',
    settingsNotice: '', preferenceStatus: 'session-only', preferenceError: '',
    auditReady: false, auditBusy: false, auditProgress: '', auditStale: false, auditError: '', audit: null, contextKey: null,
    documentPageAvailable: false, documentActions:null,documentAction:{busy:false,status:'idle',message:''},
    documentAudit: { status: 'idle', requestId: null, result: null, error: '' },
    tabs: Object.fromEntries(definitions.map(tab => [tab.id, { status: 'not-connected', count: null, items: [] }])),
    chat: { open: false, source: 'codex', busy: false, messages: [], error: '', unreadCount: 0,
      transport: options.dialogue ? 'configured' : 'not-connected', cancelScope: options.dialogue?.cancelScope || null,
      proxy: { available: null, version: null } } };

  function emit(update) {
    if (destroyed) return;
    state = Object.assign({}, state, update);
    for (const listener of listeners) listener();
  }
  function setChat(update) { emit({ chat: Object.assign({}, state.chat, update) }); }
  // Keep platform visibility independent of customization visibility.
  function getVisibleTabs() {
    return definitions.filter(tab => !(state.settings.hideCustomizations && ['changes', 'changesWip'].includes(tab.id))
      && !(tab.id === 'themization' && ['iOS', 'Android'].includes(state.settings.pickerLabel)));
  }
  function selectVisibleTab(settings) {
    const available = definitions.filter(tab => !(settings.hideCustomizations && ['changes', 'changesWip'].includes(tab.id))
      && !(tab.id === 'themization' && ['iOS', 'Android'].includes(settings.pickerLabel)));
    return available.some(tab => tab.id === state.selectedTab) ? state.selectedTab : available[0]?.id || null;
  }
  function getTabItems(id) {
    const items = state.tabs[id]?.items || [];
    return id === 'changes' && settingCapabilities.showExpectedCustomizations === true && !state.settings.showExpectedCustomizations
      ? items.filter(item => item.classification !== 'allowed') : items.slice();
  }
  function preferences() {
    // v3 runtime flags are deliberately session-only. Restored UI is never an accepted audit context.
    const settings = {};
    if (!sourceOnly) for (const key of ['pageTypeId', 'channelId', 'pickerLabel', 'compact', 'showExpectedCustomizations', 'hideCustomizations']) settings[key] = state.settings[key];
    return { schemaVersion: PREFERENCE_VERSION, settings, agentSource: state.chat.source };
  }
  function persist(key) {
    if (sourceOnly && key !== 'agentSource') return Promise.resolve();
    if (!options.preferences?.save) return Promise.resolve();
    const value = preferences();
    emit({ preferenceStatus: 'saving', preferenceError: '' });
    saveQueue = saveQueue.catch(() => {}).then(() => options.preferences.save(value)).then(() => {
      if (JSON.stringify(preferences()) === JSON.stringify(value)) emit({ preferenceStatus: 'saved', preferenceError: '' });
    }).catch(error => emit({ preferenceStatus: 'error', preferenceError: error.message || 'Не удалось сохранить настройки.' }));
    return saveQueue;
  }
  async function restorePreferences() {
    if (!options.preferences?.load) return;
    const ticket = ++loadSequence, observed = Object.assign({}, revisions);
    emit({ preferenceStatus: 'loading', preferenceError: '' });
    try {
      const value = await options.preferences.load();
      if (destroyed || ticket !== loadSequence) return;
      if (value == null) { emit({ preferenceStatus: 'ready' }); return; }
      const keys = sourceOnly ? [] : ['pageTypeId', 'channelId', 'pickerLabel', 'compact', 'showExpectedCustomizations', 'hideCustomizations'];
      if (value.schemaVersion !== PREFERENCE_VERSION || !value.settings || typeof value.settings !== 'object'
        || Object.keys(value.settings).some(key => !keys.includes(key) || !validSetting(key, value.settings[key]))
        || !['langflow', 'codex'].includes(value.agentSource)) throw new TypeError('Сохранённые настройки несовместимы. Тип страницы не подтверждён.');
      const settings = Object.assign({}, state.settings);
      for (const key of keys) if (Object.hasOwn(value.settings, key) && revisions[key] === observed[key]) settings[key] = value.settings[key];
      const canRestoreSource = revisions.agentSource === observed.agentSource && !state.chat.busy && !state.chat.messages.length;
      // The chat uses Proxy's selected CLI; migrate the retired hidden Langflow preference.
      const source = canRestoreSource ? 'codex' : state.chat.source;
      emit({ settings, selectedTab: selectVisibleTab(settings), preferenceStatus: 'ready', preferenceError: '',
        settingsNotice: sourceOnly ? '' : 'Восстановлены настройки интерфейса. Контекст проверки задаётся отдельно.',
        chat: Object.assign({}, state.chat, { source }) });
      if (canRestoreSource && value.agentSource === 'langflow') void persist('agentSource');
    } catch (error) {
      if (!destroyed && ticket === loadSequence) emit({ preferenceStatus: 'error', preferenceError: error.message });
    }
  }
  function updateSetting(key, value) {
    if (!validSetting(key, value) || state.documentAction.busy || state.auditBusy || ['loading','cancelling'].includes(state.documentAudit.status) || destroyed) return false;
    if (['shellAuditEnabled', 'experimentalContractV2Enabled', 'showExpectedCustomizations'].includes(key) && settingCapabilities[key] !== true) return false;
    revisions[key] = (revisions[key] || 0) + 1;
    const settings = Object.assign({}, state.settings); settings[key] = value;
    emit({ settings, selectedTab: selectVisibleTab(settings), settingsNotice: CONTEXT_FIELDS.has(key)
      ? 'Настройка выбрана. Применение в проверке требует подключённого обработчика.' : '' });
    if (options.onSettingChange) {
      const current = revisions[key];
      const reject = error => { if (revisions[key] === current) emit({ settingsNotice: error.message || 'Не удалось применить настройку.' }); };
      try { Promise.resolve(options.onSettingChange(key, value, clone(settings))).catch(reject); } catch (error) { reject(error); }
    }
    void persist(key); return true;
  }
  function selectTab(id) {
    if (!getVisibleTabs().some(tab => tab.id === id)) return false;
    const settings = Object.assign({}, state.settings, { compact: false });
    emit({ selectedTab: id, view: 'audit', settings });
    options.onTabSelect?.(id); return true;
  }
  function setMode(mode) {
    if (destroyed || !['check', 'generation'].includes(mode)) return false;
    emit({ mode, chat: Object.assign({}, state.chat, { open: false }) }); return true;
  }
  function setView(view) {
    if (!['audit', 'report', 'texts'].includes(view)) return false;
    emit({ view }); options.onViewChange?.(view); return true;
  }
  function setAudit(audit) {
    if (!audit?.auditId || !Array.isArray(audit.result?.engine?.evaluations)) throw new TypeError('Expected an existing v4 audit result.');
    activeAudit = null;
    const tabs = clone(state.tabs);
    const items = audit.result.engine.evaluations.filter(entry => !finalClassifications.has(entry.classification) || entry.classification === 'allowed');
    if (tabs.changes) tabs.changes = { status: 'available', count: items.length, items,
      scope: audit.result.coverage?.scope || null, executionComplete: audit.result.coverage?.executionComplete === true };
    emit({ audit, auditBusy: false, auditProgress: '', auditStale: false, auditError: '', tabs });
  }
  function setDocumentPageAvailable(value) {
    if (state.documentPageAvailable !== Boolean(value)) emit({ documentPageAvailable: Boolean(value) });
  }
  function beginContractAudit(requestId) {
    activeAudit = requestId;
    const tabs = Object.assign({}, state.tabs);
    if (tabs.changes) tabs.changes = { status: 'not-connected', count: null, items: [] };
    emit({ audit: null, auditStale: false, tabs, auditBusy: true, auditProgress: '', auditError: '' });
  }
  async function startDocumentAudit() {
    if (!state.documentPageAvailable || state.documentAction.busy || state.auditBusy || ['loading','cancelling'].includes(state.documentAudit.status) || destroyed || !options.onDocumentAudit) return false;
    const requestId = `design-check-audit-${++sequence}`;
    try { await options.onDocumentAudit({ requestId, uiPreferences: clone(state.settings) }); }
    catch (error) { emit({ documentAudit: { status: state.documentAudit.result ? 'stale' : 'error', requestId, result: state.documentAudit.result, error: error.message || 'Не удалось начать проверку документа.' } }); }
    return true;
  }
  function setDocumentAudit(value) {
    emit({ documentAudit: value });
  }
  function setTabData(id, data) {
    if (!Object.hasOwn(state.tabs, id) || !data || !['available', 'not-connected', 'incomplete'].includes(data.status)
      || !Array.isArray(data.items) || data.status !== 'not-connected' && (!data.scope || typeof data.executionComplete !== 'boolean')) throw new TypeError('Tab coverage must be explicit.');
    const tabs = Object.assign({}, state.tabs); tabs[id] = Object.assign({}, data, { count: data.status === 'not-connected' ? null : data.items.length }); emit({ tabs });
  }
  function acceptAuditResult(requestId, audit) {
    if (destroyed || !requestId || activeAudit !== requestId) return false;
    setAudit(audit); return true;
  }
  function acceptAuditError(requestId, message) {
    if (destroyed || !requestId || activeAudit !== requestId) return false;
    activeAudit = null; emit({ auditBusy: false, auditProgress: '', auditError: message }); return true;
  }
  async function startAudit() {
    if (!state.auditReady || state.auditBusy || !options.onAudit) return false;
    const requestId = `design-check-audit-${++sequence}`; beginContractAudit(requestId);
    try {
      const result = await options.onAudit({ requestId, uiPreferences: clone(state.settings) });
      if (!destroyed && activeAudit === requestId && result) setAudit(result);
    } catch (error) {
      acceptAuditError(requestId, error.message);
    }
    return true;
  }
  function invalidateAudit() {
    activeAudit = null;
    emit({ audit: null, auditBusy: false, auditError: '', tabs: Object.fromEntries(definitions.map(tab => [tab.id, { status: 'not-connected', count: null, items: [] }])) });
  }
  function setProxyStatus(proxy) {
    if (destroyed || !proxy || ![true, false, null].includes(proxy.available)) return;
    ++proxySequence;
    setChat({ proxy: { available: proxy.available, version: typeof proxy.version === 'string' ? proxy.version : null } });
  }
  async function refreshProxyStatus() {
    if (!options.dialogue?.status) return;
    const current = ++proxySequence;
    try {
      const proxy = await options.dialogue.status();
      if (!destroyed && current === proxySequence) setProxyStatus(proxy);
    } catch { if (!destroyed && current === proxySequence) setProxyStatus({ available: false, version: null }); }
  }
  function openChat() { setChat({ open: true, unreadCount: 0 }); void refreshProxyStatus(); }
  function closeChat() { setChat({ open: false }); }
  function setAgentSource(source) {
    if (!['langflow', 'codex'].includes(source) || state.chat.busy) return false;
    revisions.agentSource = (revisions.agentSource || 0) + 1;
    // A new source has its own session/history; never relabel an earlier answer.
    if (source !== state.chat.source) options.dialogue?.resetSession?.();
    setChat({ source, messages: source === state.chat.source ? state.chat.messages : [], unreadCount: source === state.chat.source ? state.chat.unreadCount : 0, error: '' }); void persist('agentSource'); return true;
  }
  async function sendChat(question) {
    const text = typeof question === 'string' ? question.trim() : '';
    if (!text || state.chat.busy || !options.dialogue || destroyed) return false;
    if (text.length > 8000) { setChat({ error: 'Вопрос слишком длинный: максимум 8000 символов.' }); return false; }
    // Sending consumes the chosen source even if its reply finishes before preference loading.
    revisions.agentSource = (revisions.agentSource || 0) + 1;
    const requestId = `design-check-chat-${++sequence}`, source = state.chat.source;
    const abort = new AbortController(); activeChat = { requestId, abort, contextKey: state.contextKey };
    const history = state.chat.messages.filter(entry => ['user', 'assistant'].includes(entry.role)).slice(-12)
      .map(entry => ({ role: entry.role, text: entry.text.trim().slice(0, 8000) }));
    setChat({ busy: true, error: '', messages: state.chat.messages.concat({ role: 'user', text, requestId, source }) });
    try {
      const response = await options.dialogue.send({ requestId, source, question: text, dialogue: history,
        context: null, signal: abort.signal });
      if (destroyed || activeChat?.requestId !== requestId || activeChat.contextKey !== state.contextKey) return true;
      if (response?.source !== undefined && response.source !== source) throw new Error('Источник ответа агента не совпал с запросом.');
      if (typeof response?.text !== 'string' || !response.text.trim()) throw new TypeError('Агент вернул пустой ответ.');
      activeChat = null;
      setChat({ busy: false, unreadCount: state.chat.open ? 0 : state.chat.unreadCount + 1, messages: state.chat.messages.concat({ role: 'assistant', text: response.text, requestId, source: response.source || source, returnedSource: response.returnedSource === undefined ? response.source ?? null : response.returnedSource, knowledgeRelease: response.knowledgeRelease ?? null }) });
    } catch (error) {
      if (!destroyed && activeChat?.requestId === requestId) { activeChat = null; setChat({ busy: false, error: error.message || 'Агент недоступен.' }); }
    }
    return true;
  }
  function cancelChat() {
    if (!activeChat) return false;
    const pending = activeChat; activeChat = null; pending.abort.abort();
    setChat({ busy: false, error: 'Ожидание ответа остановлено. Запрос на сервере может продолжаться.' }); return true;
  }
  function setContext(key) {
    if (key === state.contextKey) return;
    if (activeChat) { activeChat.abort.abort(); activeChat = null; }
    options.dialogue?.resetSession?.();
    emit({ contextKey: key, chat: Object.assign({}, state.chat, { busy: false, messages: [], error: '', unreadCount: 0 }) });
  }
  return { getState: () => state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getVisibleTabs, getTabItems, restorePreferences, updateSetting, selectTab, setView, setMode, setAudit, setTabData, setDocumentAudit, setDocumentPageAvailable, beginContractAudit, startDocumentAudit, setDocumentActions:value=>emit({documentActions:value}),setDocumentAction:value=>emit({documentAction:value}),actOnDocumentFinding:(findingId,targetId,actionId)=>options.onDocumentAction?.(findingId,targetId,actionId),hasDocumentAuditPort: () => Boolean(options.onDocumentAudit), focusDocumentFinding: (findingId, targetId) => options.onDocumentFocus?.(findingId, targetId), acceptAuditResult, acceptAuditError,
    setAuditProgress: (requestId,message)=>{if(activeAudit===requestId)emit({auditProgress:message});}, setAuditStale: ()=>emit({auditStale:true}),
    setAuditReady: ready => emit({ auditReady: ready === true && Boolean(options.onAudit) }), startAudit,
    invalidateAudit, openChat, closeChat, setAgentSource, sendChat, cancelChat, setContext, refreshProxyStatus, setProxyStatus,
    flushPreferences: () => saveQueue, getSettingCapabilities: () => settingCapabilities,
    hasAuditPort: () => Boolean(options.onAudit), hasCapturePort: () => Boolean(options.onCaptureExample),
    captureExample: value => options.onCaptureExample?.(value),
    destroy() { destroyed = true; ++loadSequence; activeChat?.abort.abort(); activeChat = null; activeAudit = null; listeners.clear(); } };
}
module.exports = { createDesignCheckController };
