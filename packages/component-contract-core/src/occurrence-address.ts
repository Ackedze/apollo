/** A structural address stores one occurrence. It is not proof of semantic
 * correspondence; source identity/ports must independently prove that. */
export function occurrenceSegment(name: string, sourceId?: string, localId?: string): string {
  if (sourceId !== undefined) return '@source:' + encodeURIComponent(sourceId);
  if (localId !== undefined) return '@local:' + encodeURIComponent(localId);
  return name.startsWith('@') || name.includes(' / ') ? '@name:' + encodeURIComponent(name) : name;
}

/** Athena IDs are local normalized addresses, not original Figma source IDs.
 * Catalog occurrences require a separate reviewed binding to live evidence. */
export function catalogOccurrencePaths(tree: Map<string, Record<string, any>>): Map<string, string> | undefined {
  const paths = new Map<string, string>();
  const visit = (id: string, seen = new Set<string>()): string | undefined => {
    if (seen.has(id)) return undefined;
    if (paths.has(id)) return paths.get(id);
    seen.add(id);
    const n = tree.get(id);
    if (!n || typeof n.name !== 'string') return undefined;
    if (n.parentId === null) { paths.set(id, ''); return ''; }
    const p = visit(String(n.parentId), seen);
    if (p === undefined) return undefined;
    const siblings = [...tree].filter(([, other]) => other.parentId === n.parentId && other.name === n.name);
    const segment = siblings.length > 1 ? '@catalog:' + encodeURIComponent(id) : occurrenceSegment(n.name);
    const path = [p,segment].filter(Boolean).join(' / ');
    if ([...paths.values()].includes(path)) return undefined;
    paths.set(id,path); return path;
  };
  for (const id of tree.keys()) if (visit(id) === undefined) return undefined;
  return [...paths.values()].filter(p=>p==='').length === 1 ? paths : undefined;
}

/** Compare diagnostic anatomy without assigning an ambiguous sibling to a role.
 * Child order deliberately does not establish identity. */
export function diagnosticStructure(nodes: Array<{path:string;type:string}>, names: Record<string,string>): unknown | undefined {
  const byPath = new Map(nodes.map(n=>[n.path,n]));
  if (byPath.size!==nodes.length || byPath.get('')?.type!=='ROOT') return undefined;
  const parent = (path:string)=>path.split(' / ').slice(0,-1).join(' / ');
  if(nodes.some(n=>n.path && !byPath.has(parent(n.path))))return undefined;
  const visit = (path:string): unknown => {
    const node=byPath.get(path)!;
    const name=path ? names[path] : '';
    if(typeof name!=='string')return undefined;
    const children=nodes.filter(n=>n.path && parent(n.path)===path).map(n=>visit(n.path));
    if(children.some(n=>n===undefined))return undefined;
    return {name,type:node.type,children:children.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
  };
  return visit('');
}

/** One selected variant never overwrites or borrows another variant's binding. */
export function selectedTargetPathHint(target:SemanticTarget,representationId:string,componentKey?:string,requireVariant=false):string | undefined {
  const variants=target.variantHints?.filter(h=>h.representationId===representationId && h.componentKey===componentKey) || [];
  if(variants.length>1)return undefined;
  if(variants.length===1)return variants[0].pathHint;
  const hints=target.representationHints?.filter(h=>h.representationId===representationId) || [];
  if(hints.length>1)return undefined;
  const path=hints[0]?.pathHint || target.pathHint;
  return requireVariant && path?.split(' / ').length!==1 ? undefined : path;
}
import type { SemanticTarget } from './types';
