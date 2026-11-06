import React from 'react';
import {AuditMascot} from '../design-check/AuditMascot';
import {FindingCard} from '../design-check/FindingCard';
import {MarkdownMessage} from '../design-check/MarkdownMessage';
export function TextAudit({state,client}:{state:any;client:any}){
 const texts=state.texts,checking=state.busy&&state.kind==='texts',result=texts.result;
 const progress=<div className="apollo-overview-total"><AuditMascot checking={checking} quality="unchecked" label={checking?'Проверка текстов выполняется':'Проверка текстов ещё не запускалась'}/><p className="apollo-overview-caption" role="status">{checking?state.progress:'Выбери область и нажми Проверить'}</p></div>;
 if(!result)return <section className="apollo-overview" aria-label="Проверка текстов">{progress}</section>;
 const targets=new Map((texts.capture?.textTargets||[]).map((target:any)=>[target.nodeId,target.focusActionId]));
 return <section className="apollo-results" aria-label="Результат проверки текстов">
  {checking&&progress}<h2>Тексты</h2>{(texts.stale||checking)&&<p className="design-check-note" role="status">Показан предыдущий принятый результат.{checking?' Новая проверка выполняется.':' Повтори проверку текстов.'}</p>}
  <p className="design-check-muted">Проверено видимых текстовых слоёв: {texts.capture?.textReport?.summary?.scannedTextNodes??'не указано'}.</p>
  {result.findings.map((finding:any)=><FindingCard key={finding.id||finding.nodeId+':'+finding.title} title={finding.title||'Замечание к тексту'}
   tone={finding.priority==='error'?'violation':finding.priority==='allowed'?'current':'warning'} location={targets.has(finding.nodeId)?<button type="button" data-finding-focus aria-label="Показать в макете" disabled={texts.stale||state.busy||state.operation?.busy} onClick={()=>void client.focus(texts.runId,targets.get(finding.nodeId))}>{finding.nodeId}</button> : finding.nodeId||'Выбранная область'}
   information={<><p>{finding.observed||finding.message}</p>{finding.ruleId&&<p>{finding.ruleId}</p>}<details><summary>Доказательства и источники</summary><pre>{JSON.stringify(finding.evidence||finding.evidenceItems||[],null,2)}</pre></details></>}>
   <p>{finding.observed||finding.message}</p>{finding.recommendation&&<p>{finding.recommendation}</p>}
  </FindingCard>)}
  {result.responseMarkdown&&<MarkdownMessage text={result.responseMarkdown}/>}
  {!result.findings.length&&!result.responseMarkdown&&<p className="design-check-note">Агент не вернул замечаний. Полнота проверки не подтверждена.</p>}
 </section>;
}
