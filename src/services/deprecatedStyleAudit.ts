import type { DeprecatedStyleEntry } from '../types/audit';
import {
  getPageName,
  isNodeVisible,
} from '../utils/nodeHelpers';

export type DeprecatedStyleMetadata = {
  label: string;
  library?: string;
  sourceFile?: string;
  isDeprecated?: boolean;
};

export interface DeprecatedStyleCollectionOptions {
  resolveStyleMetadata: (
    styleId: string | null | undefined,
  ) => Promise<DeprecatedStyleMetadata | null>;
}

type DeprecatedStyleReason = DeprecatedStyleEntry['reason'];

type DeprecatedStyleCandidate = {
  reason: DeprecatedStyleReason;
  styleId: string;
};

export async function collectDeprecatedStyleUsages(
  node: SceneNode,
  options: DeprecatedStyleCollectionOptions,
): Promise<DeprecatedStyleEntry[]> {
  if (node.type === 'SECTION') {
    return [];
  }

  const candidates = collectDeprecatedStyleCandidates(node);
  if (!candidates.length) {
    return [];
  }

  const entries: DeprecatedStyleEntry[] = [];
  const pageName = getPageName(node);
  const visible = isNodeVisible(node);

  for (const candidate of candidates) {
    const metadata = await options.resolveStyleMetadata(candidate.styleId);

    if (!metadata?.isDeprecated) {
      continue;
    }

    entries.push({
      id: node.id,
      name: node.name,
      nodeType: node.type,
      pageName,
      visible,
      reason: candidate.reason,
      styleLabel: metadata.label,
      sourceFile: metadata.sourceFile ?? 'Unknown style catalog',
      sourceLibrary: metadata.library ?? metadata.sourceFile ?? 'Unknown style catalog',
    });
  }

  return dedupeDeprecatedStyleEntries(entries);
}

function collectDeprecatedStyleCandidates(
  node: SceneNode,
): DeprecatedStyleCandidate[] {
  const candidates: DeprecatedStyleCandidate[] = [];

  pushDirectStyleCandidate(candidates, node, 'fill', 'fillStyleId');
  pushDirectStyleCandidate(candidates, node, 'stroke', 'strokeStyleId');

  if (node.type === 'TEXT') {
    collectTextRangeFillStyleCandidates(candidates, node as TextNode);
  }

  return dedupeDeprecatedStyleCandidates(candidates);
}

function pushDirectStyleCandidate(
  candidates: DeprecatedStyleCandidate[],
  node: SceneNode,
  reason: DeprecatedStyleReason,
  styleField: 'fillStyleId' | 'strokeStyleId',
): void {
  if (!(styleField in (node as any))) {
    return;
  }

  const styleId = (node as any)[styleField];
  if (!styleId || styleId === figma.mixed || typeof styleId !== 'string') {
    return;
  }

  candidates.push({
    reason,
    styleId,
  });
}

function collectTextRangeFillStyleCandidates(
  candidates: DeprecatedStyleCandidate[],
  node: TextNode,
): void {
  const textNode = node as TextNode & {
    getStyledTextSegments?: (
      fields: Array<'fillStyleId'>,
      start?: number,
      end?: number,
    ) => Array<{
      fillStyleId?: string;
    }>;
  };

  if (typeof textNode.getStyledTextSegments !== 'function') {
    return;
  }

  try {
    const segments = textNode.getStyledTextSegments(['fillStyleId']);
    for (const segment of segments) {
      if (
        !segment?.fillStyleId ||
        segment.fillStyleId === figma.mixed ||
        typeof segment.fillStyleId !== 'string'
      ) {
        continue;
      }

      candidates.push({
        reason: 'fill',
        styleId: segment.fillStyleId,
      });
    }
  } catch (_error) {
    return;
  }
}

function dedupeDeprecatedStyleCandidates(
  candidates: DeprecatedStyleCandidate[],
): DeprecatedStyleCandidate[] {
  const seen = new Set<string>();
  const result: DeprecatedStyleCandidate[] = [];
  for (const candidate of candidates) {
    const key = [
      candidate.reason,
      candidate.styleId,
    ].join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function dedupeDeprecatedStyleEntries(
  entries: DeprecatedStyleEntry[],
): DeprecatedStyleEntry[] {
  const seen = new Set<string>();
  const result: DeprecatedStyleEntry[] = [];
  for (const entry of entries) {
    const key = [
      entry.id,
      entry.reason,
      entry.styleLabel,
      entry.sourceFile,
    ].join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(entry);
  }
  return result;
}
