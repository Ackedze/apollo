// Private native observations are the authority for impact; UI identifiers never are.
function below(node,ancestor){const seen=new Set();for(let n=node;n&&!seen.has(n.id);n=n.parent){if(n.id===ancestor)return true;seen.add(n.id);}return false;}
function minimalRoots(nodes){const unique=Array.from(new Map(nodes.filter(n=>n&&!n.removed).map(n=>[n.id,n])).values());return unique.filter(n=>!unique.some(other=>other!==n&&below(n,other.id)));}
function impact(observation,action,context){
 const ids=new Set(),roots=[],unknown=new Set();
 if(['update','bind-variable','bind-style'].includes(action.kind)){
  // Frozen ancestry survives a swap that removes or replaces nested native IDs.
  const parents=new Map(observation.facts.filter(f=>f.kind==='node').map(f=>[f.id,f.value.parent]));
  for(const m of observation.modeGraph?.values()||[])for(let i=0;i<m.chain.length-1;i++)if(!parents.has(m.chain[i].id))parents.set(m.chain[i].id,m.chain[i+1].id);
  const observedBelow=(id,ancestor)=>{const seen=new Set();while(id&&!seen.has(id)){if(id===ancestor)return true;seen.add(id);id=parents.get(id);}return false;};
  const target=observation.nodes.get(action.nodeId);if(target)roots.push(target);
  // Layout changes can affect originally observed peers. An outside ancestor is
  // a boundary, not permission to audit its entire previously unobserved subtree.
  for(let parent=target?.parent;parent&&parent.type!=='PAGE'&&parent.type!=='DOCUMENT';parent=parent.parent)if(['HORIZONTAL','VERTICAL'].includes(parent.layoutMode)){
   for(const [id,n]of observation.nodes)if(id!==context.pageId&&!n.removed&&observedBelow(id,parent.id))roots.push(n);
  }
  // Shared local-definition findings carry proven occurrence owners.
  for(const c of observation.checks)for(const f of c.findings)if(f.evidence.sourceNodeId===action.nodeId||f.owner?.id===action.nodeId){
   if(f.owner)ids.add(f.owner.id);for(const id of f.occurrences){ids.add(id);roots.push(observation.nodes.get(id));}
  }
  const observedRoots=minimalRoots(roots);for(const id of observation.nodes.keys())if(observedRoots.some(root=>observedBelow(id,root.id)))ids.add(id);
 }else{
  const aliases=new Set([action.collectionId]);
  for(const fact of observation.facts)if(fact.kind==='collection'&&fact.value?.remote===true&&fact.value.key===action.collectionKey)aliases.add(fact.id);
  for(const [id,m] of observation.modeGraph||[]){
   if(!m.complete){ids.add(id);unknown.add(id);continue;}
   if(m.resolved.some(key=>aliases.has(key))&&!m.overridden.some(key=>aliases.has(key)))ids.add(id);
  }
  for(const id of ids){const n=observation.nodes.get(id);if(n&&below(n,context.pageId)&&n.type!=='PAGE')roots.push(n);}
 }
 const result={ids,roots:minimalRoots(roots),unknown,action};
 // New descendants belong to the same mutation scope even when Figma changes IDs.
 result.includeCurrent=()=>{const stack=result.roots.slice();while(stack.length){const n=stack.pop();if(!n||n.removed)continue;ids.add(n.id);if('children'in n)stack.push(...n.children);}};
 result.includeCurrent();return result;
}
function stableFinding(check,f){return JSON.stringify([check.id,f.owner?.id||null,f.evidence.sourceNodeId||null,['theme','font'].includes(check.id)?'page':f.owner?'owner':f.occurrences.slice().sort(),f.evidence.property||null,f.componentKey||null]);}
function touches(check,f,plan){return ['theme','font'].includes(check.id)||plan.ids.has(f.owner?.id)||plan.ids.has(f.evidence.sourceNodeId)||f.occurrences.some(id=>plan.ids.has(id))||f.targets.some(t=>plan.ids.has(t.nodeId));}
function mergeObservation(old,fresh,plan){
 const stale=new Set(),checks=old.checks.map(previous=>{
  if(plan.ids.size===0&&!['theme','font'].includes(previous.id))return Object.assign({},previous);
  const next=fresh.checks.find(c=>c.id===previous.id),unsafe=next.status==='running'||next.gaps.some(g=>g!=='v3-catalog-policy-not-connected');
  // A clean different collection does not prove the previous Font repair.
  if(previous.id==='font'&&unsafe&&!next.findings.some(f=>f.status==='font-mismatch')&&previous.findings.some(f=>f.status==='font-mismatch'&&!next.findings.some(n=>n.status==='font-current'&&n.evidence.verifiedCollections?.includes(f.evidence.collectionIdentity)))){
   for(const f of previous.findings)stale.add(f.findingId);
   return Object.assign({},previous,{status:'incomplete',gaps:Array.from(new Set([...(previous.gaps||[]),...next.gaps]))});
  }
  const kept=[];for(const f of previous.findings){
   // A gap in another property must not retain this freshly confirmed repair.
   const resolved=previous.id==='customStyles'&&next.status!=='running'&&f.occurrences.length>0&&f.occurrences.every(id=>fresh.resolvedStyles?.get(id)?.has(f.evidence.property));
   if(!touches(previous,f,plan)||unsafe&&!resolved){kept.push(f);if(unsafe&&touches(previous,f,plan))stale.add(f.findingId);continue;}
   if(f.owner&&!plan.ids.has(f.owner.id)&&!plan.ids.has(f.evidence.sourceNodeId)){
    const occurrences=f.occurrences.filter(id=>!plan.ids.has(id));if(occurrences.length)kept.push(Object.assign({},f,{occurrences,targets:f.targets.filter(t=>t.kind==='owner'||occurrences.includes(t.nodeId))}));
   }
  }
  const map=new Map(kept.map(f=>[stableFinding(previous,f),f]));
  for(const f of next.findings){const key=stableFinding(next,f);if(!map.has(key)||!unsafe||f.status!=='unknown'){
   const retained=map.get(key);if(retained?.owner&&f.owner&&retained.status===f.status){map.set(key,Object.assign({},f,{occurrences:Array.from(new Set([...retained.occurrences,...f.occurrences])),targets:Array.from(new Map([...retained.targets,...f.targets].map(t=>[t.id,t])).values())}));}else map.set(key,f);
  }}
  const gaps=Array.from(new Set([...(previous.gaps||[]),...next.gaps]));
  // A partial original observation remains partial; scoped success cannot erase its gaps.
  return Object.assign({},previous,{findings:Array.from(map.values()),gaps,status:previous.status==='incomplete'||next.status==='incomplete'?'incomplete':next.status});
 });
 const units=new Map();for(const c of checks){const ids=new Set(old.units?.get(c.id)||[]);for(const id of plan.ids)ids.delete(id);if(['theme','font'].includes(c.id))ids.clear();if(plan.ids.size||['theme','font'].includes(c.id))for(const id of fresh.units?.get(c.id)||[])ids.add(id);units.set(c.id,ids);c.checked=ids.size;}
 const nodes=new Map(old.nodes);for(const id of plan.ids)nodes.delete(id);for(const [id,node]of fresh.nodes)nodes.set(id,node);
 const facts=new Map(old.facts.filter(f=>!plan.ids.has(f.id)&&!(plan.action.kind==='theme'&&f.kind==='pageModes')).map(f=>[f.kind+':'+f.id,f]));for(const f of fresh.facts)facts.set(f.kind+':'+f.id,f);
 const targets=new Map();for(const c of checks)for(const f of c.findings)for(const t of f.targets)targets.set(t.id,t);
 const modeGraph=new Map(old.modeGraph||[]);for(const id of plan.ids)modeGraph.delete(id);for(const [id,m]of fresh.modeGraph||[])modeGraph.set(id,m);
 const resolvedStyles=new Map(old.resolvedStyles||[]);for(const id of plan.ids)resolvedStyles.delete(id);for(const [id,properties]of fresh.resolvedStyles||[])resolvedStyles.set(id,properties);
 return{checks,facts:Array.from(facts.values()),targets,nodes,units,modeGraph,resolvedStyles,staleFindingIds:Array.from(stale)};
}
module.exports={below,minimalRoots,impact,touches,mergeObservation};
