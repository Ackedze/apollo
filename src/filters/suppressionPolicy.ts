import { findComponent } from '../reference/library';
import type { DiffEntry } from '../structure/diff';

export type SuppressionReason =
  | 'host-controlled-paint'
  | 'host-controlled-text'
  | 'host-controlled-layout'
  | 'nested-variant-root-switch';

export type SuppressionDependencies = {
  isPaintPathHostControlled: (
    componentKey: string | null | undefined,
    relativePath: string | null | undefined,
  ) => boolean;
  isTextPathHostControlled: (
    componentKey: string | null | undefined,
    relativePath: string | null | undefined,
  ) => boolean;
  isLayoutPathHostControlled: (
    componentKey: string | null | undefined,
    relativePath: string | null | undefined,
  ) => boolean;
  resolveComponent: (key: string) => {
    key?: string;
    platform?: string;
  } | null;
};

export type SuppressionDecision = {
  suppressed: boolean;
  reason: SuppressionReason | null;
};

export function evaluateDiffSuppression(
  diff: Pick<
    DiffEntry,
    'message' | 'diffKind' | 'context'
  >,
  dependencies: SuppressionDependencies,
): SuppressionDecision {
  const componentKey = diff.context.nestedOwnerComponentKey ?? null;
  const relativePath = diff.context.nestedOwnerRelativePath ?? null;

  if (!componentKey || relativePath == null) {
    return { suppressed: false, reason: null };
  }

  if (
    diff.diffKind === 'paint' &&
    dependencies.isPaintPathHostControlled(componentKey, relativePath)
  ) {
    return { suppressed: true, reason: 'host-controlled-paint' };
  }

  if (
    diff.diffKind === 'text-style' &&
    dependencies.isTextPathHostControlled(componentKey, relativePath)
  ) {
    return { suppressed: true, reason: 'host-controlled-text' };
  }

  if (
    diff.diffKind === 'layout' &&
    dependencies.isLayoutPathHostControlled(componentKey, relativePath)
  ) {
    return { suppressed: true, reason: 'host-controlled-layout' };
  }

  if (
    relativePath === '' &&
    isNestedVariantRootDiffWithinSameFamily(diff, dependencies.resolveComponent)
  ) {
    return { suppressed: true, reason: 'nested-variant-root-switch' };
  }

  return { suppressed: false, reason: null };
}

export function markSuppressedDiff(
  diff: DiffEntry,
  dependencies: SuppressionDependencies,
): DiffEntry {
  const decision = evaluateDiffSuppression(diff, dependencies);
  if (!decision.suppressed) {
    return diff;
  }

  return Object.assign({}, diff, {
    suppressAsHostControlledNestedProperty: true,
    suppressionReason: decision.reason,
  });
}

export function createRuntimeSuppressionDependencies(
  isPaintPathHostControlled: SuppressionDependencies['isPaintPathHostControlled'],
  isTextPathHostControlled: SuppressionDependencies['isTextPathHostControlled'],
  isLayoutPathHostControlled: SuppressionDependencies['isLayoutPathHostControlled'],
): SuppressionDependencies {
  return {
    isPaintPathHostControlled,
    isTextPathHostControlled,
    isLayoutPathHostControlled,
    resolveComponent: findComponent,
  };
}

function isNestedVariantRootDiffWithinSameFamily(
  diff: Pick<DiffEntry, 'context'>,
  resolveComponent: SuppressionDependencies['resolveComponent'],
): boolean {
  const actualComponentKey = diff.context.actualComponentKey ?? null;
  const referenceComponentKey = diff.context.referenceComponentKey ?? null;

  if (!actualComponentKey || !referenceComponentKey) {
    return false;
  }

  if (actualComponentKey === referenceComponentKey) {
    return false;
  }

  const actualComponent = resolveComponent(actualComponentKey);
  const referenceComponent = resolveComponent(referenceComponentKey);

  if (!actualComponent || !referenceComponent) {
    return false;
  }

  return (
    actualComponent.key === referenceComponent.key &&
    actualComponent.platform === referenceComponent.platform
  );
}
