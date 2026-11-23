export type CanonicalStrokeAlignment = 'INSIDE' | 'CENTER' | 'OUTSIDE';

export function normalizeStrokeAlignment(
  value: string | null | undefined,
): CanonicalStrokeAlignment | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (
    normalized === 'INSIDE' ||
    normalized === 'CENTER' ||
    normalized === 'OUTSIDE'
  ) {
    return normalized;
  }
  return null;
}

export function formatStrokeAlignment(
  value: string | null | undefined,
): string {
  const normalized = normalizeStrokeAlignment(value);
  if (normalized === 'INSIDE') return 'Inside';
  if (normalized === 'CENTER') return 'Center';
  if (normalized === 'OUTSIDE') return 'Outside';
  return '—';
}

export function setNodeStrokeAlignment(
  node: unknown,
  value: string | null | undefined,
): boolean {
  const normalized = normalizeStrokeAlignment(value);
  if (!normalized || !node || typeof node !== 'object' || !('strokeAlign' in node)) {
    return false;
  }

  (node as { strokeAlign: CanonicalStrokeAlignment }).strokeAlign = normalized;
  return true;
}
