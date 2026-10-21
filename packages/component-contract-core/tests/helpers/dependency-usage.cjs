// Neutral synthetic parent/child sources; no copied component packages or native reports.
const {fixture,clone}=require('./declared-target.cjs');
function scenario(core=require('../../dist/core.cjs')){
 const f=fixture(core), childManual=clone(f.manual), child=clone(f.snapshot);
 child.source.captureTopology.issues=[];
 childManual.component.componentId='synthetic.child';childManual.component.familyId='synthetic.child';childManual.component.contractId='synthetic.child';
 childManual.metadata.revision=1;childManual.metadata.declaredTargetIdentityVersion=3;childManual.metadata.declaredTargetConfigurationVersion=1;
 childManual.targets[1].id='label';childManual.targets[1].semanticRole='label';
 child.nodes[0].component.properties={Size:'S',Label:'Label',RightAddon:true};
 child.nodes[0].component.propertyTypes={Size:'VARIANT',Label:'TEXT',RightAddon:'BOOLEAN'};
 child.nodes[0].component.definedProperties=['Size','Label','RightAddon'];
 child.nodes[0].layout={mode:'HORIZONTAL',itemSpacing:8,sizingHorizontal:'HUG',sizingVertical:'HUG'};
 child.nodes[2].component.propertyReferenceBindings={characters:'Label'};
 child.nodes[2].component.propertyReferences=['Label'];
 child.nodes[2].bounds={width:80,height:20};child.nodes[2].appearance={opacity:1};
 child.nodes[2].text={characters:'Label',fontName:{family:'Synthetic',style:'Regular'},fontSize:16,
  lineHeight:{unit:'PIXELS',value:20},letterSpacing:{unit:'PIXELS',value:0},textAutoResize:'WIDTH_AND_HEIGHT',textTruncation:'DISABLED',paragraphSpacing:0,maxHeight:null};
 for(const n of child.nodes)n.resolvedModes={};
 const rule=clone(childManual.rules[0]);rule.constraints=[{type:'quantity',targetRoles:['label'],min:1,max:1,visibleOnly:true}];
 childManual.rules=[rule,...['Label','RightAddon'].map(p=>({...clone(rule),id:'allow-'+p,targetId:'root',capability:'component.properties.'+p,permission:'allowed',
  constraints:[],controlPaths:[{kind:'host-property',property:p,required:true,exclusive:true}],execution:{route:'policy-only'}}))];
 child.variantReference=core.captureVariantReference(child,'synthetic-variant','synthetic-set',['Size','Label','RightAddon']);
 for(const t of childManual.targets)for(const b of t.identityBindingsV1){
  b.referenceHash=core.stableHash(child.variantReference);b.portableReferenceHash=core.portableDeclaredTargetReferenceHash(child.variantReference);
  b.configurationReferenceHash=core.configurationDeclaredTargetReferenceHash(child.variantReference);
 }
 const childShape=child.variantReference.nodes,childStructure=core.stableHash(childShape);
 const childEvidence={schemaVersion:'apollo.variant-anatomy.v1',sourceHash:'a'.repeat(64),structures:{[childStructure]:childShape},
  variants:[{componentKey:'synthetic-variant',componentSetKey:'synthetic-set',structureId:childStructure,properties:{Size:'S'}}]};
 const compiledChild=core.compileManualSource(childManual,childEvidence);
 if(compiledChild.issues.some(i=>i.level==='error'))throw Error(JSON.stringify(compiledChild.issues));
 const childContract=compiledChild.contract;
 const parentManual=clone(f.manual);parentManual.component.componentId='synthetic.parent';parentManual.component.familyId='synthetic.parent';
 parentManual.component.contractId='synthetic.parent';parentManual.component.componentKey='parent-set';parentManual.metadata.revision=1;
 parentManual.metadata.declaredTargetIdentityVersion=3;parentManual.representations[0].locator={componentSetKey:'parent-set'};
 const node=(id,parentId,name,type,identity,sourceIdentity)=>({id,parentId,name,type,visible:true,order:0,childIds:[],unknownFacts:[],resolvedModes:{},
  semantic:{role:id==='parent'?'root':id==='bottom'?'bottom':'',path:'Parent / '+name},component:{properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{},...(identity?{identity}:{}),...(sourceIdentity?{sourceIdentity}:{} )}});
 const root=node('parent',null,'Parent','INSTANCE',{componentKey:'parent-variant',componentSetKey:'parent-set',mainComponentId:'parent-main'});
 const bottom=node('bottom','parent','Bottom','INSTANCE',{componentKey:'bottom-link',componentSetKey:'bottom-set',mainComponentId:'bottom-main'},
  {version:1,sourceNodeId:'bottom-source',ownerComponentKey:'parent-variant',ownerMainComponentId:'parent-main'});
 bottom.component.properties={Presets:'Link'};bottom.component.propertyTypes={Presets:'VARIANT'};root.childIds=['bottom'];
 const nodeMap=Object.fromEntries(child.nodes.map(n=>[n.id,'child/'+n.id]));bottom.childIds=[nodeMap[child.selection[0]]];
 const hostChild=child.nodes.map(n=>{const h=clone(n);h.id=nodeMap[n.id];h.parentId=n.parentId===null?bottom.id:nodeMap[n.parentId];h.childIds=n.childIds.map(id=>nodeMap[id]);return h;});
 hostChild[0].component.sourceIdentity={version:1,sourceNodeId:'link-source',ownerComponentKey:'bottom-link',ownerMainComponentId:'bottom-main'};
 const parent={schemaVersion:'apollo.predicate-snapshot.v2',generatedAt:'synthetic',selection:['parent'],nodes:[root,bottom,...hostChild],context:{platform:'desktop',modes:{},unknownFacts:[]},
  source:{componentKey:'parent-variant',componentSetKey:'parent-set',rootNodeId:'parent-actual',instanceIdentityVersion:1,instanceSourceIdentityVersion:1,occurrenceAddressVersion:1,truncated:false,captureTopology:{version:1,complete:true,issues:[]}}};
 const ownerReference=clone(parent);ownerReference.source.rootNodeId='parent-selected-independent';
 const base=clone(parent);base.source.rootNodeId='parent-original-independent';
 base.nodes=base.nodes.filter(n=>!n.id.startsWith('child/'));base.nodes[1].component.identity.componentKey='bottom-placeholder';base.nodes[1].component.identity.mainComponentId='placeholder-main';
 base.nodes[1].component.properties.Presets='SwapMe';base.nodes[1].childIds=[];
 parent.variantReference=core.captureVariantReference(base,'parent-variant','parent-set');
 parent.instanceContentReferences={schemaVersion:'apollo.instance-content-references.v4',base,attempts:[{boundaryNodeId:'bottom',strategy:'pristine-host-variant-properties',reference:ownerReference}]};
 const parentShape=parent.variantReference.nodes,structureId=core.stableHash(parentShape);
 const evidence={schemaVersion:'apollo.variant-anatomy.v1',sourceHash:'b'.repeat(64),structures:{[structureId]:parentShape},
  variants:[{componentKey:'parent-variant',componentSetKey:'parent-set',structureId,properties:{}}]};
 parentManual.targets=[{id:'root',semanticRole:'root',label:'Parent',pathHint:'Parent',lineage:[],resolution:'resolved'},
  {id:'bottom',semanticRole:'bottom',label:'Bottom',pathHint:'Parent / Bottom',lineage:[],resolution:'resolved'}];
 for(const t of parentManual.targets){const p=t.id==='root'?'':'Bottom';t.identityBindingsV1=[{representationId:'desktop',componentKey:'parent-variant',componentSetKey:'parent-set',
  referenceHash:core.stableHash(parent.variantReference),portableReferenceHash:core.portableDeclaredTargetReferenceHash(parent.variantReference),referencePath:p,nodeType:'INSTANCE',
  ...(p?{nativeSource:{sourceNodeId:'bottom-source',ownerComponentKey:'parent-variant',ownerMainComponentId:'parent-main'}}:{})}];}
 parentManual.componentDependencies=[{id:'child',componentId:'synthetic.child',revision:1,manualSourceHash:childContract.package.manualSourceHash,compiledHash:core.stableHash(childContract),
  bindings:[{id:'bottom-child',targetRole:'bottom',relativePath:'',ownerComponentSetKeys:['bottom-set'],activeVariant:{property:'Presets',values:['Link']},childPath:'Card'}]}];
 parentManual.editorDependencyUsages={version:1,bindings:[{id:'bottom-link',dependencyId:'child',bindingId:'bottom-child',childTargetId:'label',textProperty:'Label'}]};
 const rules=[['configuration',{type:'propertyDomain',fact:'editorDependencyUsageV1.bottom-link.nonTextChanged',values:[false]}],
  ['characters',{type:'layoutConstraint',fact:'editorDependencyUsageV1.bottom-link.characterCount',min:0,max:32}],
  ['lines',{type:'layoutConstraint',fact:'editorDependencyUsageV1.bottom-link.lineCount',min:0,max:1}]];
 parentManual.rules=rules.map(([id,constraint])=>({...clone(f.manual.rules[0]),id:'usage-'+id,targetId:'root',targetScope:'self',permission:'constrained',
  capability:'component.configuration',constraints:[constraint],applicability:{variants:'all',modes:'all',platforms:['desktop'],scopeStatus:'confirmed',activeDependency:'child'},rationale:'Synthetic parent usage '+id}));
 const updateChildCapture=()=>{
  const c=clone(child);c.source.rootNodeId='child-actual';
  for(const n of c.nodes){const h=parent.nodes.find(h=>h.id===nodeMap[n.id]);if(h)for(const key of ['component','layout','appearance','text','bounds','visible'])if(h[key]!==undefined)n[key]=clone(h[key]);}
  delete c.nodes[0].component.sourceIdentity;
  const pristine=clone(child);pristine.source.rootNodeId='child-configured-independent';
  pristine.nodes[0].component.properties.Label=c.nodes[0].component.properties.Label;
  pristine.nodes[0].component.properties.RightAddon=c.nodes[0].component.properties.RightAddon;
  pristine.nodes[2].text.characters=c.nodes[2].text.characters;
  pristine.nodes[2].bounds.height=c.nodes[2].bounds.height;
  c.variantReference=core.captureVariantReference(pristine,'synthetic-variant','synthetic-set',['Size','Label','RightAddon']);
  c.instanceContentReferences={schemaVersion:'apollo.instance-content-references.v4',base:pristine,attempts:[]};
  c.nodes=core.materializeEffectiveBaseline(c,pristine,true).snapshot.nodes;
  parent.componentDependencyCaptures=[{nodeId:nodeMap[child.selection[0]],nodeMap:clone(nodeMap),snapshot:c}];
 };
 updateChildCapture();
 const run=()=>{const compiled=core.compileManualSource(parentManual,evidence,[childContract]);
  if(compiled.issues.some(i=>i.level==='error'))throw Error(JSON.stringify(compiled.issues));
  const contract=core.prepareAuthoringPreviewContract(compiled.contract),engine=core.evaluateCompiledContract(parent,contract);
  return {compiled,contract,engine,prepared:core.prepareValidationSnapshot(parent,contract)};};
 return {manual:parentManual,parent,childContract,evidence,nodeMap,ownerReference,base,updateChildCapture,run,core};
}
module.exports={scenario,clone};
