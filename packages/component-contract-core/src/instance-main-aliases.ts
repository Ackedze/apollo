import type { PreviewSnapshot } from './types';
import { captureVariantReference } from './variant-facts';
import { materializeEffectiveBaseline } from './instance-validation';
import { stableHash } from './stable';

/** Recomputed from the consumer profile; a stored snapshot cannot enable it. */
export function configureInstanceMainAliases(snapshot: PreviewSnapshot, enabled: boolean): void {
  if (snapshot.source) {
    delete snapshot.source.instanceMainComponentAliasesVersion;
    if (enabled) snapshot.source.instanceMainComponentAliasesVersion = 1;
  }
  if (snapshot.instanceContentReferences) {
    configureInstanceMainAliases(snapshot.instanceContentReferences.base, enabled);
    for (const attempt of snapshot.instanceContentReferences.attempts)
      if (attempt.reference) configureInstanceMainAliases(attempt.reference, enabled);
  }
  for (const capture of snapshot.componentDependencyCaptures || [])
    if (capture.snapshot) configureInstanceMainAliases(capture.snapshot, enabled);
}

/** Restore only a baseline backed by the same independently captured host. */
export function restoreInstanceMainAliasBaseline(snapshot: PreviewSnapshot): void {
  const base = snapshot.instanceContentReferences?.base, original = snapshot.variantReference;
  if (snapshot.source?.instanceMainComponentAliasesVersion !== 1 || !base || !original?.complete
    || !base.source?.rootNodeId || base.source.rootNodeId === snapshot.source.rootNodeId
    || base.context.platform !== snapshot.context.platform || stableHash(base.context.modes) !== stableHash(snapshot.context.modes)) return;
  const reference = captureVariantReference(base, base.source.componentKey || '', base.source.componentSetKey || '', original.definedProperties);
  if (!reference.complete || stableHash(reference) !== stableHash(original)) return;
  snapshot.nodes = materializeEffectiveBaseline(snapshot, base, true).snapshot.nodes;
}
