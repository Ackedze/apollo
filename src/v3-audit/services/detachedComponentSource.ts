export function getDetachedLibraryComponentKey(
  node: SceneNode,
): string | null {
  if (node.type !== 'FRAME' && node.type !== 'GROUP') return null;
  const info = (node as SceneNode & {
    detachedInfo?:
      | { type: 'local'; componentId: string }
      | { type: 'library'; componentKey: string }
      | null;
  }).detachedInfo;
  return info?.type === 'library' && info.componentKey
    ? info.componentKey
    : null;
}
