import {
  findComponent,
} from '../reference/library';
import type { DiffEntry } from '../structure/diff';
import type {
  AuditResource,
  AuditItem,
  CustomStyleEntry,
  DeprecatedStyleEntry,
  DetachedEntry,
  GradientStopLocation,
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
import { getDetachedLibraryComponentKey } from './detachedComponentSource';
export { __test_setAuditPolicyConfig } from '../policies/auditPolicyConfig';
import {
  buildNodePath,
  clampColorComponent,
  extractAliasKey,
  getPageName,
  isNodeVisible,
} from '../utils/nodeHelpers';

export interface CustomStyleCollectionOptions {
  referenceByKey?: typeof findComponent;
  resolveComponentKey?: (node:BaseNode)=>Promise<string|null>;
  readStyleByIdAsync?: PluginAPI['getStyleByIdAsync'];
  ignoreRawTypography?: typeof import('../policies/auditPolicyConfig').shouldIgnoreRawTypography;
  tokenLabelMap: Map<
    string,
    { label: string; library?: string; sourceFile?: string }
  >;
  isKnownStyleId: (styleId: string | null | undefined) => Promise<boolean>;
  resolveStyleMetadata: (
    styleId: string | null | undefined,
  ) => Promise<StyleMetadataEntry | null>;
}

type PaintReason = 'fill' | 'stroke';
type GradientTokenStatus =
  | { status: 'active' | 'unknown' }
  | { status: 'local' | 'deprecated' | 'scheduled'; resource: AuditResource & { id: string; key: string } };

export type ResolveGradientToken = (id: string) => Promise<GradientTokenStatus>;

/** Collect direct paint, typography and effect findings in the same scene traversal. */
export async function collectStyleFindings(
  node: SceneNode,
  options: CustomStyleCollectionOptions,
  resolveGradientToken?: ResolveGradientToken,
) {
  const custom: CustomStyleEntry[] = [];
  const deprecatedGradient: DeprecatedStyleEntry[] = [];
  const gradientFields = new Set<PaintReason>();
  if (node.type === 'SECTION' || await shouldIgnoreNodeDiagnostics(node, options.resolveComponentKey)) {
    return { custom, deprecatedGradient, gradientFields };
  }

  let details: ReturnType<typeof styleNodeDetails> | undefined;
  const getDetails = () => details ??= styleNodeDetails(node);
  const reasons: string[] = [];
  if (!await shouldIgnorePaintCustomStyle(node, options.referenceByKey, options.resolveComponentKey)) {
    for (const [reason, paintsField, styleField] of [
      ['fill', 'fills', 'fillStyleId'], ['stroke', 'strokes', 'strokeStyleId'],
    ] as const) {
      const paints = (node as unknown as Partial<MinimalFillsMixin & MinimalStrokesMixin>)[paintsField];
      const styleId = readStyleId(node, styleField);
      if (await hasCustomPaints(paints, styleId, options, Boolean(resolveGradientToken))) reasons.push(reason);
      if (!resolveGradientToken) continue;

      // Text can have equal paints across ranges that use different styles.
      const useTextRanges = reason === 'fill' && node.type === 'TEXT' &&
        (paints === figma.mixed || node.fillStyleId === figma.mixed);
      const sources = useTextRanges
        ? (node.getStyledTextSegments?.(['fills', 'fillStyleId']) ?? [])
            .map(segment => ({ paints: segment.fills, styleId: segment.fillStyleId, textStart: segment.start, textEnd: segment.end }))
        : Array.isArray(paints) ? [{ paints, styleId }] : [];
      for (const source of sources) {
        for (const [paintIndex, paint] of (source.paints ?? []).entries()) {
          if (!isGradient(paint)) continue;
          gradientFields.add(reason);
          if (source.styleId || paint.visible === false) continue;
          const stops = Array.isArray(paint.gradientStops) && paint.gradientStops.length
            ? paint.gradientStops : [null];
          for (const [stopIndex, stop] of stops.entries()) {
            const binding = stop?.boundVariables?.color;
            const status = !stop || binding && (binding.type !== 'VARIABLE_ALIAS' || !binding.id)
              ? { status: 'unknown' } as const
              : binding ? await resolveGradientToken(binding.id) : null;
            if (status?.status === 'active') continue;
            const gradientStop: GradientStopLocation = {
              paintIndex,
              stopIndex: stop ? stopIndex : null,
              position: stop && Number.isFinite(stop.position) ? stop.position : null,
            };
            if ('textStart' in source) {
              gradientStop.textStart = source.textStart;
              gradientStop.textEnd = source.textEnd;
            }
            const entry = Object.assign({}, getDetails(), {
              reason, gradientStop, actualColor: gradientStopColor(stop?.color),
            });
            if (status?.status === 'deprecated' || status?.status === 'scheduled') {
              const resource = status.resource;
              deprecatedGradient.push(Object.assign(entry, {
                token: true as const, styleId: resource.id, styleKey: resource.key,
                styleLabel: resource.name, sourceFile: resource.sourceFile ?? '',
                sourceLibrary: resource.library ?? undefined,
              }, status.status === 'scheduled' ? { scheduled: true as const } : {}));
            } else {
              const resource: AuditResource = status?.status === 'local'
                ? status.resource : { type: 'raw-value', name: 'Raw gradient stop', key: null, library: null };
              custom.push(Object.assign(entry, { resource },
                status?.status === 'unknown' ? { status: 'incomplete' as const } : {}));
            }
          }
        }
      }
    }
  }
  reasons.push(...await describeCustomEffects(node, options));
  const typography = node.type === 'TEXT' ? await describeCustomTypography(node, options) : null;
  if (typography) reasons.push('typography');

  for (const reason of reasons) {
    const resource = reason === 'typography' && typography
      ? typography : await resolveCustomStyleResource(node, reason, options);
    custom.push(Object.assign({}, getDetails(), { reason, resource }));
  }
  return { custom: applyCustomStyleFilters(node, custom), deprecatedGradient, gradientFields };
}

function styleNodeDetails(node: SceneNode) {
  return {
    id: node.id, name: node.name, nodeType: node.type, pageName: getPageName(node),
    path: buildNodePath(node), visible: isNodeVisible(node),
  };
}

function isGradient(paint: Paint | null | undefined): paint is GradientPaint {
  return Boolean(paint && paint.type.startsWith('GRADIENT_'));
}

function gradientStopColor(color: RGBA | undefined): string | undefined {
  if (!color || ![color.r, color.g, color.b, color.a].every(Number.isFinite)) return undefined;
  return '#' + [color.r, color.g, color.b, color.a]
    .map(value => clampColorComponent(value).toString(16).padStart(2, '0')).join('').toUpperCase();
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
  const style = await getStyleById(styleId, options.readStyleByIdAsync);
  return {
    type: 'style',
    name: metadata?.label ?? style?.name ?? fallbackName,
    key: metadata?.key ?? style?.key ?? null,
    id: styleId,
    library: metadata?.library ?? null,
    sourceFile: metadata?.sourceFile ?? null,
  };
}

async function getStyleById(styleId: string, readStyleByIdAsync?: PluginAPI['getStyleByIdAsync']): Promise<BaseStyle | null> {
  try {
    if (readStyleByIdAsync) return await readStyleByIdAsync(styleId);
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
  lookup = findComponent,
): DetachedEntry | null {
  if (node.type === 'FRAME' || node.type === 'GROUP') {
    const componentKey = getDetachedLibraryComponentKey(node);

    if (componentKey) {
      const componentRef = lookup(
        componentKey,
      );

      if (componentRef) {
        return {
          id: node.id,
          name: node.name,
          pageName: getPageName(node),
          path: buildNodePath(node),
          componentKey,
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
    (item) =>
      Boolean(item) &&
      (
        item.nodeType === 'INSTANCE' ||
        item.nodeType === 'COMPONENT' ||
        item.customizationOnly === true
      ),
  );
  return componentItems.filter((item) => {
    if (!isEntryVisible(item)) {
      return false;
    }
    const diffs = prepareChangeDiffs(item.diffs ?? []);
    return diffs.length > 0;
  });
}

/**
 * Возвращает слой фактов для WIP-таба: только baseline -> actual, без
 * policy-фильтров и интерпретации допустимости. Технически идентичные факты
 * объединяются, чтобы разные этапы evidence pipeline не дублировали строку.
 * Скрытые узлы по-прежнему исключаются из пользовательского отчёта.
 */
export function computeBaselineChangeResults(
  items: AuditItem[],
): AuditItem[] {
  const results: AuditItem[] = [];
  for (const item of items) {
    if (!item || !isEntryVisible(item)) continue;
    if (item.nodeType !== 'INSTANCE' && item.nodeType !== 'COMPONENT') continue;
    const baselineFacts = Array.isArray(item.baselineDiffs)
      ? item.baselineDiffs
      : [];
    const requiredPaintStateFacts = Array.isArray(item.diffs)
      ? item.diffs.filter(isRequiredPaintStateBaselineFact)
      : [];
    const baselineDiffs = dedupeBaselineDiffs(
      baselineFacts
        .concat(requiredPaintStateFacts)
        .filter((diff) => diff.visible !== false),
    );
    if (!baselineDiffs.length) continue;
    results.push(Object.assign({}, item, { diffs: baselineDiffs }));
  }
  return results;
}

function isRequiredPaintStateBaselineFact(diff: DiffEntry): boolean {
  return (
    diff.assessment?.verdict === 'violation' &&
    diff.assessment.source === 'component-contract' &&
    diff.assessment.reasonCode ===
      'component-contract-required-paint-state' &&
    Boolean(diff.details?.property)
  );
}

function dedupeBaselineDiffs(diffs: DiffEntry[]): DiffEntry[] {
  const result: DiffEntry[] = [];
  const indexByKey = new Map<string, number>();

  for (const diff of diffs) {
    const key = getBaselineDiffKey(diff);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, result.length);
      result.push(diff);
      continue;
    }

    if (
      baselineEvidenceScore(diff) >
      baselineEvidenceScore(result[existingIndex])
    ) {
      result[existingIndex] = diff;
    }
  }

  return result;
}

function getBaselineDiffKey(diff: DiffEntry): string {
  const target = diff.nodeId ?? diff.nodePath ?? diff.nodeName ?? '';
  const property = diff.details?.property ?? diff.message ?? '';
  const reference = stableDiffValue(diff.details?.reference?.value);
  const actual = stableDiffValue(diff.details?.actual?.value);
  return [target, diff.diffKind ?? 'other', property, reference, actual].join('|');
}

function stableDiffValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function baselineEvidenceScore(diff: DiffEntry): number {
  let score = 0;
  if (diff.context?.directHostVariantOverride === true) score += 4;
  if (diff.context?.surfaceContext) score += 2;
  if (diff.context?.actualVariantProperties) score += 1;
  if (diff.context?.referenceVariantProperties) score += 1;
  return score;
}

async function describeCustomTypography(
  node: TextNode,
  options: CustomStyleCollectionOptions,
): Promise<AuditResource | null> {
  if (await shouldIgnoreTypographyCustomStyle(node, options.ignoreRawTypography, options.resolveComponentKey)) {
    return null;
  }

  const nodeStyleId = readStyleId(node, 'textStyleId');
  if (!nodeStyleId && node.textStyleId === figma.mixed && typeof node.getStyledTextSegments !== 'function') {
    return null;
  }
  const styleIds = nodeStyleId ? [nodeStyleId] : Array.from(new Set(
    (node.getStyledTextSegments?.(['textStyleId']) ?? [])
      .map(segment => segment.textStyleId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  ));
  const known = await Promise.all(styleIds.map(id => options.isKnownStyleId(id)));
  const unindexedStyleId = styleIds.find((_, index) => !known[index]);
  if (unindexedStyleId) return resolveStyleResource(unindexedStyleId, 'Текстовый стиль', options);
  if (styleIds.length || !getNodeTypographyFingerprint(node)) return null;

  return {
    type: 'raw-value',
    name: getNodeTypographyDisplayValue(node) ?? 'Типографика',
    key: null,
    library: null,
  };
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
  paints: readonly Paint[] | PluginAPI['mixed'] | undefined,
  styleId: string | null,
  options: CustomStyleCollectionOptions,
  checkGradientStops: boolean,
): Promise<boolean> {
  if (!Array.isArray(paints) || !paints.some(paint => paint && paint.visible !== false)) return false;
  if (styleId && !(await options.isKnownStyleId(styleId))) return true;

  for (const paint of paints) {
    if (!paint || paint.visible === false) continue;
    if (isGradient(paint)) {
      if (!styleId && !checkGradientStops) return true;
      continue;
    }
    if (paint.type !== 'SOLID') continue;
    const tokenInfo = getTokenAliasInfo(paint, options.tokenLabelMap);
    if (tokenInfo.aliasKey) {
      if (!tokenInfo.label) return true;
      continue;
    }
    if (!styleId) return true;
  }
  return false;
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
