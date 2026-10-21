import { representationFeatureFlags, manualRepresentationShape, representationScopeHash } from '../../../component-contract-core/src/representation-evidence';
import type { PackageInventory } from '../contracts/packages';
import type { ContractPin, GenerationView, Hash } from './types';
export const pinOf = (p: ContractPin): ContractPin => ({ componentId: p.componentId, contractId: p.contractId,
  revision: p.revision, manualSourceHash: p.manualSourceHash, compiledHash: p.compiledHash });
/** G04 projection preserves source status and coverage; it creates no norms. */
export function projectGenerationView(inventory: PackageInventory, hash: Hash): GenerationView {
  if (hash(inventory.lock) !== inventory.lockHash || new Set(inventory.packages.map(p => p.componentId)).size !== inventory.packages.length
    || inventory.lock.packages.length !== inventory.packages.length) throw new Error('GENERATION_VIEW_LOCK');
  const components = inventory.packages.map(p => {
    const pin = inventory.lock.packages.find(l => l.componentId === p.componentId);
    if (!pin || pin.contractId !== p.source.manual.component.contractId || pin.revision !== p.source.manual.metadata.revision
      || pin.manualSourceHash !== hash(p.source.manual) || pin.factsHash !== hash(p.source.variantEvidence)
      || hash(p.representations) !== hash(p.source.manual.representations)
      || pin.compiledHash !== hash(p.contract) || p.contract.package.componentId !== p.componentId
      || !['ready','draft'].includes(p.contract.status)) throw new Error('GENERATION_VIEW_SOURCE');
    const flags=representationFeatureFlags(manualRepresentationShape(p.source.manual));
    const entry:GenerationView['components'][number] = { pin: pinOf(pin), sourceStatus: p.contract.status, api: p.source.manual.semanticApi,
      representations: p.representations, targets: p.source.manual.targets.map(t => t.id),
      dependencies: pin.dependencies.map(d => d.componentId), sourceErrors: p.issues.filter(i => i.level === 'error').length,
      coverage: { predicateRuleIds: p.contract.rules.map(r => r.ruleId), pendingRoutes: p.checks.pendingRoutes,
        nonExecutableRuleIds: p.contract.nonExecutableRules.map(r => r.sourceRuleId) } };
    if(flags.evidence||flags.bindings){entry.generationProfiles=p.source.manual.generation.profiles;entry.evidenceScopeHash=representationScopeHash(p.source.manual,p.source.variantEvidence);}
    return entry;
  });
  return JSON.parse(JSON.stringify({ schemaVersion: 'apollo.generation-view.v1-experimental',
    lock: inventory.lock, lockHash: inventory.lockHash, components }));
}
