import React from 'react';
import {FindingActionMenu} from '../design-check/FindingActionMenu';
import {FindingInformation} from '../design-check/FindingCard';
import {ResultCard} from '../design-check/v3/ui-app/components/ResultCard';
import {ResultSubCard} from '../design-check/v3/ui-app/components/ResultSubCard';
import {SmallButton} from '../design-check/v3/ui-app/components/SmallButton';
import assets from '../design-check/assets/finding-assets.json';
const {comparisons}=require('./ui-model');
const labels:Record<string,string>={violation:'Нарушение',unknown:'Требует проверки',allowed:'Допустимая настройка',expected:'Допустимая настройка',warning:'Замечание',compliant:'Соответствует','not-applicable':'Неприменимо',observation:'Отличие от эталона'};
function DiffInfo({diff}:{diff:any}){
 return <section><h3>{labels[diff.assessment?.verdict]||'Не удалось проверить'}</h3>
  <p>{diff.assessment?.message||diff.message||'Нет подтверждённой оценки правила.'}</p>
  {diff.details?.property&&<p>Свойство: {diff.details.property}</p>}
  {diff.componentRules?.length>0&&<ul>{diff.componentRules.map((rule:any,index:number)=><li key={rule.id||index}>{rule.id||rule.ruleId||'Правило компонента'}{rule.description&&<> · {rule.description}</>}</li>)}</ul>}
  {diff.assessment?.evidence&&<details><summary>Доказательства</summary><pre>{JSON.stringify(diff.assessment.evidence,null,2)}</pre></details>}
 </section>;
}
function FindingActions({actions=[],disabled,onAction}:{actions?:any[];disabled:boolean;onAction:(id:string)=>void}){
 if(!actions.length)return null;
 const binding=actions.some(action=>['bind-variable','bind-style'].includes(action.kind));
 if(binding||actions.length>1)return <FindingActionMenu actions={actions} label={binding?'Привязать':'Выбрать'} disabled={disabled} onAction={onAction}/>;
 return <SmallButton label={actions[0].label} disabled={disabled} singleIcon={false} onPress={()=>onAction(actions[0].id)}/>;
}
function FocusIcon(){return <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
export function V3Findings({category,client,runId,stale,busy,mutationAvailable}:{category:any;client:any;runId:string|null;stale:boolean;busy:boolean;mutationAvailable:boolean}){
 if(!category?.connected)return <p className="placeholder">Запусти проверку выбранной области.</p>;
 if(!category.entries.length)return <p className="placeholder">В этой категории замечаний нет.</p>;
 const disabled=stale||busy||!mutationAvailable||!runId;
 return <div className="apollo-findings apollo-v3-findings">
  {category.entries.map((row:any)=>{
   const tone=row.classification==='violation'?'violation':['compliant','allowed','not-applicable'].includes(row.classification)?'current':'warning';
   const actions=(items:any[])=><FindingActions actions={items} disabled={disabled} onAction={id=>void client.action(id)}/>;
   return <ResultCard key={row.id} title={row.displayName||row.item.name||row.title} caption={row.library||undefined} onFocus={row.focusActionId&&!busy&&runId?()=>void client.focus(runId,row.focusActionId):undefined}
    indicator={<span className={`apollo-finding-status ${tone}`} role="img" aria-label={tone==='violation'?'Нарушение':tone==='warning'?'Замечание':'Соответствует'}>{tone==='current'?<span/>:<img src={tone==='warning'?assets.imgStatusWarning:assets.imgStatusCircle} width={36} height={36} alt=""/>}</span>}
    actions={<>{row.focusActionId&&<span><SmallButton focusTarget ariaLabel="Показать в макете" title={row.location} disabled={busy||!runId} icon={<FocusIcon/>} onPress={()=>void client.focus(runId,row.focusActionId)}/></span>}
     <FindingInformation><p>{labels[row.classification]||row.classification}</p><p>{row.title}</p><p>{row.location}</p>{row.messages?.map((message:string,index:number)=><p key={index}>{message}</p>)}{row.diffs?.map((diff:any,index:number)=><DiffInfo key={index} diff={diff}/>)}{row.item?.evidence&&<details><summary>Основание проверки</summary><pre>{JSON.stringify(row.item.evidence,null,2)}</pre></details>}</FindingInformation>
    </>}>
    {row.diffs?.length?row.diffs.map((diff:any,index:number)=><ResultSubCard key={index} name={diff.assessment?.verdict==='unknown'&&diff.assessment?.message==='Контекстное правило не найдено'?'Нет правила для оценки этого изменения.':diff.assessment?.message||diff.message||row.title} actionSlot={actions(diff.actions)}
     valueLines={comparisons(diff).map((value:any)=>({label:value.property,values:[value.before,value.after]}))}>
      {!comparisons(diff).length&&diff.message&&diff.message!==diff.assessment?.message&&<p>{diff.message}</p>}
      <p className={"apollo-v3-finding-message "+(diff.assessment?.verdict==='violation'?'is-violation':'is-warning')}>{labels[diff.assessment?.verdict]||'Требует проверки'}</p>
     </ResultSubCard>):<ResultSubCard name={row.title} actionSlot={actions(row.actions)}>{row.messages?.map((message:string,index:number)=><p key={index}>{message}</p>)}</ResultSubCard>}
   </ResultCard>;
  })}
 </div>;
}
