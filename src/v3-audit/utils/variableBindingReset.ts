export function getVariableBindingResetField(
  property: string | null | undefined,
): string | null {
  if (!property) {
    return null;
  }
  if (property === 'layout.itemSpacingToken') {
    return 'itemSpacing';
  }
  if (property === 'radiusToken') {
    return 'cornerRadius';
  }
  if (property === 'opacityToken') {
    return 'opacity';
  }
  const paddingSide = property.match(
    /^layout\.paddingTokens\.(top|right|bottom|left)$/,
  )?.[1];
  if (!paddingSide) {
    return null;
  }
  const fields: Record<string, string> = {
    top: 'paddingTop',
    right: 'paddingRight',
    bottom: 'paddingBottom',
    left: 'paddingLeft',
  };
  return fields[paddingSide] ?? null;
}
