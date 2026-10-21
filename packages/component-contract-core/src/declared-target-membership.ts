import type { CompiledContract } from './types';
import { stableHash } from './stable';

/** Fact keys cannot inherit dots or prototype names from authoring target IDs. */
export function declaredTargetMembershipKey(targetId: string): string {
  return `t_${stableHash(targetId)}`;
}

export function matchesDeclaredTarget(node: Record<string, any>, role: string, contract: CompiledContract): boolean {
  const targets = contract.facts.targets.filter(target => target.semanticRole === role);
  if (targets.length !== 1) return false;
  return node.declaredTargetMembershipV1?.[declaredTargetMembershipKey(targets[0].id)] === true;
}
