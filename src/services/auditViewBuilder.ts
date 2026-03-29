import {
  findComponent,
} from '../reference/library';
import type { DiffEntry } from '../structure/diff';
import type {
  AuditItem,
  CustomStyleEntry,
  DetachedEntry,
  PathSegment,
} from '../types/audit';
import { applyCustomStyleFilters } from '../filters/customStyleFilters';
import { shouldIgnoreNodeDiagnostics } from '../filters/ignoredComponentFilters';
import {
  buildNodePath,
  extractAliasKey,
  getPageName,
  isNodeVisible,
} from '../utils/nodeHelpers';

export interface CustomStyleCollectionOptions {
  tokenLabelMap: Map<string, { label: string; library?: string }>;
  isKnownStyleId: (styleId: string | null | undefined) => Promise<boolean>;
}

/**
 * Собирает все узлы, у которых явно навешаны кастомные стили (заливка/обводка/текст) вне компонентных диффов.
 */
export async function collectCustomStyles(
  node: SceneNode,
  options: CustomStyleCollectionOptions,
): Promise<CustomStyleEntry[]> {
  const entries: CustomStyleEntry[] = [];

    if (await shouldIgnoreNodeDiagnostics(node)) {
      return entries;
    }

    if (node.type === 'SECTION') return entries;

    const reasons = await describeCustomStyleReasons(node, options);

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

  return applyCustomStyleFilters(node, entries);
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
          componentName:
            componentRef.displayName ?? componentRef.names[0] ?? null,
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

export async function describeCustomStyleReasons(
  node: SceneNode,
  options: CustomStyleCollectionOptions,
): Promise<Array<CustomStyleEntry['reason']>> {
  const reasons: Array<CustomStyleEntry['reason']> = [];
  if (await hasCustomPaints(node, 'fills', 'fillStyleId', options)) {
    reasons.push('fill');
  }
  if (await hasCustomPaints(node, 'strokes', 'strokeStyleId', options)) {
    reasons.push('stroke');
  }
  const effectReasons = await describeCustomEffects(node, options);
  reasons.push(...effectReasons);
  return reasons;
}

async function describeCustomEffects(
  node: SceneNode,
  options: CustomStyleCollectionOptions,
): Promise<string[]> {
  if (!('effects' in node)) return [];
  const effectStyleId = (node as any).effectStyleId;
  if (await options.isKnownStyleId(effectStyleId)) {
    return [];
  }
  const effects = (node as any).effects;
  if (!Array.isArray(effects)) {
    return [];
  }
  const reasons: string[] = [];
  for (const effect of effects) {
    if (!effect || effect.visible === false) continue;
    const label = mapEffectType(effect.type);
    reasons.push(`effect:${label}`);
  }
  if (reasons.length) {
    console.warn('[Apollo] unresolved effect style added to custom styles', {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      effectStyleId:
        effectStyleId && effectStyleId !== figma.mixed ? effectStyleId : null,
      effectTypes: effects
        .filter((effect) => effect && effect.visible !== false)
        .map((effect) => effect.type),
      reasons,
    });
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

async function hasCustomPaints(
  node: SceneNode,
  paintsKey: 'fills' | 'strokes',
  styleKey: 'fillStyleId' | 'strokeStyleId',
  options: CustomStyleCollectionOptions,
): Promise<boolean> {
  if (!(paintsKey in node)) return false;
  const paints = (node as any)[paintsKey];
  if (!Array.isArray(paints)) {
    return false;
  }
  const hasStyle = hasPaintStyle(node, styleKey);
  const styleId = hasStyle ? String((node as any)[styleKey]) : null;

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
      return !(await options.isKnownStyleId(styleId));
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
