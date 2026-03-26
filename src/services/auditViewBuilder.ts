import {
  findComponent,
} from '../reference/library';
import type { DiffEntry } from '../structure/diff';
import type {
  AuditItem,
  CustomStyleEntry,
  DetachedEntry,
  PathSegment,
  TextNodeEntry,
} from '../types/audit';
import {
  buildNodePath,
  clampColorComponent,
  extractAliasKey,
  getPageName,
  isNodeVisible,
} from '../utils/nodeHelpers';

export interface TextNodeCollectionOptions {
  tokenLabelMap: Map<string, { label: string; library?: string }>;
  tokenColorMap: Map<string, { label: string; library?: string }>;
}

export interface CustomStyleCollectionOptions {
  tokenLabelMap: Map<string, { label: string; library?: string }>;
}

/**
 * Собирает все узлы, у которых явно навешаны кастомные стили (заливка/обводка/текст) вне компонентных диффов.
 */
export function collectCustomStyles(
  node: SceneNode,
  options: CustomStyleCollectionOptions,
): CustomStyleEntry[] {
  const entries: CustomStyleEntry[] = [];

    if (node.type === 'SECTION') return entries;

    const reasons = describeCustomStyleReasons(node, options);

    if (reasons.length) {
      for (const reason of reasons) {
        entries.push({
          id: node.id,
          name: node.name,
          nodeType: node.type,
          pageName: getPageName(node),
          visible: isNodeVisible(node),
          reason,
        });
      }
    }
  
  return entries;
}

/**
 * Выбирает все текстовые узлы в выделении и описывает их с точки зрения токенов/стилей.
 */
export function collectTextNodesFromSelection(
  selection: readonly SceneNode[],
  options: TextNodeCollectionOptions,
): TextNodeEntry[] {
  const nodes: TextNode[] = [];
  const visit = (node: SceneNode) => {
    if (node.type === 'TEXT') {
      nodes.push(node as TextNode);
    }
    if ('children' in node) {
      for (const child of node.children as SceneNode[]) {
        visit(child);
      }
    }
  };
  for (const node of selection) {
    visit(node);
  }
  return nodes.map((node) => describeTextNode(node, options));
}

/**
 * Находит detachd (освобождённые) frames/groups, которые раньше привязаны к библиотеке,
 * чтобы показать их в отдельном табе.
 */
export function collectDetachedEntry(
  node: SceneNode,
): DetachedEntry | null {
  if (node.type === 'FRAME' || node.type === 'GROUP') {
    const info = (node as any).detachedInfo as
      | { type: 'local'; componentId: string }
      | { type: 'library'; componentKey: string }
      | null;

    if (info && info.type === 'library' && info.componentKey) {
      const componentRef = findComponent(
        info.componentKey,
      );

      if (componentRef) {
        return {
          id: node.id,
          name: node.name,
          pageName: getPageName(node),
          path: buildNodePath(node),
          componentKey: info.componentKey,
          libraryName:
            componentRef.source ?? componentRef.names[0] ?? 'Дизайн-система',
          componentName: componentRef.names[0] ?? null,
          visible: isNodeVisible(node),
        }
      }
    }
  }

  return null;
}

export function filterVisibleEntries<T extends { visible?: boolean } & {
  pathSegments?: PathSegment[];
}>(items: T[]): T[] {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => isEntryVisible(item));
}

/**
 * Проверяет, виден ли узел с учётом всей иерархии пути (используется и в tab-фильтрах).
 */
function isEntryVisible(item: { visible?: boolean; pathSegments?: PathSegment[] }) {
  if (!item) return false;
  if (item.visible === false) return false;
  const segments = item.pathSegments;
  if (!Array.isArray(segments)) return true;
  return segments.every((segment) => {
    if (
      segment &&
      typeof segment === 'object' &&
      Object.prototype.hasOwnProperty.call(segment, 'visible')
    ) {
      return segment.visible !== false;
    }
    return true;
  });
}


/**
 * Убирает технические diff-строки и (при необходимости) скрытые узлы,
 * чтобы таб «Кастомизация» показывал только информативные изменения.
 */
function prepareChangeDiffs(
  diffs: DiffEntry[],
): DiffEntry[] {
  const rawDiffs = Array.isArray(diffs) ? diffs : [];
  const visibleDiffs =  rawDiffs.filter((diff) => diff.visible !== false)

  return dedupeDiffs(visibleDiffs);
}

/**
 * Определяет список инстансов, у которых остаются meaningful diff-ы;
 * принимает флаг visibleOnly для синхронизации с UI-фильтром.
 */
export function computeChangesResults(
  items: AuditItem[],
): AuditItem[] {
  const instanceItems = items.filter((item) => item.nodeType === 'INSTANCE');
  return instanceItems.filter((item) => {
    if (item.themeStatus === 'error') {
      return false;
    }
    if (!isEntryVisible(item)) {
      return false;
    }
    const diffs = prepareChangeDiffs(item.diffs ?? []);
    return diffs.length > 0;
  });
}

export function describeTextNode(
  node: TextNode,
  options: TextNodeCollectionOptions,
): TextNodeEntry {
  const paints = Array.isArray(node.fills) ? node.fills : [];
  let solid: SolidPaint | null = null;
  for (const paint of paints) {
    if (paint.type === 'SOLID' && paint.visible !== false) {
      solid = paint;
      break;
    }
  }
  const paintInfo = solid
    ? describeTextPaint(solid, options)
    : { label: '—', usesToken: false, library : null };

  const usesStyle =
    'fillStyleId' in node &&
    !!node.fillStyleId &&
    node.fillStyleId !== figma.mixed;

  return {
    key: node.id,
    name: node.name,
    pageName: getPageName(node),
    colorLabel: paintInfo.label,
    value: node.characters,
    visible: isNodeVisible(node),
    usesToken: paintInfo.usesToken,
    tokenLibrary: paintInfo.library,
    nodeType: 'TEXT',
    usesStyle,
  };
}

function describeTextPaint(
  paint: SolidPaint,
  options: TextNodeCollectionOptions,
): { label: string; usesToken: boolean; library: string | null } {
  const tokenInfo = getTokenAliasInfo(paint, options.tokenLabelMap);

  if (tokenInfo.aliasKey) {
    return {
      label: tokenInfo.label ?? tokenInfo.aliasKey,
      usesToken: true,
      library: tokenInfo.library,
    };
  }
  const r = clampColorComponent(paint.color.r);
  const g = clampColorComponent(paint.color.g);
  const b = clampColorComponent(paint.color.b);
  const opacity = paint.opacity ?? 1;

  return {
    label: `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`,
    usesToken: false,
    library: null
  };
}

function getTokenAliasInfo(
  paint: SolidPaint,
  tokenLabelMap: Map<string, { label: string; library?: string }>,
) {
  const boundVariables = paint.boundVariables;
  if (!boundVariables?.color?.id) {
    return { aliasKey: null, label: null, library: null };
  }
  const aliasKey = extractAliasKey(boundVariables.color.id);
  if (!aliasKey) {
    return { aliasKey: null, label: null, library: null };
  }
  const label = tokenLabelMap?.get(aliasKey);
  return {
    aliasKey,
    label: label?.label ?? null,
    library: label?.library ?? null,
  };
}

export function describeCustomStyleReasons(
  node: SceneNode,
  options: CustomStyleCollectionOptions,
): Array<CustomStyleEntry['reason']> {
  const reasons: Array<CustomStyleEntry['reason']> = [];
  if (hasCustomPaints(node, 'fills', 'fillStyleId', options)) {
    reasons.push('fill');
  }
  if (hasCustomPaints(node, 'strokes', 'strokeStyleId', options)) {
    reasons.push('stroke');
  }
  const effectReasons = describeCustomEffects(node);
  reasons.push(...effectReasons);
  return reasons;
}

function describeCustomEffects(node: SceneNode): string[] {
  if (!('effects' in node)) return [];
  const effects = (node as any).effects;
  if (!Array.isArray(effects)) {
    return [];
  }
  const reasons: string[] = [];
  for (const effect of effects) {
    if (!effect || effect.visible === false) continue;
    const styleId = (effect as any).effectStyleId ?? (effect as any).styleId;
    if (styleId && styleId !== figma.mixed && typeof styleId === 'string') {
      continue;
    }
    const label = mapEffectType(effect.type);
    reasons.push(`effect:${label}`);
  }
  return reasons;
}

function mapEffectType(type: string): string {
  switch (type) {
    case 'LAYER_BLUR':
      return 'Слой (Layer blur)';
    case 'BACKGROUND_BLUR':
      return 'Фон (Background blur)';
    case 'DROP_SHADOW':
      return 'Тень (Drop shadow)';
    case 'INNER_SHADOW':
      return 'Тень (Inner shadow)';
    default:
      return type.replace(/_/g, ' ');
  }
}

function hasCustomPaints(
  node: SceneNode,
  paintsKey: 'fills' | 'strokes',
  styleKey: 'fillStyleId' | 'strokeStyleId',
  options: CustomStyleCollectionOptions,
): boolean {
  if (!(paintsKey in node)) return false;
  const paints = (node as any)[paintsKey];
  if (!Array.isArray(paints)) {
    return false;
  }
  const hasStyle = hasPaintStyle(node, styleKey);

  for (const paint of paints) {
    if (!paint) continue;
    if ((paint as Paint).visible === false) continue;
    if ((paint as any).type !== 'SOLID') continue;
    const tokenInfo = getTokenAliasInfo(paint as SolidPaint, options.tokenLabelMap);
    if (tokenInfo.aliasKey) {
      if (!tokenInfo.label) {
        return true;
      }
      continue;
    }
    if (hasStyle) {
      return true;
    }
    return true;
  }
  return false;
}

function hasPaintStyle(
  node: SceneNode,
  styleKey: 'fillStyleId' | 'strokeStyleId',
): boolean {
  const styleId = (node as any)[styleKey];
  return Boolean(styleId && styleId !== figma.mixed && typeof styleId === 'string');
}

function dedupeDiffs(diffs: DiffEntry[]): DiffEntry[] {
  const seen = new Map<string, { diff: DiffEntry; index: number }>();
  const normalized: DiffEntry[] = [];
  for (const diff of diffs) {
    const key = getDiffKey(diff);
    const currentIsTech = isTechnicalDiff(diff);
    const existing = seen.get(key);
    if (existing) {
      const existingIsTech = isTechnicalDiff(existing.diff);
      if (!currentIsTech && existingIsTech) {
        normalized[existing.index] = diff;
        seen.set(key, { diff, index: existing.index });
        continue;
      }
      if (currentIsTech) {
        continue;
      }
    }
    const index = normalized.length;
    normalized.push(diff);
    seen.set(key, { diff, index });
  }
  return normalized;
}

const TECHNICAL_DIFF_PATTERN = /(Token\s)|(token:)|(VariableID:)/i;

function isTechnicalDiff(diff: DiffEntry | undefined) {
  if (!diff || typeof diff.message !== 'string') return false;
  return TECHNICAL_DIFF_PATTERN.test(diff.message);
}

function getDiffKey(diff: DiffEntry) {
  return (
    diff.nodeId ??
    diff.nodePath ??
    diff.nodeName ??
    String(diff.message ?? 'diff')
  );
}
