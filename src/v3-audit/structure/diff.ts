import type {
  DSEffect,
  DSNodeLayout,
  DSRadii,
  DSStructureNode,
} from '../types/structures';
import type { CustomizationAssessment } from '../assessment/types';
import { buildOccurrenceKeyMap, makeOccurrenceKey } from './occurrenceKeys';
import { parseVariantName } from '../utils/variantProperties';
import {
  formatStrokeAlignment,
  normalizeStrokeAlignment,
} from './strokeAlignment';
import { formatLayoutSizing, normalizeLayoutSizing } from './layoutSizing';
import { alignMaterializedReferenceInstancePaths } from '../reference/nestedReferenceMerge';
import type { SurfaceContextEvidence } from '../assessment/surfaceContext';

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
  actualVariantProperties?: Record<string, string> | null;
  referenceVariantProperties?: Record<string, string> | null;
  surfaceContext?: SurfaceContextEvidence | null;
  directHostVariantOverride?: boolean;
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
  contractEvidenceOnly?: boolean;
  diffKind?: 'paint' | 'text-style' | 'layout' | 'shape' | 'opacity' | 'other';
  details?: DiffDetails;
  assessment?: CustomizationAssessment;
};

export type DiffValueDetails = {
  value: string | number | null;
  resourceType?: 'style' | 'token' | 'color' | 'component' | 'image' | 'effects';
  resourceId?: string | null;
  displayName?: string | null;
  bindingId?: string | null;
  binding?: VariableBindingEvidence | null;
  effects?: DSEffect[] | null;
};

export type VariableBindingStatus =
  | 'same-binding'
  | 'allowed-binding'
  | 'different-binding'
  | 'unbound'
  | 'unresolved-binding'
  | 'missing-reference-binding';

export type VariableMetadata = {
  variableId: string | null;
  variableKey: string | null;
  variableName: string | null;
  collectionId: string | null;
  collectionName: string | null;
  modeNames: Record<string, string>;
};

export type VariableBindingEvidence = {
  id: string;
  key: string | null;
  name: string | null;
  collectionId: string | null;
  collectionName: string | null;
  resolvedModeId: string | null;
  resolvedModeName: string | null;
  explicitModeId: string | null;
  explicitModeName: string | null;
  modeSource: 'explicit' | 'inherited' | 'resolved' | 'unknown';
  modeOwnerNodeId: string | null;
  modeOwnerName: string | null;
  modeOwnerPath: string | null;
};

export type VariableModeEvidence = {
  collectionId: string;
  collectionName: string | null;
  resolvedModeId: string | null;
  resolvedModeName: string | null;
  explicitModeId: string | null;
  explicitModeName: string | null;
  modeSource: 'explicit' | 'inherited' | 'resolved' | 'unknown';
  modeOwnerNodeId: string | null;
  modeOwnerName: string | null;
  modeOwnerPath: string | null;
};

export type DiffDetails = {
  property: string;
  reference: DiffValueDetails;
  actual: DiffValueDetails;
  atomicChanges?: DiffDetails[];
  bindingStatus?: VariableBindingStatus | null;
  variableMode?: VariableModeEvidence | null;
};

export type VariableMetadataResolver = (
  bindingId: string,
) => VariableMetadata | null;

type DiffResult = {
  diffs: DiffEntry[];
  issues: string[];
};

type PaintValueDescription = {
  kind: 'token' | 'style' | 'color' | 'image';
  id: string | null;
  text: string;
};

type ComparablePaint = {
  color?: string | null;
  token?: string | null;
  paintTypes?: string[] | null;
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
    resolveVariableMetadata?: VariableMetadataResolver;
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
  const resolveVariableMetadata = options?.resolveVariableMetadata;

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
      resolveVariableMetadata,
    );
  }

  return { diffs, issues: Array.from(issueSet.values()) };
}

export function diffExplicitNestedVariantStates(
  actual: DSStructureNode[],
  hostReference: DSStructureNode[],
  existingDiffs: DiffEntry[] = [],
  options?: {
    resolveComponentFamilyKey?: (componentKey: string) => string;
    resolveReferenceComponentKey?: (node: DSStructureNode) => string | null;
  },
): DiffEntry[] {
  if (!actual.length || !hostReference.length) {
    return [];
  }

  const actualRootId = actual[0]?.id ?? null;
  const actualRootPath = actual[0]?.path ?? '';
  const alignedHostReference = actualRootPath
    ? alignMaterializedReferenceInstancePaths(
        hostReference,
        actual,
        actualRootPath,
      )
    : hostReference;
  const normalizedActual = attachImplicitNestedOwners(actual, {
    respectReferenceOrigin: false,
  });
  const normalizedHostReference = attachImplicitReferenceOwners(
    alignedHostReference,
  );
  const actualKeyMap = buildOccurrenceKeyMap(normalizedActual);
  const referenceKeyMap = buildOccurrenceKeyMap(normalizedHostReference);
  const referenceByOccurrence = new Map(
    normalizedHostReference.map((node) => [
      referenceKeyMap.get(node) ?? node.path,
      node,
    ]),
  );
  const actualById = new Map(normalizedActual.map((node) => [node.id, node]));
  const referenceById = new Map(normalizedHostReference.map((node) => [node.id, node]));
  const swappedPaths: string[] = [];
  const existingKeys = new Set(existingDiffs.map(getVariantStateDiffKey));
  const result: DiffEntry[] = [];

  for (const actualNode of normalizedActual) {
    if (
      actualNode.id === actualRootId ||
      actualNode.type !== 'INSTANCE' ||
      !actualNode.componentInstance?.componentKey
    ) {
      continue;
    }

    if (swappedPaths.some((path) => actualNode.path.startsWith(`${path} / `))) {
      continue;
    }

    const occurrenceKey = actualKeyMap.get(actualNode) ?? actualNode.path;
    const referenceNode =
      referenceByOccurrence.get(occurrenceKey) ??
      findReferenceInstanceByStructuralSlot(
        actualNode,
        normalizedActual,
        normalizedHostReference,
        actualById,
        referenceById,
        actualKeyMap,
        referenceByOccurrence,
      );
    if (!referenceNode || referenceNode.type !== 'INSTANCE') {
      continue;
    }

    const produced: DiffEntry[] = [];
    const identityChanged = compareComponentIdentity(
      occurrenceKey,
      actualNode,
      referenceNode,
      produced,
      options?.resolveComponentFamilyKey,
      options?.resolveReferenceComponentKey,
    );
    if (identityChanged) {
      swappedPaths.push(actualNode.path);
    } else {
      compareVariantProperties(occurrenceKey, actualNode, referenceNode, produced);
    }
    for (const diff of produced) {
      const key = getVariantStateDiffKey(diff);
      if (existingKeys.has(key)) {
        continue;
      }
      existingKeys.add(key);
      result.push(diff);
    }
  }

  return result;
}

function findReferenceInstanceByStructuralSlot(
  actualNode: DSStructureNode,
  actualNodes: DSStructureNode[],
  referenceNodes: DSStructureNode[],
  actualById: Map<number, DSStructureNode>,
  referenceById: Map<number, DSStructureNode>,
  actualKeyMap: Map<DSStructureNode, string>,
  referenceByOccurrence: Map<string, DSStructureNode>,
): DSStructureNode | null {
  if (typeof actualNode.parentId !== 'number') return null;
  const actualParent = actualById.get(actualNode.parentId) ?? null;
  if (!actualParent) return null;
  const parentOccurrence = actualKeyMap.get(actualParent) ?? actualParent.path;
  const referenceParent = referenceByOccurrence.get(parentOccurrence) ?? null;
  if (!referenceParent) return null;

  const actualSiblings = actualNodes.filter(
    (node) => node.parentId === actualParent.id && node.type === 'INSTANCE',
  );
  const referenceSiblings = referenceNodes.filter(
    (node) => node.parentId === referenceParent.id && node.type === 'INSTANCE',
  );
  const slot = actualSiblings.indexOf(actualNode);
  if (slot < 0) return null;
  const candidate = referenceSiblings[slot] ?? null;
  return candidate && referenceById.has(candidate.id) ? candidate : null;
}

function compareComponentIdentity(
  path: string,
  actualNode: DSStructureNode,
  referenceNode: DSStructureNode,
  diffs: DiffEntry[],
  resolveComponentFamilyKey?: (componentKey: string) => string,
  resolveReferenceComponentKey?: (node: DSStructureNode) => string | null,
): boolean {
  if (!resolveComponentFamilyKey) return false;
  const actualKey = actualNode.componentInstance?.componentKey ?? null;
  const referenceKey =
    resolveReferenceComponentKey?.(referenceNode) ??
    referenceNode.componentInstance?.componentKey ??
    null;
  if (!actualKey || !referenceKey) return false;
  const actualFamily = resolveComponentFamilyKey(actualKey);
  const referenceFamily = resolveComponentFamilyKey(referenceKey);
  if (actualFamily === referenceFamily) return false;

  pushDiff(
    diffs,
    actualNode,
    referenceNode,
    path,
    `Компонент: ${referenceNode.name} → ${actualNode.name}`,
    'other',
    {
      property: 'component.identity',
      reference: {
        value: referenceNode.name,
        resourceType: 'component',
        resourceId: referenceKey,
        displayName: referenceNode.name,
      },
      actual: {
        value: actualNode.name,
        resourceType: 'component',
        resourceId: actualKey,
        displayName: actualNode.name,
      },
    },
  );
  return true;
}

function getVariantStateDiffKey(diff: DiffEntry): string {
  return [
    diff.nodeId ?? diff.nodePath,
    diff.details?.property ?? diff.message,
  ].join('|');
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

      const isRootHostForNestedInstance =
        node.type === 'INSTANCE' &&
        node.path.includes(' / ') &&
        parent.parentId === null;
      if (
        parent.type === 'INSTANCE' &&
        parent.componentInstance?.componentKey &&
        (parent.path.includes(' / ') || isRootHostForNestedInstance)
      ) {
        node.referenceOwnerComponentKey = parent.componentInstance.componentKey;
        node.referenceOwnerRole = parent.referenceOwnerRole ?? null;
        node.referenceOwnerPath = parent.path;
        node.referenceOwnerRelativePath =
          getRelativeOwnerPath(parent.path, node.path) ?? null;
        node.referenceOwnerVariantProperties =
          parent.componentInstance.variantProperties ?? null;
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
    node.referenceOwnerVariantProperties =
      ancestor.componentInstance.variantProperties ?? null;
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
  resolveVariableMetadata?: VariableMetadataResolver,
) {
  const actualLayout = actual.layout ?? {};
  const referenceLayout = reference.layout ?? {};

  compareLayoutDimensions(
    path,
    actual,
    reference,
    actualLayout,
    referenceLayout,
    diffs,
  );

  compareLayoutSizing(
    path,
    actual,
    reference,
    actualLayout.sizing ?? null,
    referenceLayout.sizing ?? null,
    diffs,
  );

  compareLayoutAlignment(
    path,
    actual,
    reference,
    actualLayout,
    referenceLayout,
    diffs,
  );

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
    resolveVariableMetadata,
  );

  const shouldCompareItemSpacing = hasMeaningfulItemSpacing(
    actual,
    actualVisibleChildCount,
  );

  if (shouldCompareItemSpacing) {
    const actualItemSpacingToken = actualLayout.itemSpacingToken ?? null;
    const referenceItemSpacingToken =
      referenceLayout.itemSpacingToken ?? null;
    let itemSpacingValueDiffEmitted = false;
    const itemSpacingBindingMissing = Boolean(
      referenceItemSpacingToken && !actualItemSpacingToken,
    );
    if (referenceItemSpacingToken && itemSpacingBindingMissing) {
      const formattedReferenceToken = formatTokenLabel(
        referenceItemSpacingToken,
        resolveTokenLabel,
      );
      pushDiff(
        diffs,
        actual,
        reference,
        path,
        `Переменная itemSpacing: ${formattedReferenceToken} → Отвязана (значение: ${actualLayout.itemSpacing ?? '—'})`,
        'layout',
        {
          property: 'layout.itemSpacing',
          reference: createBoundDiffValue(
            referenceLayout.itemSpacing ?? null,
            referenceItemSpacingToken,
            reference,
            resolveVariableMetadata,
          ),
          actual: createBoundDiffValue(
            actualLayout.itemSpacing ?? null,
            null,
            actual,
            resolveVariableMetadata,
          ),
          bindingStatus: 'unbound',
        },
      );
    }
    if (
      !itemSpacingBindingMissing &&
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
      } else if (
        !bindingsEquivalent(
          actualItemSpacingToken,
          referenceItemSpacingToken,
          resolveVariableMetadata,
        )
      ) {
        pushDiff(
          diffs,
          actual,
          reference,
          path,
          `Отступ между элементами: ${referenceLayout.itemSpacing ?? '—'} → ${actualLayout.itemSpacing ?? '—'}`,
          'layout',
          {
            property: 'layout.itemSpacing',
            reference: createBoundDiffValue(
              referenceLayout.itemSpacing ?? null,
              referenceItemSpacingToken,
              reference,
              resolveVariableMetadata,
            ),
            actual: createBoundDiffValue(
              actualLayout.itemSpacing ?? null,
              actualItemSpacingToken,
              actual,
              resolveVariableMetadata,
            ),
            bindingStatus: classifyBindingStatus(
              actualItemSpacingToken,
              referenceItemSpacingToken,
              resolveVariableMetadata,
            ),
          },
        );
        itemSpacingValueDiffEmitted = true;
      }
    }

    if (
      referenceItemSpacingToken &&
      !itemSpacingBindingMissing &&
      !itemSpacingValueDiffEmitted
    ) {
      if (
        !bindingsEquivalent(
          actualItemSpacingToken,
          referenceItemSpacingToken,
          resolveVariableMetadata,
        )
      ) {
        const formattedReferenceToken = formatTokenLabel(
          referenceItemSpacingToken,
          resolveTokenLabel,
        );
        const formattedActualToken = formatTokenLabel(
          actualItemSpacingToken,
          resolveTokenLabel,
        );
        if (formattedActualToken !== formattedReferenceToken) {
          const referenceDisplay = formatVariableBindingDisplay(
            referenceLayout.itemSpacing ?? null,
            referenceItemSpacingToken,
            resolveTokenLabel,
            resolveVariableMetadata,
          );
          const actualDisplay = formatVariableBindingDisplay(
            actualLayout.itemSpacing ?? null,
            actualItemSpacingToken,
            resolveTokenLabel,
            resolveVariableMetadata,
          );
          pushDiff(
            diffs,
            actual,
            reference,
            path,
            `Отступ между элементами (токен): ${referenceDisplay} → ${actualDisplay}`,
            'layout',
            {
              property: 'layout.itemSpacingToken',
              reference: createVariableTokenDiffValue(
                referenceLayout.itemSpacing ?? null,
                referenceItemSpacingToken,
                reference,
                referenceDisplay,
                resolveVariableMetadata,
              ),
              actual: createVariableTokenDiffValue(
                actualLayout.itemSpacing ?? null,
                actualItemSpacingToken,
                actual,
                actualDisplay,
                resolveVariableMetadata,
              ),
              bindingStatus: classifyBindingStatus(
                actualItemSpacingToken,
                referenceItemSpacingToken,
                resolveVariableMetadata,
              ),
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

  const hasTextStyleDiff = compareStyle(
    'текст',
    path,
    actual,
    reference,
    actual.styles?.text?.styleKey,
    reference.styles?.text?.styleKey,
    diffs,
    resolveStyleLabel,
  );

  compareRawTypography(
    path,
    actual,
    reference,
    diffs,
    hasTextStyleDiff,
  );
  compareTextCase(path, actual, reference, diffs);
  compareTextAlignment(path, actual, reference, diffs);

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
    resolveVariableMetadata,
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
    resolveVariableMetadata,
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
    resolveVariableMetadata,
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
    resolveVariableMetadata,
  );

  compareEffects(path, actual, reference, actual.effects, reference.effects, diffs);

  compareVariantProperties(path, actual, reference, diffs);
}

function compareLayoutDimensions(
  path: string,
  actualNode: DSStructureNode,
  referenceNode: DSStructureNode,
  actualLayout: DSNodeLayout,
  referenceLayout: DSNodeLayout,
  diffs: DiffEntry[],
) {
  const fields = [
    { property: 'width' as const, label: 'Ширина', axis: 'horizontal' as const },
    { property: 'height' as const, label: 'Высота', axis: 'vertical' as const },
    { property: 'minWidth' as const, label: 'Минимальная ширина', axis: null },
    { property: 'maxWidth' as const, label: 'Максимальная ширина', axis: null },
    { property: 'minHeight' as const, label: 'Минимальная высота', axis: null },
    { property: 'maxHeight' as const, label: 'Максимальная высота', axis: null },
  ];

  for (const { property, label, axis } of fields) {
    // Physical width/height of Hug and Fill nodes is derived from their
    // contents or parent layout. Figma can still expose that recalculation as
    // InstanceNode.overrides, but it is not an independent customization.
    // Numeric contract constraints are evaluated separately by
    // createNumericConstraintRuleDiffs, so baseline comparison only emits a
    // physical dimension when the actual node has an explicit Fixed sizing.
    if (
      axis &&
      normalizeLayoutSizing(actualLayout.sizing?.[axis] ?? null) !== 'FIXED'
    ) {
      continue;
    }
    const referenceValue = referenceLayout[property];
    const actualValue = actualLayout[property];
    if (
      typeof referenceValue !== 'number' ||
      typeof actualValue !== 'number' ||
      Math.abs(referenceValue - actualValue) < 0.01
    ) {
      continue;
    }
    pushDiff(
      diffs,
      actualNode,
      referenceNode,
      path,
      `${label}: ${referenceValue} → ${actualValue}`,
      'layout',
      {
        property: `layout.${property}`,
        reference: { value: referenceValue },
        actual: { value: actualValue },
      },
      true,
    );
  }
}

function compareLayoutSizing(
  path: string,
  actual: DSStructureNode,
  reference: DSStructureNode,
  actualSizing: DSNodeLayout['sizing'],
  referenceSizing: DSNodeLayout['sizing'],
  diffs: DiffEntry[],
) {
  const axes = [
    { axis: 'horizontal' as const, label: 'Ширина в auto-layout' },
    { axis: 'vertical' as const, label: 'Высота в auto-layout' },
  ];

  for (const { axis, label } of axes) {
    const referenceValue = normalizeLayoutSizing(referenceSizing?.[axis] ?? null);
    if (!referenceValue) continue;
    const actualValue = normalizeLayoutSizing(actualSizing?.[axis] ?? null);
    if (!actualValue || actualValue === referenceValue) continue;
    pushDiff(
      diffs,
      actual,
      reference,
      path,
      `${label}: ${formatLayoutSizing(referenceValue)} → ${formatLayoutSizing(actualValue)}`,
      'layout',
      {
        property: `layout.sizing.${axis}`,
        reference: { value: formatLayoutSizing(referenceValue) },
        actual: { value: formatLayoutSizing(actualValue) },
      },
    );
  }
}

function compareLayoutAlignment(
  path: string,
  actualNode: DSStructureNode,
  referenceNode: DSStructureNode,
  actualLayout: DSNodeLayout,
  referenceLayout: DSNodeLayout,
  diffs: DiffEntry[],
) {
  const fields = [
    {
      property: 'primaryAxisAlignItems' as const,
      label: 'Выравнивание по основной оси',
    },
    {
      property: 'counterAxisAlignItems' as const,
      label: 'Выравнивание по поперечной оси',
    },
  ];

  for (const { property, label } of fields) {
    const referenceValue = referenceLayout[property] ?? null;
    const actualValue = actualLayout[property] ?? null;
    if (!referenceValue || !actualValue || referenceValue === actualValue) continue;
    pushDiff(
      diffs,
      actualNode,
      referenceNode,
      path,
      `${label}: ${referenceValue} → ${actualValue}`,
      'layout',
      {
        property: `layout.${property}`,
        reference: { value: referenceValue },
        actual: { value: actualValue },
      },
    );
  }
}

function compareVariantProperties(
  path: string,
  actualNode: DSStructureNode,
  referenceNode: DSStructureNode,
  diffs: DiffEntry[],
) {
  const actualProperties = actualNode.componentInstance?.variantProperties ?? null;
  const referenceProperties = getReferenceVariantProperties(referenceNode);

  if (!actualProperties && !referenceProperties) {
    return;
  }

  const propertyEntries = new Map<
    string,
    {
      property: string;
      referenceProperty: string | null;
      actualProperty: string | null;
      referenceValue: string | null;
      actualValue: string | null;
    }
  >();

  for (const property of Object.keys(referenceProperties ?? {})) {
    const key = property.toLowerCase();
    propertyEntries.set(key, {
      property,
      referenceProperty: property,
      actualProperty: null,
      referenceValue: referenceProperties?.[property] ?? null,
      actualValue: null,
    });
  }
  for (const property of Object.keys(actualProperties ?? {})) {
    const key = property.toLowerCase();
    const entry =
      propertyEntries.get(key) ??
      {
        property,
        referenceProperty: null,
        actualProperty: property,
        referenceValue: null,
        actualValue: null,
      };
    entry.actualProperty = property;
    entry.actualValue = actualProperties?.[property] ?? null;
    propertyEntries.set(key, entry);
  }

  const entries = Array.from(propertyEntries.values()).sort((left, right) =>
    left.property.localeCompare(right.property),
  );

  for (const entry of entries) {
    const property =
      entry.referenceProperty ?? entry.actualProperty ?? entry.property;
    const referenceValue =
      entry.referenceValue ??
      getUnanchoredExpectedVariantValue(property, entry.actualValue);
    const actualValue = entry.actualValue;

    if (actualValue === null) {
      continue;
    }

    if (variantValuesEqual(referenceValue, actualValue)) {
      continue;
    }

    if (referenceValue === null) {
      continue;
    }

    const label = property.charAt(0).toLowerCase() + property.slice(1);
    pushDiff(
      diffs,
      actualNode,
      referenceNode,
      path,
      `${label}: ${formatVariantValue(referenceValue)} → ${formatVariantValue(actualValue)}`,
      'other',
      {
        property: `variant.${property}`,
        reference: { value: referenceValue },
        actual: { value: actualValue },
      },
    );
  }
}

function getReferenceVariantProperties(
  referenceNode: DSStructureNode,
): Record<string, string> | null {
  const componentProperties =
    referenceNode.componentInstance?.variantProperties ?? null;
  const parsedProperties = shouldUseReferenceVariantName(referenceNode)
    ? parseVariantName(getReferenceVariantName(referenceNode))
    : {};

  if (!componentProperties && !Object.keys(parsedProperties).length) {
    return null;
  }

  return Object.assign({}, parsedProperties, componentProperties ?? {});
}

function shouldUseReferenceVariantName(referenceNode: DSStructureNode): boolean {
  if (referenceNode.type === 'COMPONENT' || referenceNode.type === 'COMPONENT_SET') {
    return true;
  }

  return (referenceNode.referenceOrigin ?? 'host') === 'host';
}

function getReferenceVariantName(referenceNode: DSStructureNode): string {
  const pathLeaf = referenceNode.path.split(' / ').pop() ?? '';
  return referenceNode.name || pathLeaf;
}

function getUnanchoredExpectedVariantValue(
  property: string,
  actualValue: string | null,
): string | null {
  if (!actualValue) {
    return null;
  }

  const normalizedProperty = property.toLowerCase();
  const normalizedValue = actualValue.toLowerCase();
  const defaultValues: Record<string, string> = {
    disabledstate: 'False',
    disabled: 'False',
    singleicon: 'False',
    overflow: 'False',
  };
  const defaultValue = defaultValues[normalizedProperty] ?? null;

  if (!defaultValue || defaultValue.toLowerCase() === normalizedValue) {
    return null;
  }

  return defaultValue;
}

function variantValuesEqual(left: string | null, right: string | null): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function formatVariantValue(value: string | null): string {
  return value || '—';
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
  resolveVariableMetadata?: VariableMetadataResolver,
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
    const actualToken = actualTokens?.[side] ?? null;
    const referenceToken = referenceTokens?.[side] ?? null;

    if (b === null) {
      continue;
    }

    if (strict && a === null) {
      if (isUnavailableInstanceRootProperty(actualNode, referenceNode)) {
        continue;
      }
      addIssue(
        issueSet,
        `Нет данных для padding ${label(side)} в снапшоте для «${path}»`,
      );
      continue;
    }

    if (referenceToken && !actualToken) {
      const formattedReferenceToken = formatPaddingTokenLabel(
        referenceToken,
        resolveTokenLabel,
      );
      pushDiff(
        diffs,
        actualNode,
        referenceNode,
        path,
        `Переменная padding ${label(side)}: ${formattedReferenceToken} → Отвязана (значение: ${a ?? '—'})`,
        'layout',
        {
          property: `layout.padding.${side}`,
          reference: createBoundDiffValue(
            b,
            referenceToken,
            referenceNode,
            resolveVariableMetadata,
          ),
          actual: createBoundDiffValue(
            a,
            null,
            actualNode,
            resolveVariableMetadata,
          ),
          bindingStatus: 'unbound',
        },
      );
      continue;
    }

    if (a !== b) {
      if (
        bindingsEquivalent(
          actualToken,
          referenceToken,
          resolveVariableMetadata,
        )
      ) {
        continue;
      }
      pushDiff(
        diffs,
        actualNode,
        referenceNode,
        path,
        `Паддинг ${label(side)}: ${b ?? '—'} → ${a ?? '—'}`,
        'layout',
        {
          property: `layout.padding.${side}`,
          reference: createBoundDiffValue(
            b,
            referenceToken,
            referenceNode,
            resolveVariableMetadata,
          ),
          actual: createBoundDiffValue(
            a,
            actualToken,
            actualNode,
            resolveVariableMetadata,
          ),
          bindingStatus: classifyBindingStatus(
            actualToken,
            referenceToken,
            resolveVariableMetadata,
          ),
        },
      );
      continue;
    }

    const refToken = referenceToken;

    if (refToken) {
      if (
        !bindingsEquivalent(actualToken, refToken, resolveVariableMetadata)
      ) {
        const formattedReferenceToken = formatPaddingTokenLabel(refToken, resolveTokenLabel);
        const formattedActualToken = formatPaddingTokenLabel(actualToken, resolveTokenLabel);
        if (formattedActualToken === formattedReferenceToken) {
          continue;
        }
        const referenceDisplay = formatVariableBindingDisplay(
          b,
          refToken,
          resolveTokenLabel,
          resolveVariableMetadata,
        );
        const actualDisplay = formatVariableBindingDisplay(
          a,
          actualToken,
          resolveTokenLabel,
          resolveVariableMetadata,
        );
        pushDiff(
          diffs,
          actualNode,
          referenceNode,
          path,
          `Паддинг ${label(side)} (токен): ${referenceDisplay} → ${actualDisplay}`,
          'layout',
          {
            property: `layout.paddingTokens.${side}`,
            reference: createVariableTokenDiffValue(
              b,
              refToken,
              referenceNode,
              referenceDisplay,
              resolveVariableMetadata,
            ),
            actual: createVariableTokenDiffValue(
              a,
              actualToken,
              actualNode,
              actualDisplay,
              resolveVariableMetadata,
            ),
            bindingStatus: classifyBindingStatus(
              actualToken,
              refToken,
              resolveVariableMetadata,
            ),
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
  actualPaint?: ComparablePaint | null,
): boolean {
  if (reference === undefined) return false;

  if ((actual ?? null) === (reference ?? null)) return false;
  if (
    actual &&
    reference &&
    canonicalStyleIdentity(actual) === canonicalStyleIdentity(reference)
  ) {
    return false;
  }

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

function compareRawTypography(
  path: string,
  actualNode: DSStructureNode,
  referenceNode: DSStructureNode,
  diffs: DiffEntry[],
  hasTextStyleDiff: boolean,
) {
  if (
    hasTextStyleDiff ||
    actualNode.type !== 'TEXT' ||
    referenceNode.type !== 'TEXT' ||
    referenceNode.styles?.text?.styleKey
  ) {
    return;
  }

  const fields: Array<keyof NonNullable<DSStructureNode['text']>> = [
    'fontName',
    'fontSize',
    'lineHeight',
    'letterSpacing',
    'paragraphSpacing',
  ];
  const changedFields = fields.filter((field) => {
    const referenceValue = referenceNode.text?.[field];
    const actualValue = actualNode.text?.[field];
    return (
      referenceValue !== undefined &&
      actualValue !== undefined &&
      actualValue !== referenceValue
    );
  });
  if (!changedFields.length) return;

  const referenceDisplay = formatRawTypography(referenceNode);
  const actualDisplay = formatRawTypography(actualNode);
  pushDiff(
    diffs,
    actualNode,
    referenceNode,
    path,
    `Типографика: ${referenceDisplay} → ${actualDisplay}`,
    'text-style',
    {
      property: 'styles.text',
      reference: { value: referenceDisplay },
      actual: { value: actualDisplay },
    },
  );
}

function compareTextCase(
  path: string,
  actualNode: DSStructureNode,
  referenceNode: DSStructureNode,
  diffs: DiffEntry[],
) {
  if (actualNode.type !== 'TEXT' || referenceNode.type !== 'TEXT') return;
  const referenceCase = referenceNode.text?.case ?? 'ORIGINAL';
  const actualCase = actualNode.text?.case ?? 'ORIGINAL';
  if (referenceCase === actualCase) return;

  pushDiff(
    diffs,
    actualNode,
    referenceNode,
    path,
    `Регистр: ${referenceCase} → ${actualCase}`,
    'text-style',
    {
      property: 'text.case',
      reference: { value: referenceCase },
      actual: { value: actualCase },
    },
  );
}

function compareTextAlignment(
  path: string,
  actualNode: DSStructureNode,
  referenceNode: DSStructureNode,
  diffs: DiffEntry[],
) {
  if (actualNode.type !== 'TEXT' || referenceNode.type !== 'TEXT') return;
  const referenceAlignment = referenceNode.text?.alignHorizontal;
  const actualAlignment = actualNode.text?.alignHorizontal;
  if (!referenceAlignment || !actualAlignment || referenceAlignment === actualAlignment) return;

  pushDiff(
    diffs,
    actualNode,
    referenceNode,
    path,
    `Выравнивание текста: ${referenceAlignment} → ${actualAlignment}`,
    'text-style',
    {
      property: 'text.align.horizontal',
      reference: { value: referenceAlignment },
      actual: { value: actualAlignment },
    },
  );
}

function formatRawTypography(node: DSStructureNode): string {
  const text = node.text;
  if (!text) return '—';
  const font = text.fontName ?? '—';
  const size = text.fontSize ?? '—';
  const lineHeight = text.lineHeight ?? '—';
  return `${font} · ${size}/${lineHeight}`;
}

function canonicalStyleIdentity(styleId: string): string {
  const normalized = styleId.trim();
  if (!normalized.startsWith('S:')) {
    return normalized;
  }
  return normalized.slice(2).split(',')[0].trim();
}

function describePaintValue(
  paint: ComparablePaint | null | undefined,
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
  if (
    paint?.paintTypes?.some((paintType) => paintType === 'IMAGE') ||
    (typeof color === 'string' && color.split(',').some((value) => value.trim() === 'paint:IMAGE'))
  ) {
    return {
      kind: 'image',
      id: null,
      text: 'Изображение',
    };
  }
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
  actual: ComparablePaint | null | undefined,
  reference: ComparablePaint | null | undefined,
  diffs: DiffEntry[],
  issueSet: Set<string>,
  strict: boolean,
  resolveTokenLabel?: (token: string) => string | null,
  isPaintToken?: (token: string) => boolean,
  actualStyleKey?: string | null,
  referenceStyleKey?: string | null,
  resolveStyleLabel?: (styleKey: string) => string | null,
  skipBecauseStyleDiff = false,
  resolveVariableMetadata?: VariableMetadataResolver,
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
          actual: paintValueToDiffValue(
            actualValue,
            actualNode,
            resolveVariableMetadata,
          ),
          bindingStatus:
            actualValue.kind === 'token'
              ? 'missing-reference-binding'
              : null,
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
    if (isUnavailableInstanceRootProperty(actualNode, referenceNode)) {
      return;
    }
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

  if (
    referenceToken &&
    !actualToken &&
    !normalizedActualStyleKey
  ) {
    if (actualValue?.kind === 'image') {
      pushDiff(
        diffs,
        actualNode,
        referenceNode,
        path,
        `Заливка: ${referenceValue.text} → ${actualValue.text}`,
        'paint',
        {
          property: label === 'обводка' ? 'stroke' : 'fill',
          reference: paintValueToDiffValue(
            referenceValue,
            referenceNode,
            resolveVariableMetadata,
          ),
          actual: paintValueToDiffValue(
            actualValue,
            actualNode,
            resolveVariableMetadata,
          ),
          bindingStatus: null,
        },
      );
      return;
    }
    const bindingLabel =
      label === 'обводка' ? 'Переменная обводки' : 'Переменная заливки';
    pushDiff(
      diffs,
      actualNode,
      referenceNode,
      path,
      `${bindingLabel}: ${referenceValue.text} → Отвязана (значение: ${actualValue?.text ?? '—'})`,
      label === 'обводка' || label === 'заливка' ? 'paint' : 'other',
      {
        property: label === 'обводка' ? 'stroke' : 'fill',
        reference: paintValueToDiffValue(
          referenceValue,
          referenceNode,
          resolveVariableMetadata,
        ),
        actual: actualValue
          ? paintValueToDiffValue(
              actualValue,
              actualNode,
              resolveVariableMetadata,
            )
          : { value: null, bindingId: null, binding: null },
        bindingStatus: 'unbound',
      },
    );
    return;
  }

  if (
    actualToken &&
    referenceToken &&
    bindingsEquivalent(actualToken, referenceToken, resolveVariableMetadata)
  ) {
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
      reference: paintValueToDiffValue(
        referenceValue,
        referenceNode,
        resolveVariableMetadata,
      ),
      actual: actualValue
        ? paintValueToDiffValue(
            actualValue,
            actualNode,
            resolveVariableMetadata,
          )
        : { value: null },
      bindingStatus:
        referenceValue.kind === 'token' || actualValue?.kind === 'token'
          ? classifyBindingStatus(
              actualToken,
              referenceToken,
              resolveVariableMetadata,
            )
          : null,
    },
  );
}

function compareEffects(
  path: string,
  actualNode: DSStructureNode,
  referenceNode: DSStructureNode,
  actual: DSEffect[] | null | undefined,
  reference: DSEffect[] | null | undefined,
  diffs: DiffEntry[],
) {
  if (reference === undefined && actual === undefined) return;
  const referenceEffects = reference ?? [];
  const actualEffects = actual ?? [];
  if (effectsMatchReference(actualEffects, referenceEffects)) return;

  const referenceLabel = formatEffects(referenceEffects);
  const actualLabel = formatEffects(actualEffects);
  pushDiff(
    diffs,
    actualNode,
    referenceNode,
    path,
    `Эффекты: ${referenceLabel} → ${actualLabel}`,
    'other',
    {
      property: 'effects',
      reference: {
        value: referenceLabel,
        resourceType: 'effects',
        displayName: referenceLabel,
        effects: cloneEffects(referenceEffects),
      },
      actual: {
        value: actualLabel,
        resourceType: 'effects',
        displayName: actualLabel,
        effects: cloneEffects(actualEffects),
      },
    },
  );
}

function effectsMatchReference(actual: DSEffect[], reference: DSEffect[]): boolean {
  if (actual.length !== reference.length) return false;
  return reference.every((expected, index) => {
    const observed = actual[index];
    if (!observed || observed.type !== expected.type) return false;
    if (expected.radius !== null && observed.radius !== expected.radius) return false;
    if (expected.color != null && observed.color !== expected.color) return false;
    if (expected.spread != null && observed.spread !== expected.spread) return false;
    if (expected.visible != null && observed.visible !== expected.visible) return false;
    if (expected.blendMode != null && observed.blendMode !== expected.blendMode) return false;
    if (expected.offset) {
      if (!observed.offset) return false;
      if (observed.offset.x !== expected.offset.x || observed.offset.y !== expected.offset.y) {
        return false;
      }
    }
    return true;
  });
}

function formatEffects(effects: DSEffect[]): string {
  if (!effects.length) return 'Нет';
  return effects.map((effect) => {
    const parts = [effect.type];
    if (effect.radius !== null) parts.push(`blur ${effect.radius}`);
    if (effect.color) parts.push(effect.color);
    if (effect.offset) parts.push(`offset ${effect.offset.x}/${effect.offset.y}`);
    if (effect.spread != null) parts.push(`spread ${effect.spread}`);
    if (effect.visible === false) parts.push('скрыт');
    return parts.join(' · ');
  }).join(', ');
}

function cloneEffects(effects: DSEffect[]): DSEffect[] {
  return effects.map((effect) => Object.assign({}, effect, {
    offset: effect.offset ? Object.assign({}, effect.offset) : effect.offset,
  }));
}

function paintValueToDiffValue(
  value: PaintValueDescription,
  node: DSStructureNode,
  resolveVariableMetadata?: VariableMetadataResolver,
): DiffValueDetails {
  const result: DiffValueDetails = {
    value: value.text,
    resourceType: value.kind,
    resourceId: value.id,
    displayName: value.text,
  };
  if (value.kind === 'token' && value.id) {
    result.bindingId = value.id;
    result.binding = createVariableBindingEvidence(
      node,
      value.id,
      resolveVariableMetadata,
    );
  }
  return result;
}

function isUnavailableInstanceRootProperty(
  actualNode: DSStructureNode,
  referenceNode: DSStructureNode,
): boolean {
  return actualNode.type === 'INSTANCE' && referenceNode.type === 'COMPONENT';
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
  resolveVariableMetadata?: VariableMetadataResolver,
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
    if (hasActualStroke && actualValue) {
      pushDiff(
        diffs,
        actualNode,
        referenceNode,
        path,
        `Обводка: — → ${actualValue.text}`,
        'paint',
        {
          property: 'stroke',
          reference: { value: null },
          actual: paintValueToDiffValue(
            actualValue,
            actualNode,
            resolveVariableMetadata,
          ),
          bindingStatus:
            actualValue.kind === 'token'
              ? 'missing-reference-binding'
              : null,
        },
      );
    }
    return;
  }

  if (!actual && isUnavailableInstanceRootProperty(actualNode, referenceNode)) {
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
      false,
      resolveVariableMetadata,
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

  const referenceAlign = normalizeStrokeAlignment(reference.align);
  if (referenceAlign && actual) {
    const actualAlign = normalizeStrokeAlignment(actual.align);
    if (strict && !actualAlign) {
      addIssue(
        issueSet,
        `Нет данных для положения обводки в снапшоте для «${path}»`,
      );
    } else if (actualAlign !== referenceAlign) {
      const referenceLabel = formatStrokeAlignment(referenceAlign);
      const actualLabel = formatStrokeAlignment(actualAlign);
      pushDiff(
        diffs,
        actualNode,
        referenceNode,
        path,
        `Положение обводки: ${referenceLabel} → ${actualLabel}`,
        'shape',
        {
          property: 'stroke.align',
          reference: { value: referenceLabel },
          actual: { value: actualLabel },
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
  resolveVariableMetadata?: VariableMetadataResolver,
) {
  if (reference === null) return;

  if (actual === null && reference === 0) return;

  if (strict && actual === null) {
    addIssue(
      issueSet,
      `Нет данных для скруглений в снапшоте для «${path}»`,
    );
    return;
  }

  if (referenceToken && !actualToken) {
    const formattedReferenceToken = formatTokenLabel(
      referenceToken,
      resolveTokenLabel,
    );
    pushDiff(
      diffs,
      actualNode,
      referenceNode,
      path,
      `Переменная скругления: ${formattedReferenceToken} → Отвязана (значение: ${formatRadius(actual)})`,
      'layout',
      {
        property: 'radius',
        reference: createBoundDiffValue(
          formatRadius(reference),
          referenceToken,
          referenceNode,
          resolveVariableMetadata,
        ),
        actual: createBoundDiffValue(
          formatRadius(actual),
          null,
          actualNode,
          resolveVariableMetadata,
        ),
        bindingStatus: 'unbound',
      },
    );
    return;
  }

  if (referenceToken) {
    if (
      !bindingsEquivalent(actualToken, referenceToken, resolveVariableMetadata)
    ) {
      const formattedReferenceToken = formatTokenLabel(referenceToken, resolveTokenLabel);
      const formattedActualToken = formatTokenLabel(actualToken, resolveTokenLabel);
      if (formattedActualToken !== formattedReferenceToken) {
        const referenceValue = formatRadius(reference);
        const actualValue = formatRadius(actual);
        const referenceDisplay = formatVariableBindingDisplay(
          referenceValue,
          referenceToken,
          resolveTokenLabel,
          resolveVariableMetadata,
        );
        const actualDisplay = formatVariableBindingDisplay(
          actualValue,
          actualToken,
          resolveTokenLabel,
          resolveVariableMetadata,
        );
        pushDiff(
          diffs,
          actualNode,
          referenceNode,
          path,
          `Скругления (токен): ${referenceDisplay} → ${actualDisplay}`,
          'layout',
          {
            property: 'radiusToken',
            reference: createVariableTokenDiffValue(
              referenceValue,
              referenceToken,
              referenceNode,
              referenceDisplay,
              resolveVariableMetadata,
            ),
            actual: createVariableTokenDiffValue(
              actualValue,
              actualToken,
              actualNode,
              actualDisplay,
              resolveVariableMetadata,
            ),
            bindingStatus: classifyBindingStatus(
              actualToken,
              referenceToken,
              resolveVariableMetadata,
            ),
          },
        );
      }
    }
  }

  if (JSON.stringify(actual ?? null) === JSON.stringify(reference ?? null))
    return;

  if (
    bindingsEquivalent(actualToken, referenceToken, resolveVariableMetadata)
  ) {
    return;
  }

  pushDiff(
    diffs,
    actualNode,
    referenceNode,
    path,
    `Скругления: ${formatRadius(reference)} → ${formatRadius(actual)}`,
    'layout',
    {
      property: 'radius',
      reference: createBoundDiffValue(
        formatRadius(reference),
        referenceToken,
        referenceNode,
        resolveVariableMetadata,
      ),
      actual: createBoundDiffValue(
        formatRadius(actual),
        actualToken,
        actualNode,
        resolveVariableMetadata,
      ),
      bindingStatus: classifyBindingStatus(
        actualToken,
        referenceToken,
        resolveVariableMetadata,
      ),
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
  resolveVariableMetadata?: VariableMetadataResolver,
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

  if (referenceToken && !actualToken) {
    const formattedReferenceToken = formatTokenLabel(
      referenceToken,
      resolveTokenLabel,
    );
    pushDiff(
      diffs,
      actualNode,
      referenceNode,
      path,
      `Переменная opacity: ${formattedReferenceToken} → Отвязана (значение: ${normalizedActual ?? '—'})`,
      'opacity',
      {
        property: 'opacity',
        reference: createBoundDiffValue(
          normalizedReference,
          referenceToken,
          referenceNode,
          resolveVariableMetadata,
        ),
        actual: createBoundDiffValue(
          normalizedActual,
          null,
          actualNode,
          resolveVariableMetadata,
        ),
        bindingStatus: 'unbound',
      },
    );
    return;
  }

  if (referenceToken) {
    if (
      !bindingsEquivalent(actualToken, referenceToken, resolveVariableMetadata)
    ) {
      const formattedReferenceToken = formatTokenLabel(referenceToken, resolveTokenLabel);
      const formattedActualToken = formatTokenLabel(actualToken, resolveTokenLabel);
      if (formattedActualToken !== formattedReferenceToken) {
        const referenceDisplay = formatVariableBindingDisplay(
          normalizedReference,
          referenceToken,
          resolveTokenLabel,
          resolveVariableMetadata,
        );
        const actualDisplay = formatVariableBindingDisplay(
          normalizedActual,
          actualToken,
          resolveTokenLabel,
          resolveVariableMetadata,
        );
        pushDiff(
          diffs,
          actualNode,
          referenceNode,
          path,
          `Прозрачность (токен): ${referenceDisplay} → ${actualDisplay}`,
          'opacity',
          {
            property: 'opacityToken',
            reference: createVariableTokenDiffValue(
              normalizedReference,
              referenceToken,
              referenceNode,
              referenceDisplay,
              resolveVariableMetadata,
            ),
            actual: createVariableTokenDiffValue(
              normalizedActual,
              actualToken,
              actualNode,
              actualDisplay,
              resolveVariableMetadata,
            ),
            bindingStatus: classifyBindingStatus(
              actualToken,
              referenceToken,
              resolveVariableMetadata,
            ),
          },
        );
      }
    }
  }
  if (normalizedActual === normalizedReference) return;
  if (
    bindingsEquivalent(actualToken, referenceToken, resolveVariableMetadata)
  ) {
    return;
  }
  pushDiff(
    diffs,
    actualNode,
    referenceNode,
    path,
    `Прозрачность: ${normalizedReference ?? '—'} → ${normalizedActual ?? '—'}`,
    'opacity',
    {
      property: 'opacity',
      reference: createBoundDiffValue(
        normalizedReference,
        referenceToken,
        referenceNode,
        resolveVariableMetadata,
      ),
      actual: createBoundDiffValue(
        normalizedActual,
        actualToken,
        actualNode,
        resolveVariableMetadata,
      ),
      bindingStatus: classifyBindingStatus(
        actualToken,
        referenceToken,
        resolveVariableMetadata,
      ),
    },
  );
}

function createBoundDiffValue(
  value: string | number | null,
  bindingId: string | null,
  node: DSStructureNode,
  resolveVariableMetadata?: VariableMetadataResolver,
): DiffValueDetails {
  if (!bindingId) {
    return { value, bindingId: null, binding: null };
  }
  const binding = createVariableBindingEvidence(
    node,
    bindingId,
    resolveVariableMetadata,
  );
  return {
    value,
    resourceType: 'token',
    resourceId: bindingId,
    displayName: binding?.name ?? null,
    bindingId,
    binding,
  };
}

function createVariableTokenDiffValue(
  value: string | number | null,
  bindingId: string | null,
  node: DSStructureNode,
  displayName: string,
  resolveVariableMetadata?: VariableMetadataResolver,
): DiffValueDetails {
  return {
    value,
    resourceType: 'token',
    resourceId: bindingId,
    displayName,
    bindingId,
    binding: createVariableBindingEvidence(
      node,
      bindingId,
      resolveVariableMetadata,
    ),
  };
}

function formatVariableBindingDisplay(
  value: string | number | null,
  bindingId: string | null,
  resolveTokenLabel?: (token: string) => string | null,
  resolveVariableMetadata?: VariableMetadataResolver,
): string {
  const metadata = bindingId
    ? resolveVariableMetadata?.(bindingId) ?? null
    : null;
  const resolvedTokenLabel = bindingId
    ? resolveTokenLabel?.(bindingId) ?? null
    : null;
  const baseValue =
    value === null
      ? formatTokenLabel(bindingId, resolveTokenLabel)
      : resolvedTokenLabel ?? String(value);
  const collectionName = metadata?.collectionName?.trim() ?? '';
  return collectionName
    ? `${baseValue} (${collectionName})`
    : baseValue;
}

function createVariableBindingEvidence(
  node: DSStructureNode,
  bindingId: string | null,
  resolveVariableMetadata?: VariableMetadataResolver,
): VariableBindingEvidence | null {
  if (!bindingId) return null;
  const metadata = resolveVariableMetadata?.(bindingId) ?? null;
  const collectionId = metadata?.collectionId ?? null;
  const modeContext = collectionId
    ? node.variableModes?.find(
        (context) => context.collectionId === collectionId,
      ) ?? null
    : null;
  const resolvedModeId = modeContext?.resolvedModeId ?? null;
  const explicitModeId = modeContext?.explicitModeId ?? null;
  const modeNames = metadata?.modeNames ?? {};
  const modeOwnerNodeId = modeContext?.explicitOwnerNodeId ?? null;
  let modeSource: VariableBindingEvidence['modeSource'] = 'unknown';
  if (modeOwnerNodeId && modeOwnerNodeId === node.nodeId) {
    modeSource = 'explicit';
  } else if (modeOwnerNodeId) {
    modeSource = 'inherited';
  } else if (resolvedModeId) {
    modeSource = 'resolved';
  }
  return {
    id: bindingId,
    key: metadata?.variableKey ?? null,
    name: metadata?.variableName ?? null,
    collectionId,
    collectionName: metadata?.collectionName ?? null,
    resolvedModeId,
    resolvedModeName: resolvedModeId ? modeNames[resolvedModeId] ?? null : null,
    explicitModeId,
    explicitModeName: explicitModeId ? modeNames[explicitModeId] ?? null : null,
    modeSource,
    modeOwnerNodeId,
    modeOwnerName: modeContext?.explicitOwnerName ?? null,
    modeOwnerPath: modeContext?.explicitOwnerPath ?? null,
  };
}

function bindingsEquivalent(
  actualBindingId: string | null,
  referenceBindingId: string | null,
  resolveVariableMetadata?: VariableMetadataResolver,
): boolean {
  if (!actualBindingId || !referenceBindingId) return false;
  if (actualBindingId === referenceBindingId) return true;
  const actualIdentity = canonicalBindingIdentity(
    actualBindingId,
    resolveVariableMetadata,
  );
  const referenceIdentity = canonicalBindingIdentity(
    referenceBindingId,
    resolveVariableMetadata,
  );
  return Boolean(actualIdentity && actualIdentity === referenceIdentity);
}

function classifyBindingStatus(
  actualBindingId: string | null,
  referenceBindingId: string | null,
  resolveVariableMetadata?: VariableMetadataResolver,
): VariableBindingStatus | null {
  if (!actualBindingId && !referenceBindingId) return null;
  if (!actualBindingId) return 'unbound';
  if (!referenceBindingId) return 'missing-reference-binding';
  if (
    bindingsEquivalent(
      actualBindingId,
      referenceBindingId,
      resolveVariableMetadata,
    )
  ) {
    return 'same-binding';
  }
  const actualMetadata = resolveVariableMetadata?.(actualBindingId) ?? null;
  const referenceMetadata =
    resolveVariableMetadata?.(referenceBindingId) ?? null;
  if (!actualMetadata || !referenceMetadata) {
    return 'unresolved-binding';
  }
  return 'different-binding';
}

function canonicalBindingIdentity(
  bindingId: string,
  resolveVariableMetadata?: VariableMetadataResolver,
): string | null {
  const variableKey = resolveVariableMetadata?.(bindingId)?.variableKey ?? null;
  if (variableKey) return `key:${variableKey}`;
  const normalized = bindingId.trim();
  return normalized ? `id:${normalized}` : null;
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
  contractEvidenceOnly = false,
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
    contractEvidenceOnly,
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
      actualVariantProperties:
        node.componentInstance?.variantProperties ??
        node.referenceOwnerVariantProperties ??
        null,
      referenceVariantProperties:
        referenceNode.componentInstance?.variantProperties ??
        referenceNode.referenceOwnerVariantProperties ??
        null,
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
