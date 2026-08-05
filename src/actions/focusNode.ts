/// <reference types="@figma/plugin-typings" />

export async function focusNode(nodeId: string | undefined): Promise<void> {
  if (!nodeId) return;
  const node = await figma.getNodeByIdAsync(nodeId);

  if (!node || node.type === 'DOCUMENT') {
    figma.notify('Не удалось найти слой для перехода');
    return;
  }

  const page = findContainingPage(node);
  if (!page) {
    figma.notify('Не удалось определить страницу для этого слоя');
    return;
  }

  try {
    await figma.setCurrentPageAsync(page);
  } catch (error) {
    console.error('Failed to switch page asynchronously', error);
    figma.notify('Не удалось перейти на страницу слоя');
    return;
  }

  try {
    const sceneNode = node as SceneNode;
    figma.currentPage.selection = [sceneNode];
    figma.viewport.scrollAndZoomIntoView([sceneNode]);
  } catch (error) {
    console.error('Failed to focus node on page', error);
    figma.notify('Не удалось перейти к слою на этой странице');
  }
}

export function findContainingPage(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === 'PAGE') {
      return current as PageNode;
    }
    current = current.parent as BaseNode | null;
  }
  return null;
}
