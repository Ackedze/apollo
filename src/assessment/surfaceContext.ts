export type SurfaceContextKind = 'white' | 'gray' | 'contrast' | 'unknown';

export type SurfaceContextEvidence = {
  kind: SurfaceContextKind;
  source: 'ancestor-fill-token' | 'ancestor-fill-color' | 'unresolved';
  nodeId: string | null;
  nodeName: string | null;
  tokenId: string | null;
  tokenName: string | null;
  color: string | null;
};

type SurfaceNode = {
  id?: string;
  name?: string;
  type?: string;
  parent?: SurfaceNode | null;
  fills?: unknown;
};

type SolidPaintLike = {
  type?: string;
  visible?: boolean;
  opacity?: number;
  color?: { r?: number; g?: number; b?: number };
  boundVariables?: {
    color?: {
      id?: string;
      variableId?: string;
      variable?: { id?: string; key?: string };
      key?: string;
    };
  };
};

export function resolveSurfaceContext(
  node: SurfaceNode,
  resolveTokenLabel?: (tokenId: string) => string | null,
): SurfaceContextEvidence {
  let current: SurfaceNode | null = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    const paints = Array.isArray(current.fills)
      ? (current.fills as SolidPaintLike[])
      : [];
    for (const paint of paints) {
      if (
        paint?.type !== 'SOLID' ||
        paint.visible === false ||
        paint.opacity === 0 ||
        (typeof paint.opacity === 'number' && paint.opacity < 0.98)
      ) {
        continue;
      }

      const tokenId = getPaintTokenId(paint);
      const tokenName = tokenId ? resolveTokenLabel?.(tokenId) ?? null : null;
      const tokenKind = classifyTokenName(tokenName);
      const color = formatColor(paint.color);
      const colorKind = classifyColor(paint.color);
      const kind = tokenKind !== 'unknown' ? tokenKind : colorKind;
      if (kind === 'unknown') {
        continue;
      }

      return {
        kind,
        source: tokenKind !== 'unknown'
          ? 'ancestor-fill-token'
          : 'ancestor-fill-color',
        nodeId: typeof current.id === 'string' ? current.id : null,
        nodeName: typeof current.name === 'string' ? current.name : null,
        tokenId,
        tokenName,
        color,
      };
    }
    current = current.parent ?? null;
  }

  return {
    kind: 'unknown',
    source: 'unresolved',
    nodeId: null,
    nodeName: null,
    tokenId: null,
    tokenName: null,
    color: null,
  };
}

function getPaintTokenId(paint: SolidPaintLike): string | null {
  const color = paint.boundVariables?.color;
  const token = color?.id ?? color?.variableId ?? color?.variable?.id ?? color?.key;
  return typeof token === 'string' && token.trim() ? token : null;
}

function classifyTokenName(value: string | null): SurfaceContextKind {
  const name = normalize(value);
  if (!name) return 'unknown';
  if (
    name.includes('grey') ||
    name.includes('gray') ||
    name.includes('neutral') ||
    name.includes('base-bg-alt') ||
    name.includes('modal-bg-alt')
  ) {
    return 'gray';
  }
  if (
    name.includes('base-bg (white)') ||
    name.includes('modal-bg (white)') ||
    name.includes('monochrome-white/100') ||
    name.includes('monochrome white/100')
  ) {
    return 'white';
  }
  if (
    name.includes('contrast') ||
    name.includes('inverse') ||
    name.includes('inverted')
  ) {
    return 'contrast';
  }
  return 'unknown';
}

function classifyColor(
  color: SolidPaintLike['color'],
): SurfaceContextKind {
  if (!color) return 'unknown';
  const r = numberOrNull(color.r);
  const g = numberOrNull(color.g);
  const b = numberOrNull(color.b);
  if (r === null || g === null || b === null) return 'unknown';
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (min >= 0.985) return 'white';
  if (max - min <= 0.04 && luminance >= 0.72) return 'gray';
  if (luminance <= 0.45 || max - min > 0.12) return 'contrast';
  return 'unknown';
}

function formatColor(color: SolidPaintLike['color']): string | null {
  if (!color) return null;
  const r = numberOrNull(color.r);
  const g = numberOrNull(color.g);
  const b = numberOrNull(color.b);
  if (r === null || g === null || b === null) return null;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value: number): string {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalize(value: string | null): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
