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
  const updateIds = new Set(updateItems.map((item) => item.id));
  const sourceUpdates = updateItems.filter(
    (item) => Boolean(item.localComponentOwner) && Boolean(item.componentKey),
  );

  return currentItems.filter((item) => {
    if (updateIds.has(item.id)) return false;
    return !(
      item.libraryFreshness?.reason === 'instance-sublayer' &&
      sourceUpdates.some(
        (update) =>
          update.componentKey === item.componentKey &&
          getOwnerOccurrenceIds(update).some((ownerOccurrenceId) =>
            isInsideOwnerOccurrence(item.id, ownerOccurrenceId),
          ),
      )
    );
  });
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
