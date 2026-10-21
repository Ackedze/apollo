// Offline proposal DTO and observational content checks; never an accepted port.
'use strict';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const clone=x=>JSON.parse(JSON.stringify(x));
function proposalFor({source,mapping,input,producer,dependencySources,apiEvidence,hash}){
 const m=source.manual,f=source.variantEvidence,figma=m.representations.find(r=>r.id===mapping.figma.representationId),code=m.representations.find(r=>r.id===mapping.code.proposedRepresentationId);
 if(!figma||figma.kind!=='figma'||figma.locator.componentKey!==mapping.figma.componentKey||m.metadata.revision!==input.revision||!code||code.status!=='draft'||code.codeEvidence.sourcePin.registryDigest!==producer.basisRegistryDigest||hash(f)!==input.authoritativeFullFactsHash)fail('NATIVE_PROPOSAL_SOURCE_STALE');
 const typed=m.semanticApi.flatMap(p=>p.bindings.filter(b=>b.representationId===code.id).map(binding=>Object.assign({portId:p.id},binding)));
 if(hash(typed)!==hash(input.typedBindings))fail('NATIVE_PROPOSAL_BINDING_STALE');
 const p={schemaVersion:'apollo.native-recipe-proposal.v1',status:'proposed',executable:false,mappingId:mapping.id,componentId:input.componentId,platform:figma.platform,
  representation:{id:figma.id,status:figma.status,componentKey:figma.locator.componentKey,componentSetKey:figma.locator.componentSetKey||null},
  source:{revision:input.revision,archivePath:input.archivePath,archiveSha256:input.archiveSha256,manualSourceHash:input.manualSourceHash,compiledHash:input.compiledHash,factsHash:input.authoritativeFullFactsHash,representationScopeHash:input.representationScopeHash,sourceStatus:input.sourcePredicateStatus,basisRegistryDigest:producer.basisRegistryDigest,currentRegistryDigest:producer.currentRegistryDigest,currentInputsDigest:producer.currentInputsDigest},
  definition:null,slot:null,actions:null,capability:{documentation:'documented',installedSlot:apiEvidence.installed.probes.slot.status,installedProperties:apiEvidence.installed.probes.properties.status,referenceTypes:apiEvidence.candidate?.probes.reference.status||'unknown',runtime:'unknown',live:'not-run',typeEvidenceHash:hash(apiEvidence)},
  rollback:{scope:'new-roots-only',requireBeforeMutation:['created-root IDs','owned-descendant IDs','page ID','plan hash','definition hash','original parent/order/absoluteTransform of all external content'],foreignContent:'preserve-or-report-incomplete',resetSlot:'default-content-only; never empty-content or transaction rollback'},
  missingInputs:['accepted source/profile/recipe receipt','fresh independent canonical reference/capture','exact plan action/state/event inputs','live capability and reset/rollback receipts'],acceptance:'not-run',receiptHash:null};
 if(mapping.kind==='corporate-content'){
  const slots=typed.filter(b=>b.nativeSlotBinding);if(slots.length!==1)fail('NATIVE_PROPOSAL_SLOT_MISSING');const b=slots[0],s=b.nativeSlotBinding,t=m.targets.find(t=>t.id===s.targetId),rules=m.rules.filter(r=>r.targetId===s.targetId&&r.controlPaths.some(c=>c.kind==='slot-api'&&c.property===s.propertyIdentity&&c.contentOwnership==='external'));
  if(!t||t.resolution!=='resolved'||s.figmaRepresentationId!==figma.id||s.propertyIdentity!==mapping.figma.bodyProperty||rules.length!==1)fail('NATIVE_PROPOSAL_SLOT_MISSING');
  p.definition={operation:'PluginAPI.importComponentByKeyAsync',key:figma.locator.componentKey,selectedVariants:[]};
  p.slot={portId:b.portId,targetId:s.targetId,propertyIdentity:s.propertyIdentity,propertyType:s.propertyType,sourceNodeId:null,targetAddress:clone(t),sourceBinding:clone(b),ruleIds:rules.map(r=>r.id),lookup:'unique direct native SLOT + exact slotContentId + independent canonical reference',
   proposedOperations:['SlotNode.appendChild','SceneNode.remove','SlotNode.resetSlot'],contentProof:{version:1,required:['same owner/source/slot property and identity','complete direct child IDs; no omitted slot content','exact expected child IDs/order, including empty','mapped plan provenance for each child','actual limitViolations empty','baseline unchanged outside external SLOT']}};
  p.missingInputs.push('authoritative native SLOT sourceNodeId/property-reference typing','runtime insert/remove/reset support on real source-bound instance');
 }else if(mapping.kind==='buttons-group'){
  const variants=f.variants.filter(v=>v.componentSetKey===figma.locator.componentKey&&v.properties.Size==='56');if(variants.length!==2||new Set(variants.map(v=>v.properties.Overflow)).size!==2)fail('NATIVE_PROPOSAL_VARIANT_MISSING');
  p.definition={operation:'PluginAPI.importComponentSetByKeyAsync',key:figma.locator.componentKey,selectedVariants:variants.map(v=>({componentKey:v.componentKey,properties:clone(v.properties)}))};
  const owned=typed.filter(b=>b.ownedOccurrence),targets=Array.from(new Set(owned.map(b=>b.targetId)));
  if(targets.length!==4||owned.length!==12)fail('NATIVE_PROPOSAL_OCCURRENCES_MISSING');
  const occurrences=targets.map(id=>{const target=m.targets.find(t=>t.id===id),bindings=owned.filter(b=>b.targetId===id),o=bindings[0].ownedOccurrence,d=m.componentDependencies.find(d=>d.id===o.dependencyId),direct=d?.bindings.find(b=>b.id===o.dependencyBindingId),dependency=dependencySources.find(s=>s.manual.component.id===d?.componentId||s.manual.component.componentId===d?.componentId),depRep=dependency?.manual.representations.find(r=>r.kind==='figma'&&r.platform===figma.platform&&r.surface==='default');
   if(!target||!direct||direct.kind!=='direct-child'||!depRep)fail('NATIVE_PROPOSAL_DEPENDENCY_MISSING');
   const addresses=variants.map(v=>{const hint=target.variantHints.filter(h=>h.representationId===figma.id&&h.componentKey===v.componentKey);if(hint.length!==1)fail('NATIVE_PROPOSAL_ADDRESS_MISSING');const segments=hint[0].pathHint.split(' / '),last=segments[segments.length-1];if(!last.startsWith('@source:'))fail('NATIVE_PROPOSAL_ADDRESS_MISSING');return {variantKey:v.componentKey,path:hint[0].pathHint,sourceNodeId:decodeURIComponent(last.slice(8)),symbolId:null};});
   return {targetId:id,ownerTargetId:o.collectionResolver.ownerTargetId,dependencyId:d.id,dependencyBinding:clone(direct),dependencyPin:{componentId:d.componentId,revision:d.revision,manualSourceHash:d.manualSourceHash,compiledHash:d.compiledHash},componentSetKey:depRep.locator.componentSetKey,sourceAddresses:addresses,sourceBindings:clone(bindings)};
  });
  p.actions={operation:'InstanceNode.setProperties',visibilityOperation:'SceneNode.visible',occurrences,proof:{resolver:'canonical resolveDirectChildBinding + projectOwnedCodeCollection',visibility:'captured-effective',ordering:'captured-source-order',actionAssignment:'explicit target/source occurrence per action ID; no label or ordinal inference',handlers:'external accepted scenario only',priority:'explicit scenario only'},missingSymbols:'fresh canonical main component key/id and source identity required; symbolId is host metadata, not a Plugin API getter'};
  p.missingInputs.push('fresh source identity/symbol and per-occurrence reference proof','explicit action IDs → target/source occurrences; visibility intent','scenario/prototype operation recipe; no handler inference');
 }else fail('NATIVE_PROPOSAL_KIND_UNSUPPORTED');
 return clone(p);
}
function assertProposal(proposal,inputs){const expected=proposalFor(inputs);if(inputs.hash(proposal)!==inputs.hash(expected))fail('NATIVE_PROPOSAL_TAMPERED');return {status:'proposed',executable:false};}
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const closed=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
// Observational assertion only; cannot attest a real native read or grant authority.
function assertSlotContentProof(proof,expected){
 if(!closed(proof,['version','ownerId','slotId','type','propertyIdentity','referenceHash','complete','omittedContent','children','limitViolations'])||proof.version!==1||![proof.ownerId,proof.slotId,proof.propertyIdentity].every(nonempty)||!digest(proof.referenceHash)||proof.type!=='SLOT'||proof.ownerId!==expected.ownerId||proof.slotId!==expected.slotId||proof.propertyIdentity!==expected.propertyIdentity||proof.referenceHash!==expected.referenceHash||proof.complete!==true||proof.omittedContent!==false)fail('NATIVE_SLOT_PROOF_UNCONFIRMED');
 if(!Array.isArray(proof.children)||!Array.isArray(expected.children)||!proof.children.every(nonempty)||!expected.children.every(nonempty)||new Set(expected.children).size!==expected.children.length||new Set(proof.children).size!==proof.children.length||proof.children.length!==expected.children.length||proof.children.some((id,i)=>id!==expected.children[i])||!Array.isArray(expected.mappedIds)||!expected.mappedIds.every(nonempty)||new Set(expected.mappedIds).size!==expected.mappedIds.length||proof.children.some(id=>!expected.mappedIds.includes(id)))fail('NATIVE_SLOT_CONTENT_MISMATCH');
 if(!Array.isArray(proof.limitViolations)||proof.limitViolations.length)fail('NATIVE_SLOT_LIMITS_UNCONFIRMED');return {status:'observational-only',empty:proof.children.length===0};
}
function requireExecutableSlotCapability(proposal){if(proposal.capability.installedSlot!=='type-supported'||proposal.capability.referenceTypes!=='type-supported')fail('FIGMA_SLOT_API_UNSUPPORTED');fail('FIGMA_SLOT_CAPABILITY_NOT_ACCEPTED');}
module.exports={proposalFor,assertProposal,assertSlotContentProof,requireExecutableSlotCapability};
