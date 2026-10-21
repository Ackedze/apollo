import type { JsonValue, PreviewSnapshot } from './types';

const TYPES = new Set(['GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'GRADIENT_DIAMOND']);
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const unit = (v: unknown): v is number => finite(v) && v >= 0 && v <= 1;
const transformValid = (v: unknown): boolean => Array.isArray(v) && v.length === 2
  && v.every(row => Array.isArray(row) && row.length === 3 && row.every(finite));
const colorValid = (v: unknown): boolean => ['r', 'g', 'b', 'a'].every(key => unit(record(v)[key]));

/** Plugin API adapter. Preserve precision, order and binding identity; never
 * synthesize missing gradient geometry or recover it from the actual instance. */
export function captureGradientPaintDetails(value: unknown): Record<string, JsonValue> {
  const paint = record(value), facts: Record<string, JsonValue> = {};
  if (!TYPES.has(String(paint.type))) return facts;
  if (transformValid(paint.gradientTransform)) facts.gradientTransform = (paint.gradientTransform as number[][]).map(row => row.slice());
  if (Array.isArray(paint.gradientStops)) facts.gradientStops = paint.gradientStops.map(raw => {
    const stop = record(raw), result: Record<string, JsonValue> = {};
    if (unit(stop.position)) result.position = stop.position;
    if (colorValid(stop.color)) result.color = Object.fromEntries(['r', 'g', 'b', 'a'].map(key => [key, record(stop.color)[key]])) as Record<string, number>;
    // Explicit null proves an unbound stop. Omission means unavailable evidence.
    if (stop.boundVariables === undefined || (stop.boundVariables && typeof stop.boundVariables === 'object'
      && !Array.isArray(stop.boundVariables) && !Object.prototype.hasOwnProperty.call(stop.boundVariables, 'color'))) result.tokenId = null;
    else {
      const alias = record(record(stop.boundVariables).color);
      if (alias.type === 'VARIABLE_ALIAS' && typeof alias.id === 'string' && alias.id.trim()) result.tokenId = alias.id;
    }
    return result;
  });
  // BlendMode is optional in the Plugin API. Retain it when observed, without
  // manufacturing a default for an absent field in historical data.
  if (typeof paint.blendMode === 'string') facts.blendMode = paint.blendMode;
  return facts;
}

export function gradientPaintIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const issues: string[] = [];
  value.forEach((raw, index) => {
    const paint = record(raw);
    if (!TYPES.has(String(paint.type))) return;
    const prefix = `[${index}]`;
    if (!transformValid(paint.gradientTransform)) issues.push(`${prefix}.gradientTransform`);
    if (!Array.isArray(paint.gradientStops) || !paint.gradientStops.length) issues.push(`${prefix}.gradientStops`);
    else paint.gradientStops.forEach((rawStop, stopIndex) => {
      const stop = record(rawStop), path = `${prefix}.gradientStops[${stopIndex}]`;
      if (!unit(stop.position)) issues.push(`${path}.position`);
      if (!colorValid(stop.color)) issues.push(`${path}.color`);
      if (!(stop.tokenId === null || (typeof stop.tokenId === 'string' && Boolean(stop.tokenId.trim())))) issues.push(`${path}.tokenId`);
    });
  });
  return issues;
}

/** Versioned compiled-contract requirement, applied AFTER independent references
 * and nested dependency baselines. Old compiled reports retain exact replay. */
export function materializeGradientPaintEvidence(snapshot: PreviewSnapshot): void {
  for (const node of snapshot.nodes) {
    const unknown = new Set((node.unknownFacts || []) as string[]);
    const issues: Array<{ fact: string; missing: string[] }> = [];
    const present: Record<string, boolean> = {};
    for (const [prefix, source] of [['', node], ['baseline.effective.', record(record(node.baseline).effective)]] as const) {
      const appearance = record(source.appearance);
      for (const kind of ['fill', 'stroke']) {
        // Presence is separate from completeness. Otherwise fact-present in a
        // selector can silently remove a node whose baseline paint is unknown.
        if (Object.prototype.hasOwnProperty.call(appearance, kind)) present[kind] = true;
        const missing = Object.prototype.hasOwnProperty.call(appearance, kind) && !Array.isArray(appearance[kind])
          ? [''] : gradientPaintIssues(appearance[kind]);
        if (!missing.length) continue;
        const fact = `${prefix}appearance.${kind}`;
        unknown.add(fact);
        issues.push({ fact, missing: missing.map(path => `${fact}${path}`) });
      }
    }
    node.paintEvidenceV1 = present;
    node.unknownFacts = [...unknown].sort();
    if (issues.length) {
      node.gradientPaintIssues = issues;
    } else delete node.gradientPaintIssues;
  }
}
