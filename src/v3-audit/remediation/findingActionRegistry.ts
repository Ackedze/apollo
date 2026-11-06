import type { FindingActionSummary } from '../types/audit';
import type { RegisteredFindingAction } from './types';

export class FindingActionRegistry {
  private generation = 0;
  private nextId = 0;
  private actions = new Map<string, RegisteredFindingAction>();
  private runtimeNodes = new Map<string, SceneNode>();
  private executing = new Set<string>();

  reset(): void {
    this.generation += 1;
    this.nextId = 0;
    this.actions.clear();
    this.runtimeNodes.clear();
    this.executing.clear();
  }

  register(
    action: RegisteredFindingAction,
    label: string,
    scope: FindingActionSummary['scope'],
    runtimeNode?: SceneNode,
  ): FindingActionSummary {
    const id = `finding-action:${this.generation}:${this.nextId}`;
    this.nextId += 1;
    this.actions.set(id, action);
    if (runtimeNode) {
      this.runtimeNodes.set(id, runtimeNode);
    }

    return {
      id,
      kind: action.kind,
      label,
      targetName: action.targetName,
      targetLibrary: action.targetLibrary ?? null,
      scope,
    };
  }

  get(id: string): RegisteredFindingAction | null {
    return this.actions.get(id) ?? null;
  }

  getRuntimeNode(id: string): SceneNode | null {
    return this.runtimeNodes.get(id) ?? null;
  }

  claim(id: string): boolean {
    if (!this.actions.has(id) || this.executing.has(id)) {
      return false;
    }
    this.executing.add(id);
    return true;
  }

  release(id: string): void {
    this.executing.delete(id);
  }
}
