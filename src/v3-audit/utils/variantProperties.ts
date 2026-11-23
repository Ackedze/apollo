export type VariantPropertyMap = Record<string, string>;

export function parseVariantName(
  name: string | null | undefined,
): VariantPropertyMap {
  const result: VariantPropertyMap = {};

  for (const rawSegment of String(name ?? '').split(',')) {
    const segment = rawSegment.trim();
    if (!segment) {
      continue;
    }

    const separatorIndex = segment.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();

    if (!key || !value) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

export function variantPropertiesEqual(
  left: VariantPropertyMap | null | undefined,
  right: VariantPropertyMap | null | undefined,
): boolean {
  const leftEntries = Object.entries(left ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const rightEntries = Object.entries(right ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value], index) => {
    const [otherKey, otherValue] = rightEntries[index] ?? [];
    return key === otherKey && value === otherValue;
  });
}

export function countVariantPropertyMatches(
  left: VariantPropertyMap | null | undefined,
  right: VariantPropertyMap | null | undefined,
): number {
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = new Map(Object.entries(right ?? {}));
  let score = 0;

  for (const [key, value] of leftEntries) {
    if (rightEntries.get(key) === value) {
      score += 1;
    }
  }

  return score;
}

export function variantMatchesSourceWithDefaultExtras(
  target: VariantPropertyMap | null | undefined,
  source: VariantPropertyMap | null | undefined,
  defaults: VariantPropertyMap,
): boolean {
  const targetEntries = Object.entries(target ?? {});
  const sourceEntries = new Map(Object.entries(source ?? {}));

  for (const [key, value] of sourceEntries) {
    if (target?.[key] !== value) {
      return false;
    }
  }

  for (const [key, value] of targetEntries) {
    if (sourceEntries.has(key)) {
      continue;
    }

    if (defaults[key] !== value) {
      return false;
    }
  }

  return true;
}
