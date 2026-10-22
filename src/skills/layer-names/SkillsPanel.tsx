import React, {useEffect, useId, useRef, useState, useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {Button} from '../../design-check/v3/ui-app/components/Button';
import {AuditMascot} from '../../design-check/AuditMascot';
import './ui.css';
const icons = require('./assets');
const diagnosticPhases:Record<string,string>={preparing:'Подготавливаем запрос…','waiting-agent':'Ожидаем события от агента…',connecting:'Ожидаем ответа сервиса…',retrying:'Агент повторяет подключение…',receiving:'Получаем ответ агента…','reading-context':'Уточняем содержимое слоёв…',validating:'Проверяем предложения…',completed:'Анализ завершён',failed:'Анализ завершился с ошибкой',cancelled:'Анализ остановлен'};
const diagnosticEvents:Record<string,string>={created:'Запуск зарегистрирован','request-prepared':'Запрос подготовлен','thread-started':'Получено thread.started','turn-started':'Получено turn.started',retry:'Повтор подключения','transport-fallback':'Агент сменил транспорт','agent-output':'Получено событие ответа','context-requested':'Запрошены сведения о слоях','context-received':'Сведения о слоях переданы','plan-received':'Получен план',completed:'Анализ завершён',failed:'Ошибка',cancelled:'Остановлено'};
const duration=(ms:number)=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
function SkillDiagnostics({state,waiting}: {state:any;waiting:boolean}){
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{if(!waiting)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[waiting]);
  const d=state.diagnostics,lag=waiting?Math.max(0,now-state.diagnosticsAt):0;
  const elapsed=d?d.elapsedMs+lag:Number.isFinite(state.startedAt) && state.startedAt>0?Math.max(0,now-state.startedAt):0;
  return <section className="apollo-skill-diagnostics" aria-label="Диагностика анализа">
    <p className="apollo-skills-hint">Прошло {duration(elapsed)}{d && waiting && ` · Последнее событие ${duration(d.idleMs+lag)} назад`}</p>
    <details open={state.status==='error'}>
      <summary>Диагностика</summary>
      {!d && <p className="apollo-skills-hint">{state.status==='reading'?'Чтение выполняется в плагине. Агент ещё не запущен.':state.run?'Эта версия Proxy не передала подробную диагностику.':state.batch?'Запуск CLI для этой пачки ещё не подтверждён.':'Ожидаем регистрацию запуска в Proxy. Запуск CLI ещё не подтверждён.'}</p>}
      <dl>
        <dt>Агент</dt><dd>{d?.provider?({codex:'Codex',claude:'Claude',alfagen:'AlfaGen'} as Record<string,string>)[d.provider]:'Не сообщён Proxy'}</dd>
        <dt>Модель запроса</dt><dd>{d?.provider?d.requestedModel || 'По умолчанию CLI':'Не сообщена Proxy'}</dd>
        {state.run && <><dt>Проход</dt><dd>{state.run.step} · подробно изучено слоёв: {state.run.readCount}</dd>
          <dt>Request ID</dt><dd><code>{state.run.requestId}</code></dd><dt>Run ID</dt><dd><code>{state.run.runId}</code></dd></>}
        {d?.cliRunId && <><dt>CLI ID</dt><dd><code>{d.cliRunId}</code></dd></>}
        {d && <><dt>Этап</dt><dd>{diagnosticPhases[d.phase]}</dd></>}
        {d?.errorCode && <><dt>Код ошибки</dt><dd><code>{d.errorCode}</code></dd></>}
      </dl>
      {!!d?.events.length && <ol aria-label="Полученные события">{d.events.map((event:any,index:number)=><li key={index}><time>{duration(event.atMs)}</time> {diagnosticEvents[event.kind]}{event.retry!==null && ` · попытка ${event.retry}`}{event.code && <> · <code>{event.code}</code></>}</li>)}</ol>}
    </details>
  </section>;
}
function AnalysisProgress({progress}: {progress:string}) {
  return <div className="apollo-skill-progress">
    <AuditMascot checking label={progress}/>
    <h3>{progress}</h3>
  </div>;
}
export function SkillsPanel({client}: {client:any}) {
  const state:any = useSyncExternalStore(client.subscribe,client.getState);
  const [detailOpen,setDetailOpen] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null), dialogRef = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(()=>{
    if(!detailOpen)return;
    const dialog=dialogRef.current,opener=cardRef.current;
    if(dialog && !dialog.open)dialog.showModal();
    return ()=>{if(dialog?.open)dialog.close();if(opener?.isConnected)opener.focus();};
  },[detailOpen]);
  const running = ['reading','planning','reading-context','registering','applying','undoing'].includes(state.status);
  const waiting = ['reading','planning','reading-context','registering'].includes(state.status);
  const progress = state.recovering ? 'Проверяем результат переименования…' : state.status==='reading' ? 'Читаем выделенные слои…' : state.status==='planning' ? diagnosticPhases[state.diagnostics?.phase] || (state.run?'Ожидаем ответ агента…':'Передаём запрос в Proxy…') : state.status==='reading-context' ? 'Уточняем содержимое слоёв…' : state.status==='registering' ? 'Проверяем актуальность предложений…' : state.status==='undoing' ? 'Возвращаем прежние названия…' : 'Применяем выбранные названия…';
  const hasRun = state.status !== 'idle', preview=state.status==='preview', finished=['done','undone'].includes(state.status);
  const partial=state.status==='error' && !state.result && state.batch?.completedCount>0 && !!state.plan?.changes.length;
  const changes = preview || partial ? state.plan.changes : state.result?.changes || [];
  const [listPage,setListPage]=useState<{plan:any;result:any;index:number}>({plan:null,result:null,index:0});
  const pageCount=Math.max(1,Math.ceil(changes.length/100));
  const pageIndex=listPage.plan===state.plan && listPage.result===state.result?Math.min(listPage.index,pageCount-1):0;
  const visibleChanges=changes.slice(pageIndex*100,(pageIndex+1)*100);
  const showPage=(index:number)=>setListPage({plan:state.plan,result:state.result,index});
  const selected = new Set<string>(state.selected);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const allSelected = changes.length>0 && changes.every((change:any)=>selected.has(change.nodeId));
  const someSelected = changes.some((change:any)=>selected.has(change.nodeId));
  useEffect(()=>{if(selectAllRef.current)selectAllRef.current.indeterminate=someSelected && !allSelected;},[someSelected,allSelected,preview,detailOpen]);
  const canStart = state.available && state.validSelection && !state.pendingMutation;
  const reasons = new Map<string,string>((state.plan?.changes || []).map((change:any)=>[change.nodeId,change.reason]));
  const cardDescription = !hasRun ? 'Предложит понятные названия по содержимому слоёв, а ты выберешь, какие применить'
    : running ? progress
    : preview ? `Предложений: ${changes.length}. Открыть результат.`
    : state.status==='empty' ? 'Названия в порядке. Открыть результат.'
    : state.status==='error' ? 'Выполнение завершилось с ошибкой. Открыть подробности.'
    : !state.result.complete ? 'Переименование завершено частично. Открыть результат.'
    : state.status==='undone' ? 'Прежние названия возвращены. Открыть результат.'
    : `Переименовано слоёв: ${changes.length}. Открыть результат.`;
  return <div className="apollo-skills">
    <div className="apollo-skills-catalog">
      <button ref={cardRef} className="apollo-skill-card" type="button" aria-label="Переназвать слои" aria-describedby={`${titleId}-description`} aria-haspopup="dialog" onClick={()=>setDetailOpen(true)}>
        <span className="apollo-skill-copy"><strong>Переназвать слои</strong><span id={`${titleId}-description`}>{cardDescription}</span></span>
        <img className="apollo-skill-chevron" src={icons['chevron-right']} alt="" aria-hidden="true" />
      </button>
    </div>
    {detailOpen && createPortal(<dialog ref={dialogRef} className="apollo-skill-dialog" aria-labelledby={titleId} aria-modal="true"
      onCancel={event=>{event.preventDefault();setDetailOpen(false);}}>
      <header className="apollo-skill-header"><h2 id={titleId}>Переназвать слои</h2>
        <button className="apollo-skill-close" type="button" aria-label="Закрыть навык" onClick={()=>setDetailOpen(false)}><img src={icons.close} alt="" /></button>
      </header>
      {running && <p className="design-check-sr-only" role="status">{progress}{state.run && ` Изучено подробно слоёв: ${state.run.readCount}.`}{state.run?.step>0 && ` Проход анализа: ${state.run.step}.`}</p>}
      <main className={preview || finished || partial ? 'apollo-skill-content' : running ? 'apollo-skill-stage is-running' : 'apollo-skill-stage'} tabIndex={preview || finished || partial ? 0 : undefined} aria-label="Результат навыка «Переназвать слои»" aria-busy={running}>
        {state.status==='idle' && <div className="apollo-skill-invitation">
          <p className="apollo-skill-prompt">Выбери область и запусти проверку</p>
          <p>Предложим понятные названия по содержимому слоёв,<br className="apollo-skill-wide-break" /> а ты выберешь, какие применить</p>
          {!state.available && !running && <p role="status">Дождись завершения другой операции Apollo.</p>}
        </div>}
        {running && <div className="apollo-skill-running"><AnalysisProgress progress={progress} />
          {state.batch && <p className="apollo-skills-hint apollo-skill-batch-progress" role="status">{state.batch.status==='capturing'?`Прочитано слоёв: ${state.batch.observedCount}.`:state.batch.batchCount?`Пачка ${Math.min(state.batchIndex || 1,state.batch.batchCount)} из ${state.batch.batchCount}. Готово пачек: ${state.batch.completedCount}.`:'Проверяем актуальность области…'}{state.batchChecked>0 && ` Проверено актуальных слоёв: ${state.batchChecked}.`}</p>}
          {waiting && <SkillDiagnostics state={state} waiting={waiting}/>}</div>}
        {state.status==='error' && <div className="apollo-skills-message"><h3>Не удалось проверить названия</h3><p role="alert">{state.error}</p>
          {state.batch && <p className="apollo-skills-hint">Проверено пачек: {state.batch.completedCount} из {state.batch.batchCount || 'ещё определяется'}. Прочитано слоёв: {state.batch.observedCount}.{state.plan?.changes.length>0 && ` Сохранено предложений: ${state.plan.changes.length}.`} Для продолжения проверим актуальность области.</p>}
          {state.run && <p className="apollo-skills-hint">{state.batch?'В остановленной пачке':'До остановки'} изучено подробно слоёв: {state.run.readCount}.</p>}<SkillDiagnostics state={state} waiting={false}/></div>}
        {state.status==='empty' && <div className="apollo-skills-message"><h3>Названия в порядке</h3><p>В доступных слоях нет уверенных предложений для переименования.</p><p className="apollo-skills-hint">Проверено слоёв: {state.snapshot.observedCount}. Защищённые узлы и закрытые области пропущены.</p></div>}
        {finished && <div className="apollo-skills-message" role="status"><h3>{state.result.complete ? state.status==='undone' ? 'Прежние названия возвращены' : `Переименовано слоёв: ${changes.length}` : 'Переименование завершено частично'}</h3>
          <p>{state.result.complete ? 'Названия перечитаны. Структура, геометрия и текст сохранены.' : 'Часть изменений не удалось применить или проверить. Проверь текущее состояние слоёв и повтори анализ.'}</p></div>}
        {finished && state.error && <p className="apollo-skills-hint" role="alert">{state.error}</p>}
        {partial && <p className="apollo-skills-hint">Предложения проверенных пачек. Применение станет доступно после завершения анализа.</p>}
        {(preview || partial || finished) && pageCount>1 && <nav className="apollo-rename-pagination" aria-label="Страницы предложений">
          <Button label="Назад" type="secondary" disabled={pageIndex===0} onPress={()=>showPage(pageIndex-1)}/>
          <span aria-live="polite">{pageIndex*100+1}–{Math.min((pageIndex+1)*100,changes.length)} из {changes.length}</span>
          <Button label="Далее" type="secondary" disabled={pageIndex===pageCount-1} onPress={()=>showPage(pageIndex+1)}/>
        </nav>}
        {(preview || partial || finished && !!changes.length) && <table className="apollo-rename-table">
          <caption className="design-check-sr-only">Предложения по названиям слоёв. {preview && `Выбрано ${state.selected.length} из ${changes.length}. Необязательные уточнения выключены по умолчанию.`}</caption>
          <colgroup><col/><col/><col/></colgroup>
          <thead><tr><th scope="col"><div className="apollo-rename-before">{preview && <label className="apollo-rename-choice"><input ref={selectAllRef} type="checkbox" aria-label="Выбрать все предложения" checked={allSelected} disabled={!changes.length} onChange={event=>{
            const checked=event.currentTarget.checked;
            if(client.selectAll)client.selectAll(checked);else changes.forEach((change:any)=>{if(selected.has(change.nodeId)!==checked)client.toggle(change.nodeId);});
          }}/></label>}Было</div></th><th scope="col">Стало</th><th scope="col">Почему</th></tr></thead>
          <tbody>{visibleChanges.map((change:any)=><tr key={change.nodeId}>
            <td><div className="apollo-rename-before">{preview && <label className="apollo-rename-choice"><input type="checkbox" checked={selected.has(change.nodeId)} onChange={()=>client.toggle(change.nodeId)} /><span className="design-check-sr-only">Применить: {change.oldName} → {change.newName}</span></label>}
              {preview ? <button type="button" className="apollo-rename-focus" title="Показать слой в Figma" onClick={()=>void client.focus(change.nodeId)}>{change.oldName || 'Без названия'}</button> : <span>{change.oldName || 'Без названия'}</span>}</div></td>
            <td>{change.newName}</td><td>{change.reason || reasons.get(change.nodeId)}{preview && change.category==='optional' && <span className="apollo-rename-optional"> · Необязательно</span>}</td>
          </tr>)}</tbody>
        </table>}
      </main>
      <footer className="apollo-skill-footer" aria-label="Действия навыка"><div className="apollo-skills-actions">
        {waiting && <Button label="Остановить" type="secondary" loading onPress={()=>void client.cancel()} />}
        {running && !waiting && <Button label={progress} disabled loading onPress={()=>{}} />}
        {state.status==='idle' && <Button label="Проверить названия" disabled={!canStart} onPress={()=>void client.start()} />}
        {state.status==='error' && <>
          {state.batch && <Button label="Новая проверка" type="secondary" disabled={!canStart} onPress={()=>void client.start({fresh:true})} />}
          <Button label={state.pendingMutation?'Проверить результат':state.batch?'Продолжить проверку':'Повторить проверку'} disabled={state.pendingMutation?!state.available:!canStart} onPress={()=>void client.start()} />
        </>}
        {state.status==='empty' && <Button label="Новая проверка" disabled={!canStart} onPress={()=>void client.start()} />}
        {preview && <>
          <Button label="Новая проверка" type="secondary" disabled={!canStart} onPress={()=>void client.start()} />
          <Button label="Переименовать" ariaLabel={`Переименовать выбранные слои: ${state.selected.length}`} disabled={!state.selected.length || !state.available} onPress={()=>void client.apply()} />
        </>}
        {finished && <>
          <Button label={state.pendingMutation?'Проверить результат':'Новая проверка'} disabled={state.pendingMutation?!state.available:!canStart} onPress={()=>void client.start()} />
          {(state.status==='done' || state.result.undoAvailable) && <Button label={state.status==='undone'?'Вернуть оставшиеся названия':'Вернуть прежние названия'} type="secondary" disabled={state.pendingMutation || state.undoBlocked || !state.result.verified || !(state.result.undoAvailable || changes.length) || !state.available} onPress={()=>void client.undo()} />}
        </>}
      </div></footer>
    </dialog>,document.body)}
  </div>;
}
