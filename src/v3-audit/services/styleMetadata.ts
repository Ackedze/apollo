import {
  ensureReferenceCatalogsLoaded,
  getStyleCatalogs,
} from '../reference/library';
import { deprecatedStyleSourceFileSet } from '../config/deprecatedStyleSources';

export type StyleMetadataEntry = {
  key: string;
  label: string;
  library?: string;
  sourceFile?: string;
  isDeprecated?: boolean;
};

export type TypographyStyleCandidate = StyleMetadataEntry & {
  fontSize: number;
  fontStyle: string;
  lineHeight: string;
  numbersStyle: TypographyNumbersStyle;
};

type TypographyNumbersStyle = 'proportional' | 'tabular';

type TypographySignature = {
  fontSize: number;
  fontStyle: string;
  lineHeight: string;
  numbersStyle: TypographyNumbersStyle;
};

let styleMetadataMap: Map<string, StyleMetadataEntry> | null = null;
let paintStyleFingerprintMap: Map<string, StyleMetadataEntry[]> | null = null;
let typographyStyleFingerprintMap: Map<
  string,
  TypographyStyleCandidate[]
> | null = null;
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
      const fingerprintMap = new Map<string, StyleMetadataEntry[]>();
      const typographyFingerprintMap = new Map<
        string,
        TypographyStyleCandidate[]
      >();

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

          const metadata = {
            key: style.key,
            label,
            library: libraryName || undefined,
            sourceFile: sourceFile || undefined,
            isDeprecated,
          };
          map.set(style.key, metadata);

          const fingerprint = isDeprecated
            ? null
            : fingerprintCatalogPaintStyle(style);
          if (fingerprint) {
            const entries = fingerprintMap.get(fingerprint) ?? [];
            if (!entries.some((entry) => entry.key === metadata.key)) {
              entries.push(metadata);
            }
            fingerprintMap.set(fingerprint, entries);
          }

          const typographyFingerprint = isDeprecated
            ? null
            : fingerprintCatalogTypographyStyle(style);
          if (typographyFingerprint) {
            const entries =
              typographyFingerprintMap.get(typographyFingerprint.key) ?? [];
            if (!entries.some((entry) => entry.key === metadata.key)) {
              entries.push(
                Object.assign({}, metadata, {
                  fontSize: typographyFingerprint.fontSize,
                  fontStyle: typographyFingerprint.fontStyle,
                  lineHeight: typographyFingerprint.lineHeight,
                  numbersStyle: typographyFingerprint.numbersStyle,
                }),
              );
            }
            typographyFingerprintMap.set(typographyFingerprint.key, entries);
          }
        }
      }

      styleLookupCache.clear();
      styleMetadataMap = map;
      paintStyleFingerprintMap = fingerprintMap;
      typographyStyleFingerprintMap = typographyFingerprintMap;
    } catch (error) {
      console.warn('[Apollo] failed to load style catalogs', error);
      styleLookupCache.clear();
      styleMetadataMap = new Map();
      paintStyleFingerprintMap = new Map();
      typographyStyleFingerprintMap = new Map();
    } finally {
      styleMetadataLoadPromise = null;
    }
  })();

  return styleMetadataLoadPromise;
}

export function findExactTypographyStyleMatches(
  node: TextNode,
): TypographyStyleCandidate[] {
  const fingerprint = getNodeTypographyFingerprint(node);
  if (!fingerprint) return [];
  return (typographyStyleFingerprintMap?.get(fingerprint) ?? [])
    .slice()
    .sort((left, right) =>
      [left.library ?? '', left.label, left.key]
        .join('\u0000')
        .localeCompare(
          [right.library ?? '', right.label, right.key].join('\u0000'),
        ),
    );
}

export function getNodeTypographyFingerprint(node: TextNode): string | null {
  const signature = readUniformNodeTypography(node);
  return signature ? buildTypographyFingerprint(signature) : null;
}

export function getNodeTypographyDisplayValue(node: TextNode): string | null {
  const signature = readUniformNodeTypography(node);
  if (!signature) return null;
  const numbersLabel =
    signature.numbersStyle === 'tabular'
      ? 'Tabular numbers'
      : 'Proportional numbers';
  return `${signature.fontSize}/${formatLineHeightLabel(signature.lineHeight)} · ${signature.fontStyle} · ${numbersLabel}`;
}

export function getTextStyleTypographyFingerprint(
  style: Pick<TextStyle, 'fontName' | 'fontSize' | 'lineHeight' | 'name'>,
): string | null {
  const lineHeight = normalizeNodeLineHeight(style.lineHeight);
  if (!style.fontName || !Number.isFinite(style.fontSize) || !lineHeight) {
    return null;
  }
  return buildTypographyFingerprint({
    fontSize: style.fontSize,
    fontStyle: style.fontName.style,
    lineHeight,
    numbersStyle: inferNumbersStyle(style.name),
  });
}

export function findExactPaintStyleMatches(
  paints: readonly Paint[] | PluginAPI['mixed'] | undefined,
): StyleMetadataEntry[] {
  const fingerprint = getPaintStyleFingerprint(paints);
  if (!fingerprint) {
    return [];
  }
  const matches = paintStyleFingerprintMap?.get(fingerprint) ?? [];
  return matches.slice().sort((left, right) =>
    [left.library ?? '', left.label, left.key]
      .join('\u0000')
      .localeCompare(
        [right.library ?? '', right.label, right.key].join('\u0000'),
      ),
  );
}

export function getPaintStyleFingerprint(
  paints: readonly Paint[] | PluginAPI['mixed'] | undefined,
): string | null {
  return fingerprintNodePaints(paints);
}

export function getNodePaintFingerprint(
  node: SceneNode,
  field: 'fill' | 'stroke',
): string | null {
  const paints = field === 'fill' ? (node as any).fills : (node as any).strokes;
  const direct = fingerprintNodePaints(paints);
  if (direct || node.type !== 'TEXT' || field !== 'fill') {
    return direct;
  }
  const textNode = node as TextNode;
  if (typeof textNode.getStyledTextSegments !== 'function') {
    return null;
  }
  const fingerprints = new Set<string>();
  for (const segment of textNode.getStyledTextSegments(['fills'])) {
    const fingerprint = fingerprintNodePaints(segment.fills);
    if (!fingerprint) return null;
    fingerprints.add(fingerprint);
  }
  return fingerprints.size === 1 ? Array.from(fingerprints)[0] : null;
}

function fingerprintCatalogPaintStyle(style: {
  type?: string;
  value?: {
    kind?: string;
    data?: {
      paints?: Array<{
        type?: string;
        color?: string;
        opacity?: number;
        visible?: boolean;
        blendMode?: string;
      }>;
    };
  };
}): string | null {
  if (style.type !== 'paint' || style.value?.kind !== 'paint') {
    return null;
  }
  const paints = style.value.data?.paints;
  if (!Array.isArray(paints) || !paints.length) {
    return null;
  }

  const parts: string[] = [];
  for (const paint of paints) {
    if (!paint || paint.visible === false || paint.type !== 'solid') {
      return null;
    }
    const color = parseCatalogColor(paint.color);
    if (!color) {
      return null;
    }
    parts.push(
      buildSolidPaintFingerprint(
        color,
        paint.opacity ?? 1,
        paint.blendMode ?? 'NORMAL',
      ),
    );
  }
  return `paint:${parts.join('|')}`;
}

function fingerprintCatalogTypographyStyle(style: {
  type?: string;
  value?: {
    kind?: string;
    data?: {
      fontName?: string;
      fontSize?: number;
      lineHeight?: string | number;
    };
  };
  group?: string;
  name?: string;
}): ({ key: string } & TypographySignature) | null {
  if (style.type !== 'text' || style.value?.kind !== 'text') return null;
  const fontName = style.value.data?.fontName;
  const fontSize = style.value.data?.fontSize;
  const lineHeight = normalizeCatalogLineHeight(style.value.data?.lineHeight);
  if (!fontName || typeof fontSize !== 'number' || !Number.isFinite(fontSize)) {
    return null;
  }
  const fontStyle = extractCatalogFontStyle(fontName);
  if (!fontStyle || !lineHeight) return null;
  const signature: TypographySignature = {
    fontSize,
    fontStyle,
    lineHeight,
    numbersStyle: inferNumbersStyle(
      `${style.group ?? ''}/${style.name ?? ''}`,
    ),
  };
  return Object.assign({ key: buildTypographyFingerprint(signature) }, signature);
}

function readUniformNodeTypography(
  node: TextNode,
): TypographySignature | null {
  if (
    node.fontName !== figma.mixed &&
    node.fontSize !== figma.mixed &&
    node.lineHeight !== figma.mixed &&
    node.openTypeFeatures !== figma.mixed
  ) {
    const lineHeight = normalizeNodeLineHeight(node.lineHeight);
    if (!lineHeight) return null;
    return {
      fontSize: node.fontSize,
      fontStyle: node.fontName.style,
      lineHeight,
      numbersStyle: getNodeNumbersStyle(node.openTypeFeatures),
    };
  }
  if (typeof node.getStyledTextSegments !== 'function') return null;
  const signatures = new Map<string, TypographySignature>();
  for (const segment of node.getStyledTextSegments([
    'fontName',
    'fontSize',
    'lineHeight',
    'openTypeFeatures',
  ])) {
    const lineHeight = normalizeNodeLineHeight(segment.lineHeight);
    if (!lineHeight) return null;
    const signature: TypographySignature = {
      fontSize: segment.fontSize,
      fontStyle: segment.fontName.style,
      lineHeight,
      numbersStyle: getNodeNumbersStyle(segment.openTypeFeatures),
    };
    signatures.set(buildTypographyFingerprint(signature), signature);
  }
  return signatures.size === 1 ? Array.from(signatures.values())[0] : null;
}

function buildTypographyFingerprint(signature: TypographySignature): string {
  return [
    'typography',
    roundFingerprintNumber(signature.fontSize),
    normalizeFontStyle(signature.fontStyle),
    signature.lineHeight,
    signature.numbersStyle,
  ].join(':');
}

function normalizeNodeLineHeight(value: LineHeight): string | null {
  if (!value || value.unit === 'AUTO') return value?.unit === 'AUTO' ? 'auto' : null;
  return `${value.unit.toLocaleLowerCase()}:${roundFingerprintNumber(value.value)}`;
}

function normalizeCatalogLineHeight(
  value: string | number | null | undefined,
): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `pixels:${roundFingerprintNumber(value)}`;
  }
  const normalized = String(value ?? '').trim().toLocaleLowerCase();
  if (!normalized) return null;
  if (normalized === 'auto') return 'auto';
  if (normalized.endsWith('%')) {
    const parsed = Number(normalized.slice(0, -1));
    return Number.isFinite(parsed)
      ? `percent:${roundFingerprintNumber(parsed)}`
      : null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed)
    ? `pixels:${roundFingerprintNumber(parsed)}`
    : null;
}

function getNodeNumbersStyle(
  openTypeFeatures: Readonly<Record<string, boolean>>,
): TypographyNumbersStyle {
  return openTypeFeatures.TNUM === true ? 'tabular' : 'proportional';
}

function inferNumbersStyle(value: string): TypographyNumbersStyle {
  return /(?:^|\/)mono(?:\/|$)|monospaceNumbers\s*=\s*\{?true\}?/i.test(value)
    ? 'tabular'
    : 'proportional';
}

function formatLineHeightLabel(value: string): string {
  if (value === 'auto') return 'auto';
  const separator = value.indexOf(':');
  const unit = separator >= 0 ? value.slice(0, separator) : '';
  const numeric = separator >= 0 ? value.slice(separator + 1) : value;
  return unit === 'percent' ? `${numeric}%` : `${numeric} px`;
}

function extractCatalogFontStyle(fontName: string): string | null {
  const normalized = fontName.trim();
  if (!normalized) return null;
  const knownSuffix = normalized.match(
    /(?:extra\s*light|ultra\s*light|semi\s*bold|demi\s*bold|extra\s*bold|ultra\s*bold|regular|medium|bold|light|thin|black|heavy|italic)$/i,
  );
  if (knownSuffix) return knownSuffix[0];
  const segments = normalized.split(/\s+/);
  return segments[segments.length - 1] ?? null;
}

function normalizeFontStyle(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, '');
}

function fingerprintNodePaints(
  paints: readonly Paint[] | PluginAPI['mixed'] | undefined,
): string | null {
  if (!Array.isArray(paints) || !paints.length) {
    return null;
  }

  const parts: string[] = [];
  for (const paint of paints) {
    if (!paint || paint.visible === false || paint.type !== 'SOLID') {
      return null;
    }
    parts.push(
      buildSolidPaintFingerprint(
        paint.color,
        paint.opacity ?? 1,
        paint.blendMode ?? 'NORMAL',
      ),
    );
  }
  return `paint:${parts.join('|')}`;
}

function parseCatalogColor(
  value: string | null | undefined,
): { r: number; g: number; b: number } | null {
  const match = String(value ?? '').match(
    /rgba\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i,
  );
  if (!match) {
    return null;
  }
  return {
    r: Number(match[1]) / 255,
    g: Number(match[2]) / 255,
    b: Number(match[3]) / 255,
  };
}

function buildSolidPaintFingerprint(
  color: { r: number; g: number; b: number },
  opacity: number,
  blendMode: string,
): string {
  return [
    'solid',
    roundFingerprintNumber(color.r),
    roundFingerprintNumber(color.g),
    roundFingerprintNumber(color.b),
    roundFingerprintNumber(opacity),
    String(blendMode || 'NORMAL').toUpperCase(),
  ].join(':');
}

function roundFingerprintNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

export function __test_fingerprintCatalogPaintStyle(style: {
  type?: string;
  value?: {
    kind?: string;
    data?: {
      paints?: Array<{
        type?: string;
        color?: string;
        opacity?: number;
        visible?: boolean;
        blendMode?: string;
      }>;
    };
  };
}): string | null {
  return fingerprintCatalogPaintStyle(style);
}

export function __test_fingerprintNodePaints(
  paints: readonly Paint[],
): string | null {
  return fingerprintNodePaints(paints);
}

export function __test_fingerprintCatalogTypographyStyle(style: {
  type?: string;
  value?: {
    kind?: string;
    data?: {
      fontName?: string;
      fontSize?: number;
      lineHeight?: string | number;
    };
  };
  group?: string;
  name?: string;
}): string | null {
  return fingerprintCatalogTypographyStyle(style)?.key ?? null;
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
  if (!styleId || typeof styleId !== 'string') {
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

export function getStyleMetadataFromKnownKey(
  styleKey: string,
): StyleMetadataEntry | null {
  return styleMetadataMap?.get(styleKey) ?? null;
}
