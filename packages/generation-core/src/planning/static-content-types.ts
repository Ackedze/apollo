import type { CompositionPlan, Diagnostic, GenerationView, Target } from './types';

export const STATIC_SCREEN_VERSION = 'apollo.screen-spec.static-content.v1-draft';
export const STATIC_PLAN_VERSION = 'apollo.composition-plan.static-content.v1-draft';
export const STATIC_FACT_VERSION = 'apollo.static-content-fact-input.v1-draft';
export const STATIC_CONTENT_MAPPING = 'arui-private.corporate-content.desktop';
export const STATIC_GROUP_MAPPING = 'arui-private.buttons-group.desktop';
/** Content only. Priority is a separate permutation, never inferred from View. */
export type StaticOwnedContent = { id: string; label: string; view: 'primary' | 'secondary'; disabled: boolean; loading: false };
export type StaticScreenSpec = {
  schemaVersion: typeof STATIC_SCREEN_VERSION; status: 'draft'; executionAllowed: false;
  id: string; platform: 'desktop'; viewport: { width: 1600; height: number }; root: string;
  nodes: Array<
    { kind: 'component'; id: string; mappingId: typeof STATIC_CONTENT_MAPPING; props: Record<string,never>; slots: { body: string[] } }
    | { kind: 'component'; id: string; mappingId: typeof STATIC_GROUP_MAPPING; props: { size: '56' }; slots: Record<string,never>;
        staticActions: { port: 'button-label'; items: StaticOwnedContent[]; displayOrder: string[]; priorityOrder: string[] } }
  >;
  states: { initial: 'default'; values: ['default'] }; unresolved: string[];
};
export type StaticContentProjection = {
  ownerNodeId: string; slotPort: 'body'; groupNodeId: string; actionPort: 'button-label';
  size: '56'; overflow: false; state: 'default'; actions: StaticOwnedContent[]; displayOrder: string[]; priorityOrder: string[];
  provenance: Array<{ actionId: string; ownerNodeId: string; port: 'button-label'; canonicalOccurrenceId: null; symbolId: null }>;
};
export type StaticCompositionPlan = {
  schemaVersion: typeof STATIC_PLAN_VERSION; status: 'draft'; executionAllowed: false; spec: StaticScreenSpec;
  pins: CompositionPlan['pins']; components: CompositionPlan['components']; content: StaticContentProjection; contentHash: string;
  requirements: { sourceOccurrences: 4; visibleProductActions: 2; hiddenSourceOccurrences: 2; deleteSourceOccurrences: false;
    requiredContextRuleIds: string[]; verificationSlots: string[]; dependencyCoverage: GenerationView['components'][number]['coverage'][] };
};
/** Review inputs only: hashes and populated fields are not trusted receipts. */
export type StaticWidthInput = { availableWidth: number; buttonWidths: Array<{ actionId: string; width: number }>;
  gap: number; paddingStart: number; paddingEnd: number; measurementHash: string; fontHash: string };
export type StaticCanonicalInput = {
  body: { ownerSourceAddress: string; property: string; slotSourceAddress: string };
  occurrences: Array<{ occurrenceId: string; symbolId: string; actionId: string | null; visible: boolean }>;
  crosswalkHash: string;
};
export type StaticFactInputDraft = {
  schemaVersion: typeof STATIC_FACT_VERSION; status: 'draft'; accepted: false;
  planHash: string; buildHash: string;
  widths: Record<Target, StaticWidthInput | null>; canonical: StaticCanonicalInput | null;
  targetSupport: Record<Target,'not-supported'>;
};
export type StaticPreflight = {
  schemaVersion: 'apollo.static-content-preflight.v1-draft'; status: 'draft'; executionAllowed: false; planHash: string;
  apiAvailability: 'blocked'; sourceReadiness: 'ready' | 'blocked'; targets: Record<Target,'blocked'>;
  coverage: GenerationView['components'][number]['coverage'][]; diagnostics: Diagnostic[];
};
