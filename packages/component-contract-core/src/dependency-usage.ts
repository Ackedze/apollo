import type { CompiledContract, CompileResult, ManualSource, PreviewSnapshot, ValidationIssue } from './types';
import { dependencyPinIssue, resolveFixedNestedBinding, validatedDependencyCapture } from './component-dependencies';
import { resolveComponentProperty } from './component-property-identity';
import { captureVariantReference } from './variant-facts';
import { compareInstanceBoundaries, correspondingPath, withinBoundary } from './instance-boundaries';
import { snapshotPaths } from './snapshot-topology';
import { materializeTextContent } from './text-content-facts';
import { stableHash } from './stable';

export const DEPENDENCY_USAGE_PREFIX = 'editorDependencyUsageV1.';
const PRODUCER = 'component-contract-editor@0.2.104';
export type DependencyUsage = { id: string; dependencyId: string; bindingId: string; childTargetId: string; textProperty: string };
type UsageSource = ManualSource & { editorDependencyUsages?: { version: 1; bindings: DependencyUsage[] } };
type UsageContract = CompiledContract & {
  editorDependencyUsages?: { version: 1; bindings: DependencyUsage[]; baseProducer: string };
};
const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const unknown = (n: Record<string, any>, field: string) => (n.unknownFacts || []).some((p: string) => p === field || field.startsWith(p + '.'));
const allowedMetrics = ['nonTextChanged', 'characterCount', 'lineCount'];
const facts = (manual: ManualSource) => manual.rules.flatMap(r => r.constraints.flatMap(c => c.fact?.startsWith(DEPENDENCY_USAGE_PREFIX) ? [c.fact] : []));

export function dependencyUsageErrors(manual: ManualSource, contract?: CompiledContract): ValidationIssue[] {
  const extension = (manual as UsageSource).editorDependencyUsages, requested = facts(manual), issues: ValidationIssue[] = [];
  if (!extension && !requested.length) return issues;
  const fail = (message: string) => issues.push({level:'error',code:'EDITOR_DEPENDENCY_USAGE',path:'/editorDependencyUsages',message});
  if (manual.metadata.declaredTargetIdentityVersion !== 3) fail('Parent usage requires native declared target identity version 3.');
  if (!extension || extension.version !== 1 || Object.keys(extension).some(k => !['version','bindings'].includes(k))
    || !Array.isArray(extension.bindings) || !extension.bindings.length) { fail('Explicit dependency usage version 1 and bindings are required.'); return issues; }
  const ids = new Set<string>();
  for (const u of extension.bindings) {
    if (!u || Object.keys(u).some(k => !['id','dependencyId','bindingId','childTargetId','textProperty'].includes(k))
      || !/^[a-z][a-z0-9-]*$/.test(u.id) || ids.has(u.id) || !u.textProperty || !u.childTargetId) { fail('Usage needs unique safe ID and exact child target/text property.'); continue; }
    ids.add(u.id);
    const dependency = manual.componentDependencies?.filter(d => d.id === u.dependencyId), bindings = dependency?.[0]?.bindings.filter(b => b.id === u.bindingId);
    if (dependency?.length !== 1 || bindings?.length !== 1 || bindings[0].kind === 'direct-child') fail('Usage must name one declared fixed-nested dependency binding.');
    if (contract) {
      const child = contract.componentDependencies?.find(d => d.id === u.dependencyId)?.contract;
      const targets = child?.facts.targets.filter(t => t.id === u.childTargetId && t.resolution === 'resolved');
      const controls = child?.customizationPolicy.filter(p => ['allowed','constrained'].includes(p.permission))
        .flatMap(p => p.controlPaths).filter(p => p.kind === 'host-property' && p.property === u.textProperty);
      if (targets?.length !== 1 || !targets[0].identityBindingsV1?.length || targets[0].identityBindingsV1.some(b => b.nodeType !== 'TEXT') || !controls?.length)
        fail('Child must declare a native TEXT target and its allowed exact root TEXT control.');
    }
  }
  for (const r of manual.rules) for (const c of r.constraints.filter(c => c.fact?.startsWith(DEPENDENCY_USAGE_PREFIX))) {
    const parts = c.fact!.slice(DEPENDENCY_USAGE_PREFIX.length).split('.');
    const root = manual.targets.find(t => t.id === r.targetId);
    if (parts.length !== 2 || !ids.has(parts[0]) || !allowedMetrics.includes(parts[1]) || root?.semanticRole !== 'root' || (r.targetScope || 'self') !== 'self'
      || (parts[1] === 'nonTextChanged' ? c.type !== 'propertyDomain' || c.values?.length !== 1 || c.values[0] !== false
        : c.type !== 'layoutConstraint' || c.min !== 0 || !Number.isInteger(c.max) || c.max! < 0)) fail('Use root/self with a declared usage metric and typed boolean/range constraint.');
  }
  return issues;
}

export function decorateDependencyUsages(manual: ManualSource, result: CompileResult): CompileResult {
  const extension = (manual as UsageSource).editorDependencyUsages;
  const issues = dependencyUsageErrors(manual,result.contract);
  if (!extension && !issues.length) return result;
  if (issues.length) return {...result,issues:[...result.issues,...issues],contract:{...result.contract,status:'draft'}};
  const contract = result.contract as UsageContract;
  contract.editorDependencyUsages = {...clone(extension!),baseProducer:contract.package.sourceExportVersion};
  // The existing native-fact producer guard refuses this new envelope in older consumers.
  contract.package.sourceExportVersion = PRODUCER;
  contract.runtimePolicy.textContentFactsVersion = 1;
  contract.capabilities.facts = [...new Set([...contract.capabilities.facts,'textContentV1.characterCount'])].sort();
  return result;
}

export function sharedUsageContract(contract: CompiledContract): CompiledContract {
  const c = contract as UsageContract, extension = c.editorDependencyUsages;
  const usesFacts = contract.capabilities.facts.some(f => f.startsWith(DEPENDENCY_USAGE_PREFIX));
  if (!extension && !usesFacts) return contract;
  const base = contract.runtimePolicy.declaredTargetConfigurationVersion === 2 ? 'component-contract-editor@0.2.103'
    : contract.runtimePolicy.declaredTargetConfigurationVersion === 1 ? 'component-contract-editor@0.2.99'
      : contract.runtimePolicy.declaredTargetIdentityVersion === 3 ? 'component-contract-editor@0.2.95' : 'component-contract-editor@0.2.94';
  if (!extension || extension.version !== 1 || extension.baseProducer !== base || contract.package.sourceExportVersion !== PRODUCER
    || !Array.isArray(extension.bindings) || !extension.bindings.length) throw new Error('EDITOR_DEPENDENCY_USAGE_UNSUPPORTED');
  const ids = new Set(extension.bindings.map(u => u.id));
  if (ids.size !== extension.bindings.length || contract.capabilities.facts.filter(f => f.startsWith(DEPENDENCY_USAGE_PREFIX)).some(f => {
    const p = f.slice(DEPENDENCY_USAGE_PREFIX.length).split('.');return p.length !== 2 || !ids.has(p[0]) || !allowedMetrics.includes(p[1]);
  })) throw new Error('EDITOR_DEPENDENCY_USAGE_UNSUPPORTED');
  const declaration = {version:extension.version,bindings:extension.bindings};
  const source = {metadata:{declaredTargetIdentityVersion:contract.runtimePolicy.declaredTargetIdentityVersion},targets:contract.facts.targets,
    rules:[],componentDependencies:contract.componentDependencies,editorDependencyUsages:declaration} as unknown as ManualSource;
  if (dependencyUsageErrors(source,contract).length) throw new Error('EDITOR_DEPENDENCY_USAGE_UNSUPPORTED');
  return {...contract,package:{...contract.package,sourceExportVersion:base}};
}

function canonicalConfiguration(node: Record<string, any>, textProperty: string | undefined, aliases: Map<string,string>): Record<string, unknown> | undefined {
  const component = record(node.component), values = {...record(component.properties)}, types = record(component.propertyTypes);
  if (textProperty) delete values[textProperty];
  for (const [p,value] of Object.entries(values)) {
    if (unknown(node,'component.properties.'+p) || unknown(node,'component.propertyTypes.'+p) || !types[p]) return;
    if (types[p] === 'INSTANCE_SWAP' && typeof value === 'string' && aliases.has(value)) values[p] = {componentKey:aliases.get(value)};
  }
  return {types,values};
}

function configurationChanged(actual: Record<string,any>, expected: Record<string,any>, textProperty: string | undefined, aliases: Map<string,string>): boolean | undefined {
  const a = canonicalConfiguration(actual,textProperty,aliases), b = canonicalConfiguration(expected,textProperty,aliases);
  if (!a || !b) return;
  if (stableHash(a.types) !== stableHash(b.types)) return true;
  const av = record(a.values), bv = record(b.values), types = record(a.types);
  if (stableHash(Object.keys(av).sort()) !== stableHash(Object.keys(bv).sort())) return true;
  let unresolved = false;
  for (const p of Object.keys(av)) if (stableHash(av[p]) !== stableHash(bv[p])) {
    if (types[p] === 'INSTANCE_SWAP' && (typeof av[p] === 'string' || typeof bv[p] === 'string')) unresolved = true;
    else return true;
  }
  return unresolved ? undefined : false;
}

/** Parent source configuration stays independent of the child's allowed settings. */
function nonTextChanged(snapshot: PreviewSnapshot, childNode: Record<string, any>, binding: any, textProperty: string, labelNodeId: string): {value?:boolean;reason:string} {
  const paths = snapshotPaths(snapshot), prefix = paths?.get(String(childNode.id));
  if (!paths || !prefix || snapshot.instanceContentReferences?.schemaVersion !== 'apollo.instance-content-references.v4') return {reason:'usage-owner-reference-unavailable'};
  const nodes = new Map(snapshot.nodes.map(n => [String(n.id),n]));
  let owner: any = childNode;
  for (const _ of binding.childPath.split(' / ')) owner = nodes.get(String(owner?.parentId));
  if (!owner || !binding.ownerComponentSetKeys.includes(record(record(owner.component).identity).componentSetKey)) return {reason:'usage-owner-unproven'};
  const attempts = snapshot.instanceContentReferences.attempts.filter(a => a.boundaryNodeId === owner.id);
  const result = snapshot.instanceContentResults?.filter(r => r.boundaryNodeId === owner.id);
  const reference = attempts.length ? attempts.length === 1 && !attempts[0].failure && attempts[0].strategy === 'pristine-host-variant-properties'
    && result?.length === 1 && result[0].lineageProven ? attempts[0].reference : undefined : snapshot.instanceContentReferences.base;
  if (!reference || reference.source?.rootNodeId === snapshot.source?.rootNodeId) return {reason:'usage-owner-reference-unavailable'};
  const ref = captureVariantReference(reference,reference.source?.componentKey || '',reference.source?.componentSetKey || '');
  const comparison = compareInstanceBoundaries(snapshot,ref,true), refPaths = snapshotPaths(reference), refPrefix = correspondingPath(comparison,prefix);
  if (!comparison.complete || !refPaths || !refPrefix) return {reason:'usage-owner-correspondence-unavailable'};
  const expected = reference.nodes.filter(n => refPaths.get(String(n.id)) === refPrefix);
  if (expected.length !== 1 || expected[0].type !== 'INSTANCE') return {reason:'usage-owner-child-unproven'};
  const aliases = new Map<string,string>();
  let conflictingAlias = false;
  const alias = (id: string, key: string) => {if (aliases.has(id) && aliases.get(id) !== key) conflictingAlias = true;else aliases.set(id,key);};
  for (const s of [snapshot,reference]) {
    for (const n of s.nodes) {const i = record(record(n.component).identity);if (i.mainComponentId && i.componentKey) alias(i.mainComponentId,i.componentKey);}
    for (const o of s.source?.instanceSourceIdentityCapture?.owners || []) if (o.status === 'captured') alias(o.mainComponentId,o.componentKey);
  }
  if (conflictingAlias) return {reason:'usage-swap-alias-conflict'};
  const rootChanged = configurationChanged(childNode,expected[0],textProperty,aliases);
  if (rootChanged === undefined) return {reason:'usage-configuration-unknown'};
  if (rootChanged) return {value:true,reason:'usage-public-configuration-changed'};
  const boundaries = comparison.boundaries.filter(b => withinBoundary(b.actualPath,prefix));
  if (boundaries.some(b => b.reason === 'instance-identity-unavailable')) return {reason:'usage-descendant-identity-unknown'};
  if (boundaries.length) return {value:true,reason:'usage-descendant-configuration-changed'};
  const actual = snapshot.nodes.filter(n => withinBoundary(paths.get(String(n.id))!,prefix));
  const pristine = reference.nodes.filter(n => withinBoundary(refPaths.get(String(n.id))!,refPrefix));
  if (actual.length !== pristine.length) return {reason:'usage-subtree-incomplete'};
  for (const n of actual) {
    const p = correspondingPath(comparison,paths.get(String(n.id))!), other = pristine.filter(e => refPaths.get(String(e.id)) === p);
    if (other.length !== 1 || other[0].type !== n.type) return {reason:'usage-subtree-correspondence-unavailable'};
    const changed = configurationChanged(n,other[0],n === childNode ? textProperty : undefined,aliases);
    if (changed === undefined) return {reason:'usage-configuration-unknown'};
    if (changed) return {value:true,reason:'usage-descendant-configuration-changed'};
    // Text reflow changes bounds and local positions. Lock configuration/layout/styles
    // here; the child's geometry constraints keep their own authority and verdicts.
    const project = (node: Record<string,any>, isLabel: boolean) => {
      if (['layout','appearance','visible','variable','component.properties','component.propertyTypes','text.fontName','text.fontSize','text.lineHeight','text.letterSpacing'].some(k => unknown(node,k))) return;
      const text = {...record(node.text)}, variable = {...record(node.variable)}, component = record(node.component), identity = record(component.identity);
      if (isLabel) delete text.characters;
      delete variable.modeCatalog;
      return {layout:node.layout,appearance:node.appearance,visible:node.visible,variable,text,
        identity:{componentKey:identity.componentKey,componentSetKey:identity.componentSetKey},propertyReferenceBindings:component.propertyReferenceBindings};
    };
    const a = project(n,n.id === labelNodeId), b = project(other[0],n.id === labelNodeId);
    if (!a || !b) return {reason:'usage-non-text-facts-unknown'};
    if (stableHash(a) !== stableHash(b)) return {value:true,reason:'usage-internal-properties-changed'};
  }
  return {value:false,reason:'independent-owner-configuration-preserved'};
}

export function materializeDependencyUsages(snapshot: PreviewSnapshot, contract: CompiledContract, prepare: (source: PreviewSnapshot, contract: CompiledContract, inheritedMainAliases?: 1, ownerBaseline?: import('./component-dependencies').DependencyOwnerBaseline) => PreviewSnapshot): void {
  const extension = (contract as UsageContract).editorDependencyUsages;
  if (!extension) return;
  for (const node of snapshot.nodes) {
    delete node.editorDependencyUsageV1;
    node.unknownFacts = ((node.unknownFacts || []) as string[]).filter(p => p !== 'editorDependencyUsageV1' && !p.startsWith(DEPENDENCY_USAGE_PREFIX));
  }
  const root = snapshot.nodes.filter(n => snapshot.selection.includes(String(n.id)));
  if (root.length !== 1) return;
  const projection: Record<string,any> = {};
  root[0].editorDependencyUsageV1 = projection;
  const missing = new Set((root[0].unknownFacts || []) as string[]);
  for (const u of extension.bindings) for (const metric of allowedMetrics) missing.add(`${DEPENDENCY_USAGE_PREFIX}${u.id}.${metric}`);
  for (const u of extension.bindings) {
    const fact: Record<string,any> = {reason:'usage-dependency-unavailable'};projection[u.id] = fact;
    const ds = contract.componentDependencies?.filter(d => d.id === u.dependencyId);
    const d = ds?.length === 1 ? ds[0] : undefined, bs = d?.bindings.filter(b => b.id === u.bindingId);
    const b = bs?.length === 1 ? bs[0] : undefined;
    if (!d || !b || b.kind === 'direct-child' || d.issue || dependencyPinIssue(d,d.contract)) continue;
    const resolved = resolveFixedNestedBinding(snapshot,d,b,false,contract);fact.reason = resolved.reason;
    if (resolved.status === 'inactive') {fact.active = false;continue;}
    if (resolved.status !== 'active' || !resolved.nodeId || !resolved.node || !resolved.identityValid) continue;
    const capture = validatedDependencyCapture(snapshot,resolved.nodeId,d.contract!);
    if (!capture.snapshot || !capture.nodeMap) {fact.reason = capture.reason;continue;}
    const child = prepare(capture.snapshot,d.contract!,undefined,capture.ownerBaseline);
    materializeTextContent(child,{...d.contract!,runtimePolicy:{...d.contract!.runtimePolicy,textContentFactsVersion:1}});
    const ledger = record(child).declaredTargetIdentitiesV1;
    const targets = ledger?.targets?.filter((t:any) => t.targetId === u.childTargetId && t.status === 'resolved' && t.nodeType === 'TEXT');
    const text = targets?.length === 1 ? child.nodes.find(n => n.id === targets[0].nodeId) : undefined;
    if (!text || !capture.nodeMap[String(text.id)]) {fact.reason = 'usage-child-text-target-unproven';continue;}
    const parentLabel = capture.nodeMap[String(text.id)];
    const port = resolveComponentProperty(u.textProperty,record(resolved.node.component),['TEXT']);
    if (!('name' in port) || record(record(text.component).propertyReferenceBindings).characters !== port.name) {fact.reason = 'usage-child-text-port-unproven';continue;}
    fact.active = true;fact.nodeId = resolved.nodeId;fact.labelNodeId = parentLabel;
    for (const metric of ['characterCount','lineCount']) if (typeof record(text.textContentV1)[metric] === 'number') fact[metric] = record(text.textContentV1)[metric];
    const configuration = nonTextChanged(snapshot,resolved.node,b,port.name,parentLabel);
    fact.reason = configuration.reason;
    if (configuration.value !== undefined) fact.nonTextChanged = configuration.value;
  }
  for (const u of extension.bindings) for (const metric of allowedMetrics) if (projection[u.id][metric] !== undefined) missing.delete(`${DEPENDENCY_USAGE_PREFIX}${u.id}.${metric}`);
  root[0].unknownFacts = [...missing];
}
