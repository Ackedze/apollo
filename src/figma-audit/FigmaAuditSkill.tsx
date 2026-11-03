import React,{useSyncExternalStore,useState,useRef,useEffect,useId} from 'react';
import {createPortal} from 'react-dom';
import {Button} from '../design-check/v3/ui-app/components/Button';
import './ui.css';
const icons=require('../skills/layer-names/assets');
const phases:Record<string,string>={documentation:'Читаем DSI Hub',figma:'Проверяем свойства слоёв',report:'Формируем отчёт'};
const labels:Record<string,string>={PASS:'Соответствует',FAIL:'Нарушение',UNKNOWN:'Недостаточно данных',NOT_CHECKED:'Не проверено',NOT_APPLICABLE:'Не применимо'};
const amount=(v:number|null)=>v===null?'нет данных':v.toLocaleString('ru-RU');
export function FigmaAuditSkill({client}:{client:any}){
 const [open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null),card=useRef<HTMLButtonElement>(null),titleId=useId();
 useEffect(()=>{if(!open)return;const node=dialog.current;if(node&&!node.open)node.showModal();return()=>{node?.close();card.current?.focus({preventScroll:true});};},[open]);
 const state:any=useSyncExternalStore(client.subscribe,client.getState),[all,setAll]=useState(false),report=state.report,busy=client.busy(),checks=report?.checks||[];
 const measured=report?.usage||state.run?.usage;
 const download=()=>{const data=report||state.run;if(!data)return;const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ab-audit-'+data.snapshotId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <>
  <button ref={card} className="apollo-skill-card" type="button" aria-haspopup="dialog" onClick={()=>setOpen(true)}><span className="apollo-skill-copy"><strong>Проверка по DSI Hub</strong><span>{busy?'Проверка выполняется. Открыть ход проверки.':state.stale?'Макет изменился. Повторите проверку.':report?'Отчёт готов. Открыть результаты.':'Компоненты и паттерны выбранной области'}</span></span><img className="apollo-skill-chevron" src={icons['chevron-right']} alt="" aria-hidden="true"/></button>
  {open&&createPortal(<dialog ref={dialog} className="apollo-skill-dialog" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();setOpen(false);}}>
  <header className="apollo-skill-header"><h2 id={titleId}>Проверка по DSI Hub</h2><button className="apollo-skill-close" type="button" aria-label="Закрыть проверку по DSI Hub" onClick={()=>setOpen(false)}><img src={icons.close} alt=""/></button></header>
  <section tabIndex={0} className="apollo-figma-audit apollo-skill-content" aria-label="Результаты проверки по DSI Hub">
  <p>Компоненты, паттерны и переопределения в выделенной области. Макет остаётся без изменений.</p>
  <div className="apollo-figma-audit-actions"><Button label="Проверить область" onPress={()=>void client.start()} disabled={busy||!state.available||!state.validSelection}/>{busy&&<Button label="Остановить" type="secondary" onPress={()=>void client.cancel()}/>}</div>
  <p role="status" aria-live="polite">{busy?`${phases[state.run?.phase]||'Читаем область'}${state.run?.step?' · шаг '+state.run.step:''}`:state.status==='done'?'Проверка завершена':''}</p>
  {state.error&&<p role="alert">{state.error}</p>}
  {state.stale&&<p role="alert">Макет изменился. Отчёт относится к сохранённому снимку; повторите проверку.</p>}
  {!report&&state.run&&state.status==='error'&&<><details><summary>Файлы частичной проверки</summary><ul>{state.run.sources.map((s:any,i:number)=><li className="apollo-figma-audit-path" key={i}>{s.id} · {s.offset}–{s.end} · SHA256 {s.sha256}</li>)}</ul></details><Button label="Скачать данные незавершённой проверки" type="secondary" onPress={download}/></>}
  {measured&&<>   <details><summary>Затраты токенов</summary><p>Фактический usage CLI по фазам. Общий контекст включён в каждую фазу. Чтение Figma само по себе токены модели не расходует.</p><table><thead><tr><th>Фаза</th><th>Вход</th><th>Выход</th></tr></thead><tbody>{Object.entries(measured.phases).map(([phase,v]:[string,any])=><tr key={phase}><th>{phases[phase]}</th><td>{amount(v.inputTokens)}</td><td>{amount(v.outputTokens)}</td></tr>)}<tr><th>Всего</th><td>{amount(measured.total.inputTokens)}</td><td>{amount(measured.total.outputTokens)}</td></tr></tbody></table></details></>}
  {report&&<div className="apollo-figma-audit-report">
   <p>{report.summary}</p><p><strong>Нарушений: {checks.filter((c:any)=>c.status==='FAIL').length}.</strong> Проверено {report.coverage.decisive} из {report.coverage.applicable} применимых правил{report.coverage.percent===null?'':` (${report.coverage.percent}%)`}.</p>
   {report.scopeReads&&<p>Подробно прочитано слоёв: {report.scopeReads.detailedActualNodes} из {report.scopeReads.inventoryNodes}; экземпляров без чтения identity: {report.scopeReads.unreadInstanceIds.length}.</p>}
   <p>Покрытие относится к перечисленным правилам, а не ко всем знаниям DSI Hub.</p>
   <dl>{Object.entries(report.coverage.counts).map(([s,n])=><React.Fragment key={s}><dt>{labels[s]}</dt><dd>{String(n)}</dd></React.Fragment>)}</dl>
   <label><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/> Все результаты</label>
   {checks.filter((c:any)=>all||c.status!=='PASS'&&c.status!=='NOT_APPLICABLE').map((c:any)=><details key={c.id}><summary>{labels[c.status]} · {c.rule}</summary><p>{c.reason}</p>{c.actual&&<p>Факт: {c.actual}</p>}{c.expected&&<p>Ожидание: {c.expected}</p>}{c.fix&&<p>Исправление: {c.fix}</p>}<p className="apollo-figma-audit-path">{c.sourceId}</p><blockquote>{c.sourceQuote}</blockquote>{c.targets.map((id:string)=><button type="button" key={id} disabled={state.stale} onClick={()=>void client.focus(id)}>Показать слой {id}</button>)}</details>)}

   <details><summary>Навык и использованные файлы</summary><p>{report.skill.id} · {report.skill.version}</p><ul>{report.sources.map((s:any,i:number)=><li key={i} className="apollo-figma-audit-path">{s.id} · {s.offset}–{s.end} · SHA256 {s.sha256}</li>)}</ul></details>
   <details><summary>Ограничения и пробелы</summary><ul>{[...(report.gaps||[]),...(report.excluded||[]),...(report.limitations||[])].map((s:string,i:number)=><li key={i}>{s}</li>)}</ul></details>
   <Button label="Скачать полный отчёт JSON" type="secondary" onPress={download}/>
  </div>}
 </section></dialog>,document.body)}
 </>;
}
