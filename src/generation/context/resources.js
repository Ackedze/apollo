'use strict';
const clone=value=>JSON.parse(JSON.stringify(value));
const bytes=value=>encodeURIComponent(JSON.stringify(value)).replace(/%[0-9A-F]{2}/g,'x').length;
const fail=code=>{throw Object.assign(Error(code),{code,status:413});};
const REF=/^context:[a-f0-9]{64}$/;
const SHA=/^[a-f0-9]{64}$/;

// Bodies never cross SDK admission. Only this server-owned registry resolves refs.
function createContextResources({hash,sourceHash,versionHash,maxObjectBytes=1048576,maxViewBytes=1048576,maxManifestBytes=65536,maxResources=128}={}){
 if(typeof hash!=='function'||!SHA.test(sourceHash)||!SHA.test(versionHash))fail('AGENT_CONTEXT_CONFIGURATION_INVALID');
 const objects=new Map();let manifest=null;
 function add({selector,value,mandatory=true,dependencies=[]}){
  if(manifest||typeof selector!=='string'||!/^[a-zA-Z0-9._:-]{1,160}$/.test(selector)||!Array.isArray(dependencies)||dependencies.some(id=>!REF.test(id)))fail('AGENT_CONTEXT_RESOURCE_INVALID');
  const body=clone(value),size=bytes(body),digest=hash(body),id='context:'+hash({selector,sha256:digest});
  if(size>maxObjectBytes)fail('AGENT_CONTEXT_OBJECT_LIMIT');
  if(objects.size>=maxResources||objects.has(id))fail('AGENT_CONTEXT_RESOURCE_LIMIT');
  objects.set(id,{entry:{id,selector,sha256:digest,bytes:size,mandatory:mandatory===true,dependencies:dependencies.slice()},body});
  return id;
 }
 function seal(){
  if(!manifest){
   for(const {entry}of objects.values())if(entry.dependencies.some(id=>!objects.has(id)))fail('AGENT_CONTEXT_DEPENDENCY_UNAVAILABLE');
   manifest={schemaVersion:'apollo.context-resource-manifest.v1',sourceHash,versionHash,entries:Array.from(objects.values(),o=>clone(o.entry))};
   manifest.manifestHash=hash(manifest);
   if(bytes(manifest)>maxManifestBytes)fail('AGENT_CONTEXT_MANIFEST_LIMIT');
  }
  return clone(manifest);
 }
 function resolve(request){
  const frozen=seal();
  if(!request||Object.keys(request).sort().join(',')!==['manifestHash','sourceHash','versionHash','resourceIds'].sort().join(',')||request.manifestHash!==frozen.manifestHash||request.sourceHash!==sourceHash||request.versionHash!==versionHash||!Array.isArray(request.resourceIds)||request.resourceIds.length>16||new Set(request.resourceIds).size!==request.resourceIds.length||request.resourceIds.some(id=>!REF.test(id)||!objects.has(id)))fail('AGENT_CONTEXT_REFERENCE_STALE');
  const wanted=new Set(Array.from(objects.values()).filter(o=>o.entry.mandatory).map(o=>o.entry.id));
  for(const id of request.resourceIds)wanted.add(id);
  const queue=Array.from(wanted);
  while(queue.length){const o=objects.get(queue.shift());for(const id of o.entry.dependencies)if(!wanted.has(id)){wanted.add(id);queue.push(id);}}
  const resources=Array.from(wanted,id=>{const o=objects.get(id);if(hash(o.body)!==o.entry.sha256||bytes(o.body)!==o.entry.bytes)fail('AGENT_CONTEXT_RESOURCE_STALE');return{id,selector:o.entry.selector,sha256:o.entry.sha256,value:clone(o.body)};});
  const view={schemaVersion:'apollo.context-view.v1',sourceHash,versionHash,manifestHash:frozen.manifestHash,resources};
  view.viewHash=hash(view);
  if(bytes(view)>maxViewBytes)fail('AGENT_CONTEXT_WORKING_SET_LIMIT');
  return view;
 }
 return{add,seal,resolve};
}

function requiredContracts(authoring,spec){
 const contracts=authoring?.contracts;
 if(!Array.isArray(contracts)||!Array.isArray(spec?.nodes))fail('AGENT_CONTEXT_CLOSURE_UNAVAILABLE');
 const known=new Map(contracts.map(c=>[c.pin?.componentId,c]));
 const mappings=(authoring.mappings||[]).concat(authoring.figmaMappingRecords?.semantic?.mappings||[]);
 const used=spec.nodes.filter(n=>n.kind==='component').map(n=>mappings.find(m=>(m.id||m.mappingId)===n.mappingId)?.componentId);
 // Ambiguous applicability keeps the full normative set; it never drops a rule.
 if(!used.length||used.some(id=>!known.has(id)))return new Set(known.keys());
 const result=new Set(),queue=used.slice();
 while(queue.length){const id=queue.shift();if(result.has(id))continue;const c=known.get(id);if(!c)fail('AGENT_CONTEXT_DEPENDENCY_UNAVAILABLE');result.add(id);
  const deps=c.manual.componentDependencies||[];
  for(const dep of deps){if(!dep?.componentId||!known.has(dep.componentId))fail('AGENT_CONTEXT_DEPENDENCY_UNAVAILABLE');queue.push(dep.componentId);}
  for(const dep of authoring.figmaMappingRecords?.profiles?.sourceDependencies?.find(d=>d.componentId===id)?.dependencyPins||[]){if(!known.has(dep.componentId))fail('AGENT_CONTEXT_DEPENDENCY_UNAVAILABLE');queue.push(dep.componentId);}
 }
 return result;
}

function publishContext(context,{hash,sourceHash,versionHash,spec,providerResources=[],...limits}){
 const registry=createContextResources({hash,sourceHash,versionHash,...limits}),required=requiredContracts(context.authoring,spec),refs={},contractRefs=[],providerRefs=[];
 const authoring=clone(context.authoring),contracts=authoring.contracts;delete authoring.contracts;
 // Full contracts, including conditions/exceptions/context-only and public API,
 // remain indivisible resources. Provenance is still present in their bodies.
 for(const c of contracts){
  const id=c.pin.componentId,fullSourceId=registry.add({selector:'source-contract:'+id,value:c,mandatory:false}),physical={targets:[],importedFiles:c.manual.source?.importedFiles||[]};
  const projected=clone(c);
  projected.manual.targets=(c.manual.targets||[]).map(target=>{const logical=clone(target),matrix={id:target.id};for(const key of ['variantHints','identityBindingsV1'])if(Object.prototype.hasOwnProperty.call(target,key)){matrix[key]=clone(target[key]);delete logical[key];}physical.targets.push(matrix);return logical;});
  if(projected.manual.source)delete projected.manual.source.importedFiles;
  const physicalId=registry.add({selector:'physical:'+id,value:physical,mandatory:false});
  projected.manualProjection={kind:'complete-norms-and-logical-API',originalManualHash:hash(c.manual),sourceContractResourceId:fullSourceId,physicalResourceId:physicalId,physicalHash:hash(physical)};
  contractRefs.push({componentId:id,pin:clone(c.pin),mandatory:required.has(id),id:registry.add({selector:'contract:'+id,value:projected,mandatory:required.has(id)})});
 }
 for(const resource of providerResources)providerRefs.push({selector:resource.selector,sha256:hash(resource.value),id:registry.add({selector:resource.selector,value:resource.value,mandatory:false})});
 const byComponent=new Map(contracts.map(c=>[c.pin.componentId,c])),byRef=new Map(contractRefs.map(r=>[r.componentId,r.id]));
 const referenceLinks=links=>Array.isArray(links)?links.map(link=>{
  const c=byComponent.get(link.componentId),rule=c?.manual.rules?.find(r=>r.id===link.RuleID);
  if(!rule||hash(rule)!==hash(link.rule))return clone(link);
  const result=clone(link);delete result.rule;if(result.source)result.source={pointer:result.source.pointer||null,resourceId:byRef.get(link.componentId),manualSourceHash:c.pin.manualSourceHash};result.ruleRef={resourceId:byRef.get(link.componentId),RuleID:link.RuleID,ruleHash:hash(rule),pointer:link.source?.pointer||null};return result;
 }):clone(links);
 if(authoring.figmaMappingRecords){
  const records=authoring.figmaMappingRecords;
  if(Array.isArray(records.manuals))records.manuals=records.manuals.map(record=>{const c=record.manual&&contracts.find(c=>hash(c.manual)===hash(record.manual));if(!c)return record;const value=clone(record);delete value.manual;value.manualRef={resourceId:byRef.get(c.pin.componentId),manualHash:hash(c.manual)};return value;});
  if(records.ruleLinks?.links)records.ruleLinks.links=referenceLinks(records.ruleLinks.links);
 }
 authoring.contractScope={kind:'frozen-component-and-dependency-closure',componentIds:Array.from(required),omittedComponentIds:contracts.filter(c=>!required.has(c.pin.componentId)).map(c=>c.pin.componentId)};
 refs.ruleLinks=registry.add({selector:'ruleLinks',value:referenceLinks(context.ruleLinks)});
 if(authoring.figmaMappingRecords?.ruleLinks?.links){const links=authoring.figmaMappingRecords.ruleLinks.links;delete authoring.figmaMappingRecords.ruleLinks.links;authoring.figmaMappingRecords.ruleLinks.linksRef={resourceId:refs.ruleLinks,RuleIDs:links.map(l=>l.RuleID)};}
 refs.authoring=registry.add({selector:'authoring',value:authoring});
 for(const key of Object.keys(context))if(key!=='authoring'&&key!=='ruleLinks'){
  let value=clone(context[key]);
  if(key==='targetMapping'){const provenance={};for(const field of ['typedNativeBindingProvenance','genericMappingProvenance'])if(Object.prototype.hasOwnProperty.call(value,field)){provenance[field]=value[field];delete value[field];}if(Object.keys(provenance).length)value.providerProvenanceRef={resourceId:registry.add({selector:'targetMapping-physical-provenance',value:provenance,mandatory:false}),sha256:hash(provenance)};}
  refs[key]=registry.add({selector:key,value});
 }
 const manifest=registry.seal(),envelope={schemaVersion:'apollo.context-envelope.v1',manifest,refs,contractRefs,providerResources:providerRefs};
 if(bytes(envelope)>131072)fail('AGENT_CONTEXT_ENVELOPE_LIMIT');
 function readContext(resourceIds=[]){
  const view=registry.resolve({manifestHash:manifest.manifestHash,sourceHash,versionHash,resourceIds});
  const records=new Map(view.resources.map(r=>[r.id,r.value])),result={};
  for(const [key,id]of Object.entries(refs))result[key]=clone(records.get(id));
  result.authoring.contracts=contractRefs.filter(r=>records.has(r.id)).map(r=>clone(records.get(r.id)));
  result.extraResources=view.resources.filter(r=>!Object.values(refs).includes(r.id)&&!contractRefs.some(c=>c.id===r.id)).map(r=>clone(r));
  const provenance=result.readSources;delete result.readSources;if(provenance)result.providerSourceManifest={count:provenance.length,sha256:hash(provenance),authority:'Pinned server readSources retained in SDK/recorder, not re-emitted as physical paths to the model.'};
  const resolvedIds=view.resources.map(r=>r.id),modelViewHash=hash({context:result,manifestHash:manifest.manifestHash,sourceHash,versionHash,resourceIds:resolvedIds});
  return{context:result,viewHash:modelViewHash,resourceSetHash:view.viewHash,manifestHash:manifest.manifestHash,sourceHash,versionHash,resourceIds:resolvedIds};
 }
 // Logical refs remain objects so old wire shape guards can reject or identify
 // this explicit version, rather than accidentally treating it as full content.
 const compact=clone(context);
 for(const key of Object.keys(context))if(!['versionHash','page','skills','mode','executionProfile','destination','generationSkill','generationMethod','parentRequestId','readSources'].includes(key))compact[key]={schemaVersion:'apollo.context-reference.v1',resourceId:refs[key]};
 compact.resourceEnvelope=envelope;
 return{context:compact,readContext,manifest};
}
module.exports={createContextResources,publishContext,requiredContracts,bytes};
