import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {PickerButton} from './v3/ui-app/components/PickerButton';
import {OptionList} from './v3/ui-app/components/OptionList';
import {OptionListCell} from './v3/ui-app/components/OptionListCell';
import {OptionListHeader} from './v3/ui-app/components/OptionListHeader';
import styles from './v3/ui-app/components/TopSection.module.css';

export function FindingActionMenu({actions,label,disabled,onAction}:{actions:any[];label:string;disabled:boolean;onAction:(id:string)=>void}){
 const [open,setOpen]=useState(false),wrap=useRef<HTMLSpanElement>(null),menu=useRef<HTMLDivElement>(null);
 const libraries=new Map<string,any[]>();
 for(const action of actions){const library=action.targetLibrary||'';if(!libraries.has(library))libraries.set(library,[]);libraries.get(library)!.push(action);}
 const close=(focus=false)=>{setOpen(false);if(focus)wrap.current?.querySelector('button')?.focus();};
 const focusOption=(last=false)=>requestAnimationFrame(()=>{const buttons=menu.current?.querySelectorAll<HTMLButtonElement>('button');(last?buttons?.[buttons.length-1]:buttons?.[0])?.focus();});
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 useLayoutEffect(()=>{
  const popup=menu.current,button=wrap.current?.querySelector('button');if(!open||disabled||!popup||!button)return;
  const bounds=button.getBoundingClientRect(),width=Math.min(360,window.innerWidth-16),below=innerHeight-bounds.bottom-12,above=bounds.top-12;
  popup.style.width=width+'px';popup.style.maxHeight='228px';const height=popup.getBoundingClientRect().height,flip=height>below&&above>below;
  popup.style.left=Math.max(8,Math.min(bounds.right-width,innerWidth-width-8))+'px';popup.style.top=(flip?Math.max(8,bounds.top-Math.min(height,above)-4):bounds.bottom+4)+'px';popup.style.maxHeight=Math.max(40,Math.min(228,flip?above:below))+'px';
  const outside=(event:Event)=>{if(event.target instanceof Node&&!popup.contains(event.target)&&!wrap.current?.contains(event.target))close();};
  const resized=()=>close();document.addEventListener('pointerdown',outside);document.addEventListener('focusin',outside);document.addEventListener('scroll',outside,true);window.addEventListener('resize',resized);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);document.removeEventListener('scroll',outside,true);window.removeEventListener('resize',resized);};
 },[open,disabled]);
 return <span ref={wrap} className="apollo-finding-action-menu" onKeyDown={event=>{
  if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close(true);return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||disabled)return;
  event.preventDefault();event.stopPropagation();
  if(!open){setOpen(true);focusOption(event.key==='ArrowUp'||event.key==='End');return;}
  const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button')||[]);if(!buttons.length)return;
  const current=buttons.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[next].focus();
 }}>
  <PickerButton compact label={label} open={open} disabled={disabled} onPress={()=>{if(open)close();else{setOpen(true);focusOption();}}}/>
  {open&&!disabled&&createPortal(<div ref={menu} className={styles.pickerOverlay+' apollo-finding-action-popup'} role="group" aria-label={label==='Привязать'?'Привязать стиль или токен':'Выбрать исправление'}>
   <OptionList className={styles.pickerMenu}>{Array.from(libraries,([library,items])=><React.Fragment key={library}>
    {library&&<OptionListHeader label={library}/>}
    {items.map(action=><OptionListCell key={action.id} label={action.targetName||action.label} showLeadingIcon={false} onPress={()=>{if(disabled)return;close(true);onAction(action.id);}}/>)}
   </React.Fragment>)}</OptionList>
  </div>,document.body)}
 </span>;
}
