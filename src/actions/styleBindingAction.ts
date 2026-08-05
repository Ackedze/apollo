import type { StyleFindingAction } from '../remediation/types';
import {
  getNodeTypographyFingerprint,
  getPaintStyleFingerprint,
  getTextStyleTypographyFingerprint,
} from '../services/styleMetadata';

export type StyleBindingActionResult =
  | { ok: true; node: SceneNode }
  | { ok: false; message: string };

export async function applyStyleBindingAction(
  action: StyleFindingAction,
  runtimeNode: SceneNode | null = null,
): Promise<StyleBindingActionResult> {
  const node = isUsableRuntimeNode(runtimeNode, action.nodeId)
    ? runtimeNode
    : await figma.getNodeByIdAsync(action.nodeId);
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
    return { ok: false, message: 'Не удалось найти слой для замены стиля.' };
  }

  const sceneNode = node as SceneNode;
  const currentStyleId = readCurrentStyleId(sceneNode, action.styleField);
  if (currentStyleId !== action.expectedStyleId) {
    return {
      ok: false,
      message: 'Стиль изменился после проверки. Запустите проверку ещё раз.',
    };
  }

  if (
    action.reason === 'exact-style-match' ||
    action.reason === 'exact-typography-match'
  ) {
    const currentFingerprint = readCurrentFingerprint(sceneNode, action);
    if (
      !action.expectedFingerprint ||
      currentFingerprint !== action.expectedFingerprint
    ) {
      return {
        ok: false,
        message: 'Значение стиля изменилось после проверки. Запустите проверку ещё раз.',
      };
    }
  }

  let style: BaseStyle;
  try {
    style = await figma.importStyleByKeyAsync(action.targetStyleKey);
  } catch (error) {
    console.error('[Apollo] failed to import library style', {
      targetStyleKey: action.targetStyleKey,
      error,
    });
    return {
      ok: false,
      message: 'Не удалось загрузить библиотечный стиль. Проверьте доступ к библиотеке.',
    };
  }
  const compatibilityError = validateStyleCompatibility(
    style,
    action.styleField,
  );
  if (compatibilityError) {
    return { ok: false, message: compatibilityError };
  }

  if (
    (action.reason === 'exact-style-match' ||
      action.reason === 'exact-typography-match') &&
    readTargetFingerprint(style, action) !== action.expectedFingerprint
  ) {
    return {
      ok: false,
      message: 'Библиотечный стиль изменился после загрузки каталога. Запустите проверку ещё раз.',
    };
  }

  let mutationPhase = 'apply-style';
  try {
    if (action.styleField === 'fill') {
      await callStyleSetter(sceneNode, 'setFillStyleIdAsync', style.id);
    } else if (action.styleField === 'stroke') {
      await callStyleSetter(sceneNode, 'setStrokeStyleIdAsync', style.id);
    } else if (action.styleField === 'effect') {
      await callStyleSetter(sceneNode, 'setEffectStyleIdAsync', style.id);
    } else {
      if (sceneNode.type !== 'TEXT') {
        return { ok: false, message: 'Текстовый стиль применим только к тексту.' };
      }
      const textNode = sceneNode as TextNode;
      const textStyle = style as TextStyle;
      mutationPhase = 'capture-presentation';
      const presentation = captureTextPresentation(textNode);
      const presentationConflict = findTextPresentationConflict(
        presentation,
        textStyle,
      );
      if (presentationConflict) {
        return { ok: false, message: presentationConflict };
      }
      mutationPhase = 'load-fonts';
      await loadTextFonts(textNode, textStyle.fontName);
      mutationPhase = 'apply-text-style';
      await applyTextStyle(textNode, textStyle.id);
      mutationPhase = 'restore-presentation';
      restoreTextPresentation(textNode, presentation, textStyle);
      mutationPhase = 'verify-text-style';
      if (!isTextStyleApplied(textNode, textStyle.id)) {
        throw new Error('Figma completed the mutation without preserving the target text style');
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[Apollo] failed to bind library style (${mutationPhase}): ${errorMessage}`,
    );
    console.error('[Apollo] failed to bind library style', {
      nodeId: action.nodeId,
      targetStyleKey: action.targetStyleKey,
      styleField: action.styleField,
      phase: mutationPhase,
      message: errorMessage,
      error,
    });
    return { ok: false, message: 'Figma не смогла применить библиотечный стиль.' };
  }

  return { ok: true, node: sceneNode };
}

function readCurrentFingerprint(
  node: SceneNode,
  action: StyleFindingAction,
): string | null {
  if (action.reason === 'exact-typography-match') {
    return node.type === 'TEXT'
      ? getNodeTypographyFingerprint(node as TextNode)
      : null;
  }
  return readCurrentPaintFingerprint(node, action.styleField);
}

function readTargetFingerprint(
  style: BaseStyle,
  action: StyleFindingAction,
): string | null {
  if (action.reason === 'exact-style-match') {
    return style.type === 'PAINT'
      ? getPaintStyleFingerprint((style as PaintStyle).paints)
      : null;
  }
  if (action.reason === 'exact-typography-match') {
    return style.type === 'TEXT'
      ? getTextStyleTypographyFingerprint(style as TextStyle)
      : null;
  }
  return action.expectedFingerprint ?? null;
}

function isUsableRuntimeNode(
  node: SceneNode | null,
  expectedNodeId: string,
): node is SceneNode {
  if (!node || node.id !== expectedNodeId) {
    return false;
  }
  try {
    return (node as SceneNode & { removed?: boolean }).removed !== true;
  } catch (_error) {
    return false;
  }
}

function readCurrentPaintFingerprint(
  node: SceneNode,
  field: StyleFindingAction['styleField'],
): string | null {
  if (field === 'fill') {
    return getPaintStyleFingerprint((node as any).fills);
  }
  if (field === 'stroke') {
    return getPaintStyleFingerprint((node as any).strokes);
  }
  return null;
}

function validateStyleCompatibility(
  style: BaseStyle,
  field: StyleFindingAction['styleField'],
): string | null {
  if ((field === 'fill' || field === 'stroke') && style.type !== 'PAINT') {
    return 'Выбранный стиль несовместим с заливкой или обводкой.';
  }
  if (field === 'effect' && style.type !== 'EFFECT') {
    return 'Выбранный стиль не является стилем эффектов.';
  }
  if (field === 'text' && style.type !== 'TEXT') {
    return 'Выбранный стиль не является текстовым стилем.';
  }
  return null;
}

function readCurrentStyleId(
  node: SceneNode,
  field: StyleFindingAction['styleField'],
): string | null {
  const property =
    field === 'fill'
      ? 'fillStyleId'
      : field === 'stroke'
        ? 'strokeStyleId'
        : field === 'effect'
          ? 'effectStyleId'
          : 'textStyleId';
  const value = (node as any)[property];
  return typeof value === 'string' && value ? value : null;
}

async function callStyleSetter(
  node: SceneNode,
  method: 'setFillStyleIdAsync' | 'setStrokeStyleIdAsync' | 'setEffectStyleIdAsync',
  styleId: string,
): Promise<void> {
  const setter = (node as any)[method];
  if (typeof setter !== 'function') {
    throw new Error(`Node does not support ${method}`);
  }
  await setter.call(node, styleId);
}

type TextPresentationSegment = {
  start: number;
  end: number;
  textCase: TextCase | null;
  textDecoration: TextDecoration | null;
};

type TextPresentationSnapshot = {
  segments: TextPresentationSegment[];
};

function captureTextPresentation(node: TextNode): TextPresentationSnapshot {
  const segments = node.getStyledTextSegments([
    'textCase',
    'textDecoration',
  ]);
  return {
    segments: segments.map((segment) => ({
      start: segment.start,
      end: segment.end,
      textCase: segment.textCase === 'ORIGINAL' ? null : segment.textCase,
      textDecoration:
        segment.textDecoration === 'NONE' ? null : segment.textDecoration,
    })),
  };
}

function restoreTextPresentation(
  node: TextNode,
  snapshot: TextPresentationSnapshot,
  targetStyle: TextStyle,
): void {
  for (const segment of snapshot.segments) {
    if (segment.start >= segment.end) continue;
    if (segment.textCase && segment.textCase !== targetStyle.textCase) {
      applyTextCaseOverride(node, segment);
    }
    if (
      segment.textDecoration &&
      segment.textDecoration !== targetStyle.textDecoration
    ) {
      applyTextDecorationOverride(node, segment);
    }
  }
}

function findTextPresentationConflict(
  snapshot: TextPresentationSnapshot,
  targetStyle: TextStyle,
): string | null {
  const incompatibleTextCase = snapshot.segments.some(
    (segment) =>
      segment.textCase !== null && segment.textCase !== targetStyle.textCase,
  );
  return incompatibleTextCase
    ? 'Целевой стиль использует другой регистр текста. Figma не позволяет сохранить отдельный capslock и одновременно оставить text style привязанным.'
    : null;
}

function applyTextCaseOverride(
  node: TextNode,
  segment: TextPresentationSegment,
): void {
  try {
    node.setRangeTextCase(segment.start, segment.end, segment.textCase!);
  } catch (rangeError) {
    if (segment.start !== 0 || segment.end !== node.characters.length) {
      throw rangeError;
    }
    node.textCase = segment.textCase!;
  }
}

function applyTextDecorationOverride(
  node: TextNode,
  segment: TextPresentationSegment,
): void {
  try {
    node.setRangeTextDecoration(
      segment.start,
      segment.end,
      segment.textDecoration!,
    );
  } catch (rangeError) {
    if (segment.start !== 0 || segment.end !== node.characters.length) {
      throw rangeError;
    }
    node.textDecoration = segment.textDecoration!;
  }
}

async function applyTextStyle(node: TextNode, styleId: string): Promise<void> {
  let nodeError: unknown = null;
  try {
    await node.setTextStyleIdAsync(styleId);
    if (isTextStyleApplied(node, styleId)) return;
    nodeError = new Error('whole-node API completed without applying the style');
  } catch (error) {
    nodeError = error;
  }

  if (node.characters.length === 0) {
    throw nodeError;
  }

  try {
    await node.setRangeTextStyleIdAsync(0, node.characters.length, styleId);
    if (isTextStyleApplied(node, styleId)) return;
    throw new Error('range API completed without applying the style');
  } catch (rangeError) {
    throw new Error(
      `whole-node API: ${formatMutationError(nodeError)}; range API: ${formatMutationError(rangeError)}`,
    );
  }
}

function isTextStyleApplied(node: TextNode, styleId: string): boolean {
  if (node.textStyleId === styleId) return true;
  if (
    node.characters.length === 0 ||
    typeof node.getRangeTextStyleId !== 'function'
  ) {
    return false;
  }
  return node.getRangeTextStyleId(0, node.characters.length) === styleId;
}

function formatMutationError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadTextFonts(
  node: TextNode,
  targetFont: FontName | null = null,
): Promise<void> {
  const names = Array.from(
    node.getRangeAllFontNames(0, node.characters.length),
  );
  const seen = new Set<string>();
  if (targetFont) names.push(targetFont);
  for (const fontName of names) {
    const key = `${fontName.family}:${fontName.style}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await figma.loadFontAsync(fontName);
  }
}
