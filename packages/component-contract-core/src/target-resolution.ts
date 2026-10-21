import type { CompiledContract, PreviewSnapshot, TargetResolution } from './types';
import { slug, stableHash } from './stable';
import { snapshotPaths } from './snapshot-topology';

export const TARGET_RESOLUTION_SCHEMA = 'apollo.target-resolution.v1' as const;
export type TargetResolutionEvidence = {
  schemaVersion: typeof TARGET_RESOLUTION_SCHEMA;
  manualSourceHash: string;
  targets: Array<{
    targetId: string;
    semanticRole: string;
    resolution: TargetResolution;
    reason: string;
    nodeId?: string;
  }>;
};

const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

/** Conservative adapter for legacy/manual-only packages. No name, node-id or
 * traversal-position fallback. Athena variant evidence owns the richer route. */
export function resolveSnapshotTargets(snapshot: PreviewSnapshot, contract: CompiledContract): TargetResolutionEvidence {
  const paths = snapshotPaths(snapshot);
  const byId = new Map(snapshot.nodes.map(node => [String(node.id), node]));
  const keys = [snapshot.source?.componentKey, snapshot.source?.componentSetKey].filter(Boolean);
  const representations = contract.facts.representations.filter(rep => rep.kind === 'figma'
    && rep.status !== 'deprecated' && rep.platform === snapshot.context.platform
    && keys.some(key => key === rep.locator.componentKey || key === rep.locator.componentSetKey));
  const targets: TargetResolutionEvidence['targets'] = contract.facts.targets.map(target => {
    const result: TargetResolutionEvidence['targets'][number] = {
      targetId: target.id, semanticRole: target.semanticRole, resolution: 'unknown', reason: 'topology-incomplete-or-ambiguous',
    };
    if (!paths) return result;
    if (representations.length !== 1) return { ...result, reason: 'representation-unresolved' };
    if (target.resolution !== 'resolved') return { ...result, reason: 'authoring-target-unresolved' };
    const hints = target.representationHints?.filter(h => h.representationId === representations[0].id) || [];
    if (hints.length > 1) return { ...result, resolution: 'ambiguous', reason: 'representation-hints-ambiguous' };
    const hint = hints[0];
    if (!hint && ![representations[0].locator.componentKey, representations[0].locator.componentSetKey].includes(contract.facts.component.componentKey)) {
      return { ...result, reason: 'representation-hint-missing' };
    }
    const pathHint = hint?.pathHint || target.pathHint;
    if (!pathHint) return { ...result, reason: 'path-hint-missing' };
    const path = pathHint.split(' / ').slice(1).join(' / ');
    const candidates = snapshot.nodes.filter(node => paths.get(String(node.id)) === path);
    if (candidates.length !== 1) return { ...result, reason: 'path-needs-remap' };
    const node = candidates[0];
    // The old fingerprint is a path/type/order guard, not a durable semantic ID.
    // It can refuse drift, but it must never be used to guess another destination.
    const fingerprint = hint?.structuralFingerprint || target.structuralFingerprint;
    if (path !== '' && !fingerprint) return { ...result, reason: 'structural-anchor-missing' };
    if (fingerprint) {
      const types = path === '' ? ['INSTANCE', 'COMPONENT', 'COMPONENT_SET'] : [String(node.type)];
      if (!types.some(type => stableHash({ type, path: pathHint, order: node.order }).slice(0, 16) === fingerprint)) {
        return { ...result, reason: 'structural-anchor-changed' };
      }
    }
    const declaredLineage = hint?.pathHint ? undefined : target.lineage;
    const hintLineage = pathHint.split('/').slice(0, -1).map(part => slug(part.trim()));
    if (declaredLineage && stableHash(declaredLineage) !== stableHash(hintLineage)) return { ...result, reason: 'lineage-hint-conflict' };
    // A path-only legacy anchor cannot prove identity inside a nested component.
    // Such targets require the generated variant/reference route, never a name guess.
    let current: Record<string, unknown> | undefined = node;
    const actualSegments: string[] = [];
    while (current && current.parentId !== null) {
      if (current.type === 'INSTANCE') return { ...result, reason: 'nested-lineage-unproven' };
      actualSegments.unshift(String(current.name));
      current = byId.get(String(current.parentId));
    }
    if (stableHash(actualSegments) !== stableHash(pathHint.split(' / ').slice(1))) return { ...result, reason: 'lineage-hint-conflict' };
    return { ...result, resolution: 'resolved', reason: 'exact-structural-anchor', nodeId: String(node.id) };
  });
  for (const target of targets) {
    if (targets.filter(other => other.semanticRole === target.semanticRole).length > 1
      || (target.nodeId && targets.filter(other => other.nodeId === target.nodeId).length > 1)) {
      target.resolution = 'ambiguous'; target.reason = 'target-collision';
    }
  }
  return { schemaVersion: TARGET_RESOLUTION_SCHEMA, manualSourceHash: contract.package.manualSourceHash, targets };
}

/** Recompute from observed facts on every replay; do not trust stored resolutions. */
export function materializeTargetResolution(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  const evidence = resolveSnapshotTargets(snapshot, contract);
  snapshot.targetResolution = evidence;
  const bindings = new Map(evidence.targets.filter(t => t.resolution === 'resolved').map(t => [t.nodeId, t.semanticRole]));
  const relations = Object.fromEntries([...bindings].map(([id, role]) => [role, id]));
  for (const node of snapshot.nodes) {
    const role = bindings.get(String(node.id));
    // Captured name-derived roles are diagnostic hints, never semantic authority.
    node.semantic = { ...record(node.semantic), role: role || '' };
    node.relations = { ...relations };
    // Unassigned is distinct from a possibly matching name-derived role. The
    // per-target gap is reported separately; unrelated proven targets still run.
    node.unknownFacts = ((node.unknownFacts || []) as string[]).filter(path => path !== 'semantic.role');
  }
}

export function targetResolutionReason(reason: string): string {
  const labels: Record<string, string> = {
    'topology-incomplete-or-ambiguous': 'структура снимка неполна или неоднозначна',
    'representation-unresolved': 'не подтверждён единственный Figma-компонент и его платформа',
    'authoring-target-unresolved': 'цель не подтверждена в manual source',
    'representation-hints-ambiguous': 'для представления заданы конфликтующие привязки',
    'representation-hint-missing': 'для этого представления нет явной привязки цели',
    'path-hint-missing': 'нет явного пути к цели',
    'path-needs-remap': 'исходный путь не найден; совпадения имени или node ID недостаточно',
    'structural-anchor-missing': 'нет структурного подтверждения цели',
    'structural-anchor-changed': 'тип или структура цели изменились после подготовки контракта',
    'lineage-hint-conflict': 'lineage не соответствует объявленному пути',
    'nested-lineage-unproven': 'для вложенного компонента нужны Athena variant facts и независимый эталон',
    'target-collision': 'несколько целей претендуют на один слой или semantic role',
    'exact-structural-anchor': 'точный путь и структурная привязка подтверждены',
  };
  return labels[reason] || reason;
}
