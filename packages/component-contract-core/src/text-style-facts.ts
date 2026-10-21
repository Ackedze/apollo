import type { CompiledContract, PreviewSnapshot, TextStyleCatalog } from './types';
import { stableHash } from './stable';

/** Independent capture evidence: never extends legacy appearance/baseline equality. */
export async function captureTextStyleEvidence(node: any, resolveKey: (id: string) => Promise<string | undefined>) {
  const result: Record<string, any> = {version: 1};
  try {
    result.segments = node.getStyledTextSegments(['textStyleId']).map((s: any) => ({start:s.start,end:s.end,styleId:s.textStyleId}));
  } catch { return result; } // Missing range capture is explicit unknown, not a uniform-style fallback.
  const ids = [...new Set<string>([node.textStyleId, ...result.segments.map((s: any) => s.styleId)]
    .filter(id => typeof id === 'string' && id && !/^S:[a-f0-9]{40}(?:,[^\s]+)?$/i.test(id)))];
  result.keysById = {};
  for (const id of ids) {
    try { const key = await resolveKey(id); if (key) result.keysById[id] = key; } catch { /* unresolved stays unknown */ }
  }
  return result;
}

const record = (v: any): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
export const textStyleBindingFact = (catalog: string): string => `textStyleBindingsV1.c_${stableHash(catalog).slice(0, 16)}`;

/** Read-only Athena style catalog. Names are presentation, never identity. */
export function extractTextStyleCatalogs(files: Array<{name: string; data: Record<string, unknown>}>): TextStyleCatalog[] {
  return files.filter(f => Array.isArray(f.data.styles)).flatMap(f => {
    const styles = (f.data.styles as any[]).filter(s => s.type === 'text');
    if (!styles.length) return [];
    if (styles.some(s => !/^[a-f0-9]{40}$/i.test(s.key) || typeof s.name !== 'string')
      || new Set(styles.map(s => s.key)).size !== styles.length) throw new Error(`${f.name}: invalid text style catalog`);
    return [{id: f.name.split('/').pop()!, sourceHash: stableHash(f.data),
      styles: styles.map(s => ({key: s.key.toLowerCase(), name: [s.group, s.name].filter(Boolean).join('/')})).sort((a,b) => a.key.localeCompare(b.key))}];
  });
}

export function validTextStyleCatalog(c: TextStyleCatalog): boolean {
  return !!c && typeof c.id === 'string' && /^[a-f0-9]{64}$/.test(c.sourceHash) && Array.isArray(c.styles)
    && c.styles.length > 0 && c.styles.every(s => !!s && /^[a-f0-9]{40}$/.test(s.key) && typeof s.name === 'string')
    && new Set(c.styles.map(s => s.key)).size === c.styles.length;
}

/** Recompute from captured references, never font/RGB equality or cached derived verdicts.
 * Uniform old snapshots are supported. Mixed text needs complete range evidence. */
export function materializeTextStyleBindings(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (contract.runtimePolicy.textStyleBindingFactsVersion !== 1) return;
  const rawCatalogs = contract.facts.variantEvidence?.textStyleCatalogs;
  const catalogs = Array.isArray(rawCatalogs) ? rawCatalogs.filter(c => c && typeof c.id === 'string') : [];
  for (const node of snapshot.nodes) {
    const prior = (node.unknownFacts || []) as string[];
    node.unknownFacts = prior.filter(p => p !== 'textStyleBindingsV1' && !p.startsWith('textStyleBindingsV1.'));
    node.textStyleBindingsV1 = {};
    if (node.type !== 'TEXT') continue;
    const t = record(record(node.appearance).typography);
    const evidence = record(node.textStyleEvidenceV1);
    const captureUnknown = prior.some(p => p === 'appearance' || p === 'appearance.typography' || p.startsWith('appearance.typography.')
      || p === 'textStyleEvidenceV1' || p.startsWith('textStyleEvidenceV1.'));
    let ids: unknown[] | undefined;
    if (!captureUnknown && evidence.version === 1) {
      const text = record(node.text).characters, ranges = evidence.segments;
      if (typeof text === 'string' && Array.isArray(ranges)) {
        let end = 0;
        const valid = ranges.every((s: any) => s && Number.isInteger(s.start) && Number.isInteger(s.end)
          && s.start === end && s.end > s.start && s.end <= text.length && (end = s.end));
        if (valid && end === text.length) ids = ranges.length ? ranges.map((s: any) => s.styleId) : [t.styleId];
      }
    } else if (!captureUnknown && node.textStyleEvidenceV1 === undefined && typeof t.styleId === 'string') ids = [t.styleId];
    for (const catalog of catalogs) {
      const fact = textStyleBindingFact(catalog.id), key = fact.split('.')[1];
      let unknown = !ids || !validTextStyleCatalog(catalog) || catalogs.filter(c => c.id === catalog.id).length !== 1;
      let detached = false, outside = false;
      const keys: string[] = [], names: string[] = [];
      if (!unknown) for (const id of ids!) {
        if (id === '') { detached = true; continue; }
        if (typeof id !== 'string') { unknown = true; continue; }
        const match = /^S:([a-f0-9]{40})(?:,[^\s]+)?$/i.exec(id);
        // A file-local numeric style ID can also belong to the library's source file.
        // Resolve by captured BaseStyle.key; never classify numeric IDs by shape alone.
        const resolvedKey = match?.[1] || record(evidence.keysById)[id];
        if (typeof resolvedKey !== 'string' || !/^[a-f0-9]{40}$/i.test(resolvedKey)) { unknown = true; continue; }
        const styleKey = resolvedKey.toLowerCase(), style = catalog.styles.find(s => s.key === styleKey);
        keys.push(styleKey);
        if (style) names.push(style.name); else outside = true;
      }
      if (!unknown || detached || outside) {
        record(node.textStyleBindingsV1)[key] = { required: !detached, library: !detached && !outside && !unknown,
          state: detached ? 'detached' : outside ? 'outside-catalog' : 'bound',
          catalog: catalog.id, styleKeys: [...new Set(keys)].sort(), styleNames: [...new Set(names)].sort() };
      } else (node.unknownFacts as string[]).push(fact);
    }
  }
}
