import type { JsonValue } from './types';

/** Capture, not a rule: the reference is independently rendered from the actual
 * variant. Preserve exact effect parameters and published style identity. */
export function captureEffectDetails(effects: unknown, styleId: unknown): JsonValue | undefined {
  if (!Array.isArray(effects) || typeof styleId !== 'string') return undefined;
  if (effects.some(e => !e || typeof e !== 'object' || typeof e.type !== 'string')) return undefined;
  if (effects.some(e => ['BACKGROUND_BLUR', 'LAYER_BLUR'].includes(e.type)
    && (typeof e.radius !== 'number' || !Number.isFinite(e.radius) || e.radius < 0))) return undefined;
  // Imported style IDs contain a file-local suffix; its published key is stable.
  // Local styles retain their complete ID and cannot impersonate a library key.
  const key = /^S:([a-f0-9]{40})(?:,|$)/i.exec(styleId)?.[1];
  return {
    version: 1,
    styleRef: key ? `key:${key.toLowerCase()}` : styleId ? `local:${styleId}` : null,
    effects: effects.map(e => JSON.parse(JSON.stringify(e)) as JsonValue),
  };
}
