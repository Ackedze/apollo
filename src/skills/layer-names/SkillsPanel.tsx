import React, {useEffect, useId, useRef, useState, useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {Button} from '../../design-check/v3/ui-app/components/Button';
import './ui.css';
const icons = require('./assets');
const analysisStages = ['Чтение области','Подбор названий','Проверка предложений'];
function AnalysisProgress({status,run,progress}: {status:string;run:any;progress:string}) {
  const active = status==='reading' ? 0 : status==='registering' ? 2 : 1;
  const detail = status==='reading-context' ? 'Читаем подробности слоёв для более точных предложений.'
    : status==='reading' ? 'Собираем структуру и текст в выбранной области.'
    : status==='registering' ? 'Сверяем предложения с текущим состоянием макета.'
    : 'Определяем назначение слоёв и подбираем понятные названия.';
  return <div className="apollo-skill-progress">
    <h3>{progress}</h3><p className="apollo-skill-progress-detail">{detail}</p>
    <ol className="apollo-skill-steps" aria-label="Стадии проверки названий">{analysisStages.map((label,index)=><li key={label}
      className={index<active ? 'is-complete' : index===active ? 'is-current' : ''} aria-current={index===active ? 'step' : undefined}>
      <span className="apollo-skill-step-dot" aria-hidden="true"/><span>{label}</span>
    </li>)}</ol>
    {run && <p className="apollo-skill-progress-meta">Изучено подробно слоёв: {run.readCount}
      {run.step>0 && <span>Проход анализа: {run.step}</span>}</p>}
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
  const progress = state.status==='reading' ? 'Читаем выделенные слои…' : state.status==='planning' ? 'Подбираем понятные названия…' : state.status==='reading-context' ? 'Уточняем содержимое слоёв…' : state.status==='registering' ? 'Проверяем актуальность предложений…' : state.status==='undoing' ? 'Возвращаем прежние названия…' : 'Применяем выбранные названия…';
  const hasRun = state.status !== 'idle', preview=state.status==='preview', finished=['done','undone'].includes(state.status);
  const changes = preview ? state.plan.changes : state.result?.changes || [];
  const selected = new Set<string>(state.selected);
  const canStart = state.available && state.validSelection;
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
      <main className={preview || finished ? 'apollo-skill-content' : running ? 'apollo-skill-stage is-running' : 'apollo-skill-stage'} tabIndex={preview || finished ? 0 : undefined} aria-label="Результат навыка «Переназвать слои»" aria-busy={running}>
        {state.status==='idle' && <div className="apollo-skill-invitation">
          <p className="apollo-skill-prompt">Выбери область и запусти проверку</p>
          <p>Предложим понятные названия по содержимому слоёв,<br className="apollo-skill-wide-break" /> а ты выберешь, какие применить</p>
          {!state.available && !running && <p role="status">Дождись завершения другой операции Apollo.</p>}
        </div>}
        {waiting && <AnalysisProgress status={state.status} run={state.run} progress={progress} />}
        {running && !waiting && <div className="apollo-skill-invitation"><p className="apollo-skill-prompt">{progress}</p></div>}
        {state.status==='error' && <div className="apollo-skills-message"><h3>Не удалось проверить названия</h3><p role="alert">{state.error}</p>{state.run && <p className="apollo-skills-hint">До остановки изучено подробно слоёв: {state.run.readCount}.</p>}</div>}
        {state.status==='empty' && <div className="apollo-skills-message"><h3>Названия в порядке</h3><p>В доступных слоях нет уверенных предложений для переименования.</p><p className="apollo-skills-hint">Проверено слоёв: {state.snapshot.observedCount}. Защищённые узлы и закрытые области пропущены.</p></div>}
        {finished && <div className="apollo-skills-message" role="status"><h3>{state.result.complete ? state.status==='undone' ? 'Прежние названия возвращены' : `Переименовано слоёв: ${changes.length}` : 'Переименование завершено частично'}</h3>
          <p>{state.result.complete ? 'Названия перечитаны. Структура, геометрия и текст сохранены.' : 'Часть изменений не удалось применить или проверить. Проверь текущее состояние слоёв и повтори анализ.'}</p></div>}
        {(preview || finished && !!changes.length) && <table className="apollo-rename-table">
          <caption className="design-check-sr-only">Предложения по названиям слоёв. {preview && `Выбрано ${state.selected.length} из ${changes.length}. Необязательные уточнения выключены по умолчанию.`}</caption>
          <colgroup><col/><col/><col/></colgroup>
          <thead><tr><th scope="col">Было</th><th scope="col">Стало</th><th scope="col">Почему</th></tr></thead>
          <tbody>{changes.map((change:any)=><tr key={change.nodeId}>
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
        {state.status==='error' && <Button label="Повторить проверку" disabled={!canStart} onPress={()=>void client.start()} />}
        {state.status==='empty' && <Button label="Новая проверка" disabled={!canStart} onPress={()=>void client.start()} />}
        {preview && <>
          <Button label="Новая проверка" type="secondary" disabled={!canStart} onPress={()=>void client.start()} />
          <Button label="Переименовать" ariaLabel={`Переименовать выбранные слои: ${state.selected.length}`} disabled={!state.selected.length || !state.available} onPress={()=>void client.apply()} />
        </>}
        {finished && <>
          <Button label="Новая проверка" disabled={!canStart} onPress={()=>void client.start()} />
          {state.status==='done' && <Button label="Вернуть прежние названия" type="secondary" disabled={!state.result.verified || !changes.length || !state.available} onPress={()=>void client.undo()} />}
        </>}
      </div></footer>
    </dialog>,document.body)}
  </div>;
}
