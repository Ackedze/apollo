import type { DeprecatedStyleEntry } from '../types/audit';
import type { StyleMetadataEntry } from './styleMetadata';
import {
  buildNodePath,
  extractAliasKey,
  getPageName,
  isNodeVisible,
} from '../utils/nodeHelpers';

export interface DeprecatedStyleCollectionOptions {
  resolveStyleMetadata: (
    styleId: string | null | undefined,
  ) => Promise<StyleMetadataEntry | null>;
  resolveTokenStatus?(id:string):Promise<{key:string;label:string;library?:string;sourceFile?:string;status:'deprecated'|'scheduled'}|null>;
}

type DeprecatedStyleReason = DeprecatedStyleEntry['reason'];

type DeprecatedStyleCandidate = {
  reason: DeprecatedStyleReason;
  styleId: string;
};

export async function collectDeprecatedStyleUsages(
  node: SceneNode,
  options: DeprecatedStyleCollectionOptions,
  gradientFields?: ReadonlySet<DeprecatedStyleReason>,
): Promise<DeprecatedStyleEntry[]> {
  if (node.type === 'SECTION') {
    return [];
  }

  const candidates = collectDeprecatedStyleCandidates(node);
  if (!candidates.length && !options.resolveTokenStatus) {
    return [];
  }

  const entries: DeprecatedStyleEntry[] = [];
  const pageName = getPageName(node);
  const visible = isNodeVisible(node);

  for (const candidate of candidates) {
    const metadata = await options.resolveStyleMetadata(candidate.styleId);

    if (!metadata || !metadata.isDeprecated && !metadata.scheduled) {
      continue;
    }

    entries.push(Object.assign({
      id: node.id,
      name: node.name,
      nodeType: node.type,
      pageName,
      path: buildNodePath(node),
      visible,
      reason: candidate.reason,
      styleId: candidate.styleId,
      styleKey: metadata.key,
      styleLabel: metadata.label,
      sourceFile: metadata.sourceFile ?? 'Unknown style catalog',
      sourceLibrary: metadata.library ?? metadata.sourceFile ?? 'Unknown style catalog',
    }, metadata.scheduled && !metadata.isDeprecated ? {scheduled:true as const} : {}));
  }

  if(options.resolveTokenStatus){
    const seen = new Set<string>();
    const bindings = 'boundVariables' in node ? node.boundVariables : null;
    // A node-level alias cannot identify a gradient stop and can repeat it.
    const queue: unknown[] = Object.entries(bindings ?? {})
      .filter(([field]) => field === 'fills' || field === 'textRangeFills'
        ? !gradientFields?.has('fill')
        : field !== 'strokes' || !gradientFields?.has('stroke'))
      .map(([, aliases]) => aliases);
    for(const field of ['fills','strokes'] as const){
      const paints=(node as unknown as Record<string,unknown>)[field];
      if(Array.isArray(paints))for(const paint of paints)if(paint?.visible!==false)queue.push(paint?.boundVariables);
    }
    if(node.type==='TEXT'&&typeof node.getStyledTextSegments==='function'){
      for(const segment of node.getStyledTextSegments(['fills']))for(const paint of segment.fills)if(paint.visible!==false&&'boundVariables'in paint)queue.push(paint.boundVariables);
    }
    for(let i=0;i<queue.length;i++){
      const value=queue[i];
      if(!value||typeof value!=='object')continue;
      if(!('type'in value)||value.type!=='VARIABLE_ALIAS'||!('id'in value)||typeof value.id!=='string'){
        queue.push(...Object.values(value));continue;
      }
      const alias=extractAliasKey(value.id);
      if(!alias||seen.has(alias))continue;
      seen.add(alias);
      const token=await options.resolveTokenStatus(value.id);
      if(!token)continue;
      entries.push(Object.assign({id:node.id,name:node.name,nodeType:node.type,pageName,path:buildNodePath(node),visible,
        reason:'fill' as const,styleId:value.id,styleKey:token.key,styleLabel:token.label,sourceFile:token.sourceFile||'',sourceLibrary:token.library,token:true as const},
        token.status==='scheduled'?{scheduled:true as const}:{}));
    }
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
      const fillStyleId = segment?.fillStyleId;
      if (
        typeof fillStyleId !== 'string' ||
        !fillStyleId
      ) {
        continue;
      }

      candidates.push({
        reason: 'fill',
        styleId: fillStyleId,
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
