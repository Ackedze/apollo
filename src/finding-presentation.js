// Read captured evidence for display only; never evaluate rules or change their outcomes.
const {buildFindingDetails}=require("./finding-details");
const scalar=v=>typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v);
const unknown=(node,path)=>(node.unknownFacts || []).some(p=>p===path||path.startsWith(p+'.'));
const propertyLabel=name=>({View:'Вью',Size:'Размер'})[name] || name;
function comparison(path,property,expected,actual) {
 return {factPath:path,property,predicate:'captured-comparison',unit:'',expected,actual,
  expectedLabel:'Эталон компонента',actualLabel:'В макете',note:'',context:'',truth:false,negative:false};
}
function collectionDetails(evaluation,rule,snapshot) {
 const c=evaluation.collection,spec=rule.displayContext?.collection;
 if(!spec||rule.displayContext?.collectionId!==c.id)return [];
 const details=[];
 for(const violation of c.violations || []) {
  const name=violation.property || (violation.reason==='member-position'?spec.filter?.property:null);
  if(!name)continue;
  const nodes=snapshot.nodes.filter(n=>n.id===violation.nodeId),node=nodes.length===1?nodes[0]:null;
  const path='component.properties.'+name,baseline=node?.baseline;
  const before=baseline?.effective?.component,after=node?.component;
  if(!node||!c.memberNodeIds?.includes(node.id)||!spec.memberTargetRoles?.includes(violation.memberRole)||node.baselineProvenance?.status!=='matched'||node.baselineProvenance.kind!=='independent-host-variant'
   ||!baseline?.effective||unknown(node,path)||unknown(baseline.effective,path)||!before?.propertyTypes?.[name]
   ||before.propertyTypes[name]!==after?.propertyTypes?.[name]||!['VARIANT','BOOLEAN'].includes(before.propertyTypes[name]))continue;
  const expected=before.properties?.[name],actual=after.properties?.[name];
  if(!scalar(expected)||!scalar(actual)||typeof expected!==typeof actual||expected===actual)continue;
  if(Object.prototype.hasOwnProperty.call(violation,'actual')&&violation.actual!==actual)continue;
  const row=comparison(path,propertyLabel(name),expected,actual);
  if(!details.some(d=>d.factPath===path&&d.expected===expected&&d.actual===actual))details.push(row);
 }
 return details;
}
function iconDetails(evaluation,rule,snapshot) {
 const binding=rule.displayContext?.identityBinding,trace=evaluation.trace;
 if(!binding||trace?.actual!==true||trace.factPaths?.[0]!==`dependencies.${binding.id}.changed`
  ||snapshot.variantReference?.complete!==true||snapshot.source?.truncated!==false)return [];
 const boundaries=(snapshot.instanceBoundaries || []).filter(b=>b.ownerPath===binding.ownerPath&&b.reason==='instance-swap'
  &&binding.portNames.includes(b.property?.replace(/#[^#]+$/,'')));
 if(boundaries.length!==1)return [];
 const b=boundaries[0],nodes=snapshot.nodes.filter(n=>n.id===b.nodeId),node=nodes.length===1?nodes[0]:null;
 const expected=snapshot.variantReference.nodeProperties?.[b.referencePath];
 const results=(snapshot.instanceContentResults || []).filter(r=>r.boundaryNodeId===b.nodeId);
 if(!node||results.length!==1||results[0].lineageProven!==true||results[0].status!=='matched'
  ||unknown(node,'component.identity.componentKey')||unknown(node,'component.propertyReferenceBindings.mainComponent')
  ||node.component?.identity?.componentKey!==b.actualComponentKey||expected?.identity?.componentKey!==b.referenceComponentKey
  ||!b.actualComponentKey||!b.referenceComponentKey||b.actualComponentKey===b.referenceComponentKey
  ||node.component.propertyReferenceBindings?.mainComponent!==b.property||expected.propertyReferenceBindings?.mainComponent!==b.property
  ||typeof node.name!=='string'||!node.name.trim()||typeof expected.diagnosticName!=='string'||!expected.diagnosticName.trim())return [];
 return [comparison(trace.factPaths[0],'Иконка',expected.diagnosticName,node.name)];
}
function findingPresentation(report,rules) {
 const projection={},components=new Map((report.components || []).map(c=>[c.scopeId,c]));
 const byRule=new Map(rules.map(r=>[`${r.componentScopeId || ''}:${r.ruleId}`,r]));
 for(const e of report.result.engine.evaluations) {
  if(e.classification!=='violation')continue;
  const snapshot=components.get(e.componentScopeId)?.snapshot,rule=byRule.get(`${e.componentScopeId || ''}:${e.ruleId}`);
  if(!snapshot?.nodes||!rule)continue;
  if(e.collection)projection[e.evaluationId]=collectionDetails(e,rule,snapshot);
  else if(/^dependencies\.[^.]+\.changed$/.test(e.trace?.factPaths?.[0] || ''))projection[e.evaluationId]=iconDetails(e,rule,snapshot);
 }
 return projection;
}
function compactFindingDetails(evaluation,rule,projection) {
 if(Object.prototype.hasOwnProperty.call(projection || {},evaluation.evaluationId))return projection[evaluation.evaluationId];
 // Older summaries may lack the sidecar. Keep technical counters/booleans in rule details only.
 return buildFindingDetails(evaluation,rule).filter(d=>evaluation.classification!=='violation'||!evaluation.collection&&!/^dependencies\.[^.]+\.changed$/.test(d.factPath));
}
module.exports={findingPresentation,compactFindingDetails};
