import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {SmallButton} from './v3/ui-app/components/SmallButton';

export function AuditToast({message,error=false,persistent=false,children}:{message:string;error?:boolean;persistent?:boolean;children?:React.ReactNode}){
 const [visible,setVisible]=useState(true);
 useEffect(()=>{if(persistent||error)return;const timer=setTimeout(()=>setVisible(false),7000);return()=>clearTimeout(timer);},[persistent,error]);
 if(!visible)return null;
 return createPortal(<aside className={'apollo-audit-toast'+(error?' is-error':'')} aria-label="Уведомление проверки">
  <span role={error?'alert':'status'}>{message}</span>{children}
  {!persistent&&<SmallButton label="Закрыть" ariaLabel="Закрыть уведомление" icon={<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m6 6 12 12M18 6 6 18"/></svg>} onPress={()=>setVisible(false)}/>}
 </aside>,document.body);
}
