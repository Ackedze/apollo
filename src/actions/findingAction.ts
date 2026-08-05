import { applyComponentFindingReplacement } from './corporateComponentAction';
import { applyStyleBindingAction } from './styleBindingAction';
import { applyVariableBindingAction } from './variableBindingAction';
import { FindingActionRegistry } from '../remediation/findingActionRegistry';
import { isComponentFindingAction } from '../remediation/types';

export interface FindingActionDependencies {
  registry: FindingActionRegistry;
  rerunAudit(fallbackSelection: SceneNode[]): Promise<void>;
  notify(message: string): void;
}

export async function executeFindingAction(
  actionId: string,
  dependencies: FindingActionDependencies,
): Promise<void> {
  const action = dependencies.registry.get(actionId);
  if (!action) {
    dependencies.notify('Действие устарело. Запустите проверку ещё раз.');
    return;
  }
  if (!dependencies.registry.claim(actionId)) {
    dependencies.notify('Действие уже выполняется.');
    return;
  }

  try {
    if (isComponentFindingAction(action)) {
      const result = await applyComponentFindingReplacement({
        nodeId: action.nodeId,
        expectedComponentKey: action.expectedComponentKey,
        targetComponentKey: action.targetComponentKey,
      });
      if (!result.ok) {
        dependencies.notify(result.message);
        return;
      }

      dependencies.notify(
        action.kind === 'apply-library-update'
          ? 'Обновление компонента применено.'
          : 'Компонент заменён.',
      );
      await dependencies.rerunAudit([result.node]);
      return;
    }

    const runtimeNode = dependencies.registry.getRuntimeNode(actionId);
    const result =
      action.kind === 'bind-variable'
        ? await applyVariableBindingAction(action, runtimeNode)
        : await applyStyleBindingAction(action, runtimeNode);
    if (!result.ok) {
      dependencies.notify(result.message);
      return;
    }

    dependencies.notify(
      action.kind === 'bind-variable'
        ? 'Библиотечный токен привязан.'
        : 'Библиотечный стиль применён.',
    );
    await dependencies.rerunAudit([result.node]);
  } finally {
    dependencies.registry.release(actionId);
  }
}
