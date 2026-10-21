import React from 'react';
import { FindingCard, FindingComparison } from "./FindingCard";
import { documentFindingLibrary, knownLibrary } from "./finding-library";
import type { DocumentAuditState } from "./controller";
import { baseCheck } from "./result-groups";
type Target = { id: string; kind: string; nodeId: string; pageId: string };
type Finding = { findingId: string; status: string; name: string; message: string; componentKey?: string | null; owner: { name: string; pageId: string } | null; occurrences: string[]; targets: Target[]; evidence: unknown };
type Check = { id: string; status: string; findings: Finding[]; gaps: string[]; checked: number; scope: string };
const labels: Record<string,string> = { local: 'Локальные компоненты', freshness: 'Версии библиотечных экземпляров', theme: 'Темизация страницы', font: 'Шрифт страницы', base: 'База', detached: 'Детач', customStyles: 'Кастомные стили и токены' };
export function documentCheckForTab(state: DocumentAuditState, tab: string | null): Check | null {
 if(tab === 'themization')return baseCheck(state.result);
 const id = tab === 'local' ? 'local' : tab === 'current' || tab === 'update' ? 'freshness' : tab === 'themization' ? 'theme' : tab === 'detached' ? 'detached' : tab === 'customStyles' ? 'customStyles' : null;
 return state.result && id ? state.result?.checks.find((c: Check) => c.id === id) || null : null;
}
export function documentItems(check: Check, tab: string | null) {
 return check.findings.filter(f => tab === 'themization' || check.id === 'base' ? !['theme-current','font-current'].includes(f.status) : tab === 'current' ? f.status === 'current' : tab === 'update' ? ['update','unknown'].includes(f.status) : true);
}
function checkSummary(c: Check): string {
 if(c.status==='running')return 'проверяется';
 if(c.id==='detached'||c.id==='customStyles')return `${c.findings.length} найдено`;
 if (c.status === 'not-applicable') return 'не применяется';
 if (c.status === 'incomplete') return 'есть непроверенные данные';
 if (c.id === 'theme') return c.findings.some(f => f.status === 'theme-mismatch') ? 'не выбран Corp' : 'выбран Corp';
 if (c.id === 'font') return c.findings.some(f => f.status === 'font-mismatch') ? 'выбран System (SF)' : 'выбран AlfaSans';
 if (c.id === 'local') return `${c.findings.filter(f => f.status === 'local').length} найдено`;
 const updates = c.findings.filter(f => f.status === 'update').length;
 return updates ? `${updates} с обновлением` : c.findings.length ? 'обновлений не найдено' : 'экземпляров не найдено';
}
export function documentCoverageMessage(check: Check) {
 if(check.status!=='incomplete')return null;
 const gaps=check.gaps.filter(g=>g!=='v3-catalog-policy-not-connected');
 if(!gaps.length&&check.id==='customStyles')return {className:'document-audit-coverage',text:'Проверена связь со стилями и токенами. Дополнительные правила и исключения дизайн-системы пока не проверяются.'};
 if(gaps.some(g=>g.includes('limit')))return {className:'document-audit-warning',text:'Проверка неполная: достигнут лимит этой проверки. Выберите меньшую область и повторите проверку.'};
 if(gaps.some(g=>g.includes('timeout')))return {className:'document-audit-warning',text:'Проверка неполная: часть данных не удалось прочитать вовремя. Повторите проверку.'};
 if(check.id==='customStyles')return {className:'document-audit-warning',text:'Проверка неполная: не удалось подтвердить связь со стилем или токеном у части слоёв. Подробности указаны в их карточках.'};
 return {className:'document-audit-warning',text:'Проверка неполная: часть данных недоступна. Подробности указаны в карточках результатов.'};
}
export function DocumentAuditSummary({state,onSelect,branchBusy=false}: {state:DocumentAuditState;branchBusy?:boolean;onSelect:(id:string)=>void}) {
 if (state.status === 'idle' && !state.error) return null;
 return <section className="document-audit-summary" aria-label="Проверки документа">
  {state.status === 'loading' && <p role="status">Проверяем выбранную область: локальные компоненты, темизацию, стили и происхождение детачей…</p>}
  {state.error && <p role="status">{state.error}</p>}
  {state.result && ['stale','cancelling'].includes(state.status) && <p>Показан снимок предыдущей проверки. Переходы к слоям отключены до нового результата.</p>}
  {state.result && ['available','loading'].includes(state.status) && <><p>{state.status==='loading'||branchBusy ? 'Проверка области продолжается. Уже полученные результаты доступны по категориям.' : 'Проверки документа завершены. Покрытие указано для каждой проверки.'}</p><div className="document-audit-summary-links">
   {state.result.checks.map((c:Check) => <button key={c.id} type="button" onClick={()=>onSelect(c.id === 'freshness' ? 'update' : ['theme','font'].includes(c.id) ? 'themization' : c.id === 'detached' ? 'detached' : c.id === 'customStyles' ? 'customStyles' : 'local')}>
    {labels[c.id]}: {checkSummary(c)}
   </button>)}
  </div></>}
 </section>;
}
export function DocumentAuditCards({check,tab,onFocus,actionsEnabled,mutationEnabled=false,actionData,onAction,staleFindingIds=[],audit}: {check:Check;tab:string|null;actionsEnabled:boolean;mutationEnabled?:boolean;actionData?:any;staleFindingIds?:string[];audit?:any;onAction?:(finding:string,target:string,action:string)=>void;onFocus:(finding:string,target:string)=>void}) {
 const items=documentItems(check,tab),staleFindings=new Set(staleFindingIds),actionsByFinding=new Map<string,any[]>(actionData?.items.map((item:any)=>[item.findingId,item.actions])||[]),coverage=documentCoverageMessage(check);
 return <section className="document-audit-results" aria-label={labels[check.id]}>
  <p className="document-audit-coverage">{check.id === 'base' ? 'Область: текущая страница. Проверяются режим Corp в Theme и AlfaSans в Font, включая автоматический режим шрифта.' : check.id === 'theme' ? 'Область: текущая страница. Проверяется явный режим Corp; замены Corporate-компонентов пока не проверяются.' : check.id === 'font' ? 'Область: текущая страница. Проверяется режим Font, включая режим коллекции по умолчанию.' : check.id === 'freshness' ? 'Область: исходно проверенные слои и зависимости локальных определений. Проверяется опубликованная версия; соответствие правилам дизайн-системы проверяется отдельно.' : check.id==='detached' ? 'Область: проверенные видимые слои. Происхождение из библиотеки подтверждается native detachedInfo; имена и внешний вид не используются.' : check.id==='customStyles' ? 'Область: проверенные видимые слои. Показано отсутствие связи со стилем или переменной; история отвязки и соответствие всей дизайн-системе не утверждаются.' : 'Область: проверенные видимые слои и связанные локальные определения.'}</p>
  {check.status==='running' ? <p role="status">Эта проверка ещё выполняется. Показаны уже полученные находки.</p> : check.status === 'not-applicable' ? <p>Темизация страницы применяется только к Desktop и MobileWeb.</p> : <>
   {coverage && <p role="status" className={coverage.className}>{coverage.text}</p>}
   {check.id==='customStyles'&&actionData?.bindingStatus?.state==='unavailable'&&<p role="status" className="document-audit-warning">{actionData.bindingStatus.message}</p>}
   {!items.length && <p>{check.status === 'incomplete' ? check.id === 'base' ? 'В полученных данных замечаний нет. Часть проверки не завершена.' : 'Нет подтверждённых результатов для этого списка. Это не означает отсутствие проблем.' : check.id === 'base' ? 'В проверенных данных замечаний по базе нет.' : tab === 'current' ? 'В проверенной области не найдено экземпляров с подтверждённой опубликованной версией.' : tab === 'update' ? 'В проверенной области не найдено экземпляров с подтверждённым обновлением.' : check.id === 'theme' ? 'Нет подтверждённого результата темизации страницы.' : check.id==='detached' ? 'В проверенной области не найдено подтверждённых библиотечных детачей.' : check.id==='customStyles' ? 'В проверенной области не найдено подтверждённых непривязанных стилей.' : 'В проверенной области не найдено локальных компонентов.'}</p>}
   <div className="document-audit-list">{items.map(f=>{
    const actions=actionsByFinding.get(f.findingId)||[], stale=staleFindings.has(f.findingId), first=f.targets[0], evidence=f.evidence as any;
    const propertyLabels:Record<string,string>={fill:'Заливка',stroke:'Обводка',effects:'Эффекты',typography:'Типографика'};
    const bindingLibrary = actions.length === 1 ? knownLibrary(actions[0].binding?.library) : null;
    return <FindingCard key={f.findingId} title={f.message}
      tone={['unknown','update','local','detached'].includes(f.status)?'warning':['theme-current','font-current','current'].includes(f.status)?'current':'violation'}
      library={documentFindingLibrary(audit,f)}
      location={first?<button type="button" data-finding-focus disabled={!actionsEnabled||stale} title={f.name} aria-label={`${first.kind==='owner'?'Открыть определение':'Найти в макете'}: ${f.name}`} onClick={()=>onFocus(f.findingId,first.id)}>{f.name}</button>:<span>{f.name}</span>}
      actions={actions.map((a:any)=><button key={a.actionId} type="button" title={a.description} aria-label={`${a.label}: ${a.description}`} disabled={!mutationEnabled||!actionsEnabled||stale} onClick={()=>onAction?.(f.findingId,a.targetId,a.actionId)}>{a.label}</button>)}
      information={<>
        {f.owner&&<p>Определение: {f.owner.name} · экземпляров в области: {f.occurrences.length}</p>}
        {f.targets.map((t,i)=><button key={t.id} type="button" disabled={!actionsEnabled||stale} onClick={()=>onFocus(f.findingId,t.id)}>{t.kind==='owner'?'Открыть определение':i?`Найти объект ${i+1}`:'Найти в макете'}</button>)}
        {actions.map((a:any)=><div key={a.actionId}><p>{a.description}</p>{a.binding&&<p>Ключ: {a.binding.key}</p>}</div>)}
        <pre>{JSON.stringify(f.evidence,null,2)}</pre>
      </>}>
      {f.status==='custom-style'&&<FindingComparison property={propertyLabels[evidence?.property]||'Связь со стилем'} before="Не задана" after={actions.length===1&&actions[0].binding?actions[0].description:undefined} beforeLabel="Сейчас" afterLabel="Рекомендуемая привязка" />}
      {f.status==='custom-style'&&bindingLibrary&&<p className="apollo-finding-note" title={bindingLibrary}>Библиотека привязки: {bindingLibrary}</p>}
      {['theme-current','theme-mismatch'].includes(f.status)&&<FindingComparison property="Theme" before={evidence.actualModeName||'Явно не выбран'} after="Corp" beforeLabel="Сейчас" afterLabel="Требуется" />}
      {['font-current','font-mismatch'].includes(f.status)&&<FindingComparison property="Font" before={evidence.actualModeName||'Не подтверждён'} after="AlfaSans" beforeLabel="Сейчас" afterLabel="Требуется" />}
      {stale&&<p className="apollo-finding-warning" role="status">Предыдущее нарушение сохранено: перепроверка этого объекта не завершена. Его актуальность не подтверждена.</p>}
      {f.status==='unknown'&&<p className="apollo-finding-warning">Нужна повторная проверка.</p>}
      {actionsEnabled&&!stale&&f.status==='custom-style'&&actionData?.bindingStatus?.state==='ready'&&!actionsByFinding.has(f.findingId)&&<p className="apollo-finding-note">{evidence?.property==='effects'?'Для эффектов используются настроенные замены стилей. Для этого нарушения замена не задана.':'Точное совпадение в каталоге не найдено. Подберите библиотечный токен или стиль в Figma.'}</p>}
      {actionsEnabled&&!stale&&f.status==='update'&&!actionsByFinding.has(f.findingId)&&<p className="apollo-finding-warning">Обновление недоступно для этого объекта. Для зависимости локального определения нужна отдельная проверка её исходного экземпляра; для остальных объектов — доступ к опубликованной версии и native операции.</p>}
      {actionsEnabled&&!stale&&f.status==='theme-mismatch'&&!actionsByFinding.has(f.findingId)&&<p className="apollo-finding-warning">Смена режима недоступна: нужна подтверждённая библиотечная коллекция, режим Corp и видимый слой этой страницы.</p>}
    </FindingCard>;
   })}</div>
  </>}
 </section>;
}
