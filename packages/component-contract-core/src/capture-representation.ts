import type { ComponentRepresentation } from './types';

export function matchesCaptureRepresentation(rep: ComponentRepresentation, componentKey: string, componentSetKey = ''): boolean {
  if (rep.kind !== 'figma' || rep.status === 'deprecated' || !componentKey) return false;
  const set = rep.locator.componentSetKey;
  // An explicit set binding must not be bypassed by a coincident component key.
  if (typeof set === 'string' && set) return Boolean(componentSetKey && set === componentSetKey);
  const key = rep.locator.componentKey;
  return typeof key === 'string' && Boolean(key) && (key === componentKey || key === componentSetKey);
}

/** Resolve the captured root, not the author's preview selection. This is an
 * identity gate before capture, not a reinterpretation of historical snapshots. */
export function resolveCaptureRepresentation(
  representations: ComponentRepresentation[], componentKey: string, componentSetKey = '',
): ComponentRepresentation {
  const matches = representations.filter(rep => matchesCaptureRepresentation(rep, componentKey, componentSetKey));
  if (matches.length > 1) throw new Error('Ключ экземпляра связан с несколькими Figma-представлениями контракта. Уточните representations; проверка не выполнена.');
  if (!matches.length) throw new Error('Выбранный экземпляр не относится к Figma-представлениям загруженного контракта. Выберите экземпляр этого компонента или загрузите его пакет.');
  if (!matches[0].platform?.trim()) throw new Error('Для найденного Figma-представления не задана платформа. Проверка не выполнена.');
  return matches[0];
}
