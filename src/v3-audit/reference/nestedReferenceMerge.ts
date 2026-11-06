import type {
  DSReferencePropertyOwner,
  DSStructureNode,
} from '../types/structures';
import { buildOccurrenceKeyMap } from '../structure/occurrenceKeys';
import { traceAudit } from '../utils/auditInstrumentation';

export type MaterializedInstanceReferenceDecision = {
  preferCandidate: boolean;
  reason:
    | 'outside-materialized-subtree'
    | 'candidate-not-nested'
    | 'deeper-nested-materialization'
    | 'merge-parent-owned-descendant'
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

  if (
    decision.reason === 'merge-parent-owned-descendant' ||
    decision.reason === 'merge-parent-variant-owned-descendant'
  ) {
    const merged = applyParentOwnedProperties(candidateNode, existingNode);
    traceMaterializedPaintDecision(existingNode, candidateNode, merged, decision);
    return merged;
  }

  if (
    decision.reason !== 'replace-instance-root' &&
    !(decision.reason === 'replace-host-descendant' && decision.relativePath === '')
  ) {
    return applyParentOwnedProperties(candidateNode, existingNode);
  }

  const merged = applyMaterializedHostVariantBaselineToNode(candidateNode, existingNode);
  const result = applyParentOwnedProperties(merged, existingNode);
  traceMaterializedPaintDecision(existingNode, candidateNode, result, decision);
  return result;
}

function traceMaterializedPaintDecision(
  parentVariantNode: DSStructureNode,
  candidateNode: DSStructureNode,
  resultNode: DSStructureNode,
  decision: MaterializedInstanceReferenceDecision,
) {
  const parentPaint = paintIdentity(parentVariantNode);
  const candidatePaint = paintIdentity(candidateNode);
  const resultPaint = paintIdentity(resultNode);
  if (!parentPaint && !candidatePaint && !resultPaint) return;
  traceAudit('materialized-paint-baseline', {
    path: resultNode.path,
    reason: decision.reason,
    ownerComponentKey: decision.ownerComponentKey,
    relativePath: decision.relativePath,
    parentVariantPaint: parentPaint,
    nestedCandidatePaint: candidatePaint,
    selectedPaint: resultPaint,
    parentOwnedProperties: getParentOwnedPropertyPaths(
      parentVariantNode,
      candidateNode,
    ),
    propertyOwners: resultNode.referencePropertyOwners ?? {},
  });
}

function paintIdentity(node: DSStructureNode): string | null {
  return node.fill?.token ?? node.fill?.color ?? node.styles?.fill?.styleKey ?? null;
}

export function selectMaterializedInstanceMergeSource(
  existingNode: DSStructureNode,
  originalHostBaseline: DSStructureNode | null | undefined,
  decision: MaterializedInstanceReferenceDecision,
): DSStructureNode {
  if (
    decision.reason === 'merge-parent-owned-descendant' ||
    decision.reason === 'merge-parent-variant-owned-descendant'
  ) {
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

const WHOLE_REFERENCE_PROPERTY_PATHS = [
  'fill',
  'stroke',
  'effects',
  'variableModes',
];

const LEAF_REFERENCE_PROPERTY_ROOTS = [
  'styles',
  'layout',
  'radius',
  'text',
  'componentInstance.variantProperties',
];

const SCALAR_REFERENCE_PROPERTY_PATHS = [
  'visible',
  'opacity',
  'clipsContent',
  'opacityToken',
  'typographyToken',
  'radiusToken',
];

/**
 * Materializes an effective nested baseline property by property.
 *
 * `parentNode` is the value observed in the containing component's canonical
 * structure. `candidateNode` is the standalone baseline of the nested
 * component. Whenever those canonical values differ, the containing
 * component owns that property. Equal and parent-absent properties continue
 * to come from the nested component. This is the only ownership inference
 * used by the merge; component names and path decoration are intentionally
 * irrelevant.
 */
function applyParentOwnedProperties(
  candidateNode: DSStructureNode,
  parentNode: DSStructureNode,
): DSStructureNode {
  const ownedProperties = getParentOwnedPropertyPaths(parentNode, candidateNode);
  if (!ownedProperties.length) {
    return attachDefaultPropertyOwners(candidateNode);
  }

  const merged = Object.assign(
    {},
    candidateNode,
    {
      referencePropertyOwners: clonePropertyOwners(
        attachDefaultPropertyOwners(candidateNode).referencePropertyOwners,
      ),
    },
  ) as DSStructureNode;
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
          parentNode as unknown as Record<string, unknown>,
          segments,
        ),
      ),
    );
    if (!merged.referencePropertyOwners) {
      merged.referencePropertyOwners = {};
    }
    merged.referencePropertyOwners[property] = resolveParentPropertyOwner(
      parentNode,
      property,
    );
  }

  const combinedOwnedProperties = new Set<string>(
    candidateNode.referenceVariantOwnedProperties ?? [],
  );
  for (const property of ownedProperties) {
    if (isVariantOwnedProperty(parentNode, property)) {
      combinedOwnedProperties.add(property);
    }
  }

  merged.referenceOrigin = parentNode.referenceOrigin ?? 'nested-component';
  merged.referenceOwnerComponentKey =
    parentNode.referenceOwnerComponentKey ??
    candidateNode.referenceOwnerComponentKey ??
    null;
  merged.referenceOwnerRole =
    parentNode.referenceOwnerRole ??
    candidateNode.referenceOwnerRole ??
    null;
  merged.referenceOwnerPath =
    parentNode.referenceOwnerPath ??
    candidateNode.referenceOwnerPath ??
    null;
  merged.referenceOwnerRelativePath =
    parentNode.referenceOwnerRelativePath ??
    candidateNode.referenceOwnerRelativePath ??
    null;
  merged.referenceOwnerVariantProperties =
    parentNode.referenceOwnerVariantProperties ??
    candidateNode.referenceOwnerVariantProperties ??
    null;
  merged.referenceVariantOwnedProperties =
    Array.from(combinedOwnedProperties).sort();

  return merged;
}

function getParentOwnedPropertyPaths(
  parentNode: DSStructureNode,
  candidateNode: DSStructureNode,
): string[] {
  const owned = new Set<string>();
  const parentRecord = parentNode as unknown as Record<string, unknown>;
  const candidateRecord = candidateNode as unknown as Record<string, unknown>;
  for (const path of WHOLE_REFERENCE_PROPERTY_PATHS) {
    if (
      hasNestedProperty(parentRecord, path.split('.')) &&
      !propertyValuesEqual(
        getNestedProperty(parentRecord, path.split('.')),
        getNestedProperty(candidateRecord, path.split('.')),
      )
    ) {
      owned.add(path);
    }
  }

  for (const path of SCALAR_REFERENCE_PROPERTY_PATHS) {
    if (
      hasNestedProperty(parentRecord, path.split('.')) &&
      !propertyValuesEqual(
        getNestedProperty(parentRecord, path.split('.')),
        getNestedProperty(candidateRecord, path.split('.')),
      )
    ) {
      owned.add(path);
    }
  }

  for (const root of LEAF_REFERENCE_PROPERTY_ROOTS) {
    const segments = root.split('.');
    const parentValue = getNestedProperty(parentRecord, segments);
    if (!hasNestedProperty(parentRecord, segments)) {
      continue;
    }
    collectDifferentOwnedLeafPaths(
      parentValue,
      getNestedProperty(candidateRecord, segments),
      root,
      owned,
    );
  }

  for (const property of parentNode.referenceVariantOwnedProperties ?? []) {
    owned.add(property);
  }

  return collapseOwnedPropertyPaths(Array.from(owned));
}

function collectDifferentOwnedLeafPaths(
  parentValue: unknown,
  candidateValue: unknown,
  path: string,
  result: Set<string>,
) {
  if (
    parentValue == null ||
    Array.isArray(parentValue) ||
    typeof parentValue !== 'object'
  ) {
    if (!propertyValuesEqual(parentValue, candidateValue)) {
      result.add(path);
    }
    return;
  }

  const parentRecord = parentValue as Record<string, unknown>;
  const candidateRecord =
    candidateValue && typeof candidateValue === 'object' && !Array.isArray(candidateValue)
      ? candidateValue as Record<string, unknown>
      : {};
  for (const key of Object.keys(parentRecord)) {
    collectDifferentOwnedLeafPaths(
      parentRecord[key],
      candidateRecord[key],
      `${path}.${key}`,
      result,
    );
  }
}

function collapseOwnedPropertyPaths(paths: string[]): string[] {
  const sorted = Array.from(new Set(paths)).sort((left, right) => {
    const depthDifference = left.split('.').length - right.split('.').length;
    return depthDifference || left.localeCompare(right);
  });
  const result: string[] = [];
  for (const path of sorted) {
    if (result.some((parent) => path.startsWith(`${parent}.`))) {
      continue;
    }
    result.push(path);
  }
  return result.sort();
}

function attachDefaultPropertyOwners(node: DSStructureNode): DSStructureNode {
  const existing = node.referencePropertyOwners ?? {};
  const owners = clonePropertyOwners(existing);
  const owner = buildReferencePropertyOwner(node, 'nested-baseline');
  const propertyPaths = collectPresentReferencePropertyPaths(node);
  let changed = false;
  for (const property of propertyPaths) {
    if (owners[property]) {
      continue;
    }
    owners[property] = cloneReferencePropertyOwner(owner);
    changed = true;
  }
  if (!changed && node.referencePropertyOwners) {
    return node;
  }
  return Object.assign({}, node, { referencePropertyOwners: owners });
}

function collectPresentReferencePropertyPaths(node: DSStructureNode): string[] {
  const record = node as unknown as Record<string, unknown>;
  const result = new Set<string>();
  for (const path of WHOLE_REFERENCE_PROPERTY_PATHS.concat(
    SCALAR_REFERENCE_PROPERTY_PATHS,
  )) {
    if (hasNestedProperty(record, path.split('.'))) {
      result.add(path);
    }
  }
  for (const root of LEAF_REFERENCE_PROPERTY_ROOTS) {
    const segments = root.split('.');
    if (!hasNestedProperty(record, segments)) {
      continue;
    }
    collectPresentLeafPaths(getNestedProperty(record, segments), root, result);
  }
  return collapseOwnedPropertyPaths(Array.from(result));
}

function collectPresentLeafPaths(
  value: unknown,
  path: string,
  result: Set<string>,
) {
  if (value == null || Array.isArray(value) || typeof value !== 'object') {
    result.add(path);
    return;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (!keys.length) {
    result.add(path);
    return;
  }
  for (const key of keys) {
    collectPresentLeafPaths(record[key], `${path}.${key}`, result);
  }
}

function resolveParentPropertyOwner(
  parentNode: DSStructureNode,
  property: string,
): DSReferencePropertyOwner {
  const existing = findPropertyOwner(parentNode.referencePropertyOwners, property);
  if (existing) {
    return cloneReferencePropertyOwner(existing);
  }
  return buildReferencePropertyOwner(
    parentNode,
    isVariantOwnedProperty(parentNode, property)
      ? 'variant-patch'
      : 'host-override',
  );
}

function findPropertyOwner(
  owners: Record<string, DSReferencePropertyOwner> | null | undefined,
  property: string,
): DSReferencePropertyOwner | null {
  if (!owners) {
    return null;
  }
  if (owners[property]) {
    return owners[property];
  }
  const parentPath = Object.keys(owners)
    .filter((candidate) => property.startsWith(`${candidate}.`))
    .sort((left, right) => right.length - left.length)[0];
  return parentPath ? owners[parentPath] : null;
}

function buildReferencePropertyOwner(
  node: DSStructureNode,
  origin: DSReferencePropertyOwner['origin'],
): DSReferencePropertyOwner {
  return {
    componentKey: node.referenceOwnerComponentKey ?? null,
    ownerPath: node.referenceOwnerPath ?? null,
    ownerRelativePath: node.referenceOwnerRelativePath ?? null,
    origin,
  };
}

function clonePropertyOwners(
  owners: Record<string, DSReferencePropertyOwner> | null | undefined,
): Record<string, DSReferencePropertyOwner> {
  const result: Record<string, DSReferencePropertyOwner> = {};
  for (const key of Object.keys(owners ?? {})) {
    result[key] = cloneReferencePropertyOwner((owners ?? {})[key]);
  }
  return result;
}

function cloneReferencePropertyOwner(
  owner: DSReferencePropertyOwner,
): DSReferencePropertyOwner {
  return {
    componentKey: owner.componentKey,
    ownerPath: owner.ownerPath,
    ownerRelativePath: owner.ownerRelativePath,
    origin: owner.origin,
  };
}

function isVariantOwnedProperty(node: DSStructureNode, property: string): boolean {
  return (node.referenceVariantOwnedProperties ?? []).some(
    (owned) =>
      owned === property ||
      property.startsWith(`${owned}.`) ||
      owned.startsWith(`${property}.`),
  );
}

function hasNestedProperty(
  source: Record<string, unknown>,
  segments: string[],
): boolean {
  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return false;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return true;
}

function propertyValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => propertyValuesEqual(value, right[index]));
  }
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  if (!propertyValuesEqual(leftKeys, rightKeys)) {
    return false;
  }
  return leftKeys.every((key) => propertyValuesEqual(leftRecord[key], rightRecord[key]));
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
      preferDeeper &&
      getParentOwnedPropertyPaths(existingNode, candidateNode).length > 0
    ) {
      return buildDecision(
        true,
        'merge-parent-owned-descendant',
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
    getParentOwnedPropertyPaths(existingNode, candidateNode).length > 0
  ) {
    return buildDecision(
      true,
      'merge-parent-owned-descendant',
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

  if (getParentOwnedPropertyPaths(existingNode, candidateNode).length > 0) {
    return buildDecision(
      true,
      'merge-parent-owned-descendant',
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
