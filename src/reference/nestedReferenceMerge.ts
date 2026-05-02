import type { DSStructureNode } from '../types/structures';

export type MaterializedInstanceReferenceDecision = {
  preferCandidate: boolean;
  reason:
    | 'outside-materialized-subtree'
    | 'candidate-not-nested'
    | 'deeper-nested-materialization'
    | 'keep-existing-nested-materialization'
    | 'existing-not-host'
    | 'replace-instance-root'
    | 'replace-host-descendant'
    | 'keep-host-controlled-descendant'
    | 'keep-host-painted-descendant'
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

    return buildDecision(
      shouldPreferDeeperNestedMaterialization(existingNode, candidateNode),
      shouldPreferDeeperNestedMaterialization(existingNode, candidateNode)
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
