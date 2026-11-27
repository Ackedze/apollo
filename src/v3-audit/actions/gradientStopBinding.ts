import type { GradientStopLocation } from '../types/audit';

type PaintField = 'fill' | 'stroke';
type GradientStopTarget = {
  paints: readonly Paint[];
  paint: GradientPaint;
  stop: ColorStop;
  write(paints: Paint[]): void;
};

export function readGradientStopTarget(
  node: SceneNode, field: PaintField, location: GradientStopLocation,
): GradientStopTarget | null {
  if (!Number.isSafeInteger(location.paintIndex) || location.paintIndex < 0 ||
    location.stopIndex === null || !Number.isSafeInteger(location.stopIndex) || location.stopIndex < 0 ||
    location.position === null || !Number.isFinite(location.position) || location.position < 0 || location.position > 1) return null;
  let paints: readonly Paint[] | PluginAPI['mixed'];
  let write: (value: Paint[]) => void;
  const {textStart, textEnd} = location;
  if (textStart !== undefined || textEnd !== undefined) {
    if (field !== 'fill' || node.type !== 'TEXT' || textStart === undefined ||
      textEnd === undefined || textStart < 0 || textEnd <= textStart || textEnd > node.characters.length ||
      typeof node.getRangeFillStyleId !== 'function' || typeof node.getRangeFills !== 'function' ||
      typeof node.setRangeFills !== 'function' || node.getRangeFillStyleId(textStart, textEnd)) return null;
    paints = node.getRangeFills(textStart, textEnd);
    write = value => node.setRangeFills(textStart, textEnd, value);
  } else if (field === 'fill') {
    if (!('fills' in node) || node.fillStyleId) return null;
    paints = node.fills;
    write = value => { node.fills = value; };
  } else {
    if (!('strokes' in node) || node.strokeStyleId) return null;
    paints = node.strokes;
    write = value => { node.strokes = value; };
  }

  if (!Array.isArray(paints)) return null;
  const paint = paints[location.paintIndex] as Paint | undefined;
  if (!paint || paint.visible === false || !('gradientStops' in paint) || !Array.isArray(paint.gradientStops)) return null;
  const stop = paint.gradientStops[location.stopIndex];
  if (!stop || stop.position !== location.position ||
    ![stop.color?.r, stop.color?.g, stop.color?.b, stop.color?.a].every(value =>
      Number.isFinite(value) && value! >= 0 && value! <= 1)) return null;
  return { paints, paint, stop, write };
}

export function gradientStopFingerprint(target: GradientStopTarget): string {
  const { paint, stop } = target;
  // Other stops can receive bindings from the same report. Their positions still identify the gradient.
  return stablePaintJson([paint.type, paint.gradientTransform, paint.opacity, paint.blendMode,
    paint.gradientStops.map(item => item.position), stop]);
}

export function bindGradientStop(
  node: SceneNode, field: PaintField, location: GradientStopLocation, target: GradientStopTarget,
  variable: Variable, beforeWrite?: () => void,
): boolean {
  const alias = figma.variables.createVariableAlias(variable);
  if (alias.type !== 'VARIABLE_ALIAS' || alias.id !== variable.id) return false;

  const retained = otherPaintDetails(target, location);
  const stops = target.paint.gradientStops.slice();
  stops[location.stopIndex!] = Object.assign({}, target.stop, {
    boundVariables: Object.assign({}, target.stop.boundVariables, { color: alias }),
  });
  const paints = target.paints.slice();
  paints[location.paintIndex] = Object.assign({}, target.paint, { gradientStops: stops });
  beforeWrite?.();
  target.write(paints);

  const applied = readGradientStopTarget(node, field, location);
  const confirmed = applied?.stop.boundVariables?.color;
  return Boolean(applied && confirmed?.type === 'VARIABLE_ALIAS' && confirmed.id === variable.id &&
    otherPaintDetails(applied, location) === retained);
}

function otherPaintDetails(target: GradientStopTarget, location: GradientStopLocation): string {
  return stablePaintJson(target.paints.map((paint, paintIndex) => paintIndex === location.paintIndex
    ? Object.assign({}, target.paint, { gradientStops: target.paint.gradientStops.map((stop, stopIndex) =>
      stopIndex === location.stopIndex ? { position: stop.position } : stop) })
    : paint));
}

function stablePaintJson(value: unknown): string {
  return JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item);
}
