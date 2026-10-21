import { buildColorTokenValueIndex, getNodeUniformColorKey, scopeSupportsField } from "./colorTokenValueIndex";
import { getNodePaintFingerprint, getNodeTypographyFingerprint, fingerprintCatalogPaintStyle, fingerprintCatalogTypographyStyle } from "./styleMetadata";
import type { VariableFindingAction, StyleFindingAction } from './types';
export type Catalogs = { tokens: any[]; styles: any[]; sourceIdentity?: string };
export type ReferenceCandidate = { key: string; name: string; library: string | null };
export type BindingCandidate = (VariableFindingAction | StyleFindingAction) & { targetModes?: string[] };
type StyleCandidate = { key: string; name: string; library: string | null };
export function createBindingIndex(catalogs: Catalogs) {
  const colors = buildColorTokenValueIndex(catalogs.tokens), paints = new Map<string,StyleCandidate[]>(), typography = new Map<string,StyleCandidate[]>();
  const modes = new Map<string,string>(), tokens = new Map<string,ReferenceCandidate>();
  for (const catalog of catalogs.tokens) for (const collection of catalog.collections || []) {
    for (const mode of collection.modes || []) modes.set((catalog.meta?.fileName || '') + '\u0000' + collection.name + '\u0000' + mode.modeId,mode.name);
    for (const v of collection.variables || []) if (!tokens.has(v.key)) tokens.set(v.key,{key:v.key,name:v.groupName && v.groupName !== 'Без группы' ? v.groupName + '/' + (v.tokenName || v.name) : v.tokenName || v.name || v.key,library:collection.name || catalog.meta?.library || null});
  }
  for (const matches of colors.values()) matches.sort((a,b) => [a.library || '',a.collectionName || '',a.name,a.key].join('\u0000').localeCompare([b.library || '',b.collectionName || '',b.name,b.key].join('\u0000')));
  for (const catalog of catalogs.styles) for (const style of catalog.styles || []) {
    if (!/^[a-f0-9]{40}$/i.test(style.key)) continue;
    const fingerprint = style.type === 'text' ? fingerprintCatalogTypographyStyle(style)?.key : fingerprintCatalogPaintStyle(style);
    if (!fingerprint) continue;
    const index = style.type === 'text' ? typography : paints, entries = index.get(fingerprint) || [];
    const name = String(style.name || '').split(' (')[0];
    entries.push({key:style.key,name:style.group && style.group !== 'Без группы' ? style.group + '/' + name : name,library:catalog.meta?.library || null});
    index.set(fingerprint,entries);
  }
  return { colors, paints, typography, modes, tokens };
}
type BindingIndex = ReturnType<typeof createBindingIndex>;
export function bindingCandidates(node: SceneNode, property: string, input: Catalogs | BindingIndex, reference: ReferenceCandidate | null = null): BindingCandidate[] {
  const field = property === 'fills' ? 'fill' : property === 'strokes' ? 'stroke' : property === 'typography' ? 'text' : null;
  if (!field) return [];
  const index = 'colors' in input ? input : createBindingIndex(input);
  const styleProperty = field === 'text' ? 'textStyleId' : field === 'fill' ? 'fillStyleId' : 'strokeStyleId';
  const expectedStyleId = typeof (node as any)[styleProperty] === 'string' ? (node as any)[styleProperty] || null : null;
  const expectedFingerprint = field === 'text' ? node.type === 'TEXT' ? getNodeTypographyFingerprint(node as TextNode) : null : getNodePaintFingerprint(node,field);
  if (!expectedFingerprint) return [];
  if (field !== 'text') {
    const variables = new Map<string,BindingCandidate>();
    const action = (c: ReferenceCandidate, targetModes: string[] = []): BindingCandidate => ({kind:'bind-variable',nodeId:node.id,expectedStyleId,targetVariableKey:c.key,targetName:c.name,targetLibrary:c.library,styleField:field,expectedFingerprint,targetModes});
    if (reference && /^[a-f0-9]{40}$/i.test(reference.key)) variables.set(reference.key,action(reference.name === reference.key ? index.tokens.get(reference.key) || reference : reference));
    const key = getNodeUniformColorKey(node,field), matches = key ? index.colors.get(key) || [] : [];
    for (const c of matches) if (/^[a-f0-9]{40}$/i.test(c.key) && scopeSupportsField(c.scopes,field) && !variables.has(c.key)) variables.set(c.key,action({key:c.key,name:c.name,library:c.collectionName || c.library},c.matchedModeIds.map(id => index.modes.get((c.sourceFile || '') + '\u0000' + c.collectionName + '\u0000' + id) || id)));
    if (variables.size) return Array.from(variables.values());
  }
  return (field === 'text' ? index.typography : index.paints).get(expectedFingerprint)?.map(c => ({kind:'bind-style',nodeId:node.id,expectedStyleId,targetStyleKey:c.key,targetName:c.name,targetLibrary:c.library,styleField:field,reason:field === 'text' ? 'exact-typography-match' : 'exact-style-match',expectedFingerprint})) || [];
}
