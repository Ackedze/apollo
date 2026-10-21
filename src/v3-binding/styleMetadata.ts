// Reused v3 native/catalog fingerprints; catalog loading stays in the v4 read adapter.
type TypographyNumbersStyle = 'proportional' | 'tabular';

type TypographySignature = {
  fontSize: number;
  fontStyle: string;
  lineHeight: string;
  numbersStyle: TypographyNumbersStyle;
};

export function getNodeTypographyFingerprint(node: TextNode): string | null {
  const signature = readUniformNodeTypography(node);
  return signature ? buildTypographyFingerprint(signature) : null;
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

export function fingerprintCatalogPaintStyle(style: {
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

export function fingerprintCatalogTypographyStyle(style: {
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

