import type {
  CompositionConstraint,
  CompositionContractsConfig,
  CompositionPosition,
  SubtreePropertyPolicy,
} from './compositionContractTypes';

export const COMPOSITION_CONTRACTS_SCHEMA_VERSION = 1;

export function validateCompositionContractsConfig(
  payload: unknown,
): CompositionContractsConfig {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Composition contracts config must be an object');
  }
  const candidate = payload as Partial<CompositionContractsConfig>;
  if (candidate.schemaVersion !== COMPOSITION_CONTRACTS_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported composition contracts schemaVersion: ${String(candidate.schemaVersion)}`,
    );
  }
  if (!Array.isArray(candidate.contracts)) {
    throw new Error('Composition contracts config must contain a contracts array');
  }
  if (candidate.contracts.length > 500) {
    throw new Error('Composition contracts config exceeds the 500 contract limit');
  }

  const contractIds = new Set<string>();
  for (const [index, contract] of candidate.contracts.entries()) {
    const prefix = `contracts[${index}]`;
    requireIdentifier(contract?.id, `${prefix}.id`);
    if (contractIds.has(contract.id)) {
      throw new Error(`Duplicate composition contract id: ${contract.id}`);
    }
    contractIds.add(contract.id);

    if (!hasStringArray(contract.match?.hostComponentKeys) &&
        !hasStringArray(contract.match?.hostComponentNames)) {
      throw new Error(`${prefix}.match must identify at least one host component`);
    }
    if (!hasStringArray(contract.select?.nestedComponentKeys) &&
        !hasStringArray(contract.select?.nestedComponentNames)) {
      throw new Error(`${prefix}.select must identify at least one nested component`);
    }
    if (contract.select.visibility !== undefined &&
        contract.select.visibility !== 'visible' &&
        contract.select.visibility !== 'all') {
      throw new Error(`${prefix}.select.visibility is invalid`);
    }
    if (contract.select.order !== undefined && contract.select.order !== 'document') {
      throw new Error(`${prefix}.select.order is invalid`);
    }
    if (!Array.isArray(contract.constraints) || !contract.constraints.length) {
      throw new Error(`${prefix}.constraints must not be empty`);
    }
    if (contract.constraints.length > 100) {
      throw new Error(`${prefix}.constraints exceeds the 100 constraint limit`);
    }

    const constraintIds = new Set<string>();
    for (const [constraintIndex, constraint] of contract.constraints.entries()) {
      validateConstraint(
        constraint,
        `${prefix}.constraints[${constraintIndex}]`,
        constraintIds,
      );
    }

    if (contract.subtreePropertyPolicies !== undefined) {
      if (!Array.isArray(contract.subtreePropertyPolicies) ||
          contract.subtreePropertyPolicies.length > 50) {
        throw new Error(`${prefix}.subtreePropertyPolicies is invalid`);
      }
      for (const [policyIndex, policy] of
        contract.subtreePropertyPolicies.entries()) {
        validateSubtreePropertyPolicy(
          policy,
          `${prefix}.subtreePropertyPolicies[${policyIndex}]`,
          constraintIds,
        );
      }
    }
  }

  return {
    schemaVersion: 1,
    contracts: candidate.contracts.slice(),
  };
}

function validateSubtreePropertyPolicy(
  policy: SubtreePropertyPolicy,
  prefix: string,
  ids: Set<string>,
): void {
  if (!policy || typeof policy !== 'object') {
    throw new Error(`${prefix} must be an object`);
  }
  requireIdentifier(policy.id, `${prefix}.id`);
  if (ids.has(policy.id)) {
    throw new Error(`Duplicate composition policy id: ${policy.id}`);
  }
  ids.add(policy.id);
  requireIdentifier(policy.variantProperty, `${prefix}.variantProperty`);
  if (!hasStringArray(policy.controlledProperties)) {
    throw new Error(`${prefix}.controlledProperties must be a non-empty string array`);
  }
  if (!policy.allowedPropertiesByValue ||
      typeof policy.allowedPropertiesByValue !== 'object' ||
      Array.isArray(policy.allowedPropertiesByValue) ||
      !Object.keys(policy.allowedPropertiesByValue).length) {
    throw new Error(`${prefix}.allowedPropertiesByValue must be a non-empty object`);
  }
  for (const [value, properties] of
    Object.entries(policy.allowedPropertiesByValue)) {
    requireIdentifier(value, `${prefix}.allowedPropertiesByValue key`);
    if (!Array.isArray(properties) ||
        !properties.every((property) =>
          typeof property === 'string' &&
          policy.controlledProperties.includes(property))) {
      throw new Error(
        `${prefix}.allowedPropertiesByValue.${value} contains an uncontrolled property`,
      );
    }
  }
  if (typeof policy.allowedMessage !== 'string' || !policy.allowedMessage.trim() ||
      typeof policy.violationMessage !== 'string' ||
      !policy.violationMessage.trim()) {
    throw new Error(`${prefix} requires allowedMessage and violationMessage`);
  }
}

function validateConstraint(
  constraint: CompositionConstraint,
  prefix: string,
  ids: Set<string>,
): void {
  if (!constraint || typeof constraint !== 'object') {
    throw new Error(`${prefix} must be an object`);
  }
  requireIdentifier(constraint.id, `${prefix}.id`);
  if (ids.has(constraint.id)) {
    throw new Error(`Duplicate composition constraint id: ${constraint.id}`);
  }
  ids.add(constraint.id);
  if (typeof constraint.message !== 'string' || !constraint.message.trim()) {
    throw new Error(`${prefix}.message must be a non-empty string`);
  }

  if (constraint.op === 'countBetween') {
    if (!isNonNegativeInteger(constraint.min) ||
        !isNonNegativeInteger(constraint.max) ||
        constraint.min > constraint.max) {
      throw new Error(`${prefix} requires an ordered non-negative min/max range`);
    }
    return;
  }
  if (constraint.op === 'propertyDomain') {
    requireIdentifier(constraint.property, `${prefix}.property`);
    if (!hasStringArray(constraint.values)) {
      throw new Error(`${prefix}.values must be a non-empty string array`);
    }
    return;
  }
  if (constraint.op === 'valuePosition') {
    requireIdentifier(constraint.property, `${prefix}.property`);
    requireIdentifier(constraint.value, `${prefix}.value`);
    if (!Array.isArray(constraint.positions) ||
        !constraint.positions.length ||
        !constraint.positions.every(isValidPosition)) {
      throw new Error(`${prefix}.positions is invalid`);
    }
    if (constraint.maxCount !== undefined &&
        (!Number.isInteger(constraint.maxCount) || constraint.maxCount < 1)) {
      throw new Error(`${prefix}.maxCount must be a positive integer`);
    }
    if (constraint.replacement !== undefined) {
      requireIdentifier(constraint.replacement, `${prefix}.replacement`);
    }
    return;
  }
  if (constraint.op === 'propertyEqualsHost') {
    requireIdentifier(constraint.property, `${prefix}.property`);
    if (constraint.hostProperty !== undefined) {
      requireIdentifier(constraint.hostProperty, `${prefix}.hostProperty`);
    }
    return;
  }
  if (constraint.op === 'propertyEqualsFirst') {
    requireIdentifier(constraint.property, `${prefix}.property`);
    return;
  }
  if (constraint.op === 'propertySequence') {
    requireIdentifier(constraint.property, `${prefix}.property`);
    if (!hasStringArray(constraint.values)) {
      throw new Error(`${prefix}.values must be a non-empty string array`);
    }
    return;
  }

  throw new Error(`${prefix}.op is unsupported`);
}

function isValidPosition(value: CompositionPosition): boolean {
  return value === 'first' || value === 'last' ||
    (Number.isInteger(value) && value > 0);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function requireIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}
