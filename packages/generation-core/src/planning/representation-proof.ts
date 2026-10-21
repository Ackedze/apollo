import type { GenerationContext, GenerationView, MappingEntry, Hash } from './types';
/** A stored claim alone grants no authority. Observations must bind the immutable
 * passport basis to the current checkout/registry and full declarations scope. */
export function representationProof(context:GenerationContext,component:GenerationView['components'][number],mapping:MappingEntry,hash:Hash):{api:boolean;profile:boolean}{
  const representation=component.representations.find(r=>r.id===mapping.code.representationId),e=representation?.codeEvidence;
  if(!e)return {api:true,profile:true}; // preserve historical consumer profile
  const observed=context.representationObservations?.filter(o=>o.componentId===component.pin.componentId&&o.representationId===representation.id);
  if(observed?.length!==1)return {api:false,profile:false};
  const o=observed[0],copy=JSON.parse(JSON.stringify(o));delete copy.receiptHash;
  const valid=o.version===1&&hash(copy)===o.receiptHash&&o.scopeHash===component.evidenceScopeHash
    &&o.basisRegistryDigest===e.sourcePin.registryDigest&&o.currentRegistryDigest===context.registry.source?.digest
    &&o.codeHash===hash(context.code)&&e.sourcePin.commit===context.code.package.commit
    &&e.sourcePin.packageName===context.code.package.name&&e.sourcePin.packageVersion===context.code.package.version&&e.sourcePin.mappingId===mapping.id
    &&Array.isArray(o.verifiedRefs)&&Array.isArray(o.acceptedProfileIds)
    &&new Set(o.verifiedRefs.map(r=>r.path)).size===o.verifiedRefs.length;
  const includes=(r:{path:string;sha256:string})=>o.verifiedRefs.some(v=>v.path===r.path&&v.sha256===r.sha256);
  const api=Boolean(valid&&e.availability.status==='confirmed-source-api'&&e.availability.evidenceRefs.length&&e.availability.evidenceRefs.every(includes));
  const profile=Boolean(api&&e.parity.status==='accepted-for-profile'&&!e.parity.unresolvedGapIds.length&&e.acceptance.status==='accepted'
    &&e.acceptance.receiptRefs.length&&e.acceptance.receiptRefs.every(includes)&&mapping.generationProfileId
    &&e.parity.profileIds.includes(mapping.generationProfileId)&&o.acceptedProfileIds.includes(mapping.generationProfileId)
    &&component.generationProfiles?.some(p=>p.id===mapping.generationProfileId&&p.representationId===representation.id&&p.platform===mapping.platform));
  return {api,profile};
}
