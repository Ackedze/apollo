import type { LibraryComponent } from '../reference/libraryTypes';
import { getCorporateCounterpart } from '../reference/library';
import type { ThemeAuditEntry } from '../types/audit';
import { buildNodePath, getPageName } from '../utils/nodeHelpers';

export const THEME_MODE_NAME = 'Corp';
type ThemeDetectionSource = 'treeResolvedMode' | 'cachedTreeResolvedMode';

interface ResolvedThemeCollection {
  collection: VariableCollection;
  source: ThemeDetectionSource;
  nodeId: string | null;
  nodeName: string | null;
}

interface CachedThemeAnchor {
  nodeId: string;
}

const themeAnchorNodeCache = new Map<string, CachedThemeAnchor>();

export async function buildPageThemizationEntry(
  selection: readonly SceneNode[],
): Promise<ThemeAuditEntry | null> {
  const focusNode = selection.find((node) => node.visible !== false) ?? selection[0];
  if (!focusNode) {
    return null;
  }

  const page = getContainingPage(focusNode);
  if (!page) {
    return null;
  }

  const resolvedTheme = await findThemeCollection(page);

  if (!resolvedTheme) {
    return null;
  }

  const { collection } = resolvedTheme;

  const corpMode = collection.modes.find((mode) => mode.name === THEME_MODE_NAME);

  if (!corpMode) {
    return null;
  }

  const explicitModeId = page.explicitVariableModes?.[collection.id] ?? null;

  if (explicitModeId === corpMode.modeId) {
    return null;
  }

  return {
    id: `page-theme-mode:${page.id}`,
    kind: 'missingThemeMode',
    name: `Страница: ${page.name}`,
    pageName: page.name,
    path: page.name,
    visible: true,
    nodeId: focusNode.id,
    nodeType: 'PAGE',
    libraryName: collection.name,
    recommendation: 'Смени темизацию на Corp',
    themeCollectionId: collection.id,
    targetModeId: corpMode.modeId,
  };
}

export function buildCorporateThemizationEntry(
  node: SceneNode,
  ref: LibraryComponent,
): ThemeAuditEntry | null {
  if (ref.role === 'Part') {
    return null;
  }

  const referenceName = ref.displayName ?? ref.name ?? ref.names?.[0] ?? '';
  if (!referenceName.includes('[Corporate]')) {
    return null;
  }

  const counterpart = getCorporateCounterpart(ref);
  const replacementComponentKey = counterpart?.base?.key ?? null;

  return {
    id: node.id,
    kind: 'corporateComponent',
    name: node.name,
    pageName: getPageName(node),
    path: buildNodePath(node),
    visible: node.visible !== false,
    nodeId: node.id,
    nodeType: node.type,
    libraryName: ref.source ?? null,
    recommendation:
      stripCorporateMarker(referenceName) ||
      'Используйте версию компонента без [Corporate]',
    replacementComponentKey,
  };
}

export async function findThemeCollection(
  page: PageNode,
): Promise<ResolvedThemeCollection | null> {
  const cachedAnchor = themeAnchorNodeCache.get(page.id) ?? null;
  if (cachedAnchor) {
    const cachedNode = await figma.getNodeByIdAsync(cachedAnchor.nodeId);
    const cachedCollection = cachedNode ? await resolveThemeCollectionFromNode(cachedNode) : null;
    if (cachedCollection) {
      return {
        collection: cachedCollection,
        source: 'cachedTreeResolvedMode',
        nodeId: cachedNode?.id ?? null,
        nodeName: cachedNode && 'name' in cachedNode ? String(cachedNode.name ?? '') : null,
      };
    }
    themeAnchorNodeCache.delete(page.id);
  }

  const treeCollection = await findThemeCollectionInTree(page.children, page.id);
  if (treeCollection) {
    return {
      collection: treeCollection.collection,
      source: 'treeResolvedMode',
      nodeId: treeCollection.nodeId,
      nodeName: treeCollection.nodeName,
    };
  }
  return null;
}


async function findThemeCollectionInTree(
  roots: readonly BaseNode[],
  pageId: string,
): Promise<{ collection: VariableCollection; nodeId: string | null; nodeName: string | null } | null> {
  const stack = [...roots];
  const visitedNodes = new Set<string>();
  const checkedCollections = new Set<string>();

  while (stack.length) {
    const node = stack.pop();
    if (!node || visitedNodes.has(node.id)) {
      continue;
    }
    visitedNodes.add(node.id);

    const collection = await resolveThemeCollectionFromNode(node, checkedCollections);
    if (collection) {
      themeAnchorNodeCache.set(pageId, { nodeId: node.id });
      return {
        collection,
        nodeId: node.id,
        nodeName: 'name' in node ? String((node as SceneNode).name ?? '') : null,
      };
    }

    if ('children' in node && Array.isArray(node.children)) {
      stack.push(...node.children);
    }
  }

  return null;
}

async function resolveThemeCollectionFromNode(
  node: BaseNode,
  checkedCollections: Set<string> = new Set<string>(),
): Promise<VariableCollection | null> {
  const resolvedModes =
    (node as unknown as { resolvedVariableModes?: Record<string, string> }).resolvedVariableModes ??
    null;
  if (!resolvedModes) {
    return null;
  }

  for (const collectionId of Object.keys(resolvedModes)) {
    if (checkedCollections.has(collectionId)) {
      continue;
    }
    checkedCollections.add(collectionId);

    const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
    if (collection && isThemeCollectionMatch(collection.name)) {
      return collection;
    }
  }

  return null;
}

function isThemeCollectionMatch(
  collectionName: string | null | undefined,
): boolean {
  return normalizeThemeCollectionName(collectionName) === 'theme';
}

function normalizeThemeCollectionName(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function stripCorporateMarker(name: string): string {
  return name
    .replace(/🔄/g, ' ')
    .replace(/\s*\[Corporate\]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function getContainingPage(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;

  while (current) {
    if (current.type === 'PAGE') {
      return current as PageNode;
    }
    current = current.parent;
  }

  return null;
}
