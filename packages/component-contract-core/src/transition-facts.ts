import type {CompiledContract,PreviewSnapshot} from './types';
import {stableHash} from './stable';
import {snapshotPaths} from './snapshot-topology';

const record=(v:unknown):Record<string,any>=>v&&typeof v==='object'?v as Record<string,any>:{};
function fact(node:Record<string,any>,path:string):unknown {
  if((node.unknownFacts||[]).some((p:string)=>p===path||path.startsWith(p+'.')))return undefined;
  return path.split('.').reduce((v:any,k)=>v?.[k],node);
}
const root=(s:PreviewSnapshot)=>s.selection.length===1?s.nodes.find(n=>n.id===s.selection[0]):undefined;
const same=(a:unknown,b:unknown)=>a!==undefined&&b!==undefined&&stableHash(a)===stableHash(b);

/** Recompute from two bounded raw captures, never trust exported temporal results. */
export function materializeTransitionFacts(snapshot:PreviewSnapshot,contract:CompiledContract,prepareBefore:(s:PreviewSnapshot)=>PreviewSnapshot):void {
  if(contract.runtimePolicy.transitionFactsVersion!==1)return;
  const after=root(snapshot),sourceBefore=snapshot.transitionBefore;
  const before=sourceBefore&&!sourceBefore.transitionBefore&&sourceBefore.nodes.length<=500?prepareBefore(sourceBefore):undefined;
  const prior=before&&root(before),results:Record<string,unknown>={};
  for(const binding of contract.facts.transitions||[]) {
    const t=binding.transition,result:Record<string,unknown>={reason:'before-not-captured'};results[binding.id]=result;
    const currentState=after&&fact(after,`dependencyCompositionV1.${t.dependencyId}.active`);
    if(typeof currentState==='boolean'&&currentState!==t.to){Object.assign(result,{applicable:false,reason:'after-state-not-applicable'});continue;}
    if(typeof currentState!=='boolean'){result.reason='after-state-unknown';continue;}
    result.applicable=true;
    if(!before||!prior||!after)continue;
    const a=snapshot.transitionCapture,b=before.transitionCapture;
    let reason='';
    if(!a||!b||a.schemaVersion!=='apollo.transition-capture.v1'||b.schemaVersion!==a.schemaVersion||!a.complete||!b.complete)reason=a?.reason||b?.reason||'capture-context-incomplete';
    else if(!a.sessionId||a.sessionId!==b.sessionId||!Number.isInteger(a.sequence)||!Number.isInteger(b.sequence)||a.sequence<=b.sequence)reason='capture-order-or-session-mismatch';
    else if(a.manualSourceHash!==contract.package.manualSourceHash||b.manualSourceHash!==a.manualSourceHash)reason='manual-source-changed';
    else if(!snapshotPaths(snapshot)||!snapshotPaths(before))reason='topology-incomplete';
    else if(!snapshot.source?.rootNodeId||!same(snapshot.source.rootNodeId,before.source?.rootNodeId)||!same(snapshot.source.pageId,before.source?.pageId)
      ||!same(snapshot.source.componentSetKey,before.source?.componentSetKey)||!same(snapshot.source.componentKey,before.source?.componentKey)
      ||!same(snapshot.source.representationId,before.source?.representationId))reason='instance-or-variant-changed';
    else if(!same(snapshot.context,before.context)||snapshot.context.unknownFacts.length)reason='scenario-context-changed';
    else if(!a.externalContext||!Object.keys(a.externalContext).length||!same(a.externalContext,b.externalContext))reason='external-context-changed';
    else if(fact(prior,`dependencyCompositionV1.${t.dependencyId}.active`)!==t.from)reason='before-state-not-proven';
    else if(t.invariantFacts.some(path=>!same(fact(prior,path),fact(after,path))))reason='invariant-changed-or-unknown';
    else if([before,snapshot].some(s=>{const n=root(s)!;return !same(fact(n,'component.identity.componentKey'),s.source?.componentKey)||!same(fact(n,'component.identity.componentSetKey'),s.source?.componentSetKey);}))reason='root-identity-unproven';
    const old=fact(prior,binding.fact),now=fact(after,binding.fact);
    if(!reason&&[old,now].some(v=>typeof v!=='number'||!Number.isFinite(v)||v<=0))reason='dimension-unknown';
    if(reason){result.reason=reason;continue;}
    Object.assign(result,{reason:'paired',before:old,after:now});
  }
  for(const n of snapshot.nodes){n.transitionsV1=results;n.unknownFacts=((n.unknownFacts||[])as string[]).filter(p=>p!=='transitionsV1'&&!p.startsWith('transitionsV1.'));}
}

export function transitionReason(reason:string):string {
  const labels:Record<string,string>={
    'before-not-captured':'Сначала запомните состояние до перехода у этого же instance.',
    'after-state-unknown':'Не подтверждено состояние зависимости после перехода.',
    'capture-context-incomplete':'Нет полного снимка внешних условий пары.',
    'capture-order-or-session-mismatch':'Снимки должны быть получены последовательно в одной сессии плагина.',
    'manual-source-changed':'После первого снимка изменён контракт. Запомните состояние до заново.',
    'topology-incomplete':'Структура одного из снимков неполна или неоднозначна.',
    'instance-or-variant-changed':'Выбран другой экземпляр или вариант компонента.',
    'scenario-context-changed':'Изменились Product, platform или modes.',
    'external-context-changed':'Изменились внешние условия layout или положение в иерархии.',
    'before-state-not-proven':'Не подтверждено исходное состояние зависимости.',
    'invariant-changed-or-unknown':'Изменилось одно из неизменяемых свойств либо его значение неизвестно.',
    'root-identity-unproven':'Ключи экземпляра не подтверждены.',
    'dimension-unknown':'Размер одного из состояний неизвестен.',
    'changed-during-capture':'Компонент или его окружение изменились во время снимка.',
  };
  return labels[reason]||reason;
}
