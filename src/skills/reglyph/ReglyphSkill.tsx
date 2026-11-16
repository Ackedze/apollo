import React, {createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {AuditMascot} from '../../design-check/AuditMascot';
import './ui.css';
const catalogIcons = require('../layer-names/assets');
const icons = require('./assets');
const {rowIdentity} = require('./catalog');
const {keepWords} = require('./typography');
const {motion,reveal} = require('./motion');

const ExitContext=createContext({closing:false,finish:()=>{}});
function Presence({children}:{children:React.ReactNode}) {
  const last=useRef<React.ReactNode>(null),[retained,setRetained]=useState(false);
  if(children)last.current=children;
  useLayoutEffect(()=>{if(children)setRetained(true);},[Boolean(children)]);
  if(!children && !retained)return null;
  return <ExitContext.Provider value={{closing:!children,finish:()=>{last.current=null;setRetained(false);}}}>{children || last.current}</ExitContext.Provider>;
}
function ResultRows({children,elementRef,changeToken}:{children:React.ReactNode;elementRef:React.RefObject<HTMLDivElement|null>;changeToken:any}) {
  const {closing,finish}=useContext(ExitContext);
  useLayoutEffect(()=>{
    const element=elementRef.current;if(!element)return;
    if(closing)motion(element,[{opacity:1},{opacity:0}],180,finish);else reveal(element);
  },[closing,changeToken]);
  return <div ref={elementRef} inert={closing}>{children}</div>;
}

function Button({label,type='primary',disabled=false,onPress}:{label:string;type?:'primary'|'secondary';disabled?:boolean;onPress:()=>void}) {
  return <button type="button" className={`apollo-reglyph-pill${type==='primary'?' is-primary':''}`} aria-label={label} disabled={disabled} onClick={onPress}>{keepWords(label)}</button>;
}
function Dialog({title,onClose,children,className='',workspace=false}:{title:string;onClose:()=>void;children:React.ReactNode;className?:string;workspace?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null),titleId=useId();
  const {closing,finish}=useContext(ExitContext),fade=className.includes('apollo-reglyph-image-dialog');
  useLayoutEffect(()=>{const opener=document.activeElement as HTMLElement|null,dialog=ref.current;dialog?.showModal();if(!workspace)dialog?.focus({preventScroll:true});return()=>{dialog?.close();if(opener?.isConnected)opener.focus();};},[]);
  useLayoutEffect(()=>{
    const dialog=ref.current;if(!dialog)return;
    dialog.inert=closing;
    motion(dialog,closing?(fade?[{opacity:1},{opacity:0}]:[{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(8px) scale(.98)'}]):(fade?[{opacity:0},{opacity:1}]:[{opacity:0,transform:'translateY(12px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}]),closing?160:220,closing?finish:undefined);
  },[closing]);
  return createPortal(<dialog ref={ref} tabIndex={-1} data-closing={closing} className={`apollo-skill-dialog apollo-reglyph-dialog ${workspace?'apollo-reglyph-workspace':'apollo-reglyph-modal'} ${className}`} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();if(!closing)onClose();}}>
    <header className="apollo-skill-header"><h2 id={titleId}>{keepWords(title)}</h2><button type="button" className="apollo-skill-close" aria-label={`Закрыть: ${title}`} onClick={onClose}><img src={icons.close} alt=""/></button></header>
    {children}
  </dialog>,document.body);
}
function Assistant({state,finishing=false}:{state:any;finishing?:boolean}) {
  const bubble=useRef<HTMLDivElement>(null);
  const status=state.status,result=status==='done'?state.result:null,preview=status==='preview';
  const mood=!state.supported?'error':state.errorCode==='SELECTION_CHANGED'?'neutral':status==='error' || result?.failed?'error':preview || result?.skipped?'warning':result?'success':'neutral';
  const quality=({neutral:'unchecked',success:'clean',warning:'warning',error:'violation'} as const)[mood];
  const checking=['scanning','replacing'].includes(status) || finishing;
  const title=!state.supported?'Выбери iOS или Android':state.errorCode==='SELECTION_CHANGED'?(finishing?'Выделение изменилось':'Проверим новый макет'):state.errorCode==='OUTDATED'?'Проверим ещё раз':state.errorCode==='NO_SELECTION'?'Сначала выбери макет':state.errorOperation==='replace' && status==='error'?'Не удалось обновить иконки':status==='scanning'?'Ищу иконки…':status==='replacing'?'Обновляю иконки…':status==='error'?'Не получилось завершить':result?.failed?'Не удалось обновить иконки':result?.skipped?'Почти готово':result?'Готово! Иконки обновлены':preview?(state.rows.length || state.observedRows.length?'Иконки найдены':'Здесь иконок не нашлось'):'Давай обновим иконки';
  const text=!state.supported?'Навык работает с правилами АБМ. Для Desktop и MobileWeb правила пока не подключены.':state.errorCode==='SELECTION_CHANGED'?(finishing?'Дожидаюсь завершения текущей операции. Затем можно проверить новый макет.':'Выделение изменилось. Запусти проверку ещё раз.'):state.errorCode==='OUTDATED'?'Выдели нужный макет и начни новую проверку.':state.errorCode==='NO_SELECTION'?'Выдели макет в Figma и нажми «Проверить».':state.errorOperation==='replace' && status==='error'?'Попробуй ещё раз или вернись к замене.':status==='error'?'Попробуй ещё раз. Если не поможет — перезапусти плагин.':result?.failed?'Попробуй ещё раз или вернись к замене.':result?.skipped?`Без замены: ${result.skipped}. Рекомендую вернуться к замене`:result?'Выбери другой макет, чтобы начать новую проверку.':preview?(state.rows.length || state.observedRows.length?'Проверь список и при необходимости выбери замену.':'Выдели другую область и попробуй ещё раз.'):['scanning','replacing'].includes(status)?'':'Выдели макет в Figma и нажми «Проверить».';
  useLayoutEffect(()=>{
    if(bubble.current)reveal(bubble.current);
  },[status,state.supported]);
  return <section className={`apollo-reglyph-assistant${state.supported?'':' is-platform-required'}`} data-mood={mood} aria-label="Помощник"><div className="apollo-reglyph-bubble" ref={bubble} role="status" aria-live="polite"><h3>{checking?<>{title.replace(/…$/,'')}<span className="apollo-reglyph-loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></>:title}</h3><p>{text}</p><img className="apollo-reglyph-bubble-tail" src={icons['bubble-tail']} alt=""/></div><div className="apollo-reglyph-mascot"><AuditMascot checking={checking} quality={quality} label={title}/></div></section>;
}
function Tile({item,fallback,onOpen,name,onError}:{item:any;fallback?:string;onOpen:()=>void;name:string;onError?:()=>void}) {
  return <button type="button" className={`apollo-reglyph-tile${item?.image && item.monochrome?' is-monochrome':''}`} style={item?.image?{'--reglyph-image':`url("${item.image}")`} as React.CSSProperties:undefined} aria-label={`Превью: ${name}`} onClick={onOpen}>
    {item?.image?<img src={item.image} alt="" onError={onError}/>:<span aria-hidden="true">{fallback || '…'}</span>}
  </button>;
}
function PreviewTile({icon,state,client,onOpen}:{icon:any;state:any;client:any;onOpen:(value:any)=>void}) {
  const ref=useRef<HTMLDivElement>(null),key=icon?.key;
  const {closing}=useContext(ExitContext);
  useEffect(()=>{
    if(!key || !ref.current || closing)return;
    let release:(()=>void)|undefined;
    const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){if(!release)release=client.watchPreview(key);}else{release?.();release=undefined;}}},{root:ref.current.closest('main'),rootMargin:'100px'});
    observer.observe(ref.current);return()=>{observer.disconnect();release?.();};
  },[key,client,closing,state.previewGeneration]);
  if(!icon)return <div className="apollo-reglyph-tile" aria-hidden="true">—</div>;
  const image=state.images.get(key),item=state.scenario==='services' && image?Object.assign({},image,{monochrome:false}):image;
  return <div ref={ref}><Tile item={item} fallback={state.previewErrors.has(key)?'—':'…'} name={icon.baseName || icon.name} onError={()=>client.previewFailed(key)} onOpen={()=>onOpen({key,name:icon.baseName || icon.name,library:icon.library || (state.scenario==='services'?'Logo-corp':'Glyph 26'),image:item?.image,monochrome:item?.monochrome})}/></div>;
}
function Picker({row,state,client,onClose,onPreview}:{row:any;state:any;client:any;onClose:()=>void;onPreview:(value:any)=>void}) {
  const [query,setQuery]=useState(''),[limit,setLimit]=useState(60);
  const search=useRef<HTMLInputElement>(null),options=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{if(options.current)options.current.scrollTop=0;},[query]);
  const selected=state.catalog.newIcons.find((icon:any)=>icon.key===row.newKey),service=state.scenario==='services';
  const groups=useMemo(()=>client.options(row,query),[query,row,state.catalog,client]);
  const count=groups.reduce((sum:number,group:any)=>sum+group.items.length,0);
  let offset=0;
  return <Dialog title={`Выбери иконку из ${service?'Logo-corp':'Glyph 26'}`} onClose={onClose} className="apollo-reglyph-picker">
    <div className="apollo-reglyph-search"><img src={icons.search} alt=""/><input ref={search} type="search" value={query} placeholder="Поиск по названию" aria-label="Поиск иконок" onChange={event=>{setQuery(event.target.value);setLimit(60);}}/>{query && <button type="button" aria-label="Очистить поиск" onClick={()=>{setQuery('');setLimit(60);search.current?.focus();}}><img src={icons['search-clear']} alt=""/></button>}</div>
    <main ref={options} className="apollo-skill-content apollo-reglyph-options" onScroll={event=>{const node=event.currentTarget;if(node.scrollTop+node.clientHeight>=node.scrollHeight-200)setLimit(previous=>Math.min(previous+60,count));}}>
      {groups.map((group:any)=>{
        const shown=group.items.slice(0,Math.max(0,limit-offset));offset+=group.items.length;if(!shown.length)return null;
        return <section key={group.id}>{group.name && <h3>{group.name} <span className="apollo-reglyph-count">{group.items.length}</span></h3>}
          {shown.map((icon:any)=>{
            const checked=icon.key===row.newKey || (!service && icon.familyId && selected?.familyId===icon.familyId);
            return <div key={icon.key} className={`apollo-reglyph-option${checked?' is-selected':''}`}>
              <PreviewTile icon={icon} state={state} client={client} onOpen={onPreview}/>
              <button type="button" aria-pressed={Boolean(checked)} onClick={()=>{client.choose(rowIdentity(row),icon.key);onClose();}}><span>{icon.baseName || icon.name}</span>{checked && <span className="apollo-reglyph-option-check" aria-hidden="true">✓</span>}</button>
            </div>;
          })}
        </section>;
      })}
      {!count && <p className="apollo-skills-hint">Ничего не найдено</p>}
      {offset>limit && <Button type="secondary" label="Показать ещё" onPress={()=>setLimit(previous=>previous+60)}/>}
    </main>
    <footer className="apollo-skill-footer"><div className="apollo-skills-actions"><Button label="Пропустить" type="secondary" onPress={()=>{client.skip(rowIdentity(row));onClose();}}/></div></footer>
  </Dialog>;
}
export function ReglyphSkill({client}:{client:any}) {
  const state:any=useSyncExternalStore(client.subscribe,client.getState);
  const [open,setOpen]=useState(false),[picker,setPicker]=useState<any>(null),[confirm,setConfirm]=useState(false),[large,setLarge]=useState<any>(null);
  const previewToken=useRef(0);
  const content=useRef<HTMLElement>(null),groups=useRef<HTMLDivElement>(null),previousStatus=useRef(state.status),scroll=useRef(0),previewScroll=useRef(0);
  useLayoutEffect(()=>{
    if(!open)return;
    const main=content.current;if(!main)return;
    const previous=previousStatus.current;
    if(previous!==state.status){
      if(previous==='preview' && state.status==='replacing')previewScroll.current=scroll.current;
      if(state.status==='preview' && ['done','error'].includes(previous))main.scrollTop=previewScroll.current;
      else if(['idle','scanning','replacing','done'].includes(state.status))main.scrollTop=0;
    }
    scroll.current=main.scrollTop;previousStatus.current=state.status;
  },[open,state.status,state.rows,state.observedRows]);
  const running=['scanning','replacing'].includes(state.status),busy=running || client.busy(),finishing=busy && state.errorCode==='SELECTION_CHANGED';
  useEffect(()=>{
    if(!open || !state.supported)return;
    const undo=(event:KeyboardEvent)=>{
      if(event.defaultPrevented || event.repeat || event.isComposing || event.shiftKey || event.altKey || !(event.metaKey || event.ctrlKey) || !(event.code==='KeyZ' || event.key.toLowerCase()==='z'))return;
      const target=event.target instanceof HTMLElement?event.target:document.activeElement;
      if(target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select')))return;
      const dialogs=document.querySelectorAll('dialog[open]');
      if(!dialogs[dialogs.length-1]?.classList.contains('apollo-reglyph-dialog'))return;
      event.preventDefault();
      if(!busy && state.available){setPicker(null);setLarge(null);client.closePreview();setConfirm(false);client.undo();}
    };
    document.addEventListener('keydown',undo);
    return()=>document.removeEventListener('keydown',undo);
  },[open,state.supported,state.available,busy,client]);
  useEffect(()=>{if(state.status!=='preview' || state.planStale){setPicker(null);setConfirm(false);}if(!state.supported || state.planStale || ['idle','scanning'].includes(state.status)){setLarge(null);client.closePreview();}},[state.status,state.supported,state.context,state.planStale]);
  const targetMap=useMemo(()=>new Map((state.catalog?.newIcons || []).map((icon:any)=>[icon.key,icon])),[state.catalog]);
  const {replacementCount,missingCount,sections}=useMemo(()=>{
    let replacementCount=0,missingCount=0;
    for(const row of state.rows)if(row.newKey)replacementCount+=row.ids.length;else missingCount+=row.ids.length;
    const sections=[
      {id:'unused',title:'Не используются в АБМ',description:'Из сторонних библиотек или устаревшие',rows:state.rows.filter((row:any)=>row.reviewGroup==='unused')},
      {id:'unknown',title:'Этих иконок нет в библиотеках',description:'Выбери замену вручную',rows:state.rows.filter((row:any)=>row.reviewGroup==='unknown')},
      {id:'native',title:'Оставляем как есть',description:'Нативные иконки и иконки, закреплённые в компонентах',readonly:true,rows:state.observedRows.filter((row:any)=>row.category!=='logo')},
      {id:'logo',title:'Логотипы',description:'Не меняй на Glyph 26',readonly:true,rows:state.observedRows.filter((row:any)=>row.category==='logo')},
      {id:'unresolved',title:`Этих иконок нет в ${state.scenario==='services'?'Logo-corp':'Glyph 26'}`,description:'Пропусти или выбери другую',rows:state.rows.filter((row:any)=>row.reviewGroup==='unresolved')},
      {id:'ambiguous',title:'Нужно выбрать соответствие',description:'Этим иконкам могут соответствовать несколько вариантов',rows:state.rows.filter((row:any)=>row.reviewGroup==='ambiguous')},
      {id:'ready',title:'Готовы к замене',description:'',rows:state.rows.filter((row:any)=>row.reviewGroup==='ready')},
    ].filter(group=>group.rows.length);
    return {replacementCount,missingCount,sections};
  },[state.rows,state.observedRows,state.scenario]);
  const result=state.result;
  const openPreview=(descriptor:any)=>{const token=String(++previewToken.current);setLarge(Object.assign({},descriptor,{token}));client.largePreview(descriptor,token);};
  const replacementFailure=(state.status==='done' && result?.failed>0) || (state.status==='error' && state.errorOperation==='replace');
  const description='Найдёт устаревшие иконки и заменит их на Glyph-26 для макетов АБМ на Android и iOS';
  return <>
    <button className="apollo-skill-card" type="button" aria-label="Перевести на Glyph-26" aria-haspopup="dialog" onClick={()=>{setOpen(true);client.open();}}>
      <span className="apollo-skill-copy"><strong>Перевести на Glyph-26</strong><span>{description}</span></span><img className="apollo-skill-chevron" src={catalogIcons['chevron-right']} alt=""/>
    </button>
    <Presence>{open && <Dialog title="Перевести на Glyph-26" workspace onClose={()=>{setPicker(null);setLarge(null);client.closePreview();setConfirm(false);client.dismissConfirmation();setOpen(false);}}>
      <main ref={content} onScroll={event=>{scroll.current=event.currentTarget.scrollTop;}} className={`apollo-skill-content apollo-reglyph-content${state.status==='preview'?' is-preview':''}`} aria-label="Результат навыка «Перевести на Glyph-26»" aria-busy={running || finishing}>
        <Assistant state={state} finishing={finishing}/>
        {state.supported && <>
            <Presence>{state.status==='preview' && <ResultRows elementRef={groups} changeToken={state.rows}>{sections.map(group=><section key={group.id} className="apollo-reglyph-group"><h3>{group.title} <span className="apollo-reglyph-count">{group.rows.reduce((sum:number,row:any)=>sum+row.ids.length,0)}</span></h3>{group.description && <p className="apollo-skills-hint">{group.description}</p>}
              {group.rows.map((row:any)=>{
                const target:any=targetMap.get(row.newKey);
                return <div key={rowIdentity(row)} className={`apollo-reglyph-row is-${group.id}${group.readonly?' is-readonly':''}`}>
                  <div className="apollo-reglyph-icon-card"><Tile item={{image:row.image,monochrome:row.monochrome}} name={row.name} onOpen={()=>openPreview({id:row.ids[0],name:row.name,library:row.library || 'Glyph',image:row.image,monochrome:row.monochrome})}/><div><strong>{row.name}</strong><span className="apollo-skills-hint">{`Библиотека: ${row.library || 'Glyph'}`}</span><button type="button" className="apollo-reglyph-small" disabled={busy || !state.available || state.planStale} onClick={()=>client.focus(row.ids[0])}>Показать в макете</button></div></div>
                  {!group.readonly && <><img className="apollo-reglyph-arrow" src={icons['arrow-right']} alt=""/><div className={`apollo-reglyph-icon-card is-target${target?' is-matched':''}`}><PreviewTile icon={target} state={state} client={client} onOpen={openPreview}/><div><strong>{target?.baseName || target?.name || 'Замена не выбрана'}</strong><span className="apollo-skills-hint">Библиотека: {state.scenario==='services'?'Logo-corp':'Glyph 26'}</span><button type="button" className="apollo-reglyph-small" disabled={busy || !state.available || state.planStale} onClick={()=>setPicker(row)}>Выбрать</button></div></div></>}
                </div>;
              })}
            </section>)}
          </ResultRows>}</Presence>{state.status!=='preview' && <div className="apollo-reglyph-result-details">
            {state.status==='scanning' && state.progress && <p role="status">Проверено компонентов: {state.progress.processed} из {state.progress.total}</p>}
            {result && <p role="status">Заменено: {result.replaced}. Пропущено: {result.skipped}. Не удалось заменить: {result.failed}.</p>}
          </div>}</>}
        {state.error && <p className="apollo-reglyph-error" role="alert">{state.error}</p>}
        {!state.available && state.supported && !running && <p role="status" className="apollo-skills-hint">Дождись завершения другой операции Apollo.</p>}
      </main>
      {state.supported && <footer className="apollo-skill-footer" aria-label="Действия обновления иконок"><div className="apollo-skills-actions">
        {state.status==='replacing'?null:
          state.status==='preview'?<><Button label="Новая проверка" type="secondary" disabled={busy || !state.available} onPress={()=>client.reset()}/><Button label={`Заменить · ${replacementCount}`} disabled={!replacementCount || busy || !state.available || state.planStale} onPress={()=>{if(missingCount)setConfirm(true);else client.replace();}}/></>:
          replacementFailure?<><Button label="Назад к замене" type="secondary" disabled={busy || !state.available} onPress={()=>client.back()}/><Button label="Попробовать ещё раз" disabled={!replacementCount || busy || !state.available || state.planStale} onPress={()=>client.retryReplace()}/></>:
          state.status==='done'?result?.skipped?<><Button label="Назад к замене" disabled={busy || !state.available} onPress={()=>client.back()}/><Button label="Новая проверка" type="secondary" disabled={busy || !state.available} onPress={()=>client.reset()}/></>:<Button label="Новая проверка" disabled={busy || !state.available} onPress={()=>client.reset()}/>:
          <Button label="Проверить" disabled={!state.catalog?.newIcons.length || busy || !state.available} onPress={()=>client.start()}/>}
      </div></footer>}
    </Dialog>}</Presence>
    <Presence>{open && picker && state.status==='preview' && <Picker row={state.rows.find((row:any)=>rowIdentity(row)===rowIdentity(picker)) || picker} state={state} client={client} onClose={()=>setPicker(null)} onPreview={openPreview}/>}</Presence>
    <Presence>{open && confirm && <Dialog title="Точно заменяем?" onClose={()=>setConfirm(false)} className="apollo-reglyph-confirm"><main className="apollo-skill-content"><p>{keepWords(`Для ${missingCount} ${missingCount%10===1 && missingCount%100!==11?'иконки':'иконок'} замена не выбрана. Их тогда пропустим.`)}</p></main><footer className="apollo-skill-footer"><div className="apollo-skills-actions"><Button type="secondary" label="Назад" onPress={()=>setConfirm(false)}/><Button label={`Заменить · ${replacementCount}`} disabled={busy || !state.available || state.planStale} onPress={()=>{setConfirm(false);client.replace();}}/></div></footer></Dialog>}</Presence>
    <Presence>{open && state.confirmation?.type==='services-pattern-required' && <Dialog title="Для сервисов есть эталонный предсобранный экран" onClose={()=>client.dismissConfirmation()} className="apollo-reglyph-confirm apollo-reglyph-services"><main className="apollo-skill-content"><p>{keepWords('Скопируй его из паттерна «Уважаемые экраны».')}</p><div className="apollo-reglyph-pattern-links"><a href="https://www.figma.com/design/BI1TDn8znYU8PSW0Sy84dH/Patterns?node-id=20022540-222178" target="_blank" rel="noopener noreferrer">Паттерн для iOS</a><a href="https://www.figma.com/design/BI1TDn8znYU8PSW0Sy84dH/Patterns?node-id=20022540-228115" target="_blank" rel="noopener noreferrer">Паттерн для Android</a></div></main></Dialog>}</Presence>
    <Presence>{open && large && <Dialog title={large.name} onClose={()=>{setLarge(null);client.closePreview();}} className="apollo-reglyph-image-dialog"><main className="apollo-skill-content"><p className="apollo-skills-hint">Библиотека: {large.library}</p><div className="apollo-reglyph-large-art">{(state.largePreview?.token===large.token && state.largePreview.image || large.image)?<img src={state.largePreview?.token===large.token && state.largePreview.image || large.image} alt={large.name}/>:<p>{state.planStale && !large.key?'Превью предыдущей проверки недоступно.':'Загружаем превью…'}</p>}</div>{state.largePreview?.token===large.token && state.largePreview.error && <p role="alert">{state.largePreview.error}</p>}</main></Dialog>}</Presence>
    <Presence>{open && state.selectionConfirmation && <Dialog title="Проверить другой макет?" onClose={()=>client.decideSelection('stay')} className="apollo-reglyph-confirm apollo-reglyph-selection"><main className="apollo-skill-content"><p>{keepWords('Текущую проверку мне придётся сбросить.')}</p></main><footer className="apollo-skill-footer"><div className="apollo-skills-actions"><Button label="Остаться" type="secondary" disabled={busy || !state.available} onPress={()=>client.decideSelection('stay')}/><Button label="Проверить" disabled={busy || !state.available} onPress={()=>client.decideSelection('switch')}/></div></footer></Dialog>}</Presence>
  </>;
}
