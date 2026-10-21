const {resourceKey}=require("../resource-identity");
// V3's unique expected token candidate, from existing V4 paint traces and captured native identities.
function findReferenceCandidate(data,nodeId,property){
 const field=property==='fills'?'fill':property==='strokes'?'stroke':null;if(!field||!data)return null;
 const candidates=new Map();
 for(const component of data.audit.components){
  if(data.staleScopeIds?.includes(component.scopeId))continue;
  const capture=data.captures.find(c=>c.subject.id===component.scopeId);if(!capture)continue;
  const anatomy=new Map(capture.captured.anatomy.map(n=>[n.id,n.figmaNodeId]));
  for(const e of component.result.engine.evaluations){
   if(e.applicability!=='applicable'||anatomy.get(e.subjectNodeId)!==nodeId||!e.trace?.factPaths?.includes('appearance.'+field))continue;
   const actual=e.trace.actual;if(!Array.isArray(actual)||!actual.length||actual.some(p=>!p||p.type!=='SOLID'||p.tokenId||p.boundVariables))continue;
   const paints=Array.isArray(e.trace.expected)?e.trace.expected.flat():[];
   for(const p of paints){const key=p?.type==='SOLID'?resourceKey('token',p.tokenId):null;if(key)candidates.set(key,{key,name:p.displayName||key,library:p.collectionName||null});}
  }
 }
 return candidates.size===1?candidates.values().next().value:null;
}
module.exports={findReferenceCandidate};
