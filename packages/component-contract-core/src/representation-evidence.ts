import type { ManualSource, CompiledContract, ComponentRepresentation, SemanticApiProperty, SemanticTarget, ComponentDependency, GenerationProfile, ControlPath, CodeTransform, JsonValue } from './types';
import { stableHash } from './stable';
const hash=/^[a-f0-9]{64}$/;
const record=(v:unknown):v is Record<string,any>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const closed=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).every(k=>keys.includes(k))&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k));
const text=(v:unknown):v is string=>typeof v==='string'&&Boolean(v.trim());
const strings=(v:unknown)=>Array.isArray(v)&&v.every(text)&&new Set(v).size===v.length;
export const safeEvidencePath=(v:unknown):v is string=>text(v)&&!v.startsWith('/')&&!v.includes('\\')&&!v.split('/').some(p=>!p||p==='.'||p==='..')&&!/[:\x00-\x1f]/.test(v);
const refs=(v:unknown)=>Array.isArray(v)&&v.length<=64&&v.every(r=>closed(r,['path','sha256'])&&safeEvidencePath(r.path)&&hash.test(r.sha256))&&new Set(v.map(r=>r.path)).size===v.length;
type Shape={representations:ComponentRepresentation[];semanticApi:SemanticApiProperty[];targets:SemanticTarget[];dependencies:ComponentDependency[];profiles:GenerationProfile[];slots:ControlPath[]};
export function manualRepresentationShape(m:ManualSource):Shape{return {representations:m.representations,semanticApi:m.semanticApi,targets:m.targets,dependencies:m.componentDependencies||[],profiles:m.generation.profiles,slots:m.rules.filter(r=>r.status!=='deprecated'&&r.permission!=='forbidden').flatMap(r=>r.controlPaths)};}
export function contractRepresentationShape(c:CompiledContract):Shape{return {representations:c.facts.representations,semanticApi:c.facts.semanticApi,targets:c.facts.targets,dependencies:c.componentDependencies||[],profiles:c.facts.generation.profiles,slots:c.customizationPolicy.filter(r=>r.status!=='deprecated'&&r.permission!=='forbidden').flatMap(r=>r.controlPaths)};}
/** A closed opt-in schema. Legacy bindings remain governed by their original validator. */
export function representationEvidenceErrors(s:Shape):string[]{
  const errors:string[]=[];const add=(path:string,message:string)=>errors.push(path+': '+message);
  for(const [i,r] of s.representations.entries())if(r.codeEvidence!==undefined){
    const p='representations/'+i+'/codeEvidence',e=r.codeEvidence;
    if(r.kind!=='code'||!closed(e,['version','sourcePin','availability','parity','acceptance','publication'])||e.version!==1){add(p,'unsupported evidence version/shape or representation kind');continue;}
    if(!record(e.sourcePin)||!record(e.availability)||!record(e.parity)||!record(e.acceptance)||!record(e.publication)){add(p,'invalid evidence sections');continue;}
    const pin=e.sourcePin;
    if(!closed(pin,['packageName','packageVersion','commit','registryDigest','mappingId'])||!text(pin.packageName)||!text(pin.packageVersion)||!/^[a-f0-9]{40}$/.test(pin.commit)||!hash.test(pin.registryDigest)||!text(pin.mappingId))add(p,'exact code source pin required');
    if(pin.packageName!==r.locator.packageName||pin.packageVersion!==r.locator.packageVersion||pin.commit!==r.locator.sourceCommit||pin.registryDigest!==r.locator.registryDigest||pin.mappingId!==r.locator.mappingId)add(p,'source pin differs from representation locator');
    if(!closed(e.availability,['status','evidenceRefs'])||!['confirmed-source-api','unresolved'].includes(e.availability.status)||!refs(e.availability.evidenceRefs)||e.availability.status==='confirmed-source-api'&&!e.availability.evidenceRefs.length)add(p,'availability requires exact evidence refs');
    if(!closed(e.parity,['status','profileIds','unresolvedGapIds'])||!['not-confirmed','accepted-for-profile'].includes(e.parity.status)||!strings(e.parity.profileIds)||!strings(e.parity.unresolvedGapIds))add(p,'invalid parity claim');
    else if(e.parity.status==='accepted-for-profile'&&(!e.parity.profileIds.length||e.parity.unresolvedGapIds.length||e.parity.profileIds.some(id=>s.profiles.filter(p=>p.id===id&&p.representationId===r.id&&p.platform===r.platform).length!==1)))add(p,'accepted parity requires declared profiles and no unresolved gaps');
    if(!closed(e.acceptance,['status','receiptRefs'])||!['not-run','accepted'].includes(e.acceptance.status)||!refs(e.acceptance.receiptRefs)||e.acceptance.status==='accepted'&&(!e.acceptance.receiptRefs.length||e.parity.status!=='accepted-for-profile'))add(p,'acceptance requires profile parity and receipt refs');
    if(!closed(e.publication,['status'])||!['not-confirmed','published'].includes(e.publication.status)||e.publication.status==='published'&&e.acceptance.status!=='accepted')add(p,'publication requires accepted evidence');
  }
  const addresses=new Set<string>();
  for(const [i,api] of s.semanticApi.entries())for(const [j,b] of api.bindings.entries()){
    const p='semanticApi/'+i+'/bindings/'+j,rep=s.representations.find(r=>r.id===b.representationId);
    if([b.codeTransform,b.ownedOccurrence,b.nativeSlotBinding].every(v=>v===undefined))continue;
    const address=[b.representationId,b.ownedOccurrence?b.targetId:b.nativeSlotBinding?'native-slot':'root',b.path].join('|');
    if(addresses.has(address))add(p,'duplicate typed code address');addresses.add(address);
    if(rep?.kind!=='code'||rep.codeEvidence?.version!==1||[b.codeTransform,b.ownedOccurrence,b.nativeSlotBinding].filter(v=>v!==undefined).length!==1||b.transform!==undefined)add(p,'exactly one typed code binding is required; free transform is not allowed');
    if(b.codeTransform!==undefined){
      const t=b.codeTransform;
      if(!record(t)){add(p,'invalid code transform');continue;}
      if(t.version!==1||(t.id==='identity'?!closed(t,['version','id']):t.id!=='enum-map'||!closed(t,['version','id','entries'])||!Array.isArray(t.entries)||!t.entries.length||!api.domain?.length||t.entries.length!==api.domain.length||t.entries.some(e=>!closed(e,['from','to'])||!api.domain?.some(v=>stableHash(v)===stableHash(e.from))||!['string','number','boolean'].includes(typeof e.to)||typeof e.to==='number'&&!Number.isFinite(e.to))||new Set(t.entries?.map(e=>stableHash(e.from))).size!==t.entries?.length))add(p,'unknown transform or incomplete enum map');
      if(!['boolean','string','number','enum'].includes(api.valueType)||!/^props\.[A-Za-z][A-Za-z0-9]*$/.test(b.path)||['props.key','props.ref','props.children','props.elements'].includes(b.path)||b.targetId!==undefined)add(p,'scalar transform requires an explicit public scalar prop');
    }
    if(b.ownedOccurrence!==undefined){
      const o=b.ownedOccurrence;
      if(!closed(o,['version','dependencyId','dependencyBindingId','sourceRepresentationId','collectionResolver','sourceProperty','transformId'])||o.version!==1){add(p,'unknown owned-occurrence binding');continue;}
      const resolver=o.collectionResolver,source=o.sourceProperty;
      if(!record(resolver)||!record(source)){add(p,'invalid owned capture resolver');continue;}
      if(!closed(resolver,['version','source','ownerTargetId','visibility','ordering'])||resolver.version!==1||resolver.source!=='trusted-native-capture'||resolver.visibility!=='captured-effective'||resolver.ordering!=='captured-source-order')add(p,'closed trusted collection resolver required');
      if(!closed(source,['property','propertyType'])||!text(source.property))add(p,'typed source property required');
      const target=s.targets.filter(t=>t.id===b.targetId),owner=s.targets.filter(t=>t.id===resolver.ownerTargetId),figma=s.representations.find(r=>r.id===o.sourceRepresentationId);
      const dependencies=s.dependencies.filter(d=>d.id===o.dependencyId),direct=dependencies[0]?.bindings.filter(d=>d.id===o.dependencyBindingId);
      if(target.length!==1||target[0].resolution!=='resolved'||owner.length!==1||owner[0].resolution!=='resolved'||figma?.kind!=='figma'||figma.platform!==rep?.platform||dependencies.length!==1||direct?.length!==1||direct[0].kind!=='direct-child'||direct[0].targetRole!==target[0].semanticRole||direct[0].ownerTargetRole!==owner[0].semanticRole||!direct[0].representationIds.includes(o.sourceRepresentationId)||!target[0].variantHints?.some(h=>h.representationId===figma.id&&h.pathHint.includes('@source:')))add(p,'owned target requires exact declared direct dependency and source addresses');
      const forms:Record<string,[string,string,string,string]>={
        'owned-button-label.v1':['props.elements[].children','TEXT','content','string'],
        'owned-button-disabled.v1':['props.elements[].disabled','VARIANT','state','enum'],
        'owned-button-primary-first.v1':['props.primaryFirst','VARIANT','appearance','enum']};
      const f=forms[o.transformId];
      if(!f||b.path!==f[0]||source.propertyType!==f[1]||api.kind!==f[2]||api.valueType!==f[3])add(p,'unsupported owned field transformation');
      if(o.transformId==='owned-button-disabled.v1'&&stableHash(api.domain)!==stableHash(['False','True']))add(p,'disabled conversion requires exact False/True domain');
      if(o.transformId==='owned-button-primary-first.v1'&&stableHash(api.domain)!==stableHash(['Primary','Secondary']))add(p,'view conversion requires exact Primary/Secondary domain');
    }
    if(b.nativeSlotBinding!==undefined){
      const n=b.nativeSlotBinding;
      if(!closed(n,['version','figmaRepresentationId','targetId','propertyIdentity','propertyType','codeRepresentationId','codePath','contentPolicy','proof'])||n.version!==1||n.propertyType!=='SLOT'||n.codePath!=='props.children'||n.contentPolicy!=='preserve-ordered-content'||n.proof!=='trusted-native-capture'){add(p,'unknown native SLOT association');continue;}
      const figma=s.representations.find(r=>r.id===n.figmaRepresentationId),targets=s.targets.filter(t=>t.id===n.targetId);
      if(b.path!==n.codePath||b.representationId!==n.codeRepresentationId||b.targetId!==undefined&&b.targetId!==n.targetId||api.kind!=='slot'||api.valueType!=='content'||figma?.kind!=='figma'||figma.platform!==rep?.platform||targets.length!==1||targets[0].resolution!=='resolved'||!text(n.propertyIdentity)||!api.bindings.some(f=>f.representationId===figma.id&&f.path==='component.properties.'+n.propertyIdentity)||!s.slots.some(c=>c.kind==='slot-api'&&c.target===n.targetId&&c.property===n.propertyIdentity&&c.contentOwnership==='external'))add(p,'SLOT association requires an existing exact Figma port/target and ordered children API');
    }
  }
  return errors;
}
export function representationFeatureFlags(s:Shape){
  const scopedDependencies=s.dependencies.some(d=>d.bindings?.some(b=>b.kind==='fixed-nested-scoped'));
  const bindings=scopedDependencies||s.semanticApi.some(p=>p.bindings.some(b=>b.codeTransform!==undefined||b.ownedOccurrence!==undefined||b.nativeSlotBinding!==undefined));
  return {evidence:s.representations.some(r=>r.codeEvidence!==undefined),bindings,scopedDependencies,bindingVersion:scopedDependencies?2 as const:bindings?1 as const:undefined};
}
/** Receipt scope excludes claim/receipt metadata to avoid self-referential hashes;
 * norms, source locators, bindings, profiles, anatomy and dependency pins remain. */
export function representationScopeHash(manual:ManualSource,facts:unknown):string{
  const copy=JSON.parse(JSON.stringify(manual));for(const r of copy.representations)delete r.codeEvidence;
  // Editor audit increments while attaching refs must not make a receipt hash circular.
  delete copy.metadata.revision;delete copy.metadata.updatedAt;delete copy.source.importedAt;
  return stableHash({manual:copy,facts});
}
export function applyCodeTransform(value:JsonValue,t:CodeTransform):string|number|boolean{
  if(t.version!==1)throw new Error('CODE_TRANSFORM_UNSUPPORTED');
  if(t.id==='identity'&&['string','number','boolean'].includes(typeof value))return value as string|number|boolean;
  if(t.id==='enum-map'){const matches=t.entries.filter(e=>stableHash(e.from)===stableHash(value));if(matches.length===1)return matches[0].to;}
  throw new Error('CODE_TRANSFORM_VALUE_UNSUPPORTED');
}
