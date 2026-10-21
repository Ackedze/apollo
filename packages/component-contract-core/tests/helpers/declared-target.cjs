// Invented synthetic data only. No private native library data or reports.
const clone = value => JSON.parse(JSON.stringify(value));
const {fixture:base}=require('./asset-identity-lock.cjs');
function fixture(core, visibleOnly=true) {
 const manual=base(core).manual;
 manual.component.componentKey='synthetic-set';manual.representations[0].locator={componentSetKey:'synthetic-set'};
 manual.metadata.declaredTargetIdentityVersion=1;
 manual.targets=[{id:'root',semanticRole:'root',label:'Root',pathHint:'Card',lineage:[],resolution:'resolved'},
  {id:'title.target',semanticRole:'title',label:'Title',pathHint:'Card / Title / value',lineage:['Card'],resolution:'resolved'}];
 manual.rules=[{...manual.rules[0],id:'synthetic.title-required',targetId:'root',constraints:[{type:'quantity',targetRoles:['title'],min:1,max:1,visibleOnly}],rationale:'Exactly one synthetic declared title is required.'}];
 const node=(id,parentId,name,type,sourceNodeId,role)=>({id,parentId,name,type,order:0,childIds:[],visible:true,unknownFacts:[],semantic:{role,path:parentId?'Card / '+(id==='text'?'Title / value':name):'Card'},component:{properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{},...(sourceNodeId?{sourceIdentity:{version:1,sourceNodeId,ownerComponentKey:'synthetic-variant',ownerMainComponentId:'synthetic-main'}}:{})}});
 const root=node('root',null,'Card','INSTANCE',undefined,'root');root.component.identity={componentKey:'synthetic-variant',componentSetKey:'synthetic-set',mainComponentId:'synthetic-main'};
 const frame=node('frame','root','Title','FRAME','frame-source','title'),text=node('text','frame','value','TEXT','text-source','value');root.childIds=['frame'];frame.childIds=['text'];
 const snapshot={schemaVersion:'apollo.predicate-snapshot.v2',generatedAt:'2026-10-06T00:00:00Z',selection:['root'],nodes:[root,frame,text],context:{platform:'desktop',modes:{},unknownFacts:[]},source:{componentKey:'synthetic-variant',componentSetKey:'synthetic-set',instanceIdentityVersion:1,instanceSourceIdentityVersion:1,occurrenceAddressVersion:1,truncated:false,captureTopology:{version:1,complete:true},rootNodeId:'root'}};
 snapshot.variantReference=core.captureVariantReference(clone(snapshot),'synthetic-variant','synthetic-set');
 const shape=snapshot.variantReference.nodes,structureId=core.stableHash(shape);
 const evidence={schemaVersion:'apollo.variant-anatomy.v1',sourceHash:'a'.repeat(64),structures:{[structureId]:shape},variants:[{componentKey:'synthetic-variant',componentSetKey:'synthetic-set',structureId,properties:{}}]};
 for(const [target,referencePath,nodeType] of [[manual.targets[0],'','INSTANCE'],[manual.targets[1],'Title / value','TEXT']])target.identityBindingsV1=[{representationId:'desktop',componentKey:'synthetic-variant',componentSetKey:'synthetic-set',referenceHash:core.stableHash(snapshot.variantReference),referencePath,nodeType,...(referencePath?{nativeSource:{sourceNodeId:'text-source',ownerComponentKey:'synthetic-variant',ownerMainComponentId:'synthetic-main'}}:{})}];
 const compile=()=>core.compileManualSource(manual,evidence);return {manual,evidence,snapshot,compile,clone};
}
module.exports={fixture,clone};
