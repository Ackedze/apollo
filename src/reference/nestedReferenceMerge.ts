import type { DSStructureNode } from '../types/structures';

export function shouldPreferMaterializedInstanceReference(
  existingNode: DSStructureNode,
  candidateNode: DSStructureNode,
  materializedRootPath: string,
  isHostControlledPath?: (
    componentKey: string | null | undefined,
    relativePath: string | null | undefined,
  ) => boolean,
): boolean {
  if (!isWithinMaterializedSubtree(candidateNode.path, materializedRootPath)) {
    return false;
  }

  const existingOrigin = existingNode.referenceOrigin ?? 'host';
  const candidateOrigin = candidateNode.referenceOrigin ?? 'host';

  if (candidateOrigin !== 'nested-component') {
    return false;
  }

  if (existingOrigin === 'nested-component') {
    return shouldPreferDeeperNestedMaterialization(existingNode, candidateNode);
  }

  if (existingOrigin !== 'host') {
    return false;
  }

  if (existingNode.type !== 'INSTANCE' || candidateNode.type !== 'INSTANCE') {
    return shouldPreferMaterializedHostDescendant(
      existingNode,
      candidateNode,
      isHostControlledPath,
    );
  }

  return true;
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

function isWithinMaterializedSubtree(path: string, materializedRootPath: string): boolean {
  return (
    path === materializedRootPath || path.startsWith(`${materializedRootPath} / `)
  );
}
