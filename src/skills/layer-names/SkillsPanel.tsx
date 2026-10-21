import React, {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {Button} from '../../design-check/v3/ui-app/components/Button';
import './ui.css';
const icons = require('./assets');
export function SkillsPanel({client}: {client:any}) {
  const state:any = useSyncExternalStore(client.subscribe,client.getState);
  const [detailOpen,setDetailOpen] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null), backRef = useRef<HTMLButtonElement>(null);
  const previousDetail = useRef(detailOpen);
  useEffect(()=>{
    if(previousDetail.current === detailOpen)return;
    previousDetail.current = detailOpen;
    (detailOpen ? backRef : cardRef).current?.focus();
  },[detailOpen]);
  const running = ['reading','planning','reading-context','registering','applying','undoing'].includes(state.status);
  const waiting = ['reading','planning','reading-context','registering'].includes(state.status);
  const progress = state.status==='reading' ? 'Читаем выделенные слои…' : state.status==='planning' ? 'Подбираем понятные названия…' : state.status==='reading-context' ? 'Уточняем содержимое слоёв…' : state.status==='registering' ? 'Проверяем актуальность предложений…' : state.status==='undoing' ? 'Возвращаем прежние названия…' : 'Применяем выбранные названия…';
  function saveReport() {
    const blob = new Blob([JSON.stringify({snapshot:state.snapshot,run:state.run,plan:state.plan,result:state.result},null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'apollo-layer-names.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const hasRun = state.status !== 'idle';
  const changes = state.status === 'preview' ? state.plan.changes : state.result?.changes || [];
  const canStart = state.available && state.validSelection;
  const cardDescription = !hasRun ? 'Предложит понятные названия по содержимому слоёв. Ты выберешь, какие применить.'
    : running ? progress
    : state.status==='preview' ? `Предложений: ${changes.length}. Открыть результат.`
    : state.status==='empty' ? 'Названия в порядке. Открыть результат.'
    : state.status==='error' ? 'Выполнение завершилось с ошибкой. Открыть подробности.'
    : !state.result.complete ? 'Переименование завершено частично. Открыть результат.'
    : state.status==='undone' ? 'Прежние названия возвращены. Открыть результат.'
    : `Переименовано слоёв: ${changes.length}. Открыть результат.`;
  return <div className="apollo-skills">
    {!detailOpen ? <div className="apollo-skills-catalog">
      <button ref={cardRef} className="apollo-skill-card" type="button" aria-label="Переназвать слои" disabled={!hasRun && !canStart} onClick={()=>{setDetailOpen(true);if(!hasRun)void client.start();}}>
        <span className="apollo-skill-copy"><strong>Переназвать слои</strong><span>{cardDescription}</span></span>
        <span className="apollo-skill-play" aria-hidden="true"><img src={icons.play} alt="" /></span>
      </button>
      {!hasRun && !state.validSelection && <p className="apollo-skills-hint">Выдели фрейм или слои в Figma, чтобы запустить навык.</p>}
      {!hasRun && !state.available && <p className="apollo-skills-hint" role="status">Дождись завершения другой операции Apollo.</p>}
    </div> : <>
      <div className="apollo-contextbar">
        <button ref={backRef} className="apollo-back" type="button" aria-label="Вернуться к навыкам" onClick={()=>setDetailOpen(false)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18"/></svg>
          Переназвать слои
        </button>
        {state.snapshot && <span className="apollo-scope apollo-skills-scope" title={state.snapshot.scopeName}>{state.snapshot.scopeName}</span>}
      </div>
      <main className="apollo-results apollo-skills-results" aria-label="Результат навыка «Переназвать слои»">
      <h2 className="design-check-sr-only">Переназвать слои</h2>
      {running && <div className="apollo-skills-loading" aria-live="polite" aria-busy="true">
        <p role="status">{progress}</p>
        {state.run && <p className="apollo-skills-hint">Изучено подробно слоёв: {state.run.readCount}. Можно вернуться к навыкам — анализ продолжится.</p>}
        <div className="apollo-skills-skeleton" aria-hidden="true"><span/><span/><span/></div>
      </div>}
      {state.status==='idle' && <p className="apollo-skills-hint">Выдели фрейм или слои в Figma для нового анализа.</p>}
      {state.status==='error' && <div className="apollo-skills-message"><p role="alert">{state.error}</p>{state.run && <p className="apollo-skills-hint">До остановки изучено подробно слоёв: {state.run.readCount}.</p>}</div>}
      {state.status==='empty' && <div className="apollo-skills-message"><h3>Названия в порядке</h3><p>В доступных слоях нет уверенных предложений для переименования.</p><p className="apollo-skills-hint">Проверено слоёв: {state.snapshot.observedCount}. Защищённые узлы и закрытые области пропущены.</p></div>}
      {state.status==='preview' && <>
        <p className="apollo-skills-hint">Выбери изменения для применения. Необязательные уточнения выключены.</p>
        <ul className="apollo-rename-list">{changes.map((change:any) => <li key={change.nodeId}>
          <label className="apollo-rename-choice"><input type="checkbox" checked={state.selected.includes(change.nodeId)} onChange={()=>client.toggle(change.nodeId)} /><span className="design-check-sr-only">Применить: {change.oldName} → {change.newName}</span></label>
          <div className="apollo-rename-content"><div className="apollo-rename-names"><button type="button" className="apollo-rename-focus" title="Показать слой в Figma" onClick={()=>void client.focus(change.nodeId)}>{change.oldName || 'Без названия'}</button><span aria-hidden="true">→</span><strong>{change.newName}</strong></div>
            <p>{change.reason}{change.category==='optional' && <span className="apollo-rename-optional"> · Необязательно</span>}</p></div>
        </li>)}</ul>
        <p className="apollo-skills-hint">Пропущено защищённых слоёв: {state.snapshot.skippedCount}. Если макет изменится, предложения потребуется обновить.</p>
      </>}
      {['done','undone'].includes(state.status) && <>
        <div className="apollo-skills-message" role="status"><h3>{state.result.complete ? state.status==='undone' ? 'Прежние названия возвращены' : `Переименовано слоёв: ${changes.length}` : 'Переименование завершено частично'}</h3>
          <p>{state.result.complete ? 'Названия перечитаны. Структура, геометрия и текст сохранены.' : 'Часть изменений не удалось применить или проверить. Сохрани отчёт и повтори анализ текущего макета.'}</p></div>
        {!!changes.length && <ul className="apollo-rename-list apollo-rename-applied">{changes.map((change:any)=><li key={change.nodeId}><div className="apollo-rename-names"><span>{change.oldName || 'Без названия'}</span><span aria-hidden="true">→</span><strong>{change.newName}</strong></div></li>)}</ul>}
      </>}
      </main>
      <footer className="apollo-audit-footer apollo-skills-footer" aria-label="Действия навыка"><div className="apollo-skills-actions">
        {waiting && <Button label="Остановить ожидание" title="Остановить ожидание. Запрос к агенту может продолжаться." type="secondary" onPress={()=>{client.cancel();setDetailOpen(false);}} />}
        {running && !waiting && <Button label={progress} disabled loading onPress={()=>{}} />}
        {state.status==='idle' && <Button label="Начать анализ" disabled={!canStart} onPress={()=>void client.start()} />}
        {state.status==='error' && <Button label="Повторить анализ" disabled={!canStart} onPress={()=>void client.start()} />}
        {state.status==='empty' && <Button label="Проверить другое выделение" disabled={!canStart} onPress={()=>void client.start()} />}
        {state.status==='preview' && <>
          <p>Выбрано: {state.selected.length} из {changes.length}</p>
          <Button label="Новый анализ" type="secondary" disabled={!canStart} onPress={()=>void client.start()} />
          <Button label={`Применить выбранные · ${state.selected.length}`} disabled={!state.selected.length || !state.available} onPress={()=>void client.apply()} />
        </>}
        {['done','undone'].includes(state.status) && <>
          <Button label="Новый анализ" disabled={!canStart} onPress={()=>void client.start()} />
          {state.status==='done' && <Button label="Вернуть прежние названия" type="secondary" disabled={!state.result.verified || !changes.length || !state.available} onPress={()=>void client.undo()} />}
          <Button label="Сохранить отчёт" type="secondary" onPress={saveReport} />
        </>}
      </div></footer>
    </>}
  </div>;
}
