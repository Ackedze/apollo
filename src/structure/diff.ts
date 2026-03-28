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

function formatRawColor(value: string): string {
  const compact = value.replace(/\s+/g, '');
  const match = compact.match(
    /^rgba\(([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+)\)$/i,
  );
  if (!match) {
    return value;
  }

  const [, rawR, rawG, rawB, rawA] = match;
  const r = Math.round(Number.parseFloat(rawR));
  const g = Math.round(Number.parseFloat(rawG));
  const b = Math.round(Number.parseFloat(rawB));
  const a = Math.round(Number.parseFloat(rawA) * 100) / 100;

  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b) || !Number.isFinite(a)) {
    return value;
  }

  if (a !== 1) {
    return compact;
  }

  const toHex = (channel: number) =>
    Math.min(255, Math.max(0, channel)).toString(16).padStart(2, '0').toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function diffStructures(
  actual: DSStructureNode[],
  reference: DSStructureNode[],
  options?: {
    strict?: boolean;
    resolveTokenLabel?: (token: string) => string | null;
    resolveStyleLabel?: (styleKey: string) => string | null;
  },
): DiffResult {
  const diffs: DiffEntry[] = [];
  const issueSet = new Set<string>();
  const actualMap = new Map(actual.map((node) => [node.path, node]));
  const referenceMap = new Map(reference.map((node) => [node.path, node]));
  const strict = options?.strict ?? false;
  const resolveTokenLabel = options?.resolveTokenLabel;
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
    actual.styles?.fill?.styleKey,
    reference.styles?.fill?.styleKey,
    resolveStyleLabel,
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
    actual.styles?.stroke?.styleKey,
    reference.styles?.stroke?.styleKey,
    resolveStyleLabel,
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

  const formattedReference = formatStyle(reference);
  const formattedActual = formatStyle(actual);

  // Different raw style ids can resolve to the same DS typography label.
  // In that case the user-facing style is effectively unchanged and should
  // not create a customization entry.
  if (formattedReference === formattedActual) {
    return;
  }

  pushDiff(
    diffs,
    actualNode,
    path,
    `Стиль ${label}: ${formattedReference} → ${formattedActual}`,
  );
}

function describePaintValue(
  paint: { color?: string | null; token?: string | null } | null | undefined,
  styleKey: string | null | undefined,
  resolveTokenLabel?: (token: string) => string | null,
  resolveStyleLabel?: (styleKey: string) => string | null,
): { kind: 'token' | 'style' | 'color'; id: string | null; text: string } | null {
  const tokenId = paint?.token ?? null;
  if (tokenId) {
    return {
      kind: 'token',
      id: tokenId,
      text: resolveTokenLabel ? resolveTokenLabel(tokenId) || tokenId : tokenId,
    };
  }

  if (styleKey) {
    return {
      kind: 'style',
      id: styleKey,
      text: resolveStyleLabel ? resolveStyleLabel(styleKey) || styleKey : styleKey,
    };
  }

  const color = paint?.color ?? null;
  if (color) {
    return {
      kind: 'color',
      id: null,
      text: formatRawColor(color),
    };
  }

  return null;
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
  actualStyleKey?: string | null,
  referenceStyleKey?: string | null,
  resolveStyleLabel?: (styleKey: string) => string | null,
) {
  if (!reference && !referenceStyleKey) return;

  const referenceValue = describePaintValue(
    reference,
    referenceStyleKey,
    resolveTokenLabel,
    resolveStyleLabel,
  );

  if (!referenceValue) return;

  const actualValue = describePaintValue(
    actual,
    actualStyleKey,
    resolveTokenLabel,
    resolveStyleLabel,
  );

  if (strict && !actualValue) {
    addIssue(
      issueSet,
      `Нет данных для ${label} в снапшоте для «${path}»`,
    );
    return;
  }

  const actualToken = actual?.token ?? null;
  const referenceToken = reference.token ?? null;
  const normalizedActualStyleKey = actualStyleKey ?? null;
  const normalizedReferenceStyleKey = referenceStyleKey ?? null;

  if (actualToken && referenceToken && actualToken === referenceToken) {
    return;
  }

  if (
    normalizedActualStyleKey &&
    normalizedReferenceStyleKey &&
    normalizedActualStyleKey === normalizedReferenceStyleKey
  ) {
    return;
  }

  const formattedReference = referenceValue.text;
  const formattedActual = actualValue?.text ?? '—';

  if (formattedReference === formattedActual) return;

  pushDiff(
    diffs,
    actualNode,
    path,
    `${label}: ${formattedReference} → ${formattedActual}`,
  );
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
  actualStyleKey?: string | null,
  referenceStyleKey?: string | null,
  resolveStyleLabel?: (styleKey: string) => string | null,
) {
  if (!reference) {
    const actualWeight = actual?.weight ?? null;
    const actualValue = describePaintValue(
      actual,
      actualStyleKey,
      resolveTokenLabel,
      resolveStyleLabel,
    );
    const hasActualStroke =
      Boolean(actualValue) &&
      typeof actualWeight === 'number' &&
      actualWeight > 0;
    if (hasActualStroke) {
      pushDiff(diffs, actualNode, path, `Обводка: — → ${actualValue?.text ?? '—'}`);
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
    actualStyleKey,
    referenceStyleKey,
    resolveStyleLabel,
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
