/// <reference types="@figma/plugin-typings" />

/**
 * Figma does not resolve ids of rendered sublayers inside an instance through
 * `getNodeByIdAsync` (for example `I11647:10616;37705:55361`). Resolve the
 * owning instance first and then find the exact rendered node in its subtree.
 */
export async function resolveSceneNodeById(
  nodeId: string,
): Promise<SceneNode | null> {
  const directNode = await figma.getNodeByIdAsync(nodeId);
  if (
    directNode &&
    directNode.type !== 'DOCUMENT' &&
    directNode.type !== 'PAGE'
  ) {
    return directNode as SceneNode;
  }

  const ownerMatch = /^I([^;]+);/.exec(nodeId);
  const ownerId = ownerMatch?.[1] ?? null;
  if (!ownerId) {
    return null;
  }

  const ownerNode = await figma.getNodeByIdAsync(ownerId);
  if (!ownerNode || !('findOne' in ownerNode)) {
    return null;
  }

  const nestedNode = ownerNode.findOne((candidate) => candidate.id === nodeId);
  if (!nestedNode || nestedNode.type === 'PAGE') {
    return null;
  }
  return nestedNode as SceneNode;
}
