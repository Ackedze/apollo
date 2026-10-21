import type { CompiledContract, PreviewSnapshot } from './types';
import { snapshotPaths } from './snapshot-topology';
import { stableHash } from './stable';

const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const unknown = (node: Record<string, unknown>, fact: string) => ((node.unknownFacts || []) as string[]).some(p => p === fact || fact.startsWith(p + '.'));
const ordered = (shape: Array<{path:string;type:string}>) => shape.slice().sort((a,b) => a.path.localeCompare(b.path) || a.type.localeCompare(b.type));

/** Selected-library text is an explicit contract reference, NOT the effective
 * host baseline. It never resets visual/typographic overrides or reads actual text
 * into expected values. Missing or changed topology remains unknown. */
export function materializeLibraryText(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (!contract.capabilities.facts.some(f => f.startsWith('libraryTextV1.'))) return;
  const paths = snapshotPaths(snapshot), byId = new Map(snapshot.nodes.map(n => [String(n.id), n]));
  const root = snapshot.nodes.find(n => snapshot.selection.includes(String(n.id)));
  const verified = root && ['verified','partial'].includes(String(record(root.variantAvailability).status));
  for (const node of snapshot.nodes) {
    delete node.libraryTextV1;
    node.unknownFacts = ((node.unknownFacts || []) as string[]).filter(p => p !== 'libraryTextV1' && !p.startsWith('libraryTextV1.'));
    if (node.type !== 'TEXT') continue;
    (node.unknownFacts as string[]).push('libraryTextV1.characters','libraryTextV1.trimmedCharacters','libraryTextV1.actualTrimmedCharacters');
    if (!paths || !verified || record(node.baselineProvenance).status !== 'matched') continue;
    let owner = byId.get(String(node.parentId));
    const visited = new Set<string>();
    while (owner && owner.type !== 'INSTANCE' && !visited.has(String(owner.id))) {
      visited.add(String(owner.id)); owner = byId.get(String(owner.parentId));
    }
    if (!owner || owner.type !== 'INSTANCE' || record(owner.baselineProvenance).status !== 'matched'
      || unknown(owner,'component.identity') || unknown(owner,'component.identity.componentKey') || unknown(owner,'component.identity.componentSetKey')) continue;
    const component = record(owner.component), identity = record(component.identity);
    const candidates = (contract.facts.variantEvidence?.libraryText || []).filter(v => v.componentKey === identity.componentKey
      && (v.componentSetKey === identity.componentSetKey || (!identity.componentSetKey && v.componentSetKey === v.componentKey)));
    if (candidates.length !== 1) continue;
    const expected = candidates[0];
    if (Object.entries(expected.properties).some(([name,value]) => component.propertyTypes?.[name] !== 'VARIANT'
      || component.properties?.[name] !== value || unknown(owner!,`component.properties.${name}`) || unknown(owner!,`component.propertyTypes.${name}`))) continue;
    const base = paths.get(String(owner.id))!;
    const relative = (p:string) => p === base ? '' : p.slice(base.length + (base ? 3 : 0));
    const descendants = snapshot.nodes.filter(n => {
      const p = paths.get(String(n.id))!; return p === base || !base || p.startsWith(base + ' / ');
    });
    const shape = descendants.map(n => ({path:relative(paths.get(String(n.id))!),type:n === owner ? 'ROOT' : String(n.type)}));
    if (stableHash(ordered(shape)) !== stableHash(ordered(expected.structure))) continue;
    const path = relative(paths.get(String(node.id))!), text = expected.characters[path];
    if (typeof text !== 'string') continue;
    const actual = record(node.text).characters;
    node.libraryTextV1 = {characters:text,trimmedCharacters:text.trim(),componentKey:expected.componentKey,sourceHash:contract.facts.variantEvidence!.sourceHash,
      ...(typeof actual === 'string' && !unknown(node,'text.characters') ? {actualTrimmedCharacters:actual.trim()} : {})};
    node.unknownFacts = (node.unknownFacts as string[]).filter(p => p !== 'libraryTextV1.characters' && p !== 'libraryTextV1.trimmedCharacters'
      && !(p === 'libraryTextV1.actualTrimmedCharacters' && typeof actual === 'string' && !unknown(node,'text.characters')));
  }
}
