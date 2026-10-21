import type { CompiledContract, PreviewSnapshot } from '../packages/component-contract-core/src/types';
import { createValidationIntent } from '../packages/component-contract-core/src/validation-intent';

/** The setting is a scenario input, never an observed component platform. */
export function applyAuditPlatform(snapshot: PreviewSnapshot, contract: CompiledContract, platform: unknown): void {
  if (typeof platform !== 'string' || !['desktop', 'mobile-web'].includes(platform)
    || !contract.facts.validationContext?.some(p => p.id === 'ViewportClass' && p.domain?.includes(platform))) return;
  snapshot.validationIntent = createValidationIntent(snapshot, contract, { ViewportClass: platform });
}
