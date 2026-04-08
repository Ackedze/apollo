import {
  ensureReferenceCatalogsLoaded,
  getStyleCatalogs,
} from '../reference/library';
import { deprecatedStyleSourceFileSet } from '../config/deprecatedStyleSources';

export type StyleMetadataEntry = {
  label: string;
  library?: string;
  sourceFile?: string;
  isDeprecated?: boolean;
};

let styleMetadataMap: Map<string, StyleMetadataEntry> | null = null;
let styleMetadataLoadPromise: Promise<void> | null = null;
const styleLookupCache = new Map<string, string>();

export async function ensureStyleMetadataLoaded(): Promise<void> {
  if (styleMetadataMap) return;
  if (styleMetadataLoadPromise) {
    return styleMetadataLoadPromise;
  }

  styleMetadataLoadPromise = (async () => {
    try {
      await ensureReferenceCatalogsLoaded();
      const catalogs = getStyleCatalogs();
      const map = new Map<string, StyleMetadataEntry>();

      for (const catalog of catalogs) {
        const libraryName =
          catalog.meta?.library || catalog.meta?.fileName || '';
        const sourceFile = catalog.meta?.fileName || '';
        const isDeprecated = deprecatedStyleSourceFileSet.has(sourceFile);
        const styles = catalog.styles ?? [];

        for (const style of styles) {
          if (!style?.key) continue;
          const label = buildStyleLabel(
            style.group ?? '',
            style.name ?? '',
          );

          map.set(style.key, {
            label,
            library: libraryName || undefined,
            sourceFile: sourceFile || undefined,
            isDeprecated,
          });
        }
      }

      styleLookupCache.clear();
      styleMetadataMap = map;
    } catch (error) {
      console.warn('[Apollo] failed to load style catalogs', error);
      styleLookupCache.clear();
      styleMetadataMap = new Map();
    } finally {
      styleMetadataLoadPromise = null;
    }
  })();

  return styleMetadataLoadPromise;
}

export function resolveStyleLabelForDiff(styleKey: string): string | null {
  const direct = getStyleMetadataFromKnownKey(styleKey);
  if (direct?.label) return direct.label;

  if (styleKey.startsWith('S:')) {
    const extracted = styleKey.slice(2).split(',')[0];
    if (extracted) {
      const byKey = getStyleMetadataFromKnownKey(extracted);
      if (byKey?.label) return byKey.label;
    }
  }

  return styleKey;
}

export async function resolveStyleMetadata(
  styleId: string | null | undefined,
): Promise<StyleMetadataEntry | null> {
  const normalized = normalizeStyleId(styleId);
  if (!normalized) {
    return null;
  }

  const directKey = extractStyleKey(normalized);
  if (directKey) {
    const direct = getStyleMetadataFromKnownKey(directKey);
    if (direct) {
      return direct;
    }
  }

  if (styleLookupCache.has(normalized)) {
    const cachedKey = styleLookupCache.get(normalized) ?? null;
    if (cachedKey) {
      const cached = getStyleMetadataFromKnownKey(cachedKey);
      if (cached) {
        return cached;
      }
    }
  }

  const figmaApi = figma as PluginAPI & {
    getStyleById?: (id: string) => BaseStyle | null;
    getStyleByIdAsync?: (id: string) => Promise<BaseStyle | null>;
  };

  try {
    const style =
      typeof figmaApi.getStyleByIdAsync === 'function'
        ? await figmaApi.getStyleByIdAsync(normalized)
        : typeof figmaApi.getStyleById === 'function'
          ? figmaApi.getStyleById(normalized)
          : null;

    const resolvedKey =
      style && typeof style.key === 'string' && style.key
        ? style.key
        : null;

    if (!resolvedKey) {
      return null;
    }

    styleLookupCache.set(normalized, resolvedKey);
    return getStyleMetadataFromKnownKey(resolvedKey);
  } catch (error) {
    console.warn('[Apollo] failed to resolve style metadata by id', {
      styleId: normalized,
      error,
    });
    return null;
  }
}

export async function isKnownStyleId(
  styleId: string | null | undefined,
): Promise<boolean> {
  return Boolean(await resolveStyleMetadata(styleId));
}

function buildStyleLabel(
  groupName: string,
  styleName: string,
): string {
  const normalizedStyleName = stripStyleSuffix(styleName);
  const segments: string[] = [];
  if (groupName && groupName !== 'Без группы') {
    segments.push(groupName);
  }
  if (normalizedStyleName) {
    segments.push(normalizedStyleName);
  }
  return segments.join('/');
}

function stripStyleSuffix(value: string): string {
  if (!value) return value;
  const index = value.indexOf(' (');
  if (index === -1) return value;
  return value.slice(0, index).trim();
}

export function normalizeStyleId(
  styleId: string | null | undefined,
): string | null {
  if (!styleId || typeof styleId !== 'string' || styleId === figma.mixed) {
    return null;
  }
  return styleId.trim() || null;
}

export function extractStyleKey(styleId: string): string | null {
  if (styleMetadataMap?.has(styleId)) {
    return styleId;
  }
  if (!styleId.startsWith('S:')) {
    return null;
  }
  const extracted = styleId.slice(2).split(',')[0];
  return extracted || null;
}

function getStyleMetadataFromKnownKey(
  styleKey: string,
): StyleMetadataEntry | null {
  return styleMetadataMap?.get(styleKey) ?? null;
}
