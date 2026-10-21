// Display/navigation sidecar. Canonical evaluations and hashes stay unchanged.
function contractFocusTargets({components,captures,pageId,auditId,hash,dependencyMap}){
 const rows=[],registry=new Map();
 for(let i=0;i<components.length;i++){
  const component=components[i],capture=captures[i],anatomy=new Map(capture.captured.anatomy.filter(n=>n.figmaNodeId).map(n=>[n.id,n]));
  for(const entry of component.result.engine.evaluations){
   const findingId=hash([component.scopeId,entry.evaluationId]),targets=[],gaps=[];
   function add(id,reason){const n=anatomy.get(id);if(!n){gaps.push('captured-node-identity-unavailable');return;}if(targets.some(t=>t.nodeId===n.figmaNodeId))return;if(targets.length>=1000){gaps.push('focus-target-limit');return;}const t={id:hash([findingId,n.figmaNodeId]),nodeId:n.figmaNodeId,pageId,name:String(n.name||'Объект').slice(0,500),reason};targets.push(t);registry.set(t.id,{findingId,target:t});}
   add(entry.focusNodeId||entry.subjectNodeId,'evaluation-focus');
   const violations=entry.collection?.violations||[];
   const mapped=entry.dependency?dependencyMap(entry,capture):null;
   for(const v of violations)if(typeof v.nodeId==='string'){
    if(!entry.dependency)add(v.nodeId,'collection-violation');
    else if(mapped&&mapped[v.nodeId])add(mapped[v.nodeId],'collection-violation');
    else gaps.push('dependency-occurrence-map-unavailable');
   }
   rows.push({findingId,targets,gaps:Array.from(new Set(gaps))});
  }
 }
 return{sidecar:{schemaVersion:'apollo.audit-focus-targets.v1',runId:auditId,findings:rows},registry};
}
module.exports={contractFocusTargets};
