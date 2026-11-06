import React,{useSyncExternalStore,useState,useRef,useEffect,useId} from 'react';
import {createPortal} from 'react-dom';
import {Button} from '../design-check/v3/ui-app/components/Button';
import './ui.css';
const icons=require('../skills/layer-names/assets');
const phases:Record<string,string>={documentation:'Изучаем правила DS AI HUB',figma:'Проверяем свойства слоёв',report:'Подготавливаем итоговый отчёт'};
const labels:Record<string,string>={PASS:'Соответствует',FAIL:'Нарушение',UNKNOWN:'Недостаточно данных',NOT_CHECKED:'Не проверено',NOT_APPLICABLE:'Не применимо'};
const amount=(v:number|null)=>v===null?'нет данных':v.toLocaleString('ru-RU');
function OverrideResults({value,all,setAll,report,state,client}:any){
 const rows=value.checks.filter((c:any)=>all||!['PASS','NOT_APPLICABLE'].includes(c.status));
 return <details open><summary>Покрытие изменений</summary>
  <p>Изменённых полей: {value.inventory.fieldChanges}. Однозначных результатов: {value.coverage.decisive} из {value.coverage.applicable} обязательных пунктов. Не проверено: {value.coverage.counts.NOT_CHECKED}. Недостаточно данных: {value.coverage.counts.UNKNOWN}.</p>
  <p>Перечни изменений прочитаны: {value.inventory.scanned} из {value.inventory.instances} экземпляров. {value.inventory.pendingScans>0?'Сбор перечней ещё не завершён.':''} {value.inventory.unavailableScans>0?'Недоступный перечень не означает отсутствие изменений.':''}</p>
  <p>Изменение само по себе не является нарушением. Допустимость определяют правила DS AI HUB; это покрытие отдельных узлов и полей, а не всех правил.</p>
  {rows.length>0?<div className="apollo-figma-audit-table-scroll" role="region" aria-label="Таблица изменённых полей" tabIndex={0}>
   <table className="apollo-figma-audit-table apollo-figma-audit-lifecycle-table" aria-label="Обязательные проверки изменений">
    <colgroup><col/><col/><col/><col/></colgroup>
    <thead><tr><th scope="col">Результат</th><th scope="col">Слой и поле</th><th scope="col">Оценка</th><th scope="col">Основание</th></tr></thead>
    <tbody>{rows.map((c:any)=><tr key={c.id}>
     <td className="apollo-figma-audit-status">{labels[c.status]}</td>
     <th scope="row">{c.name}<p>{c.field||'Перечень изменений'}</p>{report&&<button className="apollo-figma-audit-layer" type="button" aria-label={`Показать изменённый слой ${c.focusId}`} disabled={state.stale||value.provisional||value.freshness!=='NATIVE_RECHECKED'} onClick={()=>void client.focus(c.focusId)}>Показать слой</button>}</th>
     <td>{c.reason}</td>
     <td><details><summary>Проверки и данные</summary><p className="apollo-figma-audit-path">Экземпляры: {c.ownerIds.join(', ')}</p><p className="apollo-figma-audit-path">Данные о перечне: {c.evidenceIds.join(', ')||'не получены'}</p><p className="apollo-figma-audit-path">Связанные проверки правил: {c.checkIds.join(', ')||'нет'}</p><p>Перечень изменений не заменяет доказательства проверки.</p></details></td>
    </tr>)}</tbody>
   </table>
  </div>:<p>{value.inventory.pendingScans?'Перечни изменений собираются.':value.inventory.unavailableScans?'Часть перечней недоступна.':value.inventory.fieldChanges?'Все полученные оценки допустимы или не применимы. Включите «Все изменения», чтобы увидеть их.':'Переопределения в прочитанных экземплярах не обнаружены.'}</p>}
  <label><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/> Все изменения, включая допустимые</label>
 </details>;
}
function LifecycleResults({catalog,all,setAll,report,state,sourceData,client}:any){
 const catalogLabels:Record<string,string>={ERROR:'Ошибка',WARNING:'Предупреждение',PASS:'Допустимо',UNKNOWN:'Недостаточно данных',NOT_LISTED:'Нет в индексе'};
 const rows=catalog.checks.filter((c:any)=>all||!['PASS','NOT_LISTED'].includes(c.status));
 return <details open><summary>Статусы и самостоятельное использование компонентов</summary>
     <p>Ошибок: {catalog.coverage.counts.ERROR}. Предупреждений: {catalog.coverage.counts.WARNING}. Не удалось определить: {catalog.coverage.counts.UNKNOWN}.</p>
     <p>Однозначных результатов: {catalog.coverage.resolved} из {catalog.coverage.total} индексных проверок для {catalog.coverage.instances} экземпляров. Отсутствие ключа в индексе не означает соответствие всем правилам DS AI HUB.</p>
     <p>{state.stale?'Макет изменился: выводы относятся к сохранённому снимку.':!report?'Предварительные результаты: итоговая проверка актуальности ещё не завершена.':sourceData.historical||report.freshness==='HISTORICAL'?'Сохранённые результаты предыдущей проверки.':'Актуальность прочитанных данных подтверждена.'}</p>
     {rows.length>0?<div className="apollo-figma-audit-table-scroll" role="region" aria-label="Таблица статусов компонентов" tabIndex={0}>
      <table className="apollo-figma-audit-table apollo-figma-audit-lifecycle-table" aria-label="Статусы компонентов">
       <colgroup><col/><col/><col/><col/></colgroup>
       <thead><tr><th scope="col">Результат</th><th scope="col">Компонент</th><th scope="col">Причина</th><th scope="col">Источник</th></tr></thead>
       <tbody>{rows.map((c:any)=><tr key={c.id}>
        <td className="apollo-figma-audit-status">{catalogLabels[c.status]}</td>
        <th scope="row"><span>{c.name||c.targetId}</span><p className="apollo-figma-audit-path">{c.category}</p>{report&&<button type="button" className="apollo-figma-audit-layer" aria-label={`Показать слой ${c.targetId}`} disabled={state.stale} onClick={()=>void client.focus(c.targetId)}>Показать слой</button>}</th>
        <td>{c.reason}</td>
        <td><details><summary>Доказательства</summary><p className="apollo-figma-audit-path">{c.sourceId}</p><p>Записи: {c.recordKeys.join(', ')||'нет'}</p>{c.metadataWarnings.length>0&&<p>Конфликты метаданных: {c.metadataWarnings.map((w:any)=>w.fields.join(', ')).join('; ')}.</p>}</details></td>
       </tr>)}</tbody>
      </table>
     </div>:<p>В индексных результатах нет ошибок, предупреждений или неопределённых выводов. Включите «Все результаты», чтобы посмотреть остальные строки.</p>}
     <label><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/> Все результаты, включая отсутствие в индексах</label>
    </details>;
}
export function FigmaAuditSkill({client}:{client:any}){
 const [open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null),card=useRef<HTMLButtonElement>(null),titleId=useId();
 useEffect(()=>{if(!open)return;const node=dialog.current;if(node&&!node.open)node.showModal();return()=>{node?.close();card.current?.focus({preventScroll:true});};},[open]);
 const state:any=useSyncExternalStore(client.subscribe,client.getState),[all,setAll]=useState(false),report=state.report,busy=client.busy(),preview=!report?state.run?.preview:null;
 const checks=report?.checks||preview?.checks||[],visible=checks.filter((c:any)=>all||c.status!=='PASS'&&c.status!=='NOT_APPLICABLE');
 const progress=state.run?.progress,current=state.activity||progress?.current,measured=report?.usage||state.run?.usage,sourceData=report||state.run,routing=sourceData?.documentRouting;
 const catalog=sourceData?.catalogLifecycle;
 const changed=sourceData?.overrideCoverage;
 const uncheckedChanges=changed&&(changed.inventory.pendingScans>0||changed.coverage.counts.NOT_CHECKED>0),unknownChanges=changed&&changed.coverage.counts.UNKNOWN>0;
 const nodeNames=new Map<string,string>((sourceData?.snapshot?.nodes||[]).map((node:any)=>[node.id,node.name]));
 const unplanned=report?(report.snapshot?.nodes||[]).filter((node:any)=>node.type==='INSTANCE'&&!report.checks.some((check:any)=>check.targets.includes(node.id))):progress?.unplannedInstances||[];
 const download=()=>{const data=report||state.run;if(!data)return;const blob=new Blob([JSON.stringify(Object.assign({},data,{viewState:{provisional:!report,stale:state.stale,clientStatus:state.status,error:state.error}}),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ab-audit-'+data.snapshotId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <>
  <button ref={card} className="apollo-skill-card" type="button" aria-haspopup="dialog" onClick={()=>setOpen(true)}><span className="apollo-skill-copy"><strong>Проверка по DS AI HUB</strong><span>{busy?'Проверка выполняется. Открыть ход проверки.':state.stale?'Макет изменился. Повторите проверку.':report?'Отчёт готов. Открыть результаты.':preview?'Есть предварительные результаты. Открыть проверку.':'Компоненты и паттерны выбранной области'}</span></span><img className="apollo-skill-chevron" src={icons['chevron-right']} alt="" aria-hidden="true"/></button>
  {open&&createPortal(<dialog ref={dialog} className="apollo-skill-dialog" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();setOpen(false);}}>
   <header className="apollo-skill-header"><h2 id={titleId}>Проверка по DS AI HUB</h2><button className="apollo-skill-close" type="button" aria-label="Закрыть проверку по DS AI HUB" onClick={()=>setOpen(false)}><img src={icons.close} alt=""/></button></header>
   <section tabIndex={0} className="apollo-figma-audit apollo-skill-content" aria-label="Результаты проверки по DS AI HUB">
    <p>Компоненты, паттерны и переопределения в выделенной области. Макет остаётся без изменений.</p>
    <div className="apollo-figma-audit-actions"><Button label={sourceData?'Проверить заново':'Проверить область'} onPress={()=>void client.start()} disabled={busy||!state.available||!state.validSelection}/>{busy&&<Button label="Остановить" type="secondary" onPress={()=>void client.cancel()}/>}</div>
    {!state.validSelection&&!busy&&<p>Выделите фрейм или компонент в Figma, чтобы начать проверку.</p>}
    <div className="apollo-figma-audit-progress" role="status" aria-live="polite" aria-atomic="true">
     {busy?<><strong>{current?.label||phases[state.run?.phase]||'Читаем выделенную область'}</strong>{current?.detail&&<p className="apollo-figma-audit-context">{current.detail}</p>}{progress?.planned>0&&<p>Получено выводов: {progress.received} из {progress.planned} запланированных проверок. План может дополняться.</p>}</>:state.status==='done'?<strong>{uncheckedChanges?'Проверка завершена с непроверенными изменениями':unknownChanges?'Проверка завершена с неопределёнными результатами по изменениям':routing?.gaps?.length?'Проверка завершена с пробелами в источниках':'Проверка завершена'}</strong>:preview?<strong>Проверка не завершена. Предварительные результаты сохранены.</strong>:null}
    </div>
    {state.error&&<p role="alert">{state.error.includes('AUDIT_DATA_REQUIRED')?'Для этой проверки нужен обновлённый пакет данных Apollo Proxy. Обновите данные и запустите проверку заново.':state.error.includes('AUDIT_DOCUMENTS_REQUIRED')?'Проверка остановлена: модель не прочитала обязательные фрагменты документов. Промежуточные данные можно скачать ниже.':state.error}</p>}
    {state.stale&&<p role="alert">Макет изменился. Результаты относятся к сохранённому снимку; повторите проверку.</p>}
    {progress?.recent?.length>0&&<details><summary>Ход проверки · последних действий: {progress.recent.length}</summary><ol className="apollo-figma-audit-log">{progress.recent.slice().reverse().map((event:any)=><li key={event.sequence}><strong>{event.label}</strong><p className="apollo-figma-audit-context">{event.detail}</p></li>)}</ol></details>}
    {routing&&<details open={busy||routing.gaps.length>0}><summary>Документы DS AI HUB · прочитано {routing.completed} из {routing.total}</summary>
     <p>Это покрытие выбранных источников. Полноту правил и правильность выводов оно не подтверждает.</p>
     <ul>{routing.requiredSources.map((source:any)=><li key={source.id} className="apollo-figma-audit-path">{source.complete?'Прочитан':'Осталось прочитать'} · {source.id} · {source.readTo} из {source.total} символов</li>)}</ul>
     {routing.gaps.length>0&&<><h3>Пробелы источников: {routing.gaps.length}</h3><ul>{routing.gaps.map((gap:any)=><li key={JSON.stringify(gap)} className="apollo-figma-audit-path">{gap.reason} {gap.subject||gap.nodeId||gap.id||''} · {gap.code}</li>)}</ul></>}
     {routing.candidateSources.length>0&&<details><summary>Дополнительный контекст: {routing.candidateSources.length}</summary><p>Применимость этих документов ещё нужно установить.</p><ul>{routing.candidateSources.map((source:any)=><li key={JSON.stringify(source)} className="apollo-figma-audit-path">{source.id||source.subject} · {source.reason}</li>)}</ul></details>}
    </details>}
    {changed&&<OverrideResults value={changed} all={all} setAll={setAll} report={report} state={state} client={client}/>}
    {catalog&&<LifecycleResults catalog={catalog} all={all} setAll={setAll} report={report} state={state} sourceData={sourceData} client={client}/>}
    {(report||preview)&&<div className="apollo-figma-audit-report" aria-label={report?'Итоговые результаты':'Предварительные результаты'}>
     <h3>{report?'Итоговые результаты':'Предварительные результаты'}</h3>
     {report?<><p>{report.summary}</p><p><strong>Нарушений: {checks.filter((c:any)=>c.status==='FAIL').length}.</strong> Проверено {report.coverage.decisive} из {report.coverage.applicable} применимых проверок{report.coverage.percent===null?'':` (${report.coverage.percent}%)`}.</p></>:<><p>Это выводы модели по прочитанным данным. Итоговая проверка актуальности ещё не завершена.</p>{!busy&&<p>Получено выводов: {preview.received} из {preview.planned} запланированных проверок.</p>}<p>Предварительных нарушений: {checks.filter((c:any)=>c.status==='FAIL').length}. {busy?'Новые результаты появятся здесь по готовности.':'Чтобы завершить проверку, запустите её заново.'}</p></>}
     {report?.scopeReads&&<p>Подробно прочитано слоёв: {report.scopeReads.detailedActualNodes} из {report.scopeReads.inventoryNodes}; экземпляров без чтения identity: {report.scopeReads.unreadInstanceIds.length}.</p>}
     <p>Покрытие относится только к перечисленным проверкам, а не ко всем правилам DS AI HUB. Непроверенные компоненты могут содержать нарушения.</p>
     <dl>{Object.entries((report||preview).coverage.counts).map(([status,count])=><React.Fragment key={status}><dt>{labels[status]}</dt><dd>{String(count)}</dd></React.Fragment>)}</dl>
     <label><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/> Все результаты, включая соответствия</label>
     {!!checks.length&&!visible.length&&<p>В полученных выводах нет нарушений или неопределённых результатов. Включите «Все результаты», чтобы посмотреть соответствия.</p>}
     {visible.length>0&&<div className="apollo-figma-audit-table-scroll" role="region" aria-label="Таблица проверок DS AI HUB" tabIndex={0}>
      <table className="apollo-figma-audit-table" aria-label="Проверки DS AI HUB">
       <colgroup><col/><col/><col/><col/><col/></colgroup>
       <thead><tr><th scope="col">Результат</th><th scope="col">Проверка и слой</th><th scope="col">Факт</th><th scope="col">Требование</th><th scope="col">Исправление</th></tr></thead>
       <tbody>{visible.map((c:any)=><tr key={c.id}>
        <td className="apollo-figma-audit-status">{labels[c.status]}</td>
        <th scope="row"><span>{c.rule}</span>{c.targets.map((id:string)=><p key={id} className="apollo-figma-audit-path">{report?<button type="button" className="apollo-figma-audit-layer" aria-label={`Показать слой ${id}`} title={id} disabled={state.stale} onClick={()=>void client.focus(id)}>{nodeNames.get(id)||'Показать слой'}</button>:nodeNames.get(id)||id}</p>)}</th>
        <td>{c.actual||'Не зафиксирован'}</td>
        <td>{c.expected||'Не зафиксировано'}</td>
        <td>{c.fix&&<p>{c.fix}</p>}<details><summary>Доказательства</summary><p>{c.reason}</p><p className="apollo-figma-audit-path">{c.sourceId}</p>{c.sourceQuote&&<blockquote className="apollo-figma-audit-context">{c.sourceQuote}</blockquote>}</details></td>
       </tr>)}</tbody>
      </table>
     </div>}
    </div>}
    {unplanned.length>0&&<details><summary>Экземпляры без отдельной проверки: {unplanned.length}</summary><p>Внутренние экземпляры могут проверяться правилами родителя. Этот список показывает границы составленного плана.</p><ul>{unplanned.map((node:any)=><li key={node.id} className="apollo-figma-audit-path">{node.name} · {node.id}</li>)}</ul></details>}
    {sourceData&&<details><summary>Навык и использованные файлы</summary><p>{sourceData.skill?.id} · {sourceData.skill?.version}</p><ul>{(sourceData.sources||[]).map((source:any,i:number)=><li className="apollo-figma-audit-path" key={i}>{source.purpose==='routing-metadata-not-norm-read'?'Метаданные маршрута (не норма) · ':source.purpose==='lifecycle-index-not-hub-norm'?'Индекс статуса/роли компонента · ':''}{source.id} · {source.offset}–{source.end} · SHA256 {source.sha256}</li>)}</ul></details>}
    {report&&<details><summary>Ограничения и пробелы</summary><ul>{[...(report.gaps||[]),...(report.excluded||[]),...(report.limitations||[])].map((gap:string,i:number)=><li key={i}>{gap}</li>)}</ul></details>}
    {measured&&<details><summary>Затраты токенов</summary><p>Фактические токены модели по фазам вызовов CLI. Общий контекст включён в каждый вызов. Чтение Figma само по себе токены модели не расходует.</p>{!report&&<p>Расход последнего выполняющегося или прерванного вызова может ещё не входить в этот снимок.</p>}<table><thead><tr><th scope="col">Фаза</th><th scope="col">Вход</th><th scope="col">Выход</th></tr></thead><tbody>{Object.entries(measured.phases).map(([phase,value]:[string,any])=><tr key={phase}><th scope="row">{phases[phase]}</th><td>{amount(value.inputTokens)}</td><td>{amount(value.outputTokens)}</td></tr>)}<tr><th scope="row">Всего</th><td>{amount(measured.total.inputTokens)}</td><td>{amount(measured.total.outputTokens)}</td></tr></tbody></table></details>}
    {sourceData&&<Button label={report?'Скачать полный отчёт JSON':'Скачать промежуточные данные JSON'} type="secondary" onPress={download}/>}
   </section>
  </dialog>,document.body)}
 </>;
}
