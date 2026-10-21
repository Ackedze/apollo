import type { ManualRule } from './types';
import { baselineFactsForRule } from './property-applicability';

/** A visibility exemption must never hide a presence/visibility requirement. */
export function allowsVisibleTargetPolicy(rule: ManualRule): boolean {
  const baselineOnly = rule.permission !== 'allowed' && (rule.constraints.length
    ? rule.constraints.every(c => c.type === 'propertyForbidden') : rule.permission === 'forbidden');
  const facts = baselineFactsForRule(rule);
  const style = baselineOnly && facts.length > 0 && facts.every(f => [
    'appearance.fill', 'appearance.stroke', 'appearance.strokeWeight', 'appearance.opacity',
    'appearance.radius', 'appearance.effects', 'appearance.typography',
  ].includes(f));
  const deferredLayout = rule.execution?.route === 'context-only' && rule.permission === 'constrained'
    && !rule.capabilitySet && /^(layout|text)\./.test(rule.capability)
    && rule.constraints.length > 0 && rule.constraints.every(c => c.type === 'layoutConstraint'
      && /^(layout|text|derived)\.[a-zA-Z][a-zA-Z0-9.]*$/.test(c.fact || ''));
  return style || deferredLayout;
}
