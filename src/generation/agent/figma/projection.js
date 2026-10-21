const {stableHash}=require("../../../../packages/component-contract-core/dist/core.cjs");
const clone=v=>JSON.parse(JSON.stringify(v));
const fail=code=>{throw Error(code);};
function projectFigmaAuthoring(packet,records,{manualReferences=false}={}){
 if(!records)return packet;
 const projected=clone(packet);
 for(const m of records.semantic.mappings){
  if(packet.platform&&m.platform!=='universal'&&m.platform!==packet.platform)continue;
  const index=projected.mappings.findIndex(x=>x.id===m.mappingId),existing=projected.mappings[index];
  if(existing&&(existing.componentId!==m.componentId||existing.target==='figma'))fail('FIGMA_MAPPING_DUPLICATE');
  const nativeMapping={id:m.mappingId,componentId:m.componentId,target:'figma',platform:m.platform,representationId:m.representationId};
  if(existing)projected.mappings[index]=nativeMapping;else projected.mappings.push(nativeMapping);
 }
 const needed=new Set(projected.mappings.map(m=>m.componentId));
 const queue=Array.from(needed);while(queue.length){const id=queue.shift(),d=records.profiles.sourceDependencies.find(d=>d.componentId===id);for(const dep of d?.dependencyPins||[])if(!needed.has(dep.componentId)){needed.add(dep.componentId);queue.push(dep.componentId);}}
 for(const d of records.profiles.sourceDependencies){
  if(!needed.has(d.componentId))continue;
  if(projected.contracts.some(c=>c.pin.componentId===d.componentId))continue;
  const manual=records.manuals.find(m=>m.pin.sha256===d.manual.sha256&&m.pin.path===d.manual.path&&m.manual?.component?.componentId===d.componentId&&(!d.manualPointer||m.manualPointer===d.manualPointer));
  if(!manual)fail('FIGMA_PORT_AUTHORITY_UNAVAILABLE');
  projected.contracts.push({pin:{componentId:d.componentId,revision:d.revision,archiveSha256:d.archive.sha256,manualSourceHash:d.manualSemanticHash,compiledHash:d.compiledSemanticHash,sourceStatus:'unverified'},manual:clone(manual.manual)});
 }
 // Authoring needs admission data; physical targets stay in the native packet.
 projected.figmaMappingRecords={semantic:clone(records.semantic),typed:clone(records.typed),denials:clone(records.denials),manuals:clone(records.manuals),ruleLinks:{links:records.ruleLinks.links.map(r=>({RuleID:r.RuleID,source:clone(r.source)}))},profiles:{choices:records.profiles.choices.map(c=>({id:c.id,key:c.key,setKey:c.setKey,properties:clone(c.properties)})),sourceDependencies:records.profiles.sourceDependencies.map(d=>({componentId:d.componentId,revision:d.revision,manualSemanticHash:d.manualSemanticHash,compiledSemanticHash:d.compiledSemanticHash,dependencyPins:clone(d.dependencyPins)}))},targets:{profiles:[]}};
 if(manualReferences)projected.figmaMappingRecords.manuals=projected.figmaMappingRecords.manuals.map(record=>{
  const contract=projected.contracts.find(c=>c.pin.componentId===record.manual.component.componentId&&stableHash(c.manual)===stableHash(record.manual));
  if(!contract)return record;
  const reference=clone(record);delete reference.manual;reference.manualReference={componentId:contract.pin.componentId,manualSourceHash:contract.pin.manualSourceHash};return reference;
 });
 return projected;
}
function admitFigmaComponent(node,packet,platform){
 const records=packet.figmaMappingRecords;if(!records)return null;
 const {createMappingAdapter}=require("./mapping");
 const manuals=records.manuals.map(record=>{
  if(record.manual)return record;
  const ref=record.manualReference,contract=packet.contracts.find(c=>c.pin.componentId===ref?.componentId&&c.pin.manualSourceHash===ref.manualSourceHash);
  if(!contract)fail('FIGMA_PORT_AUTHORITY_UNAVAILABLE');
  return Object.assign({},record,{manual:contract.manual});
 });
 return createMappingAdapter(Object.assign({},records,{manuals})).select(node,platform);
}
function projectedContractPins(packet){return packet.contracts.map(c=>c.pin);}
module.exports={projectFigmaAuthoring,admitFigmaComponent,projectedContractPins};
