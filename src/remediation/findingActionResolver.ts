import type { CheckState } from '../create-check-state';
import {
  getChannelCounterpart,
} from '../reference/library';
import type { AuditItem, FindingActionSummary } from '../types/audit';
import type { AuditChannel } from '../services/channelAudit';
import {
  findExactPaintStyleMatches,
  findExactTypographyStyleMatches,
  getNodePaintFingerprint,
  getNodeTypographyFingerprint,
  getPaintStyleFingerprint,
  type StyleMetadataEntry,
  type TypographyStyleCandidate,
} from '../services/styleMetadata';
import {
  getComponentRemediation,
  getStyleRemediation,
} from './remediationConfig';
import { FindingActionRegistry } from './findingActionRegistry';
import {
  findColorTokenValueCandidates,
  type ColorTokenValueCandidate,
} from '../services/colorTokenValueIndex';

export interface FindingActionResolverDependencies {
  getNodeById(nodeId: string): Promise<BaseNode | null>;
  findExactPaintStyleMatches(
    paints: readonly Paint[] | PluginAPI['mixed'] | undefined,
  ): StyleMetadataEntry[];
  findColorTokenValueCandidates(
    node: SceneNode,
    field: 'fill' | 'stroke',
  ): ColorTokenValueCandidate[];
  findExactTypographyStyleMatches(
    node: TextNode,
  ): TypographyStyleCandidate[];
  getPaintStyleFingerprint(
    paints: readonly Paint[] | PluginAPI['mixed'] | undefined,
  ): string | null;
  getNodePaintFingerprint(
    node: SceneNode,
    field: 'fill' | 'stroke',
  ): string | null;
  getNodeTypographyFingerprint(node: TextNode): string | null;
}

const defaultDependencies: FindingActionResolverDependencies = {
  getNodeById: (nodeId) => figma.getNodeByIdAsync(nodeId),
  findExactPaintStyleMatches,
  findColorTokenValueCandidates,
  findExactTypographyStyleMatches,
  getNodePaintFingerprint,
  getNodeTypographyFingerprint,
  getPaintStyleFingerprint,
};

export async function attachFindingActions(
  checkState: CheckState,
  selectedChannel: AuditChannel,
  registry: FindingActionRegistry,
  dependencies: FindingActionResolverDependencies = defaultDependencies,
): Promise<void> {
  const visited = new Set<AuditItem>();

  for (const item of checkState.wrongChannelEntries) {
    if (visited.has(item)) continue;
    visited.add(item);
    attachWrongChannelAction(item, selectedChannel, registry);
  }

  for (const item of checkState.relevanceBuckets.deprecated) {
    attachConfiguredComponentAction(
      item,
      'deprecated-component',
      'Заменить',
      registry,
    );
  }

  for (const item of checkState.relevanceBuckets.update) {
    attachUpdateActions(item, registry);
  }

  for (const entry of checkState.deprecatedStyleEntries) {
    const remediation = getStyleRemediation(entry.styleKey);
    if (!remediation) continue;
    const styleField = remediation.styleType ?? entry.reason;
    entry.actions = appendUniqueAction(
      entry.actions,
      registry.register(
        {
          kind: 'bind-style',
          nodeId: entry.id,
          expectedStyleId: entry.styleId,
          targetStyleKey: remediation.replacementStyleKey,
          targetName:
            remediation.replacementName ?? remediation.replacementStyleKey,
          targetLibrary: remediation.replacementLibrary ?? null,
          styleField,
          reason: 'deprecated-style',
        },
        'Заменить',
        'deprecatedStyles',
      ),
    );
  }

  for (const entry of checkState.customStyleEntries) {
    await attachExactCustomStyleAction(
      entry,
      checkState,
      registry,
      dependencies,
    );
  }
}

async function attachExactCustomStyleAction(
  entry: CheckState['customStyleEntries'][number],
  checkState: CheckState,
  registry: FindingActionRegistry,
  dependencies: FindingActionResolverDependencies,
): Promise<void> {
  if (entry.reason === 'typography') {
    await attachTypographyStyleActions(entry, registry, dependencies);
    return;
  }
  if (entry.reason !== 'fill' && entry.reason !== 'stroke') {
    return;
  }
  if (entry.resource.type === 'token') {
    return;
  }
  const node = await dependencies.getNodeById(entry.id);
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
    return;
  }
  const sceneNode = node as SceneNode;
  const paints =
    entry.reason === 'fill'
      ? (sceneNode as any).fills
      : (sceneNode as any).strokes;
  const expectedFingerprint = dependencies.getNodePaintFingerprint(
    sceneNode,
    entry.reason,
  );
  if (!expectedFingerprint) {
    return;
  }
  const matches = dependencies.findExactPaintStyleMatches(paints);
  const styleProperty =
    entry.reason === 'fill' ? 'fillStyleId' : 'strokeStyleId';
  const currentStyleId = (sceneNode as any)[styleProperty];
  const expectedStyleId =
    typeof currentStyleId === 'string' && currentStyleId
      ? currentStyleId
      : null;

  const referenceVariableCandidate = findReferenceVariableCandidate(
    checkState,
    entry,
  );
  const valueCandidates = dependencies.findColorTokenValueCandidates(
    sceneNode,
    entry.reason,
  );
  const variableCandidates = mergeVariableCandidates(
    referenceVariableCandidate,
    valueCandidates,
  );
  for (const variableCandidate of variableCandidates) {
    entry.actions = appendUniqueAction(
      entry.actions,
      registry.register(
        {
          kind: 'bind-variable',
          nodeId: entry.id,
          expectedStyleId,
          targetVariableKey: variableCandidate.key,
          targetName: variableCandidate.name,
          targetLibrary: variableCandidate.library,
          styleField: entry.reason,
          expectedFingerprint,
        },
        'Привязать',
        'customStyles',
        sceneNode,
      ),
    );
  }

  // Paint styles remain a compatibility fallback for catalogs that have not
  // yet been republished with actual token values.
  for (const match of variableCandidates.length ? [] : matches) {
    entry.actions = appendUniqueAction(
      entry.actions,
      registry.register(
        {
          kind: 'bind-style',
          nodeId: entry.id,
          expectedStyleId,
          targetStyleKey: match.key,
          targetName: match.label,
          targetLibrary: match.library ?? null,
          styleField: entry.reason,
          reason: 'exact-style-match',
          expectedFingerprint,
        },
        'Привязать',
        'customStyles',
        sceneNode,
      ),
    );
  }
}

async function attachTypographyStyleActions(
  entry: CheckState['customStyleEntries'][number],
  registry: FindingActionRegistry,
  dependencies: FindingActionResolverDependencies,
): Promise<void> {
  const node = await dependencies.getNodeById(entry.id);
  if (!node || node.type !== 'TEXT') return;
  const textNode = node as TextNode;
  const expectedFingerprint =
    dependencies.getNodeTypographyFingerprint(textNode);
  if (!expectedFingerprint) return;
  const currentStyleId =
    typeof textNode.textStyleId === 'string' && textNode.textStyleId
      ? textNode.textStyleId
      : null;
  const candidates = dependencies.findExactTypographyStyleMatches(textNode);
  for (const candidate of candidates) {
    entry.actions = appendUniqueAction(
      entry.actions,
      registry.register(
        {
          kind: 'bind-style',
          nodeId: entry.id,
          expectedStyleId: currentStyleId,
          targetStyleKey: candidate.key,
          targetName: candidate.label,
          targetLibrary: candidate.library ?? null,
          styleField: 'text',
          reason: 'exact-typography-match',
          expectedFingerprint,
        },
        'Привязать',
        'customStyles',
        textNode,
      ),
    );
  }
}

function mergeVariableCandidates(
  referenceCandidate: {
    key: string;
    name: string;
    library: string | null;
  } | null,
  valueCandidates: ColorTokenValueCandidate[],
): Array<{ key: string; name: string; library: string | null }> {
  const result = new Map<
    string,
    { key: string; name: string; library: string | null }
  >();
  if (referenceCandidate) {
    result.set(referenceCandidate.key, referenceCandidate);
  }
  for (const candidate of valueCandidates) {
    if (result.has(candidate.key)) continue;
    result.set(candidate.key, {
      key: candidate.key,
      name: candidate.name,
      library: candidate.collectionName ?? candidate.library,
    });
  }
  return Array.from(result.values());
}

function findReferenceVariableCandidate(
  checkState: CheckState,
  entry: CheckState['customStyleEntries'][number],
): { key: string; name: string; library: string | null } | null {
  const candidates = new Map<
    string,
    { key: string; name: string; library: string | null }
  >();
  for (const items of Object.values(checkState.relevanceBuckets)) {
    for (const item of items) {
      for (const diff of item.diffs ?? []) {
        const details = diff.details;
        if (
          diff.nodeId !== entry.id ||
          diff.diffKind !== 'paint' ||
          details?.property !== entry.reason ||
          details.bindingStatus !== 'unbound' ||
          details.actual.binding ||
          !details.reference.binding?.key
        ) {
          continue;
        }
        const binding = details.reference.binding;
        const bindingKey = binding.key;
        if (!bindingKey) continue;
        candidates.set(bindingKey, {
          key: bindingKey,
          name:
            binding.name ??
            details.reference.displayName ??
            bindingKey,
          library: binding.collectionName ?? null,
        });
      }
    }
  }
  return candidates.size === 1 ? Array.from(candidates.values())[0] : null;
}

function attachWrongChannelAction(
  item: AuditItem,
  selectedChannel: AuditChannel,
  registry: FindingActionRegistry,
): void {
  if (item.nodeType !== 'INSTANCE' || !item.componentKey) {
    return;
  }
  const targetPlatform =
    selectedChannel === 'Desktop'
      ? 'Desktop'
      : selectedChannel === 'MobileWeb'
        ? 'Mobile Web'
        : null;
  if (!targetPlatform) {
    return;
  }

  const counterpart = getChannelCounterpart(
    item.componentKey,
    targetPlatform,
  );
  if (!counterpart) {
    return;
  }

  item.actions = appendUniqueAction(
    item.actions,
    registry.register(
      {
        kind: 'swap-component',
        nodeId: item.id,
        expectedComponentKey: item.componentKey,
        targetComponentKey: counterpart.componentKey,
        targetName: counterpart.componentName,
        targetLibrary: counterpart.library ?? item.librarySource ?? null,
        reason: 'wrong-channel',
      },
      'Заменить',
      'wrongChannel',
    ),
  );
}

function attachConfiguredComponentAction(
  item: AuditItem,
  reason: 'deprecated-component' | 'catalog-lifecycle',
  label: string,
  registry: FindingActionRegistry,
): void {
  if (item.nodeType !== 'INSTANCE' || !item.componentKey) {
    return;
  }
  const remediation =
    getComponentRemediation(item.componentKey) ??
    getComponentRemediation(item.reference?.key);
  if (!remediation) {
    return;
  }

  item.actions = appendUniqueAction(
    item.actions,
    registry.register(
      {
        kind: 'swap-component',
        nodeId: item.id,
        expectedComponentKey: item.componentKey,
        targetComponentKey: remediation.replacementComponentKey,
        targetName:
          remediation.replacementName ?? remediation.replacementComponentKey,
        targetLibrary: remediation.replacementLibrary ?? null,
        reason,
      },
      label,
      reason === 'deprecated-component' ? 'deprecated' : 'update',
    ),
  );
}

function attachUpdateActions(
  item: AuditItem,
  registry: FindingActionRegistry,
): void {
  if (item.nodeType !== 'INSTANCE' || !item.componentKey) {
    return;
  }

  if (
    item.updateReasons?.includes('library-update-available') &&
    item.libraryFreshness?.status === 'update-available'
  ) {
    item.actions = appendUniqueAction(
      item.actions,
      registry.register(
        {
          kind: 'apply-library-update',
          nodeId: item.id,
          expectedComponentKey: item.componentKey,
          targetComponentKey: item.componentKey,
          targetName: item.reference?.displayName ?? item.name,
          targetLibrary: item.librarySource ?? null,
          reason: 'library-update-available',
        },
        'Обновить',
        'update',
      ),
    );
  }

  if (item.updateReasons?.includes('catalog-lifecycle')) {
    attachConfiguredComponentAction(
      item,
      'catalog-lifecycle',
      'Заменить',
      registry,
    );
  }
}

function appendUniqueAction(
  actions: FindingActionSummary[] | undefined,
  action: FindingActionSummary,
): FindingActionSummary[] {
  const result = actions ? actions.slice() : [];
  const duplicate = result.some(
    (candidate) =>
      candidate.kind === action.kind &&
      candidate.scope === action.scope &&
      candidate.targetName === action.targetName &&
      candidate.targetLibrary === action.targetLibrary &&
      candidate.label === action.label,
  );
  if (!duplicate) {
    result.push(action);
  }
  return result;
}
