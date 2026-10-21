/** Capture every text range. Missing or malformed evidence is never NONE. */
export function captureTextDecoration(node: any): string[] | undefined {
  try {
    if (node.type !== 'TEXT' || typeof node.characters !== 'string') return;
    const valid = (v: unknown) => typeof v === 'string' && ['NONE', 'UNDERLINE', 'STRIKETHROUGH'].includes(v);
    if (!node.characters.length) return valid(node.textDecoration) ? [node.textDecoration] : undefined;
    const ranges = node.getStyledTextSegments(['textDecoration']);
    if (!Array.isArray(ranges)) return;
    let end = 0;
    if (!ranges.every((r: any) => r && Number.isInteger(r.start) && Number.isInteger(r.end)
      && r.start === end && r.end > r.start && r.end <= node.characters.length
      && valid(r.textDecoration) && (end = r.end)) || end !== node.characters.length) return;
    return [...new Set<string>(ranges.map((r: any) => r.textDecoration))].sort();
  } catch { return; }
}
