import {
  ensureReferenceCatalogsLoaded,
  getTokenCatalogs,
} from '../reference/library';

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

let colorTokenIndex: Map<string, IndexedColorToken[]> | null = null;
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
      colorTokenIndex = new Map();
    })
    .finally(() => {
      colorTokenIndexLoadPromise = null;
    });
  return colorTokenIndexLoadPromise;
}

export function findColorTokenValueCandidates(
  node: SceneNode,
  field: 'fill' | 'stroke',
): ColorTokenValueCandidate[] {
  const colorKey = getNodeUniformColorKey(node, field);
  if (!colorKey) return [];
  const matches = colorTokenIndex?.get(colorKey) ?? [];
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
): Map<string, IndexedColorToken[]> {
  const index = new Map<string, IndexedColorToken[]>();
  for (const catalog of catalogs) {
    const library = catalog.meta?.library ?? catalog.meta?.fileName ?? null;
    const sourceFile = catalog.meta?.fileName ?? null;
    for (const collection of catalog.collections ?? []) {
      if (!collection) continue;
      const collectionName = collection.name ?? library;
      for (const variable of collection.variables ?? []) {
        if (
          !variable?.key ||
          variable.resolvedType !== 'COLOR' ||
          variable.hiddenFromPublishing === true
        ) {
          continue;
        }
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
          const entries = index.get(colorKey) ?? [];
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
          index.set(colorKey, entries);
        }
      }
    }
  }
  return index;
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
): string | null {
  const property = field === 'fill' ? 'fills' : 'strokes';
  const paints = (node as any)[property] as
    | readonly Paint[]
    | PluginAPI['mixed']
    | undefined;
  const direct = getUniformPaintColorKey(paints);
  if (direct || node.type !== 'TEXT' || field !== 'fill') return direct;
  if (typeof (node as TextNode).getStyledTextSegments !== 'function') {
    return null;
  }
  const keys = new Set<string>();
  for (const segment of (node as TextNode).getStyledTextSegments(['fills'])) {
    const key = getUniformPaintColorKey(segment.fills);
    if (!key) return null;
    keys.add(key);
  }
  return keys.size === 1 ? Array.from(keys)[0] : null;
}

function getUniformPaintColorKey(
  paints: readonly Paint[] | PluginAPI['mixed'] | undefined,
): string | null {
  if (!Array.isArray(paints) || !paints.length) return null;
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
  return buildColorTokenValueIndex(catalogs);
}

export function __test_getNodeUniformColorKey(
  node: SceneNode,
  field: 'fill' | 'stroke',
): string | null {
  return getNodeUniformColorKey(node, field);
}
