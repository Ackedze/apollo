import { materializeDependencyUsages } from './dependency-usage';
import { materializeTextContent, assertNativeRuleFactPolicies } from './text-content-facts';
import { materializeNativeTargetProperties } from './declared-target-identity';
import { assertConfiguredPropertyContract, materializeConfiguredNativeProperties, configuredCaptureUnknowns } from './configured-native-property';
import { representationEvidenceErrors, representationFeatureFlags, contractRepresentationShape } from './representation-evidence';
// The canonical Predicate Engine is JavaScript-owned by Apollo; the browser build
// substitutes only its Node bootstrap while preserving the interpreter itself.
// @ts-ignore No TypeScript declarations are shipped by Apollo yet.
import { evaluateRules, snapshotHash } from '../predicate/index.js';
import type { CompiledContract, PreviewSnapshot } from './types';
import { materializeSemanticFacts } from './semantic-facts';
import { materializeValidationIntent } from './validation-intent';
import { materializeValidationMode } from './validation-mode';
import { materializeComponentFacts } from './component-facts';
import { assertDeclaredTargetContract, materializeDeclaredTargetIdentities, assertNativeSourceContinuityContract, materializeNativeSourceTargets } from './declared-target-identity';
import { materializeVariantFacts, materializeVerifiedVariantTargets } from './variant-facts';
import { materializeDependencyFacts } from './dependency-facts';
import { materializeInstanceContentReferences } from './instance-content-reference';
import { materializeTargetResolution, TARGET_RESOLUTION_SCHEMA } from './target-resolution';
import { materializeGradientPaintEvidence } from './gradient-paint-facts';
import { dependencyPinIssue, resolveFixedNestedBinding, validatedDependencyCapture, COMPONENT_DEPENDENCY_DEPTH_LIMIT, validateComponentDependencies } from './component-dependencies';
import { stableHash } from './stable';
import type { DependencyOwnerBaseline } from './component-dependencies';
import { materializeRuleScopeFacts } from './rule-scope-facts';
import { materializeInstanceReplacements } from './native-instance-replacements';
import { materializeDependencyComposition } from './dependency-composition';
import { materializeTargetSemanticFacts } from './semantic-target-facts';
import { materializeTransitionFacts } from './transition-facts';
import { materializePaintBindings } from './paint-binding-facts';
import { materializeSlotTargets } from './slot-target-facts';
import { materializeLibraryText } from './library-text-facts';
import { materializeTextStyleBindings } from './text-style-facts';
import { materializeTextBindingIdentities } from './text-binding-identity';
import { materializeStructuralOrder } from './structural-order';
import { materializeVariantTextTargets } from './variant-text-targets';
import { materializeLineHeightReferences } from './line-height-reference';
import { validateNativeSlotCaptureScope } from './native-slot-capture';
import { materializeMemberCollections, memberCollectionSummary } from './member-collections';
import { configureInstanceMainAliases, restoreInstanceMainAliasBaseline } from './instance-main-aliases';

export function prepareValidationSnapshot(source: PreviewSnapshot, contract: CompiledContract, inheritedMainAliases?: 1, ownerBaseline?: DependencyOwnerBaseline): PreviewSnapshot {
  // Evaluate the same JSON-compatible facts that are exported for replay.
  // A cached hash from another context must never determine evaluation identity.
  assertDeclaredTargetContract(contract);
  assertNativeSourceContinuityContract(contract);
  assertNativeRuleFactPolicies(contract);
  assertConfiguredPropertyContract(contract);
  const shape=contractRepresentationShape(contract),flags=representationFeatureFlags(shape);
  if(flags.evidence||flags.bindings||contract.runtimePolicy.representationEvidenceVersion!==undefined||contract.runtimePolicy.crossRepresentationBindingsVersion!==undefined){
    if((contract.runtimePolicy.representationEvidenceVersion!==undefined&&contract.runtimePolicy.representationEvidenceVersion!==1)||contract.runtimePolicy.crossRepresentationBindingsVersion!==flags.bindingVersion||representationEvidenceErrors(shape).length||flags.evidence!==(contract.runtimePolicy.representationEvidenceVersion===1))throw new Error('REPRESENTATION_RUNTIME_UNSUPPORTED');
    if(flags.scopedDependencies&&validateComponentDependencies({component:contract.facts.component,targets:contract.facts.targets,representations:contract.facts.representations,componentDependencies:contract.componentDependencies}).length)throw new Error('COMPONENT_DEPENDENCY_RUNTIME_UNSUPPORTED');
  }
  const snapshot = JSON.parse(JSON.stringify(source)) as PreviewSnapshot & { snapshotHash?: string };
  delete snapshot.snapshotHash;
  const mainAliases=contract.runtimePolicy.instanceMainComponentAliasesVersion===1 || inheritedMainAliases===1;
  configureInstanceMainAliases(snapshot,mainAliases);
  if(mainAliases)restoreInstanceMainAliasBaseline(snapshot);
  // The verified enclosing context supersedes standalone defaults; more-local references run below.
  if (ownerBaseline) for (const node of snapshot.nodes) {
    const baseline=ownerBaseline[String(node.id)];
    if (baseline) {
      node.unknownFacts=(node.unknownFacts as string[]||[]).filter(f=>f!=='baseline.effective'&&!f.startsWith('baseline.effective.'));
      node.baseline={effective:JSON.parse(JSON.stringify(baseline.effective))};
      node.baselineProvenance=JSON.parse(JSON.stringify(baseline.provenance));
    }
  }
  validateNativeSlotCaptureScope(snapshot, contract);
  materializeValidationMode(snapshot, contract);
  materializeSemanticFacts(snapshot, contract);
  materializeValidationIntent(snapshot, contract);
  if (!contract.facts.variantEvidence && (snapshot.targetResolution?.schemaVersion === TARGET_RESOLUTION_SCHEMA
    || contract.runtimePolicy.ruleScopeFactsVersion === 1)) materializeTargetResolution(snapshot, contract);
  // Old exported contracts keep their original snapshot/hash semantics on replay.
  if (['variant-facts-v3', 'variant-facts-v4', 'dependency-facts-v5'].includes(contract.package.snapshotProfile || '')) materializeVariantFacts(snapshot, contract);
  if (['variant-facts-v4', 'dependency-facts-v5'].includes(contract.package.snapshotProfile || '')) materializeInstanceContentReferences(snapshot);
  if (ownerBaseline) for (const node of snapshot.nodes) {
    const baseline=ownerBaseline[String(node.id)];
    if (baseline?.unknownFacts?.length && stableHash(node.baselineProvenance)===stableHash(baseline.provenance))
      node.unknownFacts=[...new Set([...(node.unknownFacts as string[]||[]),...baseline.unknownFacts])];
  }
  materializeVerifiedVariantTargets(snapshot, contract);
  materializeVariantTextTargets(snapshot, contract);
  materializeNativeSourceTargets(snapshot, contract);
  materializeLineHeightReferences(snapshot, contract);
  materializeSlotTargets(snapshot, contract);
  materializeDeclaredTargetIdentities(snapshot, contract);
  materializeInstanceReplacements(snapshot, contract);
  materializeNativeTargetProperties(snapshot, contract);
  materializeTextContent(snapshot, contract);
  if (['component-facts-v2', 'variant-facts-v3', 'variant-facts-v4', 'dependency-facts-v5'].includes(contract.package.snapshotProfile || '')) materializeComponentFacts(snapshot, contract);
  if (contract.package.snapshotProfile === 'dependency-facts-v5') materializeDependencyFacts(snapshot, contract);
  if (contract.runtimePolicy.gradientPaintFactsVersion === 1) materializeGradientPaintEvidence(snapshot);
  if (contract.runtimePolicy.paintBindingFactsVersion === 1) materializePaintBindings(snapshot);
  materializeTextStyleBindings(snapshot, contract);
  materializeTextBindingIdentities(snapshot, contract);
  if (contract.runtimePolicy.ruleScopeFactsVersion === 1) materializeRuleScopeFacts(snapshot, contract);
  materializeTargetSemanticFacts(snapshot, contract);
  materializeStructuralOrder(snapshot, contract);
  materializeLibraryText(snapshot, contract);
  materializeDependencyComposition(snapshot, contract);
  materializeMemberCollections(snapshot, contract);
  materializeTransitionFacts(snapshot,contract,before=>prepareValidationSnapshot(before,{
    ...contract,runtimePolicy:{...contract.runtimePolicy,transitionFactsVersion:undefined},
  }));
  if (contract.runtimePolicy.configuredNativePropertyConformanceVersion === 1) materializeConfiguredNativeProperties(source, snapshot, contract);
  materializeDependencyUsages(snapshot, contract, prepareValidationSnapshot);
  return snapshot;
}

export function validationSnapshotHash(snapshot: PreviewSnapshot, contract: CompiledContract): string {
  return snapshotHash(prepareValidationSnapshot(snapshot, contract));
}

export function prepareAuthoringPreviewContract(contract: CompiledContract): CompiledContract {
  return {
    ...contract,
    rules: contract.rules.map((rule) => {
      const authority = rule.authority as Record<string, unknown> | undefined;
      if (authority?.status !== 'draft') return rule;
      return {
        ...rule,
        authority: { ...authority, status: 'active' },
      };
    }),
  };
}

export function evaluateCompiledContract(
  snapshot: PreviewSnapshot,
  contract: CompiledContract,
  ancestry: string[] = [],
  inheritedMainAliases?: 1,
  ownerBaseline?: DependencyOwnerBaseline,
): Record<string, unknown> {
  const mainAliases=contract.runtimePolicy.instanceMainComponentAliasesVersion===1 || inheritedMainAliases===1 ? 1 : undefined;
  const prepared=prepareValidationSnapshot(snapshot,contract,mainAliases,ownerBaseline);
  const result=evaluateRules({
    snapshot: prepared as unknown as Record<string, unknown>,
    rules: contract.rules,
    ruleRelease: contract.package.manualSourceHash,
  }) as unknown as Record<string, unknown>;
  configuredCaptureUnknowns(result, contract);
  if (contract.runtimePolicy.memberCollectionsVersion === 1) {
    const rulesById = new Map<string, CompiledContract['rules'][number]>();
    const nodesById = new Map<unknown, typeof prepared.nodes[number]>();
    for (const rule of contract.rules) if (!rulesById.has(rule.ruleId)) rulesById.set(rule.ruleId, rule);
    for (const node of prepared.nodes) if (!nodesById.has(node.id)) nodesById.set(node.id, node);
    const root = nodesById.get(prepared.selection[0]);
    for (const evaluation of result.evaluations as Array<Record<string, any>>) {
      const rule = rulesById.get(evaluation.ruleId), id = (rule?.presentation as any)?.collectionId;
      const fact = id && (root?.memberCollectionsV1 as any)?.[id];
      if (!fact) continue;
      evaluation.collection = {id, ...fact, summary:memberCollectionSummary(fact)};
      if (evaluation.classification === 'violation') {
        evaluation.focusNodeId = fact.violations?.find((v: any) => v.nodeId)?.nodeId || fact.ownerNodeId || evaluation.focusNodeId;
        evaluation.focusNodeName = nodesById.get(evaluation.focusNodeId)?.name || evaluation.focusNodeName;
      }
    }
  }
  if (!contract.componentDependencies?.length) return result;
  const runs: Array<Record<string,unknown>>=[];
  const evaluations=(result.evaluations as Array<Record<string,unknown>>).slice();
  const ancestors=[...ancestry,contract.package.componentId];
  const claimedChildren=new Set<string>();
  for(const d of contract.componentDependencies) {
    if (!d.bindings.length) continue;
    const issue=d.issue||dependencyPinIssue(d,d.contract)
      ||(ancestors.includes(d.componentId)?'dependency-cycle':ancestors.length>COMPONENT_DEPENDENCY_DEPTH_LIMIT?'dependency-depth-limit':undefined);
    for(const b of d.bindings) {
      const run:Record<string,unknown>={dependencyId:d.id,bindingId:b.id,componentId:d.componentId,revision:d.revision,compiledHash:d.compiledHash};
      runs.push(run);
      if(issue){Object.assign(run,{status:'not-executed',reason:issue});continue;}
      const resolved=resolveFixedNestedBinding(prepared,d,b,false,contract);
      if(resolved.status==='inactive'){Object.assign(run,{status:'not-applicable',reason:resolved.reason});continue;}
      Object.assign(run,{nodeId:resolved.nodeId});
      if(resolved.status!=='active'||!resolved.nodeId||!resolved.identityValid){Object.assign(run,{status:'not-executed',reason:resolved.identityValid===false?'dependency-child-identity-mismatch':resolved.reason});continue;}
      if(contract.runtimePolicy.directChildDependenciesVersion===1){
        if(claimedChildren.has(resolved.nodeId)){Object.assign(run,{status:'not-executed',reason:'dependency-child-claimed-twice'});continue;}
        claimedChildren.add(resolved.nodeId);
      }
      const capture=validatedDependencyCapture(prepared,resolved.nodeId,d.contract!);
      if(!capture.snapshot||!capture.nodeMap){Object.assign(run,{status:'not-executed',reason:capture.reason});continue;}
      // Child contract remains read-only and component-scoped. Do not elevate its authority.
      const output=evaluateCompiledContract(capture.snapshot,d.contract!,ancestors,mainAliases,capture.ownerBaseline);
      const childEvaluations=output.evaluations as Array<Record<string,unknown>>;
      const unsupported=d.contract!.nonExecutableRules.length || d.contract!.customizationPolicy.some(p=>p.status!=='deprecated'&&['delegated','context-only'].includes(p.execution.route));
      const incomplete=unsupported || childEvaluations.some(e=>['not-executed','human-review','not-evaluable','unknown'].includes(String(e.classification))
        || String((e.trace as any)?.reason) === 'rule authority is not active'
        || (String((e.trace as any)?.reason) === 'selector matched no visible nodes'
          && (contract.runtimePolicy.dependencyCompletionVersion !== 1 || e.classification !== 'not-applicable')))
        || ((output.dependencyRuns||[]) as Array<Record<string,unknown>>).some(r=>r.status==='not-executed'||r.status==='incomplete');
      Object.assign(run,{status:incomplete?'incomplete':'executed',snapshotHash:output.snapshotHash,evaluations:childEvaluations.length,
        ...(incomplete?{reason:'dependency-check-incomplete'}:{})});
      for(const e of childEvaluations) evaluations.push({...e,
        evaluationId:stableHash({dependencyId:d.id,bindingId:b.id,nodeId:resolved.nodeId,evaluationId:e.evaluationId}),
        subjectNodeId:capture.nodeMap[String(e.subjectNodeId)]||resolved.nodeId,
        focusNodeId:capture.nodeMap[String(e.focusNodeId)]||resolved.nodeId,
        dependency:{componentId:d.componentId,dependencyId:d.id,bindingId:b.id,ruleId:e.ruleId,revision:d.revision,compiledHash:d.compiledHash,
          ...(e.dependency?{nested:e.dependency}:{})},
      });
    }
  }
  const byClassification:Record<string,number>={};
  evaluations.forEach(e=>{const k=String(e.classification);byClassification[k]=(byClassification[k]||0)+1;});
  return {...result,evaluations,dependencyRuns:runs,coverage:{total:evaluations.length,byClassification,
    unclassified:evaluations.filter(e=>!e.classification).length,duplicateEvaluationIds:evaluations.length-new Set(evaluations.map(e=>e.evaluationId)).size}};
}
