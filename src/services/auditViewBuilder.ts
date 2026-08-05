import {
  findComponent,
} from '../reference/library';
import type { DiffEntry } from '../structure/diff';
import type {
  AuditResource,
  AuditItem,
  CustomStyleEntry,
  DetachedEntry,
  PathSegment,
} from '../types/audit';
import {
  getNodeTypographyDisplayValue,
  getNodeTypographyFingerprint,
  type StyleMetadataEntry,
} from './styleMetadata';
import {
  applyCustomStyleFilters,
  shouldIgnorePaintCustomStyle,
  shouldIgnoreTypographyCustomStyle,
} from '../filters/customStyleFilters';
import { shouldIgnoreNodeDiagnostics } from '../filters/ignoredComponentFilters';
import {
  buildNodePath,
  extractAliasKey,
  getPageName,
  isNodeVisible,
} from '../utils/nodeHelpers';

export interface CustomStyleCollectionOptions {
  tokenLabelMap: Map<
    string,
    { label: string; library?: string; sourceFile?: string }
  >;
  isKnownStyleId: (styleId: string | null | undefined) => Promise<boolean>;
  resolveStyleMetadata: (
    styleId: string | null | undefined,
  ) => Promise<StyleMetadataEntry | null>;
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
          path: buildNodePath(node),
          visible: isNodeVisible(node),
          reason,
          resource: await resolveCustomStyleResource(node, reason, options),
        });
      }
    }

  return applyCustomStyleFilters(node, entries);
}

async function resolveCustomStyleResource(
  node: SceneNode,
  reason: string,
  options: CustomStyleCollectionOptions,
): Promise<AuditResource> {
  if (reason === 'fill' || reason === 'stroke') {
    const styleField = reason === 'fill' ? 'fillStyleId' : 'strokeStyleId';
    const paintsField = reason === 'fill' ? 'fills' : 'strokes';
    const styleId = readStyleId(node, styleField);
    if (styleId) {
      return resolveStyleResource(styleId, reason, options);
    }

    const tokenResource = resolvePaintTokenResource(
      (node as any)[paintsField],
      options.tokenLabelMap,
    );
    if (tokenResource) {
      return tokenResource;
    }

    return {
      type: 'raw-value',
      name: reason === 'fill' ? 'Raw fill' : 'Raw stroke',
      key: null,
      library: null,
    };
  }

  if (reason.startsWith('effect:')) {
    const styleId = readStyleId(node, 'effectStyleId');
    if (styleId) {
      return resolveStyleResource(styleId, reason.slice('effect:'.length), options);
    }
    return {
      type: 'raw-value',
      name: reason.slice('effect:'.length) || 'Raw effect',
      key: null,
      library: null,
    };
  }

  if (reason === 'typography' && node.type === 'TEXT') {
    return {
      type: 'raw-value',
      name: getNodeTypographyDisplayValue(node) ?? 'Типографика',
      key: null,
      library: null,
    };
  }

  return {
    type: 'raw-value',
    name: reason || 'Custom style',
    key: null,
    library: null,
  };
}

function readStyleId(node: SceneNode, field: string): string | null {
  const value = (node as any)[field];
  return typeof value === 'string' && value ? value : null;
}

async function resolveStyleResource(
  styleId: string,
  fallbackName: string,
  options: CustomStyleCollectionOptions,
): Promise<AuditResource> {
  const metadata = await options.resolveStyleMetadata(styleId);
  const style = await getStyleById(styleId);
  return {
    type: 'style',
    name: metadata?.label ?? style?.name ?? fallbackName,
    key: metadata?.key ?? style?.key ?? null,
    id: styleId,
    library: metadata?.library ?? null,
    sourceFile: metadata?.sourceFile ?? null,
  };
}

async function getStyleById(styleId: string): Promise<BaseStyle | null> {
  try {
    return typeof figma.getStyleByIdAsync === 'function'
      ? await figma.getStyleByIdAsync(styleId)
      : null;
  } catch (_error) {
    return null;
  }
}

function resolvePaintTokenResource(
  paints: readonly Paint[] | PluginAPI['mixed'] | undefined,
  tokenLabelMap: Map<
    string,
    { label: string; library?: string; sourceFile?: string }
  >,
): AuditResource | null {
  if (!Array.isArray(paints)) {
    return null;
  }

  for (const paint of paints) {
    if (!paint || paint.visible === false || paint.type !== 'SOLID') {
      continue;
    }
    const tokenId = paint.boundVariables?.color?.id ?? null;
    const tokenKey = extractAliasKey(tokenId ?? undefined);
    if (!tokenId || !tokenKey) {
      continue;
    }
    const metadata = tokenLabelMap.get(tokenId) ?? tokenLabelMap.get(tokenKey);
    return {
      type: 'token',
      name: metadata?.label ?? tokenKey,
      key: tokenKey,
      id: tokenId,
      library: metadata?.library ?? null,
      sourceFile: metadata?.sourceFile ?? null,
    };
  }

  return null;
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
          sourceFile: componentRef.sourceFile ?? null,
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
 * Определяет список компонентных узлов, у которых остаются meaningful diff-ы;
 * принимает флаг visibleOnly для синхронизации с UI-фильтром.
 */
export function computeChangesResults(
  items: AuditItem[],
): AuditItem[] {
  const componentItems = items.filter(
    (item) => item.nodeType === 'INSTANCE' || item.nodeType === 'COMPONENT',
  );
  return componentItems.filter((item) => {
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
  const ignorePaintReason = await shouldIgnorePaintCustomStyle(node);
  if (!ignorePaintReason && (await hasCustomPaints(node, 'fills', 'fillStyleId', options))) {
    reasons.push('fill');
  }
  if (!ignorePaintReason && (await hasCustomPaints(node, 'strokes', 'strokeStyleId', options))) {
    reasons.push('stroke');
  }
  const effectReasons = await describeCustomEffects(node, options);
  reasons.push(...effectReasons);
  const typographyReasons = await describeCustomTypography(node, options);
  reasons.push(...typographyReasons);
  return reasons;
}

async function describeCustomTypography(
  node: SceneNode,
  options: CustomStyleCollectionOptions,
): Promise<string[]> {
  if (
    node.type !== 'TEXT' ||
    (await shouldIgnoreTypographyCustomStyle(node)) ||
    (await hasKnownTextStyle(node, options))
  ) {
    return [];
  }
  return getNodeTypographyFingerprint(node) ? ['typography'] : [];
}

async function hasKnownTextStyle(
  node: TextNode,
  options: CustomStyleCollectionOptions,
): Promise<boolean> {
  if (
    typeof node.textStyleId === 'string' &&
    node.textStyleId &&
    (await options.isKnownStyleId(node.textStyleId))
  ) {
    return true;
  }
  if (typeof node.getStyledTextSegments !== 'function') {
    return false;
  }
  const styleIds = Array.from(
    new Set(
      node
        .getStyledTextSegments(['textStyleId'])
        .map((segment) => segment.textStyleId)
        .filter((styleId): styleId is string => Boolean(styleId)),
    ),
  );
  if (!styleIds.length) return false;
  const known = await Promise.all(
    styleIds.map((styleId) => options.isKnownStyleId(styleId)),
  );
  return known.every(Boolean);
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
