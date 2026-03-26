export function getPageName(node: SceneNode): string {
  let current: BaseNode | null = node;
  while (current && current.type !== 'PAGE') {
    current = current.parent as BaseNode | null;
  }

  if (current && current.type === 'PAGE') {
    return current.name;
  }

  return figma.currentPage.name;
}

export function buildNodePath(node: SceneNode): string {
  const names: string[] = [];
  let current: BaseNode | null = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    names.push(current.name);
    current = current.parent as BaseNode | null;
  }
  return names.reverse().join(' / ');
}

export function isNodeVisible(node: SceneNode): boolean {
  let current: BaseNode | null = node;
  while (current && current.type !== 'DOCUMENT') {
    if ('visible' in current && (current as SceneNode).visible === false) {
      return false;
    }
    current = current.parent as BaseNode | null;
  }
  return true;
}

export function clampColorComponent(value: number | undefined): number {
  const normalized = typeof value === 'number' ? value : 0;
  const scaled = Math.round(normalized * 255);
  return Math.max(0, Math.min(255, scaled));
}

export function extractAliasKey(aliasId?: string): string | null {
  if (!aliasId) return null;
  const withoutPrefix = aliasId.replace(/^VariableID:/, '');
  const [key] = withoutPrefix.split('/');
  return key || null;
}
