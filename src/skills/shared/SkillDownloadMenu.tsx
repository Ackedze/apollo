import React, {useId, useLayoutEffect, useRef, useState} from 'react';
import {Button} from '../../design-check/v3/ui-app/components/Button';
import {OptionList} from '../../design-check/v3/ui-app/components/OptionList';
import {OptionListCell} from '../../design-check/v3/ui-app/components/OptionListCell';
import assets from './assets.json';
import './skill-download-menu.css';

export function SkillDownloadMenu({canReport,canInput,inputLoading,onReport,onInput,filesLabel='Файлы проверки текстов',
 triggerLabel='Скачать диагностику',reportLabel='Скачать отчёт',inputLabel='Исходный JSON'}:{
 canReport:boolean;canInput:boolean;inputLoading:boolean;onReport:()=>void;onInput:()=>void;filesLabel?:string;
 triggerLabel?:string;reportLabel?:string;inputLabel?:string;
}){
 const [open,setOpen]=useState(false),wrap=useRef<HTMLDivElement>(null),menu=useRef<HTMLDivElement>(null),id=useId();
 const disabled=!canReport&&!canInput;
 const close=(restoreFocus=false)=>{setOpen(false);if(restoreFocus)wrap.current?.querySelector<HTMLButtonElement>('button')?.focus();};
 const focusItem=(last=false)=>{
  const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);
  buttons[last?buttons.length-1:0]?.focus();
 };
 useLayoutEffect(()=>{
  if(!open||disabled)return;
  focusItem();
  const outside=(event:Event)=>{if(event.target instanceof Node&&!wrap.current?.contains(event.target))setOpen(false);};
  document.addEventListener('pointerdown',outside);document.addEventListener('focusin',outside);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);};
 },[open,disabled]);
 return <div ref={wrap} className="apollo-skill-download-menu" onKeyDown={event=>{
  if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close(true);return;}
  if(disabled||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();
  if(!open){setOpen(true);requestAnimationFrame(()=>focusItem(event.key==='ArrowUp'||event.key==='End'));return;}
  const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);
  if(!buttons.length)return;
  const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;
  buttons[next].focus();
 }}>
  <Button label={triggerLabel} singleIcon type="secondary" disabled={disabled} ariaExpanded={open&&!disabled} ariaControls={id}
   icon={<img src={assets.download} width={24} height={24} alt=""/>} onPress={()=>setOpen(!open)}/>
  {open&&!disabled&&<div ref={menu} id={id} className="apollo-skill-download-popup" role="group" aria-label={filesLabel}>
   <OptionList>
    <OptionListCell label={reportLabel} showLeadingIcon={false} disabled={!canReport} onPress={()=>{close(true);onReport();}}/>
    <OptionListCell label={inputLabel} showLeadingIcon={false} disabled={!canInput||inputLoading} onPress={()=>{close(true);onInput();}}/>
   </OptionList>
  </div>}
 </div>;
}
