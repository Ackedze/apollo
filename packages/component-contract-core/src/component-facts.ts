import type { CompiledContract, PreviewSnapshot } from './types';
import { matchesTargetRole } from './root-target';

function unknown(node: Record<string, unknown>, path: string): boolean {
  return ((node.unknownFacts || []) as string[]).some((entry) => path === entry || path.startsWith(`${entry}.`));
}

/** Factual topology only. Policies/constraints continue to run in Predicate Engine. */
export function materializeComponentFacts(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  const roots = snapshot.nodes.filter((node) => snapshot.selection.includes(String(node.id)));
  const root = roots.length === 1 ? roots[0] : undefined;
  if ([1,2,3].includes(contract.runtimePolicy.declaredTargetIdentityVersion || 0)) {
    // The declared ledger owns identity/presence/complete-chain visibility.
    // Host projections remain observed facts, never permissions.
    const host = root ? {component:root.component || {},semanticApi:root.semanticApi || {},...(contract.runtimePolicy.nativeInstanceReplacementsVersion===1?{nativeInstanceReplacementsV1:root.nativeInstanceReplacementsV1||{}}:{})} : {};
    const hostUnknown = root ? ((root.unknownFacts || []) as string[])
      .filter(path => /^(component|semanticApi)(\.|$)/.test(path)).map(path => `host.${path}`) : ['host'];
    for (const node of snapshot.nodes) {
      node.host = JSON.parse(JSON.stringify(host));
      node.unknownFacts = [...new Set(((node.unknownFacts || []) as string[])
        .filter(path => path !== 'host' && !path.startsWith('host.')).concat(hostUnknown))];
    }
    return;
  }
  const index = new Map(snapshot.nodes.map((node) => [String(node.id), node]));
  const visibility = (node: Record<string, unknown>): boolean | undefined => {
    const visited = new Set<string>();
    let current: Record<string, unknown> | undefined = node;
    let uncertain = false;
    let hidden = false;
    while (current) {
      const id = String(current.id);
      if (visited.has(id)) return undefined;
      visited.add(id);
      if (unknown(current, 'visible') || typeof current.visible !== 'boolean') uncertain = true;
      else if (current.visible === false) hidden = true;
      if (current === root) return hidden ? false : uncertain ? undefined : true;
      current = index.get(String(current.parentId));
    }
    return undefined;
  };
  const host = root ? { component: root.component || {}, semanticApi: root.semanticApi || {} } : {};
  const hostUnknown = root ? ((root.unknownFacts || []) as string[])
    .filter((path) => /^(component|semanticApi)(\.|$)/.test(path)).map((path) => `host.${path}`) : ['host'];
  const targets: Record<string, { resolved: true; visibilityKnown?: true; present?: boolean }> = {};
  const targetsUnknown: string[] = [];
  if (['variant-facts-v4','dependency-facts-v5'].includes(contract.package.snapshotProfile || '')) {
    const roles = new Map<string, string[]>();
    for (const node of snapshot.nodes) {
      const role = (node.semantic as {role?:string})?.role;
      if (role) roles.set(role,[...(roles.get(role)||[]),String(node.id)]);
    }
    const relations = Object.fromEntries([...roles].filter(([,ids])=>ids.length===1).map(([role,ids])=>[role,ids[0]]));
    if (root && contract.runtimePolicy.rootTargetAliasesVersion === 1) for (const [role, proven] of Object.entries(root.rootTargetAliasesV1 || {})) if (proven === true) relations[role] = String(root.id);
    snapshot.nodes.forEach(node=>{node.relations={...relations};});
  }
  for (const target of contract.facts.targets) {
    const candidates = snapshot.nodes.filter((node) => matchesTargetRole(node, target.semanticRole, contract));
    const verified = (root?.variantAvailability as { targets?: Record<string, { present?: boolean }> })?.targets?.[target.semanticRole];
    if (verified?.present === false && candidates.length === 0) {
      targets[target.semanticRole] = { resolved: true, visibilityKnown: true, present: false };
    } else if (root && !snapshot.source?.truncated && (target.resolution === 'resolved' || verified?.present === true) && candidates.length === 1
      && !unknown(candidates[0], 'semantic.role')) {
      targets[target.semanticRole] = { resolved: true, ...(verified ? { present: true } : {}) };
      if (visibility(candidates[0]) !== undefined) targets[target.semanticRole].visibilityKnown = true;
      else targetsUnknown.push(`semanticTargets.${target.semanticRole}.visibilityKnown`);
    }
    else targetsUnknown.push(`semanticTargets.${target.semanticRole}`);
  }
  for (const node of snapshot.nodes) {
    const paths = new Set(((node.unknownFacts || []) as string[]).filter((path) => (
      path !== 'host' && !path.startsWith('host.') && path !== 'visibility.effective' && !path.startsWith('semanticTargets.')
    )));
    const effective = visibility(node);
    node.visibility = effective === undefined ? {} : { effective };
    if (effective === undefined) paths.add('visibility.effective');
    node.host = JSON.parse(JSON.stringify(host));
    node.semanticTargets = targets;
    hostUnknown.forEach((path) => paths.add(path));
    targetsUnknown.forEach((path) => paths.add(path));
    node.unknownFacts = [...paths];
  }
}
