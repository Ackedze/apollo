export function extractVariableCollectionKey(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const withoutPrefix = value.replace(/^VariableCollectionId:/, '');
  const key = withoutPrefix.split('/')[0];
  return key || null;
}

export function getVariableCollectionLookupKeys(
  value: string | null | undefined,
): string[] {
  if (!value) return [];
  const keys = [value];
  const collectionKey = extractVariableCollectionKey(value);
  if (collectionKey && collectionKey !== value) keys.push(collectionKey);
  return keys;
}
