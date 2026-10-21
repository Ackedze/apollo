import type { ManualRule } from './types';
import { capabilitiesForSet, factForCapability } from './capabilities';

/** Versioned, opt-in normative policies. No imported rule is migrated implicitly. */
export const PROPERTY_APPLICABILITY = {
  'appearance.strokeWeight': 'stroke-present-either@1',
  'layout.itemSpacing': 'flow-gap-either@1',
  'layout.padding.top': 'auto-layout-padding-either@1',
  'layout.padding.right': 'auto-layout-padding-either@1',
  'layout.padding.bottom': 'auto-layout-padding-either@1',
  'layout.padding.left': 'auto-layout-padding-either@1',
  'layout.primaryAxisAlignItems': 'flow-alignment-either@1',
  'layout.counterAxisAlignItems': 'flow-alignment-either@1',
} as const;

const ACTIVITY_FIELDS = {
  'stroke-present-either@1': 'strokePresent',
  'flow-gap-either@1': 'gapApplicable',
  'auto-layout-padding-either@1': 'paddingApplicable',
  'flow-alignment-either@1': 'axisAlignmentApplicable',
} as const;

export function baselineFactsForRule(rule: ManualRule): string[] {
  const capabilities = rule.capabilitySet
    ? capabilitiesForSet(rule.capabilitySet).filter(c => !rule.capabilitySelection || rule.capabilitySelection.includes(c))
    : [rule.capability];
  const constraints = rule.permission === 'forbidden' && !rule.constraints.length
    ? [{ type: 'propertyForbidden' }] : rule.constraints;
  return [...new Set(capabilities.flatMap(c => constraints.filter(x => x.type === 'propertyForbidden')
    .map(x => ('fact' in x && x.fact) || factForCapability(c))))] as string[];
}

export function propertyApplicabilityCondition(rule: ManualRule, fact: string): Record<string, unknown> | undefined {
  const policy = rule.propertyApplicability?.[fact as keyof typeof PROPERTY_APPLICABILITY];
  if (!policy) return;
  const field = ACTIVITY_FIELDS[policy];
  if (!field) throw new Error(`Unsupported property applicability: ${policy}`);
  return { predicate: 'any', args: ['', 'baseline.effective.'].map(prefix => ({
    predicate: 'equals', actual: { fact: `${prefix}propertyActivityV1.${field}` },
    expected: { literal: true }, missingPolicy: 'unknown',
  })) };
}

/** Factual Figma capability evidence, not a verdict. Unknown is deliberately omitted. */
export function capturePropertyActivity(node: Record<string, unknown>): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  try { if (Array.isArray(node.strokes)) result.strokePresent = node.strokes.length > 0; } catch { /* unavailable */ }
  try {
    const mode = node.layoutMode;
    // These capabilities do not depend on child count (unlike itemSpacing).
    if (mode === 'HORIZONTAL' || mode === 'VERTICAL' || mode === 'GRID') {
      result.paddingApplicable = true;
      result.axisAlignmentApplicable = mode !== 'GRID';
    } else if (mode === 'NONE') {
      result.paddingApplicable = false;
      result.axisAlignmentApplicable = false;
    }
    if (mode === 'NONE' || mode === 'GRID') result.gapApplicable = false;
    else if (mode === 'HORIZONTAL' || mode === 'VERTICAL') {
      if (!Array.isArray(node.children)) return result;
      // Lower/upper bounds avoid guessing visibility or absolute positioning.
      let certain = 0, possible = 0;
      for (const child of node.children) {
        try {
          const visible = child.visible, positioning = child.layoutPositioning;
          if (visible === false || positioning === 'ABSOLUTE') continue;
          possible++;
          if (visible === true && positioning === 'AUTO') certain++;
        } catch { possible++; }
      }
      if (certain >= 2) result.gapApplicable = true;
      else if (possible < 2) result.gapApplicable = false;
    } else if (['GROUP','BOOLEAN_OPERATION','VECTOR','ELLIPSE','RECTANGLE','LINE','POLYGON','STAR','TEXT'].includes(String(node.type))) {
      result.gapApplicable = false;
      result.paddingApplicable = false;
      result.axisAlignmentApplicable = false;
    }
  } catch { /* missing layout evidence never means inactive */ }
  return result;
}
