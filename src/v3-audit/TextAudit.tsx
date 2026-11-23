import React, {useState} from 'react';
import {AuditToast} from '../design-check/AuditToast';
import {FindingCard} from '../design-check/FindingCard';
import {MarkdownMessage} from '../design-check/MarkdownMessage';
import {Button} from '../design-check/v3/ui-app/components/Button';
import {SkillStage} from '../skills/shared/SkillStage';
import {SkillDownloadMenu} from '../skills/shared/SkillDownloadMenu';
import {TextReviewTable} from './TextReviewTable';
import './text-review-table.css';
const icons=require('../skills/layer-names/assets');
const {textTabs,textReviewGroups,textReplacements}=require('./text-review-model');

function TextReviewTabs({groups,active,onSelect}:{groups:any;active:string;onSelect:(id:string)=>void}){
 return <div className="apollo-text-tabs" role="tablist" aria-label="Замечания к текстам">
  {textTabs.map((tab:any)=><button key={tab.id} type="button" role="tab" id={'text-tab-'+tab.id} aria-controls="text-review-panel"
   aria-selected={active===tab.id&&groups[tab.id].length>0} disabled={!groups[tab.id].length} tabIndex={active===tab.id?0:-1}
   onClick={()=>onSelect(tab.id)} onKeyDown={event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const available=textTabs.filter((item:any)=>groups[item.id].length);
    const index=available.findIndex((item:any)=>item.id===active);
    const next=available[event.key==='Home'?0:event.key==='End'?available.length-1:(index+(event.key==='ArrowLeft'?-1:1)+available.length)%available.length];
    if(next){onSelect(next.id);document.getElementById('text-tab-'+next.id)?.focus();}
   }}>{tab.label}{groups[tab.id].length>0&&<> · <span>{groups[tab.id].length}</span></>}</button>)}
 </div>;
}

function TextReviewFooter({checking,stopping,showResults,modelFailed,startDisabled,busy,operationBusy,canApply,onStart,onStop,onApply}:{
 checking:boolean;stopping:boolean;showResults:boolean;modelFailed:boolean;startDisabled:boolean;busy:boolean;operationBusy:boolean;canApply:boolean;
 onStart:()=>void;onStop:()=>void;onApply:()=>void;
}){
 return <footer className="apollo-skill-footer" aria-label="Действия проверки текстов"><div className="apollo-skills-actions">
   {checking?<Button label={stopping?'Останавливаем':'Остановить'} type="secondary" loading disabled={stopping} onPress={onStop}/>
    :showResults?<><Button label="Новая проверка" type="secondary" disabled={startDisabled||busy} onPress={onStart}/>
      <Button label="Применить всё" disabled={busy||!canApply} loading={operationBusy} onPress={onApply}/></>
    :<Button label={modelFailed?'Повторить анализ':'Запустить проверку'} disabled={startDisabled||busy} onPress={onStart}/>}
  </div></footer>;
}

function TextReviewContent({state,client,active,groups,canFocus,focus,canReplace,hasTarget}:{
 state:any;client:any;active:string;groups:any;canFocus:(id:string)=>boolean;focus:(id:string)=>void;canReplace:(id:string)=>boolean;hasTarget:(id:string)=>boolean;
}){
 const texts=state.texts,result=texts.result,busy=state.busy||state.operation?.busy;
 const message=state.error||(state.operation?.status==='error'?state.operation.message:'')||state.agentInput?.error||state.notice;
 return <section className="apollo-text-results" id="text-review-panel" role="tabpanel" aria-labelledby={'text-tab-'+active} tabIndex={0}>
   {texts.stale&&<p className="design-check-note" role="status">Показан предыдущий результат. Повтори проверку текстов перед применением исправлений.</p>}
   {message&&<p className="design-check-note" role={state.error||state.operation?.status==='error'?'alert':'status'}>{message}</p>}
   {result.skillId==='ux-writer-v2'?<TextReviewTable findings={active==='unchecked'?groups.unchecked.map((row:any)=>({nodeId:row.nodeId,priority:'info',category:'Не проверено',message:row.reason,replacement:null,sources:[]})):groups[active]} facts={texts.capture?.textReport?.facts?.texts??[]}
      canFocus={canFocus} focus={focus} drafts={texts.drafts||{}} edit={(id,text)=>client.editText(id,text)}
      applied={texts.applied||{}} canEdit={!busy&&!texts.stale} canReplace={canReplace} replace={id=>void client.replaceTexts([id])}/>
    :<LegacyTextFindings result={Object.assign({},result,{findings:groups[active]})} hasTarget={hasTarget} canFocus={canFocus} focus={focus}/>}
   {!Object.values(groups).some((items:any)=>items.length)&&<p className="design-check-note">Замечаний нет.</p>}
  </section>;
}

export function TextAudit({state,client,onStart,onStop,onClose,startDisabled,scopeName='',notice}:{
 state:any;client:any;onStart:()=>void;onStop:()=>void;onClose:()=>void;startDisabled:boolean;scopeName?:string;notice?:React.ReactNode;
}){
 const [selected,setSelected]=useState('errors');
 const [openedOperation]=useState(state.operation);
 const texts=state.texts,checking=state.busy&&state.kind==='texts',result=texts.result;
 const modelFailed=!checking&&state.kind==='texts'&&state.attempts?.texts?.modelFailed===true;
 const appliedCount=Object.keys(texts.applied||{}).length;
 const successToast=state.operation!==openedOperation&&state.operation?.status==='success'&&!texts.stale&&appliedCount>0&&state.operation.message;
 const groups=textReviewGroups(result,texts.applied),active=groups[selected].length?selected:textTabs.find((tab:any)=>groups[tab.id].length)?.id||'errors';
 const showResults=!!result&&!checking&&!modelFailed,operationBusy=!!state.operation?.busy,busy=state.busy||operationBusy;
 const targets=new Map((texts.capture?.textTargets||[]).map((target:any)=>[target.nodeId,target.focusActionId]));
 const canFocus=(id:string)=>targets.has(id)&&!busy;
 const focus=(id:string)=>void client.focus(texts.runId,targets.get(id));
 const eligible=textReplacements(texts),eligibleTargets=new Set(eligible.map((row:any)=>row.focusActionId));
 const canReplace=(id:string)=>showResults&&!busy&&eligibleTargets.has(targets.get(id));
 const message=state.error||state.operation?.message||state.agentInput?.error||state.notice;
 return <>
  <header className={'apollo-skill-header apollo-text-header'+(showResults?' has-tabs':'')}>
   <h2 id="apollo-text-tool-title">Проверка текстов</h2>
   <button className="apollo-skill-close" type="button" aria-label="Закрыть проверку текстов" onClick={onClose}><img src={icons.close} alt="" /></button>
   {showResults&&<TextReviewTabs groups={groups} active={active} onSelect={setSelected}/>}
  </header>
  {notice}
  {checking&&<p className="design-check-sr-only" role="status">{state.progress}</p>}
  {showResults?<TextReviewContent state={state} client={client} active={active} groups={groups} canFocus={canFocus} focus={focus}
   canReplace={canReplace} hasTarget={id=>targets.has(id)}/>:<div className="apollo-text-stage" aria-busy={checking}>
   <SkillStage idle={!checking} message={checking?state.progress||'Проверяем тексты…':<>Проверю орфографию, типографику<br/> и соответствие текстов правилам Альфа-Бизнеса</>}
    description={<p className="apollo-skill-scope-name" title={scopeName||undefined} role="status">{scopeName||(checking?'Выбранная область':'Выбери область и запусти проверку')}</p>} announce={!checking} />
   {message&&!checking&&<p className="apollo-text-stage-message" role={state.error?'alert':'status'}>{message}</p>}
  </div>}
  <TextReviewFooter checking={checking} stopping={!!state.stopping} showResults={showResults} modelFailed={modelFailed} startDisabled={startDisabled} busy={busy}
   operationBusy={operationBusy} canApply={eligible.length>0} onStart={onStart} onStop={onStop} onApply={()=>void client.replaceTexts()}/>
  <SkillDownloadMenu canReport={checking||!!texts.result||!!state.attempts?.texts} canInput={!!state.agentInput?.available}
   inputLoading={!!state.agentInput?.loading} onReport={()=>client.download('texts')} onInput={()=>void client.downloadAgentInput()}/>
  {showResults&&successToast&&<div className="apollo-text-toast"><AuditToast inline key={texts.runId+':'+appliedCount} message={successToast}/></div>}
 </>;
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
