const assert=require('node:assert/strict');
const {fixture:base,clone}=require('./declared-target.cjs');
module.exports=function(core){
function fixture(swap=false){
 const f=base(core),s=f.snapshot,m=f.manual,root=s.nodes[0],slot=s.nodes[1];
 delete m.metadata.declaredTargetIdentityVersion;for(const t of m.targets)delete t.identityBindingsV1;
 const property=swap?'Icon#1:0':'Body#1:0';
 root.component.properties=swap?{[property]:'asset-main'}:{};
 root.component.propertyTypes={[property]:swap?'INSTANCE_SWAP':'SLOT'};
 root.childIds=['wrapper'];root.appearance={opacity:1};
 const wrapper={id:'wrapper',parentId:root.id,name:'Neutral',type:'FRAME',visible:true,unknownFacts:[],childIds:[slot.id],appearance:{opacity:1},semantic:{role:'neutral',path:'Card / Neutral'},component:{properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{}}};
 Object.assign(slot,{name:'Port',type:swap?'INSTANCE':'SLOT',parentId:wrapper.id,childIds:[],semantic:{role:'untrusted',path:'Card / Neutral / Port'},appearance:{opacity:1}});
 slot.component.propertyReferenceBindings=swap?{mainComponent:property}:{slotContentId:property};
 slot.component.identity=swap?{componentKey:'asset-key',componentSetKey:'asset-set',mainComponentId:'asset-main'}:undefined;
 s.nodes=[root,wrapper,slot];s.source.propertyReferenceIdentityVersion=1;
 m.targets[1]={id:'port',semanticRole:'port',label:'Port',lineage:[],pathHint:'Card / Neutral / Port',resolution:'resolved'};
 const template=clone(m.rules[0]);
 m.rules=[Object.assign({},template,{id:'synthetic.open-port',targetId:'port',capability:'composition.content',permission:'allowed',constraints:[],controlPaths:[{kind:'slot-api',target:'port',property,contentOwnership:'external'}],execution:{route:'policy-only'}}),
  Object.assign({},template,{id:'synthetic.owned-opacity',targetId:'root',targetScope:'self-and-descendants',capability:'appearance.opacity',permission:'forbidden',constraints:[{type:'propertyForbidden',fact:'appearance.opacity'}],boundaryPolicy:'component-owned@1',controlPaths:[]})];
 const independent=clone(s);independent.source.rootNodeId='independent';
 s.variantReference=core.captureVariantReference(independent,'synthetic-variant','synthetic-set');
 s.instanceContentReferences={schemaVersion:'apollo.instance-content-references.v4',base:independent,attempts:[]};
 s.nodes=core.materializeEffectiveBaseline(s,independent,true).snapshot.nodes;
 const shape=s.variantReference.nodes,id=core.stableHash(shape);
 const evidence={schemaVersion:'apollo.variant-anatomy.v1',sourceHash:'a'.repeat(64),structures:{[id]:shape},variants:[{componentKey:'synthetic-variant',componentSetKey:'synthetic-set',structureId:id,properties:{}}]};
 const c=core.compileManualSource(m,evidence);assert(c.contract,JSON.stringify(c.issues));
 return {snapshot:s,contract:core.prepareAuthoringPreviewContract(c.contract),property,slot:s.nodes.find(n=>n.id===slot.id),root:s.nodes[0]};
}
return fixture;
};
