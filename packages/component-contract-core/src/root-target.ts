import type { CompiledContract, SemanticTarget } from './types';
import { matchesDeclaredTarget } from './declared-target-membership';

/** Authoring scope only: runtime must independently prove owner/source identity.
 * Keep the historical reserved role route unchanged. */
export function isDeclaredRootTarget(target: SemanticTarget | undefined): boolean {
  if (target?.semanticRole === 'root') return true;
  if (!target || target.resolution !== 'resolved' || target.lineage?.length !== 0) return false;
  const paths = [target.pathHint, ...(target.representationHints || []).map(h => h.pathHint),
    ...(target.variantHints || []).map(h => h.pathHint)].filter(path => path !== undefined);
  return paths.length > 0 && paths.every(path => typeof path === 'string' && path.length > 0
    && path === path.trim() && path.split(' / ').length === 1);
}

export function declaredRootAliasRoles(targets: SemanticTarget[]): Set<string> {
  const roots = targets.filter(t => t.resolution === 'resolved' && isDeclaredRootTarget(t));
  const roles = new Set(roots.map(t => t.semanticRole));
  return roots.length > 1 && roles.size === roots.length ? roles : new Set();
}

/** Alias facts are recomputed from independent reference evidence by runtime. */
export function matchesTargetRole(node: Record<string, any>, role: string, contract: CompiledContract): boolean {
  if ([1,2,3].includes(contract.runtimePolicy.declaredTargetIdentityVersion || 0)) return matchesDeclaredTarget(node,role,contract);
  return node.semantic?.role === role || contract.runtimePolicy.rootTargetAliasesVersion === 1
    && node.rootTargetAliasesV1?.[role] === true;
}
