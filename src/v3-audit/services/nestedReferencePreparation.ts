import {
  __test_hydrateCatalogs,
  findComponent,
  isNestedComponentLayoutPathHostControlled,
  isNestedComponentPaintPathHostControlled,
  isNestedComponentTextPathHostControlled,
  resolveStructureForInstance,
} from '../reference/library';
import type { AthenaCatalog } from '../reference/libraryTypes';
import {
  alignMaterializedReferenceInstancePaths,
  applyMaterializedHostVariantBaselines,
  applyMaterializedHostVariantBaselineToNode,
  getMaterializedInstanceReferenceDecision,
  mergeMaterializedInstanceReferenceNode,
  selectMaterializedInstanceMergeSource,
} from '../reference/nestedReferenceMerge';
import {
  buildOccurrenceIndexMap,
  buildOccurrenceKeyMap,
  makeOccurrenceKey,
} from '../structure/occurrenceKeys';
import type { DiffEntry } from '../structure/diff';
import type { DSStructureNode } from '../types/structures';
import { traceAudit } from '../utils/auditInstrumentation';
import type { SurfaceContextEvidence } from '../assessment/surfaceContext';

export function alignStructurePaths(
  actual: DSStructureNode[],
  reference: DSStructureNode[],
): DSStructureNode[] {
  if (actual.length === 0 || reference.length === 0) return actual;
  const actualRoot = actual[0].path;
  const referenceRoot =
    reference.find((node) => !node.path.includes(' / '))?.path ??
    reference[0].path;
  if (!actualRoot || !referenceRoot || actualRoot === referenceRoot) {
    return actual;
  }

  const prefix = actualRoot;
  const newPrefix = referenceRoot;
  return actual.map((node) => {
    const cloned = Object.assign({}, node);
    cloned.path = replacePathPrefix(node.path, prefix, newPrefix);
    return cloned;
  });
}

export function attachSurfaceContext(
  diff: DiffEntry,
  surfaceContext: SurfaceContextEvidence,
): DiffEntry {
  return Object.assign({}, diff, {
    context: Object.assign({}, diff.context, { surfaceContext }),
  });
}

export function expandReferenceWithInstanceComponents(
  reference: DSStructureNode[],
  actual: DSStructureNode[],
): DSStructureNode[] {
  if (!reference.length || !actual.length) return reference;

  // Align the complete authored host reference before recursively expanding
  // nested component baselines. Figma may expose a nested instance with a
  // consumer-facing name (`Label`) while the catalog keeps a technical name
  // (`🔩 Label`). If only the standalone nested reference is aligned, the
  // original host-owned descendant remains under the old path and the deeper
  // baseline is appended as a second node. That duplicate can then replace an
  // exact parent-owned paint with the generic nested baseline. Aligning the
  // host first gives every subsequent materialization one canonical occurrence
  // key and lets the property-level ownership merge do its job.
  const alignedHostReference = alignMaterializedReferenceInstancePaths(
    reference,
    actual,
    actual[0]?.path ?? reference[0]?.path ?? '',
  );
  const referenceEntries: DSStructureNode[] = alignedHostReference.map((node) =>
    Object.assign({}, node, {
      referenceOrigin: node.referenceOrigin ?? 'host',
    }),
  );
  let nextSyntheticReferenceId =
    referenceEntries.reduce(
      (maxId, entry) => (typeof entry.id === 'number' ? Math.max(maxId, entry.id) : maxId),
      0,
    ) + 1;
  const referenceOccurrenceKeys = buildOccurrenceKeyMap(referenceEntries);
  const referenceKeyToIndex = new Map<string, number>();
  const hostReferenceByOccurrenceKey = new Map<string, DSStructureNode>();
  for (let index = 0; index < referenceEntries.length; index += 1) {
    const entry = referenceEntries[index];
    const occurrenceKey = referenceOccurrenceKeys.get(entry) ?? entry.path;
    referenceKeyToIndex.set(occurrenceKey, index);
    hostReferenceByOccurrenceKey.set(occurrenceKey, entry);
  }
  const actualOccurrenceIndexMap = buildOccurrenceIndexMap(actual);
  const actualRootPath = actual[0]?.path ?? '';
  const visited = new Set<string>();

  for (const node of actual) {
    if (node.type !== 'INSTANCE') continue;
    if (!node.componentInstance?.componentKey) continue;
    if (node.path === actualRootPath) continue;

    const componentKey = node.componentInstance.componentKey;
    const visitKey = `${node.path}::${componentKey}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    const componentRef = findComponent(componentKey);
    const resolvedVariantProperties = node.componentInstance?.variantProperties ?? null;
    const instanceStructure = resolveStructureForInstance(
      componentRef,
      node.componentInstance ?? null,
    );
    if (!instanceStructure || instanceStructure.length === 0) continue;
    const ownerRole = componentRef?.role ?? null;
    const actualOccurrenceIndex = actualOccurrenceIndexMap.get(node) ?? 1;

    traceAudit('nested-reference-resolution', {
      nodePath: node.path,
      nestedComponentKey: componentKey,
      variantProperties: resolvedVariantProperties,
      resolvedReferenceRoot: instanceStructure[0]?.path ?? null,
      referenceOrigin: 'nested-component',
    });

    const instanceRoot =
      instanceStructure.find((item) => !item.path.includes(' / '))?.path ??
      instanceStructure[0].path;

    const aligned =
      instanceRoot && instanceRoot !== node.path
        ? instanceStructure.map((refNode) => {
            const cloned = Object.assign({}, refNode);
            cloned.path = replacePathPrefix(refNode.path, instanceRoot, node.path);
            cloned.referenceOrigin = 'nested-component';
            cloned.referenceOwnerComponentKey = componentKey;
            cloned.referenceOwnerRole = ownerRole;
            cloned.referenceOwnerPath = node.path;
            cloned.referenceOwnerRelativePath = getRelativeReferenceOwnerPath(
              node.path,
              cloned.path,
            );
            cloned.referenceOwnerVariantProperties =
              resolvedVariantProperties == null
                ? null
                : Object.assign({}, resolvedVariantProperties);
            return cloned;
          })
        : instanceStructure.map((refNode) =>
            Object.assign({}, refNode, {
              referenceOrigin: 'nested-component',
              referenceOwnerComponentKey: componentKey,
              referenceOwnerRole: ownerRole,
              referenceOwnerPath: node.path,
              referenceOwnerRelativePath: getRelativeReferenceOwnerPath(
                node.path,
                refNode.path,
              ),
              referenceOwnerVariantProperties:
                resolvedVariantProperties == null
                  ? null
                  : Object.assign({}, resolvedVariantProperties),
            }),
          );
    const identityAligned = alignMaterializedReferenceInstancePaths(
      aligned,
      actual,
      node.path,
    );
    const rebasedAligned = rebaseReferenceSubtreeIds(
      identityAligned,
      nextSyntheticReferenceId,
    );
    nextSyntheticReferenceId += rebasedAligned.length;

    for (const rawRefNode of rebasedAligned) {
      const occurrenceKey = makeOccurrenceKey(rawRefNode.path, actualOccurrenceIndex);
      const existingIndex = referenceKeyToIndex.get(occurrenceKey);
      const existingNode =
        typeof existingIndex === 'number' ? referenceEntries[existingIndex] : null;
      const hostBaselineNode =
        hostReferenceByOccurrenceKey.get(occurrenceKey) ?? existingNode;
      const refNode =
        rawRefNode.path === node.path
          ? applyMaterializedHostVariantBaselineToNode(rawRefNode, hostBaselineNode)
          : rawRefNode;
      const mergeDecision =
        existingNode && typeof existingIndex === 'number'
          ? getMaterializedInstanceReferenceDecision(
              existingNode,
              refNode,
              node.path,
              (ownerComponentKey, relativePath) =>
                isNestedComponentPaintPathHostControlled(ownerComponentKey, relativePath) ||
                isNestedComponentTextPathHostControlled(ownerComponentKey, relativePath) ||
                isNestedComponentLayoutPathHostControlled(ownerComponentKey, relativePath),
            )
          : null;

      if (
        existingNode &&
        typeof existingIndex === 'number' &&
        mergeDecision?.preferCandidate === true
      ) {
        referenceEntries[existingIndex] = mergeMaterializedInstanceReferenceNode(
          selectMaterializedInstanceMergeSource(
            existingNode,
            hostBaselineNode,
            mergeDecision,
          ),
          refNode,
          mergeDecision,
        );
        continue;
      }

      if (existingNode) {
        continue;
      }
      referenceKeyToIndex.set(occurrenceKey, referenceEntries.length);
      referenceEntries.push(refNode);
    }
  }

  return applyMaterializedHostVariantBaselines(
    referenceEntries,
    alignedHostReference,
  );
}

export function __test_expandReferenceWithCatalogs(
  reference: DSStructureNode[],
  actual: DSStructureNode[],
  catalogs: AthenaCatalog[],
): DSStructureNode[] {
  __test_hydrateCatalogs(catalogs);
  return expandReferenceWithInstanceComponents(reference, actual);
}

function rebaseReferenceSubtreeIds(
  nodes: DSStructureNode[],
  startId: number,
): DSStructureNode[] {
  if (!nodes.length) {
    return nodes;
  }

  const idMap = new Map<number, number>();
  let nextId = startId;

  for (const node of nodes) {
    idMap.set(node.id, nextId);
    nextId += 1;
  }

  return nodes.map((node) =>
    Object.assign({}, node, {
      id: idMap.get(node.id) ?? node.id,
      parentId:
        typeof node.parentId === 'number'
          ? (idMap.get(node.parentId) ?? null)
          : null,
    }),
  );
}

function getRelativeReferenceOwnerPath(
  ownerPath: string,
  fullPath: string,
): string | null {
  if (fullPath === ownerPath) {
    return '';
  }

  const prefix = `${ownerPath} / `;
  if (!fullPath.startsWith(prefix)) {
    return null;
  }

  return fullPath.slice(prefix.length);
}

function replacePathPrefix(path: string, from: string, to: string): string {
  if (path === from) return to;
  const needle = `${from} / `;
  if (path.startsWith(needle)) {
    return `${to} / ${path.slice(needle.length)}`;
  }
  return path;
}
