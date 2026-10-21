import type { AssetCatalogEvidence, CompiledContract, DependencyBinding, PreviewSnapshot, TypedConstraint } from './types';
import { stableHash } from './stable';
import { snapshotPaths } from './snapshot-topology';
import { compareInstanceBoundaries, correspondingPath, withinBoundary } from './instance-boundaries';
import { captureVariantReference } from './variant-facts';
import { resolveFixedNestedBinding } from './component-dependencies';
import { collectionPropertyMatches, typedCollectionValue } from './member-collections';

const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const propertyName = (name: string) => name.replace(/#[^#]+$/, '');

/** Opt-in exact asset lock. A proven host variant supplies its pristine port,
 * never the replacement asset's own independently captured baseline. */
function identityLockFacts(snapshot: PreviewSnapshot, binding: DependencyBinding, owner: Record<string, any>,
  paths: Map<string,string>, originalReference: NonNullable<PreviewSnapshot['variantReference']>): Record<string,unknown> {
  const gap=(reason:string)=>({reason});
  const knownId=(value:unknown)=>typeof value==='string'&&value.length>0;
  const unknown=(node:Record<string,any>,fact:string)=>(node.unknownFacts || []).some((p:string)=>p===fact||fact.startsWith(p+'.'));
  const ownerPath=paths.get(String(owner.id))!;
  const comparison=compareInstanceBoundaries(snapshot,originalReference);
  const boundaries=(snapshot.instanceBoundaries || comparison.boundaries).filter(b=>withinBoundary(ownerPath,b.actualPath))
    .sort((a,b)=>a.actualPath.split(' / ').length-b.actualPath.split(' / ').length);
  let reference=originalReference;
  for(const boundary of boundaries){
    if(boundary.reason!=='component-variant-changed')return gap('wrapper-lineage-changed');
    const result=snapshot.instanceContentResults?.find(r=>r.boundaryNodeId===boundary.nodeId);
    const attempts=snapshot.instanceContentReferences?.attempts.filter(a=>a.boundaryNodeId===boundary.nodeId) || [];
    if(snapshot.instanceContentReferences?.schemaVersion!=='apollo.instance-content-references.v4' || !result?.lineageProven
      || attempts.length!==1 || attempts[0].failure || !attempts[0].reference)return gap('wrapper-lineage-unproven');
    const host=attempts[0].reference;
    reference=captureVariantReference(host,host.source?.componentKey || '',host.source?.componentSetKey || '');
  }
  const portComparison=compareInstanceBoundaries(snapshot,reference,true);
  const referenceOwnerPath=correspondingPath(portComparison,ownerPath);
  if(!portComparison.complete || referenceOwnerPath===undefined)return gap('original-port-unproven');
  const expectedOwner=reference.nodeProperties[referenceOwnerPath],component=record(owner.component),identity=record(component.identity);
  if(unknown(owner,'component.identity.componentKey') || unknown(owner,'component.identity.componentSetKey')
    || !knownId(identity.componentKey) || identity.componentKey!==expectedOwner?.identity?.componentKey
    || (identity.componentSetKey || '')!==(expectedOwner?.identity?.componentSetKey || ''))return gap('wrapper-identity-unproven');
  const nearestActualOwner=(node:Record<string,unknown>)=>{
    const seen=new Set<string>();let parentId=node.parentId;
    while(parentId&&!seen.has(String(parentId))){
      seen.add(String(parentId));const parent=snapshot.nodes.find(n=>n.id===parentId);
      if(!parent)return undefined;if(parent.type==='INSTANCE')return parent;
      parentId=parent.parentId;
    }
    return undefined;
  };
  const nearestReferenceOwner=(path:string)=>{
    let parent=path.split(' / ').slice(0,-1).join(' / ');
    while(parent){if(reference.nodes.some(n=>n.path===parent&&n.type==='INSTANCE'))return parent;parent=parent.split(' / ').slice(0,-1).join(' / ');}
    return '';
  };
  const actual=snapshot.nodes.filter(n=>n.type==='INSTANCE'&&nearestActualOwner(n)===owner
    && typeof record(record(n.component).propertyReferenceBindings).mainComponent==='string'
    && binding.portNames.includes(propertyName(record(record(n.component).propertyReferenceBindings).mainComponent)));
  const expected=reference.nodes.filter(n=>n.type==='INSTANCE'&&nearestReferenceOwner(n.path)===referenceOwnerPath
    && typeof reference.nodeProperties[n.path]?.propertyReferenceBindings?.mainComponent==='string'
    && binding.portNames.includes(propertyName(reference.nodeProperties[n.path].propertyReferenceBindings!.mainComponent)));
  if(actual.length!==1 || expected.length!==1)return gap('swap-consumer-unresolved');
  const asset=record(actual[0].component),assetIdentity=record(asset.identity),expectedAsset=reference.nodeProperties[expected[0].path];
  if(!expectedAsset.identity)return gap('original-port-unproven');
  const port=record(asset.propertyReferenceBindings).mainComponent;
  if(['component.identity.componentKey','component.identity.mainComponentId','component.propertyReferenceBindings.mainComponent'].some(f=>unknown(actual[0],f))
    || ['component.properties.'+port,'component.propertyTypes.'+port].some(f=>unknown(owner,f))
    || record(component.propertyTypes)[port]!=='INSTANCE_SWAP' || expectedOwner.propertyTypes[port]!=='INSTANCE_SWAP'
    || expectedAsset.propertyReferenceBindings?.mainComponent!==port || !knownId(assetIdentity.mainComponentId)
    || record(component.properties)[port]!==assetIdentity.mainComponentId || !knownId(assetIdentity.componentKey)
    || !knownId(expectedAsset.identity?.componentKey) || !knownId(expectedAsset.identity?.mainComponentId)
    || expectedOwner.properties[port]!==expectedAsset.identity.mainComponentId)return gap('original-port-unproven');
  if(assetIdentity.componentKey===expectedAsset.identity.componentKey
    && (unknown(actual[0],'component.identity.componentSetKey')
      || (assetIdentity.componentSetKey || '')!==(expectedAsset.identity.componentSetKey || '')))return gap('asset-identity-conflict');
  if(record(actual[0].visibility).effective===false)return {applicable:false,reason:'icon-hidden'};
  if(record(actual[0].visibility).effective!==true)return gap('icon-visibility-unavailable');
  return {applicable:true,changed:assetIdentity.componentKey!==expectedAsset.identity.componentKey,
    componentKey:assetIdentity.componentKey,referenceComponentKey:expectedAsset.identity.componentKey};
}

export function parseAssetCatalogs(value: unknown): AssetCatalogEvidence[] {
  if (!Array.isArray(value) || value.some(c => !c || typeof c !== 'object'
    || !['catalog','library','sourceHash','generatedAt'].every(k => typeof c[k] === 'string')
    || !c.catalog || !c.library || !c.sourceHash || !Array.isArray(c.members)
    || c.members.some((m: any) => !m || typeof m.componentKey !== 'string' || !m.componentKey
      || typeof m.componentSetKey !== 'string' || !m.componentSetKey))) {
    throw new Error('Invalid read-only asset catalog evidence. Rebuild the package from Athena indexes.');
  }
  return value as AssetCatalogEvidence[];
}

export function dependencyBinding(subject: {targetRole: string; relativePath: string}, constraint: TypedConstraint): DependencyBinding {
  const binding = {...subject, portNames: [...(constraint.dependency?.portNames || [])].sort(),
    ...(constraint.dependency?.field === 'changed' ? {identityLock:true as const} : {}),
    ...(constraint.dependency?.subjectCondition ? {subjectCondition:constraint.dependency.subjectCondition} : {}),
    ...(constraint.dependency?.contractDependencyId ? {contractDependencyId:constraint.dependency.contractDependencyId} : {}),
    ...(constraint.dependency?.field === 'variantProperty' ? {variantProperty:constraint.dependency.property} : {})};
  return { id: `d_${stableHash(binding).slice(0, 20)}`, ...binding,
    ...(['portName','width','height','variantProperty'].includes(constraint.dependency?.field || '') ? {metrics: true as const} : {}) };
}

/** Athena index -> compact immutable key membership, not a policy or name heuristic. */
export function extractAssetCatalogs(inputs: Record<string, unknown>[]): AssetCatalogEvidence[] {
  return inputs.filter(d => d.kind === 'component-index' && typeof d.catalogName === 'string'
    && typeof d.library === 'string' && Array.isArray(d.components)).map(d => ({
      catalog: String(d.catalogName), library: String(d.library), sourceHash: stableHash(d),
      generatedAt: String(d.generatedAt || ''),
      members: (d.components as any[]).flatMap(c => (Array.isArray(c.variants) ? c.variants : [])
        .filter((v: any) => typeof v.key === 'string' && v.key && typeof c.key === 'string' && c.key)
        .map((v: any) => ({componentKey: v.key, componentSetKey: c.key})))
        .sort((a,b) => a.componentKey.localeCompare(b.componentKey)),
    })).sort((a,b) => a.catalog.localeCompare(b.catalog));
}

/** Read facts only. Permission and domain checks are compiled into canonical RuleIR. */
export function materializeDependencyFacts(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  const bindings = contract.facts.dependencyBindings || [];
  const root = snapshot.nodes.filter(n => snapshot.selection.includes(String(n.id)));
  const paths = snapshotPaths(snapshot);
  const reference = snapshot.variantReference;
  const comparison = reference ? compareInstanceBoundaries(snapshot, reference) : undefined;
  const membership = new Map<string, Array<{catalog: string; library: string; componentSetKey: string}>>();
  for (const catalog of contract.facts.variantEvidence?.assetCatalogs || []) for (const m of catalog.members) {
    membership.set(m.componentKey, [...(membership.get(m.componentKey) || []), {catalog:catalog.catalog,library:catalog.library,componentSetKey:m.componentSetKey}]);
  }
  const facts: Record<string, Record<string, unknown>> = {};
  for (const b of bindings) {
    const f: Record<string, unknown> = {};
    facts[b.id] = f;
    const lockRequired=contract.rules.some(r=>record(record(r.assert).actual).fact===`dependencies.${b.id}.changed`);
    if ((b.identityLock || lockRequired) && (b.identityLock!==true || contract.runtimePolicy.assetIdentityLockVersion !== 1)) {
      f.reason = 'asset-identity-lock-version-unavailable'; continue;
    }
    if (b.subjectCondition) {
      if (contract.runtimePolicy.dependencySubjectConditionsVersion !== 1) {f.reason='dependency-subject-condition-version-unavailable';continue;}
      const targets=snapshot.nodes.filter(n=>record(n.semantic).role===b.targetRole);
      const available=record(record(root[0]?.variantAvailability).targets)[b.targetRole];
      if(targets.length!==1 || available?.present!==true){f.reason='dependency-subject-unproven';continue;}
      const matched=collectionPropertyMatches(targets[0],b.subjectCondition);
      f.subjectValue=typedCollectionValue(targets[0],b.subjectCondition);
      if(matched===undefined){f.reason='dependency-subject-property-unavailable';continue;}
      f.subjectMatches=matched;
      if(!matched){f.applicable=false;f.reason='dependency-subject-condition-inactive';continue;}
    }
    if (b.contractDependencyId) {
      const dependency=contract.componentDependencies?.find(d=>d.id===b.contractDependencyId);
      const binding=dependency?.bindings.find(d=>d.targetRole===b.targetRole&&d.relativePath===b.relativePath);
      if (!dependency || !binding || dependency.issue) {f.reason=dependency?.issue||'dependency-binding-missing';continue;}
      const result=resolveFixedNestedBinding(snapshot,dependency,binding,false,contract);
      f.reason=result.reason;
      if (result.status==='inactive') f.applicable=false;
      if (result.status!=='active' || !result.node) continue;
      if (!result.identityValid) {f.reason='dependency-child-identity-mismatch';continue;}
      f.applicable=true;
      const node=result.node, component=record(node.component), identity=record(component.identity);
      if (identity.componentKey) f.componentKey=identity.componentKey;
      if (identity.componentSetKey) f.componentSetKey=identity.componentSetKey;
      if (b.variantProperty) {
        const value=component.properties?.[b.variantProperty];
        const unavailable=((node.unknownFacts||[]) as string[]).some(p=>
          [`component.properties.${b.variantProperty}`,`component.propertyTypes.${b.variantProperty}`].some(input=>input===p||input.startsWith(p+'.')));
        if (!unavailable && component.propertyTypes?.[b.variantProperty]==='VARIANT' && typeof value==='string' && value.trim()) f.variantProperty=value;
        else f.reason='dependency-variant-property-unavailable';
      }
      for (const dim of ['width','height']) if (typeof record(node.bounds)[dim]==='number' && Number.isFinite(record(node.bounds)[dim])) f[dim]=record(node.bounds)[dim];
      continue;
    }
    if (root.length !== 1 || !paths || snapshot.source?.truncated || !comparison?.complete) { f.reason = 'reference-or-topology-unavailable'; continue; }
    const availability = record(record(root[0].variantAvailability).targets)[b.targetRole];
    if (availability?.present === false) { f.applicable = false; f.reason = 'target-absent-in-variant'; continue; }
    const targets = snapshot.nodes.filter(n => record(n.semantic).role === b.targetRole);
    if (targets.length !== 1 || availability?.present !== true) { f.reason = 'target-unresolved'; continue; }
    const target = targets[0];
    if (record(target.visibility).effective === false) { f.applicable = false; f.reason = 'target-hidden'; continue; }
    if (record(target.visibility).effective !== true) { f.reason = 'visibility-unavailable'; continue; }
    const targetPath=b.identityLock?paths.get(String(target.id))!:correspondingPath(comparison,paths.get(String(target.id))!);
    const path = [targetPath, b.relativePath].filter(Boolean).join(' / ');
    const matches = snapshot.nodes.filter(n => (b.identityLock?paths.get(String(n.id)):correspondingPath(comparison,paths.get(String(n.id))!)) === path);
    if (matches.length !== 1 || matches[0].type !== 'INSTANCE') { f.reason = 'nested-instance-unresolved'; continue; }
    const owner = matches[0], component = record(owner.component), identity = record(component.identity);
    if(b.identityLock){Object.assign(f,identityLockFacts(snapshot,b,owner,paths,reference!));continue;}
    if (!b.portNames.length) {
      f.applicable = true;
      if (typeof identity.componentKey === 'string' && identity.componentKey && typeof identity.componentSetKey === 'string' && identity.componentSetKey) {
        f.componentSetKey = identity.componentSetKey; f.componentKey = identity.componentKey;
      } else f.reason = 'component-identity-unavailable';
      continue;
    }
    // Only a proven variant of the same wrapper gets its own library port lineage.
    let portReference = reference!;
    const wrapperBoundary = comparison.boundaries.find(boundary => withinBoundary(paths.get(String(owner.id))!, boundary.actualPath));
    if (wrapperBoundary) {
      const resolved = snapshot.instanceContentResults?.find(r => r.boundaryNodeId === wrapperBoundary.nodeId && (r.status === 'matched'
        || (snapshot.instanceContentReferences?.schemaVersion === 'apollo.instance-content-references.v4' && r.lineageProven)));
      const attempts = snapshot.instanceContentReferences?.attempts.filter(a => a.boundaryNodeId === wrapperBoundary.nodeId) || [];
      const host = attempts.length === 1 && !attempts[0].failure ? attempts[0].reference : undefined;
      if (wrapperBoundary.reason !== 'component-variant-changed' || wrapperBoundary.nodeId !== owner.id || !resolved || !host) {
        f.reason = 'wrapper-lineage-changed'; continue;
      }
      portReference = captureVariantReference(host, host.source?.componentKey || '', host.source?.componentSetKey || '');
    }
    let properties = Object.entries(record(component.propertyTypes)).filter(([p,t]) => t === 'INSTANCE_SWAP' && b.portNames.includes(propertyName(p))).map(([p])=>p);
    const ownerFor = (node: Record<string, unknown>) => {
      const seen = new Set<string>(); let current = node;
      while (current.parentId && !seen.has(String(current.parentId))) {
        seen.add(String(current.parentId)); const parent = snapshot.nodes.find(n => n.id === current.parentId);
        if (!parent) return undefined;
        if (parent.type === 'INSTANCE') return parent;
        current = parent;
      }
      return undefined;
    };
    if (['apollo.instance-content-references.v3','apollo.instance-content-references.v4'].includes(snapshot.instanceContentReferences?.schemaVersion || '')) {
      // Figma exposes inactive family properties too. Resolve the actual consumer,
      // and require the same uniquely bound port in the independent reference.
      const binding = (n: Record<string, unknown>) => record(record(n.component).propertyReferenceBindings).mainComponent;
      const actualConsumers = snapshot.nodes.filter(n => n.type === 'INSTANCE' && ownerFor(n) === owner
        && typeof binding(n) === 'string' && b.portNames.includes(propertyName(binding(n))));
      const referenceOwner = (p: string): string | undefined => {
        let parent = p.split(' / ').slice(0,-1).join(' / ');
        while (parent) {
          if (portReference.nodes.some(n => n.path === parent && n.type === 'INSTANCE')) return parent;
          parent = parent.split(' / ').slice(0,-1).join(' / ');
        }
        return '';
      };
      const referenceConsumers = portReference.nodes.filter(n => n.type === 'INSTANCE' && referenceOwner(n.path) === path
        && typeof portReference.nodeProperties[n.path]?.propertyReferenceBindings?.mainComponent === 'string'
        && b.portNames.includes(propertyName(portReference.nodeProperties[n.path].propertyReferenceBindings!.mainComponent)));
      if (!actualConsumers.length && !referenceConsumers.length) {
        f.applicable = false; f.reason = 'no-icon-port-in-variant'; continue;
      }
      if (actualConsumers.length !== 1 || referenceConsumers.length !== 1) { f.reason = 'swap-consumer-unresolved'; continue; }
      const property = binding(actualConsumers[0]);
      const original = portReference.nodeProperties[referenceConsumers[0].path], originalOwner = portReference.nodeProperties[path];
      if (!properties.includes(property) || original.propertyReferenceBindings?.mainComponent !== property
        || originalOwner?.propertyTypes[property] !== 'INSTANCE_SWAP' || !original.identity?.mainComponentId
        || originalOwner.properties[property] !== original.identity.mainComponentId) { f.reason = 'original-port-unproven'; continue; }
      properties = [property];
    }
    if (!properties.length) {
      const original = portReference.nodeProperties[path];
      const referenceHasPort = Object.entries(original?.propertyTypes || {}).some(([p,t]) => t === 'INSTANCE_SWAP' && b.portNames.includes(propertyName(p)));
      if (!original || referenceHasPort) f.reason = 'swap-port-evidence-unavailable';
      else { f.applicable = false; f.reason = 'no-icon-port-in-variant'; }
      continue;
    }
    if (properties.length !== 1) { f.reason = 'ambiguous-swap-port'; continue; }
    const property = properties[0];
    const consumers = snapshot.nodes.filter(n => n.type === 'INSTANCE' && ownerFor(n) === owner
      && record(record(n.component).propertyReferenceBindings).mainComponent === property);
    if (consumers.length !== 1) { f.reason = 'swap-consumer-unresolved'; continue; }
    const icon = consumers[0], iconIdentity = record(record(icon.component).identity);
    if (!iconIdentity.mainComponentId || record(component.properties)[property] !== iconIdentity.mainComponentId || !iconIdentity.componentKey) {
      f.reason = 'swap-binding-unproven'; continue;
    }
    if (record(icon.visibility).effective === false) { f.applicable = false; f.reason = 'icon-hidden'; continue; }
    if (record(icon.visibility).effective !== true) { f.reason = 'icon-visibility-unavailable'; continue; }
    const boundary = (snapshot.instanceBoundaries || comparison.boundaries).find(b => b.nodeId === String(icon.id));
    const portComparison = snapshot.source?.instanceIdentityVersion === 1 ? compareInstanceBoundaries(snapshot,portReference,true) : undefined;
    const iconPath = correspondingPath(portComparison,paths.get(String(icon.id))!);
    const original = boundary ? portReference.nodeProperties[boundary.referencePath] : iconPath !== undefined ? portReference.nodeProperties[iconPath] : undefined;
    if (original?.propertyReferenceBindings?.mainComponent !== property || !original.identity?.componentKey) { f.reason = 'original-port-unproven'; continue; }
    f.applicable = true;
    f.changed = iconIdentity.componentKey !== original.identity.componentKey;
    f.componentKey = iconIdentity.componentKey;
    f.referenceComponentKey = original.identity.componentKey;
    if (b.variantProperty) {
      const asset = record(icon.component), value = record(asset.properties)[b.variantProperty];
      const unavailable = ((icon.unknownFacts || []) as string[]).some(p =>
        [`component.properties.${b.variantProperty}`,`component.propertyTypes.${b.variantProperty}`].some(f=>f===p||f.startsWith(`${p}.`)));
      if (!unavailable && record(asset.propertyTypes)[b.variantProperty] === 'VARIANT' && typeof value === 'string' && value.trim()) f.variantProperty = value;
      else f.reason = 'asset-variant-property-unavailable';
    }
    if (b.metrics) {
      f.portName = propertyName(property);
      // The bound asset instance, not its wrapper/vector and not a name-derived size.
      for (const dimension of ['width','height']) {
        const value = record(icon.bounds)[dimension];
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) f[dimension] = value;
      }
    }
    const entries = membership.get(iconIdentity.componentKey) || [];
    const catalogs = [...new Set(entries.map(m => m.catalog))];
    if (catalogs.length === 1 && new Set(entries.map(m=>m.library)).size === 1 && entries.every(m => m.componentSetKey === iconIdentity.componentSetKey)) f.catalog = catalogs[0];
    else f.reason = entries.length ? 'catalog-identity-conflict' : 'catalog-key-unknown';
  }
  for (const node of snapshot.nodes) {
    node.dependencies = facts;
    node.unknownFacts = ((node.unknownFacts || []) as string[]).filter(p => p !== 'dependencies' && !p.startsWith('dependencies.'));
  }
}
