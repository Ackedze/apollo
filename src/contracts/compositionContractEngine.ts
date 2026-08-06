import type { CustomizationAssessment } from '../assessment/types';
import type { DiffContext, DiffEntry } from '../structure/diff';
import { buildOccurrenceKeyMap } from '../structure/occurrenceKeys';
import type { DSStructureNode } from '../types/structures';
import { evaluateCompositionConstraint } from './compositionContractRegistry';
import { getCompositionContractsConfig } from './compositionContracts';
import { getRemoteCompositionContractRegistry } from './runtimeContractRegistry';
export { setCompositionContractsConfig } from './compositionContracts';
import type {
  CompositionConstraintDecision,
  CompositionContract,
  CompositionContractContext,
  CompositionContractMember,
} from './compositionContractTypes';

export type CompositionContractEngineOptions = {
  actualStructure: DSStructureNode[];
  hostReference: DSStructureNode[];
  hostComponentKey: string | null;
  hostComponentName: string | null;
  resolveComponent: (
    key: string,
  ) => { key?: string; displayName?: string; name?: string } | null;
};

export type CompositionContractEngineResult = {
  diffs: DiffEntry[];
  matchedContractIds: string[];
  decisionCount: number;
};

export function hasMatchingCompositionContract(options: {
  hostComponentKey: string | null;
  hostComponentName: string | null;
}): boolean {
  return getActiveCompositionContracts().some((contract) =>
    matchesHost(contract, options.hostComponentKey, options.hostComponentName),
  );
}

export function applyCompositionContracts(
  diffs: DiffEntry[],
  options: CompositionContractEngineOptions,
): CompositionContractEngineResult {
  const root =
    options.actualStructure.find((node) => node.parentId === null) ??
    options.actualStructure[0] ??
    null;
  if (!root) {
    return { diffs, matchedContractIds: [], decisionCount: 0 };
  }

  const contracts = getActiveCompositionContracts().filter((contract) =>
    matchesHost(contract, options.hostComponentKey, options.hostComponentName),
  );
  if (!contracts.length) {
    return { diffs, matchedContractIds: [], decisionCount: 0 };
  }

  const allDecisions: CompositionConstraintDecision[] = [];
  for (const contract of contracts) {
    const context = buildContext(contract, root, options);
    for (const constraint of contract.constraints) {
      allDecisions.push(...evaluateCompositionConstraint(constraint, context));
    }
  }

  const structuralDecisions = allDecisions.filter((decision) => !decision.target);
  const propertyDecisions = collapsePropertyDecisions(
    allDecisions.filter(
      (decision): decision is CompositionConstraintDecision & {
        target: CompositionContractMember;
        property: string;
      } => Boolean(decision.target && decision.property),
    ),
  );
  const decisionsByTargetProperty = new Map(
    propertyDecisions.map((decision) => [
      `${decision.target.nodeId}:${decision.property}`,
      decision,
    ]),
  );
  const assessed = diffs.map((diff) => {
    const property = variantPropertyName(diff);
    const exact =
      diff.nodeId && property
        ? decisionsByTargetProperty.get(`${diff.nodeId}:${property}`) ?? null
        : null;
    return exact
      ? Object.assign({}, diff, { assessment: assessmentForDecision(exact) })
      : diff;
  });

  const existingVariantKeys = new Set(
    assessed
      .map((diff) => {
        const property = variantPropertyName(diff);
        return diff.nodeId && property ? `${diff.nodeId}:${property}` : null;
      })
      .filter((key): key is string => Boolean(key)),
  );
  for (const decision of propertyDecisions) {
    const key = `${decision.target.nodeId}:${decision.property}`;
    if (!existingVariantKeys.has(key)) {
      assessed.push(createPropertyDiff(decision, options));
      existingVariantKeys.add(key);
    }
  }
  for (const decision of structuralDecisions) {
    assessed.push(createStructuralDiff(decision, root, options));
  }

  return {
    diffs: assessed,
    matchedContractIds: contracts.map((contract) => contract.id),
    decisionCount: propertyDecisions.length + structuralDecisions.length,
  };
}

function getActiveCompositionContracts(): CompositionContract[] {
  const contractsById = new Map<string, CompositionContract>();
  for (const contract of getCompositionContractsConfig().contracts) {
    contractsById.set(contract.id, contract);
  }
  for (const entry of getRemoteCompositionContractRegistry()) {
    for (const contract of entry.contract.contracts ?? []) {
      contractsById.set(contract.id, contract);
    }
  }
  return Array.from(contractsById.values());
}

function buildContext(
  contract: CompositionContract,
  root: DSStructureNode,
  options: CompositionContractEngineOptions,
): CompositionContractContext {
  const byId = new Map(options.actualStructure.map((node) => [node.id, node]));
  const actualKeys = buildOccurrenceKeyMap(options.actualStructure);
  const referenceKeys = buildOccurrenceKeyMap(options.hostReference);
  const referenceByOccurrence = new Map(
    options.hostReference.map((node) => [referenceKeys.get(node) ?? node.path, node]),
  );
  const selected = options.actualStructure.filter((node) => {
    if (node === root || node.type !== 'INSTANCE' || !node.nodeId) return false;
    if (contract.select.visibility !== 'all' && node.visible === false) return false;
    if (nearestInstanceAncestor(node, byId)?.id !== root.id) return false;
    const identity = resolveNodeIdentity(node, options.resolveComponent);
    return matchesNested(contract, identity.key, identity.name);
  });
  const count = selected.length;
  const members = selected.map((node, index): CompositionContractMember => {
    const identity = resolveNodeIdentity(node, options.resolveComponent);
    const occurrenceKey = actualKeys.get(node) ?? node.path;
    const expected = referenceByOccurrence.get(occurrenceKey) ?? null;
    return {
      nodeId: node.nodeId!,
      nodeName: node.name,
      nodePath: node.path,
      visible: node.visible !== false,
      componentKey: identity.key,
      componentName: identity.name,
      position: index + 1,
      count,
      variantProperties: node.componentInstance?.variantProperties ?? {},
      expectedVariantProperties: expected?.componentInstance?.variantProperties ?? {},
      subtreeNodeIds: collectSubtreeNodeIds(options.actualStructure, node.id),
    };
  });

  return {
    contract,
    host: {
      nodeId: root.nodeId ?? null,
      nodeName: root.name,
      nodePath: root.path,
      componentKey: options.hostComponentKey,
      componentName: options.hostComponentName,
    },
    members,
  };
}

function collapsePropertyDecisions<T extends CompositionConstraintDecision & {
  target: CompositionContractMember;
  property: string;
}>(decisions: T[]): T[] {
  const collapsed = new Map<string, T>();
  for (const decision of decisions) {
    const key = `${decision.target.nodeId}:${decision.property}`;
    const current = collapsed.get(key);
    if (!current ||
        (current.verdict === 'expected' && decision.verdict === 'violation')) {
      collapsed.set(key, decision);
    }
  }
  return Array.from(collapsed.values());
}

function assessmentForDecision(
  decision: CompositionConstraintDecision,
): CustomizationAssessment {
  return {
    verdict: decision.verdict,
    source: 'component-contract',
    reasonCode:
      decision.verdict === 'violation'
        ? 'composition-contract-violation'
        : 'composition-contract-expected',
    ruleId: `${decision.contractId}.${decision.constraintId}`,
    contractId: decision.contractId,
    constraintId: decision.constraintId,
    evidence: decision.evidence,
    message: decision.message,
    remediation: decision.remediation,
    presentation: decision.property ? 'semantic-variant' : 'show',
    semanticVariantChanges:
      decision.target && decision.property &&
      decision.expected !== null && decision.actual !== null
        ? [{
            nodeId: decision.target.nodeId,
            property: decision.property,
            expected: String(decision.expected),
            actual: String(decision.actual),
          }]
        : [],
  };
}

function createPropertyDiff(
  decision: CompositionConstraintDecision & {
    target: CompositionContractMember;
    property: string;
  },
  options: CompositionContractEngineOptions,
): DiffEntry {
  return {
    message: `${lowercaseFirst(decision.property)}: ${String(decision.expected ?? '')} → ${String(decision.actual ?? '')}`,
    nodePath: decision.target.nodePath,
    nodeName: decision.target.nodeName,
    nodeId: decision.target.nodeId,
    visible: decision.target.visible,
    context: baseContext(options, decision.target),
    diffKind: 'other',
    details: {
      property: `variant.${decision.property}`,
      reference: { value: decision.expected },
      actual: { value: decision.actual },
    },
    assessment: assessmentForDecision(decision),
  };
}

function createStructuralDiff(
  decision: CompositionConstraintDecision,
  root: DSStructureNode,
  options: CompositionContractEngineOptions,
): DiffEntry {
  return {
    message: decision.message,
    nodePath: root.path,
    nodeName: root.name,
    nodeId: root.nodeId,
    visible: root.visible !== false,
    context: baseContext(options, null),
    diffKind: 'other',
    details: {
      property: 'composition.count',
      reference: { value: decision.expected },
      actual: { value: decision.actual },
    },
    assessment: assessmentForDecision(decision),
  };
}

function baseContext(
  options: CompositionContractEngineOptions,
  member: CompositionContractMember | null,
): DiffContext {
  return {
    actualComponentKey: options.hostComponentKey,
    referenceComponentKey: options.hostComponentKey,
    referenceOrigin: 'host',
    actualNestedOwnerComponentKey: member?.componentKey ?? null,
    actualNestedOwnerPath: member?.nodePath ?? null,
    actualNestedOwnerRelativePath: null,
    nestedOwnerComponentKey: member?.componentKey ?? null,
    nestedOwnerComponentRole: null,
    nestedOwnerPath: member?.nodePath ?? null,
    nestedOwnerRelativePath: null,
    actualVariantProperties: member?.variantProperties ?? null,
    referenceVariantProperties: member?.expectedVariantProperties ?? null,
  };
}

function matchesHost(
  contract: CompositionContract,
  key: string | null,
  name: string | null,
): boolean {
  if (contract.match.hostComponentKeys?.length &&
      (!key || !contract.match.hostComponentKeys.includes(key))) {
    return false;
  }
  if (contract.match.hostComponentNames?.length &&
      (!name || !contract.match.hostComponentNames.includes(name))) {
    return false;
  }
  return true;
}

function matchesNested(
  contract: CompositionContract,
  key: string | null,
  name: string | null,
): boolean {
  if (contract.select.nestedComponentKeys?.length &&
      (!key || !contract.select.nestedComponentKeys.includes(key))) {
    return false;
  }
  if (contract.select.nestedComponentNames?.length &&
      (!name || !contract.select.nestedComponentNames.includes(name))) {
    return false;
  }
  return true;
}

function resolveNodeIdentity(
  node: DSStructureNode,
  resolveComponent: CompositionContractEngineOptions['resolveComponent'],
): { key: string | null; name: string | null } {
  const rawKey = node.componentInstance?.componentKey ?? null;
  const component = rawKey ? resolveComponent(rawKey) : null;
  return {
    key: component?.key ?? rawKey,
    name: component?.displayName ?? component?.name ?? node.name ?? null,
  };
}

function nearestInstanceAncestor(
  node: DSStructureNode,
  byId: Map<number, DSStructureNode>,
): DSStructureNode | null {
  let parentId = node.parentId;
  while (typeof parentId === 'number') {
    const parent = byId.get(parentId) ?? null;
    if (!parent) return null;
    if (parent.type === 'INSTANCE') return parent;
    parentId = parent.parentId;
  }
  return null;
}

function collectSubtreeNodeIds(
  structure: DSStructureNode[],
  rootId: number,
): Set<string> {
  const included = new Set<number>([rootId]);
  const nodeIds = new Set<string>();
  for (const node of structure) {
    if (node.id === rootId ||
        (typeof node.parentId === 'number' && included.has(node.parentId))) {
      included.add(node.id);
      if (node.nodeId) nodeIds.add(node.nodeId);
    }
  }
  return nodeIds;
}

function variantPropertyName(diff: DiffEntry): string | null {
  const property = diff.details?.property;
  return typeof property === 'string' && property.startsWith('variant.')
    ? property.slice('variant.'.length)
    : null;
}

function lowercaseFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
