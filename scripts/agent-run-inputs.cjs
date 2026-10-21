'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fail=code=>{throw Object.assign(Error(code),{code});};
const clone=v=>JSON.parse(JSON.stringify(v));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
/** Server-only admission. Prompt/spec supply data; configured provider supplies authority. */
function createAgentRunInputs(options){
 if(options.dataReader){
  const admitted=new Map();
  return{
   async admitDraft(body){
    const data=options.dataReader();
    if(body.target==='figma'&&body.generationMethod!=='mcp')fail('DATA_BUILT_IN_GENERATION_UNSUPPORTED');
    if(body.target==='frontend')for(const node of body.version?.spec?.nodes||[])if(node.kind==='component'&&!data.frontend?.bindings.some(b=>b.mappingId===node.mappingId||data.mappings.some(m=>m.id===node.mappingId&&m.componentId===b.componentId)))fail('AGENT_FRONTEND_MAPPING_UNAVAILABLE');
    const provider=Object.assign({},options.provider,{async readPromptContext(input){data.assertCurrent();const packet=data.prompt(input.platform);return{packet,contracts:packet.contracts.map(c=>c.pin),contextHash:options.hash(packet),assertCurrent:data.assertCurrent};}});
    const inputs=createAgentRunInputs(Object.assign({},options,{dataReader:null,provider,targetData:data,ownedFigmaProvider:body.target==='figma'?data.owned:null}));
    const result=await inputs.admitDraft(body);admitted.set(result.identity.runId,inputs);while(admitted.size>16)admitted.delete(admitted.keys().next().value);return result;
   },
   resolveAgentRun(identity){const inputs=admitted.get(identity?.runId);if(!inputs)fail('AGENT_RUN_STALE');return inputs.resolveAgentRun(identity);},
   invalidate(identity){admitted.get(identity?.runId)?.invalidate(identity);},
   clear(){for(const inputs of admitted.values())inputs.clear();admitted.clear();}
  };
 }
 const {ownedFigmaProvider=null,provider,hash,skillsDirectory,frontendRoot,prepareFrontendWorkspace,checkFrontend,laboratory=null,mappingDirectory}=options;
 const p=options.protocol||require("../dist/agent-protocol.cjs"),runs=new Map(),draftRoot=path.resolve(frontendRoot,'../draft-packets');
 const generationSkills=require("./agent-generation-skills.cjs").createGenerationSkills({installedSkillsDirectory:options.installedSkillsDirectory});
 function historical(identity){if(!p.validIdentity(identity))fail('AGENT_IDENTITY_INVALID');const cached=runs.get(identity.runId);if(cached&&p.sameIdentity(cached.identity,identity))return cached;if(typeof identity.runId!=='string'||!(/^[a-f0-9]{32}$/).test(identity.runId)||!fs.existsSync(path.join(draftRoot,identity.runId+'.json')))fail('AGENT_PARENT_STALE');const file=path.join(draftRoot,identity.runId+'.json'),stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>1048576||fs.realpathSync(draftRoot)!==draftRoot)fail('AGENT_PARENT_STALE');const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(!p.closed(saved,['identity','version'])||!p.sameIdentity(saved.identity,identity)||!p.validScreenVersion(saved.version)||saved.identity.specHash!==saved.version.specHash)fail('AGENT_PARENT_STALE');return saved;}
 function findParent(version){for(const r of runs.values())if(r.version.versionHash===version.parentHash)return r;if(!fs.existsSync(draftRoot))return null;for(const name of fs.readdirSync(draftRoot).filter(x=>/^[a-f0-9]{32}\.json$/.test(x)).sort((a,b)=>fs.statSync(path.join(draftRoot,b)).mtimeMs-fs.statSync(path.join(draftRoot,a)).mtimeMs).slice(0,16)){const saved=JSON.parse(fs.readFileSync(path.join(draftRoot,name),'utf8'));if(saved?.version?.versionHash===version.parentHash)return historical(saved.identity);}return null;}
 const pins=new Map(),readInto=(file,localPins=pins)=>{const real=fs.realpathSync(file),bytes=fs.readFileSync(real);localPins.set(real,sha(bytes));return bytes;};
 const skill=(target,localPins)=>{const file=path.join(skillsDirectory,target==='figma'&&ownedFigmaProvider?'figma-owned.md':target+'.md'),text=readInto(file,localPins).toString('utf8');return{id:'apollo-agent-'+target,text,sha256:localPins.get(fs.realpathSync(file))};};
 const workflows=ownedFigmaProvider?[skill('figma',pins)]:[];
 const semanticMapping=ownedFigmaProvider?(ownedFigmaProvider.semanticMapping||JSON.parse(readInto(path.join(skillsDirectory,'figma-owned-mapping.json')))):null;
 if(semanticMapping&&(semanticMapping.schemaVersion!=='apollo.agent-figma-semantic-mapping.v1'||semanticMapping.sourceHash!==ownedFigmaProvider.sourceHash||!Array.isArray(semanticMapping.mappings)))fail('AGENT_FIGMA_MAPPING_INVALID');
 if(semanticMapping)for(const m of semanticMapping.mappings)if(!m.mappingId||!m.componentId||!Array.isArray(m.choices)||m.choices.some(id=>!ownedFigmaProvider.packet.mappings.some(c=>c.id===id)))fail('AGENT_FIGMA_MAPPING_INVALID');
 function targetInputs(target,method='built-in'){
  const localPins=new Map(pins);
  if(ownedFigmaProvider&&method==='mcp'){const file=path.join(skillsDirectory,'figma-mcp.md'),bytes=readInto(file,localPins);return{pins:localPins,generation:null,mappings:null,workflows:[{id:'apollo-figma-mcp-profile',text:bytes.toString('utf8'),sha256:sha(bytes)}]};}
  const generation=target==='frontend'||ownedFigmaProvider?generationSkills.select(target,{executionProfile:ownedFigmaProvider?'figma-owned-root-v1':'existing-v1',sourceHash:ownedFigmaProvider?.sourceHash}):null;
  if(generation)for(const pin of generation.pins)localPins.set(pin.path,pin.sha256);
  if(ownedFigmaProvider)return{pins:localPins,workflows:workflows.concat(generation.skills),generation,mappings:null};
  if(options.targetData){const data=options.targetData;data.assertCurrent();return{pins:localPins,workflows:[skill(target,localPins)].concat(generation?.skills||[]),generation,mappings:{'frontend-mapping.json':data.frontend,'rule-links.json':data.ruleLinks,'bindings.ts':data.bindingHelper}};}
  if(!mappingDirectory)fail('AGENT_MAPPING_INPUT_UNAVAILABLE');const mappings={};
  for(const filename of [target+'-mapping.json','rule-links.json'].concat(target==='frontend'?['bindings.ts']:[])){const bytes=readInto(path.join(mappingDirectory,filename),localPins);mappings[filename]=filename.endsWith('.json')?JSON.parse(bytes):bytes.toString('utf8');}
  const collect=value=>{if(Array.isArray(value)){for(const item of value)collect(item);}else if(value&&typeof value==='object'){if(typeof value.path==='string'&&typeof value.sha256==='string'){const actual=sha(readInto(value.path,localPins));if(actual!==value.sha256)fail('AGENT_MAPPING_INPUT_STALE');}for(const item of Object.values(value))collect(item);}};
  collect(mappings[target+'-mapping.json']);return{pins:localPins,workflows:[skill(target,localPins)].concat(generation?.skills||[]),generation,mappings};
 }
 function assertPins(localPins){for(const [file,pin]of localPins)if(!fs.existsSync(file)||sha(fs.readFileSync(file))!==pin)fail('AGENT_SKILLS_STALE');}
 function record(identity){if(!p.validIdentity(identity))fail('AGENT_IDENTITY_INVALID');const r=runs.get(identity.runId);if(!r||!p.sameIdentity(r.identity,identity)||r.invalid)fail('AGENT_RUN_STALE');r.assertCurrent();return r;}
 async function admitDraft(body){
  const fields=['schemaVersion','input','version','target','parentIdentity'].concat(Object.hasOwn(body||{},'generationMethod')?['generationMethod']:[],Object.hasOwn(body||{},'plannerRequestId')?['plannerRequestId']:[]);
  if(!p.closed(body,fields)||Object.hasOwn(body,'generationMethod')&&(!ownedFigmaProvider||!['mcp','built-in'].includes(body.generationMethod))||Object.hasOwn(body,'plannerRequestId')&&body.plannerRequestId!==null&&!/^prompt-plan:[a-f0-9]{16}:[1-9][0-9]{0,15}$/.test(body.plannerRequestId)||body.schemaVersion!=='apollo.agent-draft-request.v1'||!['frontend','figma'].includes(body.target)||!p.validScreenVersion(body.version)
   ||!p.closed(body.input,['prompt','platform','viewport'])||typeof body.input.prompt!=='string'||!body.input.prompt.trim()||body.input.prompt.length>12000||body.input.platform!==body.version.spec.platform||hash(body.input.viewport)!==hash(body.version.spec.viewport)||hash(body.input)!==body.version.inputHash)fail('AGENT_DRAFT_INVALID');
  if(ownedFigmaProvider&&body.target!=='figma')fail('AGENT_FIGMA_PROFILE_TARGET_INVALID');
  if(ownedFigmaProvider)for(const n of body.version.spec.nodes.filter(n=>n.kind==='component')){const target=(ownedFigmaProvider.targets||require("../src/generation/agent/figma/target.js")).componentTarget(n,body.version.spec.platform);if(target.issues.length)fail(target.issues[0]);}
  const frozen=clone(body),parent=frozen.parentIdentity===null?(frozen.version.revision>1?findParent(frozen.version):null):historical(frozen.parentIdentity);
  if(parent?parent.version.id!==frozen.version.id||frozen.version.revision!==parent.version.revision+1||frozen.version.parentHash!==parent.version.versionHash:frozen.version.revision!==1||frozen.version.parentHash!==null)fail('AGENT_PARENT_STALE');
  const method=ownedFigmaProvider?(frozen.generationMethod||'built-in'):null;
  const selected=targetInputs(frozen.target,method),targetMappings=selected.mappings,assertSkills=()=>{if(selected.generation)selected.generation.assertCurrent();assertPins(selected.pins);};assertSkills();const originalReadback=await provider.readPromptContext(frozen.input);originalReadback.assertCurrent();let projection=null,projected=originalReadback.packet;if(ownedFigmaProvider?.packet.genericMapping){for(const name of ["generation/agent/figma/projection.js","generation/agent/figma/mapping.js","generation/agent/figma/api.js"]){const file=path.join(__dirname,"../src",name);readInto(file,selected.pins);delete require.cache[require.resolve(file)];}projection=require("../src/generation/agent/figma/projection");projected=projection.projectFigmaAuthoring(originalReadback.packet,ownedFigmaProvider.packet.genericMapping);}if(frozen.target==='frontend'&&Array.isArray(targetMappings['frontend-mapping.json']?.bindings))projected=projectFrontendAuthoring(projected,targetMappings['frontend-mapping.json'],{hash,read:file=>readInto(file,selected.pins)});const readback=Object.assign({},originalReadback,{packet:projected,contextHash:hash(projected)});assertSkills();
  if(!readback.packet||!Array.isArray(readback.packet.contracts)||!Array.isArray(readback.packet.mappings)||hash(readback.packet)!==readback.contextHash)fail('AGENT_CONTEXT_INVALID');
  for(const n of frozen.version.spec.nodes.filter(n=>n.kind==='component')){
   if(projection&&projection.admitFigmaComponent(n,readback.packet,frozen.version.spec.platform))continue;
   if(frozen.target==='frontend'&&admitFrontendComponent(n,readback.packet))continue;
   const mapping=readback.packet.mappings.find(m=>m.id===n.mappingId),contract=mapping&&readback.packet.contracts.find(c=>c.pin.componentId===mapping.componentId);
   if(!contract)fail('AGENT_MAPPING_UNAVAILABLE');const ports=contract.manual.semanticApi||[];
   if(Object.keys(n.props).concat(Object.keys(n.slots),n.actions?[n.actions.port]:[]).some(id=>!ports.some(port=>port.id===id)))fail('AGENT_PORT_INVALID');
   if(semanticMapping){const target=semanticMapping.mappings.find(m=>m.mappingId===n.mappingId&&m.componentId===mapping.componentId);if(!target)fail('AGENT_FIGMA_MAPPING_UNAVAILABLE');if(Object.keys(n.props).concat(Object.keys(n.slots),n.actions?[n.actions.port]:[]).some(id=>!Object.prototype.hasOwnProperty.call(target.ports,id)))fail('AGENT_FIGMA_PORT_UNAVAILABLE');}
  }
  if(!targetMappings&&!ownedFigmaProvider)fail('AGENT_MAPPING_INPUT_UNAVAILABLE');
  if(ownedFigmaProvider)ownedFigmaProvider.assertCurrent();
  const ruleLinks=ownedFigmaProvider?readback.packet.contracts.flatMap(c=>(c.manual.rules||[]).map((rule,index)=>({RuleID:rule.id,componentId:c.pin.componentId,source:{archiveSha256:c.pin.archiveSha256,manualSourceHash:c.pin.manualSourceHash,entry:'contract.manual.json',pointer:'/rules/'+index,objectCanonicalSha256:hash(rule)},rule:clone(rule)}))):targetMappings?clone(targetMappings['rule-links.json']):null;
  if(ownedFigmaProvider&&(!ruleLinks.length||ruleLinks.some(link=>typeof link.RuleID!=='string'||!link.RuleID)))fail('AGENT_FIGMA_RULE_LINKS_UNAVAILABLE');
  const skills=selected.workflows,destination=frozen.target==='figma'?(ownedFigmaProvider?{kind:method==='mcp'?'mcp-isolated-owned-root':'native-current-page-owned-root',actorPolicy:method==='mcp'?'experimental-mcp-owned-root-post-readback':'new-owned-root-current-page.v1',sourceHash:ownedFigmaProvider.sourceHash}:clone(laboratory)):null;
  const executionMapping=ownedFigmaProvider?Object.assign(clone(ownedFigmaProvider.packet),{semanticMapping:clone(semanticMapping)}):targetMappings?clone(targetMappings[frozen.target+'-mapping.json']):null;
  // The worker resolves the complete native policy from the independently pinned provider.
  if(ownedFigmaProvider)delete executionMapping.genericMapping;
  if(ownedFigmaProvider)readInto(path.join(__dirname,"../src/generation/context/resources.js"),selected.pins);
  let context={authoring:clone(readback.packet),targetMapping:executionMapping,ruleLinks,bindingHelper:targetMappings&&frozen.target==='frontend'?targetMappings['bindings.ts']:null,readSources:Array.from(selected.pins,([file,digest])=>({path:file,sha256:digest})).concat(ownedFigmaProvider?.readSources||[]),versionHash:frozen.version.versionHash,page:clone(frozen.version.page),skills:skills.map(x=>({id:x.id,sha256:x.sha256})),mode:'engineering-test',executionProfile:ownedFigmaProvider?'figma-owned-root-v1':'existing-v1',destination};
  if(selected.generation)context.generationSkill=clone(selected.generation.metadata);
  let published=null;
  if(ownedFigmaProvider){
   context.generationMethod=method;context.parentRequestId=frozen.plannerRequestId||null;context.executionProfile=method==='mcp'?'figma-mcp-owned-root-v1':'figma-owned-root-v1';
   const file=path.join(__dirname,"../src/generation/context/resources.js");
   published=require(file).publishContext(context,{hash,sourceHash:ownedFigmaProvider.sourceHash,versionHash:frozen.version.versionHash,spec:frozen.version.spec,providerResources:(ownedFigmaProvider.packet.genericMapping?.profiles?.actualPartDefinitions||[]).map(part=>({selector:'native-part:'+part.id,value:part}))});context=published.context;
  }
  const runId=crypto.randomBytes(16).toString('hex'),identity={runId,revision:frozen.version.revision,specHash:frozen.version.specHash,contextHash:hash(context),target:frozen.target};
  let workspace=null;
  if(frozen.target==='frontend'){
   if(typeof prepareFrontendWorkspace!=='function'||typeof checkFrontend!=='function')fail('AGENT_FRONTEND_CAPABILITY_UNAVAILABLE');
   fs.mkdirSync(frontendRoot,{recursive:true});const root=fs.realpathSync(frontendRoot);if(root!==path.resolve(frontendRoot))fail('AGENT_WORKSPACE_UNSAFE');
   workspace=path.join(root,runId);if(fs.existsSync(workspace))fail('AGENT_WORKSPACE_COLLISION');fs.mkdirSync(workspace);
   try{await prepareFrontendWorkspace(workspace,clone(frozen.version),clone(context));}catch(e){fs.writeFileSync(path.join(workspace,'admission-failed.json'),JSON.stringify({code:e.code||'AGENT_WORKSPACE_PREPARATION_FAILED'}));throw e;}
   if(fs.realpathSync(workspace)!==workspace)fail('AGENT_WORKSPACE_UNSAFE');
  }
  readback.assertCurrent();assertSkills();
  const packet={schemaVersion:'apollo.agent-context-packet.v1',runId,revision:identity.revision,spec:clone(frozen.version.spec),specHash:identity.specHash,context,contextHash:identity.contextHash,target:frozen.target,skills:clone(skills),capabilities:frozen.target==='frontend'?p.CAPABILITIES.frontend.slice():ownedFigmaProvider?method==='mcp'?['mcp.use_figma','mcp.get_screenshot']:ownedFigmaProvider.capabilities.slice():laboratory?p.CAPABILITIES.figma.slice():[],destination,lease:{status:'point-in-time',acceptedWriteOperations:[],Ready:false},version:clone(frozen.version),input:clone(frozen.input)};
  packet.packetHash=hash(packet);
  const serialized=JSON.stringify(packet);if(Buffer.byteLength(serialized)>2097152)fail('AGENT_PACKET_LIMIT');
  const r={identity:clone(identity),version:clone(frozen.version),serialized,workspace,published,invalid:false,assertCurrent(){if(r.invalid)fail('AGENT_RUN_STALE');assertSkills();readback.assertCurrent();if(ownedFigmaProvider)ownedFigmaProvider.assertCurrent();if(workspace&&(fs.realpathSync(workspace)!==workspace||path.dirname(workspace)!==fs.realpathSync(frontendRoot)))fail('AGENT_WORKSPACE_UNSAFE');}};
  fs.mkdirSync(draftRoot,{recursive:true});if(fs.realpathSync(draftRoot)!==draftRoot)fail('AGENT_WORKSPACE_UNSAFE');fs.writeFileSync(path.join(draftRoot,runId+'.json'),JSON.stringify({identity:r.identity,version:r.version}),{flag:'wx'});
  runs.set(runId,r);while(runs.size>16)runs.delete(runs.keys().next().value);
  if(parent&&Object.prototype.hasOwnProperty.call(parent,'invalid'))parent.invalid=true;
  return{identity:clone(identity),version:clone(frozen.version)};
 }
 function resolveAgentRun(identity){const r=record(identity);return{packet:JSON.parse(r.serialized),assertCurrent:()=>record(identity),frontendWorkspace:r.workspace||undefined,readContext:r.published?(resourceIds=[])=>{record(identity);const view=r.published.readContext(resourceIds);record(identity);return view;}:undefined,figmaSourceHash:ownedFigmaProvider?.sourceHash,figmaPolicy:ownedFigmaProvider?.packet,assertComposition:ownedFigmaProvider?.targets?.assertMcpComposition,figmaPostconditions:ownedFigmaProvider?(observation,request)=>{record(identity);const verdict=ownedFigmaProvider.validatePostconditions({version:clone(r.version),observation,request});record(identity);return verdict;}:undefined,checkFrontend:r.workspace?async(signal)=>{record(identity);const verdict=await checkFrontend(r.workspace,clone(r.version),()=>record(identity),signal);record(identity);return verdict;}:undefined};}
 return{admitDraft,resolveAgentRun,invalidate(identity){const r=runs.get(identity?.runId);if(r&&p.sameIdentity(r.identity,identity))r.invalid=true;},clear(){for(const r of runs.values())r.invalid=true;runs.clear();}};
}
// External mappings extend agent authoring; the historical deterministic producer stays separate.
function projectFrontendAuthoring(packet,mapping,{hash,read=fs.readFileSync}={}){
 if(mapping?.target!=='frontend'||!Array.isArray(mapping.bindings)||typeof hash!=='function')fail('AGENT_MAPPING_INPUT_UNAVAILABLE');
 const result=clone(packet),bindings=[],ids=new Set();
 function pinned(p){
  if(!p||typeof p.path!=='string'||!path.isAbsolute(p.path)||fs.realpathSync(p.path)!==p.path||!/^[a-f0-9]{64}$/.test(p.sha256)||!Number.isSafeInteger(p.bytes)||p.bytes<0||p.bytes>64*1024*1024)fail('AGENT_MAPPING_SOURCE_INVALID');
  const stat=fs.lstatSync(p.path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==p.bytes)fail('AGENT_MAPPING_SOURCE_STALE');
  const bytes=read(p.path);if(bytes.length!==p.bytes||sha(bytes)!==p.sha256)fail('AGENT_MAPPING_SOURCE_STALE');return bytes;
 }
 function pointer(root,value){if(value===undefined)return root;if(typeof value!=='string'||!value.startsWith('/'))fail('AGENT_MAPPING_SOURCE_INVALID');return value.split('/').slice(1).reduce((v,key)=>v?.[key.replace(/~1/g,'/').replace(/~0/g,'~')],root);}
 for(const binding of mapping.bindings){
  if(!binding.mappingId)continue;
  if(ids.has(binding.mappingId))fail('AGENT_MAPPING_DUPLICATE');ids.add(binding.mappingId);
  if(binding.platform&&binding.platform!=='universal'&&binding.platform!==packet.platform||result.mappings.some(m=>m.id===binding.mappingId))continue;
  const source=Object.values(mapping.context?.contracts||{}).find(c=>c.archive?.sha256===binding.contract?.archive?.sha256&&c.revision===binding.contract?.revision);
  if(!source||typeof binding.import?.module!=='string'||!(/^(?:arui-private(?:\/[A-Za-z0-9_-]+)+|@alfalab\/core-components\/[a-z][a-z0-9-]*)$/.test(binding.import.module))||typeof binding.import.export!=='string'||!Array.isArray(binding.ports))fail('AGENT_MAPPING_SOURCE_INVALID');
  pinned(source.archive);const manual=pointer(JSON.parse(pinned(source.manual).toString('utf8')),source.manualPointer);
  if(manual?.component?.componentId!==binding.componentId||manual.metadata?.revision!==source.revision||hash(manual)!==binding.contract.manual?.semanticHash||!Array.isArray(manual.rules))fail('AGENT_MAPPING_SOURCE_STALE');
  if(!manual.representations?.some(r=>r.id===binding.sourceRepresentationId&&[packet.platform,'universal'].includes(r.platform)))fail('AGENT_MAPPING_PLATFORM_UNAVAILABLE');
  if(binding.import.module.startsWith('@alfalab/core-components/')){
   const representation=manual.representations?.find(r=>r.id===binding.representationId&&r.kind==='code'&&[packet.platform,'universal','web'].includes(r.platform));
   if(representation?.locator?.package!==binding.import.module||representation.locator.export!==binding.import.export)fail('AGENT_MAPPING_SOURCE_INVALID');
   const leaf='@alfalab/core-components-'+binding.import.module.split('/')[2],dependencies=mapping.context?.dependencies;
   const packages=['@alfalab/core-components',leaf].map(name=>{const entry=dependencies?.[name];if(!entry||typeof entry.version!=='string')fail('AGENT_MAPPING_SOURCE_INVALID');const pkg=JSON.parse(pinned(entry.package));if(pkg.name!==name||pkg.version!==entry.version)fail('AGENT_MAPPING_SOURCE_STALE');return pkg;});
   if(packages[0].dependencies?.[leaf]!==packages[1].version)fail('AGENT_MAPPING_SOURCE_STALE');
   pinned(binding.sourceIndex);pinned(binding.sourceImplementation);
   if(!Array.isArray(binding.distributionInputs)||!binding.distributionInputs.length)fail('AGENT_MAPPING_SOURCE_INVALID');
   for(const input of binding.distributionInputs)pinned(input);
  }
  const prior=result.contracts.find(c=>c.pin.componentId===binding.componentId);
  if(prior&&prior.pin.manualSourceHash!==hash(manual))fail('AGENT_MAPPING_SOURCE_CONFLICT');
  if(!prior)result.contracts.push({pin:{componentId:binding.componentId,revision:source.revision,manualSourceHash:hash(manual),archiveSha256:source.archive.sha256,compiledHash:binding.contract.compiledHash||null,sourceStatus:'draft'},manual});
  for(const port of binding.ports)if(!manual.semanticApi?.some(p=>p.id===port.logical))fail('AGENT_MAPPING_PORT_INVALID');
  result.mappings.push({id:binding.mappingId,componentId:binding.componentId,kind:'component',platform:binding.platform,codeRepresentationId:binding.representationId,propertyMappings:binding.ports.map(p=>({from:p.logical,to:p.codePath,transform:typeof p.transform==='string'?p.transform:p.transform?.id})),codeApi:binding.ports,status:{fullContractParity:'not-confirmed'}});bindings.push(clone(binding));
 }
 result.frontendMappingRecords={bindings};return result;
}
function admitFrontendComponent(node,packet){
 const binding=packet.frontendMappingRecords?.bindings.find(b=>b.mappingId===node.mappingId);if(!binding)return null;
 if(node.actions)fail('AGENT_MAPPING_PORT_INVALID');
 for(const [id,value]of Object.entries(node.props||{})){
  const port=binding.ports.find(p=>p.logical===id);if(!port||port.codePath==='props.children')fail('AGENT_MAPPING_PORT_INVALID');
  const domain=port.domain||port.transform?.entries?.map(e=>e.from);if(!Array.isArray(domain)||!domain.length)fail('AGENT_MAPPING_PORT_INVALID');
  const values=value&&typeof value==='object'?Object.values(value.state||{}):[value];if(!values.length||values.some(v=>!domain.includes(v)))fail('AGENT_MAPPING_VALUE_UNSUPPORTED');
 }
 for(const id of Object.keys(node.slots||{}))if(!binding.ports.some(p=>p.logical===id&&p.codePath==='props.children'))fail('AGENT_MAPPING_PORT_INVALID');
 return binding;
}
module.exports={createAgentRunInputs,projectFrontendAuthoring,admitFrontendComponent};
