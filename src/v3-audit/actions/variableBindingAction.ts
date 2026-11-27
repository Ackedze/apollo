import type { VariableFindingAction } from '../remediation/types';
import { getNodePaintFingerprint } from '../services/styleMetadata';
import type { MutationControl } from './findingAction';
import { bindGradientStop, gradientStopFingerprint, readGradientStopTarget } from './gradientStopBinding';

export type VariableBindingActionResult =
  | { ok: true; node: SceneNode; variableCollectionId: string }
  | { ok: false; message: string };
export type StartTokenImportTiming = () => (outcome: 'success' | 'error') => void;

export async function applyVariableBindingAction(
  action: VariableFindingAction,
  runtimeNode: SceneNode | null = null,
  mutation?:MutationControl,
  confirmBinding = false,
  startTokenImportTiming?: StartTokenImportTiming,
): Promise<VariableBindingActionResult> {
  mutation?.assertCurrent();
  const node = isUsableRuntimeNode(runtimeNode, action.nodeId)
    ? runtimeNode
    : await figma.getNodeByIdAsync(action.nodeId);
  mutation?.assertCurrent();
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
    return { ok: false, message: 'Не удалось найти слой для привязки токена.' };
  }
  const sceneNode = node as SceneNode;
  const styleProperty =
    action.styleField === 'fill' ? 'fillStyleId' : 'strokeStyleId';
  const currentStyleId = action.gradientStop ? null : (sceneNode as any)[styleProperty];
  const normalizedStyleId =
    typeof currentStyleId === 'string' && currentStyleId
      ? currentStyleId
      : null;
  if (!action.gradientStop && normalizedStyleId !== action.expectedStyleId) {
    return {
      ok: false,
      message: 'Стиль изменился после проверки. Запустите проверку ещё раз.',
    };
  }
  const paintProperty = action.styleField === 'fill' ? 'fills' : 'strokes';
  const paints = (action.gradientStop ? null : (sceneNode as any)[paintProperty]) as
    | readonly Paint[]
    | PluginAPI['mixed']
    | null;
  const readTarget = () => action.gradientStop
    ? readGradientStopTarget(sceneNode, action.styleField, action.gradientStop) : null;
  const initialStop = readTarget();
  const fingerprint = action.gradientStop
    ? initialStop && gradientStopFingerprint(initialStop)
    : getNodePaintFingerprint(sceneNode, action.styleField);
  if (fingerprint !== action.expectedFingerprint) {
    return {
      ok: false,
      message: 'Значение изменилось после проверки. Запустите проверку ещё раз.',
    };
  }

  let variable: Variable;
  const finishImport = startTokenImportTiming?.();
  try {
    variable = await figma.variables.importVariableByKeyAsync(
      action.targetVariableKey,
    );
  } catch (error) {
    finishImport?.('error');
    mutation?.assertCurrent();
    console.error('[Apollo] failed to import library variable', {
      targetVariableKey: action.targetVariableKey,
      error,
    });
    return {
      ok: false,
      message: 'Не удалось загрузить библиотечный токен. Проверьте доступ к библиотеке.',
    };
  }
  finishImport?.('success');
  const { textStart, textEnd } = action.gradientStop ?? {};
  if (sceneNode.type === 'TEXT' && textStart !== undefined && textEnd !== undefined) {
    try {
      const fonts = sceneNode.getRangeAllFontNames(textStart, textEnd);
      await Promise.all(fonts.map(font => figma.loadFontAsync(font)));
    } catch {
      mutation?.assertCurrent();
      return { ok: false, message: 'Не удалось загрузить шрифты для привязки токена.' };
    }
  }
  if(mutation?.verifyBeforeWrite)await mutation.verifyBeforeWrite();
  mutation?.assertCurrent();
  if (!isUsableRuntimeNode(sceneNode, action.nodeId)) {
    return { ok: false, message: 'Не удалось найти слой для привязки токена.' };
  }
  const current=action.gradientStop ? null : (sceneNode as any)[styleProperty];
  const target = readTarget();
  const stillMatches = action.gradientStop
    ? target && gradientStopFingerprint(target) === action.expectedFingerprint
    : (typeof current === 'string' && current ? current : null) === action.expectedStyleId &&
      getNodePaintFingerprint(sceneNode, action.styleField) === action.expectedFingerprint;
  if (!stillMatches) {
    return{ok:false,message:'Значение изменилось во время загрузки токена. Запустите проверку ещё раз.'};
  }
  if (variable.resolvedType !== 'COLOR') {
    return { ok: false, message: 'Выбранный токен не является цветовым.' };
  }
  if ((confirmBinding || action.gradientStop) && (variable.key !== action.targetVariableKey || !variable.id)) {
    return { ok: false, message: 'Не удалось подтвердить библиотечный токен.' };
  }
  let confirmedGradient = false;
  try {
    if (action.gradientStop && target) {
      confirmedGradient = bindGradientStop(sceneNode, action.styleField, action.gradientStop, target, variable, mutation?.beforeWrite);
    } else {
      mutation?.beforeWrite();
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
    }
  } catch (error) {
    console.error('[Apollo] failed to bind library variable', {
      nodeId: action.nodeId,
      targetVariableKey: action.targetVariableKey,
      error,
    });
    return { ok: false, message: 'Figma не смогла привязать библиотечный токен.' };
  }
  if (action.gradientStop ? !confirmedGradient : confirmBinding && !hasConfirmedBinding(sceneNode, action.styleField, variable.id)) {
    throw Error('AUDIT_ACTION_UNCONFIRMED');
  }
  return { ok: true, node: sceneNode, variableCollectionId: variable.variableCollectionId };
}

function hasConfirmedBinding(node: SceneNode, field: 'fill' | 'stroke', variableId: string): boolean {
  const matches = (paints: readonly Paint[]) => paints.length > 0 && paints.every(paint =>
    paint.type === 'SOLID' && paint.boundVariables?.color?.id === variableId);
  const hasStyle = (id: unknown) => typeof id === 'string' && id.length > 0;
  if (field === 'stroke') {
    return 'strokes' in node && !hasStyle(node.strokeStyleId) && matches(node.strokes);
  }
  if (!('fills' in node)) return false;
  if (Array.isArray(node.fills) && typeof node.fillStyleId !== 'symbol') return !hasStyle(node.fillStyleId) && matches(node.fills);
  if (node.type !== 'TEXT') return false;
  const segments = node.getStyledTextSegments(['fills', 'fillStyleId']);
  return segments.length > 0 && segments.every(segment => !hasStyle(segment.fillStyleId) && matches(segment.fills));
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
