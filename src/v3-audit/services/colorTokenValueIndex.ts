import {
  ensureReferenceCatalogsLoaded,
  getTokenCatalogs,
} from '../reference/library';
import type { TokenCatalog } from '../reference/libraryTypes';

type TokenCollection = NonNullable<NonNullable<TokenCatalog['collections']>[number]>;
type ColorVariable = NonNullable<TokenCollection['variables']>[number];

export type ColorTokenValueCandidate = {
  key: string;
  name: string;
  library: string | null;
  sourceFile: string | null;
  collectionName: string | null;
  matchedModeIds: string[];
};

type IndexedColorToken = ColorTokenValueCandidate & {
  scopes: string[];
};

let colorTokenIndex: ReturnType<typeof buildColorTokenValueIndex> | null = null;
let colorTokenIndexLoadPromise: Promise<void> | null = null;

export async function ensureColorTokenValueIndexLoaded(): Promise<void> {
  if (colorTokenIndex) return;
  if (colorTokenIndexLoadPromise) return colorTokenIndexLoadPromise;

  colorTokenIndexLoadPromise = (async () => {
    await ensureReferenceCatalogsLoaded();
    colorTokenIndex = buildColorTokenValueIndex(getTokenCatalogs());
  })()
    .catch((error) => {
      console.warn('[Apollo] failed to build color token value index', error);
      colorTokenIndex = buildColorTokenValueIndex([]);
    })
    .finally(() => {
      colorTokenIndexLoadPromise = null;
    });
  return colorTokenIndexLoadPromise;
}

export function createColorTokenValueReader(catalogs: ReturnType<typeof getTokenCatalogs>, isActive: (key:string)=>boolean) {
  const index = buildColorTokenValueIndex(catalogs);
  return {
    findColorTokenValueCandidates: (node: SceneNode, field: 'fill' | 'stroke') =>
      findColorTokenValueCandidates(node, field, index).filter(candidate => isActive(candidate.key)),
    findGradientStopTokenCandidates: (color: RGBA, field: 'fill' | 'stroke') =>
      matchingColorTokens(buildColorKey(color, color.a), field, index).filter(candidate => isActive(candidate.key)),
    readColorTokenPreview: (node: SceneNode, key: string) =>
      isActive(key) ? readColorTokenPreview(node, key, index) : null,
  };
}

export function findColorTokenValueCandidates(
  node: SceneNode,
  field: 'fill' | 'stroke',
  index = colorTokenIndex,
): ColorTokenValueCandidate[] {
  const colorKey = getNodeUniformColorKey(node, field);
  return colorKey ? matchingColorTokens(colorKey, field, index) : [];
}

function matchingColorTokens(colorKey: string, field: 'fill' | 'stroke', index = colorTokenIndex) {
  const matches = index?.byColor.get(colorKey) ?? [];
  return matches
    .filter((candidate) => scopeSupportsField(candidate.scopes, field))
    .map((candidate) => ({
      key: candidate.key,
      name: candidate.name,
      library: candidate.library,
      sourceFile: candidate.sourceFile,
      collectionName: candidate.collectionName,
      matchedModeIds: candidate.matchedModeIds.slice(),
    }))
    .sort(compareCandidates);
}

function buildColorTokenValueIndex(
  catalogs: ReturnType<typeof getTokenCatalogs>,
) {
  const byColor = new Map<string, IndexedColorToken[]>();
  const byKey = new Map<string, Array<{ collection: TokenCollection; variable: ColorVariable }>>();
  const collectionKeysById = new Map<string, Set<string>>();
  for (const catalog of catalogs) {
    const library = catalog.meta?.library ?? catalog.meta?.fileName ?? null;
    const sourceFile = catalog.meta?.fileName ?? null;
    for (const collection of catalog.collections ?? []) {
      if (!collection) continue;
      if (collection.id) {
        const identities = collectionKeysById.get(collection.id) ?? new Set<string>();
        identities.add(collection.key ?? collection.id);
        collectionKeysById.set(collection.id, identities);
      }
      const collectionName = collection.name ?? library;
      for (const variable of collection.variables ?? []) {
        if (
          !variable?.key ||
          variable.resolvedType !== 'COLOR' ||
          variable.hiddenFromPublishing === true
        ) {
          continue;
        }
        const definitions = byKey.get(variable.key) ?? [];
        definitions.push({ collection, variable });
        byKey.set(variable.key, definitions);
        const valuesByMode = getConcreteValuesByMode(variable);
        const modeIdsByColor = new Map<string, string[]>();
        for (const [modeId, values] of Object.entries(valuesByMode)) {
          for (const value of values) {
            const colorKey = getCatalogColorKey(value);
            if (!colorKey) continue;
            const modeIds = modeIdsByColor.get(colorKey) ?? [];
            if (!modeIds.includes(modeId)) modeIds.push(modeId);
            modeIdsByColor.set(colorKey, modeIds);
          }
        }
        for (const [colorKey, matchedModeIds] of modeIdsByColor) {
          const entries = byColor.get(colorKey) ?? [];
          if (!entries.some((entry) => entry.key === variable.key)) {
            entries.push({
              key: variable.key,
              name: buildTokenName(variable),
              library,
              sourceFile,
              collectionName,
              matchedModeIds: matchedModeIds.slice().sort(),
              scopes: Array.isArray(variable.scopes)
                ? variable.scopes.filter(
                    (scope): scope is string => typeof scope === 'string',
                  )
                : [],
            });
          }
          byColor.set(colorKey, entries);
        }
      }
    }
  }
  return { byColor, byKey, collectionKeysById };
}

export function readColorTokenPreview(
  node: SceneNode,
  key: string,
  index = colorTokenIndex,
): string | null {
  if (!index) return null;
  let resolvedModes: SceneNode['resolvedVariableModes'] | undefined;
  try { resolvedModes = node.resolvedVariableModes; } catch {}
  const colors = new Set<string>();
  for (const { collection, variable } of index.byKey.get(key) ?? []) {
    const valuesByMode = getConcreteValuesByMode(variable);
    const declaredModes = collection.modes?.flatMap(mode => mode.modeId ? [mode.modeId] : []) ?? [];
    const modeIds = new Set(declaredModes.length ? declaredModes
      : Object.keys(variable.valuesByMode ?? {}).concat(Object.keys(valuesByMode)));
    const qualifiedId = collection.key && `VariableCollectionId:${collection.key}/`;
    const qualifiedModes = Object.entries(resolvedModes ?? {})
      .filter(([id]) => qualifiedId && id.startsWith(qualifiedId)).map(([, mode]) => mode);
    const localMode = collection.id ? resolvedModes?.[collection.id] : undefined;
    const uniqueCollectionId = collection.id && index.collectionKeysById.get(collection.id)?.size === 1;
    const activeModes = new Set(qualifiedModes);
    if (!activeModes.size && localMode && uniqueCollectionId) activeModes.add(localMode);
    if (activeModes.size > 1) return null;
    if (!activeModes.size && resolvedModes && !localMode && collection.defaultModeId) {
      activeModes.add(collection.defaultModeId);
    }
    const candidates = activeModes.size ? activeModes : modeIds;
    if (!modeIds.size) return null;
    for (const mode of candidates) {
      if (!modeIds.has(mode)) return null;
      const resolution = variable.resolutionByMode?.[mode];
      if (resolution && (resolution.status !== 'resolved' || resolution.unresolvedAliasIds?.length)) return null;
      const values = valuesByMode[mode];
      if (!values?.length) return null;
      for (const value of values) {
        const color = previewColorKey(value, value?.a ?? 1);
        if (!color) return null;
        colors.add(color);
      }
    }
  }
  return colors.size === 1 ? cssPreviewColor(Array.from(colors)[0]) : null;
}

export function readActualColorPreview(node: SceneNode, field: 'fill' | 'stroke'): string | null {
  try {
    const key = getNodeUniformColorKey(node, field, true);
    return key ? cssPreviewColor(key) : null;
  } catch { return null; }
}

function previewColorKey(color: RGB | undefined, opacity: number): string | null {
  if (!color) return null;
  const values = [color.r, color.g, color.b, opacity];
  return values.every(value => Number.isFinite(value) && value >= 0 && value <= 1)
    ? values.join(':') : null;
}

function cssPreviewColor(key: string): string {
  const channels = key.split(':').map(Number);
  return '#' + channels.map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('');
}

function getConcreteValuesByMode(variable: {
  valuesByMode?: Record<string, any>;
  actualValuesByMode?: Record<string, any[]>;
}): Record<string, any[]> {
  if (variable.actualValuesByMode) {
    return variable.actualValuesByMode;
  }
  const result: Record<string, any[]> = {};
  for (const [modeId, value] of Object.entries(variable.valuesByMode ?? {})) {
    if (!isVariableAlias(value)) {
      result[modeId] = [value];
    }
  }
  return result;
}

function getNodeUniformColorKey(
  node: SceneNode,
  field: 'fill' | 'stroke',
  preview = false,
): string | null {
  const property = field === 'fill' ? 'fills' : 'strokes';
  const paints = (node as any)[property] as
    | readonly Paint[]
    | PluginAPI['mixed']
    | undefined;
  const direct = getUniformPaintColorKey(paints, preview);
  if (preview && typeof paints !== 'symbol') return direct;
  if (direct || node.type !== 'TEXT' || field !== 'fill') return direct;
  if (typeof (node as TextNode).getStyledTextSegments !== 'function') {
    return null;
  }
  const keys = new Set<string>();
  for (const segment of (node as TextNode).getStyledTextSegments(['fills'])) {
    const key = getUniformPaintColorKey(segment.fills, preview);
    if (!key) return null;
    keys.add(key);
  }
  return keys.size === 1 ? Array.from(keys)[0] : null;
}

function getUniformPaintColorKey(
  paints: readonly Paint[] | PluginAPI['mixed'] | undefined,
  preview: boolean,
): string | null {
  if (!Array.isArray(paints) || !paints.length) return null;
  if (preview) {
    const visible = paints.filter(paint => paint && paint.visible !== false);
    const paint = visible[0];
    return visible.length === 1 && paint.type === 'SOLID'
      ? previewColorKey(paint.color, paint.opacity ?? 1) : null;
  }
  const keys = new Set<string>();
  for (const paint of paints) {
    if (!paint || paint.visible === false || paint.type !== 'SOLID') return null;
    keys.add(buildColorKey(paint.color, paint.opacity ?? 1));
  }
  return keys.size === 1 ? Array.from(keys)[0] : null;
}

function getCatalogColorKey(value: any): string | null {
  if (!value || typeof value !== 'object' || isVariableAlias(value)) return null;
  if (
    typeof value.r !== 'number' ||
    typeof value.g !== 'number' ||
    typeof value.b !== 'number'
  ) {
    return null;
  }
  return buildColorKey(value, typeof value.a === 'number' ? value.a : 1);
}

function buildColorKey(
  color: { r: number; g: number; b: number },
  opacity: number,
): string {
  return [color.r, color.g, color.b, opacity]
    .map((value) => Number(value.toFixed(4)).toString())
    .join(':');
}

function buildTokenName(variable: {
  groupName?: string;
  tokenName?: string;
  name?: string;
  key?: string;
}): string {
  const group = variable.groupName ?? '';
  const token = variable.tokenName ?? variable.name ?? variable.key ?? '';
  return group && group !== 'Без группы' ? `${group}/${token}` : token;
}

function scopeSupportsField(scopes: string[], field: 'fill' | 'stroke'): boolean {
  if (!scopes.length || scopes.includes('ALL_SCOPES')) return true;
  return field === 'stroke'
    ? scopes.includes('STROKE_COLOR')
    : scopes.some((scope) =>
        ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL'].includes(scope),
      );
}

function compareCandidates(
  left: ColorTokenValueCandidate,
  right: ColorTokenValueCandidate,
): number {
  return [left.library ?? '', left.collectionName ?? '', left.name, left.key]
    .join('\u0000')
    .localeCompare(
      [right.library ?? '', right.collectionName ?? '', right.name, right.key]
        .join('\u0000'),
    );
}

function isVariableAlias(value: any): boolean {
  return value?.type === 'VARIABLE_ALIAS' && typeof value.id === 'string';
}

export function __test_buildColorTokenValueIndex(
  catalogs: ReturnType<typeof getTokenCatalogs>,
): Map<string, IndexedColorToken[]> {
  return buildColorTokenValueIndex(catalogs).byColor;
}

export function __test_getNodeUniformColorKey(
  node: SceneNode,
  field: 'fill' | 'stroke',
): string | null {
  return getNodeUniformColorKey(node, field);
}
