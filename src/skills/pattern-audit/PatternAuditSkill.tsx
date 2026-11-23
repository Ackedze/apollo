import React,{useEffect,useId,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {Button} from '../../design-check/v3/ui-app/components/Button';
import {FindingInformation} from '../../design-check/FindingCard';
import {SkillStage} from '../shared/SkillStage';
import {SkillDownloadMenu} from '../shared/SkillDownloadMenu';
import assets from '../shared/assets.json';
import '../../v3-audit/text-review-table.css';
const icons=require('../layer-names/assets');
const tabs=[{id:'errors',label:'Нарушения'},{id:'warnings',label:'Рекомендации'},{id:'unchecked',label:'Не проверено'}];
const {patternGroups}=require('./model');

function PatternTabs({groups,active,id,onSelect}:{groups:any;active:string;id:string;onSelect:(id:string)=>void}){
 return <div className="apollo-text-tabs" role="tablist" aria-label="Результаты проверки паттернов">
  {tabs.map(tab=><button key={tab.id} type="button" role="tab" id={id+'-'+tab.id} aria-controls={id+'-panel'}
   aria-selected={active===tab.id} disabled={!groups[tab.id].length} tabIndex={active===tab.id?0:-1} onClick={()=>onSelect(tab.id)}
   onKeyDown={event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const available=tabs.filter(t=>groups[t.id].length);if(!available.length)return;
    const index=available.findIndex(t=>t.id===active),next=available[event.key==='Home'?0:event.key==='End'?available.length-1:(index+(event.key==='ArrowLeft'?-1:1)+available.length)%available.length];
    onSelect(next.id);document.getElementById(id+'-'+next.id)?.focus();
   }}>{tab.label}{groups[tab.id].length>0&&<> · <span>{groups[tab.id].length}</span></>}</button>)}
 </div>;
}
function PatternFindings({checks,names,canFocus,focus}:{checks:any[];names:Map<string,string>;canFocus:boolean;focus:(id:string)=>void}){
 return <div className="apollo-text-findings" aria-label="Замечания к паттернам">{checks.map(check=>{
  const targets=check.targets||[],label=targets.map((id:string)=>names.get(id)||id).join(', '),failed=check.status==='FAIL',warning=['warning','recommendation','info'].includes(check.severity);
  return <article className="apollo-text-card" key={check.id}>
   <div className="apollo-text-values"><div className="apollo-text-values-copy">
    <div className="apollo-text-current-row">
     <span className="apollo-text-status" aria-hidden="true"><img src={failed&&!warning?assets['status-error']:assets['status-warning']} width={36} height={36} alt=""/></span>
     <span className="apollo-text-layer-focus">{check.actual||check.reason||'Для проверки не хватает данных'}</span>
    </div>
    {failed&&check.fix&&<div className="apollo-text-suggested-row"><img src={assets['arrow-right-desc']} width={16} height={16} alt=""/><span>{check.fix}</span></div>}
   </div></div>
   <div className="apollo-text-divider"/>
   <div className="apollo-text-rule">
    <div className="apollo-text-rule-heading">
     <div className="apollo-text-rule-identity"><span>{check.rule}</span><span aria-hidden="true">·</span><span className="apollo-text-layer-name">{label}</span></div>
     {check.sourceId&&<FindingInformation label="Источник правила" icon={<img src={assets.information} width={16} height={16} alt=""/>}>
      <p className="apollo-rule-identity">{check.sourceId}</p>{check.sourceQuote&&<blockquote>{check.sourceQuote}</blockquote>}
      {check.expected&&<p>Требование: {check.expected}</p>}
     </FindingInformation>}
    </div>
    {failed&&check.reason&&<p>{check.reason}</p>}
    <div>{targets.map((id:string)=><button type="button" key={id} className="apollo-text-layer-focus" data-finding-focus disabled={!canFocus}
     aria-label={'Показать в макете: '+(names.get(id)||id)} onClick={()=>focus(id)}>Показать в макете · {names.get(id)||id}</button>)}</div>
   </div>
  </article>;
 })}</div>;
}
function PatternResults({report,state,groups,hasFindings,id,active,names,message,busy,focus}:{report:any;state:any;groups:any;hasFindings:boolean;id:string;active:string;names:Map<string,string>;message:string;busy:boolean;focus:(id:string)=>void}){
 return <section className="apollo-text-results" id={id+'-panel'} role={hasFindings?'tabpanel':'region'} aria-labelledby={hasFindings?id+'-'+active:id+'-title'} tabIndex={0}>
    {!report&&<p className="design-check-note" role="status">Проверка не завершена. Показаны предварительные результаты.</p>}
    {state.stale&&<p className="design-check-note" role="status">Макет изменился. Повтори проверку перед использованием результата.</p>}
    {message&&<p className="design-check-note" role="alert">{message}</p>}
    {!groups.errors.length&&!groups.warnings.length&&<p className="design-check-note">{groups.unchecked.length?'Подтверждённых нарушений нет. Часть проверок не завершена.':'В выполненных проверках нарушения не найдены.'}</p>}
    <PatternFindings checks={groups[active]} names={names} canFocus={!!report&&!state.stale&&!busy} focus={focus}/>
    <details className="apollo-text-gap"><summary>Покрытие и ограничения</summary>
     <p>Результат относится только к перечисленным правилам выбранной области.</p>
     {report?.coverage&&<p>Проверено {report.coverage.decisive} из {report.coverage.applicable} применимых проверок.</p>}
     <p>Эксперимент использует native-факты и MD из пакета Proxy. Снимки изображения, фактические клики и другие разрешения не проверяются.</p>
     {Array.from(new Set<string>([...(report?.gaps||[]),...(report?.excluded||[])])).map(gap=><p key={gap}>{gap}</p>)}
     {state.run?.knowledgeVersion&&<p>Пакет знаний: {state.run.knowledgeVersion}</p>}
    </details>
   </section>;
}
export function PatternAuditSkill({client,scopeName=''}:{client:any;scopeName?:string}){
 const state:any=useSyncExternalStore(client.subscribe,client.getState);
 const [open,setOpen]=useState(false),[selected,setSelected]=useState('errors'),[inputLoading,setInputLoading]=useState(false),[inputError,setInputError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),card=useRef<HTMLButtonElement>(null),runScope=useRef(''),id=useId();
 const busy=client.busy(),report=state.report,preview=state.run?.preview;
 const checks=report?.checks||preview?.checks||[],groups=patternGroups(checks);
 const active=groups[selected]?.length?selected:tabs.find(t=>groups[t.id].length)?.id||'errors';
 const hasResult=!!report||checks.length>0,showResults=hasResult&&!busy,hasFindings=Object.values(groups).some((rows:any)=>rows.length>0);
 const current=state.activity||state.run?.progress?.current;
 const snapshot=report?.snapshot||state.run?.partial?.snapshot;
 const names=new Map<string,string>((snapshot?.nodes||[]).map((n:any)=>[n.id,n.name]));
 const message=state.error||inputError;
 useEffect(()=>{if(!open)return;const node=dialog.current,opener=card.current;if(node&&!node.open)node.showModal();return()=>{node?.close();opener?.focus({preventScroll:true});};},[open]);
 const start=()=>{runScope.current=scopeName;setInputError('');setSelected('errors');void client.start();};
 const downloadInput=async()=>{setInputLoading(true);setInputError('');try{await client.downloadInput();}catch(error){setInputError(error instanceof Error?error.message:'Не удалось скачать данные агента.');}finally{setInputLoading(false);}};
 return <>
  <button ref={card} className="apollo-skill-card" type="button" aria-labelledby={id+'-card'} aria-describedby={id+'-agent '+id+'-description'}
   aria-haspopup="dialog" onClick={()=>setOpen(true)}>
   <span className="apollo-skill-copy"><span className="apollo-skill-title"><strong id={id+'-card'}>Проверка паттернов</strong><span id={id+'-agent'} className="apollo-skill-agent-label">Агент</span></span>
    <span id={id+'-description'}>{busy?'Проверка выполняется. Открыть ход проверки.':'Проверит применение компонентов и паттернов по документам Альфа-Бизнеса'}</span></span>
   <img className="apollo-skill-chevron" src={icons['chevron-right']} alt=""/>
  </button>
  {open&&createPortal(<dialog ref={dialog} className="apollo-skill-dialog apollo-text-tool apollo-new" aria-labelledby={id+'-title'}
   onCancel={event=>{if(event.target!==event.currentTarget)return;event.preventDefault();setOpen(false);}}>
   <header className={'apollo-skill-header apollo-text-header'+(showResults&&hasFindings?' has-tabs':'')}>
    <h2 id={id+'-title'}>Проверка паттернов</h2><button className="apollo-skill-close" type="button" aria-label="Закрыть проверку паттернов" onClick={()=>setOpen(false)}><img src={icons.close} alt=""/></button>
    {showResults&&hasFindings&&<PatternTabs groups={groups} active={active} id={id} onSelect={setSelected}/>}
   </header>
   {busy&&<p className="design-check-sr-only" role="status">{current?.label||'Проверяем паттерны…'}</p>}
   {showResults?<PatternResults report={report} state={state} groups={groups} hasFindings={hasFindings} id={id} active={active} names={names} message={message} busy={busy} focus={node=>void client.focus(node)}/>:<div className="apollo-text-stage" aria-busy={busy}>
    <SkillStage idle={!busy} message={busy?current?.label||'Проверяем паттерны…':<>Проверю применение компонентов<br/>и паттернов Альфа-Бизнеса</>}
     description={<p className="apollo-skill-scope-name" title={(busy?runScope.current:scopeName)||undefined} role="status">{(busy?runScope.current:scopeName)||(busy?'Выбранная область':'Выбери область и запусти проверку')}</p>} announce={!busy}/>
    {message&&(!busy||state.status==='stop-error')&&<p className="apollo-text-stage-message" role="alert">{message}</p>}
   </div>}
   <footer className="apollo-skill-footer" aria-label="Действия проверки паттернов"><div className="apollo-skills-actions">
    {busy?<Button label={state.status==='stopping'?'Останавливаем':'Остановить'} type="secondary" loading disabled={state.status==='stopping'} onPress={()=>void client.cancel()}/>
     :<Button label={hasResult?'Новая проверка':state.error?'Повторить проверку':'Запустить проверку'} type={hasResult?'secondary':'primary'} disabled={!state.validSelection||!state.available} onPress={start}/>}
   </div></footer>
   <SkillDownloadMenu canReport={!!state.run||!!report} canInput={(state.run?.step||0)>0} inputLoading={inputLoading}
    filesLabel="Файлы проверки паттернов" onReport={()=>client.downloadReport()} onInput={()=>void downloadInput()}/>
  </dialog>,document.body)}
 </>;
}
