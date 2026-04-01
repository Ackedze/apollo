import type { DiffEntry } from '../structure/diff';

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
): DiffEntry[] {
  let current = Array.isArray(diffs) ? diffs : [];

  for (const rule of rules) {
    if (!current.length) {
      break;
    }
    current = rule.apply(current);
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
