import type {
  DSStructureNode,
  DSNodeLayout,
  DSNodeStyles,
  DSRadii,
  DSRadiiValues,
  DSInstanceInfo,
  DSTextContent,
  DSEffect,
  DSNormalizedSnapshot,
  DSNormalizedElement,
} from '../types/structures';

/**
 * Возвращает флаг видимости узла без учёта родителей (наследование обрабатывает walk).
 */
function getNodeSelfVisible(node: SceneNode): boolean {
  return 'visible' in node ? (node as any).visible !== false : true;
}

function makePath(parent: string, name: string): string {
  return parent ? `${parent} / ${name}` : name;
}

/**
 * Рекурсивно перебирает дерево узла и формирует плоский список DSStructureNode
 * с корректным учётом effective visibility, layout, fill/stroke и прочих метаданных.
 */
export async function snapshotTree(root: SceneNode, checkedComponentNodesList: Set<string>): Promise<DSStructureNode[]> {
  const list: DSStructureNode[] = [];
  let nextId = 1;

  async function walk(
    node: SceneNode,
    parentPath: string,
    parentId: number | null,
    parentVisible: boolean,
  ) {
    if (!node.visible) {
      return
    }

    checkedComponentNodesList.add(node.id);

    const id = nextId++;
    const nodeVisible = getNodeSelfVisible(node);
    const effectiveVisible = parentVisible && nodeVisible;
    const snap = await snapshotNode(
      node,
      parentPath,
      parentId,
      id,
      effectiveVisible,
    );
    list.push(snap);

    if ('children' in node) {
      const children = node.children as SceneNode[];
      if (children.length) {
        await Promise.all(
          children.map((child) =>
            walk(child, snap.path, id, snap.visible !== false),
          ),
        );
      }
    }
  }

  await walk(root, '', null, true);
  return list;
}

/**
 * Собирает flatten-представление контекста (normalized snapshot) для отправки UI,
 * включая fills/strokes/token/... и отметку видимости во всей ветке.
 */
export async function snapshotNormalizedContext(
  root: SceneNode,
): Promise<DSNormalizedSnapshot> {
  const elements: DSNormalizedElement[] = [];

  async function walk(
    node: SceneNode,
    parentPath: string,
    activeComponentKey: string | null,
    parentVisible: boolean,
  ) {
    const nodeVisible = getNodeSelfVisible(node);

    if (!nodeVisible) {
      return 
    }

    let nextComponentKey = activeComponentKey;

    if (node.type === 'INSTANCE') {
      const inst = node as InstanceNode;

      const mainComponent =
        typeof inst.getMainComponentAsync === 'function'
          ? await inst.getMainComponentAsync()
          : inst.mainComponent;

      if (mainComponent?.key) {
        nextComponentKey = mainComponent.key;
      }

    } else if (node.type === 'COMPONENT' && 'key' in node) {
      const key = (node as ComponentNode).key;

      if (key) {
        nextComponentKey = key;
      }
    }

    const path = makePath(parentPath, node.name);
    const effectiveVisible = parentVisible && nodeVisible;
    const element: DSNormalizedElement = {
      path,
      type: node.type,
      visible: effectiveVisible,
    };

    const fillInfo = extractFillInfo(node);
    if (fillInfo) {
      element.fill = fillInfo;
    }

    const strokeInfo = extractStrokeInfo(node);
    if (strokeInfo) {
      element.stroke = strokeInfo;
    }

    if (nextComponentKey) {
      element.componentKey = nextComponentKey;
    }

    const layout = extractNormalizedLayout(node);
    if (layout) {
      element.layout = layout;
    }

    const textValue = extractTextValue(node);
    if (textValue) {
      element.text = { value: textValue };
    }
    const typography = extractNormalizedTypography(node);
    if (typography) {
      element.typography = typography;
    }

    elements.push(element);

    if ('children' in node) {
      const children = node.children as SceneNode[];
      for (const child of children) {
        await walk(child, path, nextComponentKey, effectiveVisible);
      }
    }
  }

  await walk(root, '', null, true);
  return {
    kind: 'snapshot',
    source: {
      nodeId: root.id,
      name: root.name,
      generatedAt: new Date().toISOString(),
      scope: 'selection',
    },
    elements,
  };
}

/**
 * Базовый снимок одного узла: собирает layout, paint, radius, эффекты и связанную компоненту.
 */
export async function snapshotNode(
  node: SceneNode,
  parentPath: string,
): Promise<DSStructureNode> {
  const path = makePath(parentPath, node.name);

  const snap: DSStructureNode = {
    nodeId: node.id,
    path,
    type: node.type,
    name: node.name,
    styles: extractStyles(node),
    fill: extractFillInfo(node),
    stroke: extractStrokeInfo(node),
    layout: extractLayout(node),
    opacity: 'opacity' in node ? node.opacity : 1,
    opacityToken: getBoundVariableId(node.boundVariables, 'opacity'),
    componentInstance: await extractInstance(node),
    text: extractText(node),
    radius: extractRadius(node),
    radiusToken: getBoundVariableId(node.boundVariables, 'cornerRadius'),
    effects: extractEffects(node),
  };

  return snap;
}

function extractStyles(node: SceneNode): DSNodeStyles | undefined {
  const styles: DSNodeStyles = {};
  if ('fillStyleId' in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
    styles.fill = { styleKey: String(node.fillStyleId) };
  }
  if ('strokeStyleId' in node && node.strokeStyleId && node.strokeStyleId !== figma.mixed) {
    styles.stroke = { styleKey: String(node.strokeStyleId) };
  }
  if (
    node.type === 'TEXT' &&
    (node as TextNode).textStyleId &&
    (node as TextNode).textStyleId !== figma.mixed
  ) {
    styles.text = { styleKey: String((node as TextNode).textStyleId) };
  }
  return Object.keys(styles).length ? styles : undefined;
}

function extractLayout(node: SceneNode): DSNodeLayout | undefined {
  const layout: DSNodeLayout = {};
  const source = node as any;

  const assign = (key: keyof DSNodeLayout, value: number | null | typeof figma.mixed | undefined) => {
    if (value === null || typeof value === 'undefined' || value === figma.mixed) return;
    layout[key] = value;
  };

  if ('width' in source) assign('width', typeof source.width === 'number' ? source.width : undefined);
  if ('height' in source) assign('height', typeof source.height === 'number' ? source.height : undefined);
  if ('minWidth' in source) assign('minWidth', source.minWidth);
  if ('maxWidth' in source) assign('maxWidth', source.maxWidth);
  if ('minHeight' in source) assign('minHeight', source.minHeight);
  if ('maxHeight' in source) assign('maxHeight', source.maxHeight);

  if ('layoutMode' in node && (node as AutoLayoutMixin).layoutMode && (node as AutoLayoutMixin).layoutMode !== 'NONE') {
    layout.direction = (node as AutoLayoutMixin).layoutMode === 'HORIZONTAL' ? 'H' : 'V';
    const padding = {
      top: (node as AutoLayoutMixin).paddingTop || 0,
      right: (node as AutoLayoutMixin).paddingRight || 0,
      bottom: (node as AutoLayoutMixin).paddingBottom || 0,
      left: (node as AutoLayoutMixin).paddingLeft || 0,
    };
    layout.padding = padding;
    if (typeof (node as AutoLayoutMixin).itemSpacing === 'number') {
      layout.itemSpacing = (node as AutoLayoutMixin).itemSpacing;
    }
    const bound = (node as any).boundVariables;
    const paddingTokens = {
      top: getBoundVariableId(bound, 'paddingTop'),
      right: getBoundVariableId(bound, 'paddingRight'),
      bottom: getBoundVariableId(bound, 'paddingBottom'),
      left: getBoundVariableId(bound, 'paddingLeft'),
    };
    if (
      paddingTokens.top ||
      paddingTokens.right ||
      paddingTokens.bottom ||
      paddingTokens.left
    ) {
      layout.paddingTokens = paddingTokens;
    }
    const itemSpacingToken = getBoundVariableId(bound, 'itemSpacing');
    if (itemSpacingToken) {
      layout.itemSpacingToken = itemSpacingToken;
    }
  }

  return Object.keys(layout).length ? layout : undefined;
}

async function extractInstance(
  node: SceneNode,
): Promise<DSInstanceInfo | undefined> {
  if (node.type !== 'INSTANCE') return undefined;
  const inst = node as InstanceNode;
  const mainComponent =
    typeof inst.getMainComponentAsync === 'function'
      ? await inst.getMainComponentAsync()
      : inst.mainComponent;
  const componentKey = mainComponent?.key ?? '';
  const variantProperties = (inst as any).variantProperties ?? undefined;
  return { componentKey, variantProperties };
}

function extractText(node: SceneNode): DSTextContent | undefined {
  if (node.type !== 'TEXT') return undefined;

  const t = node as TextNode;

  const result: DSTextContent = {};

  let hasData = false;

  if (typeof t.characters === 'string') {
    result.characters = t.characters;
    hasData = true;
  }

  if (t.lineHeight !== figma.mixed && t.lineHeight) {
    if (t.lineHeight.unit === 'PIXELS') {
      result.lineHeight = t.lineHeight.value;
    } else {
      result.lineHeight = `${t.lineHeight.unit}`;
    }

    hasData = true;
  }

  if (t.letterSpacing !== figma.mixed && t.letterSpacing) {
    result.letterSpacing = t.letterSpacing.value;
    hasData = true;
  }

  if (typeof t.paragraphSpacing === 'number') {
    result.paragraphSpacing = t.paragraphSpacing;
    hasData = true;
  }

  if (t.textCase && t.textCase !== 'ORIGINAL') {
    result.case = t.textCase.toString();
    hasData = true;
  }

  return hasData ? result : undefined;
}

function extractTextValue(node: SceneNode): string | undefined {
  if (node.type !== 'TEXT') return undefined;
  const t = node as TextNode;
  return typeof t.characters === 'string' ? t.characters : undefined;
}

function extractNormalizedTypography(
  node: SceneNode,
): DSNormalizedElement['typography'] | undefined {
  if (node.type !== 'TEXT') return undefined;
  const t = node as TextNode;
  const styleId = t.textStyleId;
  if (!styleId || styleId === figma.mixed || typeof styleId !== 'string') {
    return undefined;
  }
  return { styleKey: styleId };
}

function extractFillInfo(node: SceneNode) {
  if (!('fills' in node)) return undefined;
  const fills = (node as any).fills;
  if (!fills || fills === figma.mixed || !Array.isArray(fills)) {
    return undefined;
  }
  const solids = fills.filter((paint) => paint && paint.type === 'SOLID');
  if (!solids.length) {
    return undefined;
  }
  const color = solids
    .map((paint) => {
      const c = paint.color;
      const opacity = paint.opacity === undefined ? 1 : paint.opacity;
      return `rgba(${[Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), Math.round(opacity * 100) / 100].join(',')})`;
    })
    .join(',');
  const token =
    'fillStyleId' in node &&
    (node as any).fillStyleId &&
    (node as any).fillStyleId !== figma.mixed
      ? String((node as any).fillStyleId)
      : null;
  const variableToken = extractPaintVariableId(fills);
  const resolvedToken = token || variableToken;
  if (!color && !resolvedToken) return undefined;
  return { color: color || null, token: resolvedToken };
}

function extractStrokeInfo(node: SceneNode) {
  if (!('strokes' in node)) return undefined;
  const strokes = (node as any).strokes;
  if (!strokes || strokes === figma.mixed || !Array.isArray(strokes)) {
    return undefined;
  }
  const solids = strokes.filter((paint) => paint && paint.type === 'SOLID');
  const hasVisibleStrokePaint = strokes.some(
    (paint) => paint && paint.visible !== false && (paint.opacity === undefined || paint.opacity > 0),
  );
  const visibleSolids = solids.filter(
    (paint) => paint.visible !== false && (paint.opacity === undefined || paint.opacity > 0),
  );
  const color = visibleSolids.length
    ? visibleSolids
        .map((paint) => {
          const c = paint.color;
          const opacity = paint.opacity === undefined ? 1 : paint.opacity;
          return `rgba(${[Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), Math.round(opacity * 100) / 100].join(',')})`;
        })
        .join(',')
    : null;
  const token =
    'strokeStyleId' in node &&
    (node as any).strokeStyleId &&
    (node as any).strokeStyleId !== figma.mixed
      ? String((node as any).strokeStyleId)
      : null;
  const variableToken = extractPaintVariableId(strokes);
  const resolvedToken = token || variableToken;
  const weight =
    'strokeWeight' in node && typeof (node as any).strokeWeight === 'number'
      ? (node as any).strokeWeight
      : null;
  const align =
    'strokeAlign' in node && (node as any).strokeAlign
      ? String((node as any).strokeAlign)
      : null;
  if (!hasVisibleStrokePaint || weight === null || weight <= 0) {
    return undefined;
  }
  return {
    color: color || null,
    token: resolvedToken,
    weight,
    align,
  };
}

function extractPaintVariableId(
  paints: readonly Paint[] | PluginAPI['mixed'] | undefined,
): string | null {
  if (!paints || paints === figma.mixed || !Array.isArray(paints)) {
    return null;
  }
  for (const paint of paints) {
    if (!paint || paint.type !== 'SOLID') continue;
    const colorBinding = (paint as any).boundVariables?.color;
    const variableId =
      colorBinding?.id ||
      colorBinding?.variableId ||
      colorBinding?.variable?.id ||
      colorBinding?.variable?.key;
    if (variableId) {
      return String(variableId);
    }
  }
  return null;
}

function getBoundVariableId(boundVariables: any, key: string): string | null {
  if (!boundVariables) return null;
  const binding = boundVariables[key];
  if (!binding) return null;
  if (typeof binding === 'string') return binding;
  const candidate =
    binding.id ||
    binding.variableId ||
    binding.variable?.id ||
    binding.variable?.key;
  return candidate ? String(candidate) : null;
}

function extractRadius(node: SceneNode): DSRadii | null {
  if ('cornerRadius' in node === false) {
    return null;
  }

  if (typeof node.cornerRadius === 'number') {
    return node.cornerRadius;
  }

  const mixin = node as CornerMixin & RectangleCornerMixin;

  if (
    typeof mixin.topLeftRadius === 'number' &&
    typeof mixin.topRightRadius === 'number' &&
    typeof mixin.bottomRightRadius === 'number' &&
    typeof mixin.bottomLeftRadius === 'number'
  ) {
    const values: DSRadiiValues = {
      topLeft: mixin.topLeftRadius,
      topRight: mixin.topRightRadius,
      bottomRight: mixin.bottomRightRadius,
      bottomLeft: mixin.bottomLeftRadius,
    };
    return values;
  }

  return null
}

function extractNormalizedLayout(
  node: SceneNode,
): DSNormalizedElement['layout'] | undefined {
  const layout: DSNormalizedElement['layout'] = {};

  if (
    'layoutMode' in node &&
    (node as AutoLayoutMixin).layoutMode &&
    (node as AutoLayoutMixin).layoutMode !== 'NONE'
  ) {
    layout.padding = [
      (node as AutoLayoutMixin).paddingTop || 0,
      (node as AutoLayoutMixin).paddingRight || 0,
      (node as AutoLayoutMixin).paddingBottom || 0,
      (node as AutoLayoutMixin).paddingLeft || 0,
    ];
    if (typeof (node as AutoLayoutMixin).itemSpacing === 'number') {
      layout.gap = (node as AutoLayoutMixin).itemSpacing;
    }
  }

  const radius = extractRadius(node);

  if (typeof radius === 'number') {
    layout.radius = radius;
  } else if (radius) {
    layout.radius = [
      radius.topLeft,
      radius.topRight,
      radius.bottomRight,
      radius.bottomLeft,
    ];
  }

  return Object.keys(layout).length ? layout : undefined;
}

function extractEffects(node: SceneNode): DSEffect[] | undefined {
  if (!('effects' in node)) return undefined;

  const effects = (node as any).effects;

  if (!effects || effects === figma.mixed || effects.length === 0) return undefined;

  const result: DSEffect[] = [];
  
  for (const e of effects) {
    result.push({
      type: e.type,
      radius: e.radius ?? null,
      color: e.color
        ? `rgba(${Math.round(e.color.r * 255)}, ${Math.round(e.color.g * 255)}, ${Math.round(e.color.b * 255)}, ${e.color.a.toFixed(2)})`
        : undefined,
      offset: e.offset ? { x: e.offset.x, y: e.offset.y } : undefined,
    });
  }
  return result;
}
