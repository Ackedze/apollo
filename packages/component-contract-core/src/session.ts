import type { ImportedWorkspace } from './types';

export const EDITOR_SESSION_SCHEMA_VERSION = 'apollo.component-contract-editor.session.v1' as const;

export type EditorWorkspaceMode = 'authoring' | 'validation';

export type EditorSessionState = {
  schemaVersion: typeof EDITOR_SESSION_SCHEMA_VERSION;
  savedAt: string;
  workspace: ImportedWorkspace;
  ui: {
    workspaceMode: EditorWorkspaceMode;
    validationProduct: string;
    scenarioProperties: Record<string, string>;
    activeModes: Record<string, string>;
  };
};

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createEditorSession(
  workspace: ImportedWorkspace,
  ui: EditorSessionState['ui'],
  savedAt = new Date().toISOString(),
): EditorSessionState {
  // Compiled input is evidence, not editable session state. It can also be very large.
  const { compiledInput: _compiledInput, ...persistedWorkspace } = workspace;
  return jsonClone({
    schemaVersion: EDITOR_SESSION_SCHEMA_VERSION,
    savedAt,
    workspace: persistedWorkspace,
    ui,
  });
}

export function parseEditorSession(value: unknown): EditorSessionState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<EditorSessionState>;
  if (candidate.schemaVersion !== EDITOR_SESSION_SCHEMA_VERSION) return null;
  if (!candidate.workspace || !candidate.ui) return null;
  const manual = candidate.workspace.manual;
  if (!manual || manual.documentType !== 'component-contract-manual' || !manual.component?.contractId) return null;
  if (!['authoring', 'validation'].includes(candidate.ui.workspaceMode)) return null;
  return jsonClone(candidate as EditorSessionState);
}
