import type { CustomStyleEntry } from '../types/audit';
import { findComponent } from '../reference/library';
import { clampColorComponent } from '../utils/nodeHelpers';

type CustomStyleFilterRule = {
  id: string;
  apply: (node: SceneNode, entries: CustomStyleEntry[]) => CustomStyleEntry[];
};

// Technical fill color from JSONS/icons/Icons -- general (glyph).json.
const GLYPH_TECHNICAL_FILL_HEXES = new Set(['#747474']);
// Technical fill color from JSONS/web/components/web-core/core/Web _ Core -- IconView.json.
const ICON_VIEW_BGCOLOR_TECHNICAL_FILL_HEXES = new Set(['#F2F3F5']);
const PAINT_IGNORED_LIBRARY_SOURCES = new Set(['Icons', 'Logotypes']);
const TYPOGRAPHY_IGNORED_COMPONENT_KEYS = new Set([
  // Web _ Core / Status controls Uppercase through its nested Label variant.
  '349af184bee87341370ef007d5e8189c51bd31ff',
  // Figma can expose only the nested component boundary for instance sublayers.
  'a0c6e37a61cd5c5f5db767a5dfef09a9b6d2ece7',
]);
const paintLibraryIgnoreCache = new Map<string, Promise<boolean>>();
const typographyIgnoreCache = new WeakMap<BaseNode, Promise<boolean>>();

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

export async function shouldIgnorePaintCustomStyle(
  node: SceneNode,
): Promise<boolean> {
  const cached = paintLibraryIgnoreCache.get(node.id);
  if (cached) {
    return cached;
  }

  const pending = resolveIgnoredPaintBoundary(node);
  paintLibraryIgnoreCache.set(node.id, pending);
  return pending;
}

export async function shouldIgnoreTypographyCustomStyle(
  node: SceneNode,
): Promise<boolean> {
  const cached = typographyIgnoreCache.get(node);
  if (cached) return cached;

  const pending = resolveIgnoredTypographyBoundary(node);
  typographyIgnoreCache.set(node, pending);
  return pending;
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

async function resolveIgnoredPaintBoundary(node: SceneNode): Promise<boolean> {
  let current: BaseNode | null = node;

  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    const componentKey = await getNodeComponentKey(current);
    if (componentKey) {
      const ref = findComponent(componentKey);
      const source = String(ref?.source ?? '').trim();
      if (PAINT_IGNORED_LIBRARY_SOURCES.has(source)) {
        return true;
      }
    }

    current = current.parent ?? null;
  }

  return false;
}

async function resolveIgnoredTypographyBoundary(
  node: SceneNode,
): Promise<boolean> {
  if (hasStatusLabelTypographyBoundary(node)) {
    return true;
  }

  let current: BaseNode | null = node.parent;

  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    const componentKey = await getNodeComponentKey(current);
    if (
      componentKey &&
      TYPOGRAPHY_IGNORED_COMPONENT_KEYS.has(componentKey)
    ) {
      return true;
    }
    current = current.parent ?? null;
  }

  return false;
}

function hasStatusLabelTypographyBoundary(node: SceneNode): boolean {
  if (node.type !== 'TEXT' || node.name !== 'Label') {
    return false;
  }

  const ancestorNames: string[] = [];
  let current: BaseNode | null = node.parent;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    ancestorNames.push(current.name);
    current = current.parent ?? null;
  }

  const labelBoundaryIndex = ancestorNames.indexOf('🔩 Label');
  if (labelBoundaryIndex < 0) {
    return false;
  }

  return ancestorNames
    .slice(labelBoundaryIndex + 1)
    .some((name) => name === 'Status');
}

async function getNodeComponentKey(node: BaseNode): Promise<string | null> {
  if (node.type === 'INSTANCE') {
    const mainComponent = await node.getMainComponentAsync();
    return mainComponent?.key ?? null;
  }

  if (node.type === 'COMPONENT') {
    return node.key ?? null;
  }

  return null;
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
