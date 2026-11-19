import React, {useLayoutEffect,useRef} from 'react';
import {FindingInformation} from '../design-check/FindingCard';
import {SmallButton} from '../design-check/v3/ui-app/components/SmallButton';
import assets from '../skills/shared/assets.json';
import './text-review-table.css';

type TextFact={node:{id:string;name?:string};text:string};
type ReviewFinding={nodeId:string;priority:'error'|'warning'|'info';category:string;message:string;replacement:string|null;sources:{path:string;ruleId:string}[]};
function Suggestion({value,label,disabled,onChange}:{value:string;label:string;disabled:boolean;onChange:(value:string)=>void}){
 const ref=useRef<HTMLTextAreaElement>(null);
 useLayoutEffect(()=>{const input=ref.current;if(input){input.style.height='0';input.style.height=Math.max(20,input.scrollHeight)+'px';}},[value]);
 return <textarea ref={ref} className="apollo-text-suggestion" aria-label={'Предложение для слоя '+label} rows={1} value={value} readOnly={disabled}
  spellCheck={false} onChange={event=>onChange(event.currentTarget.value)} />;
}
export function TextReviewTable({findings,facts,canFocus,focus,drafts={},applied={},edit=()=>{},canEdit=false,canReplace=()=>false,replace=()=>{}}:{
 findings:ReviewFinding[];facts:TextFact[];canFocus:(id:string)=>boolean;focus:(id:string)=>void;
 drafts?:Record<string,string>;applied?:Record<string,string>;edit?:(id:string,text:string)=>void;canEdit?:boolean;canReplace?:(id:string)=>boolean;replace?:(id:string)=>void;
}){
 const byId=new Map(facts.map(fact=>[fact.node.id,fact]));
 return <div className="apollo-text-findings" aria-label="Замечания к текстам">{findings.map(finding=>{
  const fact=byId.get(finding.nodeId),label=fact?.node.name||'Текстовый слой';
  const replaced=Object.prototype.hasOwnProperty.call(applied,finding.nodeId);
  const suggested=typeof finding.replacement==='string',value=drafts[finding.nodeId]??finding.replacement??'';
  return <article className="apollo-text-card" key={finding.nodeId}>
   <div className="apollo-text-values"><div className="apollo-text-values-copy">
    <div className="apollo-text-current-row">
     <span className="apollo-text-status" aria-hidden="true"><img src={finding.priority==='error'?assets['status-error']:assets['status-warning']} width={36} height={36} alt="" /></span>
     <button type="button" className="apollo-text-layer-focus" data-finding-focus disabled={!canFocus(finding.nodeId)} title={'Показать в макете: '+label}
      aria-label={'Показать в макете: '+label} onClick={()=>focus(finding.nodeId)}>{fact?.text??label}</button>
    </div>
    {suggested&&<div className="apollo-text-suggested-row"><img src={assets['arrow-right-desc']} width={16} height={16} alt="" />
     <Suggestion value={value} label={label} disabled={!canEdit} onChange={text=>edit(finding.nodeId,text)}/>
    </div>}
   </div>
   {suggested&&<SmallButton label={replaced?'Заменено':'Заменить'} ariaLabel={(replaced?'Текст заменён в слое ':'Заменить текст слоя ')+label} singleIcon={false} className={'apollo-text-replace'+(replaced?' is-applied':'')}
    disabled={replaced||!canReplace(finding.nodeId)} onPress={()=>replace(finding.nodeId)}/>}
   </div>
   <div className="apollo-text-divider"/>
   <div className="apollo-text-rule"><div className="apollo-text-rule-heading">
    <div className="apollo-text-rule-identity"><span>{finding.category}</span><span aria-hidden="true">·</span><span className="apollo-text-layer-name">{label}</span></div>
    {finding.sources.length>0&&<FindingInformation label="Источники" icon={<img src={assets.information} width={16} height={16} alt=""/>}>
     <ul className="apollo-text-review-sources">{finding.sources.map(source=><li key={source.path+':'+source.ruleId}><strong>{source.ruleId}</strong><p className="apollo-rule-identity">{source.path}</p></li>)}</ul>
    </FindingInformation>}
   </div><p>{finding.message}</p></div>
  </article>;
 })}</div>;
}
