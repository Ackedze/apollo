import type { CustomStyleEntry } from '../types/audit';
import { clampColorComponent } from '../utils/nodeHelpers';

type CustomStyleFilterRule = {
  id: string;
  apply: (node: SceneNode, entries: CustomStyleEntry[]) => CustomStyleEntry[];
};

// Technical fill color from JSONS/icons/Icons -- general (glyph).json.
const GLYPH_TECHNICAL_FILL_HEXES = new Set(['#747474']);
// Technical fill color from JSONS/components/web-core/core/Web _ Core -- IconView.json.
const ICON_VIEW_BGCOLOR_TECHNICAL_FILL_HEXES = new Set(['#F2F3F5']);

const rules: CustomStyleFilterRule[] = [
  {
    id: 'ignore_glyph_technical_icon_fill',
    apply(node, entries) {
      if (!isGlyphTechnicalIconNode(node)) {
        return entries;
      }
      return entries.filter((entry) => entry.reason !== 'fill');
    },
  },
  {
    id: 'ignore_icon_view_bgcolor_technical_fill',
    apply(node, entries) {
      if (!isIconViewBgColorNode(node)) {
        return entries;
      }
      return entries.filter((entry) => entry.reason !== 'fill');
    },
  },
];

export function applyCustomStyleFilters(
  node: SceneNode,
  entries: CustomStyleEntry[],
): CustomStyleEntry[] {
  let current = Array.isArray(entries) ? entries : [];

  for (const rule of rules) {
    if (!current.length) {
      break;
    }
    current = rule.apply(node, current);
  }

  return current;
}

function isGlyphTechnicalIconNode(node: SceneNode): boolean {
  if (node.type !== 'VECTOR' || node.name !== 'icon' || !('fills' in node)) {
    return false;
  }
  return hasOnlyTechnicalSolidFills(node, GLYPH_TECHNICAL_FILL_HEXES);
}

function isIconViewBgColorNode(node: SceneNode): boolean {
  if (
    node.type !== 'RECTANGLE' ||
    node.name !== 'BgColor' ||
    !('fills' in node)
  ) {
    return false;
  }
  return hasOnlyTechnicalSolidFills(
    node,
    ICON_VIEW_BGCOLOR_TECHNICAL_FILL_HEXES,
  );
}

function hasOnlyTechnicalSolidFills(
  node: MinimalFillsMixin,
  allowedHexes: Set<string>,
): boolean {
  const fills = node.fills;
  if (!Array.isArray(fills) || !fills.length) {
    return false;
  }

  const visibleSolidHexes = fills
    .filter((paint): paint is SolidPaint => {
      return Boolean(
        paint &&
          paint.type === 'SOLID' &&
          paint.visible !== false &&
          paint.color,
      );
    })
    .map((paint) => toHex(paint));

  return (
    visibleSolidHexes.length > 0 &&
    visibleSolidHexes.every((hex) => allowedHexes.has(hex))
  );
}

function toHex(paint: SolidPaint): string {
  const r = clampColorComponent(paint.color?.r);
  const g = clampColorComponent(paint.color?.g);
  const b = clampColorComponent(paint.color?.b);
  return `#${toHexPair(r)}${toHexPair(g)}${toHexPair(b)}`;
}

function toHexPair(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}
