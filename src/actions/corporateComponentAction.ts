/// <reference types="@figma/plugin-typings" />

import {
  ensureReferenceCatalogsForKeys,
  findComponent,
  getCorporateCounterpart,
} from '../reference/library';
import type { LibraryComponent } from '../reference/libraryTypes';
export {
  getCorporateCounterpart,
  rebuildCorporateCounterpartIndex,
} from '../reference/library';
import {
  countVariantPropertyMatches,
  parseVariantName,
  variantMatchesSourceWithDefaultExtras,
  variantPropertiesEqual,
} from '../utils/variantProperties';

export type CorporateComponentActionResult =
  | { ok: true; node: InstanceNode }
  | { ok: false; message: string };

export type CorporateReplacementAttempt = {
  phase: string;
  error: string;
};

export type CorporateReplacementResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      attempts: CorporateReplacementAttempt[];
    };

export async function applyCorporateComponentReplacement(input: {
  nodeId: string;
  replacementComponentKey?: string | null;
}): Promise<CorporateComponentActionResult> {
  const node = await resolveCorporateActionNodeById(input.nodeId);
  if (!node || node.type !== 'INSTANCE') {
    return { ok: false, message: 'Не удалось найти инстанс для замены.' };
  }

  const replaced = await replaceCorporateInstance(
    node,
    input.replacementComponentKey ?? null,
  );
  if (!replaced.ok) {
    return {
      ok: false,
      message: formatCorporateReplacementFailure(replaced),
    };
  }

  return { ok: true, node };
}

export async function applyComponentFindingReplacement(input: {
  nodeId: string;
  expectedComponentKey: string;
  targetComponentKey: string;
}): Promise<CorporateComponentActionResult> {
  const node = await resolveCorporateActionNodeById(input.nodeId);
  if (!node || node.type !== 'INSTANCE') {
    return { ok: false, message: 'Не удалось найти инстанс для замены.' };
  }

  const mainComponent = await node.getMainComponentAsync();
  if (!mainComponent || mainComponent.key !== input.expectedComponentKey) {
    return {
      ok: false,
      message: 'Компонент изменился после проверки. Запустите проверку ещё раз.',
    };
  }

  const replaced = await replaceCorporateInstance(
    node,
    input.targetComponentKey,
  );
  if (!replaced.ok) {
    return {
      ok: false,
      message: formatCorporateReplacementFailure(replaced),
    };
  }

  return { ok: true, node };
}

/**
 * `getNodeByIdAsync` does not resolve ids of rendered sublayers inside an
 * instance (for example `I11647:10616;37705:55361`). Resolve the owning
 * instance first and then find the exact rendered node in its subtree.
 */
export async function resolveCorporateActionNodeById(
  nodeId: string,
): Promise<SceneNode | null> {
  const directNode = await figma.getNodeByIdAsync(nodeId);
  if (directNode && directNode.type !== 'DOCUMENT' && directNode.type !== 'PAGE') {
    return directNode as SceneNode;
  }

  const ownerMatch = /^I([^;]+);/.exec(nodeId);
  const ownerId = ownerMatch?.[1] ?? null;
  if (!ownerId) {
    return null;
  }

  const ownerNode = await figma.getNodeByIdAsync(ownerId);
  if (!ownerNode || !('findOne' in ownerNode)) {
    return null;
  }

  const nestedNode = ownerNode.findOne((candidate) => candidate.id === nodeId);
  if (!nestedNode || nestedNode.type === 'PAGE') {
    return null;
  }
  return nestedNode as SceneNode;
}

export async function replaceCorporateInstance(
  instance: InstanceNode,
  replacementComponentKey?: string | null,
): Promise<CorporateReplacementResult> {
  const attempts: CorporateReplacementAttempt[] = [];
  const sourceProperties = snapshotInstanceComponentProperties(instance);
  let mainComponent: ComponentNode | null = null;
  try {
    mainComponent = await instance.getMainComponentAsync();
  } catch (error) {
    return replacementFailure('source-component-read', error, attempts);
  }
  const componentKey = mainComponent?.key ?? null;
  try {
    await ensureReferenceCatalogsForKeys([componentKey, replacementComponentKey]);
  } catch (error) {
    return replacementFailure('catalog-load', error, attempts);
  }
  const reference = componentKey ? findComponent(componentKey) : null;
  if (!reference) {
    return replacementFailure(
      'source-reference',
      `component ${componentKey ?? 'without-key'} is absent from the catalog`,
      attempts,
    );
  }

  const replacementReference = replacementComponentKey
    ? findComponent(replacementComponentKey)
    : null;
  const pair = replacementReference ? null : getCorporateCounterpart(reference);
  const baseComponent = replacementReference ?? pair?.base ?? null;
  if (!baseComponent) {
    return replacementFailure(
      'base-reference',
      `replacement ${replacementComponentKey ?? 'counterpart'} is absent from the catalog`,
      attempts,
    );
  }

  const currentVariantName =
    reference.variants?.find((variant) => variant.key === componentKey)?.name ??
    null;
  const candidateVariantKey =
    currentVariantName && baseComponent.variants?.length
      ? findBestCatalogVariantKey(baseComponent, currentVariantName)
      : null;

  if (candidateVariantKey) {
    let targetVariant: ComponentNode | null = null;
    try {
      targetVariant = await figma.importComponentByKeyAsync(
        candidateVariantKey,
      );
    } catch (error) {
      recordReplacementAttempt(
        attempts,
        'direct-variant-import',
        error,
      );
    }
    if (
      targetVariant &&
      (await swapCorporateTarget(
        instance,
        targetVariant,
        sourceProperties,
        'direct-variant',
        attempts,
      ))
    ) {
      return { ok: true };
    }
  }

  const baseComponentKey = baseComponent.key ?? null;
  if (!baseComponentKey) {
    return replacementFailure(
      'base-component-key',
      'base component does not have a key',
      attempts,
    );
  }

  if (baseComponent.variants?.length) {
    let componentSet: ComponentSetNode | null = null;
    try {
      componentSet = await figma.importComponentSetByKeyAsync(
        baseComponentKey,
      );
    } catch (error) {
      recordReplacementAttempt(attempts, 'component-set-import', error);
    }
    if (componentSet) {
      const targetVariant = findMatchingVariantInSet(
        componentSet,
        instance,
        currentVariantName,
      );

      if (!targetVariant) {
        recordReplacementAttempt(
          attempts,
          'component-set-match',
          `variant ${currentVariantName ?? 'unknown'} was not found`,
        );
      } else if (
        await swapCorporateTarget(
          instance,
          targetVariant,
          sourceProperties,
          'component-set-variant',
          attempts,
        )
      ) {
        return { ok: true };
      }
    }
    return replacementFailureFromAttempts('variant-replacement', attempts);
  }

  let targetComponent: ComponentNode | null = null;
  try {
    targetComponent = await figma.importComponentByKeyAsync(
      baseComponentKey,
    );
  } catch (error) {
    recordReplacementAttempt(attempts, 'component-import', error);
  }
  if (
    targetComponent &&
    (await swapCorporateTarget(
      instance,
      targetComponent,
      sourceProperties,
      'component',
      attempts,
    ))
  ) {
    return { ok: true };
  }
  return replacementFailureFromAttempts('component-replacement', attempts);
}

export async function swapCorporateTarget(
  instance: InstanceNode,
  targetComponent: ComponentNode,
  sourceProperties: InstanceComponentPropertySnapshot[],
  phase: string,
  attempts: CorporateReplacementAttempt[],
): Promise<boolean> {
  try {
    instance.swapComponent(targetComponent);
  } catch (error) {
    recordReplacementAttempt(attempts, `${phase}-swap`, error);
    return false;
  }

  try {
    const appliedComponent = await instance.getMainComponentAsync();
    if (!appliedComponent || appliedComponent.key !== targetComponent.key) {
      recordReplacementAttempt(
        attempts,
        `${phase}-verify`,
        `expected ${targetComponent.key}, received ${appliedComponent?.key ?? 'none'}`,
      );
      return false;
    }
  } catch (error) {
    recordReplacementAttempt(attempts, `${phase}-verify`, error);
    return false;
  }

  try {
    restoreCompatibleInstanceProperties(instance, sourceProperties);
  } catch (error) {
    console.warn('[Apollo] component swapped but overrides were not restored', {
      nodeId: instance.id,
      targetComponentKey: targetComponent.key,
      phase,
      error: describeError(error),
    });
  }
  return true;
}

function replacementFailure(
  phase: string,
  error: unknown,
  attempts: CorporateReplacementAttempt[],
): CorporateReplacementResult {
  recordReplacementAttempt(attempts, phase, error);
  return replacementFailureFromAttempts(phase, attempts);
}

function replacementFailureFromAttempts(
  reason: string,
  attempts: CorporateReplacementAttempt[],
): CorporateReplacementResult {
  console.error('[Apollo] corporate component replacement failed', {
    reason,
    attempts,
  });
  return { ok: false, reason, attempts };
}

function recordReplacementAttempt(
  attempts: CorporateReplacementAttempt[],
  phase: string,
  error: unknown,
): void {
  attempts.push({ phase, error: describeError(error) });
}

function formatCorporateReplacementFailure(
  failure: Extract<CorporateReplacementResult, { ok: false }>,
): string {
  const lastAttempt = failure.attempts[failure.attempts.length - 1];
  if (!lastAttempt) {
    return `Не удалось заменить компонент (${failure.reason}).`;
  }
  const detail = lastAttempt.error.slice(0, 160);
  return `Не удалось заменить компонент (${lastAttempt.phase}: ${detail}).`;
}

export function findMatchingVariantInSet(
  componentSet: ComponentSetNode,
  instance: InstanceNode,
  currentVariantName: string | null,
): ComponentNode | null {
  const instanceVariantProperties = instance.variantProperties ?? {};
  const defaultVariantProperties = getDefaultVariantProperties(componentSet);
  const variants = componentSet.children.filter(
    (child): child is ComponentNode => child.type === 'COMPONENT',
  );

  const exactByName = currentVariantName
    ? variants.find((variant) => variant.name === currentVariantName) ?? null
    : null;
  if (exactByName) {
    return exactByName;
  }

  const byCurrentVariantName = currentVariantName
    ? chooseBestVariantByName(
        variants,
        currentVariantName,
        defaultVariantProperties,
      )
    : null;
  if (byCurrentVariantName) {
    return byCurrentVariantName;
  }

  const exactByProperties = variants.find((variant) =>
    variantPropertiesEqual(
      variant.variantProperties ?? {},
      instanceVariantProperties,
    ),
  );
  if (exactByProperties) {
    return exactByProperties;
  }

  const defaultCompatible = variants.find((variant) =>
    variantMatchesSourceWithDefaultExtras(
      variant.variantProperties ?? {},
      instanceVariantProperties,
      defaultVariantProperties,
    ),
  );
  if (defaultCompatible) {
    return defaultCompatible;
  }

  const bestByOverlap = variants
    .map((variant) => ({
      variant,
      score: countVariantPropertyMatches(
        variant.variantProperties ?? {},
        instanceVariantProperties,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.variant;
  if (bestByOverlap) {
    return bestByOverlap;
  }

  return variants[0] ?? null;
}

export function findBestCatalogVariantKey(
  component: LibraryComponent,
  sourceVariantName: string,
): string | null {
  const variants = component.variants ?? [];
  if (!variants.length) {
    return null;
  }

  const exactMatch = variants.find(
    (variant) => variant.name === sourceVariantName,
  );
  if (exactMatch?.key) {
    return exactMatch.key;
  }

  const defaultVariantKey =
    typeof (component as { defaultVariant?: unknown }).defaultVariant ===
    'string'
      ? (component as { defaultVariant?: string }).defaultVariant ?? null
      : null;
  const defaultVariantName =
    variants.find((variant) => variant.key === defaultVariantKey)?.name ??
    variants[0]?.name ??
    '';
  const compatibleVariant = chooseBestVariantByName(
    variants,
    sourceVariantName,
    parseVariantName(defaultVariantName),
  );

  return compatibleVariant?.key ?? null;
}

export function chooseBestVariantByName<T extends { name?: string | null }>(
  variants: T[],
  sourceVariantName: string,
  defaultVariantProperties: Record<string, string>,
): T | null {
  const sourceVariantProperties = parseVariantName(sourceVariantName);
  const sourceEntries = Object.entries(sourceVariantProperties);
  if (!sourceEntries.length) {
    return null;
  }

  const compatible = variants
    .map((variant) => {
      const targetProperties = parseVariantName(variant.name ?? '');
      const targetEntries = Object.entries(targetProperties);
      if (!targetEntries.length) {
        return null;
      }

      for (const [key, value] of sourceEntries) {
        if (targetProperties[key] !== value) {
          return null;
        }
      }

      let nonDefaultExtraCount = 0;
      let extraCount = 0;
      for (const [key, value] of targetEntries) {
        if (key in sourceVariantProperties) {
          continue;
        }
        extraCount += 1;
        if (defaultVariantProperties[key] !== value) {
          nonDefaultExtraCount += 1;
        }
      }

      return {
        variant,
        nonDefaultExtraCount,
        extraCount,
        name: String(variant.name ?? ''),
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        variant: T;
        nonDefaultExtraCount: number;
        extraCount: number;
        name: string;
      } => Boolean(entry),
    )
    .sort((left, right) => {
      if (left.nonDefaultExtraCount !== right.nonDefaultExtraCount) {
        return left.nonDefaultExtraCount - right.nonDefaultExtraCount;
      }
      if (left.extraCount !== right.extraCount) {
        return left.extraCount - right.extraCount;
      }
      return left.name.localeCompare(right.name);
    });

  return compatible[0]?.variant ?? null;
}

export type InstanceComponentPropertySnapshot = {
  sourceKey: string;
  canonicalName: string;
  type: ComponentPropertyType;
  value: string | boolean | VariableAlias;
};

type InstanceComponentPropertyDefinition = ComponentProperties[string];

export function snapshotInstanceComponentProperties(
  instance: InstanceNode,
): InstanceComponentPropertySnapshot[] {
  return Object.entries(instance.componentProperties ?? {})
    .map(([key, definition]): InstanceComponentPropertySnapshot | null => {
      const value = definition?.value;
      if (value === undefined) {
        return null;
      }
      return {
        sourceKey: key,
        canonicalName: canonicalComponentPropertyName(key),
        type: definition.type,
        value,
      };
    })
    .filter(
      (entry): entry is InstanceComponentPropertySnapshot => Boolean(entry),
    );
}

export function restoreCompatibleInstanceProperties(
  instance: InstanceNode,
  sourceProperties: InstanceComponentPropertySnapshot[],
): void {
  if (!sourceProperties.length) {
    return;
  }

  const updates: Record<string, string | boolean | VariableAlias> = {};
  const targetProperties = Object.entries(instance.componentProperties ?? {});

  for (const [targetKey, targetDefinition] of targetProperties) {
    const targetCanonicalName = canonicalComponentPropertyName(targetKey);
    const source =
      sourceProperties.find(
        (entry) =>
          entry.sourceKey === targetKey && entry.type === targetDefinition.type,
      ) ??
      sourceProperties.find(
        (entry) =>
          entry.canonicalName === targetCanonicalName &&
          entry.type === targetDefinition.type,
      );

    if (
      source &&
      isCompatibleComponentPropertyValue(source.value, targetDefinition)
    ) {
      updates[targetKey] = source.value;
    }
  }

  if (Object.keys(updates).length) {
    instance.setProperties(updates);
  }
}

function getDefaultVariantProperties(
  componentSet: ComponentSetNode,
): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const [propertyName, definition] of Object.entries(
    componentSet.componentPropertyDefinitions ?? {},
  )) {
    if (
      definition.type === 'VARIANT' &&
      typeof definition.defaultValue === 'string'
    ) {
      defaults[propertyName] = definition.defaultValue;
    }
  }
  return defaults;
}

function canonicalComponentPropertyName(propertyName: string): string {
  return propertyName.replace(/#.+$/, '').trim();
}

function isCompatibleComponentPropertyValue(
  value: string | boolean | VariableAlias,
  definition: InstanceComponentPropertyDefinition,
): boolean {
  switch (definition.type) {
    case 'BOOLEAN':
      return typeof value === 'boolean';
    case 'TEXT':
    case 'INSTANCE_SWAP':
    case 'VARIANT':
      return typeof value === 'string';
    default:
      return false;
  }
}

function describeError(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: string }).message)
    : String(error ?? 'Unknown error');
}
