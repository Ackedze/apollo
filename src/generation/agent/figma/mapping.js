const native=require("./api");
const fail=code=>{throw Error(code);};
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const one=(rows,code)=>native.one(rows,code);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const scalar=(domain,value)=>typeof value===domain.type&&(!domain.enum||domain.enum.includes(value))&&(typeof value!=='string'||value.length<=(domain.nativeTransportMaxLength||8192));
function createMappingAdapter({semantic,typed,profiles,targets,manuals,ruleLinks,denials}){
 if(semantic.schemaVersion!=='apollo.agent-figma-semantic-mapping.v1'||typed.schemaVersion!=='apollo.agent-figma-typed-native-binding-input.v1')fail('FIGMA_MAPPING_SCHEMA_UNKNOWN');
 const mappings=new Map(semantic.mappings.map(m=>[m.mappingId,m])),choices=new Map(profiles.choices.map(c=>[c.id,c]));
 const bindings=new Map(typed.bindings.map(b=>[b.mappingId+'\0'+b.port,b]));
 if(mappings.size!==semantic.mappings.length||choices.size!==profiles.choices.length||bindings.size!==typed.bindings.length)fail('FIGMA_MAPPING_DUPLICATE');
 const refs=new Map(targets.profiles.map(p=>[p.choiceId,p.targets]));
 const denied=(mappingId,id,value,choiceId)=>denials.some(d=>d.mappingId===mappingId&&d.port===id&&(!d.choiceId||d.choiceId===choiceId)&&(!own(d,'value')||d.value===value));
 for(const dependency of profiles.sourceDependencies)for(const pin of dependency.dependencyPins){
  const candidates=profiles.sourceDependencies.filter(d=>d.componentId===pin.componentId);
  if(!candidates.length)fail('FIGMA_DEPENDENCY_UNAVAILABLE');
  one(candidates.filter(d=>d.revision===pin.revision&&d.manualSemanticHash===pin.manualSourceHash&&d.compiledSemanticHash===pin.compiledHash),'FIGMA_DEPENDENCY_STALE');
 }
 function authority(binding){
  const source=binding.normativeSource,manual=one(manuals.filter(m=>m.pin.path===source.path&&m.pin.sha256===source.sha256&&m.pin.bytes===source.bytes&&(!source.manualPointer||m.manualPointer===source.manualPointer)),'FIGMA_PORT_AUTHORITY_UNAVAILABLE');
  if(!manual)fail('FIGMA_PORT_AUTHORITY_UNAVAILABLE');
  let value=manual.manual;for(const part of source.pointer.split('/').slice(1))value=value?.[part];
  if(!value)fail('FIGMA_PORT_AUTHORITY_UNAVAILABLE');
  if(source.pointer.startsWith('/semanticApi/')){if(value.readOnly===true)fail('FIGMA_PORT_READ_ONLY');}
  else if(!source.RuleIDs.length||!source.RuleIDs.every(id=>ruleLinks.links.some(r=>r.RuleID===id&&r.source.path===source.path&&r.source.sha256===source.sha256)))fail('FIGMA_PORT_AUTHORITY_UNAVAILABLE');
  return binding;
 }
 function port(mappingId,id){return authority(bindings.get(mappingId+'\0'+id)||fail('FIGMA_PORT_UNAVAILABLE'));}
 function select(node,platform){
  const mapping=mappings.get(node.mappingId);if(!mapping)return null;
  if(!['desktop','mobile-web'].includes(platform)||![platform,'universal'].includes(mapping.platform))fail('FIGMA_PLATFORM_UNSUPPORTED');
  if(node.actions)fail('FIGMA_TARGET_SLOT_UNSUPPORTED');
  for(const id of Object.keys(node.slots||{}))if(port(mapping.mappingId,id).type!=='SLOT')fail('FIGMA_TARGET_SLOT_UNSUPPORTED');
  for(const [id,value]of Object.entries(node.props||{})){
   const b=port(mapping.mappingId,id);if(!scalar(b.writeDomain,value))fail('FIGMA_PROPERTY_NOT_ADMITTED');
   if(denied(mapping.mappingId,id,value,null))fail('FIGMA_CAPABILITY_UNAVAILABLE');
   if(b.condition&&typeof b.condition==='object'&&!Object.entries(b.condition).every(([key,wanted])=>node.props?.[key]===wanted))fail('FIGMA_PORT_CONDITION_UNSATISFIED');
  }
  const variants=mapping.choices.map(id=>choices.get(id)||fail('FIGMA_SOURCE_CHOICE_UNKNOWN'));
  const requested={};for(const c of variants)for(const key of Object.keys(c.properties)){
   const b=typed.bindings.find(b=>b.mappingId===mapping.mappingId&&b.componentProperty===key&&b.targetId==='target.root');
   if(!b)fail('FIGMA_SOURCE_SELECTOR_UNKNOWN');
   requested[key]=own(node.props||{},b.port)?node.props[b.port]:mapping.defaults[0]?.properties[b.port];
  }
  const choice=one(variants.filter(c=>Object.entries(requested).every(([k,v])=>c.properties[k]===v)),'FIGMA_SOURCE_CHOICE_AMBIGUOUS');
  for(const [id,value]of Object.entries(node.props||{}))if(denied(mapping.mappingId,id,value,choice.id))fail('FIGMA_CAPABILITY_UNAVAILABLE');
  return{mapping,choice};
 }
 async function prove(instance,descriptor,guard){
  if(instance.type!=='INSTANCE')fail('FIGMA_INSTANCE_REQUIRED');
  const main=await native.main(instance,guard),set=main.parent?.type==='COMPONENT_SET'?main.parent.key:null;
  if(set!==descriptor.requiredSetKey||(!set||descriptor.sourceTemplatePath.length===0)&&main.key!==descriptor.requiredMainKey)fail('FIGMA_MAIN_COMPONENT_MISMATCH');
  for(const [key,value]of Object.entries(descriptor.nativeProperties||{}))if(value.type==='VARIANT'&&main.variantProperties?.[key]!==instance.componentProperties?.[key]?.value)fail('FIGMA_VARIANT_SOURCE_MISMATCH');
  const expected=profiles.actualPartDefinitions.find(d=>d.key===(set||main.key));
  if(set&&expected){const matched=one(expected.variants.filter(v=>Object.entries(v.properties||{}).every(([key,value])=>instance.componentProperties?.[key]?.value===value)),'FIGMA_VARIANT_SOURCE_UNKNOWN');if(main.key!==matched.key)fail('FIGMA_MAIN_COMPONENT_MISMATCH');}
  for(const [key,value]of Object.entries(descriptor.nativeRefs||{}))if(instance.componentPropertyReferences?.[key]!==value)fail('FIGMA_SOURCE_REFERENCE_UNKNOWN');
  return main;
 }
 async function target(instance,choiceId,targetId,guard){
  const records=refs.get(choiceId)||fail('FIGMA_SOURCE_TARGET_UNKNOWN'),descriptor=one(records.filter(t=>t.targetId===targetId),'FIGMA_SOURCE_TARGET_UNKNOWN');
  const root=one(records.filter(t=>t.sourceTemplatePath.length===0),'FIGMA_SOURCE_TARGET_UNKNOWN');await prove(instance,root,guard);
  const choice=choices.get(choiceId);for(const [k,v]of Object.entries(choice.properties))if(instance.componentProperties?.[k]?.value!==v)fail('FIGMA_VARIANT_SOURCE_MISMATCH');
  const route=descriptor.sourceTemplatePath;
  for(let depth=1;depth<route.length;depth++){
   const owner=native.at(instance,route.slice(0,depth)),record=one(records.filter(t=>same(t.sourceTemplatePath,route.slice(0,depth))),'FIGMA_SOURCE_ANCESTRY_UNKNOWN');
   if(owner.type==='INSTANCE')await prove(owner,record,guard);
  }
  const node=native.at(instance,route);if(node.type!==descriptor.runtimeType||descriptor.cardinality!==1)fail('FIGMA_SOURCE_TARGET_UNKNOWN');
  const main=node.type==='INSTANCE'?await prove(node,descriptor,guard):null;
  if(node.type==='TEXT'&&descriptor.semanticOwner){const ownerRecord=one(records.filter(t=>t.targetId===descriptor.semanticOwner),'FIGMA_SOURCE_ANCESTRY_UNKNOWN');const owner=native.at(instance,ownerRecord.sourceTemplatePath);if(native.nodes(owner).filter(r=>r.node.type==='TEXT').length!==1)fail('FIGMA_TEXT_REFERENCE_UNKNOWN');}
  guard();return{node,descriptor,main};
 }
 async function resolve(instance,selected,portId,guard){
  const current=typeof instance==='function'?instance:()=>instance;
  const binding=port(selected.mapping.mappingId,portId);
  if(denied(selected.mapping.mappingId,portId,undefined,selected.choice.id))fail('FIGMA_CAPABILITY_UNAVAILABLE');
  if(binding.actuation)fail('FIGMA_CAPABILITY_UNAVAILABLE');
  const resolved=await target(current(),selected.choice.id,binding.targetId,guard),node=resolved.node;
  if(binding.type==='SLOT'){
   if(node.type!=='SLOT'||node.componentPropertyReferences?.slotContentId!==binding.componentProperty||current().componentProperties?.[binding.componentProperty]?.type!=='SLOT')fail('FIGMA_PORT_TYPE_MISMATCH');
   const main=await native.main(current(),guard),owner=main.parent?.type==='COMPONENT_SET'?main.parent:main;
   if(owner.componentPropertyDefinitions?.[binding.componentProperty]?.type!=='SLOT')fail('FIGMA_PROPERTY_DEFINITION_UNKNOWN');
   const result={kind:'slot',type:'SLOT',property:binding.componentProperty,bindingRole:'component-content',binding,choiceId:selected.choice.id};
   Object.defineProperty(result,'node',{get:()=>native.at(current(),resolved.descriptor.sourceTemplatePath)});
   Object.defineProperty(result,'ownerInstance',{get:current});return result;
  }
  if(node.componentProperties?.[binding.componentProperty]?.type!==binding.type)fail('FIGMA_PORT_TYPE_MISMATCH');
  const definitions=resolved.main.parent?.type==='COMPONENT_SET'?resolved.main.parent.componentPropertyDefinitions:resolved.main.componentPropertyDefinitions,definition=definitions?.[binding.componentProperty];
  if(definition?.type!==binding.type||binding.type==='VARIANT'&&!binding.writeDomain.enum.every(value=>(definition.variantOptions||[]).includes(value)))fail('FIGMA_PROPERTY_DEFINITION_UNKNOWN');
  const result={kind:'property',type:binding.type,property:binding.componentProperty,bindingRole:'component-scalar',values:binding.writeDomain.enum||null,binding,choiceId:selected.choice.id};
  Object.defineProperty(result,'node',{get:()=>native.at(current(),resolved.descriptor.sourceTemplatePath)});
  Object.defineProperty(result,'ownerInstance',{get:current});
  if(binding.type==='TEXT'){native.text(node,binding.componentProperty);Object.defineProperty(result,'text',{get:()=>native.text(result.node,binding.componentProperty)});}
  return result;
 }
 function readback(port,value){return scalar(port.binding.writeDomain,value)&&native.propertyReadback(port.node,{[port.property]:value})&&(port.type!=='TEXT'||port.text.characters===value&&port.text.componentPropertyReferences?.characters===port.property);}
 async function observe(instance,selected,api,guard){
  const records=refs.get(selected.choice.id),result=[];
  for(const descriptor of records){
   const node=native.at(instance,descriptor.sourceTemplatePath);let main=null,styleKey=null,styleRangesBound=false,tokenKeys=[],tokenStatus='not-applicable';
   if(node.type==='INSTANCE'&&descriptor.requiredMainKey)main=(await target(instance,selected.choice.id,descriptor.targetId,guard)).main;
   if(node.type==='TEXT'){
    await target(instance,selected.choice.id,descriptor.targetId,guard);
    const style=typeof node.textStyleId==='string'&&node.textStyleId?await api.getStyleByIdAsync(node.textStyleId):null;guard();
    if(style?.type==='TEXT'){styleKey=style.key;const segments=node.characters.length?node.getStyledTextSegments(['textStyleId']):[];styleRangesBound=!node.characters.length||segments.length>0&&segments[0].start===0&&segments.at(-1).end===node.characters.length&&segments.every((s,i)=>s.textStyleId===style.id&&(!i||segments[i-1].end===s.start));}
    const aliases=node.boundVariables?.fills;
    if(Array.isArray(aliases)&&aliases.length&&typeof api.variables?.getVariableByIdAsync==='function'){
     tokenStatus='passed';for(const alias of aliases){const variable=await api.variables.getVariableByIdAsync(alias.id);guard();if(!variable||typeof variable.key!=='string'||!variable.key||variable.remote!==true){tokenStatus='unknown';continue;}tokenKeys.push(variable.key);}
    }else tokenStatus='unknown';
   }
   let visible=node.visible===true,parent=node.parent;for(let depth=0;parent&&depth<512;depth++,parent=parent.parent)visible=visible&&parent.visible!==false;
   result.push({targetId:descriptor.targetId,nodeId:node.id,parentId:node.parent?.id||null,type:node.type,mainKey:main?.key||null,setKey:main?.parent?.type==='COMPONENT_SET'?main.parent.key:null,effectiveVisible:visible,styleKey,styleRangesBound,tokenStatus,tokenKeys});
  }
  return result;
 }
 return{select,port,target,resolve,readback,observe};
}
module.exports={createMappingAdapter};
