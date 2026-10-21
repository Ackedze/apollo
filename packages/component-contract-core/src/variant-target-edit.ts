import type { ManualSource } from './types';
import { validateManualSource } from './validator';
import { stableHash } from './stable';

/** Authoring-only update. Facts and compiled output are never edited. */
export function editVariantTextTargets(manual: ManualSource, entries: Array<{ targetId: string; anchorTargetId: string }>): ManualSource {
  const next = JSON.parse(JSON.stringify(manual)) as ManualSource;
  if (!Array.isArray(entries) || entries.some(e => !e || typeof e.targetId !== 'string' || typeof e.anchorTargetId !== 'string')
    || new Set(entries.map(e => e.targetId)).size !== entries.length
    || entries.some(e => next.targets.filter(t => t.id === e.targetId).length !== 1)) throw new Error('Текстовые связи: укажите уникальные существующие targetId и anchorTargetId.');
  const changed: string[] = [];
  for (const target of next.targets) {
    const before = stableHash(target.variantContinuity || null), entry = entries.find(e => e.targetId === target.id);
    if (entry) target.variantContinuity = { kind: 'same-family-text', anchorTargetId: entry.anchorTargetId };
    else delete target.variantContinuity;
    if (before !== stableHash(target.variantContinuity || null)) changed.push(target.semanticRole);
  }
  const errors = validateManualSource(next).filter(i => i.code === 'TARGET_VARIANT_CONTINUITY');
  if (errors.length) throw new Error(errors.map(e => e.message).join('\n'));
  for (const rule of next.rules) if (rule.status !== 'deprecated' && (next.targets.some(t => t.id === rule.targetId && changed.includes(t.semanticRole))
    || rule.constraints.some(c => c.targetRoles?.some(r => changed.includes(r)) || c.targetRole && changed.includes(c.targetRole)))) rule.status = 'draft';
  return next;
}
