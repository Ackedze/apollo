// Synthetic dependency fixture shared with Editor tests; no private data.
const core=require('../../dist/core.cjs'),template=require('./asset-identity-lock.cjs').fixture(core).manual;
const clone=x=>JSON.parse(JSON.stringify(x));

function manual(id,key,revision,platform='desktop'){
 const m=clone(template);Object.assign(m.component,{componentId:id,contractId:id,componentKey:key,family:id,platform});
 m.metadata.revision=revision;m.semanticApi=[];m.controlPorts=[];m.componentDependencies=[];m.examples=[];m.generation.profiles=[];
 m.semantics={purpose:'Synthetic direct dependency regression.',useWhen:[],doNotUseWhen:[],relatedComponentIds:[],keywords:[]};
 m.documentation=[];m.decisions=[];m.generation.instructions=[];m.source.importedFiles=['synthetic.json'];
 m.representations=[{id:'desktop',kind:'figma',platform,status:'verified',locator:{componentKey:key}}];
 m.targets=[{id:'root',semanticRole:'root',label:'Root',pathHint:'Group',lineage:[],resolution:'resolved'}];
 m.rules=[{...clone(template.rules[0]),id:id+'-opacity',targetId:'root',capability:'appearance.opacity',targetScope:'self',permission:'constrained',
  controlPaths:[],constraints:[{type:'propertyDomain',values:[1]}],status:'reviewed',execution:{route:'predicate'},sourceRefs:[],
  rationale:'Synthetic direct dependency regression.',message:'Synthetic child opacity must equal 1.',applicability:{variants:'all',modes:'all',platforms:[platform]}}];
 return m;
}

function scenario(count=4){
 const childManual=manual('fixture.button','button-set',7),candidates=[{componentKey:'button-set',figma:{defaultVariantKey:'secondary',
  structureSignature:[{nodeId:1,parentId:null,name:'Button',type:'COMPONENT'}],variants:{variantKeys:[
   {key:'secondary',properties:{View:'Secondary'}},{key:'primary',properties:{View:'Primary'}}]},variantStructures:{primary:[]}}}];
 const childEvidence=core.extractVariantEvidence(candidates),childContract=core.compileManualSource(childManual,childEvidence).contract;
 const m=manual('fixture.group','group-set',1),nodes=[];
 const node=(id,parentId,name,identity,properties={})=>({id,parentId,name,type:'INSTANCE',childIds:[],order:nodes.length,visible:true,unknownFacts:[],
  semantic:{path:name},appearance:{opacity:1},resolvedModes:{},component:{identity,properties,propertyTypes:Object.fromEntries(Object.keys(properties).map(k=>[k,'VARIANT'])),propertyReferences:[],propertyReferenceBindings:{}}});
 const root=node('root',null,'Group',{componentKey:'group-variant',componentSetKey:'group-set',mainComponentId:'group-main'});nodes.push(root);
 const children=[],captures=[];
 for(let i=0;i<count;i++){
  const member=node('member-'+i,'root','Button',{componentKey:'secondary',componentSetKey:'button-set',mainComponentId:'secondary-main'},{View:'Secondary'});
  member.semantic.path='Group / Button';member.component.sourceIdentity={version:1,ownerComponentKey:'group-variant',ownerMainComponentId:'group-main',sourceNodeId:'100:'+(i+2)};
  nodes.push(member);root.childIds.push(member.id);
  const actual=clone(member);actual.id='local-root';actual.parentId=null;actual.semantic.path='Button';delete actual.component.sourceIdentity;
  const child={schemaVersion:'apollo.predicate-snapshot.v2',generatedAt:'fixture',selection:['local-root'],nodes:[actual],
   context:{platform:'desktop',modes:{},unknownFacts:[]},source:{componentKey:'secondary',componentSetKey:'button-set',rootNodeId:'local-root',truncated:false,nodeLimit:500,
    occurrenceAddressVersion:1,instanceIdentityVersion:1,instanceSourceIdentityVersion:1}};
  child.variantReference=clone(core.captureVariantReference(child,'secondary','button-set'));children.push(child);
  captures.push({nodeId:member.id,nodeMap:{'local-root':member.id},snapshot:child});
  m.targets.push({id:'target-'+i,semanticRole:'button-'+i,label:'Button',pathHint:'Group / @catalog:'+(i+2),lineage:[],resolution:'resolved',
   variantHints:[{representationId:'desktop',componentKey:'group-variant',pathHint:'Group / @source:100%3A'+(i+2)}]});
 }
 const snapshot={schemaVersion:'apollo.predicate-snapshot.v2',generatedAt:'fixture',selection:['root'],nodes,componentDependencyCaptures:captures,
  context:{platform:'desktop',modes:{},unknownFacts:[]},source:{componentKey:'group-variant',componentSetKey:'group-set',rootNodeId:'root',truncated:false,nodeLimit:500,
   occurrenceAddressVersion:1,instanceIdentityVersion:1,instanceSourceIdentityVersion:1}};
 snapshot.variantReference=clone(core.captureVariantReference(snapshot,'group-variant','group-set'));
 const candidate={componentKey:'group-set',figma:{defaultVariantKey:'group-variant',variants:{variantKeys:[{key:'group-variant',properties:{}}]},
  structureSignature:nodes.map((n,i)=>({nodeId:i+1,parentId:n.parentId===null?null:1,name:n.name,type:i?'INSTANCE':'COMPONENT'}))}};
 const evidence=core.extractVariantEvidence([candidate]);
 m.componentDependencies=[{id:'button',componentId:childContract.package.componentId,revision:7,manualSourceHash:childContract.package.manualSourceHash,compiledHash:core.stableHash(childContract),
  bindings:Array.from({length:count},(_,i)=>({kind:'direct-child',id:'button-'+i,targetRole:'button-'+i,relativePath:'',ownerTargetRole:'root',ownerComponentKeys:['group-set'],representationIds:['desktop']}))}];
 const sync=i=>{const host=snapshot.nodes[i+1],actual=children[i].nodes[0];for(const k of ['appearance','component','visible','resolvedModes']){host[k]=clone(actual[k]);}
  host.component.sourceIdentity={version:1,ownerComponentKey:'group-variant',ownerMainComponentId:'group-main',sourceNodeId:'100:'+(i+2)};};
 const run=(contracts=[childContract])=>{const compiled=core.compileManualSource(m,evidence,contracts),contract=core.prepareAuthoringPreviewContract(compiled.contract),engine=core.evaluateCompiledContract(snapshot,contract);
  return {compiled,contract,engine,prepared:core.prepareValidationSnapshot(snapshot,contract),report:core.buildEditorValidationReport(engine,compiled,m,snapshot)};};
 return {manual:m,childManual,childEvidence,childContract,evidence,snapshot,children,run,sync};
}

module.exports={core,clone,scenario};
