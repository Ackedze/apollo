import type { DSRadii, DSStructureNode } from '../types/structures';
import { buildOccurrenceKeyMap, makeOccurrenceKey } from './occurrenceKeys';

export type DiffContext = {
  actualComponentKey: string | null;
  referenceComponentKey: string | null;
  referenceOrigin: 'host' | 'nested-component';
  actualNestedOwnerComponentKey: string | null;
  actualNestedOwnerPath: string | null;
  actualNestedOwnerRelativePath: string | null;
  nestedOwnerComponentKey: string | null;
  nestedOwnerComponentRole: 'Main' | 'Part' | null;
  nestedOwnerPath: string | null;
  nestedOwnerRelativePath: string | null;
};

export type DiffEntry = {
  message: string;
  nodePath: string;
  nodeName: string;
  nodeId?: string;
  visible?: boolean;
  context: DiffContext;
  suppressAsHostControlledNestedProperty?: boolean;
  suppressionReason?: string | null;
  diffKind?: 'paint' | 'text-style' | 'layout' | 'shape' | 'opacity' | 'other';
  details?: DiffDetails;
};

export type DiffValueDetails = {
  value: string | number | null;
  resourceType?: 'style' | 'token' | 'color';
  resourceId?: string | null;
  displayName?: string | null;
};

export type DiffDetails = {
  property: string;
  reference: DiffValueDetails;
  actual: DiffValueDetails;
};

type DiffResult = {
  diffs: DiffEntry[];
  issues: string[];
};

type PaintValueDescription = {
  kind: 'token' | 'style' | 'color';
  id: string | null;
  text: string;
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
    isPaintToken?: (token: string) => boolean;
  },
): DiffResult {
  const diffs: DiffEntry[] = [];
  const issueSet = new Set<string>();
  const normalizedActual = attachImplicitNestedOwners(actual, {
    respectReferenceOrigin: false,
  });
  const normalizedReference = attachImplicitReferenceOwners(reference);
  const actualKeyMap = buildOccurrenceKeyMap(normalizedActual);
  const referenceKeyMap = buildOccurrenceKeyMap(normalizedReference);
  const actualMap = new Map(
    normalizedActual.map((node) => [actualKeyMap.get(node) ?? node.path, node]),
  );
  const referenceMap = new Map(
    normalizedReference.map((node) => [referenceKeyMap.get(node) ?? node.path, node]),
  );
  const actualVisibleChildCount = buildVisibleChildCountMap(normalizedActual);
  const strict = options?.strict ?? false;
  const resolveTokenLabel = options?.resolveTokenLabel;
  const resolveStyleLabel = options?.resolveStyleLabel;
  const isPaintToken = options?.isPaintToken;

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
      actualVisibleChildCount,
      resolveTokenLabel,
      resolveStyleLabel,
      isPaintToken,
    );
  }

  return { diffs, issues: Array.from(issueSet.values()) };
}

function attachImplicitNestedOwners(
  nodes: DSStructureNode[],
  options: {
    respectReferenceOrigin: boolean;
  },
): DSStructureNode[] {
  if (!nodes.length) {
    return nodes;
  }

  const cloned = nodes.map((node) => Object.assign({}, node));
  const idMap = new Map<number, DSStructureNode>();
  const occurrenceKeyMap = buildOccurrenceKeyMap(cloned);
  const occurrenceKeyToNode = new Map<string, DSStructureNode>();

  for (const node of cloned) {
    idMap.set(node.id, node);
    occurrenceKeyToNode.set(occurrenceKeyMap.get(node) ?? node.path, node);
  }

  for (const node of cloned) {
    if (node.referenceOwnerComponentKey && node.referenceOwnerPath != null) {
      continue;
    }

    if (options.respectReferenceOrigin && (node.referenceOrigin ?? 'host') !== 'host') {
      continue;
    }

    let parentId = typeof node.parentId === 'number' ? node.parentId : null;
      while (typeof parentId === 'number') {
        const parent = idMap.get(parentId) ?? null;
        if (!parent) {
          break;
        }

      if (
        parent.type === 'INSTANCE' &&
        parent.componentInstance?.componentKey &&
        parent.path.includes(' / ')
      ) {
        node.referenceOwnerComponentKey = parent.componentInstance.componentKey;
        node.referenceOwnerRole = parent.referenceOwnerRole ?? null;
        node.referenceOwnerPath = parent.path;
        node.referenceOwnerRelativePath =
          getRelativeOwnerPath(parent.path, node.path) ?? null;
        break;
      }

        parentId = typeof parent.parentId === 'number' ? parent.parentId : null;
      }

      if (!node.referenceOwnerComponentKey || !node.referenceOwnerPath) {
        attachImplicitOwnerByPathPrefix(
          node,
          occurrenceKeyMap.get(node) ?? node.path,
          occurrenceKeyToNode,
        );
      }
  }

  return cloned;
}

function attachImplicitReferenceOwners(
  reference: DSStructureNode[],
): DSStructureNode[] {
  return attachImplicitNestedOwners(reference, {
    respectReferenceOrigin: true,
  });
}

function attachImplicitOwnerByPathPrefix(
  node: DSStructureNode,
  occurrenceKey: string,
  occurrenceKeyToNode: Map<string, DSStructureNode>,
) {
  const occurrence = extractOccurrenceIndex(occurrenceKey);
  const segments = node.path.split(' / ');

  for (let index = segments.length - 1; index > 0; index -= 1) {
    const ancestorPath = segments.slice(0, index).join(' / ');
    const ancestorOccurrenceKey = makeOccurrenceKey(ancestorPath, occurrence);
    const ancestor =
      occurrenceKeyToNode.get(ancestorOccurrenceKey) ??
      occurrenceKeyToNode.get(ancestorPath) ??
      null;

    if (
      !ancestor ||
      ancestor.type !== 'INSTANCE' ||
      !ancestor.componentInstance?.componentKey
    ) {
      continue;
    }

    node.referenceOwnerComponentKey = ancestor.componentInstance.componentKey;
    node.referenceOwnerRole = ancestor.referenceOwnerRole ?? null;
    node.referenceOwnerPath = ancestor.path;
    node.referenceOwnerRelativePath =
      getRelativeOwnerPath(ancestor.path, node.path) ?? null;
    return;
  }
}

function extractOccurrenceIndex(occurrenceKey: string): number {
  const hiddenMatch = occurrenceKey.match(/@@hidden(\d+)$/);
  if (hiddenMatch) {
    return -(Number.parseInt(hiddenMatch[1] ?? '1', 10) || 1);
  }

  const visibleMatch = occurrenceKey.match(/@@(\d+)$/);
  if (visibleMatch) {
    return Number.parseInt(visibleMatch[1] ?? '1', 10) || 1;
  }

  return 1;
}

function getRelativeOwnerPath(ownerPath: string, nodePath: string): string | null {
  if (ownerPath === nodePath) {
    return '';
  }

  const prefix = `${ownerPath} / `;
  if (!nodePath.startsWith(prefix)) {
    return null;
  }

  return nodePath.slice(prefix.length);
}

function compareNode(
  path: string,
  actual: DSStructureNode,
  reference: DSStructureNode,
  diffs: DiffEntry[],
  issueSet: Set<string>,
  strict: boolean,
  actualVisibleChildCount: Map<number, number>,
  resolveTokenLabel?: (token: string) => string | null,
  resolveStyleLabel?: (styleKey: string) => string | null,
  isPaintToken?: (token: string) => boolean,
) {
  const actualLayout = actual.layout ?? {};
  const referenceLayout = reference.layout ?? {};

  comparePadding(
    path,
    actual,
    reference,
    actualLayout.padding,
    referenceLayout.padding,
    actualLayout.paddingTokens ?? null,
    referenceLayout.paddingTokens ?? null,
    diffs,
    issueSet,
    strict,
    resolveTokenLabel,
  );

  const shouldCompareItemSpacing = hasMeaningfulItemSpacing(
    actual,
    actualVisibleChildCount,
  );

  if (shouldCompareItemSpacing) {
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
          reference,
          path,
          `Отступ между элементами: ${referenceLayout.itemSpacing ?? '—'} → ${actualLayout.itemSpacing ?? '—'}`,
          'layout',
          {
            property: 'layout.itemSpacing',
            reference: { value: referenceLayout.itemSpacing ?? null },
            actual: { value: actualLayout.itemSpacing ?? null },
          },
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
        const formattedReferenceToken = formatTokenLabel(
          referenceLayout.itemSpacingToken,
          resolveTokenLabel,
        );
        const formattedActualToken = formatTokenLabel(actualToken, resolveTokenLabel);
        if (formattedActualToken !== formattedReferenceToken) {
          pushDiff(
            diffs,
            actual,
            reference,
            path,
            `Отступ между элементами (токен): ${formattedReferenceToken} → ${formattedActualToken}`,
            'layout',
            {
              property: 'layout.itemSpacingToken',
              reference: {
                value: formattedReferenceToken,
                resourceType: 'token',
                resourceId: referenceLayout.itemSpacingToken,
                displayName: formattedReferenceToken,
              },
              actual: {
                value: formattedActualToken,
                resourceType: 'token',
                resourceId: actualToken,
                displayName: formattedActualToken,
              },
            },
          );
        }
      }
    }
  }

  const hasFillStyleDiff = compareStyle(
    'заливка',
    path,
    actual,
    reference,
    actual.styles?.fill?.styleKey,
    reference.styles?.fill?.styleKey,
    diffs,
    resolveStyleLabel,
    resolveTokenLabel,
    isPaintToken,
    actual.fill,
  );

  const hasStrokeStyleDiff = compareStyle(
    'обводка',
    path,
    actual,
    reference,
    actual.styles?.stroke?.styleKey,
    reference.styles?.stroke?.styleKey,
    diffs,
    resolveStyleLabel,
    resolveTokenLabel,
    isPaintToken,
    actual.stroke,
  );

  compareStyle(
    'текст',
    path,
    actual,
    reference,
    actual.styles?.text?.styleKey,
    reference.styles?.text?.styleKey,
    diffs,
    resolveStyleLabel,
  );

  comparePaint(
    'заливка',
    path,
    actual,
    reference,
    actual.fill,
    reference.fill,
    diffs,
    issueSet,
    strict,
    resolveTokenLabel,
    isPaintToken,
    actual.styles?.fill?.styleKey,
    reference.styles?.fill?.styleKey,
    resolveStyleLabel,
    hasFillStyleDiff,
  );

  compareStroke(
    path,
    actual,
    reference,
    actual.stroke,
    reference.stroke,
    diffs,
    issueSet,
    strict,
    resolveTokenLabel,
    isPaintToken,
    actual.styles?.stroke?.styleKey,
    reference.styles?.stroke?.styleKey,
    resolveStyleLabel,
    hasStrokeStyleDiff,
  );

  compareRadius(
    path,
    actual,
    reference,
    actual.radius ?? null,
    reference.radius ?? null,
    actual.radiusToken ?? null,
    reference.radiusToken ?? null,
    diffs,
    issueSet,
    strict,
    resolveTokenLabel,
  );

  compareOpacity(
    path,
    actual,
    reference,
    actual.opacity ?? null,
    reference.opacity ?? null,
    actual.opacityToken ?? null,
    reference.opacityToken ?? null,
    diffs,
    issueSet,
    strict,
    resolveTokenLabel,
  );
}

function comparePadding(
  path: string,
  actualNode: DSStructureNode,
  referenceNode: DSStructureNode,
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
  resolveTokenLabel?: (token: string) => string | null,
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
        referenceNode,
        path,
        `Паддинг ${label(side)}: ${b ?? '—'} → ${a ?? '—'}`,
        'layout',
        {
          property: `layout.padding.${side}`,
          reference: { value: b },
          actual: { value: a },
        },
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
        const formattedReferenceToken = formatPaddingTokenLabel(refToken, resolveTokenLabel);
        const formattedActualToken = formatPaddingTokenLabel(actualToken, resolveTokenLabel);
        if (formattedActualToken === formattedReferenceToken) {
          continue;
        }
        pushDiff(
          diffs,
          actualNode,
          referenceNode,
          path,
          `Паддинг ${label(side)} (токен): ${formattedReferenceToken} → ${formattedActualToken}`,
          'layout',
          {
            property: `layout.paddingTokens.${side}`,
            reference: {
              value: formattedReferenceToken,
              resourceType: 'token',
              resourceId: refToken,
              displayName: formattedReferenceToken,
            },
            actual: {
              value: formattedActualToken,
              resourceType: 'token',
              resourceId: actualToken,
              displayName: formattedActualToken,
            },
          },
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
  referenceNode: DSStructureNode,
  actual: string | undefined,
  reference: string | undefined,
  diffs: DiffEntry[],
  resolveStyleLabel?: (styleKey: string) => string | null,
  resolveTokenLabel?: (token: string) => string | null,
  isPaintToken?: (token: string) => boolean,
  actualPaint?: { color?: string | null; token?: string | null } | null,
): boolean {
  if (reference === undefined) return false;

  if ((actual ?? null) === (reference ?? null)) return false;

  const formatStyle = (styleKey: string | null | undefined) => {
    if (!styleKey) return '—';
    return resolveStyleLabel ? resolveStyleLabel(styleKey) || styleKey : styleKey;
  };

  const formattedReference = formatStyle(reference);
  let formattedActual = formatStyle(actual);

  if ((label === 'заливка' || label === 'обводка') && !actual) {
    const fallbackActual = describePaintValue(
      actualPaint,
      normalizePaintToken(actualPaint?.token ?? null, isPaintToken),
      null,
      resolveTokenLabel,
      resolveStyleLabel,
    );

    if (fallbackActual?.text) {
      formattedActual = fallbackActual.text;
    }
  }

  // Different raw style ids can resolve to the same DS typography label.
  // In that case the user-facing style is effectively unchanged and should
  // not create a customization entry.
  if (formattedReference === formattedActual) {
    return false;
  }

  pushDiff(
    diffs,
    actualNode,
    referenceNode,
    path,
    `Стиль ${label}: ${formattedReference} → ${formattedActual}`,
    label === 'текст' ? 'text-style' : 'paint',
    {
      property:
        label === 'текст'
          ? 'styles.text'
          : label === 'заливка'
            ? 'styles.fill'
            : 'styles.stroke',
      reference: {
        value: formattedReference,
        resourceType: 'style',
        resourceId: reference ?? null,
        displayName: formattedReference,
      },
      actual: actual
        ? {
            value: formattedActual,
            resourceType: 'style',
            resourceId: actual,
            displayName: formattedActual,
          }
        : {
            value: formattedActual,
            displayName: formattedActual,
          },
    },
  );

  return true;
}

function describePaintValue(
  paint: { color?: string | null; token?: string | null } | null | undefined,
  normalizedTokenId: string | null,
  styleKey: string | null | undefined,
  resolveTokenLabel?: (token: string) => string | null,
  resolveStyleLabel?: (styleKey: string) => string | null,
): PaintValueDescription | null {
  const tokenId = normalizedTokenId;
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
  referenceNode: DSStructureNode,
  actual: { color?: string | null; token?: string | null } | null | undefined,
  reference: { color?: string | null; token?: string | null } | null | undefined,
  diffs: DiffEntry[],
  issueSet: Set<string>,
  strict: boolean,
  resolveTokenLabel?: (token: string) => string | null,
  isPaintToken?: (token: string) => boolean,
  actualStyleKey?: string | null,
  referenceStyleKey?: string | null,
  resolveStyleLabel?: (styleKey: string) => string | null,
  skipBecauseStyleDiff = false,
) {
  if (!reference && !referenceStyleKey) {
    const actualValue = describePaintValue(
      actual,
      normalizePaintToken(actual?.token ?? null, isPaintToken),
      actualStyleKey,
      resolveTokenLabel,
      resolveStyleLabel,
    );

    if (actualValue) {
      pushDiff(
        diffs,
        actualNode,
        referenceNode,
        path,
        `${label}: — → ${actualValue.text}`,
        label === 'обводка' || label === 'заливка' ? 'paint' : 'other',
        {
          property: label === 'обводка' ? 'stroke' : 'fill',
          reference: { value: null },
          actual: paintValueToDiffValue(actualValue),
        },
      );
    }
    return;
  }
  if (skipBecauseStyleDiff) return;

  const normalizedActualToken = normalizePaintToken(actual?.token ?? null, isPaintToken);
  const normalizedReferenceToken = normalizePaintToken(
    reference?.token ?? null,
    isPaintToken,
  );

  const referenceValue = describePaintValue(
    reference,
    normalizedReferenceToken,
    referenceStyleKey,
    resolveTokenLabel,
    resolveStyleLabel,
  );

  if (!referenceValue) return;

  const actualValue = describePaintValue(
    actual,
    normalizedActualToken,
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

  const actualToken = normalizedActualToken;
  const referenceToken = normalizedReferenceToken;
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
    referenceNode,
    path,
    `${label}: ${formattedReference} → ${formattedActual}`,
    label === 'обводка' || label === 'заливка' ? 'paint' : 'other',
    {
      property: label === 'обводка' ? 'stroke' : 'fill',
      reference: paintValueToDiffValue(referenceValue),
      actual: actualValue
        ? paintValueToDiffValue(actualValue)
        : { value: null },
    },
  );
}

function paintValueToDiffValue(value: PaintValueDescription): DiffValueDetails {
  return {
    value: value.text,
    resourceType: value.kind,
    resourceId: value.id,
    displayName: value.text,
  };
}

function compareStroke(
  path: string,
  actualNode: DSStructureNode,
  referenceNode: DSStructureNode,
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
  isPaintToken?: (token: string) => boolean,
  actualStyleKey?: string | null,
  referenceStyleKey?: string | null,
  resolveStyleLabel?: (styleKey: string) => string | null,
  skipPaintDiff = false,
) {
  if (!reference) {
    const actualWeight = actual?.weight ?? null;
    const actualValue = describePaintValue(
      actual,
      normalizePaintToken(actual?.token ?? null, isPaintToken),
      actualStyleKey,
      resolveTokenLabel,
      resolveStyleLabel,
    );
    const hasActualStroke =
      Boolean(actualValue) &&
      typeof actualWeight === 'number' &&
      actualWeight > 0;
    if (hasActualStroke) {
      pushDiff(diffs, actualNode, referenceNode, path, `Обводка: — → ${actualValue?.text ?? '—'}`);
    }
    return;
  }

  if (!skipPaintDiff) {
    comparePaint(
      'обводка',
      path,
      actualNode,
      referenceNode,
      actual,
      reference,
      diffs,
      issueSet,
      strict,
      resolveTokenLabel,
      isPaintToken,
      actualStyleKey,
      referenceStyleKey,
      resolveStyleLabel,
    );
  }
  
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
        referenceNode,
        path,
        `Толщина обводки: ${reference.weight ?? '—'} → ${actualWeight ?? '—'}`,
        'shape',
        {
          property: 'stroke.weight',
          reference: { value: reference.weight ?? null },
          actual: { value: actualWeight },
        },
      );
    }
  }
}

function normalizePaintToken(
  token: string | null | undefined,
  isPaintToken?: (token: string) => boolean,
): string | null {
  if (!token) {
    return null;
  }

  if (typeof isPaintToken === 'function' && !isPaintToken(token)) {
    return null;
  }

  return token;
}

function compareRadius(
  path: string,
  actualNode: DSStructureNode,
  referenceNode: DSStructureNode,
  actual: DSRadii | null,
  reference: DSRadii | null,
  actualToken: string | null,
  referenceToken: string | null,
  diffs: DiffEntry[],
  issueSet: Set<string>,
  strict: boolean,
  resolveTokenLabel?: (token: string) => string | null,
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
      const formattedReferenceToken = formatTokenLabel(referenceToken, resolveTokenLabel);
      const formattedActualToken = formatTokenLabel(actualToken, resolveTokenLabel);
      if (formattedActualToken !== formattedReferenceToken) {
        pushDiff(
          diffs,
          actualNode,
          referenceNode,
          path,
          `Скругления (токен): ${formattedReferenceToken} → ${formattedActualToken}`,
          'layout',
          {
            property: 'radiusToken',
            reference: {
              value: formattedReferenceToken,
              resourceType: 'token',
              resourceId: referenceToken,
              displayName: formattedReferenceToken,
            },
            actual: {
              value: formattedActualToken,
              resourceType: 'token',
              resourceId: actualToken,
              displayName: formattedActualToken,
            },
          },
        );
      }
    }
  }

  if (JSON.stringify(actual ?? null) === JSON.stringify(reference ?? null))
    return;

  pushDiff(
    diffs,
    actualNode,
    referenceNode,
    path,
    `Скругления: ${formatRadius(reference)} → ${formatRadius(actual)}`,
    'layout',
    {
      property: 'radius',
      reference: { value: formatRadius(reference) },
      actual: { value: formatRadius(actual) },
    },
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
  referenceNode: DSStructureNode,
  actual: number | null,
  reference: number | null,
  actualToken: string | null,
  referenceToken: string | null,
  diffs: DiffEntry[],
  issueSet: Set<string>,
  strict: boolean,
  resolveTokenLabel?: (token: string) => string | null,
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
      const formattedReferenceToken = formatTokenLabel(referenceToken, resolveTokenLabel);
      const formattedActualToken = formatTokenLabel(actualToken, resolveTokenLabel);
      if (formattedActualToken !== formattedReferenceToken) {
        pushDiff(
          diffs,
          actualNode,
          referenceNode,
          path,
          `Прозрачность (токен): ${formattedReferenceToken} → ${formattedActualToken}`,
          'opacity',
          {
            property: 'opacityToken',
            reference: {
              value: formattedReferenceToken,
              resourceType: 'token',
              resourceId: referenceToken,
              displayName: formattedReferenceToken,
            },
            actual: {
              value: formattedActualToken,
              resourceType: 'token',
              resourceId: actualToken,
              displayName: formattedActualToken,
            },
          },
        );
      }
    }
  }
  if (normalizedActual === normalizedReference) return;
  pushDiff(
    diffs,
    actualNode,
    referenceNode,
    path,
    `Прозрачность: ${normalizedReference ?? '—'} → ${normalizedActual ?? '—'}`,
    'opacity',
    {
      property: 'opacity',
      reference: { value: normalizedReference },
      actual: { value: normalizedActual },
    },
  );
}

function formatTokenLabel(
  token: string | null | undefined,
  resolveTokenLabel?: (token: string) => string | null,
): string {
  if (!token) return '—';
  return resolveTokenLabel ? resolveTokenLabel(token) || token : token;
}

function formatPaddingTokenLabel(
  token: string | null | undefined,
  resolveTokenLabel?: (token: string) => string | null,
): string {
  return stripPaddingTokenNamespace(formatTokenLabel(token, resolveTokenLabel));
}

function stripPaddingTokenNamespace(label: string): string {
  return label.replace(/^(Vertical|Horizontal)\s+Paddings\//i, '');
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
  referenceNode: DSStructureNode,
  path: string,
  message: string,
  diffKind: DiffEntry['diffKind'] = 'other',
  details?: DiffDetails,
) {
  const isHostNestedInstanceRoot =
    (referenceNode.referenceOrigin ?? 'host') === 'host' &&
    referenceNode.type === 'INSTANCE' &&
    path.includes(' / ') &&
    !!referenceNode.componentInstance?.componentKey;

  diffs.push({
    message,
    nodePath: path,
    nodeName: node.name ?? path,
    nodeId: node.nodeId,
    visible: node.visible !== false,
    context: {
      actualComponentKey: node.componentInstance?.componentKey ?? null,
      referenceComponentKey: referenceNode.componentInstance?.componentKey ?? null,
      referenceOrigin: referenceNode.referenceOrigin ?? 'host',
      actualNestedOwnerComponentKey: node.referenceOwnerComponentKey ?? null,
      actualNestedOwnerPath: node.referenceOwnerPath ?? null,
      actualNestedOwnerRelativePath: node.referenceOwnerRelativePath ?? null,
      nestedOwnerComponentKey:
        referenceNode.referenceOwnerComponentKey ??
        (isHostNestedInstanceRoot
          ? referenceNode.componentInstance?.componentKey ?? null
          : null),
      nestedOwnerComponentRole: referenceNode.referenceOwnerRole ?? null,
      nestedOwnerPath:
        referenceNode.referenceOwnerPath ??
        (isHostNestedInstanceRoot ? path : null),
      nestedOwnerRelativePath:
        referenceNode.referenceOwnerRelativePath ??
        (isHostNestedInstanceRoot ? '' : null),
    },
    diffKind,
    details,
  });
}

function buildVisibleChildCountMap(nodes: DSStructureNode[]): Map<number, number> {
  const childCount = new Map<number, number>();

  for (const node of nodes) {
    if (node.visible === false) {
      continue;
    }

    const parentId = node.parentId;
    if (typeof parentId !== 'number') {
      continue;
    }

    childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1);
  }

  return childCount;
}

function hasMeaningfulItemSpacing(
  actual: DSStructureNode,
  actualVisibleChildCount: Map<number, number>,
): boolean {
  const actualCount = actualVisibleChildCount.get(actual.id) ?? 0;
  return actualCount > 1;
}
