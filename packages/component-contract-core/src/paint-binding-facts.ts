import type { PreviewSnapshot } from './types';

const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const token = (v: unknown): v is string => typeof v === 'string' && Boolean(v.trim());

/** All active colors must carry bindings. RGB equality and node-level binding
 * summaries cannot conceal an unbound second paint. No verdicts or DS allowlist. */
export function materializePaintBindings(snapshot: PreviewSnapshot): void {
  for (const node of snapshot.nodes) {
    const prior = (node.unknownFacts || []) as string[];
    const unknown = prior.filter(p => p !== 'paintBindingsV1' && !p.startsWith('paintBindingsV1.'));
    const facts: Record<string, unknown> = {};
    if (record(node.visibility).effective === false && !prior.some(p => p === 'visibility' || p === 'visibility.effective')) {
      node.paintBindingsV1 = {fill:{required:true,tokenIds:[]},stroke:{required:true,tokenIds:[]}};
      node.unknownFacts = unknown; continue;
    }
    for (const kind of ['fill','stroke']) {
      const path = `appearance.${kind}`, paints = record(node.appearance)[kind];
      let unavailable = !Array.isArray(paints) || prior.some(p => p === path || path.startsWith(p + '.'));
      const ids: string[] = []; let bound = true;
      if (Array.isArray(paints)) for (const raw of paints) {
        const paint = record(raw);
        if (paint.visible === false || paint.opacity === 0) continue;
        if (paint.visible !== true || typeof paint.opacity !== 'number' || !Number.isFinite(paint.opacity)) { unavailable = true; continue; }
        if (paint.type === 'SOLID') {
          if (token(paint.tokenId)) ids.push(paint.tokenId); else if (paint.tokenId == null) bound = false; else unavailable = true;
        } else if (['GRADIENT_LINEAR','GRADIENT_RADIAL','GRADIENT_ANGULAR','GRADIENT_DIAMOND'].includes(paint.type)) {
          if (!Array.isArray(paint.gradientStops) || !paint.gradientStops.length) { unavailable = true; continue; }
          for (const rawStop of paint.gradientStops) {
            const stop = record(rawStop);
            if (record(stop.color).a === 0) continue;
            if (token(stop.tokenId)) ids.push(stop.tokenId); else if (stop.tokenId === null) bound = false; else unavailable = true;
          }
        } else if (typeof paint.type === 'string') bound = false;
        else unavailable = true;
      }
      // A definite raw color is a violation even if another paint is unknown.
      if (!bound || !unavailable) facts[kind] = { required: bound, tokenIds: [...new Set(ids)].sort() };
      else unknown.push(`paintBindingsV1.${kind}`);
    }
    node.paintBindingsV1 = facts;
    node.unknownFacts = unknown;
  }
}
