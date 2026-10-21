// Draft semantic bridge executed by the trusted Node/Proxy provider only.
const patternCore=require("../packages/pattern-core/dist/index.cjs");
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createPatternAvailabilityPort(context,semanticRoleBindings=[]) {
  return request=>{
    const registry=context.registry,entry=registry.entries.find(e=>e.id===request.entryId);
    const observation=context.producerObservation;
    if(!registry.source||!entry||entry.status!=='verified'||request.registrySha256!==registry.source.digest
      ||!observation||observation.status!=='availability-pass'||observation.registryDigest!==registry.source.digest
      ||observation.lockHash!==registry.source.lockHash)return null;
    // Semantic suitability is an explicit reviewed input; API/name similarity is insufficient.
    const grant=semanticRoleBindings.find(g=>g.entryId===entry.id&&g.registryDigest===registry.source.digest
      &&g.compiledHash===entry.pin.compiledHash&&g.semanticRole===request.semanticRole&&/^[a-f0-9]{64}$/.test(g.evidenceHash));
    if(!grant)return null;
    const representationId=request.target==='figma'?entry.figma.representationId:entry.code.representationId;
    const lock={contractId:entry.pin.contractId,revision:entry.pin.revision,contractSha256:entry.pin.compiledHash,representationId};
    const assurance=entry.assurance;
    if(!assurance||assurance.apiMapping!=='confirmed-source-api'||assurance.fullContractParity!=='not-confirmed')return null;
    const targets=['frontend'];
    if(entry.figma.handlerId&&(!entry.actions||entry.actions.figmaHandlerId)&&Object.values(entry.slots).every(slot=>slot.figma))targets.push('figma');
    return {entryId:entry.id,status:'confirmed',registrySha256:registry.source.digest,
      code:{package:'arui-private',version:registry.package.version,commit:registry.package.commit,subpath:entry.code.module,
        exportName:entry.code.exportName,files:entry.evidenceFiles.map(path=>({path,sha256:registry.package.files[path]}))},
      lock,platforms:[entry.platform],targets,semanticRoles:[grant.semanticRole],
      inputs:Object.keys(entry.props).concat(entry.actions?[entry.actions.port]:[]),slots:Object.keys(entry.slots),
      readiness:{apiMapping:assurance.apiMapping,contractCoverage:'not-verified',fullContractParity:assurance.fullContractParity,
        codeRepresentation:assurance.codeRepresentation,builtPackage:assurance.builtPackage,
        liveAcceptance:'not-run',release:assurance.release}};
  };
}
function preparePatternAttachments({requests,context,hash,readSource,semanticRoleBindings=[]}) {
  const attachments=[],availability=createPatternAvailabilityPort(context,semanticRoleBindings);
  for(const request of requests) {
    const sources=patternCore.verifySources(request.pattern,readSource);
    if(sources.status!=='passed'||!sources.receipt)fail('PATTERN_SOURCE_UNVERIFIED');
    const prepared=patternCore.prepareRequirements(request.pattern,request.context,{platform:request.platform,target:request.target,
      sourceReceipt:sources.receipt,availability});
    if(!prepared.requirements)fail(prepared.status==='unresolved'?'PATTERN_CONTEXT_UNRESOLVED':'PATTERN_INPUT_INVALID');
    if(prepared.requirements.executionAllowed!==false||prepared.requirements.status!=='draft')fail('PATTERN_PROMOTION_REJECTED');
    attachments.push({schemaVersion:'apollo.pattern-plan-attachment.v1-draft',requirements:prepared.requirements,
      requirementsHash:hash(prepared.requirements),sourceReceipt:sources.receipt,nodeBindings:request.nodeBindings||[]});
  }
  return JSON.parse(JSON.stringify(attachments));
}
module.exports={preparePatternAttachments,createPatternAvailabilityPort};
