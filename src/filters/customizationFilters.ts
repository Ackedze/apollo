import type { DiffEntry } from '../structure/diff';
import { traceAudit } from '../utils/auditInstrumentation';

type CustomizationFilterRule = {
  id: string;
  apply: (diffs: DiffEntry[]) => DiffEntry[];
};

const rules: CustomizationFilterRule[] = [
  {
    id: 'ignore_sandbox_grid_and_dead_template_customization',
    apply(diffs) {
      if (!diffs.length) {
        return diffs;
      }

      return diffs.filter((diff) => !isIgnoredSandboxCustomizationDiff(diff));
    },
  },
  {
    id: 'ignore_host_controlled_nested_part_paint_customization',
    apply(diffs) {
      if (!diffs.length) {
        return diffs;
      }

      return diffs.filter((diff) => !diff.suppressAsHostControlledNestedProperty);
    },
  },
];

export function applyCustomizationFilters(
  diffs: DiffEntry[],
  options?: {
    libraryName?: string | null;
    componentName?: string | null;
  },
): DiffEntry[] {
  let current = Array.isArray(diffs) ? diffs : [];

  for (const rule of rules) {
    if (!current.length) {
      break;
    }

    const next = rule.apply(current);
    if (next.length !== current.length) {
      const removedKeys = new Set(next.map((diff) => getDiffKey(diff)));
      for (const diff of current) {
        if (removedKeys.has(getDiffKey(diff))) {
          continue;
        }

        traceAudit('suppressed-customization', {
          nodeId: diff.nodeId ?? null,
          nodeName: diff.nodeName,
          libraryName: options?.libraryName ?? null,
          componentName: options?.componentName ?? null,
          categoryDecision: 'suppressed-issue',
          matchedRule: rule.id,
          property: diff.diffKind ?? 'other',
          expected: null,
          actual: diff.message,
          reason:
            diff.suppressionReason ??
            'diff was filtered by customization suppression policy',
        });
      }
    }
    current = next;
  }

  return current;
}

function isIgnoredSandboxCustomizationDiff(diff: DiffEntry): boolean {
  if (!diff) {
    return false;
  }

  if (diff.nodeName === '❌template' || diff.nodeName === '.Grid') {
    return true;
  }

  const path = diff.nodePath ?? '';
  return path.includes('/ ❌template') || path.includes('/ .Grid');
}

function getDiffKey(diff: DiffEntry): string {
  return [
    diff.nodeId ?? '',
    diff.nodePath ?? '',
    diff.nodeName ?? '',
    diff.message ?? '',
  ].join('|');
}
