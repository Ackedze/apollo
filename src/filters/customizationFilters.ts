import type { DiffEntry } from '../structure/diff';

type CustomizationFilterRule = {
  id: string;
  apply: (node: SceneNode, diffs: DiffEntry[]) => DiffEntry[];
};

const rules: CustomizationFilterRule[] = [
  {
    id: 'ignore_icon_view_paintme_fill_customization',
    apply(node, diffs) {
      if (!diffs.length) {
        return diffs;
      }

      return diffs.filter((diff) => {
        if (!isIconViewPaintMeDiff(diff)) {
          return true;
        }

        return !isFillCustomizationMessage(diff.message);
      });
    },
  },
  {
    id: 'ignore_filter_tag_arrow_paintme_fill_customization',
    apply(node, diffs) {
      if (!diffs.length) {
        return diffs;
      }

      return diffs.filter((diff) => {
        if (!isFilterTagArrowPaintMeDiff(diff)) {
          return true;
        }

        return !isFillCustomizationMessage(diff.message);
      });
    },
  },
  {
    id: 'ignore_filter_tag_clear_paintme_fill_customization',
    apply(node, diffs) {
      if (!diffs.length) {
        return diffs;
      }

      return diffs.filter((diff) => {
        if (!isFilterTagClearPaintMeDiff(diff)) {
          return true;
        }

        return !isFillCustomizationMessage(diff.message);
      });
    },
  },
];

export function applyCustomizationFilters(
  node: SceneNode,
  diffs: DiffEntry[],
): DiffEntry[] {
  let current = Array.isArray(diffs) ? diffs : [];

  for (const rule of rules) {
    if (!current.length) {
      break;
    }
    current = rule.apply(node, current);
  }

  return current;
}

function isIconViewPaintMeDiff(diff: DiffEntry): boolean {
  if (!hasPaintMeNodeName(diff)) {
    return false;
  }

  const path = diff.nodePath ?? '';
  return (
    path.includes('/ Fixer / PaintMe') &&
    path.includes('/ ShapeContent / Content /')
  );
}

function isFilterTagArrowPaintMeDiff(diff: DiffEntry): boolean {
  if (!hasPaintMeNodeName(diff)) {
    return false;
  }

  const path = diff.nodePath ?? '';
  return path.includes('/ Arrow / Fixer / PaintMe');
}

function isFilterTagClearPaintMeDiff(diff: DiffEntry): boolean {
  if (!hasPaintMeNodeName(diff)) {
    return false;
  }

  const path = diff.nodePath ?? '';
  return path.includes('/ Clear / 🔩 Clear / Fixer / PaintMe');
}

function hasPaintMeNodeName(diff: DiffEntry): boolean {
  return !!diff && diff.nodeName === 'PaintMe';
}

function isFillCustomizationMessage(message: string): boolean {
  return (
    typeof message === 'string' &&
    (message.startsWith('заливка:') || message.startsWith('Стиль заливка:'))
  );
}
