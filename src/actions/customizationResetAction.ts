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
    nodeId: string
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
    const details = Array.isArray(payload?.details)
      ? payload.details.filter((detail): detail is CustomizationResetDetail =>
          Boolean(
            detail &&
              typeof detail.property === 'string' &&
              detail.property.length > 0 &&
              detail.reference &&
              typeof detail.reference === 'object'
          )
        )
      : [];
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
      dependencies.notify('Недостаточно данных для сброса изменений.');
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
      variantNode.setProperties(remediation.properties);
    }

    if (remediations.length && !messages.length && !details.length) {
      dependencies.notify('Параметры компонента восстановлены.');
      await dependencies.rerunAudit([rootNode]);
      return;
    }

    if (details.length && !messages.length && !remediations.length) {
      const resetStartedAt = getTimestamp();
      await dependencies.mutations.applyReferenceResetByDetails(
        targetNode,
        details
      );
      dependencies.log('[Apollo] customization detail reset complete', {
        nodeId: targetNode.id,
        totalMs: Number((getTimestamp() - resetStartedAt).toFixed(1)),
        detailCount: details.length,
      });
      dependencies.notify('Изменения сброшены.');
      await dependencies.rerunAudit([targetNode]);
      return;
    }

    const referenceResult = await dependencies.resolveReferenceNode(
      rootNode,
      nodeId
    );
    if (!referenceResult.ok) {
      dependencies.notify(referenceResult.message);
      return;
    }

    if (details.length) {
      await dependencies.mutations.applyReferenceResetByDetails(
        targetNode,
        details
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
