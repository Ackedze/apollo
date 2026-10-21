export type StyleActionReason =
  | 'deprecated-style'
  | 'exact-style-match'
  | 'exact-typography-match';

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

