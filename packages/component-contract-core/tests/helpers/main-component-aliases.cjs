const {fixture,clone}=require('./asset-identity-lock.cjs');
function aliasFixture(core){
 const f=fixture(core);
 for(let i=1;i<=4;i++){
  const icon=f.snapshot.nodes.find(n=>n.id==='icon-'+i),id='glyph-'+i;icon.childIds.push(id);
  f.snapshot.nodes.push({id,parentId:icon.id,childIds:[],name:'Glyph',type:'VECTOR',order:100+i,visible:true,unknownFacts:[],
   appearance:{opacity:1},component:{properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{}}});
 }
 for(const n of f.snapshot.nodes)if(n.parentId){const owner=f.snapshot.nodes.find(p=>p.id===n.parentId);n.component.sourceIdentity={version:1,
  ownerComponentKey:owner.component.identity.componentKey,ownerMainComponentId:owner.component.identity.mainComponentId,sourceNodeId:'source-'+n.name};}
 f.librarySnapshot.nodes=clone(f.snapshot.nodes);
 for(const s of [f.snapshot,f.librarySnapshot])Object.assign(s.source,{instanceIdentityVersion:1,instanceSourceIdentityVersion:1,occurrenceAddressVersion:1});
 const icon=f.snapshot.nodes.find(n=>n.id==='icon-4');icon.component.identity.mainComponentId='local-imported-main';
 f.snapshot.nodes.find(n=>n.id==='addon-4').component.properties['Icon-24#1:1']='local-imported-main';
 f.snapshot.nodes.find(n=>n.id==='glyph-4').component.sourceIdentity.ownerMainComponentId='local-imported-main';
 f.snapshot.variantReference=core.captureVariantReference(f.librarySnapshot,'group-variant','group-set');
 const shape=f.snapshot.variantReference.nodes,hash=core.stableHash(shape);
 f.evidence.structures={[hash]:shape};f.evidence.variants[0].structureId=hash;
 f.evidence.occurrenceAddressVersion=1;f.evidence.occurrences=[{componentKey:'group-variant',componentSetKey:'group-set',
  namesByPath:Object.fromEntries(Object.entries(f.snapshot.variantReference.nodeProperties).map(([p,n])=>[p,n.diagnosticName]))}];
 for(const target of f.manual.targets)target.variantHints=[{representationId:'desktop',componentKey:'group-variant',pathHint:target.pathHint}];
 f.snapshot.instanceContentReferences={schemaVersion:'apollo.instance-content-references.v4',base:clone(f.librarySnapshot),attempts:[]};
 for(const n of f.snapshot.nodes){n.baseline={effective:{}};n.baselineProvenance={status:'unresolved',reason:'structural-identity-unresolved'};}
 return f;
}
module.exports={aliasFixture,clone};
