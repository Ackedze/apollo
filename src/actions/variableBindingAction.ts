import type { VariableFindingAction } from '../remediation/types';
import { getNodePaintFingerprint } from '../services/styleMetadata';

export type VariableBindingActionResult =
  | { ok: true; node: SceneNode }
  | { ok: false; message: string };

export async function applyVariableBindingAction(
  action: VariableFindingAction,
  runtimeNode: SceneNode | null = null,
): Promise<VariableBindingActionResult> {
  const node = isUsableRuntimeNode(runtimeNode, action.nodeId)
    ? runtimeNode
    : await figma.getNodeByIdAsync(action.nodeId);
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
  if (variable.resolvedType !== 'COLOR') {
    return { ok: false, message: 'Выбранный токен не является цветовым.' };
  }
  try {
    if (Array.isArray(paints) && paints.length) {
      (sceneNode as any)[paintProperty] = bindPaints(paints, variable);
    } else if (
      action.styleField === 'fill' &&
      sceneNode.type === 'TEXT' &&
      typeof (sceneNode as TextNode).getStyledTextSegments === 'function'
    ) {
      const textNode = sceneNode as TextNode;
      for (const segment of textNode.getStyledTextSegments(['fills'])) {
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
