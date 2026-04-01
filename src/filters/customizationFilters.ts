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
    id: 'ignore_nested_accessory_paintme_fill_customization',
    apply(diffs) {
      if (!diffs.length) {
        return diffs;
      }

      return diffs.filter((diff) => {
        if (!isNestedAccessoryPaintMeDiff(diff)) {
          return true;
        }

        return !isFillCustomizationMessage(diff.message);
      });
    },
  },
  {
    id: 'ignore_icon_view_paintme_fill_customization',
    apply(diffs) {
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
    id: 'ignore_icon_view_bgcolor_and_border_color_customization',
    apply(diffs) {
      if (!diffs.length) {
        return diffs;
      }

      return diffs.filter((diff) => {
        if (!isIconViewBgColorOrBorderDiff(diff)) {
          return true;
        }

        return !isPaintCustomizationMessage(diff.message);
      });
    },
  },
  {
    id: 'ignore_filter_tag_arrow_paintme_fill_customization',
    apply(diffs) {
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
    apply(diffs) {
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

function isIconViewPaintMeDiff(diff: DiffEntry): boolean {
  if (!hasPaintMeNodeName(diff)) {
    return false;
  }

  const path = diff.nodePath ?? '';
  if (!path.includes('/ Fixer / PaintMe')) {
    return false;
  }

  return (
    path.includes('/ ShapeContent / Content /') ||
    path.includes('🔩 Content /') ||
    path.includes('Type=Icon / Fixer / PaintMe')
  );
}

function isNestedAccessoryPaintMeDiff(diff: DiffEntry): boolean {
  if (!hasPaintMeNodeName(diff)) {
    return false;
  }

  const path = diff.nodePath ?? '';

  return NESTED_ACCESSORY_PAINTME_PATTERNS.some((pattern) => pattern.test(path));
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

function isIconViewBgColorOrBorderDiff(diff: DiffEntry): boolean {
  if (!diff) {
    return false;
  }

  const path = diff.nodePath ?? '';
  if (!path.includes('/ ShapeContent /')) {
    return false;
  }

  if (diff.nodeName === 'BgColor') {
    return path.includes('/ ShapeContent / BgColor');
  }

  if (diff.nodeName === 'Border') {
    return path.includes('/ ShapeContent / Border');
  }

  return false;
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

function hasPaintMeNodeName(diff: DiffEntry): boolean {
  return !!diff && diff.nodeName === 'PaintMe';
}

function isFillCustomizationMessage(message: string): boolean {
  return (
    typeof message === 'string' &&
    (message.startsWith('заливка:') || message.startsWith('Стиль заливка:'))
  );
}

function isPaintCustomizationMessage(message: string): boolean {
  return (
    typeof message === 'string' &&
    (message.startsWith('заливка:') ||
      message.startsWith('Стиль заливка:') ||
      message.startsWith('обводка:') ||
      message.startsWith('Стиль обводка:'))
  );
}

const NESTED_ACCESSORY_PAINTME_PATTERNS = [
  / \/ \[(?:D|M)\] IconButton(?:_[A-Za-z]+)? \/ (?:🔩 )?Icon \/ Fixer \/ PaintMe(?: \/|$)/,
  / \/ PickerButton \/ 🔩 Icon \/ Fixer \/ PaintMe(?: \/|$)/,
  / \/ StatusBadge \/ 🔩 Content \/ Fixer \/ PaintMe(?: \/|$)/,
  / \/ Arrow_[A-Za-z]+ \/ PaintMe(?: \/|$)/,
  / \/ Lock \/ Lock \/ PaintMe(?: \/|$)/,
  / \/ Chevron \/ container \/ Fixer \/ PaintMe(?: \/|$)/,
];
