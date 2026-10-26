import type { CompiledContract, PreviewSnapshot } from './types';
import { dependencyPinIssue, resolveFixedNestedBinding, validatedDependencyCapture } from './component-dependencies';
import { snapshotPaths } from './snapshot-topology';
import { withinBoundary } from './instance-boundaries';
import { matchesTargetRole } from './root-target';

const record = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
const unknown = (node: Record<string, unknown>, fact: string) => ((node.unknownFacts || []) as string[])
  .some(path => fact === path || fact.startsWith(path + '.'));

/** Recomputed evidence, not verdict filtering. Activated only by compiled opt-in. */
export function materializeRuleScopeFacts(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  const roots = snapshot.nodes.filter(node => snapshot.selection.includes(String(node.id)));
  const root = roots.length === 1 ? roots[0] : undefined;
  const paths = snapshotPaths(snapshot);
  const childPaths: string[] = [];
  let ownershipUnknown = !paths;
  if (contract.customizationPolicy.some(rule => rule.boundaryPolicy === 'component-owned@1')) {
    if (contract.runtimePolicy.nativeSlotTargetsVersion === 1) {
      const nativeTargets = new Set(contract.customizationPolicy.filter(rule => rule.status !== 'deprecated'
        && ['allowed', 'constrained'].includes(rule.permission)).flatMap(rule => rule.controlPaths
        .filter(control => control.kind === 'slot-api' && control.contentOwnership === 'external').map(control => control.target)));
      for (const targetId of nativeTargets) {
        const target = contract.facts.targets.find(entry => entry.id === targetId);
        const nodes = snapshot.nodes.filter(node => record(node.semantic).role === target?.semanticRole);
        if (record(record(root?.variantAvailability).targets)[target?.semanticRole || '']?.present === false && nodes.length === 0) continue;
        // BOOLEAN/INSTANCE slots retain their existing behavior. This addition
        // handles only proven native SLOT descendants, never the slot boundary.
        if (nodes.length === 1 && nodes[0].type === 'INSTANCE') continue;
        if (nodes.length !== 1 || nodes[0].type !== 'SLOT'
          || record(nodes[0].slotBoundaryV1).contentOwnership !== 'external') { ownershipUnknown = true; continue; }
        const path = paths?.get(String(nodes[0].id));
        if (!path) { ownershipUnknown = true; continue; }
        for (const node of snapshot.nodes) {
          const descendant = paths?.get(String(node.id));
          if (descendant?.startsWith(path + ' / ')) childPaths.push(descendant);
        }
      }
    }
    if (contract.runtimePolicy.nativeInstanceReplacementsVersion===1) for (const binding of contract.runtimePolicy.nativeInstanceReplacements||[]) {
      const f=record(record(root?.nativeInstanceReplacementsV1)[binding.id]);
      if (f.inactive===true) continue;
      if (f.ownershipKnown!==true) {ownershipUnknown=true;continue;}
      if (f.sameFamily===false) {const path=paths?.get(String(f.nodeId));if(path)childPaths.push(path);else ownershipUnknown=true;}
    }
    for (const dependency of contract.componentDependencies || []) {
      if (dependency.issue || dependencyPinIssue(dependency, dependency.contract)) { ownershipUnknown = true; continue; }
      for (const binding of dependency.bindings) {
        const resolved = resolveFixedNestedBinding(snapshot, dependency, binding, false, contract);
        if (resolved.status === 'inactive') continue;
        if (resolved.status !== 'active' || !resolved.nodeId || !resolved.identityValid
          || !validatedDependencyCapture(snapshot, resolved.nodeId, dependency.contract!).snapshot) {
          ownershipUnknown = true; continue;
        }
        const path = paths?.get(resolved.nodeId);
        if (path) childPaths.push(path); else ownershipUnknown = true;
      }
    }
  }
  const targets: Record<string, { visible?: boolean }> = {};
  for (const target of contract.facts.targets) {
    const candidates = snapshot.nodes.filter(node => matchesTargetRole(node, target.semanticRole, contract)
      && !unknown(node, 'semantic.role'));
    const available = record(record(root?.variantAvailability).targets)[target.semanticRole];
    const verified = record(root?.semanticTargets)[target.semanticRole];
    const fact: { visible?: boolean } = {};
    if (paths && verified?.resolved === true && target.resolution === 'resolved'
      && contract.facts.targets.filter(other => other.semanticRole === target.semanticRole).length === 1) {
      if (available?.present === false && candidates.length === 0) fact.visible = false;
      else if (candidates.length === 1 && !unknown(candidates[0], 'visibility.effective')
        && typeof record(candidates[0].visibility).effective === 'boolean') fact.visible = record(candidates[0].visibility).effective;
    }
    targets[target.semanticRole] = fact;
  }
  for (const node of snapshot.nodes) {
    const path = paths?.get(String(node.id));
    const local = path !== undefined && childPaths.some(child => withinBoundary(path, child)) ? false
      : ownershipUnknown ? undefined : true;
    node.ruleScopeV1 = { isRoot: node === root, ...(local !== undefined ? { local } : {}), targets };
    const missing = ((node.unknownFacts || []) as string[]).filter(path => path !== 'ruleScopeV1' && !path.startsWith('ruleScopeV1.'));
    if (local === undefined) missing.push('ruleScopeV1.local');
    for (const [role, fact] of Object.entries(targets)) if (fact.visible === undefined) missing.push(`ruleScopeV1.targets.${role}.visible`);
    node.unknownFacts = missing;
  }
}
