import type { CompiledContract, ManualSource, PreviewSnapshot, TypedConstraint } from './types';
import { configurationDeclaredTargetReferenceHash } from './declared-target-identity';
import { declaredTargetMembershipKey } from './declared-target-membership';
import { stableHash } from './stable';

const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const unknown = (n: Record<string, any>, fact: string) => (n.unknownFacts || []).some((p: string) => p === fact || fact.startsWith(p + '.') || p.startsWith(fact + '.'));
const key = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v);
export const replacementId = (ruleId: string, role: string) => 'r_' + stableHash({ruleId, role}).slice(0,16);
export function replacementContextMapped(manual: ManualSource, fact: string, value: unknown): boolean {
  return typeof value==='boolean' && manual.rules.some((r,i)=>r.status!=='deprecated'&&r.constraints.some(c=>c.type==='instanceReplacementDomain'
    &&c.replacement&&replacementErrors(manual,i,c).length===0&&fact===`nativeInstanceReplacementsV1.${replacementId(r.id,c.replacement.targetRole)}.sameFamily`));
}
export function replacementErrors(manual: ManualSource, ruleIndex: number, c: TypedConstraint): string[] {
  if (c.type !== 'instanceReplacementDomain') return c.replacement ? ['replacement requires instanceReplacementDomain.'] : [];
  const r=manual.rules[ruleIndex],d=c.replacement,errors:string[]=[];
  if (!d || Object.keys(c).some(k=>!['type','replacement'].includes(k)) || Object.keys(d).some(k=>!['targetRole','alternatives'].includes(k))) return ['Declare one target role and typed alternatives.'];
  const t=manual.targets.filter(t=>t.semanticRole===d.targetRole);
  if (r.permission!=='constrained'||r.capability!=='component.swap'||r.capabilitySet||(r.targetScope||'self')!=='self'
    ||manual.targets.find(t=>t.id===r.targetId)?.semanticRole!=='root'||r.execution?.route!=='predicate'
    ||manual.metadata.declaredTargetConfigurationVersion!==1||t.length!==1||t[0].resolution!=='resolved'
    ||!t[0].identityBindingsV1?.length||t[0].identityBindingsV1.some(b=>b.nodeType!=='INSTANCE'||!b.referencePath||!b.nativeSource)) errors.push('Replacement requires constrained root/self component.swap, configuration v1 and a bound native INSTANCE role.');
  if (!Array.isArray(d.alternatives)||!d.alternatives.length) return [...errors,'Declare component-set alternatives.'];
  const sets=new Set<string>();
  for (const a of d.alternatives) {
    if (!a||!key(a.componentSetKey)||sets.has(a.componentSetKey)||Object.keys(a).some(k=>!['componentSetKey','properties'].includes(k))) {errors.push('Alternative component set keys must be unique canonical keys.');continue;}
    sets.add(a.componentSetKey);
    if (a.properties!==undefined && (!a.properties || typeof a.properties!=='object' || Array.isArray(a.properties) || ![Object.prototype,null].includes(Object.getPrototypeOf(a.properties)))) {errors.push('Alternative properties must be a plain record.');continue;}
    for (const [name,values] of Object.entries(a.properties||{})) if (!name.trim()||name!==name.trim()||/[.#]/.test(name)||['__proto__','constructor','prototype'].includes(name)||!Array.isArray(values)||!values.length||values.some(v=>typeof v!=='string'||!v.trim())||new Set(values).size!==values.length) errors.push('Use exact native VARIANT names and unique string domains.');
  }
  if (manual.rules.filter(other=>other.status!=='deprecated').reduce((count,other)=>count+other.constraints.filter(c=>c.type==='instanceReplacementDomain'&&c.replacement?.targetRole===d.targetRole).length,0)>1) errors.push('One active replacement domain per native role.');
  return errors;
}

export function assertNativeInstanceReplacementPolicy(contract: CompiledContract): void {
  if (contract.runtimePolicy.nativeInstanceReplacementsVersion===undefined) {
    if (contract.capabilities.facts.some(f=>f.startsWith('nativeInstanceReplacementsV1.'))) throw new Error('NATIVE_INSTANCE_REPLACEMENT_POLICY_MISSING');
    return;
  }
  if (contract.runtimePolicy.nativeInstanceReplacementsVersion!==1||contract.runtimePolicy.declaredTargetConfigurationVersion!==1) throw new Error('NATIVE_INSTANCE_REPLACEMENT_UNSUPPORTED');
  const bindings=contract.runtimePolicy.nativeInstanceReplacements||[];
  if (!bindings.length||new Set(bindings.map(b=>b.id)).size!==bindings.length||bindings.some(b=>b.id!==replacementId(b.sourceRuleId,b.targetRole)
    ||!Array.isArray(b.propertyNames)||new Set(b.propertyNames).size!==b.propertyNames.length
    ||b.propertyNames.some(n=>!n||/[.#]/.test(n)||['__proto__','constructor','prototype'].includes(n))
    ||!contract.customizationPolicy.some(p=>p.id===b.sourceRuleId&&p.permission==='constrained'&&p.capability==='component.swap'&&p.status!=='deprecated'))) throw new Error('NATIVE_INSTANCE_REPLACEMENT_BINDINGS');
}

function replacementVariantActivity(contract: CompiledContract,
  root: Record<string,any>, ref: NonNullable<PreviewSnapshot['variantReference']>, ruleId: string): 'active'|'inactive'|'unknown' {
  const policies=contract.customizationPolicy.filter(p=>p.id===ruleId&&p.status!=='deprecated');
  if(policies.length!==1)return 'unknown';
  const scope=policies[0].applicability?.variants;
  if(scope==='all')return 'active';
  if(!scope||typeof scope!=='object'||Array.isArray(scope))return 'unknown';
  const variants=contract.facts.variantEvidence?.variants.filter(v=>v.componentKey===ref.componentKey&&v.componentSetKey===ref.componentSetKey)||[];
  if(variants.length!==1||!['verified','partial'].includes(String(record(root.variantAvailability).status)))return 'unknown';
  const component=record(root.component),source=ref.nodeProperties[''];
  let active=true;
  for(const [property,values] of Object.entries(scope)) {
    const value=variants[0].properties[property];
    if(property.includes('.')||!Array.isArray(values)||!values.length||values.some(v=>typeof v!=='string'||!v.trim())
      ||typeof value!=='string'||unknown(root,`component.properties.${property}`)||unknown(root,`component.propertyTypes.${property}`)
      ||component.propertyTypes?.[property]!=='VARIANT'||source?.propertyTypes?.[property]!=='VARIANT'||ref.propertyTypes[property]!=='VARIANT'
      ||component.properties?.[property]!==value||source.properties?.[property]!==value||ref.properties[property]!==value)return 'unknown';
    if(!values.includes(value))active=false;
  }
  return active?'active':'inactive';
}

/** Observed identity at a root-owned native source address; no domain verdict or name matching. */
export function materializeInstanceReplacements(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  assertNativeInstanceReplacementPolicy(contract);
  if (contract.runtimePolicy.nativeInstanceReplacementsVersion === undefined) return;
  const bindings = contract.runtimePolicy.nativeInstanceReplacements || [];
  for (const n of snapshot.nodes) delete n.nativeInstanceReplacementsV1;
  const roots=snapshot.nodes.filter(n=>snapshot.selection.includes(String(n.id))),root=roots.length===1?roots[0]:undefined;
  if (!root) return;
  const facts:Record<string,any>={};root.nativeInstanceReplacementsV1=facts;
  const rt=contract.facts.targets.find(t=>t.semanticRole==='root'),ref=snapshot.variantReference;
  if (!rt||record(root.declaredTargetMembershipV1)[declaredTargetMembershipKey(rt.id)]!==true||!ref?.complete
    ||snapshot.source?.captureTopology?.complete!==true||snapshot.source.instanceSourceIdentityVersion!==1||snapshot.source.occurrenceAddressVersion!==1) return;
  const identity=record(record(root.component).identity),owner=ref.nodeProperties['']?.identity;
  if (!owner||owner.componentKey!==identity.componentKey||owner.mainComponentId!==identity.mainComponentId||unknown(root,'component.identity')) return;
  const captures=snapshot.source.instanceSourceIdentityCapture?.owners||[];
  const captured=(i:Record<string,any>)=>captures.filter(c=>c.mainComponentId===i.mainComponentId&&c.componentKey===i.componentKey&&c.status==='captured').length===1;
  if (!captured(identity)) return;
  for (const d of bindings) {
    const target=contract.facts.targets.find(t=>t.semanticRole===d.targetRole),matches=target?.identityBindingsV1?.filter(b=>b.componentKey===ref.componentKey&&b.componentSetKey===ref.componentSetKey)||[];
    const f:Record<string,any>={};facts[d.id]=f;
    const activity=replacementVariantActivity(contract,root,ref,d.sourceRuleId);
    if(activity==='inactive'){f.inactive=true;continue;}
    if(activity==='unknown')continue;
    if (record(record(root.variantAvailability).targets)[d.targetRole]?.present===false) {Object.assign(f,{present:false,ownershipKnown:true});continue;}
    if (matches.length!==1) continue;
    const b=matches[0],source=b.nativeSource,expected=ref.nodeProperties[b.referencePath];
    if (!source||b.nodeType!=='INSTANCE'||b.configurationReferenceHash!==configurationDeclaredTargetReferenceHash(ref)
      ||source.ownerComponentKey!==identity.componentKey||ref.nodes.filter(n=>n.path===b.referencePath&&n.type==='INSTANCE').length!==1
      ||expected?.sourceIdentity?.sourceNodeId!==source.sourceNodeId||expected.sourceIdentity.ownerComponentKey!==identity.componentKey
      ||expected.sourceIdentity.ownerMainComponentId!==identity.mainComponentId||!key(expected.identity?.componentSetKey)) continue;
    const nodes=snapshot.nodes.filter(n=>n.type==='INSTANCE'&&!unknown(n,'component.sourceIdentity')&&record(record(n.component).sourceIdentity).version===1
      &&record(record(n.component).sourceIdentity).sourceNodeId===source.sourceNodeId
      &&record(record(n.component).sourceIdentity).ownerComponentKey===identity.componentKey
      &&record(record(n.component).sourceIdentity).ownerMainComponentId===identity.mainComponentId);
    if (nodes.length!==1) continue;
    const node=nodes[0],component=record(node.component),actual=record(component.identity);
    if (unknown(node,'component.identity')||!key(actual.componentKey)||!key(actual.componentSetKey)||!actual.mainComponentId||!captured(actual)) continue;
    Object.assign(f,{present:true,nodeId:node.id,ownershipKnown:true,componentSetKey:actual.componentSetKey,sameFamily:actual.componentSetKey===expected.identity!.componentSetKey,properties:{}});
    for (const name of d.propertyNames) if (!unknown(node,`component.properties.${name}`)&&!unknown(node,`component.propertyTypes.${name}`)
      &&component.propertyTypes?.[name]==='VARIANT'&&typeof component.properties?.[name]==='string'&&component.properties[name].trim()) f.properties[name]=component.properties[name];
  }
}
