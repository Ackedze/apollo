/// <reference types="@figma/plugin-typings" />

import {
  ensureReferenceCatalogsForKeys,
  findComponent,
  getCorporateCounterpart,
} from '../reference/library';
import type { LibraryComponent } from '../reference/libraryTypes';
import {
  countVariantPropertyMatches,
  parseVariantName,
  variantMatchesSourceWithDefaultExtras,
  variantPropertiesEqual,
} from '../utils/variantProperties';

export type CorporateComponentActionResult =
  | { ok: true; node: InstanceNode }
  | { ok: false; message: string };

export async function applyCorporateComponentReplacement(input: {
  nodeId: string;
  replacementComponentKey?: string | null;
}): Promise<CorporateComponentActionResult> {
  const node = await figma.getNodeByIdAsync(input.nodeId);
  if (!node || node.type !== 'INSTANCE') {
    return { ok: false, message: 'Не удалось найти инстанс для замены.' };
  }

  const replaced = await replaceCorporateInstance(
    node,
    input.replacementComponentKey ?? null,
  );
  if (!replaced) {
    return {
      ok: false,
      message: 'Не удалось заменить компонент на базовую версию.',
    };
  }

  return { ok: true, node };
}

export async function applyComponentFindingReplacement(input: {
  nodeId: string;
  expectedComponentKey: string;
  targetComponentKey: string;
}): Promise<CorporateComponentActionResult> {
  const node = await figma.getNodeByIdAsync(input.nodeId);
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
  if (!replaced) {
    return {
      ok: false,
      message: 'Не удалось подобрать совместимый компонент для замены.',
    };
  }

  return { ok: true, node };
}

export async function replaceCorporateInstance(
  instance: InstanceNode,
  replacementComponentKey?: string | null,
): Promise<boolean> {
  const sourceProperties = snapshotInstanceComponentProperties(instance);
  const mainComponent = await instance.getMainComponentAsync();
  const componentKey = mainComponent?.key ?? null;
  await ensureReferenceCatalogsForKeys([componentKey, replacementComponentKey]);
  const reference = componentKey ? findComponent(componentKey) : null;
  if (!reference) {
    return false;
  }

  const replacementReference = replacementComponentKey
    ? findComponent(replacementComponentKey)
    : null;
  const pair = replacementReference ? null : getCorporateCounterpart(reference);
  const baseComponent = replacementReference ?? pair?.base ?? null;
  if (!baseComponent) {
    return false;
  }

  const currentVariantName =
    reference.variants?.find((variant) => variant.key === componentKey)?.name ??
    null;
  const candidateVariantKey =
    currentVariantName && baseComponent.variants?.length
      ? findBestCatalogVariantKey(baseComponent, currentVariantName)
      : null;

  if (candidateVariantKey) {
    try {
      const targetVariant = await figma.importComponentByKeyAsync(
        candidateVariantKey,
      );
      instance.swapComponent(targetVariant);
      restoreCompatibleInstanceProperties(instance, sourceProperties);
      return true;
    } catch (error) {
      console.warn(
        '[Apollo] failed to import base variant directly, trying component set fallback',
        {
          nodeId: instance.id,
          candidateVariantKey,
          error,
        },
      );
    }
  }

  const baseComponentKey = baseComponent.key ?? null;
  if (!baseComponentKey) {
    return false;
  }

  if (baseComponent.variants?.length) {
    try {
      const componentSet = await figma.importComponentSetByKeyAsync(
        baseComponentKey,
      );
      const targetVariant = findMatchingVariantInSet(
        componentSet,
        instance,
        currentVariantName,
      );

      if (!targetVariant) {
        console.error(
          '[Apollo] failed to find matching base variant in component set',
          {
            nodeId: instance.id,
            baseComponentKey,
            currentVariantName,
            instanceVariantProperties: instance.variantProperties,
          },
        );
        return false;
      }

      instance.swapComponent(targetVariant);
      restoreCompatibleInstanceProperties(instance, sourceProperties);
      return true;
    } catch (error) {
      console.error('[Apollo] failed to swap corporate component', {
        nodeId: instance.id,
        baseComponentKey,
        error: describeError(error),
      });
    }
  }

  try {
    const targetComponent = await figma.importComponentByKeyAsync(
      baseComponentKey,
    );
    instance.swapComponent(targetComponent);
    restoreCompatibleInstanceProperties(instance, sourceProperties);
    return true;
  } catch (error) {
    console.error('[Apollo] failed to import replacement component', {
      nodeId: instance.id,
      baseComponentKey,
      error: describeError(error),
    });
    return false;
  }
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
