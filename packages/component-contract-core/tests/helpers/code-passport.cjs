const clone=x=>JSON.parse(JSON.stringify(x));
function passport(manual){
 const r={id:'code',kind:'code',platform:'desktop',status:'draft',locator:{packageName:'arui-private',packageVersion:'0.0.0-synthetic',sourceCommit:'a'.repeat(40),registryDigest:'b'.repeat(64),mappingId:'synthetic-mapping'}};
 r.codeEvidence={version:1,sourcePin:{packageName:r.locator.packageName,packageVersion:r.locator.packageVersion,commit:r.locator.sourceCommit,registryDigest:r.locator.registryDigest,mappingId:r.locator.mappingId},availability:{status:'confirmed-source-api',evidenceRefs:[{path:'src/synthetic.tsx',sha256:'c'.repeat(64)}]},parity:{status:'not-confirmed',profileIds:[],unresolvedGapIds:['layout-gap']},acceptance:{status:'not-run',receiptRefs:[]},publication:{status:'not-confirmed'}};
 manual.representations.push(r);return r;
}
function ownBindings(f){
 passport(f.manual);
 for(let i=0;i<4;i++)for(const [name,kind,valueType,path,property,transformId,domain] of [
  ['label','content','string','props.elements[].children','Label#1:1','owned-button-label.v1'],
  ['disabled','state','enum','props.elements[].disabled','DisabledState','owned-button-disabled.v1',['False','True']],
  ['view','appearance','enum','props.primaryFirst','View','owned-button-primary-first.v1',['Primary','Secondary']],
 ]){
  f.manual.semanticApi.push(Object.assign({id:name+i,kind,valueType,bindings:[{representationId:'code',path,targetId:'target-'+i,ownedOccurrence:{version:1,dependencyId:'button',dependencyBindingId:'button-'+i,sourceRepresentationId:'desktop',collectionResolver:{version:1,source:'trusted-native-capture',ownerTargetId:'root',visibility:'captured-effective',ordering:'captured-source-order'},sourceProperty:{property,propertyType:name==='label'?'TEXT':'VARIANT'},transformId}}]},domain?{domain}:{}));
  const n=f.snapshot.nodes[i+1];Object.assign(n.component.properties,{'Label#1:1':'Label '+i,DisabledState:i===2?'True':'False',View:i===0?'Primary':'Secondary'});Object.assign(n.component.propertyTypes,{'Label#1:1':'TEXT',DisabledState:'VARIANT',View:'VARIANT'});
 }
 return f;
}
module.exports={passport,ownBindings,clone};
