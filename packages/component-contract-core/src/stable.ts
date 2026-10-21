import { sha256Hex } from '../vendor/sha256';

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function stableHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

export function slug(value: string): string {
  const normalized = value
    .replace(/^\s*(?:❌|🔒|🔄)?\s*\[[DMT]\]\s*/u, '')
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized || 'target';
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}
