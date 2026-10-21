// Trusted Node/Proxy boundary. Never bundle filesystem/git or pattern-core in Figma.
const fs=require('node:fs'),path=require('node:path');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createCodeConnectReader({repo,catalog,workspaceRoot=path.dirname(repo),hash,loadSources,
  patternRequests=[],readPatternSource,semanticRoleBindings=[]}) {
  const directory=path.join(repo,'tools/code-connect');
  const readProducer=require("./generation-current-producer").loadCurrentProducer;
  const planning=require("../packages/generation-core/dist/planning.cjs");
  const load=loadSources||require("./generation-package-inputs").loadPinnedGenerationInputs;
  return async function readContext(spec) {
    if(planning.validateScreenSpec(spec).length)fail('SCREEN_SCHEMA');
    const producer=readProducer({repo,workspaceRoot,hash}),{bridge,registry,lock}=producer;
    const selected=Array.from(new Set(spec.nodes.filter(n=>n.kind==='component').map(n=>n.mappingId))),roots=[];
    for(const id of selected) {
      const m=bridge.resolve(registry,id,spec.platform),file=path.resolve(workspaceRoot,m.contract.archivePath);
      if(path.dirname(file)!==path.resolve(catalog))fail('CONTRACT_CATALOG_MISMATCH');
      roots.push({name:path.basename(file),archiveSha256:m.contract.archiveSha256});
    }
    const inventory=await load(catalog,roots),view=planning.projectGenerationView(inventory,hash);
    const normalized=planning.normalizeCodeConnect(registry,lock,view,selected,hash),code=planning.codeObservationFromProducer(normalized);
    const stateReceipts=[];let inputObservation;
    for(const state of spec.states.values) {
      const node=planning.screenSpecForProducer(spec,registry,normalized,state);
      // Use the producer's real freshness/API gate, never its offline prepare helper.
      const receipt=bridge.preflight(registry,node,lock,{repo,workspaceRoot});
      if(receipt.status!=='availability-pass'||receipt.targetProduct!=='apollo-v4'||receipt.fullContractParity!=='not-confirmed')fail('PRODUCER_PREFLIGHT_REJECTED');
      if(registry.registryVersion==='1.1.0'){const observed=receipt.inputObservation,expected={version:1,basisRegistryDigest:registry.authoringBasis.registryDigest,currentRegistryDigest:registry.registryDigest,currentInputsDigest:hash(registry.currentInputs),codeRepresentations:'draft',acceptance:'not-run',proofScope:'source-api-freshness-only'};if(!observed||hash(observed)!==hash(expected))fail('PRODUCER_INPUT_OBSERVATION_REQUIRED');inputObservation=observed;}
      stateReceipts.push({state,preparedHash:hash(receipt.prepared)});
    }
    const observation={schemaVersion:'apollo.code-connect-observation.v1-experimental',status:'availability-pass',
      targetProduct:'apollo-v4',fullContractParity:'not-confirmed',registryDigest:registry.registryDigest,
      lockHash:hash(lock),specHash:hash(spec),codeHash:hash(code),stateReceipts};
    if(inputObservation)observation.inputObservation=inputObservation;
    observation.receiptHash=hash(observation);
    const context={view,registry:normalized,code,producerObservation:observation};
    const representationEvidence=require("./generation-representation-evidence").readRepresentationEvidence({view,registry:normalized,code,repo,hash});
    if(representationEvidence.observations.length)context.representationObservations=representationEvidence.observations;
    if(patternRequests.length) {
      if(!readPatternSource)fail('PATTERN_SOURCE_PORT_UNAVAILABLE');
      context.patterns=require("./generation-pattern-inputs").preparePatternAttachments({requests:patternRequests,
        context,hash,readSource:readPatternSource,semanticRoleBindings});
    }
    // Reject concurrent registry/source edits before crossing the trusted boundary.
    if(bridge.loadRegistry().registryDigest!==registry.registryDigest)fail('STALE_MAPPING_LOCK');
    bridge.verifyLock(registry,JSON.parse(fs.readFileSync(path.join(directory,'registry/lock.v1.json'),'utf8')));
    bridge.verifySource(registry,repo,workspaceRoot);
    producer.assertCurrent();representationEvidence.assertCurrent();
    return context;
  };
}
module.exports={createCodeConnectReader};
