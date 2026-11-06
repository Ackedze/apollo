import type { AuditChannel } from '../services/channelAudit';
import type { FindingActionKind } from '../types/audit';

export type ComponentActionReason =
  | 'wrong-channel'
  | 'deprecated-component'
  | 'catalog-lifecycle'
  | 'library-update-available';

export type StyleActionReason =
  | 'deprecated-style'
  | 'exact-style-match'
  | 'exact-typography-match';

export interface ComponentFindingAction {
  kind: 'swap-component' | 'apply-library-update';
  nodeId: string;
  expectedComponentKey: string;
  targetComponentKey: string;
  targetName: string;
  targetLibrary?: string | null;
  reason: ComponentActionReason;
}

export interface StyleFindingAction {
  kind: 'bind-style';
  nodeId: string;
  expectedStyleId: string | null;
  targetStyleKey: string;
  targetName: string;
  targetLibrary?: string | null;
  styleField: 'fill' | 'stroke' | 'effect' | 'text';
  reason: StyleActionReason;
  expectedFingerprint?: string;
}

export interface VariableFindingAction {
  kind: 'bind-variable';
  nodeId: string;
  expectedStyleId: string | null;
  targetVariableKey: string;
  targetName: string;
  targetLibrary?: string | null;
  styleField: 'fill' | 'stroke';
  expectedFingerprint: string;
}

export type RegisteredFindingAction =
  | ComponentFindingAction
  | StyleFindingAction
  | VariableFindingAction;

export interface ComponentRemediationEntry {
  replacementComponentKey: string;
  replacementName?: string;
  replacementLibrary?: string;
}

export interface StyleRemediationEntry {
  replacementStyleKey: string;
  replacementName?: string;
  replacementLibrary?: string;
  styleType?: 'fill' | 'stroke' | 'effect' | 'text';
}

export interface RemediationConfig {
  schemaVersion: 1;
  components: Record<string, ComponentRemediationEntry>;
  styles: Record<string, StyleRemediationEntry>;
}

export interface ComponentChannelCounterpart {
  componentKey: string;
  componentName: string;
  platform: 'Desktop' | 'Mobile Web';
  library?: string | null;
}

export interface ComponentActionResolutionContext {
  selectedChannel: AuditChannel;
}

export function isComponentFindingAction(
  action: RegisteredFindingAction,
): action is ComponentFindingAction {
  return action.kind === 'swap-component' || action.kind === 'apply-library-update';
}

export function getFindingActionKind(
  action: RegisteredFindingAction,
): FindingActionKind {
  return action.kind;
}
