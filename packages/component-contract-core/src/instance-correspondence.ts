import type { PreviewSnapshot } from './types';
import type { InstanceBoundary, InstanceComparison } from './instance-boundaries';
import { snapshotPaths } from './snapshot-topology';

const record = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
const leaf = (path: string) => path.split(' / ').slice(-1)[0];

/** A local correspondence, not permission: same set may identify a variant
 * boundary, but only independent host evidence can supply its new baseline.
 * No global key search, sibling-index fallback or mutation of observed names. */
export function compareInstanceCorrespondence(
  snapshot: PreviewSnapshot, reference: NonNullable<PreviewSnapshot['variantReference']>, nestedVariants: boolean,
): InstanceComparison {
  const parents = new Map<string, string>();
  const parentPath = (path: string) => {
    if (!parents.has(path)) parents.set(path, path.split(' / ').slice(0, -1).join(' / '));
    return parents.get(path)!;
  };
  const paths = snapshotPaths(snapshot), boundaries: InstanceBoundary[] = [];
  const referencePaths: Record<string, string> = {};
  const invalid = (): InstanceComparison => ({ complete: false, boundaries, referencePaths });
  if (!paths || !reference.complete || !snapshot.source?.componentKey
    || reference.componentKey !== snapshot.source.componentKey
    || reference.componentSetKey !== (snapshot.source.componentSetKey || '')) return invalid();
  const actual = new Map(snapshot.nodes.map(n => [paths.get(String(n.id))!, n]));
  const expected = new Map(reference.nodes.map(n => [n.path, n]));
  if (expected.size !== reference.nodes.length || expected.get('')?.type !== 'ROOT') return invalid();
  for (const n of reference.nodes) if (n.path && !expected.has(parentPath(n.path))) return invalid();
  const actualChildren = new Map<string, Array<[string, typeof snapshot.nodes[number]]>>();
  const referenceChildren = new Map<string, typeof reference.nodes>();
  for (const entry of actual) if (entry[0]) {
    const parent = parentPath(entry[0]);
    if (!actualChildren.has(parent)) actualChildren.set(parent, []);
    actualChildren.get(parent)!.push(entry);
  }
  for (const node of reference.nodes) if (node.path) {
    const parent = parentPath(node.path);
    if (!referenceChildren.has(parent)) referenceChildren.set(parent, []);
    referenceChildren.get(parent)!.push(node);
  }
  const aIdentity = (n: Record<string, unknown>) => record(record(n.component).identity);
  const rIdentity = (path: string) => reference.nodeProperties[path]?.identity;
  const unknown = (n: Record<string, unknown>, fact: string) => ((n.unknownFacts || []) as string[])
    .some(p => p === fact || fact.startsWith(p + '.'));
  const knownIdentity = (n: Record<string, unknown>) => Boolean(typeof aIdentity(n).componentKey === 'string' && aIdentity(n).componentKey && !unknown(n, 'component.identity.componentKey')
    && !unknown(n, 'component.identity.componentSetKey'));
  const compatible = (n: Record<string, unknown>, path: string) => {
    const a = aIdentity(n), b = rIdentity(path);
    if (!knownIdentity(n) || !b?.componentKey) return false;
    if (a.componentSetKey || b.componentSetKey) return Boolean(a.componentSetKey && a.componentSetKey === b.componentSetKey);
    return a.componentKey === b.componentKey;
  };
  const ownerPaths = [new Map<string, string>(), new Map<string, string>()];
  const ownerFor = (path: string, nodes: Map<string, { type?: unknown }>) => {
    const owners = ownerPaths[nodes === actual ? 0 : 1];
    if (owners.has(path)) return owners.get(path)!;
    let p = parentPath(path);
    while (p && nodes.get(p)?.type !== 'INSTANCE') p = parentPath(p);
    owners.set(path, p); return p;
  };
  const actualPort = (path: string) => {
    const node = actual.get(path)!, c = record(node.component), property = record(c.propertyReferenceBindings).mainComponent;
    if (property === undefined) return undefined;
    const ownerPath = ownerFor(path, actual), ownerNode = actual.get(ownerPath)!, owner = record(ownerNode?.component);
    if (typeof property !== 'string' || !knownIdentity(node) || typeof c.identity?.mainComponentId !== 'string'
      || record(owner.propertyTypes)[property] !== 'INSTANCE_SWAP' || record(owner.properties)[property] !== c.identity.mainComponentId
      || unknown(node, 'component.propertyReferenceBindings.mainComponent')
      || unknown(ownerNode, 'component.properties.' + property) || unknown(ownerNode, 'component.propertyTypes.' + property)) return null;
    return { ownerPath, property };
  };
  const referencePort = (path: string) => {
    const c = reference.nodeProperties[path], property = c?.propertyReferenceBindings?.mainComponent;
    if (property === undefined) return undefined;
    const ownerPath = ownerFor(path, expected), owner = reference.nodeProperties[ownerPath];
    if (!property || !c.identity?.mainComponentId || owner?.propertyTypes[property] !== 'INSTANCE_SWAP'
      || owner.properties[property] !== c.identity.mainComponentId) return null;
    return { ownerPath, property };
  };
  const readSourcePort = (path: string, referenceSide: boolean) => {
    if (snapshot.source?.instanceSourceIdentityVersion !== 1) return undefined;
    const type=(referenceSide ? expected : actual).get(path)?.type;
    if(type!=='INSTANCE' && (snapshot.source?.occurrenceAddressVersion!==1 || reference.occurrenceAddressVersion!==1))return undefined;
    const node = actual.get(path), c = referenceSide ? reference.nodeProperties[path] : record(node?.component);
    const source = c?.sourceIdentity;
    if (source === undefined) return undefined;
    const ownerPath = ownerFor(path, referenceSide ? expected : actual);
    const ownerNode = actual.get(ownerPath);
    const owner = referenceSide ? reference.nodeProperties[ownerPath]?.identity : ownerNode && aIdentity(ownerNode);
    if (!source || source.version !== 1 || typeof source.sourceNodeId !== 'string' || !source.sourceNodeId
      || typeof source.ownerComponentKey !== 'string' || typeof source.ownerMainComponentId !== 'string'
      || typeof owner?.componentKey !== 'string' || !owner.componentKey
      || typeof owner.mainComponentId !== 'string' || !owner.mainComponentId
      || source.ownerComponentKey !== owner.componentKey || source.ownerMainComponentId !== owner.mainComponentId
      || (!referenceSide && (!node || type==='INSTANCE' && !knownIdentity(node) || !ownerNode || !knownIdentity(ownerNode)
        || ['version','sourceNodeId','ownerComponentKey','ownerMainComponentId'].some(field => unknown(node, 'component.sourceIdentity.' + field))
        || unknown(ownerNode, 'component.identity.mainComponentId')))) return null;
    return { ownerPath, sourceNodeId: source.sourceNodeId, ownerMainComponentId: source.ownerMainComponentId,
      ownerComponentKey: owner.componentKey, ownerComponentSetKey: owner.componentSetKey || '' };
  };
  // Facts are immutable during this comparison; nothing survives the call.
  const sourcePorts = [new Map<string, ReturnType<typeof readSourcePort>>(), new Map<string, ReturnType<typeof readSourcePort>>()];
  const sourcePort = (path: string, referenceSide: boolean) => {
    const ports = sourcePorts[referenceSide ? 1 : 0];
    if (!ports.has(path)) ports.set(path, readSourcePort(path, referenceSide));
    return ports.get(path);
  };
  const sameSourceOwner = (a: NonNullable<ReturnType<typeof sourcePort>>, b: NonNullable<ReturnType<typeof sourcePort>>) =>
    a.ownerMainComponentId === b.ownerMainComponentId || snapshot.source?.instanceMainComponentAliasesVersion === 1
      && a.ownerComponentKey === b.ownerComponentKey && a.ownerComponentSetKey === b.ownerComponentSetKey;
  // A native Figma SLOT is the stable component-owned boundary; its children
  // are caller content, not part of the component's reference anatomy. Match
  // the slot only when both sides expose the same unique native SLOT property.
  const verifiedSlot = (actualPath: string, referencePath: string) => {
    const node = actual.get(actualPath), ref = reference.nodeProperties[referencePath];
    const property = record(record(node?.component).propertyReferenceBindings).slotContentId;
    if (!node || node.type !== 'SLOT' || typeof property !== 'string' || !property
      || ref?.propertyReferenceBindings?.slotContentId !== property
      || unknown(node, 'component.propertyReferenceBindings.slotContentId')) return false;
    const actualOwnerPath = ownerFor(actualPath, actual);
    const expectedOwnerPath = ownerFor(referencePath, expected);
    const actualOwner = actual.get(actualOwnerPath);
    const expectedOwner = reference.nodeProperties[expectedOwnerPath];
    if (!actualOwner || referencePaths[actualOwnerPath] !== expectedOwnerPath
      || record(record(actualOwner.component).propertyTypes)[property] !== 'SLOT'
      || expectedOwner?.propertyTypes[property] !== 'SLOT'
      || unknown(actualOwner, `component.propertyTypes.${property}`)) return false;
    const actualConsumers = [...actual].filter(([p, n]) => n.type === 'SLOT' && ownerFor(p, actual) === actualOwnerPath
      && record(record(n.component).propertyReferenceBindings).slotContentId === property);
    const expectedConsumers = reference.nodes.filter(n => n.type === 'SLOT' && ownerFor(n.path, expected) === expectedOwnerPath
      && reference.nodeProperties[n.path]?.propertyReferenceBindings?.slotContentId === property);
    return actualConsumers.length === 1 && expectedConsumers.length === 1;
  };
  // Native BOOLEAN references identify a slot even after a direct swap renames it.
  // This proves correspondence only: it grants neither permission nor a baseline.
  const visibilityPort = (path: string, referenceSide: boolean) => {
    if (snapshot.source?.propertyReferenceIdentityVersion !== 1) return undefined;
    const node = actual.get(path), c = referenceSide ? reference.nodeProperties[path] : record(node?.component);
    const property = c?.propertyReferenceBindings?.visible;
    if (property === undefined) return undefined;
    const ownerPath = ownerFor(path, referenceSide ? expected : actual);
    const owner = referenceSide ? reference.nodeProperties[ownerPath] : record(actual.get(ownerPath)?.component);
    if (typeof property !== 'string' || owner?.propertyTypes?.[property] !== 'BOOLEAN'
      || typeof owner.properties?.[property] !== 'boolean'
      || (!referenceSide && (!node || !knownIdentity(node) || unknown(node, 'component.propertyReferenceBindings.visible')
        || unknown(actual.get(ownerPath)!, `component.propertyTypes.${property}`)
        || unknown(actual.get(ownerPath)!, `component.properties.${property}`)))) return null;
    return { ownerPath, property };
  };
  referencePaths[''] = '';
  const root = actual.get(''), rootIdentity = root && aIdentity(root);
  if (!root || !knownIdentity(root) || rootIdentity?.componentKey !== reference.componentKey
    || (rootIdentity.componentSetKey || '') !== reference.componentSetKey) {
    if(reference.occurrenceAddressVersion===1)delete referencePaths[''];
    return invalid();
  }

  const visit = (actualParent: string, expectedParent: string): boolean => {
    const children = actualChildren.get(actualParent) || [];
    const refChildren = referenceChildren.get(expectedParent) || [];
    if (children.length !== refChildren.length) return false;
    const claimed = new Set<string>();
    for (const [path, node] of children) {
      let candidates = refChildren.filter(n => n.type === node.type && leaf(n.path) === leaf(path));
      const port = node.type === 'INSTANCE' ? actualPort(path) : undefined;
      const visiblePort = node.type === 'INSTANCE' && !port ? visibilityPort(path, false) : undefined;
      const source = sourcePort(path, false);
      let sourceCandidate: typeof refChildren[number] | undefined;
      let uniqueVisibilityPort=false;
      if (port === null || visiblePort === null || source === null) return false;
      if (source) {
          const owner = referencePaths[source.ownerPath];
          const consumers = [...actual].filter(([p, n]) => {
            const other = sourcePort(p, false);
            return other?.ownerPath === source.ownerPath && other.sourceNodeId === source.sourceNodeId;
          });
          const matches = reference.nodes.filter(n => {
            if (n.type !== node.type) return false;
            const other = sourcePort(n.path, true);
            return other?.ownerPath === owner && other.sourceNodeId === source.sourceNodeId
              && sameSourceOwner(source, other);
          });
          if (owner === undefined || consumers.length !== 1 || matches.length !== 1
            || parentPath(matches[0].path) !== expectedParent) return false;
          sourceCandidate = matches[0];
      }
      if (node.type === 'INSTANCE') {
        const typed = refChildren.filter(n => n.type === 'INSTANCE');
        if (port) {
          const owner = referencePaths[port.ownerPath];
          const consumers = [...actual].filter(([p, n]) => {
            if (n.type !== 'INSTANCE') return false;
            const other = actualPort(p); return other?.ownerPath === port.ownerPath && other.property === port.property;
          });
          const refConsumers = reference.nodes.filter(n => {
            if (n.type !== 'INSTANCE') return false;
            const other = referencePort(n.path); return other?.ownerPath === owner && other.property === port.property;
          });
          if (owner === undefined || consumers.length !== 1 || refConsumers.length !== 1
            || parentPath(refConsumers[0].path) !== expectedParent) return false;
          candidates = refConsumers;
        } else if (visiblePort) {
          const owner = referencePaths[visiblePort.ownerPath];
          const consumers = [...actual].filter(([p,n]) => n.type === 'INSTANCE' && (() => {
            const other=visibilityPort(p,false); return other?.ownerPath===visiblePort.ownerPath && other.property===visiblePort.property;
          })());
          const matches = typed.filter(n => { const other=visibilityPort(n.path,true); return other?.ownerPath===owner && other.property===visiblePort.property; });
          if (owner!==undefined && consumers.length===1 && matches.length===1) {candidates=matches;uniqueVisibilityPort=true;}
          else if (sourceCandidate) candidates = [sourceCandidate];
          else {
            // A BOOLEAN may intentionally control several library children. In
            // that case it is not an identity anchor; retain strong key matching.
            const identities = typed.filter(n => compatible(node,n.path));
            if (identities.length !== 1 || children.filter(([,n]) => n.type === 'INSTANCE' && compatible(n,identities[0].path)).length !== 1) return false;
            candidates = identities;
          }
        } else if (sourceCandidate) {
          candidates = [sourceCandidate];
        } else {
          const identities = typed.filter(n => compatible(node, n.path));
          if (identities.length) {
            if (identities.length !== 1 || children.filter(([, n]) => n.type === 'INSTANCE' && compatible(n, identities[0].path)).length !== 1) return false;
            candidates = identities;
          }
          // No key correspondence: a same-path replacement remains an isolated
          // unknown boundary. Its matching name cannot grant a library baseline.
        }
      } else if(sourceCandidate) candidates=[sourceCandidate];
      if (candidates.length !== 1 || claimed.has(candidates[0].path)) return false;
      if (source && candidates[0].path !== sourceCandidate?.path) return false;
      // Capture-local IDs often contain traversal indexes. Equal addresses do
      // not prove an occurrence, even when both captures happened to use them.
      if(reference.occurrenceAddressVersion===1 && /^@(source|local):/.test(leaf(candidates[0].path))
        && !sourceCandidate && !port && !uniqueVisibilityPort)return false;
      const refPath = candidates[0].path; claimed.add(refPath); referencePaths[path] = refPath;
      if (node.type === 'SLOT' && verifiedSlot(path, refPath)) continue;
      if (node.type === 'INSTANCE') {
        const identity = aIdentity(node), other = rIdentity(refPath), refPort = referencePort(refPath);
        if (refPort === null || sourcePort(refPath, true) === null || Boolean(port) !== Boolean(refPort)) return false;
        const keysKnown = knownIdentity(node) && Boolean(other?.componentKey);
        const sameSet = Boolean(identity.componentSetKey && identity.componentSetKey === other?.componentSetKey);
        const sameIdentity = keysKnown && identity.componentKey === other!.componentKey
          && (identity.componentSetKey || '') === (other?.componentSetKey || '');
        if (!sameIdentity) {
          const variant = nestedVariants && keysKnown && !port && sameSet;
          boundaries.push({ nodeId: String(node.id), actualPath: path, referencePath: refPath,
            reason: !keysKnown ? 'instance-identity-unavailable' : port ? 'instance-swap' : variant ? 'component-variant-changed' : 'component-identity-changed',
            ...(identity.componentKey ? { actualComponentKey: identity.componentKey } : {}),
            ...(other?.componentKey ? { referenceComponentKey: other.componentKey } : {}),
            ...(variant ? { componentSetKey: identity.componentSetKey } : {}),
            ...(port ? { ownerPath: referencePaths[port.ownerPath], property: port.property } : {}) });
          continue;
        }
      }
      if (!visit(path, refPath)) return false;
    }
    return claimed.size === refChildren.length;
  };
  const complete=visit('', '');
  if(!complete && snapshot.source?.occurrenceAddressVersion===1 && reference.occurrenceAddressVersion===1){
    // A sibling with lost evidence must not prevent independent source proof
    // for the remaining children. Keep completeness false; never use local
    // addresses, names or a partial parent's position as correspondence.
    const claimed=new Set(Object.values(referencePaths));
    const nodes=[...actual].filter(([p])=>p).sort(([a],[b])=>a.split(' / ').length-b.split(' / ').length);
    for(const [path,node] of nodes){
      if(referencePaths[path]!==undefined || actualPort(path)!==undefined || visibilityPort(path,false)===null)continue;
      const source=sourcePort(path,false),parent=referencePaths[parentPath(path)];
      if(!source || parent===undefined)continue;
      const owner=referencePaths[source.ownerPath],ownerIdentity=aIdentity(actual.get(source.ownerPath)!),expectedOwner=owner!==undefined?rIdentity(owner):undefined;
      if(owner===undefined || !expectedOwner || ownerIdentity.componentKey!==expectedOwner.componentKey
        || snapshot.source?.instanceMainComponentAliasesVersion===1 && (ownerIdentity.componentSetKey || '')!==(expectedOwner.componentSetKey || '')
        || ownerIdentity.mainComponentId!==expectedOwner.mainComponentId && snapshot.source?.instanceMainComponentAliasesVersion!==1)continue;
      const consumers=nodes.filter(([p])=>{const s=sourcePort(p,false);return s?.ownerPath===source.ownerPath && s.sourceNodeId===source.sourceNodeId;});
      const candidates=reference.nodes.filter(n=>n.type===node.type && parentPath(n.path)===parent && (()=>{
        const s=sourcePort(n.path,true);return s?.ownerPath===owner && s.sourceNodeId===source.sourceNodeId && sameSourceOwner(source,s);
      })());
      if(consumers.length!==1 || candidates.length!==1 || claimed.has(candidates[0].path) || referencePort(candidates[0].path)!==undefined || visibilityPort(candidates[0].path,true)===null)continue;
      const refPath=candidates[0].path,a=aIdentity(node),b=rIdentity(refPath);
      if(node.type==='INSTANCE'){
        if(!knownIdentity(node)||!b?.componentKey)continue;
        const same=a.componentKey===b.componentKey && (a.componentSetKey || '')===(b.componentSetKey || '');
        if(!same){
          if(!nestedVariants || !a.componentSetKey || a.componentSetKey!==b.componentSetKey)continue;
          boundaries.push({nodeId:String(node.id),actualPath:path,referencePath:refPath,reason:'component-variant-changed',actualComponentKey:a.componentKey,referenceComponentKey:b.componentKey,componentSetKey:a.componentSetKey});
        }
      }
      referencePaths[path]=refPath;claimed.add(refPath);
    }
  }
  return { complete, boundaries, referencePaths };
}
