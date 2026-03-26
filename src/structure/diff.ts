import type { DSRadii, DSStructureNode } from '../types/structures';

export type DiffEntry = {
  message: string;
  nodePath: string;
  nodeName: string;
  nodeId?: string;
  visible?: boolean;
};

type DiffResult = {
  diffs: DiffEntry[];
  issues: string[];
};

export function diffStructures(
  actual: DSStructureNode[],
  reference: DSStructureNode[],
  options?: {
    strict?: boolean;
    resolveTokenLabel?: (token: string) => string | null;
    resolveColorLabel?: (color: string) => string | null;
    resolveStyleLabel?: (styleKey: string) => string | null;
  },
): DiffResult {
  const diffs: DiffEntry[] = [];
  const issueSet = new Set<string>();
  const actualMap = new Map(actual.map((node) => [node.path, node]));
  const referenceMap = new Map(reference.map((node) => [node.path, node]));
  const strict = options?.strict ?? false;
  const resolveTokenLabel = options?.resolveTokenLabel;
  const resolveColorLabel = options?.resolveColorLabel;
  const resolveStyleLabel = options?.resolveStyleLabel;

  for (const [path, ref] of referenceMap.entries()) {
    const node = actualMap.get(path);
    if (!node) continue;

    compareNode(
      path,
      node,
      ref,
      diffs,
      issueSet,
      strict,
      resolveTokenLabel,
      resolveColorLabel,
      resolveStyleLabel,
    );
  }

  return { diffs, issues: Array.from(issueSet.values()) };
}

function compareNode(
  path: string,
  actual: DSStructureNode,
  reference: DSStructureNode,
  diffs: DiffEntry[],
  issueSet: Set<string>,
  strict: boolean,
  resolveTokenLabel?: (token: string) => string | null,
  resolveColorLabel?: (color: string) => string | null,
  resolveStyleLabel?: (styleKey: string) => string | null,
) {
  const actualLayout = actual.layout ?? {};
  const referenceLayout = reference.layout ?? {};

  comparePadding(
    path,
    actual,
    actualLayout.padding,
    referenceLayout.padding,
    actualLayout.paddingTokens ?? null,
    referenceLayout.paddingTokens ?? null,
    diffs,
    issueSet,
    strict,
  );

  if (
    referenceLayout.itemSpacing !== undefined &&
    referenceLayout.itemSpacing !== null &&
    (actualLayout.itemSpacing ?? null) !==
      (referenceLayout.itemSpacing ?? null)
  ) {
    if (strict && (actualLayout.itemSpacing ?? null) === null) {
      addIssue(
        issueSet,
        `Нет данных для itemSpacing в снапшоте для «${path}»`,
      );
    } else {
    pushDiff(
      diffs,
      actual,
      path,
      `Отступ между элементами: ${referenceLayout.itemSpacing ?? '—'} → ${actualLayout.itemSpacing ?? '—'}`,
    );
    }
  }
  if (referenceLayout.itemSpacingToken) {
    const actualToken = actualLayout.itemSpacingToken ?? null;
    
    if (strict && !actualToken) {
      addIssue(
        issueSet,
        `Нет данных для token itemSpacing в снапшоте для «${path}»`,
      );
    } else if (actualToken !== referenceLayout.itemSpacingToken) {
      pushDiff(
        diffs,
        actual,
        path,
        `Token itemSpacing: ${referenceLayout.itemSpacingToken ?? '—'} → ${actualToken ?? '—'}`,
      );
    }
  }

  compareStyle(
    'заливка',
    path,
    actual,
    actual.styles?.fill?.styleKey,
    reference.styles?.fill?.styleKey,
    diffs,
    resolveStyleLabel,
  );

  compareStyle(
    'обводка',
    path,
    actual,
    actual.styles?.stroke?.styleKey,
    reference.styles?.stroke?.styleKey,
    diffs,
    resolveStyleLabel,
  );

  compareStyle(
    'текст',
    path,
    actual,
    actual.styles?.text?.styleKey,
    reference.styles?.text?.styleKey,
    diffs,
    resolveStyleLabel,
  );

  comparePaint(
    'заливка',
    path,
    actual,
    actual.fill,
    reference.fill,
    diffs,
    issueSet,
    strict,
    resolveTokenLabel,
    resolveColorLabel,
  );

  compareStroke(
    path,
    actual,
    actual.stroke,
    reference.stroke,
    diffs,
    issueSet,
    strict,
    resolveTokenLabel,
    resolveColorLabel,
  );

  compareRadius(
    path,
    actual,
    actual.radius ?? null,
    reference.radius ?? null,
    actual.radiusToken ?? null,
    reference.radiusToken ?? null,
    diffs,
    issueSet,
    strict,
  );

  compareOpacity(
    path,
    actual,
    actual.opacity ?? null,
    reference.opacity ?? null,
    actual.opacityToken ?? null,
    reference.opacityToken ?? null,
    diffs,
    issueSet,
    strict,
  );
}

function comparePadding(
  path: string,
  actualNode: DSStructureNode,
  actual:
    | {
        top: number | null;
        right: number | null;
        bottom: number | null;
        left: number | null;
      }
    | null
    | undefined,
  reference:
    | {
        top: number | null;
        right: number | null;
        bottom: number | null;
        left: number | null;
      }
    | null
    | undefined,
  actualTokens:
    | {
        top?: string | null;
        right?: string | null;
        bottom?: string | null;
        left?: string | null;
      }
    | null
    | undefined,
  referenceTokens:
    | {
        top?: string | null;
        right?: string | null;
        bottom?: string | null;
        left?: string | null;
      }
    | null
    | undefined,
  diffs: DiffEntry[],
  issueSet: Set<string>,
  strict: boolean,
) {
  const sides: Array<keyof NonNullable<typeof actual>> = [
    'top',
    'right',
    'bottom',
    'left',
  ];

  for (const side of sides) {
    const a = actual?.[side] ?? null;
    const b = reference?.[side] ?? null;

    if (b === null) {
      continue;
    }

    if (strict && a === null) {
      addIssue(
        issueSet,
        `Нет данных для padding ${label(side)} в снапшоте для «${path}»`,
      );
      continue;
    }

    if (a !== b) {
      pushDiff(
        diffs,
        actualNode,
        path,
        `Паддинг ${label(side)}: ${b ?? '—'} → ${a ?? '—'}`,
      );
      continue;
    }

    const refToken = referenceTokens?.[side] ?? null;

    if (refToken) {
      const actualToken = actualTokens?.[side] ?? null;

      if (strict && !actualToken) {
        addIssue(
          issueSet,
          
          `Нет данных для token padding ${label(side)} в снапшоте для «${path}»`,
        );
      } else if (actualToken !== refToken) {
        pushDiff(
          diffs,
          actualNode,
          path,
          `Token padding ${label(side)}: ${refToken ?? '—'} → ${actualToken ?? '—'}`,
        );
      }
    }
  }
}

function label(side: string): string {
  const map: Record<string, string> = {
    top: 'top',
    right: 'right',
    bottom: 'bottom',
    left: 'left',
  };
  return map[side] ?? side;
}

function compareStyle(
  label: string,
  path: string,
  actualNode: DSStructureNode,
  actual: string | undefined,
  reference: string | undefined,
  diffs: DiffEntry[],
  resolveStyleLabel?: (styleKey: string) => string | null,
) {
  if (reference === undefined) return;

  if ((actual ?? null) === (reference ?? null)) return;

  const formatStyle = (styleKey: string | null | undefined) => {
    if (!styleKey) return '—';
    return resolveStyleLabel ? resolveStyleLabel(styleKey) || styleKey : styleKey;
  };

  pushDiff(
    diffs,
    actualNode,
    path,
    `Стиль ${label}: ${formatStyle(reference)} → ${formatStyle(actual)}`,
  );
}

function comparePaint(
  label: string,
  path: string,
  actualNode: DSStructureNode,
  actual: { color?: string | null; token?: string | null } | null | undefined,
  reference: { color?: string | null; token?: string | null } | null | undefined,
  diffs: DiffEntry[],
  issueSet: Set<string>,
  strict: boolean,
  resolveTokenLabel?: (token: string) => string | null,
  resolveColorLabel?: (color: string) => string | null,
) {
  if (!reference || (!reference.color && !reference.token)) return;

  if (strict && (!actual || (!actual.color && !actual.token))) {
    addIssue(
      issueSet,
      `Нет данных для ${label} в снапшоте для «${path}»`,
    );
    return;
  }

  const actualToken = actual?.token ?? null;
  const referenceToken = reference.token ?? null;
  const actualColor = actual?.color ?? null;
  const referenceColor = reference.color ?? null;

  // Prefer exact token ID equality; labels can differ across catalogs or mappings.
  if (actualToken && referenceToken && actualToken === referenceToken) {
    return;
  }

  const formatToken = (token: string | null) => {
    if (!token) return null;
    return resolveTokenLabel ? resolveTokenLabel(token) || token : token;
  };

  let referenceTokenLabel = formatToken(referenceToken);
  const actualTokenLabel = formatToken(actualToken);

  if (!referenceTokenLabel && referenceColor && resolveColorLabel) {
    referenceTokenLabel = resolveColorLabel(referenceColor);
  }

  if (referenceTokenLabel && actualTokenLabel) {
    if (referenceTokenLabel === actualTokenLabel) return;
    
    pushDiff(
      diffs,
      actualNode,
      path,
      `${label}: ${referenceTokenLabel} → token: ${actualTokenLabel}`,
    );

      return;
    }
    
    if (actualColor && referenceTokenLabel) {
      pushDiff(
        diffs,
        actualNode,
        path,
        `${label}: ${referenceTokenLabel} → ${actualColor}`,
      );
      return;
    }

  if (referenceColor) {
    if (actualTokenLabel) {
      pushDiff(
        diffs,
        actualNode,
        path,
        `${label}: ${referenceColor} → token: ${actualTokenLabel}`,
      );
      return;
    }

    if (referenceColor === actualColor) return;
    
    pushDiff(
      diffs,
      actualNode,
      path,
      `${label}: ${referenceColor ?? '—'} → ${actualColor ?? '—'}`,
    );
    return;
  }

  if (referenceTokenLabel || actualTokenLabel) {
    if (referenceTokenLabel === actualTokenLabel) return;
    pushDiff(
      diffs,
      actualNode,
      path,
      `${label}: ${referenceTokenLabel ?? '—'} → token: ${actualTokenLabel ?? '—'}`,
    );
  }
}

function compareStroke(
  path: string,
  actualNode: DSStructureNode,
  actual:
    | { color?: string | null; token?: string | null; weight?: number | null; align?: string | null }
    | null
    | undefined,
  reference:
    | { color?: string | null; token?: string | null; weight?: number | null; align?: string | null }
    | null
    | undefined,
  diffs: DiffEntry[],
  issueSet: Set<string>,
  strict: boolean,
  resolveTokenLabel?: (token: string) => string | null,
  resolveColorLabel?: (color: string) => string | null,
) {
  if (!reference) {
    const actualToken = actual?.token ?? null;
    const actualColor = actual?.color ?? null;
    const actualWeight = actual?.weight ?? null;
    const hasActualStroke =
      Boolean(actualToken || actualColor) &&
      typeof actualWeight === 'number' &&
      actualWeight > 0;
    if (hasActualStroke) {
      const formatToken = (token: string | null) => {
        if (!token) return null;
        return resolveTokenLabel ? resolveTokenLabel(token) || token : token;
      };
      const tokenLabel = formatToken(actualToken);
      const colorLabel =
        !tokenLabel && actualColor && resolveColorLabel
          ? resolveColorLabel(actualColor)
          : null;
      const target = tokenLabel
        ? `token: ${tokenLabel}`
        : colorLabel
          ? `token: ${colorLabel}`
          : actualColor ?? '—';
      // Reference has no stroke, but actual has one — treat as customization.
      pushDiff(diffs, actualNode, path, `Обводка: — → ${target}`);
    }
    return;
  }

  comparePaint(
    'обводка',
    path,
    actualNode,
    actual,
    reference,
    diffs,
    issueSet,
    strict,
    resolveTokenLabel,
    resolveColorLabel,
  );
  
  if (reference.weight !== undefined && reference.weight !== null) {
    const actualWeight =
      actual && typeof actual.weight === 'number' ? actual.weight : null;

    if (strict && actualWeight === null) {
      addIssue(
        issueSet,
        `Нет данных для толщины обводки в снапшоте для «${path}»`,
      );
      return;
    }

    if (actualWeight !== reference.weight) {
      pushDiff(
        diffs,
        actualNode,
        path,
        `Толщина обводки: ${reference.weight ?? '—'} → ${actualWeight ?? '—'}`,
      );
    }
  }
}

function compareRadius(
  path: string,
  actualNode: DSStructureNode,
  actual: DSRadii | null,
  reference: DSRadii | null,
  actualToken: string | null,
  referenceToken: string | null,
  diffs: DiffEntry[],
  issueSet: Set<string>,
  strict: boolean,
) {
  if (reference === null) return;

  if (strict && actual === null) {
    addIssue(
      issueSet,
      `Нет данных для скруглений в снапшоте для «${path}»`,
    );
    return;
  }

  if (referenceToken) {
    if (strict && !actualToken) {
      addIssue(
        issueSet,
        `Нет данных для token radius в снапшоте для «${path}»`,
      );
    } else if (actualToken !== referenceToken) {
      pushDiff(
        diffs,
        actualNode,
        path,
        `Token radius: ${referenceToken ?? '—'} → ${actualToken ?? '—'}`,
      );
    }
  }

  if (JSON.stringify(actual ?? null) === JSON.stringify(reference ?? null))
    return;

  pushDiff(
    diffs,
    actualNode,
    path,
    `Скругления: ${formatRadius(reference)} → ${formatRadius(actual)}`,
  );
}

function formatRadius(value: DSRadii | null): string {
  if (value === null) return '—';
  if (typeof value === 'number') return String(value);
  return `(${value.topLeft}, ${value.topRight}, ${value.bottomRight}, ${value.bottomLeft})`;
}

function compareOpacity(
  path: string,
  actualNode: DSStructureNode,
  actual: number | null,
  reference: number | null,
  actualToken: string | null,
  referenceToken: string | null,
  diffs: DiffEntry[],
  issueSet: Set<string>,
  strict: boolean,
) {
  if (reference === null) return;

  if (strict && actual === null) {
    addIssue(
      issueSet,
      `Нет данных для прозрачности в снапшоте для «${path}»`,
    );
    return;
  }
  const normalizedActual = actual === null ? null : Number(actual.toFixed(2));

  const normalizedReference =
    reference === null ? null : Number(reference.toFixed(2));
    
  if (referenceToken) {
    if (strict && !actualToken) {
      addIssue(
        issueSet,
        `Нет данных для token opacity в снапшоте для «${path}»`,
      );
    } else if (actualToken !== referenceToken) {
      pushDiff(
        diffs,
        actualNode,
        path,
        `Token opacity: ${referenceToken ?? '—'} → ${actualToken ?? '—'}`,
      );
    }
  }
  if (normalizedActual === normalizedReference) return;
  pushDiff(
    diffs,
    actualNode,
    path,
    `Прозрачность: ${normalizedReference ?? '—'} → ${normalizedActual ?? '—'}`,
  );
}

function addIssue(
  issueSet: Set<string>,
  message: string,
) {
  issueSet.add(message);
}

function pushDiff(
  diffs: DiffEntry[],
  node: DSStructureNode,
  path: string,
  message: string,
) {
  diffs.push({
    message,
    nodePath: path,
    nodeName: node.name ?? path,
    nodeId: node.nodeId,
    visible: node.visible !== false,
  });
}
