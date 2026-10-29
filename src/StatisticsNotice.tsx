import React, {useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react';
import {Button} from './design-check/v3/ui-app/components/Button';

export function StatisticsNotice({client}:{client:any}) {
  const state:any=useSyncExternalStore(client.subscribe,client.getState),ref=useRef<HTMLDivElement>(null);
  const [visible,setVisible]=useState(false);
  useLayoutEffect(()=>{
    if(!state.message)return;
    const update=()=>{
      const dialogs=document.querySelectorAll('dialog[open]'),top=dialogs[dialogs.length-1];
      setVisible(top?top.contains(ref.current):!ref.current?.closest('dialog'));
    };
    const node=ref.current,dialog=node?.closest('dialog[open]');
    update();const observer=new MutationObserver(update);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
    return()=>{observer.disconnect();if(node && (node.contains(document.activeElement) || document.activeElement===document.body) && dialog?.isConnected){const next=Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).find(button=>!node.contains(button));next?.focus({preventScroll:true});}};
  },[state.message]);
  if(!state.message)return null;
  const download=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(client.diagnostics(),null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='apollo-statistics-pending.json';link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <div ref={ref} className="apollo-statistics-notice" hidden={!visible} role={visible?'status':undefined}>
    <p className="design-check-note">{state.message}</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
      <Button type="secondary" label="Повторить отправку" onPress={()=>{void client.flush();}}/>
      <Button type="secondary" label="Скачать сведения" onPress={download}/>
    </div>
  </div>;
}
