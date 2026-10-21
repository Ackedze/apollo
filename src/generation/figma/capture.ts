import { captureInstanceAudit, collectNodes } from "../../../packages/component-contract-core/src/figma-capture";
import { allowedComponentPropertyNames } from "../../../packages/component-contract-core/src/instance-validation";
import { nativeSlotCapturePlan } from "../../../packages/component-contract-core/src/native-slot-capture";
import type { NativeCapturePort } from "../native/bindings";
import type { MappingEntry } from "../../../packages/generation-core/src/planning";
import type { CompiledContract } from "../../../packages/component-contract-core/src/types";
type Runtime = {
  contractHash(value: unknown): string;
  loadAuthoringSource(source: unknown): {sourceHash:string;contract:CompiledContract};
  loadRuntimeContract(contract: unknown): CompiledContract;
  collectContractKeys(contract: CompiledContract): Set<string>;
  componentDependencyKeys(contract: CompiledContract): string[];
  auditContractSnapshot(snapshot: unknown, contract: CompiledContract): any;
};
function fail(code:string):never {throw Object.assign(new Error(code),{code});}
export function createGenerationNativeCapture(runtime:Runtime,resolveContract:(mapping:MappingEntry)=>Promise<any>):NativeCapturePort {
  return {
    async loadScope(mapping) {
      const response=await resolveContract(mapping);
      if(!response?.releaseId||!Array.isArray(response.contracts)||!Array.isArray(response.resolutions)
        ||response.resolutions.length!==1||response.resolutions[0].status!=='resolved'
        ||response.resolutions[0].componentKey!==mapping.figma.componentKey||response.resolutions[0].contractId!==mapping.pin.contractId)fail('FIGMA_CAPTURE_SCOPE_UNAVAILABLE');
      const matches=response.contracts.filter((item:any)=>item.release?.contractId===mapping.pin.contractId);
      if(matches.length!==1)fail('FIGMA_CAPTURE_SCOPE_UNAVAILABLE');
      const item=matches[0],loaded=runtime.loadAuthoringSource(item.source),contract=loaded.contract;
      if(item.release.id!==response.releaseId||item.release.sourceHash!==loaded.sourceHash
        ||item.release.contractHash!==runtime.contractHash(contract)||item.release.contractHash!==mapping.pin.compiledHash
        ||item.release.manualSourceHash!==mapping.pin.manualSourceHash||contract.package.manualSourceHash!==mapping.pin.manualSourceHash
        ||contract.package.componentId!==mapping.pin.componentId||contract.package.id!==mapping.pin.contractId||item.source.manual.metadata.revision!==mapping.pin.revision
        ||(contract.package.manualRevision!==undefined&&contract.package.manualRevision!==mapping.pin.revision)||!runtime.collectContractKeys(contract).has(mapping.figma.componentKey))fail('FIGMA_CAPTURE_SCOPE_STALE');
      return contract;
    },
    async capture(subject,mapping,inputContract) {
      const contract=runtime.loadRuntimeContract(inputContract);
      if(runtime.contractHash(contract)!==mapping.pin.compiledHash)fail('FIGMA_CAPTURE_SCOPE_STALE');
      const captured=await captureInstanceAudit(subject,{componentKey:contract.facts.component.componentKey,
        acceptedComponentKeys:Array.from(runtime.collectContractKeys(contract)),componentDependencyKeys:runtime.componentDependencyKeys(contract),
        directChildDependenciesVersion:contract.runtimePolicy.directChildDependenciesVersion,
        instanceMainComponentAliasesVersion:contract.runtimePolicy.instanceMainComponentAliasesVersion,
        representations:contract.facts.representations,allowedComponentProperties:allowedComponentPropertyNames(contract),
        platform:contract.facts.component.platform,manualSourceHash:contract.package.manualSourceHash,expectedRootNodeId:subject.id,
        nativeSlotCapturePlan:nativeSlotCapturePlan(contract),captureTransitionContext:contract.runtimePolicy.transitionFactsVersion===1});
      async function assertCurrent() {
        if(subject.removed)fail('FIGMA_CAPTURE_STALE');
        const plan=nativeSlotCapturePlan(contract),omissions=captured.snapshot.source?.nativeSlotCaptureScope?.omissions||[];
        const scope=omissions.length?{manualSourceHash:contract.package.manualSourceHash,boundaries:(plan?.boundaries||[]).filter(b=>omissions.some(o=>o.targetId===b.targetId&&o.property===b.property&&o.path===b.path))}:undefined;
        const now=await collectNodes(subject,captured.snapshot.context.platform,Object.assign({},subject.resolvedVariableModes),scope);
        if(runtime.contractHash(now.anatomy)!==runtime.contractHash(captured.anatomy))fail('FIGMA_CAPTURE_STALE');
      }
      await assertCurrent();
      const result=runtime.auditContractSnapshot(captured.snapshot,contract),checks=[];
      for(const evaluation of result.engine.evaluations) {
        const uncertain=evaluation.trace?.reason==='selector matched no visible nodes'||evaluation.trace?.reason==='rule authority is not active'||evaluation.collection?.missing?.length;
        const status=evaluation.classification==='violation'?'failed':uncertain?'unknown':['compliant','allowed'].includes(evaluation.classification)?'passed':evaluation.classification==='not-applicable'?'not-applicable':'unknown';
        checks.push({id:evaluation.ruleId,componentId:evaluation.dependency?.componentId||contract.package.componentId,status:status as 'passed'|'failed'|'unknown'|'not-applicable',evidenceHash:runtime.contractHash(evaluation)});
      }
      const diagnostics=[];
      if(!result.coverage.executionComplete||captured.warnings.length)diagnostics.push({code:'FIGMA_CAPTURE_COVERAGE_INCOMPLETE',stage:'execution' as const,target:'figma' as const,
        message:'Canonical capture retains unknown/pending/non-executable coverage or warnings; source-rule acceptance is incomplete.'});
      return {facts:{snapshot:captured.snapshot,result,warnings:captured.warnings},checks,diagnostics,assertCurrent};
    },
  };
}
