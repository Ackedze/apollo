/// <reference types="@figma/plugin-typings" />

import type { DSStructureNode } from '../types/structures';
import { getTimestamp } from '../utils/auditInstrumentation';
import type { MutationControl } from './findingAction';
import type {
  CustomizationResetDetail,
  CustomizationResetMutations,
} from './customizationResetMutations';

export interface CustomizationResetPayload {
  rootId?: string;
  nodeId?: string;
  messages?: string[];
  details?: CustomizationResetDetail[];
  remediations?: Array<{
    kind?: string;
    nodeId?: string;
    properties?: Record<string, string>;
    property?: string;
    collectionName?: string;
    value?: number;
  }>;
}

type CustomizationRemediation =
  | {
      kind: 'set-variant-properties';
      nodeId: string;
      properties: Record<string, string>;
    }
  | {
      kind: 'bind-layout-variable';
      nodeId: string;
      property: string;
      collectionName: string;
      value: number;
    };

export interface NumericVariableToken {
  key: string;
  name: string;
}

export type CustomizationResetReferenceResult =
  | { ok: true; referenceNode: DSStructureNode }
  | { ok: false; message: string };

export interface CustomizationResetActionDependencies {
  mutation?:MutationControl;
  ensureReferencesLoaded(): Promise<void>;
  getSceneNodeById(nodeId: string): Promise<SceneNode | null>;
  resolveReferenceNode(
    rootNode: SceneNode,
    nodeId: string,
    options?: { preferSelectedComponentVariant?: boolean }
  ): Promise<CustomizationResetReferenceResult>;
  rerunAudit(fallbackSelection: SceneNode[]): Promise<void>;
  resolveNumericVariableToken(
    collectionName: string,
    value: number,
  ): NumericVariableToken | null;
  mutations: CustomizationResetMutations;
  notify(message: string): void;
  log(message: string, payload: unknown): void;
}

export function createCustomizationResetAction(
  dependencies: CustomizationResetActionDependencies
): (payload: CustomizationResetPayload) => Promise<void> {
  return async (payload) => {
    dependencies.mutation?.assertCurrent();
    const rootId = typeof payload?.rootId === 'string' ? payload.rootId : '';
    const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId : '';
    const messages = Array.isArray(payload?.messages)
      ? payload.messages.filter(
          (message): message is string =>
            typeof message === 'string' && message.trim().length > 0
        )
      : [];
    const requestedDetails = Array.isArray(payload?.details) ? payload.details : [];
    const hasUnsupportedCompositionDetails = requestedDetails.some(
      (detail) =>
        typeof detail?.property === 'string' &&
        detail.property.startsWith('composition.')
    );
    const details = requestedDetails
      .filter((detail): detail is CustomizationResetDetail =>
          Boolean(
            detail &&
              typeof detail.property === 'string' &&
              detail.property.length > 0 &&
              !detail.property.startsWith('composition.') &&
              detail.reference &&
              typeof detail.reference === 'object'
          )
        );
    const paintSurfaceResetRequested = details.some(
      (detail) => detail.resetSurface === 'paint'
    );
    const atomicDetails = paintSurfaceResetRequested
      ? details.filter((detail) => detail.resetSurface !== 'paint')
      : details;
    const remediations: CustomizationRemediation[] = Array.isArray(payload?.remediations)
      ? payload.remediations.filter(
          (
            item
          ): item is CustomizationRemediation =>
            Boolean(
              item &&
                typeof item.nodeId === 'string' &&
                item.nodeId.length > 0 &&
                ((item.kind === 'set-variant-properties' &&
                  item.properties &&
                  typeof item.properties === 'object') ||
                  (item.kind === 'bind-layout-variable' &&
                    typeof item.property === 'string' &&
                    /^layout\.padding\.(top|right|bottom|left)$/.test(
                      item.property
                    ) &&
                    typeof item.collectionName === 'string' &&
                    item.collectionName.length > 0 &&
                    typeof item.value === 'number' &&
                    Number.isFinite(item.value)))
            )
        )
      : [];

    if (
      !rootId ||
      !nodeId ||
      (!messages.length && !details.length && !remediations.length)
    ) {
      dependencies.notify(
        hasUnsupportedCompositionDetails
          ? 'Для нарушения состава автоматический сброс недоступен.'
          : 'Недостаточно данных для сброса изменений.'
      );
      return;
    }

    await dependencies.ensureReferencesLoaded();
    dependencies.mutation?.assertCurrent();
    const rootNode = await dependencies.getSceneNodeById(rootId);
    dependencies.mutation?.assertCurrent();
    const targetNode = await dependencies.getSceneNodeById(nodeId);
    dependencies.mutation?.assertCurrent();
    if (!rootNode || !targetNode) {
      dependencies.notify('Не удалось найти узел для сброса изменений.');
      return;
    }

    for (const remediation of remediations) {
      if (remediation.kind === 'bind-layout-variable') {
        const bindingNode = await dependencies.getSceneNodeById(
          remediation.nodeId
        );
        if (!bindingNode) {
          dependencies.notify('Не удалось найти слой для привязки токена.');
          return;
        }
        const token = dependencies.resolveNumericVariableToken(
          remediation.collectionName,
          remediation.value,
        );
        if (!token) {
          dependencies.notify(
            `Не найден однозначный токен ${remediation.collectionName}/${remediation.value}.`
          );
          return;
        }
        await dependencies.mutations.applyReferenceResetByDetails(bindingNode, [
          {
            property: remediation.property,
            reference: {
              value: remediation.value,
              resourceType: 'token',
              resourceId: token.key,
              displayName: token.name,
            },
          },
        ]);
        continue;
      }

      const variantNode = await dependencies.getSceneNodeById(
        remediation.nodeId
      );
      if (variantNode?.type !== 'INSTANCE') {
        dependencies.notify(
          'Не удалось найти вложенный компонент для смены варианта.'
        );
        return;
      }
      let compatible = false;
      try {
        compatible = await hasCompatibleVariantCombination(
          variantNode,
          remediation.properties,
        );
      } catch (error) {
        dependencies.notify(
          'Не удалось проверить доступные варианты компонента.'
        );
        dependencies.log('[Apollo] variant remediation preflight failed', {
          nodeId: variantNode.id,
          currentProperties: variantNode.variantProperties ?? null,
          requestedProperties: remediation.properties,
          error,
        });
        return;
      }
      if (!compatible) {
        dependencies.notify(
          'Не удалось подобрать существующий вариант компонента для восстановления параметров.'
        );
        dependencies.log('[Apollo] incompatible variant remediation skipped', {
          nodeId: variantNode.id,
          currentProperties: variantNode.variantProperties ?? null,
          requestedProperties: remediation.properties,
        });
        return;
      }
      try {
        dependencies.mutation?.beforeWrite();
        variantNode.setProperties(remediation.properties);
      } catch (error) {
        dependencies.notify(
          'Figma не смогла применить выбранное сочетание параметров компонента.'
        );
        dependencies.log('[Apollo] variant remediation failed', {
          nodeId: variantNode.id,
          currentProperties: variantNode.variantProperties ?? null,
          requestedProperties: remediation.properties,
          error,
        });
        return;
      }
      const appliedProperties = variantNode.variantProperties;
      if (appliedProperties) {
        for (const [property, expected] of Object.entries(
          remediation.properties
        )) {
          if (appliedProperties[property] !== expected) {
            dependencies.notify(
              'Figma не сохранила выбранное значение параметра компонента.'
            );
            dependencies.log('[Apollo] variant remediation was not preserved', {
              nodeId: variantNode.id,
              property,
              expected,
              actual: appliedProperties[property] ?? null,
            });
            return;
          }
        }
      }
    }

    if (remediations.length && !messages.length && !details.length) {
      dependencies.notify(
        remediations.every((item) => item.kind === 'bind-layout-variable')
          ? 'Токены Spacing привязаны.'
          : 'Параметры компонента восстановлены.'
      );
      await dependencies.rerunAudit([rootNode]);
      return;
    }

    if (
      details.length &&
      !paintSurfaceResetRequested &&
      !messages.length &&
      !remediations.length
    ) {
      const resetStartedAt = getTimestamp();
      const resetProbeBefore = readCustomizationResetProbe(targetNode, details);
      await dependencies.mutations.applyReferenceResetByDetails(
        targetNode,
        details
      );
      const resetProbeAfter = readCustomizationResetProbe(targetNode, details);
      dependencies.log('[Apollo] customization detail reset complete', {
        nodeId: targetNode.id,
        totalMs: Number((getTimestamp() - resetStartedAt).toFixed(1)),
        detailCount: details.length,
        before: resetProbeBefore,
        after: resetProbeAfter,
      });
      dependencies.notify('Изменения сброшены.');
      await dependencies.rerunAudit([targetNode]);
      return;
    }

    const referenceResult = await dependencies.resolveReferenceNode(
      rootNode,
      nodeId,
      {
        preferSelectedComponentVariant: paintSurfaceResetRequested,
      }
    );
    if (!referenceResult.ok) {
      dependencies.notify(referenceResult.message);
      return;
    }

    if (paintSurfaceResetRequested) {
      await dependencies.mutations.applyReferencePaintSurfaceReset(
        targetNode,
        referenceResult.referenceNode,
        details.filter((detail) => detail.resetSurface === 'paint')
      );
    }
    if (atomicDetails.length) {
      await dependencies.mutations.applyReferenceResetByDetails(
        targetNode,
        atomicDetails
      );
    }
    if (messages.length) {
      await dependencies.mutations.applyReferenceResetByMessages(
        targetNode,
        referenceResult.referenceNode,
        messages
      );
    }

    dependencies.notify('Изменения сброшены.');
    await dependencies.rerunAudit([rootNode]);
  };
}

function readCustomizationResetProbe(
  node: SceneNode,
  details: CustomizationResetDetail[],
): Record<string, unknown> | null {
  if (!details.some((detail) => detail.property === 'text.align.horizontal')) {
    return null;
  }
  return {
    nodeType: node.type,
    textAlignHorizontal:
      node.type === 'TEXT' ? node.textAlignHorizontal : null,
  };
}

async function hasCompatibleVariantCombination(
  instance: InstanceNode,
  requestedProperties: Record<string, string>,
): Promise<boolean> {
  if (typeof instance.getMainComponentAsync !== 'function') {
    return true;
  }
  const mainComponent = await instance.getMainComponentAsync();
  const componentSet = mainComponent?.parent;
  if (componentSet?.type !== 'COMPONENT_SET') {
    return true;
  }
  const desiredProperties = Object.assign(
    {},
    instance.variantProperties ?? {},
    requestedProperties,
  );
  return componentSet.children.some((child) => {
    if (child.type !== 'COMPONENT' || !child.variantProperties) {
      return false;
    }
    return Object.entries(desiredProperties).every(
      ([property, expected]) => child.variantProperties?.[property] === expected,
    );
  });
}
