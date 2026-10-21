import type { CompositionPlan, ContractPin, Diagnostic, GenerationContext, MappingEntry, OwnedAction, TargetReceipt } from "../../../packages/generation-core/src/planning";
import type { CompiledContract } from "../../../packages/component-contract-core/src/types";
export type NativeWriteScope = {
  /** Existing descendants of the newly created instance; never arbitrary canvas IDs. */
  node(id: string): SceneNode;
  bindAction(actionId: string, nodeId: string): void;
};
export type NativeSlotBinding = {
  targetId: string; property: string; sourceNodeId: string; operationId: string;
  /** Receipt points to an accepted source/Plugin API operation, not a guessed appendChild. */
  evidenceHash: string;
  assertDefinition(definition: ComponentNode): Promise<void>;
  fill(instance: InstanceNode, children: SceneNode[], scope: NativeWriteScope): Promise<void>;
  assertFilled(instance: InstanceNode, children: SceneNode[]): Promise<void>;
};
export type NativeActionBinding = {
  id: string; evidenceHash: string;
  occurrences: Array<{ sourceNodeId: string; symbolId: string; dependencyComponentId: string; componentSetKey: string }>;
  assertDefinition(definition: ComponentNode, actions: OwnedAction[]): Promise<void>;
  assertOccurrences(instance: InstanceNode, bindings: Array<{actionId:string;nodeId:string}>, actions: OwnedAction[]): Promise<void>;
  fill(instance: InstanceNode, actions: OwnedAction[], state: string, scope: NativeWriteScope): Promise<Array<{actionId:string;nodeId:string}>>;
};
export type NativeScenarioBinding = {
  id: string; evidenceHash: string;
  assertPlan(plan: CompositionPlan, mapping: MappingEntry): Promise<void>;
  /** Only accepted prototype/property/state operations; no invented backend/navigation behavior. */
  bind(plan: CompositionPlan, provenance: TargetReceipt['provenance'], scope: NativeWriteScope, ownerPlanNodeId: string): Promise<void>;
};
export type NativeBinding = {
  id: string; mappingId: string; representationId: string; componentKey: string; pin: ContractPin;
  /** Both hashes are supplied by a reviewed local producer/source handoff, never ScreenSpec. */
  recipeHash: string; acceptanceEvidenceHash: string;
  slots: NativeSlotBinding[]; actions?: NativeActionBinding; scenario?: NativeScenarioBinding;
};
export type NativePrimitivePolicy = { id: string; evidenceHash: string; textStyleId: string; fontName: FontName };
export type NativeScopeCapture = {
  facts: unknown;
  checks: Array<{id:string;componentId?:string;status:'passed'|'failed'|'unknown'|'not-applicable';evidenceHash:string}>;
  diagnostics: Diagnostic[];
  assertCurrent(): Promise<void>;
};
export type NativeCapturePort = {
  loadScope(mapping: MappingEntry, context: GenerationContext): Promise<CompiledContract>;
  capture(instance: InstanceNode, mapping: MappingEntry, contract: CompiledContract): Promise<NativeScopeCapture>;
};
export type NativeBindingReader = (mapping: MappingEntry, context: GenerationContext) => Promise<NativeBinding | null>;
/** No accepted NEXT-02 native recipes have been delivered. Missing IDs stay absent.
 * Future entries must come from reviewed local source, not from request JSON. */
export const readAcceptedNativeBinding: NativeBindingReader = async () => null;
export const acceptedPrimitivePolicy: NativePrimitivePolicy | null = null;
