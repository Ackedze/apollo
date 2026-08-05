/// <reference types="@figma/plugin-typings" />

import { setNodeStrokeAlignment } from '../structure/strokeAlignment';
import {
  setNodeLayoutSizing,
  type LayoutSizingAxis,
} from '../structure/layoutSizing';
import type { DSStructureNode } from '../types/structures';
import { extractAliasKey } from '../utils/nodeHelpers';
import { getVariableBindingResetField } from '../utils/variableBindingReset';
import { extractStyleKey, normalizeStyleId } from '../services/styleMetadata';

export interface ResetVariableMetadata {
  variableId?: string | null;
  variableKey?: string | null;
}

export interface CustomizationResetMutationDependencies {
  resolveVariableMetadata(tokenId: string): ResetVariableMetadata | null;
  getSceneNodeById(nodeId: string): Promise<SceneNode | null>;
}

export interface CustomizationResetReferenceValue {
  value?: string | number | null;
  resourceType?: 'style' | 'token' | 'color';
  resourceId?: string | null;
  displayName?: string | null;
}

export interface CustomizationResetDetail {
  property?: string;
  reference?: CustomizationResetReferenceValue;
  message?: string;
}

export function createCustomizationResetMutations(
  dependencies: CustomizationResetMutationDependencies
) {
  async function applyReferenceResetByMessages(
    node: SceneNode,
    referenceNode: DSStructureNode,
    messages: string[]
  ) {
    const uniqueMessages = Array.from(new Set(messages));

    for (const message of uniqueMessages) {
      const trimmed = message.trim();
      const paddingMatch = trimmed.match(
        /^(?:Token )?padding (top|right|bottom|left):/i
      );

      if (
        trimmed.startsWith('Паддинг ') ||
        trimmed.startsWith('Переменная padding ') ||
        paddingMatch
      ) {
        const side = extractPaddingSide(trimmed);
        if (side) {
          await resetPaddingSide(node, referenceNode, side);
        }
        continue;
      }

      if (
        trimmed.startsWith('Отступ между элементами') ||
        trimmed.startsWith('Переменная itemSpacing:') ||
        trimmed.startsWith('Token itemSpacing:')
      ) {
        await resetItemSpacing(node, referenceNode);
        continue;
      }

      if (trimmed.startsWith('Ширина в auto-layout:')) {
        resetLayoutSizing(node, referenceNode, 'horizontal');
        continue;
      }

      if (trimmed.startsWith('Высота в auto-layout:')) {
        resetLayoutSizing(node, referenceNode, 'vertical');
        continue;
      }

      if (trimmed.startsWith('Стиль заливка:')) {
        await resetStyle(node, referenceNode, 'fill');
        continue;
      }

      if (trimmed.startsWith('Стиль обводка:')) {
        await resetStyle(node, referenceNode, 'stroke');
        continue;
      }

      if (trimmed.startsWith('Стиль текст:')) {
        await resetStyle(node, referenceNode, 'text');
        continue;
      }

      if (
        trimmed.startsWith('заливка:') ||
        trimmed.startsWith('Переменная заливки:')
      ) {
        await resetPaint(node, referenceNode, 'fill');
        continue;
      }

      if (
        trimmed.startsWith('обводка:') ||
        trimmed.startsWith('Переменная обводки:')
      ) {
        await resetPaint(node, referenceNode, 'stroke');
        continue;
      }

      if (trimmed.startsWith('Толщина обводки:')) {
        resetStrokeWeight(node, referenceNode);
        continue;
      }

      if (trimmed.startsWith('Положение обводки:')) {
        resetStrokeAlign(node, referenceNode);
        continue;
      }

      if (
        trimmed.startsWith('Token radius:') ||
        trimmed.startsWith('Скругления') ||
        trimmed.startsWith('Переменная скругления:')
      ) {
        await resetRadius(node, referenceNode);
        continue;
      }

      if (
        trimmed.startsWith('Token opacity:') ||
        trimmed.startsWith('Прозрачность') ||
        trimmed.startsWith('Переменная opacity:')
      ) {
        await resetOpacity(node, referenceNode);
      }
    }
  }

  async function applyReferenceResetByDetails(
    node: SceneNode,
    details: CustomizationResetDetail[]
  ) {
    for (const detail of details) {
      const property = detail.property;
      const reference = detail.reference;
      if (!property || !reference) {
        continue;
      }

      if (property === 'fill' || property === 'stroke') {
        await resetPaintByDiffReference(node, property, reference);
        continue;
      }

      if (property === 'styles.fill') {
        await resetStyleById(node, 'fill', reference.resourceId ?? null);
        continue;
      }

      if (property === 'styles.stroke') {
        await resetStyleById(node, 'stroke', reference.resourceId ?? null);
        continue;
      }

      if (property === 'styles.text') {
        await resetStyleById(node, 'text', reference.resourceId ?? null);
        continue;
      }

      const variableBindingField = getVariableBindingResetField(property);
      if (
        variableBindingField &&
        reference.resourceType === 'token' &&
        reference.resourceId
      ) {
        const rebound = await bindNodeVariable(
          node,
          variableBindingField,
          reference.resourceId
        );
        if (!rebound) {
          throw new Error(
            `Apollo failed to restore ${variableBindingField} variable binding`
          );
        }
        continue;
      }

      const paddingSide = property.match(
        /^layout\.padding\.(top|right|bottom|left)$/
      )?.[1] as 'top' | 'right' | 'bottom' | 'left' | undefined;
      if (paddingSide && typeof reference.value === 'number') {
        if (reference.resourceType === 'token' && reference.resourceId) {
          const paddingFieldMap = {
            top: 'paddingTop',
            right: 'paddingRight',
            bottom: 'paddingBottom',
            left: 'paddingLeft',
          };
          const rebound = await bindNodeVariable(
            node,
            paddingFieldMap[paddingSide],
            reference.resourceId
          );
          if (!rebound) {
            throw new Error(
              `Apollo failed to restore ${paddingFieldMap[paddingSide]} variable binding`
            );
          }
          continue;
        }
        setLayoutPaddingSide(node, paddingSide, reference.value);
        continue;
      }

      if (
        property === 'layout.itemSpacing' &&
        typeof reference.value === 'number'
      ) {
        if (reference.resourceType === 'token' && reference.resourceId) {
          const rebound = await bindNodeVariable(
            node,
            'itemSpacing',
            reference.resourceId
          );
          if (!rebound) {
            throw new Error(
              'Apollo failed to restore itemSpacing variable binding'
            );
          }
          continue;
        }
        setLayoutItemSpacing(node, reference.value);
        continue;
      }

      if (
        property === 'layout.sizing.horizontal' &&
        typeof reference.value === 'string'
      ) {
        setNodeLayoutSizing(node, 'horizontal', reference.value);
        continue;
      }

      if (
        property === 'layout.sizing.vertical' &&
        typeof reference.value === 'string'
      ) {
        setNodeLayoutSizing(node, 'vertical', reference.value);
        continue;
      }

      if (property === 'stroke.align' && typeof reference.value === 'string') {
        setNodeStrokeAlignment(node, reference.value);
        continue;
      }

      if (property === 'radius') {
        if (reference.resourceType === 'token' && reference.resourceId) {
          const rebound = await bindNodeVariable(
            node,
            'cornerRadius',
            reference.resourceId
          );
          if (!rebound) {
            throw new Error(
              'Apollo failed to restore cornerRadius variable binding'
            );
          }
          continue;
        }
        await setRadiusFromValue(node, reference.value);
        continue;
      }

      if (
        property === 'opacity' &&
        typeof reference.value === 'number' &&
        'opacity' in node
      ) {
        if (reference.resourceType === 'token' && reference.resourceId) {
          const rebound = await bindNodeVariable(
            node,
            'opacity',
            reference.resourceId
          );
          if (!rebound) {
            throw new Error(
              'Apollo failed to restore opacity variable binding'
            );
          }
          continue;
        }
        (node as SceneNode & { opacity: number }).opacity = reference.value;
      }
    }
  }

  function extractPaddingSide(
    message: string
  ): 'top' | 'right' | 'bottom' | 'left' | null {
    const match = message.match(/(top|right|bottom|left)/i);
    if (!match) return null;
    const side = match[1].toLowerCase();
    if (
      side === 'top' ||
      side === 'right' ||
      side === 'bottom' ||
      side === 'left'
    ) {
      return side;
    }
    return null;
  }

  async function resetPaddingSide(
    node: SceneNode,
    referenceNode: DSStructureNode,
    side: 'top' | 'right' | 'bottom' | 'left'
  ) {
    if (
      !('layoutMode' in node) ||
      (node as AutoLayoutMixin).layoutMode === 'NONE'
    ) {
      return;
    }

    const layout = referenceNode.layout;
    const padding = layout?.padding;
    if (!padding) {
      return;
    }

    const fieldMap = {
      top: 'paddingTop',
      right: 'paddingRight',
      bottom: 'paddingBottom',
      left: 'paddingLeft',
    } as const;
    const field = fieldMap[side];
    const value = padding[side] ?? 0;
    (node as any)[field] = value;

    await bindNodeVariable(node, field, layout?.paddingTokens?.[side] ?? null);
  }

  async function resetItemSpacing(
    node: SceneNode,
    referenceNode: DSStructureNode
  ) {
    if (
      !('layoutMode' in node) ||
      (node as AutoLayoutMixin).layoutMode === 'NONE'
    ) {
      return;
    }
    const value = referenceNode.layout?.itemSpacing ?? 0;
    (node as any).itemSpacing = value;
    await bindNodeVariable(
      node,
      'itemSpacing',
      referenceNode.layout?.itemSpacingToken ?? null
    );
  }

  function setLayoutPaddingSide(
    node: SceneNode,
    side: 'top' | 'right' | 'bottom' | 'left',
    value: number
  ) {
    if (
      !('layoutMode' in node) ||
      (node as AutoLayoutMixin).layoutMode === 'NONE'
    ) {
      return;
    }
    const fieldMap = {
      top: 'paddingTop',
      right: 'paddingRight',
      bottom: 'paddingBottom',
      left: 'paddingLeft',
    } as const;
    (node as any)[fieldMap[side]] = value;
  }

  function setLayoutItemSpacing(node: SceneNode, value: number) {
    if (
      !('layoutMode' in node) ||
      (node as AutoLayoutMixin).layoutMode === 'NONE'
    ) {
      return;
    }
    (node as any).itemSpacing = value;
  }

  function resetLayoutSizing(
    node: SceneNode,
    referenceNode: DSStructureNode,
    axis: LayoutSizingAxis
  ) {
    setNodeLayoutSizing(
      node,
      axis,
      referenceNode.layout?.sizing?.[axis] ?? null
    );
  }

  async function resetStyleById(
    node: SceneNode,
    target: 'fill' | 'stroke' | 'text',
    styleKey: string | null
  ) {
    if (target === 'text') {
      if (node.type !== 'TEXT') return;
      const style = styleKey ? await importStyleById(styleKey) : null;
      await (node as TextNode).setTextStyleIdAsync(style?.id ?? '');
      return;
    }

    const mutableNode = node as any;
    const style = styleKey ? await importStyleById(styleKey) : null;
    const styleId = style?.id ?? '';

    if (target === 'fill') {
      if (typeof mutableNode.setFillStyleIdAsync === 'function') {
        await mutableNode.setFillStyleIdAsync(styleId);
      }
      return;
    }

    if (typeof mutableNode.setStrokeStyleIdAsync === 'function') {
      await mutableNode.setStrokeStyleIdAsync(styleId);
    }
  }

  async function resetStyle(
    node: SceneNode,
    referenceNode: DSStructureNode,
    target: 'fill' | 'stroke' | 'text'
  ) {
    const styleKey =
      target === 'text'
        ? referenceNode.styles?.text?.styleKey
        : target === 'fill'
        ? referenceNode.styles?.fill?.styleKey
        : referenceNode.styles?.stroke?.styleKey;

    await resetStyleById(node, target, styleKey ?? null);
  }

  async function resetPaintByDiffReference(
    node: SceneNode,
    target: 'fill' | 'stroke',
    reference: {
      value?: string | number | null;
      resourceType?: 'style' | 'token' | 'color';
      resourceId?: string | null;
    }
  ) {
    const resourceId =
      typeof reference.resourceId === 'string' && reference.resourceId.length
        ? reference.resourceId
        : null;

    if (reference.resourceType === 'style') {
      await resetStyleById(node, target, resourceId);
      return;
    }

    const prop = target === 'fill' ? 'fills' : 'strokes';
    if (!(prop in (node as any))) {
      return;
    }

    const mutableNode = node as any;
    if (
      target === 'fill' &&
      typeof mutableNode.setFillStyleIdAsync === 'function'
    ) {
      await mutableNode.setFillStyleIdAsync('');
    } else if (
      target === 'stroke' &&
      typeof mutableNode.setStrokeStyleIdAsync === 'function'
    ) {
      await mutableNode.setStrokeStyleIdAsync('');
    }

    const token =
      reference.resourceType === 'token'
        ? resourceId ??
          (typeof reference.value === 'string' ? reference.value : null)
        : null;
    const color =
      reference.resourceType === 'color' && typeof reference.value === 'string'
        ? reference.value
        : null;
    const paint = await buildSolidPaintFromReference({ token, color });

    if (!paint) {
      return;
    }

    mutableNode[prop] = [paint];

    if (target === 'stroke') {
      const weight =
        typeof (mutableNode as { strokeWeight?: unknown }).strokeWeight ===
        'number'
          ? (mutableNode as { strokeWeight: number }).strokeWeight
          : 1;
      mutableNode.strokeWeight = weight;
    }
  }

  async function resetPaint(
    node: SceneNode,
    referenceNode: DSStructureNode,
    target: 'fill' | 'stroke'
  ) {
    const styleKey =
      target === 'fill'
        ? referenceNode.styles?.fill?.styleKey
        : referenceNode.styles?.stroke?.styleKey;
    if (styleKey) {
      await resetStyle(node, referenceNode, target);
      if (target === 'stroke') {
        resetStrokeWeight(node, referenceNode);
      }
      return;
    }

    const prop = target === 'fill' ? 'fills' : 'strokes';
    if (!(prop in (node as any))) {
      return;
    }

    const mutableNode = node as any;
    if (
      target === 'fill' &&
      typeof mutableNode.setFillStyleIdAsync === 'function'
    ) {
      await mutableNode.setFillStyleIdAsync('');
    } else if (
      target === 'stroke' &&
      typeof mutableNode.setStrokeStyleIdAsync === 'function'
    ) {
      await mutableNode.setStrokeStyleIdAsync('');
    }

    const referencePaint =
      target === 'fill' ? referenceNode.fill : referenceNode.stroke;

    if (!referencePaint) {
      mutableNode[prop] = [];
      if (target === 'stroke' && 'strokeWeight' in mutableNode) {
        mutableNode.strokeWeight = 0;
      }
      return;
    }

    const paint = await buildSolidPaintFromReference(referencePaint);
    if (!paint) {
      return;
    }

    mutableNode[prop] = [paint];

    if (target === 'stroke') {
      resetStrokeWeight(node, referenceNode);
    }
  }

  function resetStrokeWeight(node: SceneNode, referenceNode: DSStructureNode) {
    if (!('strokeWeight' in (node as any))) {
      return;
    }
    const weight = referenceNode.stroke?.weight;
    (node as any).strokeWeight = typeof weight === 'number' ? weight : 0;
  }

  function resetStrokeAlign(node: SceneNode, referenceNode: DSStructureNode) {
    setNodeStrokeAlignment(node, referenceNode.stroke?.align ?? null);
  }

  async function resetRadius(node: SceneNode, referenceNode: DSStructureNode) {
    await bindNodeVariable(
      node,
      'cornerRadius',
      referenceNode.radiusToken ?? null
    );

    const radius = referenceNode.radius;
    if (radius === null || !('cornerRadius' in (node as any))) {
      return;
    }

    if (typeof radius === 'number') {
      (node as any).cornerRadius = radius;
      return;
    }

    const mutableNode = node as any;
    if (
      'topLeftRadius' in mutableNode &&
      'topRightRadius' in mutableNode &&
      'bottomRightRadius' in mutableNode &&
      'bottomLeftRadius' in mutableNode
    ) {
      mutableNode.topLeftRadius = radius.topLeft;
      mutableNode.topRightRadius = radius.topRight;
      mutableNode.bottomRightRadius = radius.bottomRight;
      mutableNode.bottomLeftRadius = radius.bottomLeft;
    }
  }

  async function setRadiusFromValue(
    node: SceneNode,
    value: string | number | null | undefined
  ) {
    if (!('cornerRadius' in (node as any))) {
      return;
    }
    const numericValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN;
    if (!Number.isFinite(numericValue)) {
      return;
    }
    await bindNodeVariable(node, 'cornerRadius', null);
    (node as any).cornerRadius = numericValue;
  }

  async function resetOpacity(node: SceneNode, referenceNode: DSStructureNode) {
    if (!('opacity' in (node as any))) {
      return;
    }

    const opacity =
      typeof referenceNode.opacity === 'number' ? referenceNode.opacity : 1;
    (node as any).opacity = opacity;
    await bindNodeVariable(node, 'opacity', referenceNode.opacityToken ?? null);
  }

  async function bindNodeVariable(
    node: SceneNode,
    field: string,
    tokenId: string | null
  ): Promise<boolean> {
    const bindingNode = await resolveBindableNode(node);
    if (!bindingNode) {
      console.warn('[Apollo] skip variable binding for missing node', {
        nodeId: node.id,
        field,
        tokenId,
      });
      return false;
    }

    const mutableNode = bindingNode as any;
    if (typeof mutableNode.setBoundVariable !== 'function') {
      return false;
    }
    const variable = tokenId ? await importVariableByToken(tokenId) : null;
    if (tokenId && !variable) {
      console.warn('[Apollo] skip unresolved variable binding', {
        nodeId: bindingNode.id,
        field,
        tokenId,
      });
      return false;
    }
    try {
      mutableNode.setBoundVariable(field, variable);
      return true;
    } catch (error) {
      if (isMissingNodeMutationError(error)) {
        console.warn('[Apollo] skip variable binding for stale node', {
          nodeId: bindingNode.id,
          field,
          tokenId,
          error,
        });
        return false;
      }
      throw error;
    }
  }

  async function resolveBindableNode(
    node: SceneNode
  ): Promise<SceneNode | null> {
    if (isRemovedNode(node)) {
      return null;
    }

    try {
      const freshNode = await dependencies.getSceneNodeById(node.id);
      return freshNode && !isRemovedNode(freshNode) ? freshNode : null;
    } catch (error) {
      console.warn('[Apollo] failed to refresh node before variable binding', {
        nodeId: node.id,
        error,
      });
      return null;
    }
  }

  function isRemovedNode(node: SceneNode): boolean {
    return (node as any).removed === true;
  }

  function isMissingNodeMutationError(error: unknown): boolean {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: string }).message)
        : String(error ?? '');
    return /does not exist|not found|removed/i.test(message);
  }

  async function importVariableByToken(
    tokenId: string
  ): Promise<Variable | null> {
    const aliasKey = extractAliasKey(tokenId);
    const metadata = dependencies.resolveVariableMetadata(tokenId);
    const candidateIds = [tokenId, metadata?.variableId ?? null];
    for (const candidateId of candidateIds) {
      if (!candidateId) continue;
      try {
        const localVariable = await figma.variables.getVariableByIdAsync(
          candidateId
        );
        if (localVariable) {
          return localVariable;
        }
      } catch (_error) {
        // The value may be a published key or semantic catalog token.
      }
    }

    const candidateKeys = [metadata?.variableKey ?? null, aliasKey].filter(
      (key): key is string => Boolean(key)
    );
    for (const key of Array.from(new Set(candidateKeys))) {
      try {
        return await figma.variables.importVariableByKeyAsync(key);
      } catch (error) {
        console.warn('[Apollo] failed to import variable by key', {
          tokenId,
          key,
          error,
        });
      }
    }
    return null;
  }

  async function importStyleById(styleId: string): Promise<BaseStyle | null> {
    const normalized = normalizeStyleId(styleId);
    if (!normalized) {
      return null;
    }

    const directKey = extractStyleKey(normalized) ?? normalized;
    try {
      return await figma.importStyleByKeyAsync(directKey);
    } catch (error) {
      console.warn('[Apollo] failed to import style by key', {
        styleId: normalized,
        key: directKey,
        error,
      });
      return null;
    }
  }

  async function buildSolidPaintFromReference(referencePaint: {
    color?: string | null;
    token?: string | null;
  }): Promise<SolidPaint | null> {
    const color = referencePaint.color
      ? parseRgbaToColor(referencePaint.color)
      : null;
    const variable = referencePaint.token
      ? await importVariableByToken(referencePaint.token)
      : null;

    const basePaint: SolidPaint = {
      type: 'SOLID',
      visible: true,
      opacity: color?.opacity ?? 1,
      color: color?.rgb ?? colorFromVariable(variable) ?? { r: 0, g: 0, b: 0 },
    };

    if (!variable) {
      return basePaint;
    }

    try {
      return figma.variables.setBoundVariableForPaint(
        basePaint,
        'color',
        variable
      );
    } catch (error) {
      console.warn('[Apollo] failed to bind variable for paint', {
        token: referencePaint.token,
        error,
      });
      return basePaint;
    }
  }

  function parseRgbaToColor(
    value: string
  ): { rgb: RGB; opacity: number } | null {
    const compact = value.replace(/\s+/g, '');
    const match = compact.match(
      /^rgba\(([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+)\)$/i
    );
    if (!match) {
      return null;
    }

    const [, rawR, rawG, rawB, rawA] = match;
    const r = Number.parseFloat(rawR) / 255;
    const g = Number.parseFloat(rawG) / 255;
    const b = Number.parseFloat(rawB) / 255;
    const opacity = Number.parseFloat(rawA);

    if (
      !Number.isFinite(r) ||
      !Number.isFinite(g) ||
      !Number.isFinite(b) ||
      !Number.isFinite(opacity)
    ) {
      return null;
    }

    return {
      rgb: {
        r: Math.max(0, Math.min(1, r)),
        g: Math.max(0, Math.min(1, g)),
        b: Math.max(0, Math.min(1, b)),
      },
      opacity: Math.max(0, Math.min(1, opacity)),
    };
  }

  function colorFromVariable(variable: Variable | null): RGB | null {
    if (!variable || variable.resolvedType !== 'COLOR') {
      return null;
    }

    const values = Object.values(variable.valuesByMode ?? {});
    const firstValue = values[0];
    if (!firstValue || typeof firstValue !== 'object') {
      return null;
    }

    const color = firstValue as RGBA;
    if (
      typeof color.r !== 'number' ||
      typeof color.g !== 'number' ||
      typeof color.b !== 'number'
    ) {
      return null;
    }

    return { r: color.r, g: color.g, b: color.b };
  }

  return {
    applyReferenceResetByDetails,
    applyReferenceResetByMessages,
  };
}

export type CustomizationResetMutations = ReturnType<
  typeof createCustomizationResetMutations
>;
