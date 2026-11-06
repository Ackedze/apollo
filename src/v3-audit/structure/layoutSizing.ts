export type LayoutSizingAxis = 'horizontal' | 'vertical';
export type CanonicalLayoutSizing = 'FILL' | 'HUG' | 'FIXED';

export function normalizeLayoutSizing(
  value: string | null | undefined,
): CanonicalLayoutSizing | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'FILL' || normalized === 'FILL_CONTAINER') return 'FILL';
  if (normalized === 'HUG' || normalized === 'HUG_CONTENTS') return 'HUG';
  if (normalized === 'FIXED') return 'FIXED';
  return null;
}

export function formatLayoutSizing(value: string | null | undefined): string {
  const normalized = normalizeLayoutSizing(value);
  if (normalized === 'FILL') return 'Fill';
  if (normalized === 'HUG') return 'Hug';
  if (normalized === 'FIXED') return 'Fixed';
  return value ?? '—';
}

export function setNodeLayoutSizing(
  node: unknown,
  axis: LayoutSizingAxis,
  value: string | null | undefined,
): boolean {
  if (!node || typeof node !== 'object') return false;
  const normalized = normalizeLayoutSizing(value);
  if (!normalized) return false;
  const property =
    axis === 'horizontal' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
  if (!(property in node)) return false;
  (node as Record<string, unknown>)[property] = normalized;
  return true;
}
