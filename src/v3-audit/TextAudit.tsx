import React from 'react';
import {AuditMascot} from '../design-check/AuditMascot';
import {FindingCard} from '../design-check/FindingCard';
import {MarkdownMessage} from '../design-check/MarkdownMessage';
import {TextReviewTable} from './TextReviewTable';
export function TextAudit({state,client}:{state:any;client:any}){
 const texts=state.texts,checking=state.busy&&state.kind==='texts',result=texts.result;
 const progress=<div className="apollo-overview-total"><AuditMascot checking={checking} quality="unchecked" label={checking?'Проверка текстов выполняется':'Проверка текстов ещё не запускалась'}/><p className="apollo-overview-caption" role="status">{checking?state.progress:'Выбери область и нажми Проверить'}</p></div>;
 if(!result)return <section className="apollo-overview" aria-label="Проверка текстов">{progress}</section>;
 const targets=new Map((texts.capture?.textTargets||[]).map((target:any)=>[target.nodeId,target.focusActionId]));
 const canFocus=(id:string)=>targets.has(id)&&!texts.stale&&!state.busy&&!state.operation?.busy;
 const focus=(id:string)=>void client.focus(texts.runId,targets.get(id));
 return <section className="apollo-results" aria-label="Результат проверки текстов">
  {checking&&progress}<h2>Тексты</h2>{(texts.stale||checking)&&<p className="design-check-note" role="status">Показан предыдущий принятый результат.{checking?' Новая проверка выполняется.':' Повтори проверку текстов.'}</p>}
  <p className="design-check-muted">Проверено видимых текстовых слоёв: {texts.capture?.textReport?.summary?.scannedTextNodes??'не указано'}.</p>
  {result.skillId==='ux-writer-v2' ? <TextReviewTable findings={result.findings} facts={texts.capture?.textReport?.facts?.texts??[]}
    coverageGaps={result.coverageGaps} canFocus={canFocus} focus={focus} />
    : <LegacyTextFindings result={result} hasTarget={id=>targets.has(id)} canFocus={canFocus} focus={focus} />}
 </section>;
}

function LegacyTextFindings({result,hasTarget,canFocus,focus}:{result:any;hasTarget:(id:string)=>boolean;canFocus:(id:string)=>boolean;focus:(id:string)=>void}){
 return <>
  {result.findings.map((finding:any)=><FindingCard key={finding.id||finding.nodeId+':'+finding.title} title={finding.title||'Замечание к тексту'}
   tone={finding.priority==='error'?'violation':finding.priority==='allowed'?'current':'warning'} location={hasTarget(finding.nodeId)?<button type="button" data-finding-focus aria-label="Показать в макете" disabled={!canFocus(finding.nodeId)} onClick={()=>focus(finding.nodeId)}>{finding.nodeId}</button> : finding.nodeId||'Выбранная область'}
   information={<><p>{finding.observed||finding.message}</p>{finding.ruleId&&<p>{finding.ruleId}</p>}<details><summary>Доказательства и источники</summary><pre>{JSON.stringify(finding.evidence||finding.evidenceItems||[],null,2)}</pre></details></>}>
   <p>{finding.observed||finding.message}</p>{finding.recommendation&&<p>{finding.recommendation}</p>}
  </FindingCard>)}
  {result.responseMarkdown&&<MarkdownMessage text={result.responseMarkdown}/>}
  {!result.findings.length&&!result.responseMarkdown&&<p className="design-check-note">Агент не вернул замечаний. Полнота проверки не подтверждена.</p>}
 </>;
}
