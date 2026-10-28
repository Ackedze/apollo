import React, {useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {Button} from '../../design-check/v3/ui-app/components/Button';
import {AuditMascot} from '../../design-check/AuditMascot';
import {PickerButton} from '../../design-check/v3/ui-app/components/PickerButton';
import {OptionList} from '../../design-check/v3/ui-app/components/OptionList';
import {OptionListCell} from '../../design-check/v3/ui-app/components/OptionListCell';
import pickerStyles from '../../design-check/v3/ui-app/components/TopSection.module.css';
import './ui.css';
const icons = require('../layer-names/assets');
const {rowIdentity, searchText} = require('./client');

const scenarios=[{id:'default',label:'Базовая замена'},{id:'services',label:'Замена в сервисах'}];
function ScenarioPicker({value,disabled,onChange}:{value:string;disabled:boolean;onChange:(value:string)=>void}) {
  const [open,setOpen]=useState(false),anchor=useRef<HTMLDivElement>(null),menu=useRef<HTMLDivElement>(null);
  const close=useCallback((restoreFocus=true)=>{setOpen(false);if(restoreFocus)anchor.current?.querySelector('button')?.focus({preventScroll:true});},[]);
  useEffect(()=>{if(disabled)close(false);},[disabled,close]);
  useLayoutEffect(()=>{
    if(!open || disabled)return;
    const popup=menu.current,trigger=anchor.current?.querySelector('button');
    if(!popup || !trigger)return;
    const bounds=trigger.getBoundingClientRect(),size=popup.getBoundingClientRect();
    popup.style.left=`${Math.max(16,Math.min(bounds.left,window.innerWidth-size.width-16))}px`;
    popup.style.bottom=`${window.innerHeight-bounds.top+4}px`;
    popup.style.maxHeight=`${Math.max(0,bounds.top-16)}px`;
    (popup.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? popup.querySelector<HTMLButtonElement>('button'))?.focus({preventScroll:true});
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node && !anchor.current?.contains(event.target) && !popup.contains(event.target))close(false);};
    const scroll=(event:Event)=>{if(event.target instanceof Node && !popup.contains(event.target))close(false);};
    const resize=()=>close();
    document.addEventListener('pointerdown',outside,true);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',resize);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',resize);};
  },[open,disabled,close]);
  const keyboard=(event:React.KeyboardEvent<HTMLDivElement>)=>{
    if(open && event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
    if(open && event.key==='Tab'){close();return;}
    if(disabled || !['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    if(!open){setOpen(true);return;}
    const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    if(!buttons.length)return;
    const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;
    buttons[next].focus({preventScroll:true});
  };
  // Keep the custom popup inside the native dialog's active top layer.
  const portal=anchor.current?.closest('dialog');
  return <div ref={anchor} className="apollo-reglyph-scenario" onKeyDown={keyboard}>
    <PickerButton label={scenarios.find(option=>option.id===value)?.label || scenarios[0].label} open={open && !disabled} disabled={disabled} onPress={()=>open?close():setOpen(true)}/>
    {open && !disabled && portal && createPortal(<div ref={menu} className={`${pickerStyles.pickerOverlay} apollo-reglyph-scenario-menu`} role="group" aria-label="Сценарий замены" onKeyDown={keyboard}>
      <OptionList className={pickerStyles.pickerMenu}>{scenarios.map(option=><OptionListCell key={option.id} label={option.label} selected={option.id===value} showLeadingIcon={false} onPress={()=>{close();onChange(option.id);}}/>)}</OptionList>
    </div>,portal)}
  </div>;
}

function Dialog({title,onClose,children,className=''}:{title:string;onClose:()=>void;children:React.ReactNode;className?:string}) {
  const ref=useRef<HTMLDialogElement>(null),titleId=useId();
  useEffect(()=>{const opener=document.activeElement as HTMLElement|null,dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();if(opener?.isConnected)opener.focus();};},[]);
  return createPortal(<dialog ref={ref} className={`apollo-skill-dialog apollo-reglyph-dialog ${className}`} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose();}}>
    <header className="apollo-skill-header"><h2 id={titleId}>{title}</h2><button type="button" className="apollo-skill-close" aria-label={`Закрыть: ${title}`} onClick={onClose}><img src={icons.close} alt=""/></button></header>
    {children}
  </dialog>,document.body);
}
function Tile({item,fallback,onOpen,name,onError}:{item:any;fallback?:string;onOpen:()=>void;name:string;onError?:()=>void}) {
  return <button type="button" className={`apollo-reglyph-tile${item?.image && item.monochrome?' is-monochrome':''}`} style={item?.image?{'--reglyph-image':`url("${item.image}")`} as React.CSSProperties:undefined} aria-label={`Превью: ${name}`} onClick={onOpen}>
    {item?.image?<img src={item.image} alt="" onError={onError}/>:<span aria-hidden="true">{fallback || '…'}</span>}
  </button>;
}
function PreviewTile({icon,state,client,onOpen}:{icon:any;state:any;client:any;onOpen:(value:any)=>void}) {
  const ref=useRef<HTMLDivElement>(null),key=icon?.key;
  useEffect(()=>{
    if(!key || !ref.current)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))client.preview(key,true);});
    observer.observe(ref.current);return()=>observer.disconnect();
  },[key,client]);
  if(!icon)return <div className="apollo-reglyph-tile" aria-hidden="true">—</div>;
  const image=state.images.get(key),item=state.scenario==='services' && image?Object.assign({},image,{monochrome:false}):image;
  return <div ref={ref}><Tile item={item} fallback={state.previewErrors.has(key)?'—':'…'} name={icon.baseName || icon.name} onError={()=>client.previewFailed(key)} onOpen={()=>onOpen({key,name:icon.baseName || icon.name,library:icon.library || (state.scenario==='services'?'Logo-corp':'Glyph 26'),image:item?.image,monochrome:item?.monochrome})}/></div>;
}
function Picker({row,state,client,onClose,onPreview}:{row:any;state:any;client:any;onClose:()=>void;onPreview:(value:any)=>void}) {
  const [query,setQuery]=useState(''),[limit,setLimit]=useState(60);
  const selected=state.catalog.newIcons.find((icon:any)=>icon.key===row.newKey),service=state.scenario==='services';
  const groups=useMemo(()=>{
    const words=searchText(query).split(' ').filter(Boolean),suggestions=new Map((row.candidates || []).map((candidate:any)=>[candidate.newKey,candidate]));
    const matches=client.representatives().filter((icon:any)=>{
      if(icon.key===row.oldKey || Object.values(row.sourceKeys || {}).includes(icon.key))return false;
      const suggestion:any=suggestions.get(icon.key);
      const text=searchText([icon.name,icon.baseName,icon.searchDescription,...(suggestion?.serviceNames || []),...(suggestion?.serviceIds || [])].join(' '));
      return words.every((word:string)=>text.includes(word));
    }).sort((a:any,b:any)=>(a.baseName || a.name).localeCompare(b.baseName || b.name,'ru',{sensitivity:'base',numeric:true}));
    if(service && suggestions.size>1)return [{id:'recommended',name:'Рекомендованные иконки',items:matches.filter((icon:any)=>suggestions.has(icon.key))},{id:'all',name:'Все иконки',items:matches.filter((icon:any)=>!suggestions.has(icon.key))}].filter(group=>group.items.length);
    if(!service && state.catalog.iconCategories?.length){
      const covered=new Set<string>();
      const categories=state.catalog.iconCategories.map((category:any)=>{
        const families=new Set(category.familyIds),items=matches.filter((icon:any)=>families.has(icon.familyId));items.forEach((icon:any)=>covered.add(icon.key));return{id:category.id,name:category.name,items};
      }).filter((group:any)=>group.items.length);
      const other=matches.filter((icon:any)=>!covered.has(icon.key));if(other.length)categories.push({id:'uncategorized',name:'Без категории',items:other});return categories;
    }
    return [{id:'all',name:'',items:matches}];
  },[query,row,state.catalog,state.scenario,client]);
  const count=groups.reduce((sum:number,group:any)=>sum+group.items.length,0);
  let offset=0;
  return <Dialog title={`Выбери иконку из ${service?'Logo-corp':'Glyph 26'}`} onClose={onClose} className="apollo-reglyph-picker">
    <div className="apollo-reglyph-search"><input type="search" value={query} placeholder="Поиск по названию или описанию" aria-label="Поиск иконок" onChange={event=>{setQuery(event.target.value);setLimit(60);}}/></div>
    <main className="apollo-skill-content apollo-reglyph-options" onScroll={event=>{const node=event.currentTarget;if(node.scrollTop+node.clientHeight>=node.scrollHeight-200)setLimit(previous=>Math.min(previous+60,count));}}>
      {groups.map((group:any)=>{
        const shown=group.items.slice(0,Math.max(0,limit-offset));offset+=group.items.length;if(!shown.length)return null;
        return <section key={group.id}>{group.name && <h3>{group.name} <span className="apollo-reglyph-count">{group.items.length}</span></h3>}
          {shown.map((icon:any)=>{
            const checked=icon.key===row.newKey || (!service && icon.familyId && selected?.familyId===icon.familyId);
            return <div key={icon.key} className={`apollo-reglyph-option${checked?' is-selected':''}`}>
              <PreviewTile icon={icon} state={state} client={client} onOpen={onPreview}/>
              <button type="button" aria-pressed={Boolean(checked)} onClick={()=>{client.choose(rowIdentity(row),icon.key);onClose();}}>{icon.baseName || icon.name}</button>
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
  const running=['scanning','replacing'].includes(state.status),busy=running || client.busy();
  useEffect(()=>{if(state.status!=='preview'){setPicker(null);setConfirm(false);}if(!state.supported || state.status==='stale')setLarge(null);},[state.status,state.supported,state.context]);
  const targetMap=useMemo(()=>new Map((state.catalog?.newIcons || []).map((icon:any)=>[icon.key,icon])),[state.catalog]);
  const replacementCount=state.rows.reduce((sum:number,row:any)=>sum+(row.newKey?row.ids.length:0),0),missingCount=state.rows.reduce((sum:number,row:any)=>sum+(!row.newKey?row.ids.length:0),0);
  const result=state.result;
  const sections=[
    {id:'unknown',title:'Неизвестные иконки',description:'Выбери соответствие вручную',rows:state.rows.filter((row:any)=>row.reviewGroup==='unknown')},
    {id:'unused',title:'Не используются у нас',description:'Можно выбрать замену вручную',rows:state.rows.filter((row:any)=>row.reviewGroup==='unused')},
    {id:'unresolved',title:`Этих иконок нет в ${state.scenario==='services'?'Logo-corp':'Glyph 26'}`,description:'Пропусти или выбери другую',rows:state.rows.filter((row:any)=>row.reviewGroup==='unresolved')},
    {id:'ambiguous',title:'Нужно выбрать соответствие',description:'Этим иконкам могут соответствовать несколько вариантов',rows:state.rows.filter((row:any)=>row.reviewGroup==='ambiguous')},
    {id:'native',title:'Оставляем как есть',description:'Нативные иконки и иконки, закреплённые в компонентах',readonly:true,rows:state.observedRows.filter((row:any)=>row.category!=='logo')},
    {id:'logo',title:'Логотипы',description:'Не заменяются',readonly:true,rows:state.observedRows.filter((row:any)=>row.category==='logo')},
    {id:'ready',title:'Готовы к замене',description:'',rows:state.rows.filter((row:any)=>row.reviewGroup==='ready')}
  ].filter(group=>group.rows.length);
  const openPreview=(descriptor:any)=>{const token=String(++previewToken.current);setLarge(Object.assign({},descriptor,{token}));client.largePreview(descriptor,token);};
  const startLabel=state.status==='error' || state.status==='stale'?'Повторить проверку':'Проверить иконки';
  const contextLabel=`АБМ · ${state.context.pickerLabel}`;
  const description=!state.supported?'Для макетов АБМ на iOS и Android':running?'Выполняется обновление иконок':state.status==='preview'?`Готово к замене: ${replacementCount}`:'Найдёт устаревшие иконки и предложит библиотечные замены';
  return <>
    <button className="apollo-skill-card" type="button" aria-label="Обновить иконки" aria-haspopup="dialog" onClick={()=>{setOpen(true);client.open();}}>
      <span className="apollo-skill-copy"><strong>Обновить иконки</strong><span>{description}</span></span><img className="apollo-skill-chevron" src={icons['chevron-right']} alt=""/>
    </button>
    {open && <Dialog title="Обновить иконки" onClose={()=>{setPicker(null);setLarge(null);setConfirm(false);client.dismissConfirmation();setOpen(false);}}>
      <main className={`apollo-skill-content apollo-reglyph-content${state.status==='preview'?' is-preview':''}`} aria-label="Результат навыка «Обновить иконки»" aria-busy={running}>
        <p className="apollo-skills-hint apollo-reglyph-context">{state.supported?contextLabel:'АБМ · iOS / Android'} · Без ИИ</p>
        {!state.supported?<div className="apollo-reglyph-stage"><h3>Выбери iOS или Android</h3><p>Навык работает с правилами АБМ. Для Desktop и MobileWeb правила пока не подключены.</p></div>:
          state.status==='preview'?<>
            <p className="apollo-skills-hint">Проверь соответствия. Без выбранной замены: {missingCount}.</p>
            {!sections.length && <div className="apollo-reglyph-stage"><h3>Здесь иконок не нашлось</h3><p>Выдели другую область и запусти проверку.</p></div>}
            {sections.map(group=><section key={group.id} className="apollo-reglyph-group"><h3>{group.title} <span className="apollo-reglyph-count">{group.rows.reduce((sum:number,row:any)=>sum+row.ids.length,0)}</span></h3>{group.description && <p className="apollo-skills-hint">{group.description}</p>}
              {group.rows.map((row:any)=>{
                const target:any=targetMap.get(row.newKey);
                return <div key={rowIdentity(row)} className={`apollo-reglyph-row${group.readonly?' is-readonly':''}`}>
                  <div className="apollo-reglyph-icon-card"><Tile item={{image:row.image,monochrome:row.monochrome}} name={row.name} onOpen={()=>openPreview({id:row.ids[0],name:row.name,library:row.library || 'Glyph',image:row.image,monochrome:row.monochrome})}/><div><strong>{row.name}</strong><span className="apollo-skills-hint">{row.library || 'Glyph'} · {row.ids.length}</span><button type="button" className="apollo-reglyph-small" disabled={busy || !state.available} onClick={()=>client.focus(row.ids[0])}>Показать в макете</button></div></div>
                  {!group.readonly && <><img className="apollo-reglyph-arrow" src={icons['arrow-right'] || icons['chevron-right']} alt=""/><div className={`apollo-reglyph-icon-card is-target${target?' is-matched':''}`}><PreviewTile icon={target} state={state} client={client} onOpen={openPreview}/><div><strong>{target?.baseName || target?.name || 'Замена не выбрана'}</strong><span className="apollo-skills-hint">{state.scenario==='services'?'Logo-corp':'Glyph 26'}</span><button type="button" className="apollo-reglyph-small" disabled={busy || !state.available} onClick={()=>setPicker(row)}>Выбрать</button></div></div></>}
                </div>;
              })}
            </section>)}
          </>:<div className="apollo-reglyph-stage">
            <AuditMascot checking={running} quality={state.status==='error'?'violation':result?.failed || result?.skipped?'warning':result?'clean':'unchecked'}/>
            <h3>{state.status==='scanning'?'Ищем иконки…':state.status==='replacing'?'Обновляем иконки…':state.status==='done'?(result.failed?'Замена завершена с ошибками':result.skipped?'Иконки обновлены частично':'Иконки обновлены'):state.status==='error'?'Не удалось завершить проверку':state.status==='stale'?'Нужна новая проверка':'Выбери область и запусти проверку'}</h3>
            {state.status==='idle' && <p>Предложим библиотечные замены, а ты проверишь соответствия перед применением.</p>}
            {state.status==='scanning' && state.progress && <p role="status">Проверено компонентов: {state.progress.processed} из {state.progress.total}</p>}
            {result && <p role="status">Заменено: {result.replaced}. Пропущено: {result.skipped}. Не удалось заменить: {result.failed}.</p>}
          </div>}
        {state.error && <p className="apollo-reglyph-error" role="alert">{state.error}</p>}
        {!state.available && state.supported && !running && <p role="status" className="apollo-skills-hint">Дождись завершения другой операции Apollo.</p>}
      </main>
      <footer className="apollo-skill-footer" aria-label="Действия обновления иконок"><div className="apollo-skills-actions">
        {state.supported && !running && state.status!=='preview' && state.status!=='done' && <ScenarioPicker disabled={busy || !state.available} value={state.scenario} onChange={client.scenario}/>}
        {running?<Button label={state.status==='scanning'?'Проверяем':'Заменяем'} disabled loading onPress={()=>{}}/>:
          !state.supported?<Button type="secondary" label="Закрыть" onPress={()=>setOpen(false)}/>:
          state.status==='preview'?<><Button label="Новая проверка" type="secondary" disabled={busy || !state.available} onPress={()=>client.reset()}/><Button label={`Заменить · ${replacementCount}`} disabled={!replacementCount || busy || !state.available} onPress={()=>{if(missingCount)setConfirm(true);else client.replace();}}/></>:
          state.status==='done'?<><Button label="Новая проверка" disabled={busy || !state.available} onPress={()=>client.reset()}/>{state.rows.length>0 && <Button label="Назад к замене" type="secondary" disabled={busy || !state.available} onPress={()=>client.back()}/>}</>:
          <Button label={startLabel} disabled={!state.validSelection || !state.catalog || busy || !state.available} onPress={()=>client.start()}/>}
      </div></footer>
    </Dialog>}
    {open && picker && state.status==='preview' && <Picker row={state.rows.find((row:any)=>rowIdentity(row)===rowIdentity(picker)) || picker} state={state} client={client} onClose={()=>setPicker(null)} onPreview={openPreview}/>}
    {open && confirm && <Dialog title="Точно заменяем?" onClose={()=>setConfirm(false)} className="apollo-reglyph-confirm"><main className="apollo-skill-content"><p>Для {missingCount} вхождений замена не выбрана. Их пропустим.</p></main><footer className="apollo-skill-footer"><div className="apollo-skills-actions"><Button type="secondary" label="Назад" onPress={()=>setConfirm(false)}/><Button label={`Заменить · ${replacementCount}`} disabled={busy || !state.available} onPress={()=>{setConfirm(false);client.replace();}}/></div></footer></Dialog>}
    {open && state.confirmation && <Dialog title={state.confirmation.suggestedScenario==='services'?'Похоже, это раздел «Сервисы»':'Похоже, это не раздел «Сервисы»'} onClose={()=>client.dismissConfirmation()} className="apollo-reglyph-confirm"><main className="apollo-skill-content"><p>Выбери правила для этой проверки. Иконки пока не заменяются.</p></main><footer className="apollo-skill-footer"><div className="apollo-skills-actions"><Button label="Базовая замена" type={state.confirmation.suggestedScenario==='default'?'primary':'secondary'} disabled={busy} onPress={()=>client.confirmScenario('default')}/><Button label="Замена в сервисах" type={state.confirmation.suggestedScenario==='services'?'primary':'secondary'} disabled={busy} onPress={()=>client.confirmScenario('services')}/></div></footer></Dialog>}
    {open && large && <Dialog title={large.name} onClose={()=>setLarge(null)} className="apollo-reglyph-image-dialog"><main className="apollo-skill-content"><p className="apollo-skills-hint">Библиотека: {large.library}</p><div className="apollo-reglyph-large-art">{(state.largePreview?.token===large.token && state.largePreview.image || large.image)?<img src={state.largePreview?.token===large.token && state.largePreview.image || large.image} alt={large.name}/>:<p>Загружаем превью…</p>}</div>{state.largePreview?.token===large.token && state.largePreview.error && <p role="alert">{state.largePreview.error}</p>}</main></Dialog>}
  </>;
}
