export interface LibraryUpdateResultItem {
  id: string;
  componentKey: string | null;
  focusNodeId?: string | null;
  sourceOwnerOccurrenceIds?: string[];
  localComponentOwner?: {
    id?: string | null;
  } | null;
  libraryFreshness?: {
    reason?: string | null;
    currentComponentId?: string | null;
    latestComponentId?: string | null;
  } | null;
}

export interface LibraryUpdateReconciliation<T> {
  currentItems: T[];
  updateItems: T[];
}

export function reconcileLibraryUpdateResults<
  T extends LibraryUpdateResultItem,
>(
  currentItems: readonly T[],
  existingUpdateItems: readonly T[],
  discoveredSourceUpdates: readonly T[],
): LibraryUpdateReconciliation<T> {
  const updateItems = existingUpdateItems.slice();
  const existingUpdateIds = new Set(updateItems.map((item) => item.id));
  const usedFocusNodeIds = new Set<string>();

  for (const update of discoveredSourceUpdates) {
    if (existingUpdateIds.has(update.id)) continue;
    update.focusNodeId = resolveLibraryUpdateFocusNodeId(
      update,
      currentItems,
      usedFocusNodeIds,
    );
    usedFocusNodeIds.add(update.focusNodeId);
    existingUpdateIds.add(update.id);
    updateItems.push(update);
  }

  const reconciledCurrentItems = excludeLibraryUpdatesFromCurrent(
    currentItems,
    updateItems,
  );
  assertLibraryUpdateCategoriesExclusive(reconciledCurrentItems, updateItems);

  return {
    currentItems: reconciledCurrentItems,
    updateItems,
  };
}

export function resolveLibraryUpdateFocusNodeId<T extends LibraryUpdateResultItem>(
  update: T,
  renderedItems: readonly T[],
  usedFocusNodeIds: ReadonlySet<string> = new Set<string>(),
): string {
  const ownerOccurrenceIds = getOwnerOccurrenceIds(update);
  if (!ownerOccurrenceIds.length || !update.componentKey) {
    return ownerOccurrenceIds[0] || update.id;
  }

  const renderedMatch = renderedItems.find(
    (item) =>
      item.componentKey === update.componentKey &&
      ownerOccurrenceIds.some((ownerOccurrenceId) =>
        isInsideOwnerOccurrence(item.id, ownerOccurrenceId),
      ) &&
      isRenderedSourceNode(item.id, update.id) &&
      !usedFocusNodeIds.has(item.id),
  );
  if (renderedMatch) return renderedMatch.id;

  const componentMatch = renderedItems.find(
    (item) =>
      item.componentKey === update.componentKey &&
      ownerOccurrenceIds.some((ownerOccurrenceId) =>
        isInsideOwnerOccurrence(item.id, ownerOccurrenceId),
      ) &&
      !usedFocusNodeIds.has(item.id),
  );
  return componentMatch?.id ?? ownerOccurrenceIds[0];
}

/**
 * Source dependency findings are discovered after the rendered tree has
 * already classified their instance-sublayers as current. Once an update is
 * confirmed, those provisional current entries must be removed.
 */
export function excludeLibraryUpdatesFromCurrent<
  T extends LibraryUpdateResultItem,
>(currentItems: readonly T[], updateItems: readonly T[]): T[] {
  const overlaps = new Set(
    findLibraryUpdateCurrentOverlaps(currentItems, updateItems).map(
      (item) => item.id,
    ),
  );
  return currentItems.filter((item) => !overlaps.has(item.id));
}

export function findLibraryUpdateCurrentOverlaps<
  T extends LibraryUpdateResultItem,
>(currentItems: readonly T[], updateItems: readonly T[]): T[] {
  const updateIds = new Set(updateItems.map((item) => item.id));
  const sourceUpdates = updateItems.filter(
    (item) => Boolean(item.localComponentOwner) && Boolean(item.componentKey),
  );

  return currentItems.filter(
    (item) =>
      updateIds.has(item.id) ||
      (item.libraryFreshness?.reason === 'instance-sublayer' &&
        sourceUpdates.some(
          (update) =>
            update.componentKey === item.componentKey &&
            getOwnerOccurrenceIds(update).some((ownerOccurrenceId) =>
              isInsideOwnerOccurrence(item.id, ownerOccurrenceId),
            ),
        )),
  );
}

export function assertLibraryUpdateCategoriesExclusive<
  T extends LibraryUpdateResultItem,
>(currentItems: readonly T[], updateItems: readonly T[]): void {
  const overlaps = findLibraryUpdateCurrentOverlaps(currentItems, updateItems);
  if (!overlaps.length) return;
  throw new Error(
    `Apollo update/current invariant failed for node ids: ${overlaps
      .map((item) => item.id)
      .join(', ')}`,
  );
}

function getOwnerOccurrenceIds(item: LibraryUpdateResultItem): string[] {
  return uniqueStrings([
    ...(item.sourceOwnerOccurrenceIds || []),
    ...(item.focusNodeId ? [item.focusNodeId] : []),
  ]);
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function isInsideOwnerOccurrence(nodeId: string, ownerOccurrenceId: string): boolean {
  return (
    nodeId === ownerOccurrenceId ||
    nodeId.startsWith(`${ownerOccurrenceId};`) ||
    nodeId.startsWith(`I${ownerOccurrenceId};`)
  );
}

function isRenderedSourceNode(nodeId: string, sourceNodeId: string): boolean {
  return nodeId === sourceNodeId || nodeId.endsWith(`;${sourceNodeId}`);
}
