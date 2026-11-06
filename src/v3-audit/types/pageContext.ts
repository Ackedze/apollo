export const APOLLO_PAGE_TYPES = [
  'form',
  'details',
  'data-list',
  'landing',
  'dashboard',
  'other',
] as const;

export type ApolloPageType = (typeof APOLLO_PAGE_TYPES)[number];

export function normalizeApolloPageType(
  value: unknown,
): ApolloPageType | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return APOLLO_PAGE_TYPES.includes(normalized as ApolloPageType)
    ? (normalized as ApolloPageType)
    : null;
}
