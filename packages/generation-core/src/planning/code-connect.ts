import { pinOf } from './projection';
import { transformValue, valueAtState } from './preflight';
import { validateScreenSpec } from './schema';
import type { CodeObservation, GenerationView, Hash, MappingEntry, MappingRegistry, Scalar, ScreenSpec } from './types';

/** NEXT-01 producer-owned input. Extra producer evidence is retained, not edited. */
export type CodeConnectRegistry = {
  schemaVersion: 'apollo.arui-private-mappings.v1'; registryVersion: string; registryDigest: string; targetProduct: 'apollo-v4';
  source: { package: 'arui-private'; version: string; commit: string; files: Array<{path:string;sha256:string}>; internalPackageVersions: Record<string,string> };
  authoringBasis?:CodeConnectAuthoringBasis;currentInputs?:CodeConnectCurrentInputs;
  mappingArtifacts: Array<{path:string;sha256:string}>;
  availabilityPolicy: { allowedImports: string[] };
  mappings: Array<{
    id: string; kind: 'buttons-group' | 'corporate-content'; platforms: Array<'desktop' | 'mobile-web'>;
    contract: { componentId:string;contractId:string;revision:number;archivePath:string;archiveSha256:string;manualSha256:string;manualSourceHash:string;
      dependencyPins:Array<{componentId:string;revision:number;manualSourceHash:string;compiledHash:string}>;
      compiledHash?:string;compiledEntrySha256?:string;manualPath?:string;mainManualSha256?:string;compiledStatus?:string;sourcePredicateStatus?:string;coverage?:unknown };
    figma: { representationId:string;componentKey:string;bodyProperty?:string };
    code: { package:'arui-private';version:string;subpath:string;export:string;source:{index:string;implementation:string};
      publicExportStatus:string;proposedRepresentationId:string;representationStatus:string;builtPackageStatus:string;
      api:Array<{name:string;required:boolean;type:string}>;codeEvidence?:import('../../../component-contract-core/src/types').RepresentationEvidence;typedBindings?:CodeConnectCurrentInputs['packages'][number]['typedBindings'] };
    status: {sourcePredicate?:string;codeRepresentation?:string; apiMapping:string;fullContractParity:string;liveAcceptance:string;publication:string;release:string };
    propertyMappings:Array<{from:string;to:string|null;transform:string;type?:string;domain?:Scalar[]}>;
    gaps:Array<{id:string;description:string;sources:unknown[]}>; evidence:string[];
  }>;
};
export type CodeConnectInputPin = {
  role:'root'|'transitive';componentId:string;familyId:string;contractId:string;revision:number;
  archivePath:string;archiveSha256:string;manualPath:string;mainManualSha256:string;manualSha256:string;manualSourceHash:string;
  compiledHash:string;compiledEntrySha256:string;
  dependencyPins:Array<{componentId:string;revision:number;manualSourceHash:string;compiledHash:string}>;
  embeddedDependencies:Array<{entry:string;sha256:string;componentId:string;compiledHash:string}>;
};
export type CodeConnectAuthoringBasis={registryDigest:string;registryVersion:'1.0.0';registryPath:string;registrySha256:string};
/** Producer observations, not another contract schema or Ready authority. */
export type CodeConnectCurrentInputs={version:1;basisRegistryDigest:string;authorityVersions:{editor:string;core:string};
  authorities:Array<{path:string;sha256:string}>;packages:Array<CodeConnectInputPin & {
    compiledSchemaVersion:string;compiledStatus:'ready'|'draft';producer:string;runtimePolicy:Record<string,unknown>;
    coverage:unknown;authoritativeFullFactsHash:string;compiledGeneratedFactsHash:string;representationScopeHash?:string;
    codeRepresentation?:{id:string;status:'draft';locator:Record<string,unknown>;codeEvidence:import('../../../component-contract-core/src/types').RepresentationEvidence};
    sourcePredicateStatus?:'ready'|'draft';authoritativeTypedBindingChanges?:unknown[];
    typedBindings?:Array<import('../../../component-contract-core/src/types').SemanticApiBinding & {portId:string}>;
  }>;};
export type CodeConnectLock={registryVersion:string;registryDigest:string;codeVersion:string;codeCommit:string;contracts:Record<string,string>;
  basisRegistryDigest?:string;currentInputsDigest?:string;inputPackages?:CodeConnectInputPin[]};

const sha = /^[a-f0-9]{64}$/;
function fail(code:string):never { throw new Error(code); }
function immutable<T>(value:T):T {
  const copy = JSON.parse(JSON.stringify(value));
  function freeze(v:any) { if(v && typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);} }
  freeze(copy); return copy;
}
/** Pure projection AFTER the trusted provider calls NEXT-01 preflight. This
 * helper cannot attest filesystem freshness or contract/UI parity. */
export function normalizeCodeConnect(registry:CodeConnectRegistry, lock:CodeConnectLock, view:GenerationView,
  selectedIds:string[], hash:Hash):MappingRegistry {
  verifyCodeConnectInputs(registry,lock,hash);
  if(!selectedIds.length||new Set(selectedIds).size!==selectedIds.length)fail('PRODUCER_SCHEMA');
  if(hash(view.lock)!==view.lockHash)fail('CONTRACT_LOCK_INVALID');
  const files:Record<string,string>={};
  for(const p of registry.source.files.concat(registry.mappingArtifacts)) {
    if(!sha.test(p.sha256)||!p.path||p.path.startsWith('/')||p.path.includes('\\')||p.path.split('/').some(s=>!s||s==='.'||s==='..')
      ||Object.prototype.hasOwnProperty.call(files,p.path)&&files[p.path]!==p.sha256)fail('PRODUCER_FILE_PIN_INVALID');
    files[p.path]=p.sha256;
  }
  const entries:MappingEntry[]=[], contracts:NonNullable<MappingRegistry['source']>['contracts']=[];
  for(const id of selectedIds) {
    const m=registry.mappings.find(m=>m.id===id); if(!m)fail('MAPPING_MISSING');
    if(m.platforms.length!==1||m.status.apiMapping!=='confirmed-source-api'||m.status.fullContractParity!=='not-confirmed'
      ||m.code.package!=='arui-private'||m.code.version!==registry.source.version||m.code.publicExportStatus!=='confirmed-build-source'
      ||!registry.availabilityPolicy.allowedImports.includes(m.code.subpath)||!files[m.code.source.index])fail('PRODUCER_MAPPING_UNCONFIRMED');
    const locked=view.lock.packages.find(p=>p.componentId===m.contract.componentId), c=view.components.find(c=>c.pin.componentId===m.contract.componentId);
    if(!locked||!c||locked.contractId!==m.contract.contractId||locked.revision!==m.contract.revision
      ||locked.archiveSha256!==m.contract.archiveSha256||locked.manualSourceHash!==m.contract.manualSourceHash
      ||hash(c.pin)!==hash(pinOf(locked)))fail('MAPPING_CONTRACT_STALE');
    const dep=(p:{componentId:string;revision:number;manualSourceHash:string;compiledHash:string})=>({componentId:p.componentId,revision:p.revision,manualSourceHash:p.manualSourceHash,compiledHash:p.compiledHash});
    if(hash(locked.dependencies.map(dep).sort((a,b)=>a.componentId.localeCompare(b.componentId)))
      !==hash(m.contract.dependencyPins.map(dep).sort((a,b)=>a.componentId.localeCompare(b.componentId))))fail('DEPENDENCY_PIN_INVALID');
    if(!sha.test(m.contract.manualSha256)||!sha.test(m.contract.manualSourceHash))fail('PRODUCER_CONTRACT_PIN_INVALID');
    const apiPort=(prop:string)=>c.api.find(a=>a.bindings.some(b=>b.representationId===m.code.proposedRepresentationId&&[prop,'props.'+prop].includes(b.path)));
    const e:MappingEntry={id:m.id,status:'verified',pin:pinOf(locked),platform:m.platforms[0],
      code:{module:m.code.subpath,exportName:m.code.export,representationId:m.code.proposedRepresentationId,indexFile:m.code.source.index},
      figma:{componentKey:m.figma.componentKey,representationId:m.figma.representationId,handlerId:''},
      evidenceFiles:m.evidence.filter(file=>Object.prototype.hasOwnProperty.call(files,file)),props:{},slots:{},
      assurance:{apiMapping:m.status.apiMapping,fullContractParity:m.status.fullContractParity,codeRepresentation:m.code.representationStatus,
        builtPackage:m.code.builtPackageStatus,liveAcceptance:m.status.liveAcceptance,publication:m.status.publication,release:m.status.release},gaps:m.gaps};
    if(registry.registryVersion==='1.1.0'){
      const observed=registry.currentInputs!.packages.find(p=>p.componentId===m.contract.componentId)!;
      const representation=c.representations.find(r=>r.id===m.code.proposedRepresentationId),bindings=c.api.flatMap(p=>p.bindings.filter(b=>b.representationId===m.code.proposedRepresentationId).map(b=>Object.assign({portId:p.id},b)));
      if(hash(bindings)!==hash(observed.typedBindings)||!representation||hash({id:representation.id,status:representation.status,locator:representation.locator,codeEvidence:representation.codeEvidence})!==hash(observed.codeRepresentation))fail('PRODUCER_VIEW_STALE');
      if(locked.compiledHash!==observed.compiledHash||locked.factsHash!==observed.authoritativeFullFactsHash||c.sourceStatus!==observed.sourcePredicateStatus||c.evidenceScopeHash!==observed.representationScopeHash||hash(c.representations.find(r=>r.id===m.code.proposedRepresentationId)?.codeEvidence)!==hash(observed.codeRepresentation!.codeEvidence))fail('PRODUCER_VIEW_STALE');
      for(const p of view.lock.packages){const declared=registry.currentInputs!.packages.find(i=>i.componentId===p.componentId);if(!declared||p.archiveSha256!==declared.archiveSha256||p.revision!==declared.revision||p.manualSourceHash!==declared.manualSourceHash||p.compiledHash!==declared.compiledHash||p.factsHash!==declared.authoritativeFullFactsHash)fail('PRODUCER_VIEW_STALE');}
    }
    const passport=c.representations.find(r=>r.id===e.code.representationId)?.codeEvidence;
    // A unique accepted declaration is a source-selected profile, not a prompt default.
    if(passport?.parity.status==='accepted-for-profile'&&passport.parity.profileIds.length===1)e.generationProfileId=passport.parity.profileIds[0];
    // Only source-confirmed recipes are projected; absent passport bindings stay absent.
    if(m.kind==='corporate-content') {
      const port=apiPort('children'), recipe=m.propertyMappings.find(p=>p.from===m.figma.bodyProperty&&p.to==='children'&&p.transform==='preserve-ordered-content');
      const association=port?.bindings.find(b=>b.representationId===e.code.representationId)?.nativeSlotBinding;
      const binding=port?.bindings.find(b=>b.representationId===m.figma.representationId&&[m.figma.bodyProperty,'component.properties.'+m.figma.bodyProperty].includes(b.path));
      const targetId=association?.figmaRepresentationId===e.figma.representationId&&association.propertyIdentity===m.figma.bodyProperty?association.targetId:binding?.targetId;
      if(port&&recipe)e.slots[port.id]={min:0,max:256,codeProp:'children'};
      if(port&&recipe&&binding&&targetId&&c.targets.includes(targetId))e.slots[port.id].figma={targetId,property:m.figma.bodyProperty!};
      for(const prop of ['id','className','dataTestId']) {
        const a=apiPort(prop);if(a?.valueType==='string'&&m.code.api.some(p=>p.name===prop))e.props[a.id]={type:'string',code:{prop,transform:{kind:'identity'}}};
      }
    } else if(m.kind==='buttons-group') {
      e.profile={code:{size:56,maxVisibleButtons:4},figma:{Size:'56',Overflow:'false'},requiresRuntimeWidthFit:true};
      const size=apiPort('size'), recipe=m.propertyMappings.find(p=>p.from==='Size'&&p.to==='size'&&p.transform==='numeric-enum');
      if(size&&['number','string','enum'].includes(size.valueType)&&recipe?.domain?.includes('56')) {
        const stringInput=size.valueType==='string'||size.valueType==='enum'&&size.domain?.includes('56');
        e.props[size.id]={type:stringInput?'string':'number',values:[stringInput?'56':56],code:{prop:'size',transform:stringInput?{kind:'lookup',values:[{input:'56',output:56}]}:{kind:'identity'}}};
        if(size.bindings.some(b=>b.representationId===m.figma.representationId&&b.path==='Size'))e.props[size.id].figma={property:'Size',type:'VARIANT',transform:{kind:'lookup',values:[{input:stringInput?'56':56,output:'56'}]}};
      }
      const actions=apiPort('elements'), recipes=m.propertyMappings;
      if(actions&&recipes.some(p=>p.to==='elements[].children'&&p.transform==='string')
        &&recipes.some(p=>p.to==='elements[].onClick'&&p.transform==='bind-real-handler')) {
        e.actions={port:actions.id,min:1,max:4,codeProp:'elements',fields:{label:'children',event:'onClick'}};
        if(recipes.some(p=>p.to==='elements[].disabled'&&p.transform==='False/True→boolean'))e.actions.fields.disabled='disabled';
        if(recipes.some(p=>p.to==='primaryFirst'&&p.transform==='Primary→true, Secondary→false'))e.actions.fields.priorityProp='primaryFirst';
      }
    } else fail('PRODUCER_MAPPING_UNSUPPORTED');
    entries.push(e);contracts.push({mappingId:m.id,archivePath:m.contract.archivePath,archiveSha256:m.contract.archiveSha256,
      manualSha256:m.contract.manualSha256,manualSourceHash:m.contract.manualSourceHash,pin:pinOf(locked),dependencies:m.contract.dependencyPins});
  }
  return immutable({schemaVersion:'apollo.generation-registry-port.v1-experimental',producer:{name:'code-connect',revision:registry.registryVersion,status:'verified'},
    package:{name:'arui-private',version:registry.source.version,commit:registry.source.commit,files,
      implementationDependencies:Object.entries(registry.source.internalPackageVersions).map(([name,version])=>({name,version}))},entries,
    source:{schemaVersion:registry.schemaVersion,version:registry.registryVersion,digest:registry.registryDigest,lockHash:hash(lock),
      mappingArtifacts:registry.mappingArtifacts,contracts,
      producerInputs:registry.registryVersion==='1.1.0'?{authoringBasis:registry.authoringBasis!,currentInputs:registry.currentInputs!,inputPackages:lock.inputPackages!,basisRegistryDigest:lock.basisRegistryDigest!,currentInputsDigest:lock.currentInputsDigest!}:undefined}});
}
export function codeObservationFromProducer(registry:MappingRegistry):CodeObservation {
  return immutable({package:{name:registry.package.name,version:registry.package.version,commit:registry.package.commit,files:registry.package.files},
    publicExports:registry.entries.map(e=>({module:e.code.module,exportName:e.code.exportName,indexFile:e.code.indexFile}))});
}
/** Materialize every declared state into NEXT-01's narrower consumer input.
 * No guessed Overflow prop, component aliases, functions or priority defaults. */
export function screenSpecForProducer(spec:ScreenSpec, registry:CodeConnectRegistry, normalized:MappingRegistry, state:string):unknown {
  if(validateScreenSpec(spec).length||!spec.states.values.includes(state))fail('SCREEN_SCHEMA');
  const nodes=new Map(spec.nodes.map(n=>[n.id,n]));
  function node(id:string):any {
    const n=nodes.get(id)!;
    if(n.kind==='text')return n.text;
    if(n.kind!=='component')fail('PRODUCER_LAYOUT_UNSUPPORTED');
    const m=registry.mappings.find(m=>m.id===n.mappingId), entry=normalized.entries.find(e=>e.id===n.mappingId);
    if(!m||!entry||!m.platforms.includes(spec.platform))fail('MAPPING_MISSING');
    const props:Record<string,Scalar>={};
    for(const [port,value]of Object.entries(n.props)) {
      const p=entry.props[port];if(!p)fail('PROPERTY_UNSUPPORTED');props[p.code.prop]=transformValue(valueAtState(value,state),p.code.transform);
    }
    const result:any={mappingId:m.id,platform:spec.platform,figma:{representationId:m.figma.representationId,componentKey:m.figma.componentKey}};
    if(m.kind==='corporate-content') {
      if(n.actions)fail('ACTION_PORT_UNSUPPORTED');result.props=props;result.figma.slotProperty=m.figma.bodyProperty;result.slots={};
      for(const [port,children]of Object.entries(n.slots)) {
        if(!entry.slots[port]||entry.slots[port].codeProp!=='children')fail('SLOT_UNSUPPORTED');
        if(Object.prototype.hasOwnProperty.call(result.slots,'Body'))fail('SLOT_UNSUPPORTED');result.slots.Body=children.map(node);
      }
    } else {
      if(Object.keys(n.slots).length||Object.keys(props).some(p=>p!=='size'))fail('PROPERTY_UNSUPPORTED');
      // 56/no-voluntary-overflow is the fixed, source-confirmed NEXT-01 route.
      result.figma.Size=String(props.size===undefined?56:props.size);result.figma.Overflow='false';
      if(!n.actions||!entry.actions||n.actions.port!==entry.actions.port)fail('ACTION_PORT_UNSUPPORTED');
      result.actions=n.actions.items.map(a=>{
        if(a.behavior==='none')fail('PRODUCER_NO_ACTION_UNSUPPORTED');
        if(a.view===undefined||a.disabled===undefined)fail('ACTION_INPUT_REQUIRED');
        return {id:a.id,label:a.label,view:a.view,disabled:typeof a.disabled==='boolean'?a.disabled:a.disabled.state[state],
          onClick:{handlerRef:'event_'+spec.events.findIndex(e=>e.id===a.eventId)}};
      });
    }
    return result;
  }
  return node(spec.root);
}

const safePath=(v:unknown):v is string=>typeof v==='string'&&!!v&&!v.startsWith('/')&&!v.includes('\\')&&!/[:\x00-\x1f]/.test(v)&&!v.split('/').some(s=>!s||s==='.'||s==='..');
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const closed=(v:unknown,fields:string[])=>record(v)&&Object.keys(v).length===fields.length&&fields.every(k=>Object.prototype.hasOwnProperty.call(v,k));
const pinFields=['role','componentId','familyId','contractId','revision','archivePath','archiveSha256','manualPath','mainManualSha256','manualSha256','manualSourceHash','compiledHash','compiledEntrySha256','dependencyPins','embeddedDependencies'];
const observedFields=['compiledSchemaVersion','compiledStatus','producer','runtimePolicy','coverage','authoritativeFullFactsHash','compiledGeneratedFactsHash'];
const rootFields=['representationScopeHash','codeRepresentation','sourcePredicateStatus','authoritativeTypedBindingChanges','typedBindings'];
const markers=['rootTargetAliasesVersion','dependencySubjectConditionsVersion','assetIdentityLockVersion','instanceMainComponentAliasesVersion','memberCollectionsVersion','occurrenceAddressVersion','directChildDependenciesVersion','ruleOwnershipVersion','gradientPaintFactsVersion','ruleScopeFactsVersion','semanticTargetVisibilityVersion','representationEvidenceVersion','crossRepresentationBindingsVersion','slotTargetFactsVersion','nativeSlotTargetsVersion','validationModeVersion','validationIntentVersion','transitionFactsVersion'];
const inputPin=(p:CodeConnectCurrentInputs['packages'][number]):CodeConnectInputPin=>Object.fromEntries(pinFields.map(k=>[k,(p as any)[k]])) as CodeConnectInputPin;
/** Complete producer lock validation is useful even when a root is Draft.
 * Actual filesystem freshness remains mandatory at the trusted Node boundary. */
export function verifyCodeConnectInputs(registry:CodeConnectRegistry,lock:CodeConnectLock,hash:Hash):void {
  if(!registry||registry.schemaVersion!=='apollo.arui-private-mappings.v1'||!['1.0.0','1.1.0'].includes(registry.registryVersion)
    ||registry.targetProduct!=='apollo-v4'||registry.source?.package!=='arui-private'||!sha.test(registry.registryDigest)
    ||!Array.isArray(registry.mappings)||!registry.mappings.length||new Set(registry.mappings.map(m=>m.id)).size!==registry.mappings.length)fail('PRODUCER_SCHEMA');
  const expected:CodeConnectLock={registryVersion:registry.registryVersion,registryDigest:registry.registryDigest,
    codeVersion:registry.source.version,codeCommit:registry.source.commit,contracts:Object.fromEntries(registry.mappings.map(m=>[m.id,m.contract.archiveSha256]))};
  if(registry.registryVersion==='1.1.0'){
    const basis=registry.authoringBasis,i=registry.currentInputs;
    if(!closed(basis,['registryDigest','registryVersion','registryPath','registrySha256'])||basis!.registryVersion!=='1.0.0'||!sha.test(basis!.registryDigest)||!sha.test(basis!.registrySha256)||!safePath(basis!.registryPath)
      ||!closed(i,['version','basisRegistryDigest','authorityVersions','authorities','packages'])||i!.version!==1||i!.basisRegistryDigest!==basis!.registryDigest
      ||!closed(i!.authorityVersions,['editor','core'])
      ||!Array.isArray(i!.authorities)||i!.authorities.length!==2
      ||i!.authorities.some(a=>!closed(a,['path','sha256'])||!safePath(a.path)||!sha.test(a.sha256))
      ||new Set(i!.authorities.map(a=>a.path)).size!==2
      ||!Array.isArray(i!.packages)||i!.packages.length!==5||registry.mappings.length!==3)fail('PRODUCER_CURRENT_INPUTS_INVALID');
    const versions=i!.authorityVersions;
    if(!(versions.editor==='0.2.91'&&versions.core==='0.1.10')
      &&!(versions.editor==='0.2.93'&&versions.core==='0.1.12'&&i!.authorities.some(a=>a.path==='shared/design-system_ab/experiments/current-contract-packages/reports/producer-handoff.2026-10-09.json'
        &&a.sha256==='c02b28ffe4c44e15487f7c60a0a1d0927941630d3ef99260804371c46f50a380'))
      &&!(versions.editor==='0.2.94'&&versions.core==='0.1.13'&&i!.authorities.some(a=>a.path==='arui-private/tools/code-connect/reports/current-catalog-producer-handoff.editor-0.2.94-core-0.1.13.2026-10-09.json'
        &&a.sha256==='b271a238126649645111bdad22779fcfde67237c8a91b7deea2835a4e21869f8')))fail('PRODUCER_CURRENT_INPUTS_INVALID');
    const inputs=i!,packages=inputs.packages,byId=new Map(packages.map(p=>[p.componentId,p]));
    if(byId.size!==5||new Set(packages.map(p=>p.archivePath)).size!==5||new Set(packages.map(p=>p.manualPath)).size!==5
      ||packages.filter(p=>p.role==='root').length!==3||packages.filter(p=>p.role==='transitive').length!==2)fail('PRODUCER_CURRENT_INPUTS_INVALID');
    for(const p of packages){
      if(!closed(p,pinFields.concat(observedFields,p.role==='root'?rootFields:[]))||!['root','transitive'].includes(p.role)||!p.componentId||!p.familyId||!p.contractId
        ||!Number.isSafeInteger(p.revision)||p.revision<1||!safePath(p.archivePath)||!safePath(p.manualPath)
        ||['archiveSha256','mainManualSha256','manualSha256','manualSourceHash','compiledHash','compiledEntrySha256','authoritativeFullFactsHash','compiledGeneratedFactsHash'].some(k=>!sha.test((p as any)[k]))
        ||p.compiledSchemaVersion!=='apollo.component-contract.v2.1-experimental'||!['ready','draft'].includes(p.compiledStatus)||!p.producer||!record(p.coverage)
        ||!Array.isArray(p.dependencyPins)||!Array.isArray(p.embeddedDependencies)||p.dependencyPins.length!==p.embeddedDependencies.length
        ||new Set(p.dependencyPins.map(d=>d.componentId)).size!==p.dependencyPins.length||new Set(p.embeddedDependencies.map(d=>d.entry)).size!==p.embeddedDependencies.length)fail('PRODUCER_CURRENT_INPUTS_INVALID');
      const policy=p.runtimePolicy;
      if(!record(policy)||policy.engine!=='apollo-predicate-engine'||policy.unknownPolicy!=='fail-closed'||policy.compiledIsSourceOfTruth!==false
        ||Object.keys(policy).some(k=>!['engine','unknownPolicy','compiledIsSourceOfTruth'].includes(k)&&(!markers.includes(k)||policy[k]!== (k==='validationIntentVersion'?2:1))))fail('PRODUCER_RUNTIME_UNSUPPORTED');
      for(const d of p.dependencyPins){
        const child=byId.get(d.componentId),embedded=p.embeddedDependencies.filter(e=>e.componentId===d.componentId);
        if(!closed(d,['componentId','revision','manualSourceHash','compiledHash'])||!child||child.role!=='transitive'||d.revision!==child.revision||d.manualSourceHash!==child.manualSourceHash||d.compiledHash!==child.compiledHash
          ||embedded.length!==1||!closed(embedded[0],['entry','sha256','componentId','compiledHash'])||!safePath(embedded[0].entry)||embedded[0].sha256!==child.compiledEntrySha256||embedded[0].compiledHash!==child.compiledHash)fail('DEPENDENCY_PIN_INVALID');
      }
      if(p.role==='root'){
        const r=p.codeRepresentation!,e=r?.codeEvidence;
        if(!closed(r,['id','status','locator','codeEvidence'])||r.status!=='draft'||!r.id||!record(r.locator)||!sha.test(p.representationScopeHash!)||!['ready','draft'].includes(p.sourcePredicateStatus!)
          ||(p.sourcePredicateStatus==='ready'&&p.compiledStatus!=='ready')
          ||!Array.isArray(p.authoritativeTypedBindingChanges)||!Array.isArray(p.typedBindings)||!e||e.version!==1||e.sourcePin.registryDigest!==basis!.registryDigest||r.locator.registryDigest!==basis!.registryDigest
          ||e.availability.status!=='confirmed-source-api'||e.parity.status!=='not-confirmed'||e.parity.profileIds.length||e.acceptance.status!=='not-run'||e.acceptance.receiptRefs.length||e.publication.status!=='not-confirmed'
          ||policy.representationEvidenceVersion!==1||policy.crossRepresentationBindingsVersion!==1)fail('PRODUCER_CODE_EVIDENCE_INVALID');
      }
    }
    const reached=new Set<string>(),active=new Set<string>();
    function visit(id:string){if(active.has(id))fail('DEPENDENCY_PIN_INVALID');if(reached.has(id))return;active.add(id);for(const d of byId.get(id)!.dependencyPins)visit(d.componentId);active.delete(id);reached.add(id);}
    for(const m of registry.mappings){
      const p=byId.get(m.contract.componentId),c=m.contract,r=p?.codeRepresentation;
      if(!p||p.role!=='root'||['contractId','revision','archivePath','archiveSha256','manualSha256','manualSourceHash','compiledHash','compiledEntrySha256','manualPath','mainManualSha256'].some(k=>(c as any)[k]!== (p as any)[k])
        ||hash(c.dependencyPins)!==hash(p.dependencyPins)||hash(c.coverage)!==hash(p.coverage)||c.compiledStatus!==p.compiledStatus||c.sourcePredicateStatus!==p.sourcePredicateStatus
        ||m.status.apiMapping!=='confirmed-source-api'||m.status.fullContractParity!=='not-confirmed'||m.status.sourcePredicate!==p.sourcePredicateStatus||m.status.codeRepresentation!=='draft'||m.status.liveAcceptance!=='not-run'||m.status.publication!=='not-confirmed'||m.status.release!=='not-released'
        ||r!.id!==m.code.proposedRepresentationId||m.code.representationStatus!=='draft'||hash(m.code.codeEvidence)!==hash(r!.codeEvidence)||hash(m.code.typedBindings)!==hash(p.typedBindings)
        ||r!.codeEvidence.sourcePin.mappingId!==m.id||r!.codeEvidence.sourcePin.packageName!==registry.source.package||r!.codeEvidence.sourcePin.packageVersion!==registry.source.version||r!.codeEvidence.sourcePin.commit!==registry.source.commit)fail('PRODUCER_CURRENT_MAPPING_INVALID');
      visit(p.componentId);
    }
    if(reached.size!==5)fail('DEPENDENCY_PIN_INVALID');
    const payload=Object.assign({},registry);delete (payload as Partial<CodeConnectRegistry>).registryDigest;
    if(hash(payload)!==registry.registryDigest)fail('PRODUCER_DIGEST_MISMATCH');
    expected.basisRegistryDigest=basis!.registryDigest;expected.currentInputsDigest=hash(inputs);expected.inputPackages=packages.map(inputPin);
  }
  if(hash(expected)!==hash(lock))fail('STALE_MAPPING_LOCK');
}
