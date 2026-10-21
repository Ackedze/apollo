import type { CompiledContract, PreviewSnapshot } from './types';
import { resolveFixedNestedBinding } from './component-dependencies';

/** Opt-in facts, not policy: selected owner variants and visible proven children.
 * The contract/Predicate Engine owns activation and allowed counts. A broken
 * child must not turn a selected dependency into an inactive condition.
 */
export function materializeDependencyComposition(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  const ids = contract.facts.dependencyCompositionIds || [];
  if (!ids.length) return; // Historical contracts preserve their exact snapshot/hash.
  const facts: Record<string, unknown> = {};
  for (const id of ids) {
    const dependency = contract.componentDependencies?.find(d => d.id === id);
    const fact: {active?: boolean; visibleInstances?: string[]; evidence: unknown[]} = {evidence: []};
    facts[id] = fact;
    if (!dependency || dependency.issue || !dependency.bindings.length) {
      fact.evidence.push({reason: dependency?.issue || 'dependency-unavailable'}); continue;
    }
    const results = dependency.bindings.map(binding => ({binding, result: resolveFixedNestedBinding(snapshot, dependency, binding, true,contract)}));
    if (results.some(({result}) => result.ownerActive)) fact.active = true;
    else if (results.every(({result}) => result.status === 'inactive')) fact.active = false;
    const visible: string[] = [];
    let complete = true;
    for (const {binding, result} of results) {
      const node = result.node as Record<string, any> | undefined;
      const unknown = (node?.unknownFacts || []) as string[];
      const identityUnknown = unknown.some(p => p === 'component' || p === 'component.identity' || p.startsWith('component.identity.'));
      const visibilityUnknown = unknown.some(p => p === 'visible' || p === 'visibility' || p === 'visibility.effective');
      const visibility = visibilityUnknown ? undefined : node?.visibility?.effective;
      const identity = node?.component?.identity;
      // A missing set key is not evidence of a standalone component. Accept that
      // case only when the exact component key is pinned as a standalone root.
      const standalone = dependency.contract?.facts.representations.some(r => r.kind === 'figma' && r.status !== 'deprecated'
        && !r.locator.componentSetKey && Boolean(identity?.componentKey) && r.locator.componentKey === identity.componentKey);
      fact.evidence.push({bindingId: binding.id, status: result.status, reason: result.reason,
        ...(result.nodeId ? {nodeId: result.nodeId} : {}),
        ...(result.identityValid !== undefined && !identityUnknown ? {identityValid: result.identityValid} : {}),
        ...(typeof visibility === 'boolean' ? {visible: visibility} : {})});
      if (result.status === 'inactive') continue;
      if (result.status !== 'active' || identityUnknown || !node?.component?.identity?.componentKey
        || (!identity?.componentSetKey && !standalone) || typeof visibility !== 'boolean') {complete = false; continue;}
      if (result.identityValid && visibility) visible.push(result.nodeId!);
    }
    if (complete && new Set(visible).size === visible.length) fact.visibleInstances = visible;
  }
  for (const node of snapshot.nodes) {
    node.dependencyCompositionV1 = facts;
    node.unknownFacts = ((node.unknownFacts || []) as string[]).filter(p => p !== 'dependencyCompositionV1' && !p.startsWith('dependencyCompositionV1.'));
  }
}
