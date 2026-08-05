/// <reference types="@figma/plugin-typings" />

import { findContainingPage } from './focusNode';

export type PageThemizationActionResult =
  | {
      ok: true;
      focusNode: SceneNode;
      page: PageNode;
    }
  | {
      ok: false;
      message: string;
    };

export async function applyPageThemeMode(input: {
  nodeId: string;
  themeCollectionId: string;
  targetModeId: string;
}): Promise<PageThemizationActionResult> {
  const node = await figma.getNodeByIdAsync(input.nodeId);
  if (!node || node.type === 'DOCUMENT') {
    return failure('Не удалось найти узел для смены темизации.');
  }

  const focusNode = node as SceneNode;
  const page = findContainingPage(focusNode);
  if (!page) {
    return failure('Не удалось определить страницу для смены темизации.');
  }

  if (!input.themeCollectionId || !input.targetModeId) {
    return failure('Недостаточно данных для смены mode Theme.');
  }

  const collection = await figma.variables.getVariableCollectionByIdAsync(
    input.themeCollectionId,
  );
  if (!collection) {
    return failure('Не удалось получить collection Theme для страницы.');
  }

  if (!collection.modes.some((mode) => mode.modeId === input.targetModeId)) {
    return failure('Mode Corp не найден в коллекции Theme.');
  }

  page.setExplicitVariableModeForCollection(collection, input.targetModeId);
  if (page.explicitVariableModes?.[collection.id] !== input.targetModeId) {
    return failure('Не удалось подтвердить смену mode Theme на странице.');
  }

  return { ok: true, focusNode, page };
}

function failure(message: string): PageThemizationActionResult {
  return { ok: false, message };
}
