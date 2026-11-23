// Mixed text has no node-level fill. Only complete captured solid-paint runs
// can supply a comparison; absent ranges must never become an empty fill.
function textPaintRuns(source, equal) {
  const text = source?.text?.characters, fill = source?.appearance?.fill;
  if (typeof text !== 'string' || !text.length) return;
  const evidence = source.textFillEvidenceV1;
  const segments = Array.isArray(fill) ? [{ start: 0, end: text.length, paints: fill }]
    : fill === null && evidence?.version === 1 ? evidence.segments : undefined;
  if (!Array.isArray(segments)) return;
  const runs = []; let end = 0;
  for (const segment of segments) {
    if (!segment || segment.start !== end || !Number.isInteger(segment.end)
      || segment.end <= end || segment.end > text.length || !Array.isArray(segment.paints)) return;
    if (!segment.paints.every(p => p && p.type === 'SOLID' && typeof p.visible === 'boolean'
      && Number.isFinite(p.opacity) && p.opacity >= 0 && p.opacity <= 1
      && ['r', 'g', 'b'].every(k => Number.isFinite(p.color?.[k]) && p.color[k] >= 0 && p.color[k] <= 255)
      && (p.tokenId === null || typeof p.tokenId === 'string' && p.tokenId.length > 0))) return;
    end = segment.end;
    const prior = runs[runs.length - 1];
    if (prior && equal && equal(prior.paints, segment.paints)) prior.end = end;
    else runs.push({ start: segment.start, end, paints: segment.paints });
  }
  if (end !== text.length) return;
  // Uniform formatting does not constrain editable label length.
  return runs.length === 1 ? [{ paints: runs[0].paints }] : runs;
}

module.exports = { textPaintRuns };
