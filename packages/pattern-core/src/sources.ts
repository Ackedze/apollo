import type { SourceReference, Issue } from './schema';
import { validatePattern } from './validator';
import { contractHash, sha256 } from './hash';
export type SourceReader = (reference: SourceReference) => { bytes: Uint8Array; commit: string };
export type SourceReceipt = { schemaVersion: 'apollo.pattern-source-receipt.v1-draft';
  patternSha256: string; sources: SourceReference[]; receiptSha256: string };
export function verifySources(input: unknown, read: SourceReader): { status: 'passed' | 'failed'; issues: Issue[]; receipt?: SourceReceipt } {
  const validation = validatePattern(input);
  if (!validation.pattern) return { status: 'failed', issues: validation.issues };
  const p = validation.pattern, issues: Issue[] = [];
  for (const source of p.sources) {
    const fail = (code: string, message: string) => issues.push({ level: 'error' as const, code, path: '/sources/' + source.id, message });
    let observed: ReturnType<SourceReader>;
    try { observed = read(source); }
    catch { fail('SOURCE_UNAVAILABLE', 'Pinned source could not be read.'); continue; }
    if (observed.commit !== source.commit) fail('SOURCE_COMMIT', 'Observed source repository does not match the pinned commit.');
    if (sha256(observed.bytes) !== source.sha256) fail('SOURCE_HASH', 'Source bytes do not match the pinned hash.');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(observed.bytes); }
    catch { fail('SOURCE_ENCODING', 'Source is not UTF-8.'); continue; }
    let fence: { marker: string; length: number } | undefined;
    const declared = text.split(/\r?\n/).filter(line => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line);
      if (marker) {
        if (!fence) fence = { marker: marker[1][0], length: marker[1].length };
        else if (fence.marker === marker[1][0] && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) fence = undefined;
        return false;
      }
      return !fence;
    }).join('\n');
    const header = declared.split(/^##\s/m)[0];
    const patternIds = [...header.matchAll(/^(?:- )?patternId:[ \t]*(ptrn:[a-z0-9._-]+)[ \t]*$/gm)].map(match => match[1]);
    const ruleIds = new Set([...declared.matchAll(/^(?:- )?ruleId:[ \t]*(rule:[a-z0-9._-]+)[ \t]*$/gm)].map(match => match[1]));
    if (!patternIds.includes(source.patternId)) fail('SOURCE_PATTERN_ID', 'Exact patternId is absent from source metadata.');
    for (const ruleId of source.ruleIds) if (!ruleIds.has(ruleId)) fail('SOURCE_RULE_ID', `Exact ruleId is absent: ${ruleId}`);
  }
  if (issues.length) return { status: 'failed', issues };
  const body = { schemaVersion: 'apollo.pattern-source-receipt.v1-draft' as const,
    patternSha256: contractHash(p), sources: p.sources };
  return { status: 'passed', issues, receipt: Object.assign({}, body, { receiptSha256: contractHash(body) }) };
}
/** Receipts cross a trusted local port; their hash detects drift, not authenticity. */
export function sourceReceiptMatches(pattern: unknown, receipt: SourceReceipt | undefined): boolean {
  try {
  if (!receipt || receipt.schemaVersion !== 'apollo.pattern-source-receipt.v1-draft') return false;
  const parsed = validatePattern(pattern);
  if (!parsed.pattern || receipt.patternSha256 !== contractHash(parsed.pattern)
    || !Array.isArray(receipt.sources) || contractHash(receipt.sources) !== contractHash(parsed.pattern.sources)) return false;
  const body = { schemaVersion: receipt.schemaVersion, patternSha256: receipt.patternSha256, sources: receipt.sources };
  return receipt.receiptSha256 === contractHash(body);
  } catch { return false; }
}
