import { DocumentAuditCards, documentCheckForTab } from "./DocumentAudit";
import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { TopSection } from "./v3/ui-app/components/TopSection";
import { tabDefinitions } from "./v3/config/tabs";
import { createDesignCheckController } from "./controller";
import { createExistingDialoguePort } from "./dialogue-port";
import { MarkdownMessage } from "./MarkdownMessage";
import "./v3/shell.css";
import "./integration.css";
import "./new-shell.css";
import { AuditOverview } from "./AuditOverview";
import { buildResultGroups } from "./result-groups";
import assets from "./assets";
import {SkillsPanel} from "../skills/layer-names/SkillsPanel";
const skillIcons = require("../skills/layer-names/assets");

type Controller = ReturnType<typeof createDesignCheckController>;
type DataOptions = { skillsClient?: any; readContractData?: () => Promise<import('./ContractDataModal').ContractData> };
type Slots = { setup?: HTMLElement; audit?: HTMLElement; auditDiagnostics?: HTMLElement; generation?: HTMLElement; patterns?: HTMLElement; texts?: HTMLElement };

/** Existing v4 nodes keep their identities, listeners, report/export and generation controls. */
function ExistingSlot({ node, expand = false }: { node?: HTMLElement; expand?: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!node || !holder.current) return;
    const originalParent = node.parentNode, nextSibling = node.nextSibling;
    holder.current.appendChild(node);
    if (expand && node instanceof HTMLDetailsElement) node.open = true;
    return () => {
      if (originalParent) originalParent.insertBefore(node, nextSibling?.parentNode === originalParent ? nextSibling : null);
      else node.remove();
    };
  }, [node, expand]);
  return <div ref={holder} className="design-check-slot" />;
}

function Chat({ controller, restoreFocus }: { controller: Controller; restoreFocus: React.RefObject<HTMLButtonElement | null> }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState), chat = state.chat;
  const panel = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  useLayoutEffect(() => {
    if (!chat.open || !input.current) return;
    input.current.style.height = 'auto';
    input.current.style.height = Math.max(48, Math.min(144, input.current.scrollHeight)) + 'px';
  }, [chat.open, draft]);
  useEffect(() => {
    if (!chat.open) return;
    (input.current?.disabled ? panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)') : input.current)?.focus();
    function leaveChat(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const visibleDialog = Array.from(document.querySelectorAll('[role="dialog"]')).some(dialog =>
        dialog.getClientRects().length > 0 && getComputedStyle(dialog).visibility !== 'hidden');
      if (visibleDialog) return;
      event.preventDefault(); controller.closeChat(); restoreFocus.current?.focus();
    }
    document.addEventListener('keydown', leaveChat);
    return () => document.removeEventListener('keydown', leaveChat);
  }, [chat.open, controller, restoreFocus]);
  useEffect(() => { if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight; }, [chat.messages, chat.busy, chat.error]);
  const connected = chat.transport === 'configured';
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (chat.busy) { controller.cancelChat(); return; }
    if (!draft.trim() || draft.length > 8000 || !connected) return;
    void controller.sendChat(draft); setDraft('');
  }
  if (!chat.open) return null;
  return <section id="apollo-chat-screen" className="design-check-chat-screen" role="region" aria-label="Чат с Apollo">
    <div className="agent-chat-panel" ref={panel}>
      <div className="design-check-chat-header">
        <div className="design-check-chat-controls" role="group" aria-label="Параметры чата">
          <span className={`agent-proxy-version${chat.proxy.available !== true ? ' unavailable' : ''}`}>
            {chat.proxy.available === null ? 'Подключение не проверено' : chat.proxy.available ? `Proxy${chat.proxy.version ? ' v' + chat.proxy.version : ' подключён'}` : 'Proxy недоступен'}
          </span>

        </div>
      </div>
      <section className="agent-conversation" ref={conversation} aria-label="История диалога" aria-live="polite">
        <div className="agent-conversation-inner">
          {!chat.messages.length && <div className="design-check-chat-empty">
            <h2>Чат с Apollo</h2><p>{connected ? 'Задайте вопрос о компонентах и паттернах.' : 'Чат ещё не подключён к плагину.'}</p>
            <p className="design-check-muted">Вопрос по базе знаний. Снимок макета и результат проверки сюда не передаются.</p>
          </div>}
          {chat.messages.map((message, index) => <article key={`${message.requestId}-${message.role}-${index}`} className={`message-card ${message.role}`}>
            {message.role === 'user' ? <div className="user-msg"><div className="user-msg__stack"><div className="user-msg__line"><div className="user-msg__container"><MarkdownMessage text={message.text} /></div></div></div></div>
              : <div className="assistant-msg"><div className="assistant-msg__container"><div className="assistant-copy"><MarkdownMessage text={message.text} /></div><p className="design-check-provenance">Источник запроса: {message.source === 'codex' ? 'Codex' : 'Langflow'} · источник ответа: {message.returnedSource == null ? 'не возвращён' : message.returnedSource === 'codex' ? 'Codex' : 'Langflow'} · база знаний: {message.knowledgeRelease == null ? 'версия не возвращена' : typeof message.knowledgeRelease === 'string' ? message.knowledgeRelease : JSON.stringify(message.knowledgeRelease)}. Ответ не меняет результат проверки по контракту.</p></div></div>}
          </article>)}
          {chat.busy && <div className="assistant-actions loading" role="status"><span className="spinner" aria-hidden="true" /><span>Apollo думает</span></div>}
          {chat.error && <p className="design-check-error" role="alert">{chat.error}</p>}
        </div>
      </section>
      <form className="agent-composer" onSubmit={submit}>
        <div className="apollo-message-field">
        <textarea className="agent-composer-input" ref={input} rows={1} aria-label="Вопрос Apollo" placeholder="Задайте вопрос" disabled={!connected || chat.busy}
          value={draft} maxLength={8000} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        <button className={`agent-input-addon${chat.busy ? ' is-stop' : ''}`} type="submit" disabled={!connected || (!chat.busy && !draft.trim())}
          aria-label={chat.busy ? 'Остановить ожидание ответа' : 'Отправить вопрос'} title={chat.busy ? 'Остановить ожидание. Серверный запрос может продолжаться.' : 'Отправить вопрос'}>
          {chat.busy ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            : <img src={assets.sendCircle} alt="" />}
        </button>
        </div>
      </form>
    </div>
  </section>;
}


function DesignCheckShell({ controller, slots, dataOptions }: { controller: Controller; slots: Slots; dataOptions: DataOptions }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState), settings = state.settings;
  const launcher = useRef<HTMLButtonElement>(null);
  const activeScreen = state.chat.open ? 'chat' : state.mode === 'skills' ? 'skills' : state.mode === 'generation' ? 'generation' : state.view === 'texts' ? 'texts' : 'check';
  const documentAction = state.documentPageAvailable && controller.hasDocumentAuditPort();
  const actionBusy = state.documentAction.busy || state.auditBusy || ['loading','cancelling'].includes(state.documentAudit.status);
  const [settingsHost, setSettingsHost] = useState<HTMLDivElement | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [scope, setScope] = useState('');
  const [checkedScope, setCheckedScope] = useState('');
  const pendingScope = useRef<{ name: string; audit: unknown; native: unknown } | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  function selectedScopeName() {
    const name = document.getElementById('selection')?.textContent?.trim() || '';
    return name === 'Выделите область или слои с компонентами' ? '' : name;
  }
  useEffect(() => {
    const selection = document.getElementById('selection');
    if (!selection) return;
    const updateScope = () => {
      setScope(selectedScopeName());
    };
    updateScope();
    const observer = new MutationObserver(updateScope);
    observer.observe(selection, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [controller]);
  useEffect(() => { void controller.refreshProxyStatus(); }, [controller]);
  useEffect(() => {
    const pending = pendingScope.current;
    if (!pending) return;
    if ((state.audit && state.audit !== pending.audit && !state.auditStale) || (state.documentAudit.status === 'available' && state.documentAudit.result && state.documentAudit.result !== pending.native)) {
      setCheckedScope(pending.name); pendingScope.current = null;
    } else if (state.auditError || ['stale', 'error'].includes(state.documentAudit.status) && state.documentAudit.error) {
      pendingScope.current = null;
    }
  }, [state.audit, state.auditStale, state.auditError, state.documentAudit.status, state.documentAudit.result, state.documentAudit.error]);
  const capabilities = controller.getSettingCapabilities();
  const summary = buildResultGroups(state, controller.getVisibleTabs(), controller.getTabItems);
  const selectedGroup = summary.groups.find((group: any) => group.id === groupId);
  const categories = groupId === 'base' ? summary.theme ? [summary.theme] : [] : selectedGroup?.categories || [];
  const primaryIds = new Set(['changes','deprecated','update','detached','local','customStyles','deprecatedStyles','detachedStyles','localStyles','themization']);
  const primaryCategories = groupId === 'base' ? [] : categories.filter((category: any) => primaryIds.has(category.id));
  const activeCategoryId = categoryId && categories.some((category: any) => category.id === categoryId) ? categoryId : state.selectedTab;
  const nativeCheck = documentCheckForTab(state.documentAudit, activeCategoryId);
  const activeTab = tabDefinitions.find(tab => tab.id === activeCategoryId), data = state.tabs[activeCategoryId || ''];
  const apply = (key: keyof typeof settings, value: unknown) => controller.updateSetting(key, value);
  function openGroup(group: any) {
    setGroupId(group.id); setCategoryId(null);
    if (group.id === 'patterns') { controller.setView('report'); return; }
    const first = group.categories.find((category: any) => category.count > 0) || group.categories.find((category: any) => category.connected) || group.categories[0];
    if (first) controller.selectTab(first.id);
  }
  function showDesign() { controller.setMode('check'); controller.setView('audit'); setGroupId(null); setCategoryId(null); }
  function categoryButtons(list: any[]) {
    return list.map(category => <button key={category.id} type="button" aria-pressed={activeCategoryId === category.id}
      onClick={() => { setCategoryId(category.id); controller.setView('audit'); controller.selectTab(category.id); }}>{category.title}{category.count > 0 ? ` · ${category.count}` : ''}</button>);
  }
  const proxyError = state.auditError.startsWith('ApolloProxyControl:') ? state.auditError : '';
  const contextChanged = /^(Страница изменилась\.|Настройки или исходные данные изменились\.|Результат проверки документа устарел\.)/.test(state.documentAudit.error);
  const notices = <div className="apollo-status-messages">
    {state.auditError && !proxyError && <p className="design-check-error" role="alert">{state.auditError}</p>}
    {state.documentAudit.error && !contextChanged && <p className="design-check-error" role="alert">{state.documentAudit.error}</p>}
    {groupId && state.auditBusy && <p className="design-check-note" role="status">{state.auditProgress || 'Проверка контрактов выбранной области продолжается…'}</p>}
    {groupId && summary.stale && <p className="design-check-note" role="status">{state.documentAction.status === 'refreshing' ? 'Перепроверяем изменённый объект. До свежего результата сохраняем прежние замечания.' : 'Показан предыдущий результат. Повторите проверку.'}</p>}
    {state.documentAction.message && <p className="design-check-note" role={state.documentAction.status === 'error' ? 'alert' : 'status'}>{state.documentAction.message}</p>}
  </div>;
  return <div className="shell design-check-shell apollo-new">
    <header className="apollo-topbar">
      <img className="apollo-logo" src={assets.logo} alt="Apollo" />
      <nav className="apollo-navigation" aria-label="Разделы Apollo">
        <button type="button" aria-label="Проверка" title="Дизайн" aria-pressed={activeScreen === 'check'} onClick={showDesign}>
          <span className="apollo-nav-icon" aria-hidden="true" style={{maskImage: `url(${assets.design})`, WebkitMaskImage: `url(${assets.design})`}} /><span className="apollo-nav-label" aria-hidden="true">Дизайн</span>
        </button>
        <button type="button" aria-label="Тексты" title="Тексты" aria-pressed={activeScreen === 'texts'}
          onClick={() => { controller.setMode('check'); controller.setView('texts'); }}><span className="apollo-nav-icon" aria-hidden="true" style={{maskImage: `url(${assets.texts})`, WebkitMaskImage: `url(${assets.texts})`}} /><span className="apollo-nav-label" aria-hidden="true">Тексты</span></button>
        <button type="button" aria-label="Генерация" title="Генерация" aria-pressed={activeScreen === 'generation'}
          onClick={() => controller.setMode('generation')}><span className="apollo-nav-icon" aria-hidden="true" style={{maskImage: `url(${assets.generation})`, WebkitMaskImage: `url(${assets.generation})`}} /><span className="apollo-nav-label" aria-hidden="true">Генерация</span></button>
        <button ref={launcher} type="button" className="apollo-chat-launcher" aria-label="Открыть чат с Apollo" title="Спросить Apollo" aria-pressed={state.chat.open} aria-controls="apollo-chat-screen"
          onClick={() => controller.openChat()}><span className="apollo-nav-icon" aria-hidden="true" style={{maskImage: `url(${assets.chat})`, WebkitMaskImage: `url(${assets.chat})`}} /><span className="apollo-nav-label" aria-hidden="true">Спросить</span>
          {state.chat.unreadCount > 0 && <span className="design-check-chat-unread" role="status" aria-label={`Непрочитанных ответов: ${state.chat.unreadCount}`}>{state.chat.unreadCount > 9 ? '9+' : state.chat.unreadCount}</span>}
        </button>
        <button type="button" aria-label="Навыки" title="Навыки" aria-pressed={activeScreen === 'skills'} onClick={() => controller.setMode('skills')}><span className="apollo-skill-nav-icon" aria-hidden="true"><span className="apollo-nav-icon" style={{maskImage:`url(${skillIcons['magic-wand']})`,WebkitMaskImage:`url(${skillIcons['magic-wand']})`}} /></span><span className="apollo-nav-label" aria-hidden="true">Навыки</span></button>
      </nav>
      <div ref={setSettingsHost} className="apollo-settings-host" />
    </header>
    <div className="design-check-background">
      <div className="design-check-content">
        <h1 className="design-check-sr-only">Apollo</h1>
        <section className="design-check-check-screen" hidden={activeScreen !== 'check'} aria-label="Проверка макета">
          <div className={`apollo-contextbar${!groupId ? ' is-overview' : ''}`} hidden={!groupId && !scope}>
            {!groupId ? <span className="apollo-scope" title={scope}>{scope}</span> : <>
              <button className="apollo-back" type="button" onClick={() => { setGroupId(null); setCategoryId(null); controller.setView('audit'); }} aria-label="Вернуться к обзору проверки">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m10 5-7 7 7 7M3 12h18" /></svg>
                {groupId === 'base' ? 'База' : selectedGroup?.title}
              </button>
              <nav className="apollo-categories" aria-label="Категории проверки">{categoryButtons(primaryCategories)}</nav>
            </>}
          </div>
          {!groupId ? <>
            {notices}
            <AuditOverview state={state} summary={summary} busy={actionBusy} checkedScope={checkedScope} onOpen={openGroup}
              onBase={() => { setGroupId('base'); setCategoryId(null); controller.setView('audit'); controller.selectTab('themization'); }} />
          </> : <main className="apollo-results" aria-label="Результаты проверки">
            {notices}
            {state.view === 'audit' && <>
              <h2 className="design-check-sr-only">{groupId === 'base' ? 'База' : activeTab?.title || 'Результаты'}</h2>
              {!nativeCheck && (!data || data.status === 'not-connected') && <p className="placeholder">Проверка этой категории ещё не подключена.</p>}
              <div hidden={activeCategoryId !== 'changes'}><ExistingSlot node={slots.audit} /></div>
              {nativeCheck && <DocumentAuditCards check={nativeCheck} actionsEnabled={state.documentAudit.status === 'available' && !state.documentAction.busy}
                audit={state.auditStale ? null : state.audit}
                actionData={state.documentActions} staleFindingIds={state.documentAudit.staleFindingIds} mutationEnabled={!actionBusy}
                onAction={(findingId,targetId,actionId) => controller.actOnDocumentFinding(findingId,targetId,actionId)} tab={activeCategoryId}
                onFocus={(findingId,targetId) => controller.focusDocumentFinding(findingId,targetId)} />}
              {!slots.audit && data?.status !== 'not-connected' && controller.getTabItems(activeCategoryId).map((entry, index) =>
                <article className="design-check-preview-finding" key={entry.evaluationId || index}><strong>{entry.ruleId}</strong><p>{entry.classification}</p></article>)}
            </>}
            <section hidden={state.view !== 'report'} aria-label="Паттерны">
              <ExistingSlot node={slots.patterns} />{!slots.patterns && <p className="placeholder">Проверка паттернов ещё не подключена. Draft-правила не считаются проверенными.</p>}
            </section>
          </main>}
          <details className="apollo-sources" hidden={!groupId || activeScreen !== 'check'}><summary>Источники проверки</summary><ExistingSlot node={slots.auditDiagnostics} /><ExistingSlot node={slots.setup} /></details>

        </section>
        <section className="design-check-view-pane apollo-skills-screen" hidden={activeScreen !== 'skills'} aria-label="Навыки">{dataOptions.skillsClient && <SkillsPanel client={dataOptions.skillsClient} />}</section>
        <section className="design-check-view-pane" hidden={activeScreen !== 'texts'} aria-label="Тексты">
          <ExistingSlot node={slots.texts} />{!slots.texts && <p className="placeholder">Проверка текстов ещё не подключена.</p>}
        </section>
        <section className="design-check-generation-screen" hidden={activeScreen !== 'generation'} aria-label="Генерация интерфейса">
          <div className="design-check-generation"><ExistingSlot node={slots.generation} expand />
            {!slots.generation && <p className="placeholder">Генерация недоступна в этом режиме просмотра.</p>}
          </div>
        </section>
          <footer className={`apollo-audit-footer${activeScreen === 'texts' ? ' apollo-texts-footer' : ''}`} aria-label="Запуск проверки" hidden={activeScreen !== 'check' && activeScreen !== 'texts'}>          <TopSection title="Apollo" settingsHost={settingsHost} readContractData={dataOptions.readContractData} proxy={state.chat.proxy} proxyError={proxyError} settingsMessage={state.preferenceError || state.settingsNotice} onProxyRefresh={controller.refreshProxyStatus} auditControlsVisible={activeScreen === 'check' || activeScreen === 'texts'} overlayScope={`${state.mode}:${state.chat.open}`} pageTypeId={settings.pageTypeId} channelId={settings.channelId} pickerLabel={settings.pickerLabel}
            actionLabel={activeScreen === 'texts' ? 'Проверить' : state.documentAction.status==='refreshing' ? 'Перепроверяем' : state.documentAction.busy ? 'Выполняем' : actionBusy ? 'Проверяем' : 'Проверить'} actionDisabled={activeScreen === 'texts' || !state.auditReady || actionBusy}
            actionLoading={activeScreen === 'check' && actionBusy} actionType={activeScreen === 'check' && actionBusy ? 'secondary' : 'primary'} compact={false}
            shellAuditEnabled={settings.shellAuditEnabled} showExpectedCustomizations={settings.showExpectedCustomizations}
            hideCustomizations={settings.hideCustomizations} experimentalContractV2Enabled={settings.experimentalContractV2Enabled}
            controlAvailability={{ pageTypeId: true, channelId: true, pickerLabel: true, compact: false,
              showExpectedCustomizations: capabilities.showExpectedCustomizations === true, hideCustomizations: true, shellAuditEnabled: capabilities.shellAuditEnabled === true,
              experimentalContractV2Enabled: capabilities.experimentalContractV2Enabled === true, captureExample: controller.hasCapturePort() }}
            onActionPress={() => { if (activeScreen !== 'check') return; setCheckedScope(''); pendingScope.current = { name: selectedScopeName(), audit: state.audit, native: state.documentAudit.result }; void (documentAction ? controller.startDocumentAudit() : controller.startAudit()); }} onToggleCompact={() => apply('compact', !settings.compact)}
            onPageTypeChange={value => apply('pageTypeId', value)} onChannelChange={value => apply('channelId', value)}
            onPickerChange={value => apply('pickerLabel', value)} onShellAuditToggle={() => apply('shellAuditEnabled', !settings.shellAuditEnabled)}
            onShowExpectedToggle={() => apply('showExpectedCustomizations', !settings.showExpectedCustomizations)}
            onHideCustomizationsToggle={() => apply('hideCustomizations', !settings.hideCustomizations)}
            onExperimentalContractV2Toggle={() => apply('experimentalContractV2Enabled', !settings.experimentalContractV2Enabled)}
            onExampleCapture={controller.captureExample} /></footer>
        <Chat controller={controller} restoreFocus={launcher} />
      </div>
    </div>
  </div>;
}

export function mountDesignCheck(container: HTMLElement, controller: Controller, slots: Slots = {}, dataOptions: DataOptions = {}) {
  const root = createRoot(container);
  flushSync(() => root.render(<DesignCheckShell controller={controller} slots={slots} dataOptions={dataOptions} />));
  return { unmount: () => { flushSync(() => root.unmount()); } };
}
export { createDesignCheckController, createExistingDialoguePort, tabDefinitions };
