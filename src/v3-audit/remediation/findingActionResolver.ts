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
  readActualColorPreview,
  readColorTokenPreview,
  type ColorTokenValueCandidate,
} from '../services/colorTokenValueIndex';
import { createCooperativeYield } from '../utils/promisePool';
import { gradientStopFingerprint, readGradientStopTarget } from '../actions/gradientStopBinding';

const blueTintMigration = require('./blue-tint-migration.json') as {
  styles: Record<string, Array<{ key: string; role?: 'screen' | 'modal' | 'component' }>>;
  tokens: Record<string, { name: string; library: string }>;
};
const surfaceLabels = { screen: 'Фон экрана', modal: 'Модальная поверхность', component: 'Поверхность компонента' };

export interface FindingActionResolverDependencies {
  channelCounterpart?: typeof getChannelCounterpart;
  componentRemediation?: typeof getComponentRemediation;
  styleRemediation?: typeof getStyleRemediation;
  getNodeById(nodeId: string): Promise<BaseNode | null>;
  findExactPaintStyleMatches(
    paints: readonly Paint[] | PluginAPI['mixed'] | undefined,
  ): StyleMetadataEntry[];
  findColorTokenValueCandidates(
    node: SceneNode,
    field: 'fill' | 'stroke',
  ): ColorTokenValueCandidate[];
  findGradientStopTokenCandidates?(color: RGBA, field: 'fill' | 'stroke'): ColorTokenValueCandidate[];
  isActiveColorToken?: (key: string) => boolean;
  readColorTokenPreview?: (node: SceneNode, key: string) => string | null;
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
  readColorTokenPreview,
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
  guard:()=>void=()=>{},
): Promise<void> {
  const visited = new Set<AuditItem>();
  const checkpoint=createCooperativeYield(guard);

  for (const item of checkState.wrongChannelEntries) {
    await checkpoint();
    if (visited.has(item)) continue;
    visited.add(item);
    attachWrongChannelAction(item, selectedChannel, registry, dependencies.channelCounterpart);
  }

  for (const item of checkState.relevanceBuckets.deprecated) {
    await checkpoint();
    attachConfiguredComponentAction(
      item,
      'deprecated-component',
      'Заменить',
      registry, dependencies.componentRemediation,
    );
  }

  for (const item of checkState.relevanceBuckets.update) {
    await checkpoint();
    attachUpdateActions(item, registry, dependencies.componentRemediation);
  }

  for (const entry of checkState.deprecatedStyleEntries) {
    await checkpoint();
    if (entry.gradientStop) {
      await attachGradientStopActions(entry, registry, dependencies, 'deprecatedStyles', guard);
      continue;
    }
    if(entry.token)continue;
    const migration = dependencies.isActiveColorToken && blueTintMigration.styles[entry.styleKey];
    if (migration) {
      await attachBlueTintMigration(entry, migration, registry, dependencies, guard);
      guard();
      continue;
    }
    const remediation = (dependencies.styleRemediation??getStyleRemediation)(entry.styleKey);
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
    await checkpoint();
    if (entry.gradientStop) {
      await attachGradientStopActions(entry, registry, dependencies, 'customStyles', guard);
      continue;
    }
    await attachExactCustomStyleAction(
      entry,
      checkState,
      registry,
      dependencies,
    );
    guard();
  }
}

async function attachGradientStopActions(
  entry: CheckState['customStyleEntries'][number] | CheckState['deprecatedStyleEntries'][number],
  registry: FindingActionRegistry,
  dependencies: FindingActionResolverDependencies,
  scope: 'customStyles' | 'deprecatedStyles',
  guard: () => void,
): Promise<void> {
  const { gradientStop, reason: field } = entry;
  if (!gradientStop || (field !== 'fill' && field !== 'stroke') ||
    !dependencies.findGradientStopTokenCandidates || ('status' in entry && entry.status === 'incomplete')) return;
  const node = await dependencies.getNodeById(entry.id);
  guard();
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') return;
  let target: ReturnType<typeof readGradientStopTarget>;
  try { target = readGradientStopTarget(node, field, gradientStop); }
  catch { return; }
  const previousAlias = 'styleId' in entry ? entry.styleId : entry.resource.id ?? null;
  if (!target || (target.stop.boundVariables?.color?.id ?? null) !== previousAlias) return;

  const candidates = dependencies.findGradientStopTokenCandidates(target.stop.color, field);
  const expectedFingerprint = gradientStopFingerprint(target);
  for (const candidate of candidates) {
    const action = registry.register({
      kind: 'bind-variable',
      nodeId: entry.id,
      expectedStyleId: null,
      targetVariableKey: candidate.key,
      targetName: candidate.name,
      targetLibrary: candidate.library,
      targetColor: dependencies.readColorTokenPreview?.(node, candidate.key) ?? undefined,
      styleField: field,
      expectedFingerprint,
      gradientStop,
    }, scope === 'deprecatedStyles' ? 'Заменить' : 'Привязать', scope, node);
    entry.actions = appendUniqueAction(entry.actions, action);
  }
}

async function attachBlueTintMigration(
  entry: CheckState['deprecatedStyleEntries'][number],
  options: (typeof blueTintMigration.styles)[string],
  registry: FindingActionRegistry,
  dependencies: FindingActionResolverDependencies,
  guard: () => void,
): Promise<void> {
  const available = options.filter(({ key }) => dependencies.isActiveColorToken?.(key));
  if (!available.length) return;
  const node = await dependencies.getNodeById(entry.id);
  guard();
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') return;
  const field = entry.reason;
  const current = node as SceneNode & Partial<Pick<MinimalFillsMixin & MinimalStrokesMixin, 'fills' | 'strokes' | 'fillStyleId' | 'strokeStyleId'>>;
  const paints = field === 'fill' ? current.fills : current.strokes;
  const styleId = field === 'fill' ? current.fillStyleId : current.strokeStyleId;
  if (styleId !== entry.styleId || !Array.isArray(paints) || paints.length !== 1 || paints[0]?.type !== 'SOLID') return;
  const expectedFingerprint = dependencies.getNodePaintFingerprint(current, field);
  if (!expectedFingerprint) return;
  entry.actualColor = readActualColorPreview(current, field) ?? undefined;
  for (const { key, role } of available) {
    const target = blueTintMigration.tokens[key];
    const action = registry.register({
      kind: 'bind-variable',
      nodeId: entry.id,
      expectedStyleId: entry.styleId,
      targetVariableKey: key,
      targetName: target.name,
      targetLibrary: target.library,
      targetGroup: role ? surfaceLabels[role] : undefined,
      targetColor: dependencies.readColorTokenPreview?.(current, key) ?? undefined,
      styleField: field,
      expectedFingerprint,
    }, 'Заменить', 'deprecatedStyles', current);
    entry.actions = appendUniqueAction(entry.actions, action);
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
  const actualColor = readActualColorPreview(sceneNode, entry.reason);
  if (actualColor) entry.actualColor = actualColor;
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
    const targetColor = dependencies.readColorTokenPreview?.(sceneNode, variableCandidate.key) ?? undefined;
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
          targetColor,
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
  indexedCounterpart?: typeof getChannelCounterpart,
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

  const counterpart = (indexedCounterpart??getChannelCounterpart)(
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
        exactTarget: Boolean(indexedCounterpart),
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
  lookup = getComponentRemediation,
): void {
  if (item.nodeType !== 'INSTANCE' || !item.componentKey) {
    return;
  }
  const remediation =
    lookup(item.componentKey) ?? lookup(item.reference?.key);
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
  lookup?: typeof getComponentRemediation,
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
      registry, lookup,
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
