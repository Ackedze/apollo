import type { DSStructureNode } from '../types/structures';
import { buildOccurrenceKeyMap } from '../structure/occurrenceKeys';

export type MaterializedInstanceReferenceDecision = {
  preferCandidate: boolean;
  reason:
    | 'outside-materialized-subtree'
    | 'candidate-not-nested'
    | 'deeper-nested-materialization'
    | 'merge-parent-variant-owned-descendant'
    | 'keep-existing-nested-materialization'
    | 'existing-not-host'
    | 'replace-instance-root'
    | 'replace-host-descendant'
    | 'keep-host-controlled-descendant'
    | 'keep-host-painted-descendant'
    | 'keep-host-typography-descendant'
    | 'missing-owner-context'
    | 'path-mismatch';
  existingOrigin: 'host' | 'nested-component';
  candidateOrigin: 'host' | 'nested-component';
  ownerComponentKey: string | null;
  relativePath: string | null;
  withinMaterializedSubtree: boolean;
};

export function shouldPreferMaterializedInstanceReference(
  existingNode: DSStructureNode,
  candidateNode: DSStructureNode,
  materializedRootPath: string,
  isHostControlledPath?: (
    componentKey: string | null | undefined,
    relativePath: string | null | undefined,
  ) => boolean,
): boolean {
  return getMaterializedInstanceReferenceDecision(
    existingNode,
    candidateNode,
    materializedRootPath,
    isHostControlledPath,
  ).preferCandidate;
}

export function mergeMaterializedInstanceReferenceNode(
  existingNode: DSStructureNode,
  candidateNode: DSStructureNode,
  decision: MaterializedInstanceReferenceDecision,
): DSStructureNode {
  if (decision.preferCandidate !== true) {
    return candidateNode;
  }

  if (decision.reason === 'merge-parent-variant-owned-descendant') {
    return applyParentVariantOwnedProperties(candidateNode, existingNode);
  }

  if (
    decision.reason !== 'replace-instance-root' &&
    !(decision.reason === 'replace-host-descendant' && decision.relativePath === '')
  ) {
    return (existingNode.referenceVariantOwnedProperties?.length ?? 0) > 0
      ? applyParentVariantOwnedProperties(candidateNode, existingNode)
      : candidateNode;
  }

  const merged = applyMaterializedHostVariantBaselineToNode(candidateNode, existingNode);
  return (existingNode.referenceVariantOwnedProperties?.length ?? 0) > 0
    ? applyParentVariantOwnedProperties(merged, existingNode)
    : merged;
}

export function selectMaterializedInstanceMergeSource(
  existingNode: DSStructureNode,
  originalHostBaseline: DSStructureNode | null | undefined,
  decision: MaterializedInstanceReferenceDecision,
): DSStructureNode {
  if (decision.reason === 'merge-parent-variant-owned-descendant') {
    return existingNode;
  }
  return originalHostBaseline ?? existingNode;
}

export function alignMaterializedReferenceInstancePaths(
  referenceNodes: DSStructureNode[],
  actualNodes: DSStructureNode[],
  materializedRootPath: string,
): DSStructureNode[] {
  if (!referenceNodes.length || !actualNodes.length || !materializedRootPath) {
    return referenceNodes;
  }

  const referenceInstances = collectNestedInstanceIdentities(
    referenceNodes,
    materializedRootPath,
  );
  const actualInstances = collectNestedInstanceIdentities(
    actualNodes,
    materializedRootPath,
  );
  const pathMappings: Array<{ from: string; to: string }> = [];
  const usedActualNodes = new Set<DSStructureNode>();

  for (const referenceEntry of referenceInstances) {
    let actualEntry = referenceEntry.keyIdentity
      ? actualInstances.find(
          (entry) =>
            !usedActualNodes.has(entry.node) &&
            entry.keyIdentity === referenceEntry.keyIdentity,
        ) ?? null
      : null;
    if (!actualEntry && referenceEntry.nameIdentity) {
      actualEntry =
        actualInstances.find(
          (entry) =>
            !usedActualNodes.has(entry.node) &&
            entry.nameIdentity === referenceEntry.nameIdentity,
        ) ?? null;
    }
    if (!actualEntry) {
      continue;
    }
    usedActualNodes.add(actualEntry.node);
    if (referenceEntry.node.path === actualEntry.node.path) {
      continue;
    }
    pathMappings.push({
      from: referenceEntry.node.path,
      to: actualEntry.node.path,
    });
  }

  if (!pathMappings.length) {
    return referenceNodes;
  }

  pathMappings.sort((left, right) => right.from.length - left.from.length);

  return referenceNodes.map((node) => {
    const alignedPath = applyLongestPathMapping(node.path, pathMappings);
    const currentOwnerPath = node.referenceOwnerPath ?? null;
    const alignedOwnerPath = currentOwnerPath
      ? applyLongestPathMapping(currentOwnerPath, pathMappings)
      : null;
    if (alignedPath === node.path && alignedOwnerPath === currentOwnerPath) {
      return node;
    }

    const cloned = Object.assign({}, node, {
      path: alignedPath,
      referenceOwnerPath: alignedOwnerPath,
    });
    if (alignedOwnerPath) {
      cloned.referenceOwnerRelativePath = getRelativeAlignedPath(
        alignedOwnerPath,
        alignedPath,
      );
    }
    return cloned;
  });
}

type NestedInstanceIdentity = {
  node: DSStructureNode;
  keyIdentity: string | null;
  nameIdentity: string;
};

function collectNestedInstanceIdentities(
  nodes: DSStructureNode[],
  materializedRootPath: string,
): NestedInstanceIdentity[] {
  const nodesById = new Map<number, DSStructureNode>();
  for (const node of nodes) {
    nodesById.set(node.id, node);
  }

  const result: NestedInstanceIdentity[] = [];
  for (const node of nodes) {
    if (
      node.type !== 'INSTANCE' ||
      node.path === materializedRootPath ||
      !isWithinMaterializedSubtree(node.path, materializedRootPath)
    ) {
      continue;
    }

    const identity = buildNestedInstanceIdentities(
      node,
      nodesById,
      materializedRootPath,
    );
    if (!identity.nameIdentity) {
      continue;
    }
    result.push({
      node,
      keyIdentity: identity.keyIdentity,
      nameIdentity: identity.nameIdentity,
    });
  }
  return result;
}

function buildNestedInstanceIdentities(
  node: DSStructureNode,
  nodesById: Map<number, DSStructureNode>,
  materializedRootPath: string,
): { keyIdentity: string | null; nameIdentity: string } {
  const componentKeys: string[] = [];
  const componentNames: string[] = [];
  let completeKeyChain = true;
  let current: DSStructureNode | null = node;

  while (current) {
    if (
      current.path !== materializedRootPath &&
      current.type === 'INSTANCE'
    ) {
      const componentKey = current.componentInstance?.componentKey ?? '';
      if (componentKey) {
        componentKeys.unshift(componentKey);
      } else {
        completeKeyChain = false;
      }
      componentNames.unshift(normalizeNestedInstanceName(current.name));
    }
    if (current.path === materializedRootPath) {
      break;
    }
    current =
      typeof current.parentId === 'number'
        ? nodesById.get(current.parentId) ?? null
        : null;
  }

  return {
    keyIdentity:
      completeKeyChain && componentKeys.length
        ? componentKeys.join('>')
        : null,
    nameIdentity: componentNames.join('>'),
  };
}

function normalizeNestedInstanceName(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(/^[^A-Za-zА-Яа-яЁё0-9\[]+/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function applyLongestPathMapping(
  path: string,
  mappings: Array<{ from: string; to: string }>,
): string {
  for (const mapping of mappings) {
    if (path === mapping.from) {
      return mapping.to;
    }
    if (path.startsWith(`${mapping.from} / `)) {
      return `${mapping.to}${path.slice(mapping.from.length)}`;
    }
  }
  return path;
}

function getRelativeAlignedPath(ownerPath: string, nodePath: string): string | null {
  if (ownerPath === nodePath) {
    return '';
  }
  const prefix = `${ownerPath} / `;
  return nodePath.startsWith(prefix) ? nodePath.slice(prefix.length) : null;
}

function applyParentVariantOwnedProperties(
  candidateNode: DSStructureNode,
  parentVariantNode: DSStructureNode,
): DSStructureNode {
  const ownedProperties = parentVariantNode.referenceVariantOwnedProperties ?? [];
  if (!ownedProperties.length) {
    return candidateNode;
  }

  const merged = Object.assign({}, candidateNode) as DSStructureNode;
  for (const property of ownedProperties) {
    const segments = property.split('.').filter(Boolean);
    if (!segments.length) {
      continue;
    }
    setNestedProperty(
      merged as unknown as Record<string, unknown>,
      segments,
      clonePropertyValue(
        getNestedProperty(
          parentVariantNode as unknown as Record<string, unknown>,
          segments,
        ),
      ),
    );
  }

  const combinedOwnedProperties = new Set<string>(
    candidateNode.referenceVariantOwnedProperties ?? [],
  );
  for (const property of ownedProperties) {
    combinedOwnedProperties.add(property);
  }

  merged.referenceOrigin = parentVariantNode.referenceOrigin ?? 'nested-component';
  merged.referenceOwnerComponentKey =
    parentVariantNode.referenceOwnerComponentKey ??
    candidateNode.referenceOwnerComponentKey ??
    null;
  merged.referenceOwnerRole =
    parentVariantNode.referenceOwnerRole ??
    candidateNode.referenceOwnerRole ??
    null;
  merged.referenceOwnerPath =
    parentVariantNode.referenceOwnerPath ??
    candidateNode.referenceOwnerPath ??
    null;
  merged.referenceOwnerRelativePath =
    parentVariantNode.referenceOwnerRelativePath ??
    candidateNode.referenceOwnerRelativePath ??
    null;
  merged.referenceOwnerVariantProperties =
    parentVariantNode.referenceOwnerVariantProperties ??
    candidateNode.referenceOwnerVariantProperties ??
    null;
  merged.referenceVariantOwnedProperties =
    Array.from(combinedOwnedProperties).sort();

  return merged;
}

function getNestedProperty(
  source: Record<string, unknown>,
  segments: string[],
): unknown {
  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setNestedProperty(
  target: Record<string, unknown>,
  segments: string[],
  value: unknown,
) {
  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const existing = current[segment];
    const next =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? Object.assign({}, existing as Record<string, unknown>)
        : {};
    current[segment] = next;
    current = next;
  }
  current[segments[segments.length - 1]] = value;
}

function clonePropertyValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(clonePropertyValue);
  }
  if (value && typeof value === 'object') {
    const clone: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      clone[key] = clonePropertyValue(
        (value as Record<string, unknown>)[key],
      );
    }
    return clone;
  }
  return value;
}

export function applyMaterializedHostVariantBaselineToNode(
  candidateNode: DSStructureNode,
  hostNode: DSStructureNode | null | undefined,
): DSStructureNode {
  if (candidateNode.type !== 'INSTANCE') {
    return candidateNode;
  }

  const hostVariantProperties =
    hostNode?.componentInstance?.variantProperties ?? null;
  if (!hostVariantProperties || !Object.keys(hostVariantProperties).length) {
    return candidateNode;
  }

  const currentVariantProperties =
    candidateNode.componentInstance?.variantProperties ?? null;
  const effectiveVariantProperties = Object.assign({}, hostVariantProperties);
  for (const [property, value] of Object.entries(
    currentVariantProperties ?? {},
  )) {
    if (isParentVariantOwnedInstanceProperty(candidateNode, property)) {
      effectiveVariantProperties[property] = value;
    }
  }
  if (
    currentVariantProperties &&
    variantPropertiesEqual(currentVariantProperties, effectiveVariantProperties)
  ) {
    return candidateNode;
  }

  return Object.assign({}, candidateNode, {
    componentInstance: Object.assign({}, candidateNode.componentInstance ?? {}, {
      componentKey:
        candidateNode.componentInstance?.componentKey ??
        hostNode?.componentInstance?.componentKey ??
        '',
      variantProperties: effectiveVariantProperties,
    }),
  });
}

function isParentVariantOwnedInstanceProperty(
  node: DSStructureNode,
  property: string,
): boolean {
  const exactPath = `componentInstance.variantProperties.${property}`;
  return (node.referenceVariantOwnedProperties ?? []).some(
    (ownedPath) =>
      ownedPath === 'componentInstance' ||
      ownedPath === 'componentInstance.variantProperties' ||
      ownedPath === exactPath,
  );
}

export function applyMaterializedHostVariantBaselines(
  referenceEntries: DSStructureNode[],
  hostReference: DSStructureNode[],
): DSStructureNode[] {
  const hostOccurrenceKeys = buildOccurrenceKeyMap(hostReference);
  const hostNodesByOccurrence = new Map<string, DSStructureNode>();

  for (const hostNode of hostReference) {
    const variantProperties = hostNode.componentInstance?.variantProperties ?? null;
    if (
      hostNode.type !== 'INSTANCE' ||
      !variantProperties ||
      !Object.keys(variantProperties).length
    ) {
      continue;
    }

    hostNodesByOccurrence.set(
      hostOccurrenceKeys.get(hostNode) ?? hostNode.path,
      hostNode,
    );
  }

  if (!hostNodesByOccurrence.size) {
    return referenceEntries;
  }

  const referenceOccurrenceKeys = buildOccurrenceKeyMap(referenceEntries);
  return referenceEntries.map((entry) => {
    if (entry.type !== 'INSTANCE') {
      return entry;
    }

    const occurrenceKey = referenceOccurrenceKeys.get(entry) ?? entry.path;
    const hostNode = hostNodesByOccurrence.get(occurrenceKey) ?? null;
    if (!hostNode) {
      return entry;
    }
    return applyMaterializedHostVariantBaselineToNode(entry, hostNode);
  });
}

function variantPropertiesEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

export function getMaterializedInstanceReferenceDecision(
  existingNode: DSStructureNode,
  candidateNode: DSStructureNode,
  materializedRootPath: string,
  isHostControlledPath?: (
    componentKey: string | null | undefined,
    relativePath: string | null | undefined,
  ) => boolean,
): MaterializedInstanceReferenceDecision {
  const withinMaterializedSubtree = isWithinMaterializedSubtree(
    candidateNode.path,
    materializedRootPath,
  );
  const existingOrigin = existingNode.referenceOrigin ?? 'host';
  const candidateOrigin = candidateNode.referenceOrigin ?? 'host';
  const ownerComponentKey = candidateNode.referenceOwnerComponentKey ?? null;
  const relativePath = candidateNode.referenceOwnerRelativePath ?? null;

  if (!withinMaterializedSubtree) {
    return buildDecision(
      false,
      'outside-materialized-subtree',
      existingOrigin,
      candidateOrigin,
      ownerComponentKey,
      relativePath,
      withinMaterializedSubtree,
    );
  }

  if (candidateOrigin !== 'nested-component') {
    return buildDecision(
      false,
      'candidate-not-nested',
      existingOrigin,
      candidateOrigin,
      ownerComponentKey,
      relativePath,
      withinMaterializedSubtree,
    );
  }

  if (existingOrigin === 'nested-component') {
    const preferDeeper = shouldPreferDeeperNestedMaterialization(
      existingNode,
      candidateNode,
    );
    if (
      hasDifferentExplicitPaint(existingNode, candidateNode) &&
      shouldKeepExistingNestedPaintMaterialization(
        existingNode,
        candidateNode,
        isHostControlledPath,
      )
    ) {
      return buildDecision(
        false,
        'keep-host-controlled-descendant',
        existingOrigin,
        candidateOrigin,
        ownerComponentKey,
        relativePath,
        withinMaterializedSubtree,
      );
    }

    if (
      preferDeeper &&
      (existingNode.referenceVariantOwnedProperties?.length ?? 0) > 0
    ) {
      return buildDecision(
        true,
        'merge-parent-variant-owned-descendant',
        existingOrigin,
        candidateOrigin,
        ownerComponentKey,
        relativePath,
        withinMaterializedSubtree,
      );
    }

    return buildDecision(
      preferDeeper,
      preferDeeper
        ? 'deeper-nested-materialization'
        : 'keep-existing-nested-materialization',
      existingOrigin,
      candidateOrigin,
      ownerComponentKey,
      relativePath,
      withinMaterializedSubtree,
    );
  }

  if (existingOrigin !== 'host') {
    return buildDecision(
      false,
      'existing-not-host',
      existingOrigin,
      candidateOrigin,
      ownerComponentKey,
      relativePath,
      withinMaterializedSubtree,
    );
  }

  if (
    existingNode.path === candidateNode.path &&
    (existingNode.referenceVariantOwnedProperties?.length ?? 0) > 0
  ) {
    return buildDecision(
      true,
      'merge-parent-variant-owned-descendant',
      existingOrigin,
      candidateOrigin,
      ownerComponentKey,
      relativePath,
      withinMaterializedSubtree,
    );
  }

  if (existingNode.type !== 'INSTANCE' || candidateNode.type !== 'INSTANCE') {
    return getHostDescendantDecision(
      existingNode,
      candidateNode,
      existingOrigin,
      candidateOrigin,
      withinMaterializedSubtree,
      isHostControlledPath,
    );
  }

  if (
    typeof isHostControlledPath === 'function' &&
    isHostControlledPath(ownerComponentKey, relativePath)
  ) {
    return buildDecision(
      false,
      'keep-host-controlled-descendant',
      existingOrigin,
      candidateOrigin,
      ownerComponentKey,
      relativePath,
      withinMaterializedSubtree,
    );
  }

  return buildDecision(
    true,
    'replace-instance-root',
    existingOrigin,
    candidateOrigin,
    ownerComponentKey,
    relativePath,
    withinMaterializedSubtree,
  );
}

export function shouldPreferDeeperNestedMaterialization(
  existingNode: DSStructureNode,
  candidateNode: DSStructureNode,
): boolean {
  const existingOwnerPath = existingNode.referenceOwnerPath ?? null;
  const candidateOwnerPath = candidateNode.referenceOwnerPath ?? null;

  if (!existingOwnerPath || !candidateOwnerPath) {
    return false;
  }

  if (existingOwnerPath === candidateOwnerPath) {
    return false;
  }

  return candidateOwnerPath.startsWith(`${existingOwnerPath} / `);
}

function shouldKeepExistingNestedPaintMaterialization(
  existingNode: DSStructureNode,
  candidateNode: DSStructureNode,
  isHostControlledPath?: (
    componentKey: string | null | undefined,
    relativePath: string | null | undefined,
  ) => boolean,
): boolean {
  const candidateOwnerComponentKey = candidateNode.referenceOwnerComponentKey ?? null;
  const candidateRelativePath = candidateNode.referenceOwnerRelativePath ?? null;
  if (
    typeof isHostControlledPath === 'function' &&
    isHostControlledPath(candidateOwnerComponentKey, candidateRelativePath)
  ) {
    return true;
  }

  const existingOwnerComponentKey = existingNode.referenceOwnerComponentKey ?? null;
  const existingRelativePath = existingNode.referenceOwnerRelativePath ?? null;
  if (
    typeof isHostControlledPath === 'function' &&
    isHostControlledPath(existingOwnerComponentKey, existingRelativePath)
  ) {
    return true;
  }

  return isComponentQualifiedParentPaint(existingRelativePath, candidateRelativePath);
}

function isComponentQualifiedParentPaint(
  existingRelativePath: string | null | undefined,
  candidateRelativePath: string | null | undefined,
): boolean {
  if (!existingRelativePath || !candidateRelativePath) {
    return false;
  }

  if (
    existingRelativePath === candidateRelativePath ||
    !existingRelativePath.endsWith(candidateRelativePath)
  ) {
    return false;
  }

  return /(^| \/ )\[[^\]]+\] /.test(existingRelativePath);
}

function shouldPreferMaterializedHostDescendant(
  existingNode: DSStructureNode,
  candidateNode: DSStructureNode,
  isHostControlledPath?: (
    componentKey: string | null | undefined,
    relativePath: string | null | undefined,
  ) => boolean,
): boolean {
  const ownerComponentKey = candidateNode.referenceOwnerComponentKey ?? null;
  const relativePath = candidateNode.referenceOwnerRelativePath ?? null;

  if (!ownerComponentKey || relativePath == null) {
    return false;
  }

  if (existingNode.path !== candidateNode.path) {
    return false;
  }

  if (typeof isHostControlledPath === 'function') {
    return isHostControlledPath(ownerComponentKey, relativePath) !== true;
  }

  return true;
}

function getHostDescendantDecision(
  existingNode: DSStructureNode,
  candidateNode: DSStructureNode,
  existingOrigin: 'host' | 'nested-component',
  candidateOrigin: 'host' | 'nested-component',
  withinMaterializedSubtree: boolean,
  isHostControlledPath?: (
    componentKey: string | null | undefined,
    relativePath: string | null | undefined,
  ) => boolean,
): MaterializedInstanceReferenceDecision {
  const ownerComponentKey = candidateNode.referenceOwnerComponentKey ?? null;
  const relativePath = candidateNode.referenceOwnerRelativePath ?? null;

  if (!ownerComponentKey || relativePath == null) {
    return buildDecision(
      false,
      'missing-owner-context',
      existingOrigin,
      candidateOrigin,
      ownerComponentKey,
      relativePath,
      withinMaterializedSubtree,
    );
  }

  if (existingNode.path !== candidateNode.path) {
    return buildDecision(
      false,
      'path-mismatch',
      existingOrigin,
      candidateOrigin,
      ownerComponentKey,
      relativePath,
      withinMaterializedSubtree,
    );
  }

  if (hasDifferentExplicitPaint(existingNode, candidateNode)) {
    return buildDecision(
      false,
      'keep-host-painted-descendant',
      existingOrigin,
      candidateOrigin,
      ownerComponentKey,
      relativePath,
      withinMaterializedSubtree,
    );
  }

  if (hasDifferentExplicitTypography(existingNode, candidateNode)) {
    return buildDecision(
      false,
      'keep-host-typography-descendant',
      existingOrigin,
      candidateOrigin,
      ownerComponentKey,
      relativePath,
      withinMaterializedSubtree,
    );
  }

  const preferCandidate = shouldPreferMaterializedHostDescendant(
    existingNode,
    candidateNode,
    isHostControlledPath,
  );

  return buildDecision(
    preferCandidate,
    preferCandidate ? 'replace-host-descendant' : 'keep-host-controlled-descendant',
    existingOrigin,
    candidateOrigin,
    ownerComponentKey,
    relativePath,
    withinMaterializedSubtree,
  );
}

function hasDifferentExplicitPaint(
  existingNode: DSStructureNode,
  candidateNode: DSStructureNode,
): boolean {
  if (!hasPaintDescriptor(existingNode) || !hasPaintDescriptor(candidateNode)) {
    return false;
  }

  return !arePaintDescriptorsEqual(existingNode, candidateNode);
}

function hasDifferentExplicitTypography(
  existingNode: DSStructureNode,
  candidateNode: DSStructureNode,
): boolean {
  const existingDescriptor = getExplicitTypographyDescriptor(existingNode);
  const candidateDescriptor = getExplicitTypographyDescriptor(candidateNode);
  if (!existingDescriptor || !candidateDescriptor) {
    return false;
  }
  return existingDescriptor !== candidateDescriptor;
}

function getExplicitTypographyDescriptor(node: DSStructureNode): string | null {
  const styleKey = node.styles?.text?.styleKey ?? null;
  const token = node.typographyToken ?? null;
  if (!styleKey && !token) {
    return null;
  }
  return `${styleKey ?? ''}|${token ?? ''}`;
}

function hasPaintDescriptor(node: DSStructureNode): boolean {
  return Boolean(
    node.fill?.token ||
    node.fill?.color ||
    node.stroke?.token ||
    node.stroke?.color ||
    node.styles?.fill?.styleKey ||
    node.styles?.stroke?.styleKey,
  );
}

function arePaintDescriptorsEqual(
  left: DSStructureNode,
  right: DSStructureNode,
): boolean {
  return (
    (left.fill?.token ?? null) === (right.fill?.token ?? null) &&
    (left.fill?.color ?? null) === (right.fill?.color ?? null) &&
    (left.stroke?.token ?? null) === (right.stroke?.token ?? null) &&
    (left.stroke?.color ?? null) === (right.stroke?.color ?? null) &&
    (left.styles?.fill?.styleKey ?? null) ===
      (right.styles?.fill?.styleKey ?? null) &&
    (left.styles?.stroke?.styleKey ?? null) ===
      (right.styles?.stroke?.styleKey ?? null)
  );
}

function buildDecision(
  preferCandidate: boolean,
  reason: MaterializedInstanceReferenceDecision['reason'],
  existingOrigin: 'host' | 'nested-component',
  candidateOrigin: 'host' | 'nested-component',
  ownerComponentKey: string | null,
  relativePath: string | null,
  withinMaterializedSubtree: boolean,
): MaterializedInstanceReferenceDecision {
  return {
    preferCandidate,
    reason,
    existingOrigin,
    candidateOrigin,
    ownerComponentKey,
    relativePath,
    withinMaterializedSubtree,
  };
}

function isWithinMaterializedSubtree(path: string, materializedRootPath: string): boolean {
  return (
    path === materializedRootPath || path.startsWith(`${materializedRootPath} / `)
  );
}
