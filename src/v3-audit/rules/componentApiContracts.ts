import type { DiffEntry } from '../structure/diff';
import type { DSStructureNode } from '../types/structures';

export type ComponentApiVariantKey = {
  key: string;
  name: string;
  properties: Record<string, string>;
};

export type RuntimeComponentApiContract = {
  id: string;
  name: string;
  normalizedName: string;
  componentKey: string;
  status: string;
  role: string;
  platform: string;
  figma: {
    variants: {
      properties: Record<string, string[]>;
      allowedCombinations: Array<Record<string, string>>;
      variantKeys: ComponentApiVariantKey[];
    };
  };
};

export type RuntimeComponentApiRegistryEntry = {
  packageComponentKey: string;
  packageName?: string;
  aliases: string[];
  figmaKeys: string[];
  contracts: RuntimeComponentApiContract[];
};

export type ComponentApiContractResolver = (
  componentKey: string,
) => RuntimeComponentApiContract | null;

type JsonRecord = Record<string, unknown>;

export function compileGeneratedComponentApiArtifact(
  payload: unknown,
  packageComponentKey: string,
  packageName: string | undefined,
  aliases: string[],
  figmaKeys: string[],
): RuntimeComponentApiRegistryEntry {
  const document = asRecord(payload, 'contract.generated.json');
  const isCurrentSchema = document.schemaVersion === 'apollo.ds-contracts.v1';
  const isLegacySchema =
    document.schemaVersion === 1 &&
    document.documentType === 'component-contract-generated';
  if (!isCurrentSchema && !isLegacySchema) {
    throw new Error(
      'contract.generated.json must use schemaVersion apollo.ds-contracts.v1 or supported component-contract-generated schemaVersion 1',
    );
  }
  const contractValues = isCurrentSchema ? document.contracts : document.components;
  if (!Array.isArray(contractValues) || !contractValues.length) {
    throw new Error(
      `contract.generated.json requires non-empty ${isCurrentSchema ? 'contracts' : 'components'}[]`,
    );
  }

  const figmaKeyOwners = new Map<string, string>();
  const contracts = contractValues.map((value, index) => {
    const contract = isCurrentSchema
      ? compileComponentApiContract(value, index)
      : compileLegacyComponentApiContract(value, index);
    registerFigmaKey(figmaKeyOwners, contract.componentKey, contract.id);
    for (const variant of contract.figma.variants.variantKeys) {
      registerFigmaKey(figmaKeyOwners, variant.key, contract.id);
    }
    return contract;
  });

  return {
    packageComponentKey,
    packageName,
    aliases: aliases.slice(),
    figmaKeys: figmaKeys.slice(),
    contracts,
  };
}

function compileLegacyComponentApiContract(
  value: unknown,
  index: number,
): RuntimeComponentApiContract {
  const label = `components[${index}]`;
  const component = asRecord(value, label);
  const variants = asRecord(component.variants, `${label}.variants`);
  const propertiesRecord = asRecord(
    variants.properties,
    `${label}.variants.properties`,
  );
  const properties: Record<string, string[]> = {};
  for (const [property, values] of Object.entries(propertiesRecord)) {
    properties[requireString(property, `${label}.variant property`)] =
      requireStringArray(values, `${label}.variants.properties.${property}`);
  }

  const combinations = requireRecordArray(
    variants.allowedCombinations,
    `${label}.variants.allowedCombinations`,
  );
  const allowedCombinations = combinations.map((combination, combinationIndex) =>
    compileVariantProperties(
      asRecord(
        combination.properties,
        `${label}.variants.allowedCombinations[${combinationIndex}].properties`,
      ),
      `${label}.variants.allowedCombinations[${combinationIndex}].properties`,
      properties,
    ),
  );
  const variantKeys = combinations.map((combination, combinationIndex) => ({
    key: requireString(
      combination.key,
      `${label}.variants.allowedCombinations[${combinationIndex}].key`,
    ),
    name: requireString(
      combination.name,
      `${label}.variants.allowedCombinations[${combinationIndex}].name`,
    ),
    properties: allowedCombinations[combinationIndex],
  }));
  const normalizedName = requireString(
    component.normalizedName,
    `${label}.normalizedName`,
  );
  const platform = requireString(component.platform, `${label}.platform`);

  return {
    id: `${normalizedName}.${platform}`,
    name: requireString(component.name, `${label}.name`),
    normalizedName,
    componentKey: requireString(component.key, `${label}.key`),
    status: requireString(component.status, `${label}.status`),
    role: requireString(component.role, `${label}.role`),
    platform,
    figma: {
      variants: {
        properties,
        allowedCombinations,
        variantKeys,
      },
    },
  };
}

function registerFigmaKey(
  owners: Map<string, string>,
  figmaKey: string,
  contractId: string,
): void {
  const existingOwner = owners.get(figmaKey);
  if (existingOwner && existingOwner !== contractId) {
    throw new Error(
      `contract.generated.json maps Figma key ${figmaKey} to both ${existingOwner} and ${contractId}`,
    );
  }
  owners.set(figmaKey, contractId);
}

export function createComponentApiVariantDiffs(
  actualNodes: DSStructureNode[],
  resolveContract: ComponentApiContractResolver,
  existingDiffs: DiffEntry[] = [],
): DiffEntry[] {
  const existingKeys = new Set(existingDiffs.map(makeDiffKey));
  const result: DiffEntry[] = [];

  for (const node of actualNodes) {
    const instance = node.componentInstance;
    if (!instance?.componentKey || !instance.variantProperties) continue;
    const contract = resolveContract(instance.componentKey);
    if (!contract) continue;

    const properties = instance.variantProperties;
    const allowedProperties = contract.figma.variants.properties;
    for (const [property, actual] of Object.entries(properties)) {
      const allowed = allowedProperties[property];
      if (!allowed) {
        pushApiDiff({
          result,
          existingKeys,
          node,
          contract,
          property: `variant.${property}`,
          expected: 'Параметр не объявлен в Component API',
          actual,
          reasonCode: 'component-api-unknown-variant-property',
          message: `Параметр ${property} отсутствует в Component API ${contract.name}`,
          evidence: { property, allowedProperties: Object.keys(allowedProperties) },
        });
        continue;
      }
      if (!allowed.includes(actual)) {
        pushApiDiff({
          result,
          existingKeys,
          node,
          contract,
          property: `variant.${property}`,
          expected: allowed.join(', '),
          actual,
          reasonCode: 'component-api-invalid-variant-value',
          message: `Значение ${property}=${actual} отсутствует в Component API ${contract.name}`,
          evidence: { property, allowedValues: allowed.slice() },
        });
      }
    }

    const combinations = contract.figma.variants.allowedCombinations;
    if (
      combinations.length > 0 &&
      Object.keys(properties).every((property) => allowedProperties[property]) &&
      !combinations.some((combination) => combinationMatches(combination, properties))
    ) {
      pushApiDiff({
        result,
        existingKeys,
        node,
        contract,
        property: 'variant.combination',
        expected: `${combinations.length} допустимых комбинаций`,
        actual: formatVariantProperties(properties),
        reasonCode: 'component-api-invalid-variant-combination',
        message: `Комбинация параметров отсутствует в Component API ${contract.name}`,
        evidence: {
          actualProperties: Object.assign({}, properties),
          allowedCombinations: combinations.map((item) => Object.assign({}, item)),
        },
      });
    }
  }

  return result;
}

function compileComponentApiContract(
  value: unknown,
  index: number,
): RuntimeComponentApiContract {
  const label = `contracts[${index}]`;
  const contract = asRecord(value, label);
  const figma = asRecord(contract.figma, `${label}.figma`);
  const variants = asRecord(figma.variants, `${label}.figma.variants`);
  const propertiesRecord = asRecord(
    variants.properties,
    `${label}.figma.variants.properties`,
  );
  const properties: Record<string, string[]> = {};
  for (const [property, values] of Object.entries(propertiesRecord)) {
    properties[requireString(property, `${label}.variant property`)] =
      requireStringArray(values, `${label}.figma.variants.properties.${property}`);
  }

  const combinations = requireRecordArray(
    variants.allowedCombinations,
    `${label}.figma.variants.allowedCombinations`,
  ).map((combination, combinationIndex) =>
    compileVariantProperties(
      combination,
      `${label}.figma.variants.allowedCombinations[${combinationIndex}]`,
      properties,
    ),
  );
  const variantKeys = requireRecordArray(
    variants.variantKeys,
    `${label}.figma.variants.variantKeys`,
  ).map((variant, variantIndex) => ({
    key: requireString(
      variant.key,
      `${label}.figma.variants.variantKeys[${variantIndex}].key`,
    ),
    name: requireString(
      variant.name,
      `${label}.figma.variants.variantKeys[${variantIndex}].name`,
    ),
    properties: compileVariantProperties(
      asRecord(
        variant.properties,
        `${label}.figma.variants.variantKeys[${variantIndex}].properties`,
      ),
      `${label}.figma.variants.variantKeys[${variantIndex}].properties`,
      properties,
    ),
  }));

  return {
    id: requireString(contract.id, `${label}.id`),
    name: requireString(contract.name, `${label}.name`),
    normalizedName: requireString(
      contract.normalizedName,
      `${label}.normalizedName`,
    ),
    componentKey: requireString(contract.componentKey, `${label}.componentKey`),
    status: requireString(contract.status, `${label}.status`),
    role: requireString(contract.role, `${label}.role`),
    platform: requireString(contract.platform, `${label}.platform`),
    figma: {
      variants: {
        properties,
        allowedCombinations: combinations,
        variantKeys,
      },
    },
  };
}

function compileVariantProperties(
  record: JsonRecord,
  label: string,
  allowedProperties: Record<string, string[]>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [property, rawValue] of Object.entries(record)) {
    const value = requireString(rawValue, `${label}.${property}`);
    const allowed = allowedProperties[property];
    if (!allowed) {
      throw new Error(`${label} contains unknown variant property: ${property}`);
    }
    if (!allowed.includes(value)) {
      throw new Error(`${label} contains unsupported ${property}=${value}`);
    }
    result[property] = value;
  }
  return result;
}

function pushApiDiff(options: {
  result: DiffEntry[];
  existingKeys: Set<string>;
  node: DSStructureNode;
  contract: RuntimeComponentApiContract;
  property: string;
  expected: string;
  actual: string;
  reasonCode: string;
  message: string;
  evidence: Record<string, unknown>;
}): void {
  const diff: DiffEntry = {
    message: `${options.property}: ${options.expected} → ${options.actual}`,
    nodePath: options.node.path,
    nodeName: options.node.name,
    nodeId: options.node.nodeId,
    visible: options.node.visible,
    context: {
      actualComponentKey: options.node.componentInstance?.componentKey ?? null,
      referenceComponentKey: null,
      referenceOrigin: 'host',
      actualNestedOwnerComponentKey: null,
      actualNestedOwnerPath: null,
      actualNestedOwnerRelativePath: null,
      nestedOwnerComponentKey: null,
      nestedOwnerComponentRole: null,
      nestedOwnerPath: null,
      nestedOwnerRelativePath: null,
      actualVariantProperties:
        options.node.componentInstance?.variantProperties ?? null,
      referenceVariantProperties: null,
    },
    diffKind: 'other',
    details: {
      property: options.property,
      reference: {value: options.expected},
      actual: {value: options.actual},
    },
    assessment: {
      verdict: 'violation',
      source: 'component-contract',
      reasonCode: options.reasonCode,
      ruleId: `component-api:${options.contract.id}`,
      contractId: options.contract.id,
      constraintId: options.reasonCode,
      evidence: options.evidence,
      message: options.message,
      remediation: null,
      presentation: 'show',
    },
  };
  const key = makeDiffKey(diff);
  if (options.existingKeys.has(key)) return;
  options.existingKeys.add(key);
  options.result.push(diff);
}

function combinationMatches(
  expected: Record<string, string>,
  actual: Record<string, string>,
): boolean {
  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual);
  return (
    expectedKeys.length === actualKeys.length &&
    expectedKeys.every((property) => expected[property] === actual[property])
  );
}

function formatVariantProperties(properties: Record<string, string>): string {
  return Object.keys(properties)
    .sort()
    .map((property) => `${property}=${properties[property]}`)
    .join(', ');
}

function makeDiffKey(diff: DiffEntry): string {
  return `${diff.nodeId ?? diff.nodePath}|${diff.details?.property ?? diff.message}`;
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function requireRecordArray(value: unknown, label: string): JsonRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((item, index) => asRecord(item, `${label}[${index}]`));
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.length) {
    throw new Error(`${label} must be a non-empty string array`);
  }
  return value.map((item, index) => requireString(item, `${label}[${index}]`));
}
