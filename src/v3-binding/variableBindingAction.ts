import { type BindingLifecycle, idleLifecycle, BindingControlError, preserveControlErrors } from "./lifecycle";
import type { VariableFindingAction } from './types';
import { getNodePaintFingerprint } from "./styleMetadata";

export type VariableBindingActionResult =
  | { ok: true; node: SceneNode }
  | { ok: false; message: string };

export async function applyVariableBindingAction(
  action: VariableFindingAction,
  runtimeNode: SceneNode | null = null,
  lifecycle: BindingLifecycle = idleLifecycle,
): Promise<VariableBindingActionResult> {
  lifecycle = preserveControlErrors(lifecycle);
  lifecycle.guard();
  const node = isUsableRuntimeNode(runtimeNode, action.nodeId)
    ? runtimeNode
    : await figma.getNodeByIdAsync(action.nodeId);
  lifecycle.guard();
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
    return { ok: false, message: 'Не удалось найти слой для привязки токена.' };
  }
  const sceneNode = node as SceneNode;
  const styleProperty =
    action.styleField === 'fill' ? 'fillStyleId' : 'strokeStyleId';
  const currentStyleId = (sceneNode as any)[styleProperty];
  const normalizedStyleId =
    typeof currentStyleId === 'string' && currentStyleId
      ? currentStyleId
      : null;
  if (normalizedStyleId !== action.expectedStyleId) {
    return {
      ok: false,
      message: 'Стиль изменился после проверки. Запустите проверку ещё раз.',
    };
  }
  const paintProperty = action.styleField === 'fill' ? 'fills' : 'strokes';
  const paints = (sceneNode as any)[paintProperty] as
    | readonly Paint[]
    | PluginAPI['mixed'];
  if (
    getNodePaintFingerprint(sceneNode, action.styleField) !==
    action.expectedFingerprint
  ) {
    return {
      ok: false,
      message: 'Значение изменилось после проверки. Запустите проверку ещё раз.',
    };
  }

  let variable: Variable;
  try {
    variable = await figma.variables.importVariableByKeyAsync(
      action.targetVariableKey,
    );
  } catch (error) {
    console.error('[Apollo] failed to import library variable', {
      targetVariableKey: action.targetVariableKey,
      error,
    });
    return {
      ok: false,
      message: 'Не удалось загрузить библиотечный токен. Проверьте доступ к библиотеке.',
    };
  }
  lifecycle.guard();
  if (variable.key !== action.targetVariableKey) return { ok: false, message: 'Ключ загруженного токена не совпадает с выбранным.' };
  if (variable.resolvedType !== 'COLOR') {
    return { ok: false, message: 'Выбранный токен не является цветовым.' };
  }
  try {
    await lifecycle.beforeWrite(); lifecycle.guard();
    if (getNodePaintFingerprint(sceneNode, action.styleField) !== action.expectedFingerprint || (typeof (sceneNode as any)[styleProperty] === 'string' ? (sceneNode as any)[styleProperty] || null : null) !== action.expectedStyleId) return { ok: false, message: 'Слой изменился во время загрузки токена. Повторите проверку.' };
    if (Array.isArray(paints) && paints.length) {
      lifecycle.onWritten();
      (sceneNode as any)[paintProperty] = bindPaints(paints, variable);
    } else if (
      action.styleField === 'fill' &&
      sceneNode.type === 'TEXT' &&
      typeof (sceneNode as TextNode).getStyledTextSegments === 'function'
    ) {
      const textNode = sceneNode as TextNode;
      for (const segment of textNode.getStyledTextSegments(['fills'])) {
        lifecycle.guard(); lifecycle.onWritten();
        textNode.setRangeFills(
          segment.start,
          segment.end,
          bindPaints(segment.fills, variable),
        );
      }
    } else {
      return { ok: false, message: 'Слой не содержит однозначной заливки.' };
    }
  } catch (error) {
    if (error instanceof BindingControlError) throw error;
    console.error('[Apollo] failed to bind library variable', {
      nodeId: action.nodeId,
      targetVariableKey: action.targetVariableKey,
      error,
    });
    return { ok: false, message: 'Figma не смогла привязать библиотечный токен.' };
  }
  return { ok: true, node: sceneNode };
}

function bindPaints(
  paints: readonly Paint[],
  variable: Variable,
): Paint[] {
  return paints.map((paint) => {
    if (paint.type !== 'SOLID') {
      throw new Error('Only solid paints can receive a color variable');
    }
    // The matched variable already contains the paint alpha. Resetting the
    // detached paint opacity prevents the same transparency being applied twice.
    return figma.variables.setBoundVariableForPaint(
      Object.assign({}, paint, { opacity: 1 }),
      'color',
      variable,
    );
  });
}

function isUsableRuntimeNode(
  node: SceneNode | null,
  expectedNodeId: string,
): node is SceneNode {
  if (!node || node.id !== expectedNodeId) return false;
  try {
    return (node as SceneNode & { removed?: boolean }).removed !== true;
  } catch (_error) {
    return false;
  }
}
