/// <reference types="@figma/plugin-typings" />

import type { DSStructureNode } from '../types/structures';
import { getTimestamp } from '../utils/auditInstrumentation';
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
  }>;
}

export type CustomizationResetReferenceResult =
  | { ok: true; referenceNode: DSStructureNode }
  | { ok: false; message: string };

export interface CustomizationResetActionDependencies {
  ensureReferencesLoaded(): Promise<void>;
  getSceneNodeById(nodeId: string): Promise<SceneNode | null>;
  resolveReferenceNode(
    rootNode: SceneNode,
    nodeId: string,
    options?: { preferSelectedComponentVariant?: boolean }
  ): Promise<CustomizationResetReferenceResult>;
  rerunAudit(fallbackSelection: SceneNode[]): Promise<void>;
  mutations: CustomizationResetMutations;
  notify(message: string): void;
  log(message: string, payload: unknown): void;
}

export function createCustomizationResetAction(
  dependencies: CustomizationResetActionDependencies
): (payload: CustomizationResetPayload) => Promise<void> {
  return async (payload) => {
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
    const remediations = Array.isArray(payload?.remediations)
      ? payload.remediations.filter(
          (
            item
          ): item is {
            kind: 'set-variant-properties';
            nodeId: string;
            properties: Record<string, string>;
          } =>
            Boolean(
              item?.kind === 'set-variant-properties' &&
                typeof item.nodeId === 'string' &&
                item.nodeId.length > 0 &&
                item.properties &&
                typeof item.properties === 'object'
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
    const rootNode = await dependencies.getSceneNodeById(rootId);
    const targetNode = await dependencies.getSceneNodeById(nodeId);
    if (!rootNode || !targetNode) {
      dependencies.notify('Не удалось найти узел для сброса изменений.');
      return;
    }

    for (const remediation of remediations) {
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
      dependencies.notify('Параметры компонента восстановлены.');
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
