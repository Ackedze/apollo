export function isFigmaSourceUrl(value: string): boolean {
  return /^https:\/\/(?:www\.)?figma\.com\/(?:design|file|proto|board)\/[^/?#]+/i.test(
    value,
  );
}

export function resolveGenerationExampleSourceIdentity(
  nodeId: string,
  runtimeFileKey: string | null | undefined,
  suppliedFigmaUrl: string | null,
): { fileKey: string | null; figmaLink: string | null } {
  const normalizedRuntimeFileKey = runtimeFileKey?.trim() || null;
  const suppliedFileKey = suppliedFigmaUrl
    ? extractFigmaFileKeyFromUrl(suppliedFigmaUrl)
    : null;
  const fileKey = normalizedRuntimeFileKey ?? suppliedFileKey;
  if (!fileKey) return { fileKey: null, figmaLink: null };
  const suppliedBase = suppliedFigmaUrl
    ? extractFigmaFileBaseUrl(suppliedFigmaUrl, fileKey)
    : null;
  const baseUrl = suppliedBase ?? `https://www.figma.com/design/${fileKey}`;
  return {
    fileKey,
    figmaLink: `${baseUrl}?node-id=${nodeId.replace(/:/g, '-')}`,
  };
}

function extractFigmaFileKeyFromUrl(value: string): string | null {
  const match = value.match(
    /^https:\/\/(?:www\.)?figma\.com\/(?:design|file|proto|board)\/([^/?#]+)/i,
  );
  return match?.[1] ?? null;
}

function extractFigmaFileBaseUrl(
  value: string,
  fileKey: string,
): string | null {
  const match = value.match(
    /^https:\/\/(?:www\.)?figma\.com\/(design|file|proto|board)\/[^?#]+/i,
  );
  if (!match) return null;
  const baseUrl = match[0].replace(/\/$/, '');
  return baseUrl.includes(`/${fileKey}`) ? baseUrl : null;
}
